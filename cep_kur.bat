@echo off
title FreeCaption - CEP Eklenti Kurulumu
cd /d "%~dp0"

echo.
echo ===================================================
echo   FreeCaption - CEP Eklenti Kurulumu
echo.
echo   Bu islem CEP debug modunu aktif eder ve
echo   plugin'i Adobe extensions klasorune kopyalar.
echo ===================================================
echo.

REM CEP Debug Mode aktive et (CSXS 9, 10, 11, 12)
echo [1/3] CEP debug mode kayit defterine yaziliyor...
reg add "HKCU\Software\Adobe\CSXS.9" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>nul
reg add "HKCU\Software\Adobe\CSXS.10" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>nul
reg add "HKCU\Software\Adobe\CSXS.11" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>nul
reg add "HKCU\Software\Adobe\CSXS.12" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>nul
echo       OK
echo.

REM CEP extensions klasoru
set "TARGET=%APPDATA%\Adobe\CEP\extensions\FreeCaption"
set "SOURCE=%~dp0cep-plugin"

if not exist "%SOURCE%" (
    echo  HATA: cep-plugin klasoru bulunamadi.
    echo  Konum: %SOURCE%
    pause
    exit /b 1
)

echo [2/3] Eski kurulum varsa siliniyor...
if exist "%TARGET%" rmdir /s /q "%TARGET%"
echo       OK
echo.

echo [3/3] Plugin kopyalaniyor...
if not exist "%APPDATA%\Adobe\CEP\extensions" mkdir "%APPDATA%\Adobe\CEP\extensions"
xcopy /e /i /q /y "%SOURCE%" "%TARGET%" >nul
if errorlevel 1 (
    echo  HATA: Kopyalama basarisiz.
    pause
    exit /b 1
)
echo       OK
echo.

REM ExtendScript ES3'te JSON.stringify yok - polyfill (json2.js) main.jsx basina eklenir
echo [3.5/3] JSON polyfill main.jsx ile birlestiriliyor...
powershell -NoProfile -Command "$j = [System.IO.File]::ReadAllBytes('%TARGET%\jsx\json2.js'); $m = [System.IO.File]::ReadAllBytes('%TARGET%\jsx\main.jsx'); $sep = [System.Text.Encoding]::UTF8.GetBytes([Environment]::NewLine + [Environment]::NewLine + '// ===== main.jsx (concat) =====' + [Environment]::NewLine + [Environment]::NewLine); [System.IO.File]::WriteAllBytes('%TARGET%\jsx\main.jsx', $j + $sep + $m)" >nul 2>nul
if errorlevel 1 (
    echo  UYARI: Polyfill birlestirme basarisiz. ExtendScript hata verebilir.
) else (
    echo       OK
)
echo.

echo ===================================================
echo   KURULUM TAMAM.
echo.
echo   Premiere Pro'yu yeniden baslat
echo   Window ^> Extensions ^> FreeCaption menusunden ac
echo.
echo   Onceden start_hidden.vbs ile sunucu calisiyor olmali.
echo ===================================================
echo.
pause
