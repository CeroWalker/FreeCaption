# FreeCaption — NSSM servisleri kurulum (sadece servisler + firewall)
# Bu kisa script ana install ardindan calistirilir.
$ErrorActionPreference = "Continue"

$APP_DIR    = "C:\FreeCaption"
$nssmBin    = "$APP_DIR\bin\nssm.exe"
$python     = "$APP_DIR\.venv\Scripts\python.exe"
$caddyBin   = "$APP_DIR\bin\caddy.exe"
$caddyfile  = "$APP_DIR\Caddyfile"
$envFile    = "$APP_DIR\.env"
$svcName    = "FreeCaption"
$caddySvc   = "FreeCaptionCaddy"

# Onkosul kontroller
$ok = $true
@($nssmBin, $python, $caddyBin, $caddyfile, $envFile, "$APP_DIR\backend\main.py") | ForEach-Object {
    if (-not (Test-Path $_)) {
        Write-Host "  EKSIK: $_" -ForegroundColor Red
        $ok = $false
    }
}
if (-not $ok) {
    Write-Host "  Eksik dosyalar var, kurulumu kontrol et." -ForegroundColor Red
    exit 1
}

# Eski servisler varsa temizle
& $nssmBin stop $svcName 2>$null | Out-Null
& $nssmBin remove $svcName confirm 2>$null | Out-Null
& $nssmBin stop $caddySvc 2>$null | Out-Null
& $nssmBin remove $caddySvc confirm 2>$null | Out-Null

Write-Host "==> Backend servisi kuruluyor" -ForegroundColor Cyan
& $nssmBin install $svcName $python "$APP_DIR\backend\main.py"
& $nssmBin set $svcName AppDirectory "$APP_DIR\backend"
& $nssmBin set $svcName DisplayName "FreeCaption Whisper API"
& $nssmBin set $svcName Description "FreeCaption transcription backend"
& $nssmBin set $svcName Start SERVICE_AUTO_START
& $nssmBin set $svcName AppStdout "$APP_DIR\logs\backend-stdout.log"
& $nssmBin set $svcName AppStderr "$APP_DIR\logs\backend-stderr.log"
& $nssmBin set $svcName AppRotateFiles 1
& $nssmBin set $svcName AppRotateBytes 5242880
& $nssmBin set $svcName AppEnvironmentExtra (Get-Content $envFile -Raw)
& $nssmBin start $svcName

Write-Host "==> Caddy servisi kuruluyor" -ForegroundColor Cyan
& $nssmBin install $caddySvc $caddyBin "run --config" $caddyfile
& $nssmBin set $caddySvc AppDirectory $APP_DIR
& $nssmBin set $caddySvc DisplayName "FreeCaption Caddy Proxy"
& $nssmBin set $caddySvc Description "Caddy reverse proxy for FreeCaption"
& $nssmBin set $caddySvc Start SERVICE_AUTO_START
& $nssmBin set $caddySvc AppStdout "$APP_DIR\logs\caddy-stdout.log"
& $nssmBin set $caddySvc AppStderr "$APP_DIR\logs\caddy-stderr.log"
& $nssmBin start $caddySvc

Write-Host "==> Firewall" -ForegroundColor Cyan
New-NetFirewallRule -DisplayName "FreeCaption HTTP"  -Direction Inbound -LocalPort 80  -Protocol TCP -Action Allow -ErrorAction SilentlyContinue | Out-Null
New-NetFirewallRule -DisplayName "FreeCaption HTTPS" -Direction Inbound -LocalPort 443 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue | Out-Null

Start-Sleep -Seconds 5

Write-Host ""
Write-Host "==> Servis durumu" -ForegroundColor Cyan
Get-Service $svcName, $caddySvc | Format-Table Name, Status, StartType

Write-Host ""
Write-Host "==> Health check" -ForegroundColor Cyan
try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:7860/api/health" -UseBasicParsing -TimeoutSec 15
    Write-Host "  HEALTH: $($r.Content)" -ForegroundColor Green
} catch {
    Write-Host "  Backend yanit vermedi. Loglara bak:" -ForegroundColor Yellow
    Write-Host "    Get-Content $APP_DIR\logs\backend-stderr.log -Tail 30" -ForegroundColor Gray
}

Write-Host ""
$ip = (Invoke-WebRequest "https://api.ipify.org" -UseBasicParsing).Content
Write-Host "==> Premiere paneli URL: http://$ip" -ForegroundColor Yellow
Write-Host "==> API Key: .env icinde -> $APP_DIR\.env" -ForegroundColor Yellow
Get-Content $envFile | Select-String "FC_API_KEY"
