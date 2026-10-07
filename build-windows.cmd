@echo off
rem Double-click to build a local Windows installer. Keep errors visible on exit.
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build-windows.ps1" %*
set "build_exit_code=%errorlevel%"
pause
exit /b %build_exit_code%
