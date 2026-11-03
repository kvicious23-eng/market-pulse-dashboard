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
function Assert-ScanStartWitness($Witness,[string]$Slot,$Catalog,[string]$Browser='chrome',[string]$LatestStart='',[switch]$AllowEmpty) {
  if (-not $Witness -or $Witness.version -ne 1 -or $Witness.browser -cne $Browser -or
      $Witness.scanSlot -cne $Slot -or $Witness.runId -notmatch '^[a-f0-9]{32}$') { throw 'Missing or mismatched Chrome start witness.' }
  if($Browser -eq 'whale' -and $Slot -cge '2026-10-26T20:00+09:00' -and ($Witness.policyId -cne (Get-ScanSlotPolicy $Slot).id -or [version]$Witness.extensionVersion -lt [version]'1.9.49')){throw 'Whale start policy/version mismatch.'}
  $slotStart=[DateTimeOffset]::Parse($Slot)
  $start=[DateTimeOffset]::Parse([string]$Witness.startedAt)
  if ($start -lt $slotStart -or $start -gt $(if($LatestStart){[DateTimeOffset]::Parse($LatestStart)}else{$slotStart.AddMinutes(75)}) -or $start -gt [DateTimeOffset]::UtcNow.AddMinutes(2)) { throw 'Chrome start witness is outside this slot.' }
  if (-not $Catalog -or -not $Catalog.PSObject.Properties['products']) { throw 'A saved catalogue is required for process-exit recovery.' }
  $rows=@($Witness.targets)
  if ((-not $rows.Count -and -not($AllowEmpty -and $Catalog.products -is [array] -and @($Catalog.products|Where-Object {$_.enabled -ne $false}).Count -eq 0)) -or $rows.Count -ne [int]$Witness.targetCount) { throw 'Invalid Chrome start target count.' }
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
function Assert-AccessStop($Stop,[string]$Slot,$Catalog,$Witness,[string]$RepoPath,[DateTimeOffset]$Now=[DateTimeOffset]::UtcNow) {
  $browser=Get-PrimaryScanBrowser $Slot
  if(-not $Stop -or $Stop.version -ne 1 -or $Stop.browser -cne $browser -or
      $Stop.scanSlot -cne $Slot -or $Stop.runId -notmatch '^[a-f0-9]{32}$' -or
      $Stop.terminal -ne $true -or $Stop.complete -ne $false -or $Stop.reason -cne 'access-check' -or
      $Stop.stopReason -cne 'http-403-access-denied' -or [version]$Stop.extensionVersion -lt [version]'1.9.55' -or
      $Stop.policyId -cne (Get-ScanSlotPolicy $Slot).id) {throw 'Unconfirmed primary access stop.'}
  if(Get-CommonProtocolId $Slot){Assert-CommonWitness $Witness (Read-CommonRequest $RepoPath $Slot) $Catalog}else{Assert-ScanStartWitness $Witness $Slot $Catalog $browser}
  if($Stop.runId -cne $Witness.runId -or $Stop.startedAt -cne $Witness.startedAt -or
      $Stop.extensionVersion -cne $Witness.extensionVersion -or $Stop.deadlineAt -cne $Witness.deadlineAt) {throw 'Access stop witness mismatch.'}
  $start=[DateTimeOffset]::Parse($Stop.startedAt);$end=[DateTimeOffset]::Parse($Stop.stoppedAt)
  $deadline=[DateTimeOffset]::Parse($Stop.deadlineAt);$slotStart=[DateTimeOffset]::Parse($Slot)
  $observed=[DateTimeOffset]::Parse($Stop.attempt.diagnostic.observedAt)
  $next=$slotStart.AddHours($(if($slotStart.Hour -eq 20){12}else{4}))
  if($end -lt $start -or $observed -lt $start -or $observed -gt $end -or $end -gt $Now.AddSeconds(5) -or
      $deadline -le $Now -or $end -gt $deadline -or $deadline -gt $start.AddHours(2) -or
      $deadline -gt $slotStart.AddMinutes(140) -or $deadline -gt $next) {throw 'Access stop is stale or outside its original budget.'}
  $targets=@($Stop.targets)
  if(-not $targets.Count -or $Stop.targetCount -ne $targets.Count -or $Stop.attemptedCount -lt 1 -or
      $Stop.attemptedCount -gt $targets.Count) {throw 'Access stop target count mismatch.'}
  Assert-ScanCatalog -Catalog $Catalog -Results $targets
  Assert-ScanCatalog -Catalog ([pscustomobject]@{products=@($Witness.targets)}) -Results $targets
  $trigger=@($targets|Where-Object {$_.brand -ceq $Stop.trigger.brand -and $_.mtm -ceq $Stop.trigger.mtm -and
    $_.productId -ceq $Stop.trigger.productId -and $_.itemId -ceq $Stop.trigger.itemId -and $_.vendorItemId -ceq $Stop.trigger.vendorItemId})
  $d=$Stop.attempt.diagnostic
  $responses=@($d.responses|Where-Object {$_.route -ceq 'product' -and $_.event -ceq 'complete'})
  $status=if($responses.Count){$responses[-1].status}else{$d.page.navigationStatus}
  if($trigger.Count -ne 1 -or $Stop.attempt.reason -cne 'access-check' -or $status -ne 403 -or
      $d.page.marker -cne 'access denied') {throw 'Access stop lacks a matching HTTP 403 and Access Denied page.'}
  if(Get-CommonProtocolId $Slot) {
    $q=Read-CommonRequest $RepoPath $Slot;Assert-CommonRequest $q $Slot $Catalog $Now;Assert-CommonWitness $Witness $q $Catalog
    if($Stop.primaryRequestId -cne $q.requestId -or $Stop.primaryProtocolId -cne $q.primaryProtocolId -or $deadline -gt (Get-CommonDeadline $q)){throw 'Common stop request mismatch'}
  }
  if($browser -eq 'whale') {
    $q=Read-WhalePrimaryRequest $RepoPath $Slot
    Assert-WhalePrimaryRequest $q $Slot $Catalog $Now
    if($Stop.primaryRequestId -cne $q.requestId -or $Witness.primaryRequestId -cne $q.requestId -or
        $deadline -gt (Get-WhaleDeadline $q)) {throw 'Access stop Whale request mismatch.'}
  }
}
function Invoke-AccessStopRecovery([string]$RepoPath,[string]$Folder,[string]$Slot) {
  $existing=Read-ScanRecoveryJson (Get-EdgeReceiptPath $RepoPath $Slot)
  if($existing -and $existing.scanSlot -ceq $Slot){return}
  $browser=Get-PrimaryScanBrowser $Slot
  $q=if($browser -eq 'whale'){Read-WhalePrimaryRequest $RepoPath $Slot}else{$null}
  if($browser -eq 'whale' -and -not $q){return}
  $w=if(Get-CommonProtocolId $Slot){Get-CommonStartWitness $Folder (Read-CommonRequest $RepoPath $Slot)}elseif($browser -eq 'whale'){Get-WhaleStartWitness $Folder $q}else{Read-ScanRecoveryJson (Join-Path $Folder 'scan-start.json')}
  if(-not $w -or $w.scanSlot -cne $Slot -or $w.runId -notmatch '^[a-f0-9]{32}$'){return}
  $stop=$null
  foreach($suffix in @('','-saved')) {
    $path=Join-Path $Folder ("access-stop-$($w.runId)$suffix.json")
    if(Test-Path -LiteralPath $path) {
      $candidate=Read-ScanRecoveryJson $path
      if(-not $candidate){throw 'Unreadable access stop proof; no inferred handoff.'}
      if($stop -and ($stop|ConvertTo-Json -Depth 20 -Compress) -cne ($candidate|ConvertTo-Json -Depth 20 -Compress)){throw 'Conflicting access stop proofs; no handoff.'}
      $stop=$candidate
    }
  }
  if(-not $stop){return}
  $catalog=Read-ScanRecoveryJson (Join-Path $Folder 'product-catalog.json')
  Assert-AccessStop $stop $Slot $catalog $w $RepoPath
  & (Join-Path $PSScriptRoot 'edge-fallback.ps1') -RepoPath $RepoPath -AccessStop $stop -PrimaryBrowser $browser
}
function Assert-EdgeRecoveryResult($Payload,$Receipt,$Targets) {
  if (-not $Payload -or $Payload.browser -ne 'edge' -or $Payload.complete -ne $true -or
      $Payload.scanSlot -cne $Receipt.scanSlot -or $Payload.runId -cne $Receipt.runId -or
      $Payload.recovery.reason -cne $Receipt.reason -or $Payload.recovery.chromeRunId -cne $Receipt.chromeRunId -or
      [DateTimeOffset]::Parse([string]$Payload.startedAt) -le [DateTimeOffset]::Parse([string]$Receipt.triggeredAt)) { throw 'Invalid or stale Edge recovery result.' }
  if($Receipt.primaryBrowser -eq 'whale' -and ($Payload.recovery.primaryBrowser -ne 'whale' -or $Payload.recovery.primaryRequestId -cne $Receipt.primaryRequestId)){throw 'Whale recovery context mismatch.'}
  if($Receipt.primaryBrowser -eq 'whale' -and $Receipt.scanSlot -cge '2026-10-26T20:00+09:00') {
    if($Payload.recovery.policyId -cne $Receipt.policyId -or $Payload.recovery.deadlineAt -cne $Receipt.deadlineAt -or
      [DateTimeOffset]::Parse([string]$Payload.completedAt) -gt [DateTimeOffset]::Parse([string]$Receipt.deadlineAt)){throw 'Edge routing policy/budget mismatch.'}
  }
  if($Receipt.deadlineAt -and ($Payload.recovery.deadlineAt -cne $Receipt.deadlineAt -or [DateTimeOffset]::Parse([string]$Payload.completedAt) -gt [DateTimeOffset]::Parse([string]$Receipt.deadlineAt))){throw 'Edge completed outside its original collection budget.'}
  if($Receipt.primaryProtocolId){
    if($Payload.version -ne 5 -or [version]$Payload.extensionVersion -lt [version]'1.9.62' -or
      [math]::Abs(([DateTimeOffset]::Parse($Payload.scannedAt)-[DateTimeOffset]::Parse($Payload.completedAt)).TotalSeconds) -gt 1 -or $Payload.policyId -cne $Receipt.policyId -or $Payload.recovery.policyId -cne $Receipt.policyId -or
      $Payload.recovery.primaryProtocolId -cne $Receipt.primaryProtocolId -or $Payload.recovery.primaryBrowser -cne $Receipt.primaryBrowser -or
      $Payload.recovery.primaryRequestId -cne $Receipt.primaryRequestId -or
      [DateTimeOffset]::Parse($Payload.completedAt) -lt [DateTimeOffset]::Parse($Payload.startedAt) -or
      [DateTimeOffset]::Parse($Payload.completedAt) -gt [DateTimeOffset]::UtcNow.AddMinutes(2)){throw 'Common Edge provenance/time mismatch'}
  }
  $rows=@($Payload.results)
  if ($rows.Count -ne @($Targets).Count -or [int]$Payload.targetCount -ne $rows.Count -or [int]$Payload.resultCount -ne $rows.Count) { throw 'Edge recovery collection is incomplete.' }
  Assert-ScanCatalog -Catalog ([pscustomobject]@{products=@($Targets)}) -Results $rows
}
function Get-EdgeRecoveryResultPath([string]$RepoPath,[string]$ResultFolder,[string]$Slot) {
  $receipt=Read-EdgeOwnership $RepoPath $Slot
  if (-not $receipt -or $receipt.scanSlot -cne $Slot) { return $null }
  $common=Get-CommonProtocolId $Slot
  if($common -and ($receipt.state -eq 'started' -or ($receipt.state -eq 'failed' -and $receipt.failureKind -eq 'monitor-timeout'))){
    $path=Get-SavedEdgeRunPath $ResultFolder $receipt.runId
    $payload=Read-ScanRecoveryJson $path
    if($payload){
      Assert-EdgeRecoveryResult $payload $receipt @($receipt.targets)
      Assert-PrimaryScanSource $payload $Slot $ResultFolder $RepoPath
      # Reconcile an interrupted monitor without launching a second collector.
      $mutex=New-Object Threading.Mutex($false,('Local\MarketPulseEdgeHandoff.'+($Slot -replace '[^0-9]','')));$held=$false
      try{
        try{$held=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$held=$true}
        if($held){
          $latest=Read-EdgeOwnership $RepoPath $Slot
          if($latest.runId -cne $receipt.runId -or $latest.primaryRequestId -cne $receipt.primaryRequestId -or $latest.deadlineAt -cne $receipt.deadlineAt){throw 'Edge ownership changed during reconciliation'}
          if($latest.state -eq 'failed' -and $latest.failureKind -ne 'monitor-timeout'){throw 'Edge integrity failure appeared during reconciliation'}
          $latest|Add-Member reconciledFrom $latest.state -Force
          $latest|Add-Member reconciledAt ([DateTimeOffset]::UtcNow.ToString('o')) -Force
          $latest.state='result-ready';Write-ScanRecoveryJson (Get-EdgeReceiptPath $RepoPath $Slot) $latest
        }
      }finally{if($held){$mutex.ReleaseMutex()};$mutex.Dispose()}
      return $path
    }
    if($receipt.state -eq 'started' -or [DateTimeOffset]::UtcNow -lt ([DateTimeOffset]::Parse($receipt.deadlineAt)).AddSeconds(30)){return ''}
  }
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
    scanSlot=$Payload.scanSlot;policyId=$Payload.policyId;runId=$Payload.runId;startedAt=$Payload.startedAt;completedAt=$Payload.completedAt;
    targetCount=[int]$Payload.targetCount;resultCount=[int]$Payload.resultCount}
}

