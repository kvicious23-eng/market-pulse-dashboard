param(
  [string]$InstallPath = "$env:LOCALAPPDATA\MarketPulseDashboard"
)

$ErrorActionPreference = "Stop"
$repoUrl = "https://github.com/kvicious23-eng/market-pulse-dashboard.git"
$taskName = "Market Pulse Coupang Price Scan"

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
  New-Item -ItemType Directory -Path (Split-Path -Parent $InstallPath) -Force | Out-Null
  git clone $repoUrl $InstallPath
  if ($LASTEXITCODE -ne 0) { throw "Dashboard download failed." }
} else {
  git -C $InstallPath pull --rebase origin main
  if ($LASTEXITCODE -ne 0) { throw "Dashboard update failed." }
}

git -C $InstallPath config user.name "market-pulse-local"
git -C $InstallPath config user.email "market-pulse-local@users.noreply.github.com"

$scanScript = Join-Path $InstallPath "scripts\local-coupang-scan.ps1"
$powershell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$taskCommand = '"' + $powershell + '" -NoProfile -ExecutionPolicy Bypass -File "' + $scanScript + '" -RepoPath "' + $InstallPath + '"'

schtasks.exe /Create /TN $taskName /SC DAILY /ST 10:00 /TR $taskCommand /F | Out-Host
if ($LASTEXITCODE -ne 0) { throw "Failed to create the daily 10:00 scheduled task." }

Write-Host "Starting the first test scan. If GitHub asks you to sign in, sign in once."
& $powershell -NoProfile -ExecutionPolicy Bypass -File $scanScript -RepoPath $InstallPath
if ($LASTEXITCODE -ne 0) { throw "The first test scan failed." }

Write-Host "Installation complete: Lenovo and Acer Coupang prices will be checked daily at 10:00."
