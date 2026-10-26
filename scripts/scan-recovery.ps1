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
function Assert-ScanStartWitness($Witness,[string]$Slot,$Catalog,[string]$Browser='chrome') {
  if (-not $Witness -or $Witness.version -ne 1 -or $Witness.browser -cne $Browser -or
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
  $finished=$Completed -and $Completed.browser -ceq $Witness.browser -and $Completed.runId -ceq $Witness.runId -and
    $Completed.scanSlot -ceq $Witness.scanSlot -and $Completed.complete -eq $true
  [bool]($Witness -and $ChromeSeen -and $AbsentChecks -ge 2 -and -not $finished)
}
function Assert-EdgeRecoveryResult($Payload,$Receipt,$Targets) {
  if (-not $Payload -or $Payload.browser -ne 'edge' -or $Payload.complete -ne $true -or
      $Payload.scanSlot -cne $Receipt.scanSlot -or $Payload.runId -cne $Receipt.runId -or
      $Payload.recovery.reason -cne $Receipt.reason -or $Payload.recovery.chromeRunId -cne $Receipt.chromeRunId -or
      [DateTimeOffset]::Parse([string]$Payload.startedAt) -le [DateTimeOffset]::Parse([string]$Receipt.triggeredAt)) { throw 'Invalid or stale Edge recovery result.' }
  if($Receipt.primaryBrowser -eq 'whale' -and ($Payload.recovery.primaryBrowser -ne 'whale' -or $Payload.recovery.primaryRequestId -cne $Receipt.primaryRequestId)){throw 'Whale recovery context mismatch.'}
  $rows=@($Payload.results)
  if ($rows.Count -ne @($Targets).Count -or [int]$Payload.targetCount -ne $rows.Count -or [int]$Payload.resultCount -ne $rows.Count) { throw 'Edge recovery collection is incomplete.' }
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
    $rows=@($data.results)
    if ($data -and $data.browser -eq 'chrome' -and $data.complete -eq $true -and $data.runId -match '^[a-f0-9]{32}$' -and
        $rows.Count -gt 0 -and [int]$data.targetCount -eq $rows.Count -and [int]$data.resultCount -eq $rows.Count -and
        @($rows | ForEach-Object { [string]$_.itemId } | Sort-Object -Unique).Count -eq $rows.Count -and
        (-not $Slot -or $data.scanSlot -ceq $Slot)) { return $file.FullName }
  }
  return $null
}
function Get-SavedEdgeRunPath([string]$Folder,[string]$RunId) {
  if ($RunId -notmatch '^[a-f0-9]{32}$') { return $null }
  Get-ChildItem -LiteralPath $Folder -Filter "edge-recovery-$RunId*.json" -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -cmatch "^edge-recovery-$RunId(?:-saved)?\.json$" } |
    Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1 -ExpandProperty FullName
}
function Assert-ScanSaveFailure($Failure,[string]$Slot,$Catalog,[DateTimeOffset]$Now=[DateTimeOffset]::UtcNow,[string]$RepoPath='') {
  if (-not $Failure -or $Failure.version -ne 1 -or $Failure.browser -cne (Get-PrimaryScanBrowser $Slot) -or
      $Failure.scanSlot -cne $Slot -or $Failure.reason -ne 'file-save-error' -or $Failure.error -ne 'FILE_ACCESS_DENIED' -or
      $Failure.stage -ne 'edge-ready' -or [int]$Failure.chromeRetries -ne 1 -or [int]$Failure.saveAttempts -ne 2 -or
      $Failure.runId -notmatch '^[a-f0-9]{32}$' -or $Slot -notmatch '^\d{4}-\d{2}-\d{2}T(08|12|16|20):00\+09:00$') { throw 'Unconfirmed Chrome save failure.' }
  if($Failure.browser -eq 'whale') {
    $q=Read-ScanRecoveryJson (Join-Path $RepoPath 'reports\whale-primary-request.json')
    Assert-WhalePrimaryRequest $q $Slot $Catalog $Now
    if($Failure.primaryRequestId -cne $q.requestId){throw 'Mismatched Whale save proof.'}
  }
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
  $completedPath=Get-SavedPrimaryResultPath $Folder $Slot $RepoPath
  if ($completedPath) {
    $completed=Read-ScanRecoveryJson $completedPath
    $catalog=Read-ScanRecoveryJson (Join-Path $Folder 'product-catalog.json')
    try {Assert-ScanCatalog -Catalog $catalog -Results @($completed.results);return}catch{}
  }
  $mutex=New-Object Threading.Mutex($false,('Local\MarketPulseSaveHandoff.'+($Slot -replace '[^0-9]','')))
  $held=$false
  try {
    try {$held=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$held=$true}
    if (-not $held) { return }
    $receipt=Read-ScanRecoveryJson (Join-Path $RepoPath 'reports\edge-recovery.json')
    if ($receipt.scanSlot -ceq $Slot) { return }
    $catalog=Read-ScanRecoveryJson (Join-Path $Folder 'product-catalog.json')
    Assert-ScanSaveFailure $failure $Slot $catalog -RepoPath $RepoPath
    $end=[DateTimeOffset]::Parse($failure.deadlineAt)
    if ($env:MARKET_PULSE_UPLOAD_DEADLINE) { $workerEnd=[DateTimeOffset]::Parse($env:MARKET_PULSE_UPLOAD_DEADLINE);if($workerEnd -lt $end){$end=$workerEnd} }
    $minutes=[math]::Min(40,[math]::Floor(($end-[DateTimeOffset]::UtcNow).TotalMinutes))
    if ($minutes -lt 1) { throw 'No time remains for Edge save recovery.' }
    & (Join-Path $PSScriptRoot 'edge-fallback.ps1') -RepoPath $RepoPath -SaveFailure $failure -TimeoutMinutes $minutes -PrimaryBrowser (Get-PrimaryScanBrowser $Slot)
  } finally {if($held){$mutex.ReleaseMutex()};$mutex.Dispose()}
}

