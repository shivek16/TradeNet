@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 LTS first, then run this file again.
  pause
  exit /b 1
)
node -e "if(!(Number(process.versions.node.split('.')[0]) >= 24)) process.exit(1)"
if errorlevel 1 (
  echo Node.js 24 or newer is required.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm ci --no-fund
  if errorlevel 1 goto failed
)
if not exist dist\index.html (
  call npm run build
  if errorlevel 1 goto failed
)
echo Open http://localhost:3002 in your browser after the server starts.
echo Leave this window open. Press Ctrl+C to stop.
call npm start
if errorlevel 1 goto failed
exit /b 0
:failed
echo Startup failed. Read the error above and the troubleshooting section in README.md.
pause
exit /b 1
