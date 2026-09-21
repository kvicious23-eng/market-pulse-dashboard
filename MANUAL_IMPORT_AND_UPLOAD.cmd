@echo off
setlocal
set "REPO=C:\MarketPulse"
set "RESULTS=%USERPROFILE%\Downloads\MarketPulse"

if not exist "%REPO%\.git" goto :missing_repo
git -C "%REPO%" pull --rebase origin main
if errorlevel 1 goto :error

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$f=Get-ChildItem -Path '%RESULTS%' -Filter 'latest-coupang-scan*.json' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if(-not $f -or $f.LastWriteTime -lt (Get-Date).AddMinutes(-30)){exit 2}; Write-Host ('Using scan: ' + $f.FullName); Write-Host ('Created:    ' + $f.LastWriteTime)"
if errorlevel 1 goto :missing_scan

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%REPO%\scripts\import-extension-results.ps1" -RepoPath "%REPO%" -WaitForToday
if errorlevel 1 goto :error

if not exist "%REPO%\reports\my-coupang-price-history.csv" goto :missing_history
start "" explorer.exe /select,"%REPO%\reports\my-coupang-price-history.csv"
echo.
echo Manual scan imported and uploaded successfully.
echo Dashboard deployment has started.
pause
exit /b 0

:missing_repo
echo.
echo C:\MarketPulse is not installed. Run INSTALL_WINDOWS_SCANNER.cmd first.
pause
exit /b 1

:missing_scan
echo.
echo No scan created within the last 30 minutes was found.
echo Finish one manual Chrome scan, then run this file again.
pause
exit /b 2

:missing_history
echo.
echo Dashboard import completed, but the local history CSV was not found.
pause
exit /b 3

:error
echo.
echo Manual import or GitHub upload failed. Review the message above.
pause
exit /b 1
