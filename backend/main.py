"""
FreeCaption - Yerel altyazı üretim sunucusu.

Tek tuşla başlar, browser'da açılır. Dosya boyutu / kullanım limiti YOK.
"""
import os
import sys

# Windows DLL search path patch: NSSM servis context'inde site-packages altindaki
# native DLL klasorleri (ctranslate2.libs, intel_openmp\bin, torch\lib) otomatik
# bulunmuyor -> WinError 127. Explicit add_dll_directory ile cozeriz.
if sys.platform == "win32" and hasattr(os, "add_dll_directory"):
    _venv_root = os.path.dirname(os.path.dirname(sys.executable))
    for _p in [
        os.path.join(_venv_root, "Lib", "site-packages", "ctranslate2.libs"),
        os.path.join(_venv_root, "Lib", "site-packages", "intel_openmp", "bin"),
        os.path.join(_venv_root, "Lib", "site-packages", "torch", "lib"),
        os.path.join(_venv_root, "Lib", "site-packages", "nvidia", "cudnn", "bin"),
        os.path.join(_venv_root, "Lib", "site-packages", "nvidia", "cublas", "bin"),
    ]:
        if os.path.isdir(_p):
            try:
                os.add_dll_directory(_p)
            except Exception as _e:
                print(f"[FreeCaption] DLL dir eklenemedi: {_p} -> {_e}", flush=True)

import asyncio
import functools
import time
import uuid
import webbrowser

# Stdout/stderr line-buffered olsun (silent modda log dosyasi gercek-zamanli akar)
try:
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)
except Exception:
    pass

# Tum print'ler otomatik flush
print = functools.partial(print, flush=True)  # type: ignore
from contextlib import asynccontextmanager
from pathlib import Path
from threading import Thread
from typing import Dict, Optional

import aiofiles
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import json

from config import OUTPUT_DIR, TEMP_DIR, HOST, PORT, API_KEY, MAX_UPLOAD_MB
from audio import extract_audio, is_audio_file, is_video_file, get_media_duration
from transcribe import get_transcriber
from subtitle import write_srt, write_txt, write_word_json

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


class Job:
    def __init__(self, job_id: str, filename: str, language: Optional[str]):
        self.id = job_id
        self.filename = filename
        self.language = language
        self.status = "queued"
        self.stage = "Beklemede"
        self.progress = 0.0
        self.error: Optional[str] = None
        self.srt_path: Optional[Path] = None
        self.txt_path: Optional[Path] = None
        self.duration: Optional[float] = None
        self.detected_language: Optional[str] = None
        self.elapsed: float = 0.0
        self.clip_start: Optional[float] = None
        self.clip_end: Optional[float] = None
        self.max_words_per_line: Optional[int] = None
        self.max_chars_per_line: Optional[int] = None
        self.output_dir: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "filename": self.filename,
            "language": self.language,
            "status": self.status,
            "stage": self.stage,
            "progress": round(self.progress, 3),
            "error": self.error,
            "duration": self.duration,
            "detected_language": self.detected_language,
            "elapsed": round(self.elapsed, 1),
            "srt_url": f"/download/{self.id}/srt" if self.srt_path else None,
            "txt_url": f"/download/{self.id}/txt" if self.txt_path else None,
            "srt_path_abs": str(self.srt_path) if self.srt_path else None,
            "clip_start": self.clip_start,
            "clip_end": self.clip_end,
        }


class ClipRequest(BaseModel):
    media_path: str
    in_point: float = 0.0
    out_point: float = 0.0
    sequence_offset: float = 0.0
    language: Optional[str] = None
    max_words_per_line: Optional[int] = None
    max_chars_per_line: Optional[int] = None
    output_dir: Optional[str] = None        # custom klasor (None=default OUTPUT_DIR)
    placement_time: Optional[float] = None  # SRT timeline yerlesim saniye (None=0)


jobs: Dict[str, Job] = {}
job_queue: "asyncio.Queue[str]" = asyncio.Queue()
job_files: Dict[str, Path] = {}


