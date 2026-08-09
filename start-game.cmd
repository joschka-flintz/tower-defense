@echo off
rem Starts the game's dev server. Node.js lives in your user folder (no admin
rem install), so it is added to PATH just for this window.
cd /d "%~dp0"
set "PATH=C:\Users\flintz\nodejs;%PATH%"

if not exist "node_modules" (
  echo Installing dependencies, this happens only once...
  call npm install --no-fund --no-audit
)

echo.
echo   Open http://localhost:5173 in your browser.
echo   Press Ctrl+C in this window to stop the server.
echo.
call npm run dev
pause
