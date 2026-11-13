@echo off
rem install-addin.cmd - register the pi-assistant add-in with WPS, then start the bridge.
rem Just double-click this file. Use "install-addin.cmd -Remove" to unregister.
cd /d "%~dp0"
echo ============================================
echo  pi-assistant add-in installer for WPS
echo ============================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-addin.ps1" %*
if errorlevel 1 goto fail

echo %* | findstr /I /C:"-Remove" >nul
if not errorlevel 1 goto done

echo Starting bridge ...
call "%~dp0start-bridge.cmd"

:done
echo.
pause
exit /b 0

:fail
echo.
echo Failed. See the messages above.
pause
exit /b 1
