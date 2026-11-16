"""
Dolgu kelimeleri ve sessizlikleri temizleyip Premiere Pro uyumlu FCP XML üreten modül.
"""
from pathlib import Path
from typing import List, Dict, Tuple, Optional
import xml.sax.saxutils

# Türkçe ve İngilizce yaygın dolgu kelimeleri
FILLER_WORDS = {
    "ıııı", "eee", "ıı", "ııı", "ee", "ımm", "ıh", "şey", 
    "um", "uh", "er", "ah", "like", "you know"
}


def generate_cut_segments(
    words: List[Dict], 
    silence_threshold: float, 
    clip_start: float = 0.0
) -> List[Tuple[float, float]]:
    """
    Dolgu kelimelerini ve sessizlikleri temizleyerek ses içeren aktif aralıkları hesaplar.
    
    Args:
        words: Kelime seviyesinde zaman damgaları listesi [{'word': ..., 'start': ..., 'end': ...}]
        silence_threshold: Saniye cinsinden sessizlik eşiği
        clip_start: Seçili klibin timeline'daki in_point değeri (zaman kayması düzeltmesi için)
    """
    if not clip_start:
        clip_start = 0.0

    speech_words = []
    for w in words:
        word_text = (w.get("word") or "").strip().lower().rstrip(".,?!;:-")
        if not word_text or word_text in FILLER_WORDS:
            continue
        speech_words.append(w)

    if not speech_words:
        return []

    segments: List[Tuple[float, float]] = []
    current_start = speech_words[0]["start"]
    prev_end = speech_words[0]["end"]

    for w in speech_words[1:]:
        start = w["start"]
        end = w["end"]
        
        gap = start - prev_end
        if gap > silence_threshold:
            segments.append((current_start + clip_start, prev_end + clip_start))
            current_start = start
        prev_end = end

    segments.append((current_start + clip_start, prev_end + clip_start))
    return segments


def merge_segments(
    segments: List[Tuple[float, float]], 
    padding: float, 
    max_duration: float = 0.0
) -> List[Tuple[float, float]]:
    """
    Kelimelerin yarım kalmaması için padding ekler ve çakışan aralıkları birleştirir.
    """
    if not segments:
        return []

    # clip_start offset veya dosya süresi tutarsızlığında kesilme olmaması için
    max_seg_end = max([e for _, e in segments], default=0.0)
    effective_max_duration = max(float(max_duration or 0.0), max_seg_end + padding)

    padded = []
    for s, e in segments:
        start_padded = max(0.0, s - padding)
        end_padded = min(effective_max_duration, e + padding)
        if end_padded > start_padded:
            padded.append((start_padded, end_padded))

    merged: List[Tuple[float, float]] = []
    for cur in padded:
        if not merged:
            merged.append(cur)
        else:
            prev = merged[-1]
            if cur[0] <= prev[1]:  # Çakışma veya bitişiklik durumunda birleştir
                merged[-1] = (prev[0], max(prev[1], cur[1]))
            else:
                merged.append(cur)
    return merged


def get_xml_rate(fps: float) -> Tuple[int, bool]:
    """
    Premiere uyumlu FCP XML için timebase ve NTSC ayarlarını döndürür.
    Sıfır veya negatif fps değerlerini engeller (en az 1.0 fps).
    """
    try:
        fps = max(1.0, float(fps or 30.0))
    except (ValueError, TypeError):
        fps = 30.0

    fps_round = round(fps, 3)
    if fps_round == 23.976:
        return 24, True
    elif fps_round == 29.97:
        return 30, True
    elif fps_round == 59.94:
        return 60, True
    else:
        return max(1, int(round(fps))), False


def path_to_xml_url(path: Path) -> str:
    """
    Dosya yolunu XML uyumlu URL formatına (file:///...) dönüştürür.
    """
    return path.absolute().as_uri()


