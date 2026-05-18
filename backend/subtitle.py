"""
Word-level timestamp'lerden Premiere-uyumlu SRT üretir.

Strateji:
- Word'leri akıllı şekilde grupla (max kelime, max süre, doğal duraklamalar).
- Her satırın start = ilk kelimenin başlangıcı, end = son kelimenin bitişi.
- Bu, segment-level timestamp'in aksine ses ile birebir senkron kalır.
"""
from pathlib import Path
from typing import List, Dict, Optional
from config import MAX_WORDS_PER_LINE, MAX_CHARS_PER_LINE, MIN_LINE_DURATION


def _format_ts(seconds: float) -> str:
    if seconds < 0:
        seconds = 0
    ms = int(round(seconds * 1000))
    hh = ms // 3_600_000
    mm = (ms % 3_600_000) // 60_000
    ss = (ms % 60_000) // 1000
    mmm = ms % 1000
    return f"{hh:02d}:{mm:02d}:{ss:02d},{mmm:03d}"


def _word_iter(segments: List[Dict]):
    """Tüm segmentlerden kelime kelime gez. Eksik timestamp'lı kelimeler atlanır."""
    for seg in segments:
        for w in seg.get("words", []) or []:
            start = w.get("start")
            end = w.get("end")
            text = (w.get("word") or "").strip()
            if start is None or end is None or not text:
                continue
            yield {"text": text, "start": float(start), "end": float(end)}


def _group_words(
    segments: List[Dict],
    max_words: int = MAX_WORDS_PER_LINE,
    max_chars: int = MAX_CHARS_PER_LINE,
    max_dur: Optional[float] = None,
    min_dur: float = MIN_LINE_DURATION,
) -> List[Dict]:
    # max_dur'i max_words ile orantili yap: 2 kelime ~2sn, 4 kelime ~4.3sn, 7 kelime ~6.4sn
    if max_dur is None:
        max_dur = max(1.5, 1.5 + max_words * 0.7)
    """Kelimeleri altyazı satırlarına grupla."""
    lines: List[Dict] = []
    current: List[Dict] = []

    def flush():
        if not current:
            return
        start = current[0]["start"]
        end = current[-1]["end"]
        if end - start < min_dur:
            end = start + min_dur
        text = " ".join(w["text"] for w in current).strip()
        lines.append({"start": start, "end": end, "text": text})
        current.clear()

    # Tolerans: karakter siniri biraz asilabilir (1 kelime daha sigarsa)
    # 20 char hedef + 5 tolerans = 25'e kadar OK ama 26+ ise flush.
    char_tolerance = max(4, int(max_chars * 0.20))

    prev_end: Optional[float] = None
    for w in _word_iter(segments):
        if current:
            gap = w["start"] - prev_end if prev_end is not None else 0
            cur_dur = w["end"] - current[0]["start"]
            ends_sentence = current[-1]["text"].endswith((".", "!", "?"))
            cur_text = " ".join(x["text"] for x in current)
            cur_chars = len(cur_text)
            would_be_chars = cur_chars + 1 + len(w["text"])

            # Akilli karakter karari:
            # - Mevcut grup zaten max_chars'i geciyorsa flush
            # - Veya yeni kelime ile tolerans sinirini asacaksa flush
            char_exceeded = (cur_chars >= max_chars) or (would_be_chars > max_chars + char_tolerance)

            if (
                len(current) >= max_words
                or cur_dur >= max_dur
                or gap > 0.7
                or ends_sentence
                or char_exceeded
            ):
                flush()
        current.append(w)
        prev_end = w["end"]
    flush()

    return _fix_overlaps(lines)


def _fix_overlaps(lines: List[Dict]) -> List[Dict]:
    """Komşu satırların çakışmasını engelle (Premiere'de hata vermesin)."""
    for i in range(len(lines) - 1):
        if lines[i]["end"] > lines[i + 1]["start"]:
            lines[i]["end"] = max(lines[i]["start"], lines[i + 1]["start"] - 0.001)
    return lines


def _split_segment_by_chars(seg: Dict, max_chars: int) -> List[Dict]:
    """Word-level timing yoksa segmenti karakter bazli bol, timing'i
    kelime sayisina gore orantili dagit."""
    text = (seg.get("text") or "").strip()
    start = seg.get("start")
    end = seg.get("end")
    if not text or start is None or end is None:
        return []
    start = float(start)
    end = float(end)
    if end <= start:
        end = start + 0.5
    if len(text) <= max_chars:
        return [{"start": start, "end": end, "text": text}]
    words = text.split()
    if not words:
        return [{"start": start, "end": end, "text": text}]

    # Kelimeleri max_chars'a gore grupla (whitespace dahil)
    groups: List[List[str]] = []
    cur: List[str] = []
    cur_chars = 0
    for w in words:
        w_chars = len(w)
        # boslukla cat edilince kac karakter olur
        prospective = cur_chars + (1 if cur else 0) + w_chars
        if cur and prospective > max_chars:
            groups.append(cur)
            cur = [w]
            cur_chars = w_chars
        else:
            cur.append(w)
            cur_chars = prospective
    if cur:
        groups.append(cur)

    # Timing'i kelime sayisi orantili dagit
    total_words = sum(len(g) for g in groups)
    if total_words == 0:
        return [{"start": start, "end": end, "text": text}]
    duration = end - start
    out: List[Dict] = []
    word_offset = 0
    for grp in groups:
        grp_words = len(grp)
        g_start = start + (word_offset / total_words) * duration
        word_offset += grp_words
        g_end = start + (word_offset / total_words) * duration
        out.append({
            "start": g_start,
            "end": max(g_end, g_start + MIN_LINE_DURATION),
            "text": " ".join(grp),
        })
    return out


