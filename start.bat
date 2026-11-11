@echo off
REM Humanize AI - one-click start for Windows.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)

if not exist "server\.env" (
  copy "server\.env.example" "server\.env" >nul
  echo Created server\.env - open it and paste your GEMINI_API_KEY for real AI rewrites.
)

if not exist "node_modules" (
  echo Installing packages, this takes a minute the first time...
  call npm.cmd install
  if errorlevel 1 (
    echo Install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

echo Starting Humanize AI. Open http://localhost:5173 in your browser.
call npm.cmd run dev
pause
