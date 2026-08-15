@echo off
echo ========================================================
echo   Hayat App - Smart Gate Bridge Startup Installer
echo ========================================================
echo.

set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set PROJECT_DIR=%~dp0
set BAT_FILE=%STARTUP_DIR%\run_hayat_gate_bridge.bat
set VBS_FILE=%STARTUP_DIR%\start_hayat_gate_bridge.vbs

echo Installing Gate Bridge to run automatically on Startup...

:: Create the BAT file that actually runs the bridge
echo @echo off > "%BAT_FILE%"
echo cd /d "%PROJECT_DIR%" >> "%BAT_FILE%"
echo npm run bridge >> "%BAT_FILE%"

:: Create the VBS file that runs the BAT file invisibly
echo Set WshShell = CreateObject("WScript.Shell") > "%VBS_FILE%"
echo WshShell.Run chr(34) ^& "%BAT_FILE%" ^& chr(34), 0, False >> "%VBS_FILE%"

echo.
echo Setup Complete!
echo The Gate Bridge will now run silently in the background every time you turn on this PC.
echo.
echo To start it right now without restarting, we will launch it in the background for you.
cscript //nologo "%VBS_FILE%"
echo.
pause
