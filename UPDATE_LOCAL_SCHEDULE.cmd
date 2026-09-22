@echo off
setlocal
set "SCHEDULE_SCRIPT=%TEMP%\set-market-pulse-schedule.ps1"
git -C "C:\MarketPulse" pull --rebase origin main
if errorlevel 1 goto :error
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/kvicious23-eng/market-pulse-dashboard/main/scripts/set-local-schedule.ps1?v=20260922-1' -OutFile '%SCHEDULE_SCRIPT%'"
if errorlevel 1 goto :error
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCHEDULE_SCRIPT%" -InstallPath "C:\MarketPulse"
if errorlevel 1 goto :error
echo.
echo Market Pulse schedule updated: scan 08:00, upload 08:30.
pause
exit /b 0

:error
echo.
echo Schedule update failed. Review the message above.
pause
exit /b 1
