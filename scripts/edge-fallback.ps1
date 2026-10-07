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
. (Join-Path $PSScriptRoot 'browser-profile.ps1')

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
  Get-BrowserExtensionInstallations $UserDataPath $ExtensionPath
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
  if (-not $blocked.Count -or $scan.Data.browser -ne 'chrome' -or $scan.Data.complete -ne $true) { return }
  try { $scanEnd = [DateTimeOffset]::Parse([string]$scan.Data.completedAt) } catch { return }
  if (([DateTimeOffset]::UtcNow - $scanEnd.ToUniversalTime()).TotalHours -gt 3) { return }
  $targets=@(foreach($row in @($scan.Data.results)) {
    [pscustomobject]@{brand=$row.brand;mtm=$row.mtm;category=$row.category;srp=$row.srp;enabled=$true;
      productId=$row.productId;itemId=$row.itemId;vendorItemId=$row.vendorItemId;url=$row.url;
      danawaUrl=$row.danawaUrl;enuriUrl=$row.enuriUrl}
  })
  if ($scan.Data.runId -notmatch '^[a-f0-9]{32}$' -or $scan.Data.scanSlot -notmatch '^\d{4}-\d{2}-\d{2}T(08|12|16|20):00\+09:00$') { throw 'Chrome access-check recovery needs an identified scheduled scan.' }
  if ([int]$scan.Data.targetCount -ne $targets.Count -or [int]$scan.Data.resultCount -ne $targets.Count) { throw 'Chrome access-check target count is invalid.' }
  $catalog=Read-ScanRecoveryJson (Join-Path $resultFolder 'product-catalog.json')
  Assert-ScanCatalog -Catalog $catalog -Results $targets
  $receipt=[pscustomobject]@{version=1;state='started';scanSlot=$scan.Data.scanSlot;runId=[guid]::NewGuid().ToString('N');
    reason='access-check';chromeRunId=$scan.Data.runId;chromeStartedAt=$scan.Data.startedAt;chromeCompletedAt=$scan.Data.completedAt;
    chromeExtensionVersion=$scan.Data.extensionVersion;triggeredAt=[DateTimeOffset]::UtcNow.ToString('o');
    blockedCount=$blocked.Count;targets=$targets}
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
if ($receipt) {
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
    $path=Join-Path $resultFolder "edge-recovery-$($receipt.runId).json"
    $candidateData=Read-ScanRecoveryJson $path
    if (-not $candidateData) { continue }
    Assert-EdgeRecoveryResult -Payload $candidateData -Receipt $receipt -Targets $targets
    $catalog=Read-ScanRecoveryJson (Join-Path $resultFolder 'product-catalog.json')
    Assert-ScanCatalog -Catalog $catalog -Results @($candidateData.results)
    $receipt.state='result-ready'
    Write-ScanRecoveryJson $receiptPath $receipt
    Write-Host "Edge $($receipt.reason) recovery saved and list-matched: $($candidateData.resultCount) product(s). Publication validation is next."
    # Supplier errors must not turn a valid price recovery into a failed receipt.
    if ($receipt.scanSlot -match 'T08:00\+09:00$') {
      try { & (Join-Path $PSScriptRoot 'supplier-after-edge.ps1') -RepoPath $RepoPath -ResultFolder $resultFolder }
      catch { Write-Warning 'Supplier Hub morning resume failed; inspect supplier-edge-resume.log. Price recovery remains ready.' }
    }
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
