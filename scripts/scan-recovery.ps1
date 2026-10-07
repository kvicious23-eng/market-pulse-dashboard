# Shared local recovery validation; no credentials, cookies or partial prices.
function Read-ScanRecoveryJson([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
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
  $path=Join-Path $ResultFolder ("edge-recovery-$($receipt.runId).json")
  $payload=Read-ScanRecoveryJson $path
  Assert-EdgeRecoveryResult -Payload $payload -Receipt $receipt -Targets @($receipt.targets)
  return $path
}

function Get-ScanCollectionEvidence($Payload) {
  [pscustomobject]@{browser=[string]$Payload.browser;extensionVersion=[string]$Payload.extensionVersion;
    scanSlot=$Payload.scanSlot;runId=$Payload.runId;startedAt=$Payload.startedAt;completedAt=$Payload.completedAt;
    targetCount=[int]$Payload.targetCount;resultCount=[int]$Payload.resultCount}
}
