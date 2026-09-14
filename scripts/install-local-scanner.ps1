param(
  [string]$InstallPath = "$env:LOCALAPPDATA\MarketPulseDashboard"
)

$ErrorActionPreference = "Stop"
$repoUrl = "https://github.com/kvicious23-eng/market-pulse-dashboard.git"
$taskName = "Market Pulse Chrome Start"
$importTaskName = "Market Pulse Result Upload"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host "Git for Windows is not installed. Trying an automatic install..."
  $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
  if (-not $winget) {
    Start-Process "https://git-scm.com/download/win"
    throw "Automatic Git installation is unavailable. Install Git from the opened page, then run this installer again."
  }

  & $winget.Source install --id Git.Git -e --source winget --scope user --silent --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) {
    throw "Git installation failed. Install Git from https://git-scm.com/download/win and run this installer again."
  }

  $gitCandidates = @(
    "$env:LOCALAPPDATA\Programs\Git\cmd",
    "$env:ProgramFiles\Git\cmd",
    "${env:ProgramFiles(x86)}\Git\cmd"
  )
  foreach ($candidate in $gitCandidates) {
    if ($candidate -and (Test-Path (Join-Path $candidate "git.exe"))) {
      $env:Path = "$candidate;$env:Path"
      break
    }
  }

  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "Git was installed but is not available yet. Close this window and run the installer again."
  }
}

if (-not (Test-Path (Join-Path $InstallPath ".git"))) {
  # Create the requested install folder itself. Split-Path can return an empty
  # parent for a directory placed directly under a drive (for example,
  # C:\MarketPulse), which makes New-Item fail with an invalid path.
  New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null
  git clone $repoUrl $InstallPath
  if ($LASTEXITCODE -ne 0) { throw "Dashboard download failed." }
} else {
  git -C $InstallPath pull --rebase origin main
  if ($LASTEXITCODE -ne 0) { throw "Dashboard update failed." }
}

git -C $InstallPath config user.name "market-pulse-local"
git -C $InstallPath config user.email "market-pulse-local@users.noreply.github.com"

$powershell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$chromeCandidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$chrome = $chromeCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $chrome) { throw "Google Chrome is required for the visible-browser scanner." }

$taskAction = New-ScheduledTaskAction -Execute $chrome -Argument '--new-window https://www.coupang.com/'
$taskTrigger = New-ScheduledTaskTrigger -Daily -At "09:58"
$taskSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $taskTrigger -Settings $taskSettings -Description "Open Chrome before the daily Coupang scan" -Force | Out-Host
if (-not (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue)) {
  throw "Failed to create the daily Chrome start task."
}

$importScript = Join-Path $InstallPath "scripts\import-extension-results.ps1"
$importArguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $importScript + '" -RepoPath "' + $InstallPath + '" -WaitForToday'
$importAction = New-ScheduledTaskAction -Execute $powershell -Argument $importArguments
$importTrigger = New-ScheduledTaskTrigger -Daily -At "10:30"
Register-ScheduledTask -TaskName $importTaskName -Action $importAction -Trigger $importTrigger -Settings $taskSettings -Description "Upload Chrome price scan results to GitHub" -Force | Out-Host
if (-not (Get-ScheduledTask -TaskName $importTaskName -ErrorAction SilentlyContinue)) {
  throw "Failed to create the daily result upload task."
}

Write-Host "The scheduled uploader will import only a current-day Chrome scan."

Unregister-ScheduledTask -TaskName "Market Pulse Coupang Price Scan" -Confirm:$false -ErrorAction SilentlyContinue
$extensionPath = Join-Path $InstallPath 'chrome-extension'
Start-Process explorer.exe -ArgumentList $extensionPath
Start-Process $chrome -ArgumentList 'chrome://extensions/'
Write-Host "Setup files are ready. In Chrome, enable Developer mode and load this unpacked folder:"
Write-Host $extensionPath
Write-Host "After loading it, click the Market Pulse extension icon once for a test scan."
