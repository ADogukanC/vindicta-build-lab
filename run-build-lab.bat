@echo off
title Vindicta Build Lab
cd /d "%~dp0"

echo ============================================
echo   Vindicta Build Lab
echo ============================================
echo.
echo Starting the server. Give it a few seconds,
echo then open:  http://localhost:3000
echo.
echo Keep this window open while you use the site.
echo Close it (or press Ctrl+C) to stop the server.
echo.

if not exist "node_modules" (
  echo First run - installing dependencies, this takes a minute...
  call npm install
  echo.
)

call npm run dev

echo.
echo The server has stopped.
pause
