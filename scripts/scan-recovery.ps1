# Shared local recovery validation; no credentials, cookies or partial prices.
function Read-ScanRecoveryJson([string]$Path) {
  if (-not $Path -or -not (Test-Path -LiteralPath $Path)) { return $null }
  try { Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json -ErrorAction Stop } catch { return $null }
}
function Write-ScanRecoveryJson([string]$Path,$Data) {
  New-Item -ItemType Directory -Path (Split-Path $Path) -Force | Out-Null
  $temp=$Path+'.'+[guid]::NewGuid().ToString('N')+'.tmp'
  try {
    $Data | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $temp -Encoding UTF8
    Move-Item -LiteralPath $temp -Destination $Path -Force
  } finally { Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue }
}
function Get-ScanRecoverySlot([DateTimeOffset]$Now=[DateTimeOffset]::UtcNow) {
  $kst=[TimeZoneInfo]::ConvertTime($Now,[TimeZoneInfo]::FindSystemTimeZoneById('Korea Standard Time'))
  $hour=@(8,12,16,20 | Where-Object {$_ -le $kst.Hour} | Select-Object -Last 1)
  if ($hour.Count) { '{0}T{1:00}:00+09:00' -f $kst.ToString('yyyy-MM-dd'),$hour[0] }
}
function Assert-ScanStartWitness($Witness,[string]$Slot,$Catalog) {
  if (-not $Witness -or $Witness.version -ne 1 -or $Witness.browser -ne 'chrome' -or
      $Witness.scanSlot -cne $Slot -or $Witness.runId -notmatch '^[a-f0-9]{32}$') { throw 'Missing or mismatched Chrome start witness.' }
  $slotStart=[DateTimeOffset]::Parse($Slot)
  $start=[DateTimeOffset]::Parse([string]$Witness.startedAt)
  if ($start -lt $slotStart -or $start -gt $slotStart.AddMinutes(75) -or $start -gt [DateTimeOffset]::UtcNow.AddMinutes(2)) { throw 'Chrome start witness is outside this slot.' }
  if (-not $Catalog -or -not $Catalog.PSObject.Properties['products']) { throw 'A saved catalogue is required for process-exit recovery.' }
  $rows=@($Witness.targets)
  if (-not $rows.Count -or $rows.Count -ne [int]$Witness.targetCount) { throw 'Invalid Chrome start target count.' }
  $keys=@($rows | ForEach-Object {"$($_.productId)|$($_.itemId)|$($_.vendorItemId)"})
  if (@($keys | Sort-Object -Unique).Count -ne $rows.Count) { throw 'Duplicate Chrome start targets.' }
  foreach ($row in $rows) {
    if (-not $row.brand -or -not $row.mtm -or $row.productId -notmatch '^\d+$' -or $row.itemId -notmatch '^\d+$' -or $row.vendorItemId -notmatch '^\d+$') { throw 'Invalid Chrome start target identity.' }
    $url=[uri]([string]$row.url)
    if ($url.Scheme -ne 'https' -or $url.Host -ne 'www.coupang.com' -or $url.AbsolutePath -ne "/vp/products/$($row.productId)" -or
      $url.Query -notmatch "(?:\?|&)itemId=$($row.itemId)(?:&|$)" -or $url.Query -notmatch "(?:\?|&)vendorItemId=$($row.vendorItemId)(?:&|$)") { throw 'Invalid Chrome start product URL.' }
  }
  Assert-ScanCatalog -Catalog $Catalog -Results $rows
}
function Test-ChromeExitRecovery($Witness,$Completed,[bool]$ChromeSeen,[int]$AbsentChecks) {
  # Missing JSON alone, a closed window, and an unobserved Chrome launch are not exit proof.
  $finished=$Completed -and $Completed.browser -eq 'chrome' -and $Completed.runId -ceq $Witness.runId -and
    $Completed.scanSlot -ceq $Witness.scanSlot -and $Completed.complete -eq $true
  [bool]($Witness -and $ChromeSeen -and $AbsentChecks -ge 2 -and -not $finished)
}
function Assert-EdgeRecoveryResult($Payload,$Receipt,$Targets) {
  if (-not $Payload -or $Payload.browser -ne 'edge' -or $Payload.complete -ne $true -or
      $Payload.scanSlot -cne $Receipt.scanSlot -or $Payload.runId -cne $Receipt.runId -or
      $Payload.recovery.reason -cne $Receipt.reason -or $Payload.recovery.chromeRunId -cne $Receipt.chromeRunId -or
      [DateTimeOffset]::Parse([string]$Payload.startedAt) -le [DateTimeOffset]::Parse([string]$Receipt.triggeredAt)) { throw 'Invalid or stale Edge recovery result.' }
  $rows=@($Payload.results)
  if ($rows.Count -ne @($Targets).Count -or [int]$Payload.targetCount -ne $rows.Count -or [int]$Payload.resultCount -ne $rows.Count -or
      @($rows | Where-Object { $_.ok -ne $true }).Count) { throw 'Edge recovery collection is incomplete.' }
  Assert-ScanCatalog -Catalog ([pscustomobject]@{products=@($Targets)}) -Results $rows
}
function Get-EdgeRecoveryResultPath([string]$RepoPath,[string]$ResultFolder,[string]$Slot) {
  $receipt=Read-ScanRecoveryJson (Join-Path $RepoPath 'reports\edge-recovery.json')
  if (-not $receipt -or $receipt.scanSlot -cne $Slot) { return $null }
  if ($receipt.state -eq 'failed') { throw 'Edge recovery failed; preserve the previous dashboard and inspect scan-watchdog.log.' }
  if ($receipt.state -eq 'started') { return '' }
  if ($receipt.state -ne 'result-ready' -or $receipt.runId -notmatch '^[a-f0-9]{32}$') { throw 'Invalid Edge recovery receipt.' }
  $path=Get-SavedEdgeRunPath $ResultFolder $receipt.runId
  $payload=Read-ScanRecoveryJson $path
  Assert-EdgeRecoveryResult -Payload $payload -Receipt $receipt -Targets @($receipt.targets)
  return $path
}