async def worker():
    """Tek seferde bir iş çalıştırır (GPU/CPU çakışmasını önler)."""
    import traceback
    transcriber = get_transcriber()
    log_path = OUTPUT_DIR / "error.log"
    while True:
        job_id = await job_queue.get()
        job = jobs.get(job_id)
        media_path = job_files.get(job_id)
        if not job or not media_path:
            job_queue.task_done()
            continue
        try:
            print(f"\n[JOB START] id={job_id} file={media_path}")
            await asyncio.to_thread(run_job, job, media_path, transcriber)
            print(f"[JOB DONE]  id={job_id} elapsed={job.elapsed:.1f}s")
        except Exception as e:
            tb = traceback.format_exc()
            msg = f"\n=== JOB ERROR {job_id} ===\nfile: {media_path}\n{tb}\n"
            print(msg)
            try:
                with open(log_path, "a", encoding="utf-8") as f:
                    import datetime
                    f.write(f"\n\n[{datetime.datetime.now().isoformat()}] {msg}")
            except Exception:
                pass
            job.status = "error"
            job.error = f"{type(e).__name__}: {e}"
            job.stage = "Hata"
        finally:
            job_queue.task_done()


def run_job(job: Job, media_path: Path, transcriber):
    t0 = time.time()
    job.status = "running"
    job.stage = "Ses çıkarılıyor"
    job.progress = 0.02

    job.duration = get_media_duration(media_path)

    use_segment = (
        job.clip_start is not None and job.clip_end is not None
        and job.clip_end > job.clip_start
    )

    if use_segment or is_video_file(media_path):
        wav_path = TEMP_DIR / f"{job.id}.wav"
        extract_audio(
            media_path, wav_path,
            start=job.clip_start if use_segment else None,
            end=job.clip_end if use_segment else None,
        )
        audio_path = wav_path
    elif is_audio_file(media_path):
        audio_path = media_path
    else:
        wav_path = TEMP_DIR / f"{job.id}.wav"
        extract_audio(media_path, wav_path)
        audio_path = wav_path

    def progress(stage: str, pct: float):
        job.stage = stage
        job.progress = max(job.progress, pct)

    result = transcriber.transcribe(
        audio_path, language=job.language, progress=progress,
    )
    job.detected_language = result["language"]

    job.stage = "Altyazı dosyaları yazılıyor"
    job.progress = 0.95

    base_name = Path(job.filename).stem
    # Cache-busting: timestamp + karakter preset adi
    import datetime as _dt
    stamp = _dt.datetime.now().strftime("%H%M%S")
    char_tag = f"{job.max_chars_per_line}c" if job.max_chars_per_line else "auto"

    # Output dir secimi: custom > default
    out_dir = OUTPUT_DIR
    if job.output_dir:
        try:
            cand = Path(job.output_dir)
            cand.mkdir(parents=True, exist_ok=True)
            if cand.is_dir():
                out_dir = cand
                print(f"[CLIP] custom output_dir: {out_dir}")
        except Exception as e:
            print(f"[CLIP] output_dir kullanilamadi ({e}), default'a dusuyor: {OUTPUT_DIR}")

    srt_path = out_dir / f"{base_name}_{char_tag}_{stamp}.srt"
    txt_path = out_dir / f"{base_name}_{char_tag}_{stamp}.txt"
    json_path = out_dir / f"{base_name}_{char_tag}_{stamp}.json"
    write_srt(
        result["segments"], srt_path,
        max_words=job.max_words_per_line,
        max_chars=job.max_chars_per_line,
    )
    write_txt(result["segments"], txt_path)
    # Word-level JSON (Tab 2 karaoke senkron icin kritik)
    write_word_json(
        result["segments"], json_path,
        max_words=job.max_words_per_line,
        max_chars=job.max_chars_per_line,
    )

    job.srt_path = srt_path
    job.txt_path = txt_path
    job.stage = "Hazır"
    job.progress = 1.0
    job.status = "done"
    job.elapsed = time.time() - t0

    if is_video_file(media_path):
        try:
            (TEMP_DIR / f"{job.id}.wav").unlink(missing_ok=True)
        except Exception:
            pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(worker())
    yield
    task.cancel()


app = FastAPI(title="FreeCaption", lifespan=lifespan)

# UXP paneli localhost:7860'a istek atar. Adobe UXP HTTP istekleri için
# CORS preflight göndermez ama emniyet için açık bırakıyoruz.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*", "X-API-Key"],
)


