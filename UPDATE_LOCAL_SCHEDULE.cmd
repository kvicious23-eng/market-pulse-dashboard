@echo off
setlocal
set "SCHEDULE_SCRIPT=%TEMP%\set-market-pulse-schedule.ps1"
git -C "C:\MarketPulse" pull --rebase origin main
if errorlevel 1 goto :error
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/kvicious23-eng/market-pulse-dashboard/main/scripts/set-local-schedule.ps1?v=20261006-1' -OutFile '%SCHEDULE_SCRIPT%'"
if errorlevel 1 goto :error
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCHEDULE_SCRIPT%" -InstallPath "C:\MarketPulse"
if errorlevel 1 goto :error
echo.
echo Market Pulse schedule updated: scans 08:00, 12:00, 16:00, 20:00; hidden uploads 08:30, 12:30, 16:30, 20:30.
pause
exit /b 0

:error
echo.
echo Schedule update failed. Review the message above.
pause
exit /b 1

