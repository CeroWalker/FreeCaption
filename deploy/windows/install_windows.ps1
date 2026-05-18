# FreeCaption — Windows VDS kurulum scripti
# Hedef: Windows Server 2019/2022 + PowerShell 5.1+
# Calistirma: PowerShell'i ADMIN olarak ac, sonra:
#   Set-ExecutionPolicy -Scope Process Bypass -Force
#   .\install_windows.ps1
#
# Bu script SIFIRDAN her seyi indirir (lokal'den dosya kopyalamak gerekmez).

# NSSM ve diger non-critical komutlar fail edebilir, kritik adimlari if-else ile kontrol ediyoruz
$ErrorActionPreference = "Continue"

# ============ CONFIG ============
$APP_DIR    = "C:\FreeCaption"
$GITHUB_URL = "https://github.com/ScamEmre/FreeCaption"
$BRANCH     = "main"
$PY_VERSION = "3.12.7"
$FFMPEG_URL = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
$NSSM_URL   = "https://nssm.cc/release/nssm-2.24.zip"
$CADDY_URL  = "https://github.com/caddyserver/caddy/releases/download/v2.8.4/caddy_2.8.4_windows_amd64.zip"
# ================================

function Write-Step($n, $msg) {
    Write-Host ""
    Write-Host "==> [$n] $msg" -ForegroundColor Cyan
}

function Get-RandomKey {
    # 32 byte random → base64-urlsafe ≈ 43 karakter
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    return [Convert]::ToBase64String($bytes).Replace("+","-").Replace("/","_").TrimEnd("=")
}

function Test-Admin {
    $id = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $p  = New-Object System.Security.Principal.WindowsPrincipal($id)
    return $p.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin)) {
    Write-Host "HATA: Bu script ADMIN PowerShell'de calistirilmali." -ForegroundColor Red
    exit 1
}

# ============ 1) Dizinler ============
Write-Step 1 "Dizin yapisi"
New-Item -ItemType Directory -Force -Path $APP_DIR | Out-Null
New-Item -ItemType Directory -Force -Path "$APP_DIR\bin" | Out-Null
New-Item -ItemType Directory -Force -Path "$APP_DIR\logs" | Out-Null
Set-Location $APP_DIR

# ============ 2) Git (zaten yoksa kur) ============
Write-Step 2 "Git kontrol"
$gitOk = $false
try { git --version | Out-Null; $gitOk = $true } catch {}
if (-not $gitOk) {
    Write-Host "  Git yok. winget ile kuruluyor (msstore atlanir)..."
    winget install --id Git.Git -e --source winget --silent --accept-package-agreements --accept-source-agreements
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}

# ============ 3) Python 3.12 kur (winget) ============
Write-Step 3 "Python 3.12"
$pyOk = $false
try {
    $v = & py -3.12 -V 2>$null
    if ($v -match "Python 3\.12") { $pyOk = $true }
} catch {}
if (-not $pyOk) {
    Write-Host "  Python 3.12 yok. winget ile kuruluyor (msstore atlanir)..."
    winget install --id Python.Python.3.12 -e --source winget --silent --accept-package-agreements --accept-source-agreements
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}

# ============ 3.5) Microsoft Visual C++ Redistributable (PyTorch icin kritik) ============
Write-Step "3.5" "Visual C++ Redistributable (2015-2022 x64)"
Write-Host "  PyTorch ve ctranslate2 icin gerekli (WinError 127 onleme)"
winget install Microsoft.VCRedist.2015+.x64 -e --source winget --silent --accept-package-agreements --accept-source-agreements 2>$null | Out-Null
Write-Host "  OK"