def generate_fcp_xml(
    media_path: Path,
    video_path: Optional[Path] = None,
    audio_path: Optional[Path] = None,
    segments: Optional[List[Tuple[float, float]]] = None,
    fps: float = 30.0,
    width: int = 1920,
    height: int = 1080,
    total_media_duration: float = 0.0
) -> str:
    """
    Premiere Pro tarafından okunabilen FCP XML şablonunu üretir.
    Hem video hem ses dosyasını (farklı veya aynı) eşzamanlı olarak keser ve birleştirir.
    """
    if segments is None:
        segments = []

    try:
        fps = max(1.0, float(fps or 30.0))
    except (ValueError, TypeError):
        fps = 30.0

    timebase, is_ntsc = get_xml_rate(fps)
    ntsc_str = "TRUE" if is_ntsc else "FALSE"

    v_path = video_path or media_path
    a_path = audio_path or media_path

    different_files = False
    try:
        different_files = v_path.resolve() != a_path.resolve()
    except Exception:
        different_files = str(v_path) != str(a_path)

    max_segment_end = max([end for _, end in segments], default=0.0)
    try:
        total_media_duration = max(float(total_media_duration or 0.0), max_segment_end)
    except (ValueError, TypeError):
        total_media_duration = max_segment_end

    total_media_frames = int(round(total_media_duration * fps))
    sequence_name = xml.sax.saxutils.escape(f"fc_cut_{v_path.stem}")

    video_name = xml.sax.saxutils.escape(v_path.name)
    video_url = xml.sax.saxutils.escape(path_to_xml_url(v_path))
    audio_name = xml.sax.saxutils.escape(a_path.name)
    audio_url = xml.sax.saxutils.escape(path_to_xml_url(a_path))

    video_clips = []
    audio_clips_c1 = []
    audio_clips_c2 = []

    timeline_frame = 0
    for i, (start_sec, end_sec) in enumerate(segments):
        in_frame = int(round(start_sec * fps))
        out_frame = int(round(end_sec * fps))
        duration_frames = out_frame - in_frame
        if duration_frames <= 0:
            continue

        end_frame = timeline_frame + duration_frames

        if different_files:
            # Video: file-1
            file_xml_v = f"""            <file id="file-1">
              <name>{video_name}</name>
              <pathurl>{video_url}</pathurl>
              <rate>
                <timebase>{timebase}</timebase>
                <ntsc>{ntsc_str}</ntsc>
              </rate>
              <duration>{total_media_frames}</duration>
            </file>""" if i == 0 else '            <file id="file-1"/>'

            # Audio: file-2
            file_xml_a1 = f"""            <file id="file-2">
              <name>{audio_name}</name>
              <pathurl>{audio_url}</pathurl>
              <rate>
                <timebase>{timebase}</timebase>
                <ntsc>{ntsc_str}</ntsc>
              </rate>
              <duration>{total_media_frames}</duration>
            </file>""" if i == 0 else '            <file id="file-2"/>'
            file_xml_a2 = '            <file id="file-2"/>'
            audio_clip_name = audio_name
        else:
            # Tek dosya: file-1 hem video hem ses icin ortak
            file_xml_v = f"""            <file id="file-1">
              <name>{video_name}</name>
              <pathurl>{video_url}</pathurl>
              <rate>
                <timebase>{timebase}</timebase>
                <ntsc>{ntsc_str}</ntsc>
              </rate>
              <duration>{total_media_frames}</duration>
            </file>""" if i == 0 else '            <file id="file-1"/>'
            file_xml_a1 = '            <file id="file-1"/>'
            file_xml_a2 = '            <file id="file-1"/>'
            audio_clip_name = video_name

        clip_xml_v = f"""          <clipitem id="clipitem-V-{i}">
            <name>{video_name}</name>
            <duration>{total_media_frames}</duration>
            <rate>
              <timebase>{timebase}</timebase>
              <ntsc>{ntsc_str}</ntsc>
            </rate>
            <in>{in_frame}</in>
            <out>{out_frame}</out>
            <start>{timeline_frame}</start>
            <end>{end_frame}</end>
{file_xml_v}
          </clipitem>"""
        video_clips.append(clip_xml_v)

        # Audio Sol Kanal
        clip_xml_a1 = f"""          <clipitem id="clipitem-A1-{i}">
            <name>{audio_clip_name}</name>
            <duration>{total_media_frames}</duration>
            <rate>
              <timebase>{timebase}</timebase>
              <ntsc>{ntsc_str}</ntsc>
            </rate>
            <in>{in_frame}</in>
            <out>{out_frame}</out>
            <start>{timeline_frame}</start>
            <end>{end_frame}</end>
{file_xml_a1}
            <sourcetrack>
              <tracktype>audio</tracktype>
              <channel>1</channel>
            </sourcetrack>
          </clipitem>"""
        audio_clips_c1.append(clip_xml_a1)

        # Audio Sağ Kanal
        clip_xml_a2 = f"""          <clipitem id="clipitem-A2-{i}">
            <name>{audio_clip_name}</name>
            <duration>{total_media_frames}</duration>
            <rate>
              <timebase>{timebase}</timebase>
              <ntsc>{ntsc_str}</ntsc>
            </rate>
            <in>{in_frame}</in>
            <out>{out_frame}</out>
            <start>{timeline_frame}</start>
            <end>{end_frame}</end>
{file_xml_a2}
            <sourcetrack>
              <tracktype>audio</tracktype>
              <channel>2</channel>
            </sourcetrack>
          </clipitem>"""
        audio_clips_c2.append(clip_xml_a2)

        timeline_frame = end_frame

    total_sequence_duration = timeline_frame

    xml_template = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml SYSTEM "fcpxml.dtd">
<xmeml version="5">
  <sequence id="sequence-1">
    <name>{sequence_name}</name>
    <duration>{total_sequence_duration}</duration>
    <rate>
      <timebase>{timebase}</timebase>
      <ntsc>{ntsc_str}</ntsc>
    </rate>
    <media>
      <video>
        <format>
          <samplecharacteristics>
            <width>{width}</width>
            <height>{height}</height>
            <rate>
              <timebase>{timebase}</timebase>
              <ntsc>{ntsc_str}</ntsc>
            </rate>
          </samplecharacteristics>
        </format>
        <track>
{"\n".join(video_clips)}
        </track>
      </video>
      <audio>
        <numchannels>2</numchannels>
        <track>
{"\n".join(audio_clips_c1)}
        </track>
        <track>
{"\n".join(audio_clips_c2)}
        </track>
      </audio>
    </media>
  </sequence>
</xmeml>
"""
    return xml_template
