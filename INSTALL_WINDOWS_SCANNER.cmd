@echo off
setlocal
set "INSTALLER=%TEMP%\install-local-scanner.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/kvicious23-eng/market-pulse-dashboard/main/scripts/install-local-scanner.ps1?v=20260914-3' -OutFile '%INSTALLER%'"
if errorlevel 1 goto :error
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%INSTALLER%" -InstallPath "C:\MarketPulse"
if errorlevel 1 goto :error
echo.
echo Market Pulse installation completed.
pause
exit /b 0

:error
echo.
echo Installation failed. Review the message above.
pause
exit /b 1
