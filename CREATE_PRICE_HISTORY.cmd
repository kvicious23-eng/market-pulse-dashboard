@echo off
setlocal
set "HISTORY_SCRIPT=%TEMP%\create-market-pulse-history.ps1"
git -C "C:\MarketPulse" pull --rebase origin main
if errorlevel 1 goto :error
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/kvicious23-eng/market-pulse-dashboard/main/scripts/create-price-history.ps1?v=20260921-2' -OutFile '%HISTORY_SCRIPT%'"
if errorlevel 1 goto :error
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$bytes=[IO.File]::ReadAllBytes('%HISTORY_SCRIPT%'); $text=[Text.Encoding]::UTF8.GetString($bytes); [IO.File]::WriteAllText('%HISTORY_SCRIPT%', $text, (New-Object Text.UTF8Encoding($true)))"
if errorlevel 1 goto :error
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HISTORY_SCRIPT%" -RepoPath "C:\MarketPulse"
if errorlevel 1 goto :error
echo.
echo Price history CSV is ready in C:\MarketPulse\reports.
pause
exit /b 0

:error
echo.
echo Price history creation failed. Review the message above.
pause
exit /b 1
