@echo off
setlocal
cd /d "%~dp0"

rem Start the Electron development app without building an installer.
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm.cmd was not found. Install Node.js/npm and reopen this window.
  pause
  exit /b 1
)

if not exist "node_modules\.bin\electron-vite.cmd" (
  echo [ERROR] Dependencies are missing. Run npm install in this project first.
  pause
  exit /b 1
)

call npm.cmd run dev
set "exitCode=%errorlevel%"
if not "%exitCode%"=="0" (
  echo.
  echo [ERROR] The development app exited with code %exitCode%.
)
pause
exit /b %exitCode%
