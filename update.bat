@echo off
chcp 65001 >nul
cd /d "%~dp0"
title LOLM Data Update

set "NODE=C:\Users\AAA\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%NODE%" set "NODE=node"

echo Fetching latest builds and runes from wildriftmeta.com ...
"%NODE%" refresh.mjs --concurrency 8
echo.
echo Done. Reload the web page to see new data.
pause
