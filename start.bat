@echo off
chcp 65001 >nul
cd /d "%~dp0"
title LOLM Builds Site

set "NODE=C:\Users\AAA\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%NODE%" set "NODE=node"

echo ============================================
echo   LOLM Builds / Runes - local site
echo   Local : http://127.0.0.1:5178
echo   Mobile: http://THIS-PC-LAN-IP:5178
echo   Close this window to stop the server
echo ============================================
echo.
start "" "http://127.0.0.1:5178"
"%NODE%" server.mjs
pause