function Get-SavedChromeResultPath([string]$Folder,[string]$Slot='') {
  $catalog=Read-ScanRecoveryJson (Join-Path $Folder 'product-catalog.json')
  $emptyConfirmed=$catalog -and $catalog.products -is [array] -and @($catalog.products|Where-Object {$_.enabled -ne $false}).Count -eq 0
  foreach ($file in @(Get-ChildItem -LiteralPath $Folder -Filter 'latest-coupang-scan*.json' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTimeUtc -Descending)) {
    $data=Read-ScanRecoveryJson $file.FullName
    $rows=@($data.results)
    if ($data -and $data.browser -eq 'chrome' -and $data.complete -eq $true -and $data.runId -match '^[a-f0-9]{32}$' -and
        ($rows.Count -gt 0 -or $emptyConfirmed) -and [int]$data.targetCount -eq $rows.Count -and [int]$data.resultCount -eq $rows.Count -and
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
  if(Get-CommonProtocolId $Slot) {
    $q=Read-CommonRequest $RepoPath $Slot;Assert-CommonRequest $q $Slot $Catalog $Now
    if($Failure.primaryRequestId -cne $q.requestId -or [DateTimeOffset]::Parse($Failure.deadlineAt) -gt (Get-CommonDeadline $q)){throw 'Common save proof mismatch'}
  }
  if($Failure.browser -eq 'whale') {
    $q=Read-WhalePrimaryRequest $RepoPath $Slot
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
    $receipt=Read-ScanRecoveryJson (Get-EdgeReceiptPath $RepoPath $Slot)
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

function Get-ScanSlotPolicy([string]$Slot) {
  if($Slot -cnotmatch '^\d{4}-\d{2}-\d{2}T(08|12|16|20):00\+09:00$'){throw 'Invalid scan slot.'}
  $at=[DateTimeOffset]::ParseExact($Slot,'yyyy-MM-ddTHH:mmzzz',[Globalization.CultureInfo]::InvariantCulture)
  $source=Get-Content -LiteralPath (Join-Path $PSScriptRoot '..\chrome-extension\scan-policy.js') -Raw -Encoding UTF8
  if($source -cnotmatch '(?s)/\* ROUTING_JSON_BEGIN \*/(.*?)/\* ROUTING_JSON_END \*/'){throw 'Routing policy is missing.'}
  $policy=$Matches[1]|ConvertFrom-Json -ErrorAction Stop
  if($policy.version -ne 1 -or ($policy.slots -join ',') -cne '08:00,12:00,16:00,20:00'){throw 'Invalid routing policy.'}
  $selected=$null;$previous=''
  foreach($row in $policy.changes) {
    if($row.from -cle $previous -or -not $row.id -or @($row.owners).Count -ne 4 -or @($row.owners|Where-Object {$_ -cnotin @('chrome','whale')}).Count){throw 'Invalid routing policy.'}
    $previous=$row.from;if($row.from -cle $Slot){$selected=$row}
  }
  if(-not $selected){throw 'Missing routing policy.'}
  [pscustomobject]@{id=$selected.id;browser=$selected.owners[[array]::IndexOf($policy.slots,$Slot.Substring(11,5))]}
}
function Get-PrimaryScanBrowser([string]$Slot) {if(-not $Slot){return 'chrome'};(Get-ScanSlotPolicy $Slot).browser}
function Get-ScanSlotKey([string]$Slot) {Get-ScanSlotPolicy $Slot|Out-Null;$Slot.Substring(0,16) -replace '[^0-9]',''}
function Get-NextScanTime([string]$Slot) {Get-ScanSlotPolicy $Slot|Out-Null;([DateTimeOffset]::Parse($Slot)).AddHours($(if($Slot.Substring(11,2) -eq '20'){12}else{4}))}
function Get-WhaleDeadline($Request) {
  $deadline=[DateTimeOffset]::Parse($Request.requestedAt).AddHours(2)
  $next=Get-NextScanTime $Request.scanSlot;if($deadline -gt $next){$deadline=$next}
  $cap=[DateTimeOffset]::Parse($Request.scanSlot).AddMinutes(140);if($deadline -gt $cap){$deadline=$cap}
  return $deadline
}
function Get-WhaleRequestPath([string]$RepoPath,[string]$Slot) {Join-Path $RepoPath ('reports\whale-primary-request-'+(Get-ScanSlotKey $Slot)+'.json')}
function Read-WhalePrimaryRequest([string]$RepoPath,[string]$Slot) {
  if(Get-CommonProtocolId $Slot){return Read-CommonRequest $RepoPath $Slot}
  $data=Read-ScanRecoveryJson (Get-WhaleRequestPath $RepoPath $Slot)
  if(-not $data -and $Slot -clt '2026-10-26T20:00+09:00'){$data=Read-ScanRecoveryJson (Join-Path $RepoPath 'reports\whale-primary-request.json')}
  if($data -and $data.scanSlot -ceq $Slot){return $data};return $null
}
function Get-WhaleStartWitness([string]$Folder,$Request) {
  if(Get-CommonProtocolId $Request.scanSlot){return Get-CommonStartWitness $Folder $Request}
  $name='whale-scan-start-'+(Get-ScanSlotKey $Request.scanSlot)+'-'+$Request.requestId+'.json'
  $data=Read-ScanRecoveryJson (Join-Path $Folder $name)
  if(-not $data -and $Request.scanSlot -clt '2026-10-26T20:00+09:00'){$data=Read-ScanRecoveryJson (Join-Path $Folder 'whale-scan-start.json')}
  if($data -and $data.scanSlot -ceq $Request.scanSlot -and $data.primaryRequestId -ceq $Request.requestId){return $data};return $null
}
function Get-EdgeReceiptPath([string]$RepoPath,[string]$Slot) {
  if(Get-CommonProtocolId $Slot){return Join-Path $RepoPath ('reports\edge-recovery-'+(Get-ScanSlotKey $Slot)+'.json')}
  if($Slot -cge '2026-10-26T20:00+09:00' -and (Get-PrimaryScanBrowser $Slot) -eq 'whale'){return Join-Path $RepoPath ('reports\edge-recovery-'+(Get-ScanSlotKey $Slot)+'.json')}
  Join-Path $RepoPath 'reports\edge-recovery.json'
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
  $base='whale-primary-acceptance-'+(Get-ScanSlotKey $Request.scanSlot)+'-'+$Request.requestId
  $bases=@($base);if($Request.scanSlot -clt '2026-10-26T20:00+09:00'){$bases+='whale-primary-acceptance'}
  $files=@(foreach($prefix in $bases){Get-ChildItem -LiteralPath $Folder -Filter ($prefix+'*.json') -File -ErrorAction SilentlyContinue})|Sort-Object FullName -Unique
  foreach($file in $files) {
    $escaped=[regex]::Escape($base)
    $unique=$file.Name -cmatch "^$escaped-([a-f0-9]{32})-([0-9]{6})\.json$"
    if(-not $unique -and $Request.scanSlot -clt '2026-10-26T20:00+09:00'){$unique=$file.Name -cmatch "^whale-primary-acceptance-$($Request.requestId)-([a-f0-9]{32})-([0-9]{6})\.json$"}
    $page=$null;$seq=0
    if($unique){$page=$Matches[1];$seq=[int]$Matches[2]}
    elseif($file.Name -cne ($base+'.json') -and ($Request.scanSlot -cge '2026-10-26T20:00+09:00' -or $file.Name -cne 'whale-primary-acceptance.json')){continue}
    $data=Read-ScanRecoveryJson $file.FullName
    try {
    if(-not $data -or $data.version -ne 1 -or $data.browser -cne 'whale' -or $data.scanSlot -cne $Request.scanSlot -or
      $data.requestId -cne $Request.requestId -or ($Request.scanSlot -cge '2026-10-26T20:00+09:00' -and $data.policyId -cne $Request.policyId) -or [int]$data.launchAttempt -ne [int]$Request.launchAttempts){continue}
    if($data.status -cnotin @('accepted','checking','running','stopping','retry-started','complete','access-stopped','edge-ready','state-unavailable','stalled-unconfirmed','deadline-exhausted','rejected')){continue}
      if($Request.scanSlot -cge '2026-10-26T20:00+09:00' -and ($data.receiptVersion -ne 2 -or [version]$data.receiptProducerVersion -lt [version]'1.9.49')){continue}
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
  # This status freezes Whale, but only the separately validated 403 stop proof
  # authorizes Edge. A missing/unwritten proof must not trigger a generic retry.
  $same=$Health -and $Health.scanSlot -ceq $Request.scanSlot -and $Health.requestId -ceq $Request.requestId -and [int]$Health.launchAttempt -eq [int]$Request.launchAttempts
  $started=$Witness -and $Witness.scanSlot -ceq $Request.scanSlot -and $Witness.primaryRequestId -ceq $Request.requestId
  if($same) {
    if($Health.status -eq 'access-stopped'){return 'wait'}
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
    ($Slot -cge '2026-10-26T20:00+09:00' -and ($Failure.policyId -cne $Request.policyId -or [version]$Failure.workerVersion -lt [version]'1.9.49')) -or [int]$Failure.retryCount -ne 1 -or [int]$Failure.targetCount -ne @($Request.targets).Count -or [version]$Failure.workerVersion -lt [version]'1.9.47'){throw 'Unconfirmed Whale worker failure; no Edge handoff.'}
  $at=[DateTimeOffset]::Parse([string]$Failure.at);$end=[DateTimeOffset]::Parse([string]$Failure.deadlineAt)
  $requestAt=[DateTimeOffset]::Parse([string]$Request.requestedAt)
  if($at -lt $requestAt -or $at -gt $Now.AddSeconds(2) -or ($Now-$at).TotalSeconds -gt 180 -or $end -le $Now -or $end -gt (Get-WhaleDeadline $Request)) {throw 'Whale failure evidence is stale or outside the recovery budget.'}
}
function Assert-WhalePrimaryRequest($Request,[string]$Slot,$Catalog,[DateTimeOffset]$Now=[DateTimeOffset]::UtcNow) {
  if(Get-CommonProtocolId $Slot){Assert-CommonRequest $Request $Slot $Catalog $Now;return}
  if ((Get-PrimaryScanBrowser $Slot) -ne 'whale' -or -not $Request -or $Request.version -ne 1 -or $Request.browser -ne 'whale' -or
      $Request.scanSlot -cne $Slot -or ($Slot -cge '2026-10-26T20:00+09:00' -and $Request.policyId -cne (Get-ScanSlotPolicy $Slot).id) -or $Request.requestId -notmatch '^[a-f0-9]{32}$') {throw 'Invalid Whale noon request.'}
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
  if(Get-CommonProtocolId $Slot){return Get-CommonSavedResult $Folder $Slot $RepoPath $Now}
  if ((Get-PrimaryScanBrowser $Slot) -ne 'whale') {return Get-SavedChromeResultPath $Folder $Slot}
  $request=Read-WhalePrimaryRequest $RepoPath $Slot
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
        [DateTimeOffset]::Parse($data.completedAt) -ge (Get-NextScanTime $Slot)) {throw 'Invalid Whale production result.'}
    if($Slot -cge '2026-10-26T20:00+09:00' -and ($data.policyId -cne $request.policyId -or [version]$data.extensionVersion -lt [version]'1.9.49')){throw 'Whale result routing policy/version mismatch.'}
    Assert-ScanCatalog -Catalog ([pscustomobject]@{products=@($request.targets)}) -Results @($data.results)
    Assert-ScanCatalog -Catalog $catalog -Results @($data.results)
    return $file.FullName
  }
  return $null
}
function Assert-PrimaryScanSource($Payload,[string]$Slot,[string]$Folder,[string]$RepoPath) {
  if($Payload.browser -eq 'mixed'){Assert-ModelEdgeComposite $Payload $Slot $Folder $RepoPath;return}
  if($Payload.recovery.scope -eq 'models'){throw 'A subset Edge result cannot be published directly.'}
  $expected=Get-PrimaryScanBrowser $Slot
  if(Get-CommonProtocolId $Slot){
    $q=Read-CommonRequest $RepoPath $Slot;$catalog=Read-ScanRecoveryJson (Join-Path $Folder 'product-catalog.json');Assert-CommonRequest $q $Slot $catalog
    if($Payload.browser -eq 'edge'){
      $r=Read-EdgeOwnership $RepoPath $Slot
      if($r.primaryBrowser -cne $q.browser -or $r.policyId -cne $q.policyId -or [DateTimeOffset]::Parse($r.deadlineAt) -ne (Get-CommonDeadline $q)){throw 'Common Edge request budget/owner mismatch'}
      if($r.primaryRequestId -cne $q.requestId -or $r.primaryProtocolId -cne $q.primaryProtocolId -or $Payload.recovery.primaryRequestId -cne $q.requestId -or $Payload.recovery.primaryProtocolId -cne $q.primaryProtocolId){throw 'Unbound common Edge source'}
      Assert-EdgeRecoveryResult $Payload $r @($q.targets);return
    }
    $selected=Read-ScanRecoveryJson (Get-CommonSavedResult $Folder $Slot $RepoPath)
    Assert-CommonPayload $Payload $q (Get-CommonStartWitness $Folder $q) $catalog
    if(-not $selected -or ($Payload|ConvertTo-Json -Depth 40 -Compress) -cne ($selected|ConvertTo-Json -Depth 40 -Compress)){throw 'Unbound or altered common production source'};return
  }
  if ($Payload.browser -eq 'edge') {
    $r=Read-ScanRecoveryJson (Get-EdgeReceiptPath $RepoPath $Slot)
    if($expected -eq 'whale') {
      $q=Read-WhalePrimaryRequest $RepoPath $Slot
      Assert-WhalePrimaryRequest $q $Slot (Read-ScanRecoveryJson (Join-Path $Folder 'product-catalog.json'))
      if($Slot -cge '2026-10-26T20:00+09:00' -and ($r.policyId -cne $q.policyId -or [DateTimeOffset]::Parse([string]$r.deadlineAt) -gt (Get-WhaleDeadline $q))){throw 'Edge request budget/policy mismatch.'}
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

function Assert-ChromeWorkerFailure($Failure,[string]$Slot,$Catalog,$Witness,[DateTimeOffset]$Now=[DateTimeOffset]::UtcNow) {
  Assert-ScanStartWitness $Witness $Slot $Catalog 'chrome'
  if((Get-PrimaryScanBrowser $Slot) -cne 'chrome' -or -not $Failure -or $Failure.version -ne 1 -or
    $Failure.browser -cne 'chrome' -or $Failure.status -cne 'interrupted' -or $Failure.reason -cne 'chrome-worker-interrupted' -or
    $Failure.running -ne $false -or $Failure.primaryFrozen -ne $true -or $Failure.nonce -notmatch '^[a-f0-9]{32}$' -or
    $Failure.scanSlot -cne $Slot -or $Failure.runId -cne $Witness.runId -or
    $Failure.startedAt -cne $Witness.startedAt -or $Failure.deadlineAt -cne $Witness.deadlineAt -or
    [version]$Failure.workerVersion -lt [version]'1.9.59' -or [version]$Witness.extensionVersion -gt [version]$Failure.workerVersion -or
    $Failure.total -ne $Witness.targetCount -or $Failure.completed -lt 0 -or $Failure.completed -gt $Failure.total) {throw 'Unconfirmed Chrome worker interruption.'}
  if(($Failure.completed -isnot [int] -and $Failure.completed -isnot [long]) -or
     ($Failure.total -isnot [int] -and $Failure.total -isnot [long]) -or
     ([version]$Failure.workerVersion -ge [version]'1.9.60' -and (-not $Failure.stage -or $Failure.stage -ceq 'complete' -or
       $Failure.originalWorkerInstanceId -cnotmatch '^[a-f0-9]{32}$' -or $Failure.currentWorkerInstanceId -cnotmatch '^[a-f0-9]{32}$' -or
       $Failure.originalWorkerInstanceId -ceq $Failure.currentWorkerInstanceId -or
       $Failure.originalWorkerInstanceId -cne $Witness.workerInstanceId))){throw 'Invalid worker progress evidence.'}
  $observed=[DateTimeOffset]::Parse($Failure.observedAt)
  if($observed -gt $Now.AddSeconds(5) -or ($Now-$observed).TotalSeconds -gt 90 -or
    [DateTimeOffset]::Parse($Failure.progressUpdatedAt) -lt [DateTimeOffset]::Parse($Witness.startedAt) -or
    [DateTimeOffset]::Parse($Failure.progressUpdatedAt) -gt $observed -or
    [DateTimeOffset]::Parse($Failure.deadlineAt) -le $Now -or
    [DateTimeOffset]::Parse($Failure.deadlineAt) -gt [DateTimeOffset]::Parse($Witness.startedAt).AddHours(2) -or
    [DateTimeOffset]::Parse($Failure.deadlineAt) -gt [DateTimeOffset]::Parse($Slot).AddMinutes(140)) {throw 'Worker proof stale or outside original budget.'}
}
function Invoke-ChromeWorkerRecovery([string]$RepoPath,[string]$Folder,[string]$Slot) {
  if((Get-PrimaryScanBrowser $Slot) -ne 'chrome' -or (Get-CommonProtocolId $Slot)){return}
  $priorEdge=Read-ScanRecoveryJson (Get-EdgeReceiptPath $RepoPath $Slot)
  if($priorEdge -and $priorEdge.scanSlot -ceq $Slot){return}
  if(Get-SavedPrimaryResultPath $Folder $Slot $RepoPath){return}
  $w=Read-ScanRecoveryJson (Join-Path $Folder 'scan-start.json')
  if(-not $w -or $w.scanSlot -cne $Slot -or [version]$w.extensionVersion -lt [version]'1.9.59'){return}
  if(([DateTimeOffset]::UtcNow-[DateTimeOffset]::Parse($w.startedAt)).TotalSeconds -lt 90){return}
  $catalog=Read-ScanRecoveryJson (Join-Path $Folder 'product-catalog.json')
  Assert-ScanStartWitness $w $Slot $catalog 'chrome'
  if([DateTimeOffset]::Parse($w.deadlineAt) -le [DateTimeOffset]::UtcNow){return}
  $stamp=Join-Path $RepoPath ('reports\worker-probe-'+($Slot -replace '\D','')+'.json')
  $prior=Read-ScanRecoveryJson $stamp
  if($prior -and ([DateTimeOffset]::UtcNow-[DateTimeOffset]::Parse($prior.at)).TotalSeconds -lt 60){return}
  $mutex=New-Object Threading.Mutex($false,('Local\MarketPulseWorkerProbe.'+($Slot -replace '\D','')))
  $held=$false
  try {
    try{$held=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$held=$true}
    if(-not $held){return}
    $prior=Read-ScanRecoveryJson $stamp
    if($prior -and ([DateTimeOffset]::UtcNow-[DateTimeOffset]::Parse($prior.at)).TotalSeconds -lt 60){return}
    . (Join-Path $PSScriptRoot 'browser-profile.ps1')
    $profiles=@(Get-BrowserExtensionInstallations (Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data') (Join-Path $RepoPath 'chrome-extension'))
    if($profiles.Count -ne 1){return}
    $exe=@("$env:ProgramFiles\Google\Chrome\Application\chrome.exe","C:\Program Files (x86)\Google\Chrome\Application\chrome.exe","$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe")|Where-Object {Test-Path $_}|Select-Object -First 1
    if(-not $exe){return}
    $nonce=[guid]::NewGuid().ToString('N')
    Write-ScanRecoveryJson $stamp @{at=[DateTimeOffset]::UtcNow.ToString('o');nonce=$nonce}
    $url="chrome-extension://$($profiles[0].Id)/worker-probe.html?slot=$([uri]::EscapeDataString($Slot))&runId=$($w.runId)&nonce=$nonce"
    Start-Process $exe -ArgumentList @("--profile-directory=$($profiles[0].Profile)",$url)
    $path=Join-Path $Folder "worker-probe-$nonce.json"
    for($i=0;$i -lt 20;$i++){if(Test-Path $path){break};Start-Sleep -Milliseconds 500}
    $proof=Read-ScanRecoveryJson $path
    if(-not $proof -or $proof.nonce -cne $nonce -or $proof.status -cne 'interrupted'){return}
    Assert-ChromeWorkerFailure $proof $Slot $catalog $w
    & (Join-Path $PSScriptRoot 'edge-fallback.ps1') -RepoPath $RepoPath -WorkerFailure $proof
  } finally {if($held){$mutex.ReleaseMutex()};$mutex.Dispose()}
}

function Get-ChromeWitnessMonitorDeadline($Witness,[string]$Slot,$Catalog) {
  Assert-ScanStartWitness $Witness $Slot $Catalog 'chrome'
  $end=[DateTimeOffset]::Parse([string]$Witness.deadlineAt)
  $cap=[DateTimeOffset]::Parse([string]$Witness.startedAt).AddHours(2)
  $slotCap=[DateTimeOffset]::Parse($Slot).AddMinutes(140)
  $next=Get-NextScanTime $Slot
  if($slotCap -lt $cap){$cap=$slotCap};if($next -lt $cap){$cap=$next}
  if($end -gt $cap -or $end -lt [DateTimeOffset]::Parse([string]$Witness.startedAt)){throw 'Monitor cannot extend the original collection budget.'}
  $end.UtcDateTime
}

function Get-CommonProtocolId([string]$Slot) {
 if(-not $Slot){return $null}
 Get-ScanSlotPolicy $Slot|Out-Null
 $source=Get-Content (Join-Path (Split-Path $PSScriptRoot -Parent) 'chrome-extension\scan-policy.js') -Raw -Encoding UTF8
 $json=[regex]::Match($source,'(?s)/\* ROUTING_JSON_BEGIN \*/\s*(.*?)\s*/\* ROUTING_JSON_END \*/').Groups[1].Value
 $p=($json|ConvertFrom-Json).windowsPrimary
 if($p -and $Slot -cge $p.from){return [string]$p.id};return $null
}
$commonModule=Join-Path $PSScriptRoot 'common-primary.ps1'
if(Test-Path $commonModule){. $commonModule}

function Read-EdgeOwnership([string]$RepoPath,[string]$Slot) {
 $path=Get-EdgeReceiptPath $RepoPath $Slot
 $r=Read-ScanRecoveryJson $path
 if((Get-CommonProtocolId $Slot) -and (Test-Path -LiteralPath $path)){
  if(-not $r -or $r.version -ne 1 -or $r.scanSlot -cne $Slot -or $r.runId -cnotmatch '^[a-f0-9]{32}$' -or
    $r.state -cnotin @('started','failed','result-ready') -or $r.primaryProtocolId -cne (Get-CommonProtocolId $Slot) -or
    $r.primaryBrowser -cne (Get-PrimaryScanBrowser $Slot)){throw 'Corrupt or mismatched Edge ownership; do not relaunch'}
 }
 $r
}

function Assert-ScanPublicationOrder($Payload,[string]$RepoPath) {
 $candidate=[DateTimeOffset]::Parse([string]$Payload.scannedAt)
 foreach($file in @(Get-ChildItem (Join-Path $RepoPath 'brand') -Filter 'market-data.js' -Recurse -File -ErrorAction SilentlyContinue)){
  $raw=[IO.File]::ReadAllText($file.FullName,[Text.Encoding]::UTF8).TrimStart([char]0xFEFF)
  $data=($raw -replace '^\s*window\.MARKET_DATA\s*=\s*','' -replace ';\s*$','')|ConvertFrom-Json
  if($data.meta.snapshotAt -and [DateTimeOffset]::Parse([string]$data.meta.snapshotAt) -gt $candidate){throw 'Newer price snapshot already published; refuse an older price/history import'}
 }
}