# ============ 4) FFmpeg indir ============
Write-Step 4 "FFmpeg"
$ffmpegBin = "$APP_DIR\bin\ffmpeg.exe"
if (-not (Test-Path $ffmpegBin)) {
    $zipPath = "$env:TEMP\ffmpeg.zip"
    Write-Host "  Indiriliyor: $FFMPEG_URL"
    Invoke-WebRequest -Uri $FFMPEG_URL -OutFile $zipPath -UseBasicParsing
    Expand-Archive -Path $zipPath -DestinationPath "$env:TEMP\ffmpeg_extract" -Force
    $extracted = Get-ChildItem -Path "$env:TEMP\ffmpeg_extract" -Directory | Select-Object -First 1
    Copy-Item "$($extracted.FullName)\bin\ffmpeg.exe"  $ffmpegBin -Force
    Copy-Item "$($extracted.FullName)\bin\ffprobe.exe" "$APP_DIR\bin\ffprobe.exe" -Force
    Remove-Item -Recurse -Force $zipPath, "$env:TEMP\ffmpeg_extract"
}
# PATH'e ekle (sistem)
$systemPath = [System.Environment]::GetEnvironmentVariable("Path","Machine")
if ($systemPath -notlike "*$APP_DIR\bin*") {
    [System.Environment]::SetEnvironmentVariable("Path", "$systemPath;$APP_DIR\bin", "Machine")
    $env:Path += ";$APP_DIR\bin"
}

# ============ 5) NSSM (Windows Service Manager) ============
Write-Step 5 "NSSM"
$nssmBin = "$APP_DIR\bin\nssm.exe"
if (-not (Test-Path $nssmBin)) {
    $zipPath = "$env:TEMP\nssm.zip"
    Invoke-WebRequest -Uri $NSSM_URL -OutFile $zipPath -UseBasicParsing
    Expand-Archive -Path $zipPath -DestinationPath "$env:TEMP\nssm_extract" -Force
    $nssmSrc = Get-ChildItem -Path "$env:TEMP\nssm_extract" -Recurse -Filter "nssm.exe" | Where-Object { $_.FullName -like "*win64*" } | Select-Object -First 1
    Copy-Item $nssmSrc.FullName $nssmBin -Force
    Remove-Item -Recurse -Force $zipPath, "$env:TEMP\nssm_extract"
}

# ============ 6) Caddy (auto HTTPS reverse proxy) ============
Write-Step 6 "Caddy"
$caddyBin = "$APP_DIR\bin\caddy.exe"
if (-not (Test-Path $caddyBin)) {
    $zipPath = "$env:TEMP\caddy.zip"
    Invoke-WebRequest -Uri $CADDY_URL -OutFile $zipPath -UseBasicParsing
    Expand-Archive -Path $zipPath -DestinationPath "$env:TEMP\caddy_extract" -Force
    Copy-Item "$env:TEMP\caddy_extract\caddy.exe" $caddyBin -Force
    Remove-Item -Recurse -Force $zipPath, "$env:TEMP\caddy_extract"
}

# ============ 7) FreeCaption repo'sunu cek ============
Write-Step 7 "FreeCaption kodu"
if (Test-Path "$APP_DIR\backend") {
    Write-Host "  Mevcut kurulum var, guncelleniyor (git pull)..."
    Set-Location $APP_DIR
    git pull --rebase
} else {
    Write-Host "  Klonlaniyor: $GITHUB_URL ($BRANCH)"
    git clone --branch $BRANCH --single-branch $GITHUB_URL "$APP_DIR\_repo"
    # backend + deploy + frontend (frontend StaticFiles mount icin sart)
    Copy-Item -Recurse -Force "$APP_DIR\_repo\backend"  "$APP_DIR\backend"
    Copy-Item -Recurse -Force "$APP_DIR\_repo\deploy"   "$APP_DIR\deploy"
    if (Test-Path "$APP_DIR\_repo\frontend") {
        Copy-Item -Recurse -Force "$APP_DIR\_repo\frontend" "$APP_DIR\frontend"
    }
    if (Test-Path "$APP_DIR\_repo\requirements.txt") {
        Copy-Item -Force "$APP_DIR\_repo\requirements.txt" "$APP_DIR\requirements.txt"
    }
    Remove-Item -Recurse -Force "$APP_DIR\_repo"
}

