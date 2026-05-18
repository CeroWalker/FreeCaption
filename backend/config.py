import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
OUTPUT_DIR = BASE_DIR / "output"
TEMP_DIR = BASE_DIR / "backend" / ".temp"
MODEL_CACHE_DIR = BASE_DIR / "backend" / ".models"

OUTPUT_DIR.mkdir(exist_ok=True)
TEMP_DIR.mkdir(exist_ok=True)
MODEL_CACHE_DIR.mkdir(exist_ok=True)

# Deploy mode: "gpu" (yerel, large-v3 + WhisperX) | "cpu" (VDS, medium, alignment kapali)
FC_MODE = os.environ.get("FC_MODE", "gpu").lower()

if FC_MODE == "cpu":
    WHISPER_MODEL = os.environ.get("FC_MODEL", "medium")
    DISABLE_ALIGNMENT = os.environ.get("FC_ALIGN", "0") != "1"
    FORCE_DEVICE = "cpu"
else:
    WHISPER_MODEL = os.environ.get("FC_MODEL", "large-v3")
    DISABLE_ALIGNMENT = False
    FORCE_DEVICE = None  # auto-detect

COMPUTE_TYPE_GPU = "float16"
COMPUTE_TYPE_CPU = "int8"

BATCH_SIZE = int(os.environ.get("FC_BATCH", "16"))
DEFAULT_LANGUAGE = None

MAX_WORDS_PER_LINE = 99
MAX_CHARS_PER_LINE = 28
MAX_LINE_DURATION = 4.0
MIN_LINE_DURATION = 0.8

# 0.0.0.0 → public bind (VDS), 127.0.0.1 → lokal-only
HOST = os.environ.get("FC_HOST", "127.0.0.1")
PORT = int(os.environ.get("FC_PORT", "7860"))

# Auth: VDS'de zorunlu, lokal'de bos birakilirsa devre disi
API_KEY = os.environ.get("FC_API_KEY", "").strip()

# Upload limit (MB): VDS'de disk ve cpu korumasi icin
MAX_UPLOAD_MB = int(os.environ.get("FC_MAX_UPLOAD_MB", "500"))