function Get-PrimaryScanBrowser([string]$Slot) {
  if ($Slot -cmatch '^\d{4}-\d{2}-\d{2}T12:00\+09:00$' -and $Slot.Substring(0,10) -cge '2026-10-21') {return 'whale'}
  return 'chrome'
}
function Assert-WhalePrimaryStarted($Accepted,$Witness,$Request,[DateTimeOffset]$LaunchAt,[DateTimeOffset]$Now=[DateTimeOffset]::UtcNow) {
  if($Accepted -and $Accepted.scanSlot -ceq $Request.scanSlot -and $Accepted.requestId -ceq $Request.requestId -and $Accepted.status -eq 'rejected') {throw "Whale primary request rejected: $($Accepted.reason)"}
  $matching=$Witness -and $Witness.scanSlot -ceq $Request.scanSlot -and $Witness.primaryRequestId -ceq $Request.requestId
  if(-not $matching -and ($Now-$LaunchAt).TotalSeconds -ge 120) {throw 'Whale did not save a matching start witness within 120 seconds; transport/start failed; no inferred Edge handoff.'}
}
# Select by event time, never by filesystem write time: a timed-out canonical
# download may finish after a newer unique receipt. Verify files are excluded.
function Get-WhalePrimaryReceipt([string]$Folder,$Request,[DateTimeOffset]$Now=[DateTimeOffset]::UtcNow) {
  if(-not $Request -or $Request.requestId -cnotmatch '^[a-f0-9]{32}$'){return $null}
  $items=@()
  $files=@(Get-ChildItem -LiteralPath $Folder -Filter 'whale-primary-acceptance*.json' -File -ErrorAction SilentlyContinue)
  foreach($file in $files) {
    $unique=$file.Name -cmatch "^whale-primary-acceptance-$($Request.requestId)-([a-f0-9]{32})-([0-9]{6})\.json$"
    $page=$null;$seq=0
    if($unique){$page=$Matches[1];$seq=[int]$Matches[2]}
    elseif($file.Name -cne 'whale-primary-acceptance.json'){continue}
    $data=Read-ScanRecoveryJson $file.FullName
    try {
    if(-not $data -or $data.version -ne 1 -or $data.browser -cne 'whale' -or $data.scanSlot -cne $Request.scanSlot -or
      $data.requestId -cne $Request.requestId -or [int]$data.launchAttempt -ne [int]$Request.launchAttempts){continue}
    if($data.status -cnotin @('accepted','checking','running','stopping','retry-started','complete','edge-ready','state-unavailable','stalled-unconfirmed','deadline-exhausted','rejected')){continue}
      $at=[DateTimeOffset]::Parse([string]$data.at)
      if($at -lt [DateTimeOffset]::Parse([string]$Request.requestedAt) -or $at -gt $Now.AddSeconds(2)){continue}
      if($data.receiptVersion -eq 2 -and ($data.pageId -cnotmatch '^[a-f0-9]{32}$' -or [int]$data.sequence -lt 1 -or [int]$data.sequence -gt 999999)){continue}
      if($unique -and ($data.receiptVersion -ne 2 -or $data.pageId -cne $page -or [int]$data.sequence -ne $seq -or
        $data.receiptDelivery -cne 'unique-fallback' -or [version]$data.receiptProducerVersion -lt [version]'1.9.48')){continue}
    } catch {continue}
    $items+= [pscustomobject]@{at=$at;sequence=if($data.receiptVersion -eq 2){[int]$data.sequence}else{0};data=$data}
  }
  $latest=$items|Sort-Object @{Expression='at';Descending=$true},@{Expression='sequence';Descending=$true}|Select-Object -First 1
  if($latest){return $latest.data};return $null
}
function Get-WhalePrimaryAction($Health,$Witness,$Request,[DateTimeOffset]$LaunchAt,[DateTimeOffset]$Now=[DateTimeOffset]::UtcNow) {
  $same=$Health -and $Health.scanSlot -ceq $Request.scanSlot -and $Health.requestId -ceq $Request.requestId -and [int]$Health.launchAttempt -eq [int]$Request.launchAttempts
  $started=$Witness -and $Witness.scanSlot -ceq $Request.scanSlot -and $Witness.primaryRequestId -ceq $Request.requestId
  if($same) {
    if($Health.status -eq 'edge-ready'){return 'edge'}
    if($Health.status -in @('stalled-unconfirmed','deadline-exhausted')){return 'fail'}
    if($Health.status -eq 'rejected') {
      if($started -and $Health.reason -in @('primary-receipt-save-failed','primary-receipt-save-timeout','primary-receipt-path-mismatch')) {
        if([int]$Request.launchAttempts -lt 2){return 'relaunch'};return 'monitor-degraded'
      }
      if($Health.reason -in @('primary-api-timeout','state-response-missing') -and [int]$Request.launchAttempts -lt 2){return 'relaunch'}
      return 'fail'
    }
  }
  if(-not $started -and ($Now-$LaunchAt).TotalSeconds -ge 120){if([int]$Request.launchAttempts -lt 2){return 'relaunch'};return 'fail'}
  if($started -and ($Now-$LaunchAt).TotalSeconds -ge 180 -and (-not $same -or ($Now-[DateTimeOffset]::Parse([string]$Health.at)).TotalSeconds -gt 180)) {
    if([int]$Request.launchAttempts -lt 2){return 'relaunch'};return 'monitor-degraded'
  }
  return 'wait'
}
function Assert-WhalePrimaryFailure($Failure,[string]$Slot,$Catalog,$Request,[DateTimeOffset]$Now=[DateTimeOffset]::UtcNow) {
  Assert-WhalePrimaryRequest $Request $Slot $Catalog $Now
  if(-not $Failure -or $Failure.version -ne 1 -or $Failure.browser -cne 'whale' -or $Failure.scanSlot -cne $Slot -or $Failure.requestId -cne $Request.requestId -or
    $Failure.status -cne 'edge-ready' -or $Failure.handoff -ne $true -or $Failure.running -ne $false -or $Failure.completed -ne $false -or $Failure.requestExists -ne $true -or
    [int]$Failure.retryCount -ne 1 -or [int]$Failure.targetCount -ne @($Request.targets).Count -or [version]$Failure.workerVersion -lt [version]'1.9.47'){throw 'Unconfirmed Whale worker failure; no Edge handoff.'}
  $at=[DateTimeOffset]::Parse([string]$Failure.at);$end=[DateTimeOffset]::Parse([string]$Failure.deadlineAt)
  $requestAt=[DateTimeOffset]::Parse([string]$Request.requestedAt)
  if($at -lt $requestAt -or $at -gt $Now.AddSeconds(2) -or ($Now-$at).TotalSeconds -gt 180 -or $end -le $Now -or $end -gt $requestAt.AddHours(2) -or $end -gt [DateTimeOffset]::Parse($Slot).AddHours(4)) {throw 'Whale failure evidence is stale or outside the recovery budget.'}
}
function Assert-WhalePrimaryRequest($Request,[string]$Slot,$Catalog,[DateTimeOffset]$Now=[DateTimeOffset]::UtcNow) {
  if ((Get-PrimaryScanBrowser $Slot) -ne 'whale' -or -not $Request -or $Request.version -ne 1 -or $Request.browser -ne 'whale' -or
      $Request.scanSlot -cne $Slot -or $Request.requestId -notmatch '^[a-f0-9]{32}$') {throw 'Invalid Whale noon request.'}
  if(-not $Catalog -or -not $Catalog.PSObject.Properties['products'] -or $null -eq $Catalog.products){throw 'Saved catalog is required for Whale.'}
  $rows=@($Request.targets)
  if(@($rows|Group-Object itemId|Where-Object {$_.Count -gt 1}).Count -or @($rows|Group-Object vendorItemId|Where-Object {$_.Count -gt 1}).Count){throw 'Duplicate Whale targets.'}
  foreach($row in $rows){
    $url=[uri]([string]$row.url)
    if(-not $row.brand -or -not $row.mtm -or $row.productId -notmatch '^\d+$' -or $row.itemId -notmatch '^\d+$' -or $row.vendorItemId -notmatch '^\d+$' -or
       $url.Scheme -ne 'https' -or $url.Host -ne 'www.coupang.com' -or $url.AbsolutePath -ne "/vp/products/$($row.productId)" -or
       $url.Query -notmatch "(?:\?|&)itemId=$($row.itemId)(?:&|$)" -or $url.Query -notmatch "(?:\?|&)vendorItemId=$($row.vendorItemId)(?:&|$)"){throw 'Invalid Whale target identity.'}
  }
  $slotAt=[DateTimeOffset]::Parse($Slot);$requested=[DateTimeOffset]::Parse([string]$Request.requestedAt)
  if ($requested -lt $slotAt -or $requested -gt $slotAt.AddMinutes(75) -or $requested -gt $Now.AddMinutes(2)) {throw 'Whale request is outside its slot.'}
  Assert-ScanCatalog -Catalog $Catalog -Results @($Request.targets)
}
function Get-SavedPrimaryResultPath([string]$Folder,[string]$Slot,[string]$RepoPath,[DateTimeOffset]$Now=[DateTimeOffset]::UtcNow) {
  if ((Get-PrimaryScanBrowser $Slot) -ne 'whale') {return Get-SavedChromeResultPath $Folder $Slot}
  $request=Read-ScanRecoveryJson (Join-Path $RepoPath 'reports\whale-primary-request.json')
  if (-not $request -or $request.scanSlot -cne $Slot) {return $null}
  $catalog=Read-ScanRecoveryJson (Join-Path $Folder 'product-catalog.json')
  Assert-WhalePrimaryRequest $request $Slot $catalog $Now
  foreach($file in @(Get-ChildItem -LiteralPath $Folder -Filter 'whale-scan-*.json' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTimeUtc -Descending)) {
    if ($file.Name -cnotmatch '^whale-scan-[a-f0-9]{32}(?:-saved)?\.json$') {continue}
    $data=Read-ScanRecoveryJson $file.FullName
    if (-not $data -or $data.browser -ne 'whale' -or $data.scanSlot -cne $Slot -or $data.primaryRequestId -cne $request.requestId) {continue}
    if ($data.complete -ne $true -or $data.runId -notmatch '^[a-f0-9]{32}$' -or $file.Name -cnotmatch "^whale-scan-$($data.runId)(?:-saved)?\.json$" -or [version]$data.extensionVersion -lt [version]'1.9.44' -or
        [int]$data.targetCount -ne @($data.results).Count -or [int]$data.resultCount -ne @($data.results).Count -or
        [DateTimeOffset]::Parse($data.startedAt) -lt [DateTimeOffset]::Parse($request.requestedAt) -or
        [DateTimeOffset]::Parse($data.completedAt) -lt [DateTimeOffset]::Parse($data.startedAt) -or
        [DateTimeOffset]::Parse($data.completedAt) -gt $Now.AddMinutes(2) -or
        [DateTimeOffset]::Parse($data.completedAt) -ge [DateTimeOffset]::Parse($Slot).AddHours(4)) {throw 'Invalid Whale production result.'}
    Assert-ScanCatalog -Catalog ([pscustomobject]@{products=@($request.targets)}) -Results @($data.results)
    Assert-ScanCatalog -Catalog $catalog -Results @($data.results)
    return $file.FullName
  }
  return $null
}
function Assert-PrimaryScanSource($Payload,[string]$Slot,[string]$Folder,[string]$RepoPath) {
  $expected=Get-PrimaryScanBrowser $Slot
  if ($Payload.browser -eq 'edge') {
    $r=Read-ScanRecoveryJson (Join-Path $RepoPath 'reports\edge-recovery.json')
    if($expected -eq 'whale') {
      $q=Read-ScanRecoveryJson (Join-Path $RepoPath 'reports\whale-primary-request.json')
      Assert-WhalePrimaryRequest $q $Slot (Read-ScanRecoveryJson (Join-Path $Folder 'product-catalog.json'))
      if($r.primaryBrowser -ne 'whale' -or $r.primaryRequestId -cne $q.requestId -or $Payload.recovery.primaryBrowser -ne 'whale' -or
         $Payload.recovery.primaryRequestId -cne $q.requestId) {throw 'Edge receipt does not belong to this Whale noon request.'}
    } elseif($r.primaryBrowser -eq 'whale' -or $Payload.recovery.primaryBrowser -eq 'whale') {throw 'Whale recovery is not allowed in a Chrome slot.'}
    return
  }
  if($Payload.browser -cne $expected) {throw 'Unexpected production browser for this slot.'}
  if($expected -eq 'whale') {
    $selected=Read-ScanRecoveryJson (Get-SavedPrimaryResultPath $Folder $Slot $RepoPath)
    if(-not $selected -or $Payload.runId -cne $selected.runId -or $Payload.primaryRequestId -cne $selected.primaryRequestId){throw 'Whale result is not backed by the scheduled request.'}
  }
}