function Get-ScanCollectionEvidence($Payload) {
  [pscustomobject]@{browser=[string]$Payload.browser;extensionVersion=[string]$Payload.extensionVersion;
    scanSlot=$Payload.scanSlot;runId=$Payload.runId;startedAt=$Payload.startedAt;completedAt=$Payload.completedAt;
    targetCount=[int]$Payload.targetCount;resultCount=[int]$Payload.resultCount}
}

function Get-SavedChromeResultPath([string]$Folder,[string]$Slot='') {
  foreach ($file in @(Get-ChildItem -LiteralPath $Folder -Filter 'latest-coupang-scan*.json' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTimeUtc -Descending)) {
    $data=Read-ScanRecoveryJson $file.FullName
    if ($data -and $data.browser -eq 'chrome' -and $data.complete -eq $true -and (-not $Slot -or $data.scanSlot -ceq $Slot)) { return $file.FullName }
  }
  return $null
}
function Get-SavedEdgeRunPath([string]$Folder,[string]$RunId) {
  if ($RunId -notmatch '^[a-f0-9]{32}$') { return $null }
  Get-ChildItem -LiteralPath $Folder -Filter "edge-recovery-$RunId*.json" -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -cmatch "^edge-recovery-$RunId(?:-saved)?\.json$" } |
    Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1 -ExpandProperty FullName
}
function Assert-ScanSaveFailure($Failure,[string]$Slot,$Catalog,[DateTimeOffset]$Now=[DateTimeOffset]::UtcNow) {
  if (-not $Failure -or $Failure.version -ne 1 -or $Failure.browser -ne 'chrome' -or
      $Failure.scanSlot -cne $Slot -or $Failure.reason -ne 'file-save-error' -or $Failure.error -ne 'FILE_ACCESS_DENIED' -or
      $Failure.stage -ne 'edge-ready' -or [int]$Failure.chromeRetries -ne 1 -or [int]$Failure.saveAttempts -ne 2 -or
      $Failure.runId -notmatch '^[a-f0-9]{32}$' -or $Slot -notmatch '^\d{4}-\d{2}-\d{2}T(08|12|16|20):00\+09:00$') { throw 'Unconfirmed Chrome save failure.' }
  $slotStart=[DateTimeOffset]::Parse($Slot)
  $first=[DateTimeOffset]::Parse([string]$Failure.firstStartedAt)
  $start=[DateTimeOffset]::Parse([string]$Failure.startedAt)
  $end=[DateTimeOffset]::Parse([string]$Failure.completedAt)
  $deadline=[DateTimeOffset]::Parse([string]$Failure.deadlineAt)
  $next=$slotStart.AddHours($(if($slotStart.Hour -eq 20){12}else{4}))
  if ($first -lt $slotStart -or $start -lt $first -or $end -lt $start -or $end -gt $Now.AddMinutes(1) -or
      $deadline -gt $first.AddHours(2) -or $deadline -gt $next -or $deadline -le $Now) { throw 'Save recovery is stale or outside its budget.' }
  $targets=@($Failure.targets)
  if (-not $targets.Count -or [int]$Failure.targetCount -ne $targets.Count) { throw 'Save recovery target count is invalid.' }
  foreach ($row in $targets) {
    $url=[uri]([string]$row.url)
    if ($row.productId -notmatch '^\d+$' -or $row.itemId -notmatch '^\d+$' -or $row.vendorItemId -notmatch '^\d+$' -or
        $url.Scheme -ne 'https' -or $url.Host -ne 'www.coupang.com' -or $url.AbsolutePath -ne "/vp/products/$($row.productId)" -or
        $url.Query -notmatch "(?:\?|&)itemId=$($row.itemId)(?:&|$)" -or $url.Query -notmatch "(?:\?|&)vendorItemId=$($row.vendorItemId)(?:&|$)") { throw 'Save recovery product URL is invalid.' }
  }
  Assert-ScanCatalog -Catalog $Catalog -Results $targets
}
function Invoke-ScanSaveRecovery([string]$RepoPath,[string]$Folder,[string]$Slot) {
  $failure=$null
  foreach ($file in @(Get-ChildItem -LiteralPath $Folder -Filter 'scan-save-recovery-*.json' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTimeUtc -Descending)) {
    $candidate=Read-ScanRecoveryJson $file.FullName
    if ($candidate.scanSlot -ceq $Slot -and $candidate.stage -eq 'edge-ready') { $failure=$candidate;break }
  }
  if (-not $failure) { return }
  # A completed Chrome file wins before a save-error handoff has started.
  if (Get-SavedChromeResultPath $Folder $Slot) { return }
  $mutex=New-Object Threading.Mutex($false,('Local\MarketPulseSaveHandoff.'+($Slot -replace '[^0-9]','')))
  $held=$false
  try {
    try {$held=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$held=$true}
    if (-not $held) { return }
    $receipt=Read-ScanRecoveryJson (Join-Path $RepoPath 'reports\edge-recovery.json')
    if ($receipt.scanSlot -ceq $Slot) { return }
    $catalog=Read-ScanRecoveryJson (Join-Path $Folder 'product-catalog.json')
    Assert-ScanSaveFailure $failure $Slot $catalog
    $end=[DateTimeOffset]::Parse($failure.deadlineAt)
    if ($env:MARKET_PULSE_UPLOAD_DEADLINE) { $workerEnd=[DateTimeOffset]::Parse($env:MARKET_PULSE_UPLOAD_DEADLINE);if($workerEnd -lt $end){$end=$workerEnd} }
    $minutes=[math]::Min(40,[math]::Floor(($end-[DateTimeOffset]::UtcNow).TotalMinutes))
    if ($minutes -lt 1) { throw 'No time remains for Edge save recovery.' }
    & (Join-Path $PSScriptRoot 'edge-fallback.ps1') -RepoPath $RepoPath -SaveFailure $failure -TimeoutMinutes $minutes
  } finally {if($held){$mutex.ReleaseMutex()};$mutex.Dispose()}
}
