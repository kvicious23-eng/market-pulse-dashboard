param(
  [string]$RepoPath = 'C:\MarketPulse',
  [int]$TimeoutMinutes = 40
)
$ErrorActionPreference = 'Stop'
$resultFolder = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads\MarketPulse'
$extensionPath = Join-Path $RepoPath 'chrome-extension'

function Get-LatestScan {
  $file = Get-ChildItem $resultFolder -Filter 'latest-coupang-scan*.json' -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
  if (-not $file) { return $null }
  try {
    $data = Get-Content -Raw -Encoding UTF8 $file.FullName | ConvertFrom-Json -ErrorAction Stop
    return [pscustomobject]@{ File=$file; Data=$data }
  } catch { return $null }
}

$scan = Get-LatestScan
if (-not $scan) { return }
$blocked = @($scan.Data.results | Where-Object { $_.reason -eq 'access-check' })
if (-not $blocked.Count -or $scan.Data.browser -eq 'edge') { return }
try { $scanEnd = [DateTimeOffset]::Parse([string]$scan.Data.completedAt) } catch { return }
if (([DateTimeOffset]::UtcNow - $scanEnd.ToUniversalTime()).TotalHours -gt 3) { return }
Write-Host "Chrome access-check on $($blocked.Count) product(s); starting Edge fallback."

$edgeCandidates = @(
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
)
$edge = $edgeCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $edge) { throw 'Edge fallback unavailable: Microsoft Edge is not installed.' }

# Unpacked extension IDs are profile specific. Read Edge's own profile settings,
# then open the trigger page in the already signed-in profile.
$userData = Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\User Data'
$profiles = @(Get-ChildItem $userData -Directory -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -eq 'Default' -or $_.Name -match '^Profile \d+$' })
$installedExtensions = @()
foreach ($edgeProfile in $profiles) {
  $preferences = Join-Path $edgeProfile.FullName 'Preferences'
  if (-not (Test-Path $preferences)) { continue }
  try { $settings = (Get-Content -Raw -Encoding UTF8 $preferences | ConvertFrom-Json).extensions.settings } catch { continue }
  if (-not $settings) { continue }
  foreach ($property in $settings.PSObject.Properties) {
    $extension = $property.Value
    if (-not $extension.path) { continue }
    try { $installedPath = [IO.Path]::GetFullPath([string]$extension.path).TrimEnd('\') } catch { continue }
    if ($installedPath -ieq [IO.Path]::GetFullPath($extensionPath).TrimEnd('\') -and [int]$extension.state -eq 1) {
      $installedExtensions += [pscustomobject]@{ Profile=$edgeProfile.Name; Id=$property.Name }
    }
  }
}
if ($installedExtensions.Count -ne 1) {
  throw "Edge fallback requires exactly one enabled C:\MarketPulse\chrome-extension installation in Edge (found $($installedExtensions.Count))."
}
$selected = $installedExtensions[0]
$triggerUrl = "chrome-extension://$($selected.Id)/fallback.html"
Start-Process -FilePath $edge -ArgumentList @("--profile-directory=`"$($selected.Profile)`"",'--new-window',$triggerUrl)

$deadline = [DateTime]::UtcNow.AddMinutes($TimeoutMinutes)
while ([DateTime]::UtcNow -lt $deadline) {
  Start-Sleep -Seconds 15
  $candidate = Get-LatestScan
  if (-not $candidate -or $candidate.Data.browser -ne 'edge') { continue }
  try { $started = [DateTimeOffset]::Parse([string]$candidate.Data.startedAt) } catch { continue }
  if ($started -le $scanEnd) { continue }
  if ($candidate.Data.complete -ne $true -or @($candidate.Data.results | Where-Object { $_.ok -ne $true }).Count -gt 0) {
    throw 'Edge fallback finished with incomplete prices; the existing dashboard is preserved.'
  }
  Write-Host "Edge fallback completed: $($candidate.Data.resultCount) product(s)."
  return
}
throw 'Edge fallback did not finish before the timeout; the existing dashboard is preserved.'