# --- Auth middleware ---
# API_KEY config'ten geliyor. Bos string ise auth devre disi (lokal mod).
# Doluysa /api/* istekleri X-API-Key header'i ile gelmeli.
_PUBLIC_PATHS = {"/api/health"}  # health her zaman acik (uptime check)


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    if not API_KEY:
        # Auth devre disi (lokal mod)
        return await call_next(request)
    # CORS preflight (OPTIONS) auth'tan muaf — yoksa browser fetch reject eder
    if request.method == "OPTIONS":
        return await call_next(request)
    path = request.url.path
    # Sadece /api/* korumali; static frontend her durumda acik
    if not path.startswith("/api/") or path in _PUBLIC_PATHS:
        return await call_next(request)
    provided = request.headers.get("X-API-Key", "")
    if provided != API_KEY:
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"ok": False, "error": "API key gecersiz veya eksik (X-API-Key header)"},
        )
    return await call_next(request)


# --- Upload boyut limiti (request body) ---
@app.middleware("http")
async def upload_size_middleware(request: Request, call_next):
    # Sadece upload endpoint'ine uygula
    if request.url.path == "/api/upload" and request.method == "POST":
        cl = request.headers.get("content-length")
        if cl and int(cl) > MAX_UPLOAD_MB * 1024 * 1024:
            return JSONResponse(
                status_code=413,
                content={"ok": False, "error": f"Dosya cok buyuk (max {MAX_UPLOAD_MB} MB)"},
            )
    return await call_next(request)


@app.get("/api/health")
async def health():
    import torch
    return {
        "ok": True,
        "gpu": torch.cuda.is_available(),
        "gpu_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        "queue_size": job_queue.qsize(),
    }


@app.post("/api/unload")
async def unload_models():
    """Whisper modellerini VRAM/RAM'den bosalt. Bir sonraki transkripsiyonda yeniden yuklenir."""
    import torch
    try:
        # transcribe.py icindeki global transcriber'i bosalt
        from transcribe import _transcriber
        if _transcriber is not None:
            _transcriber.unload()
        # GPU cache temizle
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.synchronize()
        # GC
        import gc
        gc.collect()
        return {"ok": True, "msg": "Whisper modelleri bosaltildi. RAM serbest birakildi."}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.post("/api/shutdown")
async def shutdown():
    """Sunucuyu kapat. signal.SIGINT ile uvicorn'a temiz cikis."""
    import signal as _signal
    import os as _os
    import threading
    def _delayed_kill():
        import time as _t
        _t.sleep(0.5)
        try:
            _os.kill(_os.getpid(), _signal.SIGINT)
        except Exception:
            _os._exit(0)
    threading.Thread(target=_delayed_kill, daemon=True).start()
    return {"ok": True, "msg": "Sunucu kapatiliyor..."}


@app.post("/api/upload")
async def upload(
    file: UploadFile = File(...),
    language: Optional[str] = Form(None),
    max_chars_per_line: Optional[int] = Form(None),
    max_words_per_line: Optional[int] = Form(None),
):
    job_id = uuid.uuid4().hex[:12]
    safe_name = Path(file.filename or f"upload_{job_id}").name
    dest = TEMP_DIR / f"{job_id}_{safe_name}"

    async with aiofiles.open(dest, "wb") as f:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            await f.write(chunk)

    if language in ("auto", "", None):
        language = None

    job = Job(job_id=job_id, filename=safe_name, language=language)
    if max_chars_per_line and max_chars_per_line > 0:
        job.max_chars_per_line = int(max_chars_per_line)
    if max_words_per_line and max_words_per_line > 0:
        job.max_words_per_line = int(max_words_per_line)
    jobs[job_id] = job
    job_files[job_id] = dest
    await job_queue.put(job_id)
    return job.to_dict()


