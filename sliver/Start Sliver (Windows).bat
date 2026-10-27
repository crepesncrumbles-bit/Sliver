@echo off
title Sliver
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js isn't installed yet.
  echo   Get the LTS version from https://nodejs.org , install it, then double-click this file again.
  echo.
  start "" https://nodejs.org
  pause
  exit /b 1
)
start "" /b cmd /c "timeout /t 2 >nul & start http://localhost:3000"
node server\index.js
pause