# ============ 8) Venv + bagimliliklar (CPU torch) ============
Write-Step 8 "Python venv + torch CPU"
if (-not (Test-Path "$APP_DIR\.venv")) {
    py -3.12 -m venv "$APP_DIR\.venv"
}
$pip = "$APP_DIR\.venv\Scripts\pip.exe"
$python = "$APP_DIR\.venv\Scripts\python.exe"
& $python -m pip install --upgrade pip wheel
# CPU-only torch
& $pip install "torch==2.7.1+cpu" --index-url https://download.pytorch.org/whl/cpu
if (Test-Path "$APP_DIR\requirements.txt") {
    & $pip install -r "$APP_DIR\requirements.txt"
} else {
    & $pip install -r "$APP_DIR\backend\requirements.txt"
}

# KRITIK: ctranslate2 4.5+ Windows'ta DLL hatasi veriyor (libomp uyumsuzluk).
# 4.4.0 stabil son surum, force-reinstall ile garantile.
Write-Host "  ctranslate2 4.4.0 (Windows DLL stabil) zorla yukle"
& $pip install "ctranslate2==4.4.0" --force-reinstall --no-deps

# Intel OpenMP DLL paketi (libomp140.x64.dll) ctranslate2 icin gerekli
Write-Host "  Intel OpenMP (libomp DLLs)"
& $pip install intel-openmp

# ============ 9) .env olustur (random API key) ============
Write-Step 9 ".env (random API key)"
$envFile = "$APP_DIR\.env"
if (-not (Test-Path $envFile)) {
    $apiKey = Get-RandomKey
    @"
FC_MODE=cpu
FC_MODEL=medium
FC_ALIGN=0
FC_HOST=127.0.0.1
FC_PORT=7860
FC_API_KEY=$apiKey
FC_MAX_UPLOAD_MB=500
FC_BATCH=8
"@ | Out-File -Encoding ASCII -FilePath $envFile -Force

    Write-Host ""
    Write-Host "  ╔════════════════════════════════════════════════════════════╗" -ForegroundColor Yellow
    Write-Host "  ║  YENI API KEY uretildi — Premiere panelinde gireceksin:    ║" -ForegroundColor Yellow
    Write-Host "  ║  $apiKey" -ForegroundColor Green
    Write-Host "  ╚════════════════════════════════════════════════════════════╝" -ForegroundColor Yellow
    Write-Host ""
}

# ============ 10) Caddyfile (domain yoksa IP uzerinden HTTP) ============
Write-Step 10 "Caddy yapilandirmasi"
$domainPrompt = Read-Host "Domain (orn. api.emrekazak.com) — bos gec= HTTP-only IP modu"
$caddyfile = "$APP_DIR\Caddyfile"
if ($domainPrompt) {
    @"
$domainPrompt {
    reverse_proxy 127.0.0.1:7860 {
        flush_interval -1
    }
    request_body {
        max_size 500MB
    }
    encode gzip
    log {
        output file $APP_DIR\logs\caddy-access.log
    }
}
"@ | Out-File -Encoding ASCII -FilePath $caddyfile -Force
} else {
    # IP modu — sadece 80
    @"
:80 {
    reverse_proxy 127.0.0.1:7860 {
        flush_interval -1
    }
    request_body {
        max_size 500MB
    }
    encode gzip
}
"@ | Out-File -Encoding ASCII -FilePath $caddyfile -Force
}

# ============ 11) Backend servisi (NSSM) ============
Write-Step 11 "FreeCaption servisi (NSSM)"
$svcName = "FreeCaption"
# Eski varsa kaldir
& $nssmBin stop $svcName 2>$null | Out-Null
& $nssmBin remove $svcName confirm 2>$null | Out-Null
# Kur
& $nssmBin install $svcName $python "$APP_DIR\backend\main.py"
& $nssmBin set $svcName AppDirectory "$APP_DIR\backend"
& $nssmBin set $svcName DisplayName "FreeCaption Whisper API"
& $nssmBin set $svcName Description "FreeCaption transcription backend (FastAPI/Uvicorn)"
& $nssmBin set $svcName Start SERVICE_AUTO_START
& $nssmBin set $svcName AppStdout "$APP_DIR\logs\backend-stdout.log"
& $nssmBin set $svcName AppStderr "$APP_DIR\logs\backend-stderr.log"
& $nssmBin set $svcName AppRotateFiles 1
& $nssmBin set $svcName AppRotateBytes 5242880
# .env yukle
& $nssmBin set $svcName AppEnvironmentExtra (Get-Content $envFile -Raw)
& $nssmBin start $svcName

