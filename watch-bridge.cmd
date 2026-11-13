@echo off
rem Watchdog: runs every minute from Task Scheduler; if nothing listens on 3987,
rem start the bridge task again. Pure ASCII on purpose (see docs P18).
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 exit /b 0

node -e "var n=require('net');var s=n.connect(3987,'127.0.0.1');s.on('connect',function(){s.destroy();process.exit(0)});s.on('error',function(){process.exit(1)});s.setTimeout(1200,function(){s.destroy();process.exit(1)})" >nul 2>&1
if not errorlevel 1 exit /b 0

echo [%date% %time%] bridge not listening, restarting >> "%~dp0bridge-watchdog.log"
schtasks /run /tn "WPSPiAssistantBridge" >nul 2>&1
exit /b 0
