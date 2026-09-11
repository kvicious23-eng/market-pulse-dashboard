param(
  [string]$InstallPath = "$env:LOCALAPPDATA\MarketPulseDashboard"
)

$ErrorActionPreference = "Stop"
$repoUrl = "https://github.com/kvicious23-eng/market-pulse-dashboard.git"
$taskName = "Market Pulse Coupang Price Scan"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "Git이 필요합니다. https://git-scm.com/download/win 에서 Git for Windows를 먼저 설치하세요."
}

if (-not (Test-Path (Join-Path $InstallPath ".git"))) {
  New-Item -ItemType Directory -Path (Split-Path -Parent $InstallPath) -Force | Out-Null
  git clone $repoUrl $InstallPath
  if ($LASTEXITCODE -ne 0) { throw "대시보드 다운로드에 실패했습니다." }
} else {
  git -C $InstallPath pull --rebase origin main
  if ($LASTEXITCODE -ne 0) { throw "대시보드 최신화에 실패했습니다." }
}

git -C $InstallPath config user.name "market-pulse-local"
git -C $InstallPath config user.email "market-pulse-local@users.noreply.github.com"

$scanScript = Join-Path $InstallPath "scripts\local-coupang-scan.ps1"
$powershell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$taskCommand = '"' + $powershell + '" -NoProfile -ExecutionPolicy Bypass -File "' + $scanScript + '" -RepoPath "' + $InstallPath + '"'

schtasks.exe /Create /TN $taskName /SC DAILY /ST 10:00 /TR $taskCommand /F | Out-Host
if ($LASTEXITCODE -ne 0) { throw "오전 10시 예약 작업 등록에 실패했습니다." }

Write-Host "첫 시험 조사를 시작합니다. GitHub 로그인 창이 뜨면 한 번만 로그인하세요."
& $powershell -NoProfile -ExecutionPolicy Bypass -File $scanScript -RepoPath $InstallPath
if ($LASTEXITCODE -ne 0) { throw "첫 시험 조사에 실패했습니다." }

Write-Host "설치 완료: 매일 오전 10시에 Lenovo와 Acer 쿠팡 가격을 확인합니다."
