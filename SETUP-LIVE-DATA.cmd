@echo off
setlocal
cd /d "%~dp0"
echo.
echo TradeNet live quote setup
echo -------------------------
echo Get a Twelve Data API key from https://twelvedata.com/
echo.
set /p TDKEY=Paste your Twelve Data API key, then press Enter: 
if "%TDKEY%"=="" (
  echo No key entered. Nothing changed.
  pause
  exit /b 1
)
(
  echo TWELVE_DATA_API_KEY=%TDKEY%
  echo MARKET_CACHE_MS=65000
) > .env
echo.
echo .env created. Your key stays on this computer.
echo Run: npm run dev
pause
