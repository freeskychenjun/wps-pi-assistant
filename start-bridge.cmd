@echo off
cd /d "%~dp0"
node -e "const n=require('net');const s=n.connect(3987,'127.0.0.1');s.on('connect',()=>{s.destroy();process.exit(0)});s.on('error',()=>process.exit(1))" >nul 2>&1
if errorlevel 1 (
    start "pi-bridge" /min cmd /c "node bridge.js"
    ping -n 3 127.0.0.1 >nul
    echo [pi-assistant] bridge started on 127.0.0.1:3987
) else (
    echo [pi-assistant] bridge already running on 127.0.0.1:3987
)
