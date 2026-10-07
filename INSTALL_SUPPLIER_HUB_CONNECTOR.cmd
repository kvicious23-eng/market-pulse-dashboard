@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-supplier-hub-connector.ps1" -RepoPath "%~dp0"
if errorlevel 1 (
  echo Supplier Hub connector installation failed.
  pause
  exit /b 1
)
pause
