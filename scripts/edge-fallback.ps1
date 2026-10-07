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

function Get-EdgeScannerInstallations {
  param([string]$UserDataPath,[string]$ExtensionPath)
  $expectedPath=[IO.Path]::GetFullPath($ExtensionPath).TrimEnd('\')
  foreach ($profile in @(Get-ChildItem $UserDataPath -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq 'Default' -or $_.Name -match '^Profile \d+$' })) {
    $byId=@{}
    foreach ($filename in @('Preferences','Secure Preferences')) {
      $path=Join-Path $profile.FullName $filename
      if (-not (Test-Path -LiteralPath $path)) { continue }
      try { $settings=(Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json).extensions.settings } catch { continue }
      if (-not $settings) { continue }
      foreach ($property in $settings.PSObject.Properties) {
        if ($property.Name -notmatch '^[a-p]{32}$') { continue }
        if (-not $byId.ContainsKey($property.Name)) { $byId[$property.Name]=@{} }
        foreach ($field in @('path','state','disable_reasons')) {
          if ($property.Value.PSObject.Properties[$field]) { $byId[$property.Name][$field]=$property.Value.$field }
        }
      }
    }
    foreach ($id in $byId.Keys) {
      $entry=$byId[$id]
      if (-not $entry.path) { continue }
      try { $path=[IO.Path]::GetFullPath([string]$entry.path).TrimEnd('\') } catch { continue }
      if ($path -ine $expectedPath) { continue }
      # New Edge profiles omit legacy state=1. Explicit disabled state/reasons
      # still exclude an installation; a fresh matching Edge JSON proves execution.
      if ($entry.ContainsKey('state') -and [string]$entry.state -ne '1') { continue }
      if (@($entry.disable_reasons | Where-Object { $null -ne $_ -and [string]$_ -notin @('','0') }).Count) { continue }
      [pscustomobject]@{Profile=$profile.Name;Id=$id}
    }
  }
}

$scan = Get-LatestScan
if (-not $scan) { return }
$blocked = @($scan.Data.results | Where-Object { $_.ok -ne $true -and $_.reason -eq 'access-check' })
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

# Read both Edge profile formats; keep the saved login profile and extension ID.
$userData = Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\User Data'
$installedExtensions = @(Get-EdgeScannerInstallations -UserDataPath $userData -ExtensionPath $extensionPath)
if ($installedExtensions.Count -ne 1) {
  throw "Edge fallback requires exactly one eligible C:\MarketPulse\chrome-extension installation in Edge (found $($installedExtensions.Count))."
}
$selected = $installedExtensions[0]
$targets=@(foreach($row in @($scan.Data.results)) {
  [pscustomobject]@{brand=$row.brand;mtm=$row.mtm;category=$row.category;srp=$row.srp;enabled=$true;
    productId=$row.productId;itemId=$row.itemId;vendorItemId=$row.vendorItemId;url=$row.url;
    danawaUrl=$row.danawaUrl;enuriUrl=$row.enuriUrl}
})
$catalogJson=ConvertTo-Json -InputObject $targets -Depth 5 -Compress
$triggerUrl = "chrome-extension://$($selected.Id)/fallback.html?catalog=$([Uri]::EscapeDataString($catalogJson))"
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
  $expectedIds=@($targets | ForEach-Object {"$($_.productId)|$($_.itemId)|$($_.vendorItemId)"} | Sort-Object)
  $actualIds=@($candidate.Data.results | ForEach-Object {"$($_.productId)|$($_.itemId)|$($_.vendorItemId)"} | Sort-Object)
  if(($expectedIds -join ',') -ne ($actualIds -join ',')) { throw 'Edge fallback catalog mismatch; the existing dashboard is preserved.' }
  Write-Host "Edge fallback completed: $($candidate.Data.resultCount) product(s)."
  return
}
throw 'Edge fallback did not finish before the timeout; the existing dashboard is preserved.'

