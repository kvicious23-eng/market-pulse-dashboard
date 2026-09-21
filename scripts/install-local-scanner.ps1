param(
  [string]$InstallPath = "C:\MarketPulse"
)

$ErrorActionPreference = "Stop"
$repoUrl = "https://github.com/kvicious23-eng/market-pulse-dashboard.git"

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

$chromeCandidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$chrome = $chromeCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $chrome) { throw "Google Chrome is required for the visible-browser scanner." }

$scheduleScript = Join-Path $InstallPath "scripts\set-local-schedule.ps1"
& $scheduleScript -InstallPath $InstallPath
if ($LASTEXITCODE -ne 0) { throw "Local schedule setup failed." }

Unregister-ScheduledTask -TaskName "Market Pulse Coupang Price Scan" -Confirm:$false -ErrorAction SilentlyContinue
$extensionPath = Join-Path $InstallPath 'chrome-extension'
Start-Process explorer.exe -ArgumentList $extensionPath
Start-Process $chrome -ArgumentList 'chrome://extensions/'
Write-Host "Setup files are ready. In Chrome, enable Developer mode and load this unpacked folder:"
Write-Host $extensionPath
Write-Host "After loading it, click the Market Pulse extension icon once for a test scan."
