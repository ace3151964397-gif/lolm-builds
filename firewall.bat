@echo off
chcp 437 >nul
net session >nul 2>&1
if not %errorLevel%==0 (
  echo Requesting administrator rights...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
echo Adding firewall rule for TCP 5178 ...
netsh advfirewall firewall delete rule name="LOLM-5178" >nul 2>&1
netsh advfirewall firewall add rule name="LOLM-5178" dir=in action=allow protocol=TCP localport=5178 profile=any
if %errorLevel%==0 (
  echo.
  echo OK: phone on the same Wi-Fi can now open http://192.168.1.57:5178
) else (
  echo.
  echo FAILED: please allow Node.js in Windows Security - Firewall - Allow an app.
)
echo.
pause