# ============ 12) Caddy servisi ============
Write-Step 12 "Caddy servisi"
$caddySvc = "FreeCaptionCaddy"
& $nssmBin stop $caddySvc 2>$null | Out-Null
& $nssmBin remove $caddySvc confirm 2>$null | Out-Null
& $nssmBin install $caddySvc $caddyBin "run --config" $caddyfile
& $nssmBin set $caddySvc AppDirectory $APP_DIR
& $nssmBin set $caddySvc DisplayName "FreeCaption Caddy Proxy"
& $nssmBin set $caddySvc Description "Caddy reverse proxy + HTTPS for FreeCaption"
& $nssmBin set $caddySvc Start SERVICE_AUTO_START
& $nssmBin set $caddySvc AppStdout "$APP_DIR\logs\caddy-stdout.log"
& $nssmBin set $caddySvc AppStderr "$APP_DIR\logs\caddy-stderr.log"
& $nssmBin start $caddySvc

# ============ 13) Firewall ============
Write-Step 13 "Windows Firewall"
New-NetFirewallRule -DisplayName "FreeCaption HTTP"  -Direction Inbound -LocalPort 80  -Protocol TCP -Action Allow -ErrorAction SilentlyContinue | Out-Null
New-NetFirewallRule -DisplayName "FreeCaption HTTPS" -Direction Inbound -LocalPort 443 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue | Out-Null

# ============ 14) Model on-yukleme (faster_whisper direkt, .models klasorune) ============
Write-Step 14 "Whisper medium modelini on-yukle (1.5 GB, 2-5 dk)"
Write-Host "  KRITIK: download_root='$APP_DIR\backend\.models' — servis context bulabilsin"
$preloadScript = @"
from faster_whisper import WhisperModel
import time
t = time.time()
print('Medium model indiriliyor (1.5 GB)... biraz bekle...')
m = WhisperModel('medium', device='cpu', compute_type='int8', download_root=r'$APP_DIR\backend\.models')
print(f'Model hazir, {time.time()-t:.1f}s')
"@
$preloadScript | Out-File -Encoding ASCII -FilePath "$env:TEMP\fc_preload.py" -Force
& $python "$env:TEMP\fc_preload.py"
Remove-Item "$env:TEMP\fc_preload.py" -ErrorAction SilentlyContinue

# ============ 15) Ozet ============
Write-Step 15 "KURULUM TAMAM"
Write-Host ""
Write-Host "  Backend servisi : $svcName (otomatik baslar)" -ForegroundColor Green
Write-Host "  Proxy servisi   : $caddySvc (otomatik baslar)" -ForegroundColor Green
Write-Host "  Loglar          : $APP_DIR\logs\" -ForegroundColor Gray
Write-Host "  .env            : $APP_DIR\.env  (API_KEY icinde)" -ForegroundColor Gray
Write-Host ""
Write-Host "  Health test:" -ForegroundColor Cyan
if ($domainPrompt) {
    Write-Host "    curl https://$domainPrompt/api/health" -ForegroundColor White
} else {
    $ip = (Invoke-WebRequest -Uri "https://api.ipify.org" -UseBasicParsing).Content
    Write-Host "    curl http://${ip}/api/health" -ForegroundColor White
}
Write-Host ""
Write-Host "  Premiere panelinde:" -ForegroundColor Cyan
Write-Host "    ⚙ Sunucu Ayarlari → URL: " -NoNewline -ForegroundColor White
if ($domainPrompt) { Write-Host "https://$domainPrompt" -ForegroundColor Green }
else { Write-Host "http://$ip" -ForegroundColor Green }
Write-Host "    API Key: .env icindeki FC_API_KEY degeri" -ForegroundColor White
Write-Host ""
Write-Host "  Servis yonetimi:" -ForegroundColor Cyan
Write-Host "    Restart-Service $svcName" -ForegroundColor Gray
Write-Host "    Get-Content $APP_DIR\logs\backend-stderr.log -Tail 50" -ForegroundColor Gray