def _fallback_from_segments(segments: List[Dict], max_chars: int = MAX_CHARS_PER_LINE) -> List[Dict]:
    """Word-level yoksa segment-level fallback. max_chars'a gore boler."""
    lines = []
    for seg in segments:
        for sub in _split_segment_by_chars(seg, max_chars):
            lines.append(sub)
    return _fix_overlaps(lines)


def build_srt(
    segments: List[Dict],
    max_words: Optional[int] = None,
    max_chars: Optional[int] = None,
) -> str:
    mw = max_words if max_words and max_words > 0 else MAX_WORDS_PER_LINE
    mc = max_chars if max_chars and max_chars > 0 else MAX_CHARS_PER_LINE
    has_words = any(seg.get("words") for seg in segments)
    lines = (
        _group_words(segments, max_words=mw, max_chars=mc)
        if has_words else _fallback_from_segments(segments, max_chars=mc)
    )

    out = []
    for idx, line in enumerate(lines, start=1):
        out.append(str(idx))
        out.append(f"{_format_ts(line['start'])} --> {_format_ts(line['end'])}")
        out.append(line["text"])
        out.append("")
    return "\n".join(out)


def write_srt(
    segments: List[Dict],
    output_path: Path,
    max_words: Optional[int] = None,
    max_chars: Optional[int] = None,
) -> Path:
    content = build_srt(segments, max_words=max_words, max_chars=max_chars)
    output_path.write_text(content, encoding="utf-8")
    return output_path


def build_txt(segments: List[Dict]) -> str:
    """Düz metin dökümü."""
    return "\n".join(
        (seg.get("text") or "").strip() for seg in segments if (seg.get("text") or "").strip()
    )


def write_txt(segments: List[Dict], output_path: Path) -> Path:
    output_path.write_text(build_txt(segments), encoding="utf-8")
    return output_path


def build_word_json(
    segments: List[Dict],
    max_words: Optional[int] = None,
    max_chars: Optional[int] = None,
) -> str:
    """SRT ile aynı gruplama mantığını word-level timing ile birlikte JSON olarak yazar.
    Her caption'ın içinde gerçek word.start ve word.end zamanları var.
    Karaoke animasyonu için kritik."""
    import json as _json
    mw = max_words if max_words and max_words > 0 else MAX_WORDS_PER_LINE
    mc = max_chars if max_chars and max_chars > 0 else MAX_CHARS_PER_LINE
    has_words = any(seg.get("words") for seg in segments)

    if not has_words:
        # Fallback: segment-level
        captions = []
        for seg in segments:
            start = float(seg.get("start") or 0)
            end = float(seg.get("end") or start)
            text = (seg.get("text") or "").strip()
            if not text:
                continue
            wt = text.split()
            per = (end - start) / max(len(wt), 1)
            words = []
            for i, w in enumerate(wt):
                words.append({
                    "text": w,
                    "start": start + i * per,
                    "end": start + (i + 1) * per,
                })
            captions.append({
                "text": text, "start": start, "end": end, "words": words,
            })
        return _json.dumps({"captions": captions}, ensure_ascii=False)

    # Word-level group yap (SRT ile aynı algoritma)
    lines = _group_words(segments, max_words=mw, max_chars=mc)

    # Her grup için word'leri segmentlerden topla (gerçek timing)
    all_words = []
    for seg in segments:
        for w in seg.get("words", []) or []:
            s = w.get("start"); e = w.get("end")
            t = (w.get("word") or "").strip()
            if s is None or e is None or not t:
                continue
            all_words.append({"text": t, "start": float(s), "end": float(e)})

    # Her line'a hangi word'lerin düştüğünü zaman aralığına göre eşle
    captions = []
    wi = 0
    for line in lines:
        line_words = []
        # Bu line'ın start-end aralığına denk gelen word'leri al
        while wi < len(all_words) and all_words[wi]["start"] < line["end"] + 0.001:
            w = all_words[wi]
            if w["end"] >= line["start"] - 0.001:
                line_words.append({
                    "text": w["text"],
                    "start": w["start"],
                    "end": w["end"],
                })
            wi += 1
            if line_words and wi < len(all_words) and all_words[wi]["start"] > line["end"]:
                break
        if not line_words:
            continue
        captions.append({
            "text": line["text"],
            "start": line["start"],
            "end": line["end"],
            "words": line_words,
        })

    return _json.dumps({"captions": captions}, ensure_ascii=False)


def write_word_json(
    segments: List[Dict],
    output_path: Path,
    max_words: Optional[int] = None,
    max_chars: Optional[int] = None,
) -> Path:
    content = build_word_json(segments, max_words=max_words, max_chars=max_chars)
    output_path.write_text(content, encoding="utf-8")
    return output_path
