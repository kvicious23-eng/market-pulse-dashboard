param(
  [string]$InstallPath = "C:\MarketPulse"
)

$ErrorActionPreference = "Stop"
$scanTaskName = "Market Pulse Chrome Start"
$uploadTaskName = "Market Pulse Result Upload"
$powershell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$localTimeZone = (Get-TimeZone).Id
if ($localTimeZone -ne "Korea Standard Time") {
  Write-Warning "The Windows time zone is '$localTimeZone'. The tasks will run at 08:00, 08:30, 14:00, and 14:30 in this local time zone; use '(UTC+09:00) Seoul' for KST operation."
}

$chromeCandidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$chrome = $chromeCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $chrome) { throw "Google Chrome is required for the scheduled scanner." }

$uploadRunner = Join-Path $InstallPath "scripts\run-scheduled-upload.ps1"
if (-not (Test-Path $uploadRunner)) {
  throw "The scheduled upload runner was not found at $uploadRunner. Run INSTALL_WINDOWS_SCANNER.cmd first."
}

$reportsPath = Join-Path $InstallPath "reports"
New-Item -ItemType Directory -Path $reportsPath -Force | Out-Null

# The scanner runs inside a normal signed-in Chrome session. Starting Chrome at
# 08:00 and 14:00 also fire the extension's onStartup catch-up logic when Chrome was closed.
$scanTaskSettings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -WakeToRun `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries

$scanAction = New-ScheduledTaskAction -Execute $chrome -Argument '--no-first-run --new-window "chrome://newtab/"'
$scanTriggers = @(
  New-ScheduledTaskTrigger -Daily -At "08:00"
  New-ScheduledTaskTrigger -Daily -At "14:00"
)
Register-ScheduledTask `
  -TaskName $scanTaskName `
  -Action $scanAction `
  -Trigger $scanTriggers `
  -Settings $scanTaskSettings `
  -Description "Start Chrome for Market Pulse scans at 08:00 and 14:00 KST" `
  -Force | Out-Null

$uploadTaskSettings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -WakeToRun `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 15)
$uploadArguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $uploadRunner + '" -RepoPath "' + $InstallPath + '"'
$uploadAction = New-ScheduledTaskAction -Execute $powershell -Argument $uploadArguments
$uploadTriggers = @(
  New-ScheduledTaskTrigger -Daily -At "08:30"
  New-ScheduledTaskTrigger -Daily -At "14:30"
)
Register-ScheduledTask `
  -TaskName $uploadTaskName `
  -Action $uploadAction `
  -Trigger $uploadTriggers `
  -Settings $uploadTaskSettings `
  -Description "Upload Market Pulse scans at 08:30 and 14:30 KST" `
  -Force | Out-Null

$scanTask = Get-ScheduledTask -TaskName $scanTaskName -ErrorAction Stop
$uploadTask = Get-ScheduledTask -TaskName $uploadTaskName -ErrorAction Stop
$scanTime = @($scanTask.Triggers | ForEach-Object { $_.StartBoundary }) -join ', '
$uploadTime = @($uploadTask.Triggers | ForEach-Object { $_.StartBoundary }) -join ', '

Write-Host "Market Pulse local schedule updated."
Write-Host "  Automatic scan (Chrome start): $scanTime"
Write-Host "  Result upload:                 $uploadTime"
Write-Host "  Upload retry:                  3 retries, every 15 minutes"
Write-Host "  Missed runs:                   Start when available"
Write-Host "  Sleep mode:                    Wake the computer to run"
Write-Host "  Windows time zone:             $localTimeZone"