@app.post("/api/clip")
async def submit_clip(req: ClipRequest):
    """UXP panelinden çağrılır. Lokal medya yolundan in/out aralığını transkribe eder."""
    print(f"\n[CLIP REQ] path={req.media_path!r}")
    print(f"           in={req.in_point} out={req.out_point} lang={req.language}")
    print(f"           max_words={req.max_words_per_line} max_chars={req.max_chars_per_line}")
    media_path = Path(req.media_path)
    print(f"           exists={media_path.exists()} is_file={media_path.is_file() if media_path.exists() else 'N/A'}")
    if not media_path.exists():
        raise HTTPException(404, f"Medya bulunamadı: {req.media_path}")
    if not media_path.is_file():
        raise HTTPException(400, "Dosya değil")

    job_id = uuid.uuid4().hex[:12]
    language = req.language if req.language not in ("auto", "", None) else None
    job = Job(job_id=job_id, filename=media_path.name, language=language)
    if req.out_point > req.in_point > 0 or (req.out_point > 0 and req.in_point >= 0):
        job.clip_start = float(req.in_point)
        job.clip_end = float(req.out_point)
    if req.max_words_per_line and req.max_words_per_line > 0:
        job.max_words_per_line = int(req.max_words_per_line)
    if req.max_chars_per_line and req.max_chars_per_line > 0:
        job.max_chars_per_line = int(req.max_chars_per_line)
    if req.output_dir:
        job.output_dir = req.output_dir
    jobs[job_id] = job
    job_files[job_id] = media_path
    await job_queue.put(job_id)
    return job.to_dict()


@app.get("/api/job/{job_id}")
async def job_status(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "İş bulunamadı")
    return job.to_dict()


@app.get("/api/jobs")
async def list_jobs():
    return [j.to_dict() for j in list(jobs.values())[-30:]]


@app.get("/api/stream/{job_id}")
async def stream_progress(job_id: str):
    """Server-Sent Events ile ilerleme yayını."""
    async def gen():
        last_payload = None
        while True:
            job = jobs.get(job_id)
            if not job:
                yield f"data: {json.dumps({'error': 'not_found'})}\n\n"
                return
            payload = job.to_dict()
            if payload != last_payload:
                yield f"data: {json.dumps(payload)}\n\n"
                last_payload = payload
            if job.status in ("done", "error"):
                return
            await asyncio.sleep(0.4)
    return StreamingResponse(gen(), media_type="text/event-stream")


@app.get("/download/{job_id}/{kind}")
async def download(job_id: str, kind: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "İş bulunamadı")
    if kind == "srt" and job.srt_path:
        return FileResponse(job.srt_path, filename=job.srt_path.name, media_type="application/x-subrip")
    if kind == "txt" and job.txt_path:
        return FileResponse(job.txt_path, filename=job.txt_path.name, media_type="text/plain")
    raise HTTPException(404, "Dosya yok")


@app.get("/api/open-output")
async def open_output_folder():
    """Çıktı klasörünü Windows Explorer'da açar."""
    import os, platform, subprocess
    try:
        if platform.system() == "Windows":
            os.startfile(str(OUTPUT_DIR))
        elif platform.system() == "Darwin":
            subprocess.run(["open", str(OUTPUT_DIR)])
        else:
            subprocess.run(["xdg-open", str(OUTPUT_DIR)])
        return {"ok": True, "path": str(OUTPUT_DIR)}
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


# Frontend opsiyonel — yoksa API-only modunda calismaya devam et (VDS deploy senaryosu)
if FRONTEND_DIR.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
else:
    print(f"[FreeCaption] Frontend klasoru yok ({FRONTEND_DIR}) - API-only mod")
    @app.get("/")
    async def root_info():
        return {"ok": True, "msg": "FreeCaption API", "frontend": False, "health": "/api/health"}


def _open_browser_delayed(url: str, delay: float = 1.5):
    def _open():
        time.sleep(delay)
        try:
            webbrowser.open(url)
        except Exception:
            pass
    Thread(target=_open, daemon=True).start()


if __name__ == "__main__":
    import os
    import uvicorn
    url = f"http://{HOST}:{PORT}"
    silent = (
        os.environ.get("FREECAPTION_SILENT") == "1"
        or os.environ.get("ALTYAZIAI_SILENT") == "1"
    )
    if not silent:
        print(f"\n  FreeCaption calisiyor  ->  {url}")
        print(f"  Premiere'de Window > Extensions > FreeCaption acin.")
        print(f"  Browser otomatik acilmiyor (kullanici tercihi).\n")
    # _open_browser_delayed DEVRE DISI - kullanici istemiyor, CEP eklentisi var.
    uvicorn.run(app, host=HOST, port=PORT, log_level="warning")
