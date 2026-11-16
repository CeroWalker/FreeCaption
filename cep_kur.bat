@echo off
setlocal EnableExtensions
title FreeCaption - Premiere Paneli Kurulumu
cd /d "%~dp0"

REM KURAL: cmd.exe 'if' parantez blogu ( ... ) kullanma!
REM Indirilen klasor adinda parantez "FreeCaption-main (1)" varsa block parser coker.
REM Tum dallanmalari 'if ... goto' ile yap.

set "TARGET=%APPDATA%\Adobe\CEP\extensions\FreeCaption"
set "SOURCE=%~dp0cep-plugin"
set "FC_T=%TARGET%"

echo.
echo ===================================================
echo   FreeCaption - Premiere Paneli Kurulumu
echo.
echo   Paneli Premiere Pro'nun eklenti klasorune kopyalar
echo   ve gerekli Adobe ayarini acar. Yonetici izni gerekmez.
echo ===================================================
echo.

if not exist "%SOURCE%\index.html" goto :err_source

REM Premiere acikken kurulum yarim etkili olur
tasklist /fi "imagename eq Adobe Premiere Pro.exe" 2>nul | "%SystemRoot%\System32\find.exe" /i "Premiere" >nul
if not errorlevel 1 echo  UYARI: Premiere Pro su an ACIK. Kurulum bitince Premiere'i kapatip yeniden ac.
if not errorlevel 1 echo.

echo [1/4] Adobe eklenti izni veriliyor (debug modu)...
for %%C in (9 10 11 12 13 14 15 16) do reg add "HKCU\Software\Adobe\CSXS.%%C" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>nul
echo       OK
echo.

echo [2/4] Eski kurulum varsa siliniyor...
if exist "%TARGET%" rmdir /s /q "%TARGET%" >nul 2>nul
if exist "%TARGET%\index.html" goto :err_locked
echo       OK
echo.

echo [3/4] Panel kopyalaniyor...
if not exist "%APPDATA%\Adobe\CEP\extensions" mkdir "%APPDATA%\Adobe\CEP\extensions"
xcopy /e /i /q /y "%SOURCE%" "%TARGET%" >nul
if errorlevel 1 goto :err_copy
if not exist "%TARGET%\index.html" goto :err_copy

REM ExtendScript ES3'te JSON.stringify yok: json2.js polyfill main.jsx'in basina eklenir
powershell -NoProfile -Command "$t=$env:FC_T; $j=[IO.File]::ReadAllBytes($t+'\jsx\json2.js'); $m=[IO.File]::ReadAllBytes($t+'\jsx\main.jsx'); $sep=[Text.Encoding]::UTF8.GetBytes([Environment]::NewLine+[Environment]::NewLine+'// ===== main.jsx (concat) ====='+[Environment]::NewLine+[Environment]::NewLine); [IO.File]::WriteAllBytes($t+'\jsx\main.jsx', $j+$sep+$m)" >nul 2>nul
if errorlevel 1 echo       UYARI: JSON eklentisi birlestirilemedi. Panelde hata gorursen bu dosyayi tekrar calistir.
if not errorlevel 1 echo       OK
echo.

echo [4/4] Sunucu yolu panele kaydediliyor...
set "STARTBAT=%~dp0start.bat"
for %%I in ("%~dp0start.bat") do set "SHORTBAT=%%~sI"
if not "%SHORTBAT: =%"=="%SHORTBAT%" goto :path_write
if exist "%SHORTBAT%" set "STARTBAT=%SHORTBAT%"
:path_write
set "FC_SB=%STARTBAT%"
powershell -NoProfile -Command "[IO.File]::WriteAllText($env:FC_T+'\server_path.txt', $env:FC_SB)" >nul 2>nul
if not exist "%TARGET%\server_path.txt" >"%TARGET%\server_path.txt" echo %STARTBAT%
echo       OK
echo.

REM FFmpeg kontrolu
call :findffmpeg
if defined FFOK goto :ff_ok
echo.
echo  UYARI: FFmpeg sisteminizde bulunamadi!
echo  Uzak sunucu (VDS) modu veya yerel ses cikarma icin FFmpeg zorunludur.
set "install_ff="
set /p install_ff="FFmpeg'i winget ile otomatik kurmak ister misiniz? (E/H): "
if /i "%install_ff%"=="E" goto :do_winget
goto :ff_done

:do_winget
echo [!] FFmpeg kuruluyor (winget)...
winget install ffmpeg
goto :ff_done

:ff_ok
echo  FFmpeg: OK (Sistemde mevcut)
echo.
:ff_done

echo.
echo ===================================================
echo   PANEL KURULUMU TAMAM.
echo.
echo   1) Premiere Pro'yu KAPATIP yeniden acin.
echo   2) Window ^> Extensions ^> FreeCaption menusunden acin.
echo ===================================================
echo.
if not defined FC_NOPAUSE pause
exit /b 0

:err_source
echo.
echo  HATA: cep-plugin klasoru bulunamadi: %SOURCE%
echo  Zip'i klasore tamamen cikardiginizdan emin olun (zip'in icinden calistirmayin).
goto :fail_end

:err_locked
echo.
echo  HATA: Eski panel silinemedi (Premiere acik ve kullaniyor olabilir).
echo  Premiere Pro'yu tamamen kapatin ve bu dosyayi tekrar calistirin.
goto :fail_end

:err_copy
echo.
echo  HATA: Panel kopyalanamadi: %TARGET%
echo  Klasor yazma izni yok veya dosya kilitli. Premiere'i kapatip tekrar deneyin.
goto :fail_end

:fail_end
echo.
pause
exit /b 1

:findffmpeg
set "FFOK="
where ffmpeg >nul 2>nul && set "FFOK=1"
if exist "%~dp0ffmpeg\bin\ffmpeg.exe" set "FFOK=1"
if exist "%LOCALAPPDATA%\Microsoft\WinGet\Links\ffmpeg.exe" set "FFOK=1"
if exist "C:\ffmpeg\bin\ffmpeg.exe" set "FFOK=1"
if exist "%ProgramFiles%\ffmpeg\bin\ffmpeg.exe" set "FFOK=1"
if exist "C:\ProgramData\chocolatey\bin\ffmpeg.exe" set "FFOK=1"
if defined FFOK exit /b 0
if not exist "%LOCALAPPDATA%\Microsoft\WinGet\Packages" exit /b 0
dir /s /b "%LOCALAPPDATA%\Microsoft\WinGet\Packages\ffmpeg.exe" >nul 2>nul && set "FFOK=1"
exit /b 0
