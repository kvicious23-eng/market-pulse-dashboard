param(
  [string]$RepoPath = 'C:\MarketPulse',
  [int]$TimeoutMinutes = 40,
  $StartWitness=$null,
  $ExitProof=$null
)
$ErrorActionPreference = 'Stop'
$resultFolder = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads\MarketPulse'
$extensionPath = Join-Path $RepoPath 'chrome-extension'
. (Join-Path $PSScriptRoot 'scan-recovery.ps1')
. (Join-Path $PSScriptRoot 'brand-lifecycle.ps1')

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
$processExit=$null -ne $StartWitness
$receipt=$null;$receiptPath=Join-Path $RepoPath 'reports\edge-recovery.json'
if ($processExit) {
  $slot=Get-ScanRecoverySlot
  $catalog=Read-ScanRecoveryJson (Join-Path $resultFolder 'product-catalog.json')
  Assert-ScanStartWitness $StartWitness $slot $catalog
  $session=(Get-Process -Id $PID).SessionId
  if (-not $ExitProof.chromeSeen -or [int]$ExitProof.absentChecks -lt 2 -or
      ([DateTimeOffset]::UtcNow-[DateTimeOffset]::Parse([string]$ExitProof.observedAt)).TotalSeconds -gt 30 -or
      [DateTimeOffset]::Parse([string]$ExitProof.observedAt) -gt [DateTimeOffset]::UtcNow.AddSeconds(2) -or
      @(Get-Process -ErrorAction Stop | Where-Object {$_.ProcessName -eq 'chrome' -and $_.SessionId -eq $session}).Count) {
    throw 'Chrome process-exit proof is absent or Chrome has restarted; no Edge handoff.'
  }
  if (-not (Test-ChromeExitRecovery $StartWitness $scan.Data $true 2)) { return }
  $targets=@($StartWitness.targets)
  $scanEnd=[DateTimeOffset]::UtcNow
  $receipt=[pscustomobject]@{version=1;state='started';scanSlot=$slot;runId=[guid]::NewGuid().ToString('N');
    reason='chrome-process-exit';chromeRunId=$StartWitness.runId;chromeStartedAt=$StartWitness.startedAt;
    chromeExtensionVersion=$StartWitness.extensionVersion;triggeredAt=$scanEnd.ToString('o');
    processObservation=$ExitProof;targets=$targets}
  Write-Host "Chrome process exit observed; cause unknown. Starting full Edge recollection for slot $slot."
} else {
  if (-not $scan) { return }
  $blocked = @($scan.Data.results | Where-Object { $_.ok -ne $true -and $_.reason -eq 'access-check' })
  if (-not $blocked.Count -or $scan.Data.browser -eq 'edge') { return }
  try { $scanEnd = [DateTimeOffset]::Parse([string]$scan.Data.completedAt) } catch { return }
  if (([DateTimeOffset]::UtcNow - $scanEnd.ToUniversalTime()).TotalHours -gt 3) { return }
  $targets=@(foreach($row in @($scan.Data.results)) {
    [pscustomobject]@{brand=$row.brand;mtm=$row.mtm;category=$row.category;srp=$row.srp;enabled=$true;
      productId=$row.productId;itemId=$row.itemId;vendorItemId=$row.vendorItemId;url=$row.url;
      danawaUrl=$row.danawaUrl;enuriUrl=$row.enuriUrl}
  })
  Write-Host "Chrome access-check on $($blocked.Count) product(s); starting Edge fallback."
}

$edgeCandidates = @(
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
)
$edge = $edgeCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $edge) { throw 'Edge fallback unavailable: Microsoft Edge is not installed.' }
$userData = Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\User Data'
$installedExtensions = @(Get-EdgeScannerInstallations -UserDataPath $userData -ExtensionPath $extensionPath)
if ($installedExtensions.Count -ne 1) {
  throw "Edge fallback requires exactly one eligible C:\MarketPulse\chrome-extension installation in Edge (found $($installedExtensions.Count))."
}
$selected = $installedExtensions[0]
$catalogJson=ConvertTo-Json -InputObject $targets -Depth 5 -Compress
$triggerUrl = "chrome-extension://$($selected.Id)/fallback.html?catalog=$([Uri]::EscapeDataString($catalogJson))"
if ($processExit) {
  $recovery=[pscustomobject]@{runId=$receipt.runId;reason=$receipt.reason;chromeRunId=$receipt.chromeRunId;
    chromeStartedAt=$receipt.chromeStartedAt;triggeredAt=$receipt.triggeredAt}
  $triggerUrl += "&slot=$([Uri]::EscapeDataString($receipt.scanSlot))&recovery=$([Uri]::EscapeDataString(($recovery | ConvertTo-Json -Compress)))"
  # Persist before launch. A later Chrome result must not replace this recovery.
  Write-ScanRecoveryJson $receiptPath $receipt
}
try {
  Start-Process -FilePath $edge -ArgumentList @("--profile-directory=`"$($selected.Profile)`"",'--new-window',$triggerUrl)
  $deadline = [DateTime]::UtcNow.AddMinutes($TimeoutMinutes)
  while ([DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Seconds 15
    if ($processExit) {
      $path=Join-Path $resultFolder "edge-recovery-$($receipt.runId).json"
      $candidateData=Read-ScanRecoveryJson $path
      if (-not $candidateData) { continue }
      Assert-EdgeRecoveryResult -Payload $candidateData -Receipt $receipt -Targets $targets
      # Catalogue edits during recollection must not publish a mixed catalogue.
      $catalog=Read-ScanRecoveryJson (Join-Path $resultFolder 'product-catalog.json')
      Assert-ScanCatalog -Catalog $catalog -Results @($candidateData.results)
      $receipt.state='result-ready'
      Write-ScanRecoveryJson $receiptPath $receipt
      Write-Host "Edge process-exit recovery saved and list-matched: $($candidateData.resultCount) product(s). Publication validation is next."
      return
    }
    $candidate = Get-LatestScan
    if (-not $candidate -or $candidate.Data.browser -ne 'edge') { continue }
    try { $started = [DateTimeOffset]::Parse([string]$candidate.Data.startedAt) } catch { continue }
    if ($started -le $scanEnd) { continue }
    if ($candidate.Data.complete -ne $true -or @($candidate.Data.results | Where-Object { $_.ok -ne $true }).Count -gt 0) {
      throw 'Edge fallback finished with incomplete prices; the existing dashboard is preserved.'
    }
    Assert-ScanCatalog -Catalog ([pscustomobject]@{products=$targets}) -Results @($candidate.Data.results)
    Write-Host "Edge fallback completed: $($candidate.Data.resultCount) product(s)."
    return
  }
  throw 'Edge fallback did not finish before the timeout; the existing dashboard is preserved.'
} catch {
  if ($receipt) {
    $receipt.state='failed'
    $receipt | Add-Member -NotePropertyName failure -NotePropertyValue $_.Exception.Message -Force
    Write-ScanRecoveryJson $receiptPath $receipt
  }
  throw
}
