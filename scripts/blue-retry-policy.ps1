# Bounded follow-up policy. The second attempt never extends the original slot.
function Get-BlueFailureClass($Row) {
  $reason=([string]$Row.reason+' '+[string]$Row.error+' '+[string]$Row.checkoutDiscountReason)
  if($reason -match 'identif|mismatch|catalog|corrupt|invalid'){return 'integrity'}
  if($reason -match 'login|auth|captcha|verification'){return 'authentication'}
  if($reason -match 'scan-timeout|timeout|access-check|network|net::|ERR_|tab.*(closed|lost|removed)|No tab|temporary'){return 'transient'}
  return 'needs-diagnosis'
}
function Get-BlueSecondCandidates($Queue,$Edge) {
  @($Edge.results|Where-Object {
    [string]$_.itemId -cin @($Queue.targetItemIds) -and
    -not(Test-ModelEdgeVerifiedRow $_) -and (Get-BlueFailureClass $_) -eq 'transient'
  }|ForEach-Object {[string]$_.itemId}|Sort-Object -Unique)
}
function Get-BlueAttemptGate($Queue,[int]$Attempt,$Base,[string]$Folder,[string]$RepoPath) {
  if($Attempt -eq 1){return [pscustomobject]@{notBefore=[DateTimeOffset]::Parse($Queue.notBefore);targetItemIds=@($Queue.targetItemIds)}}
  if($Attempt -ne 2 -or $Queue.maxAttempts -ne 2 -or [version]$Base.extensionVersion -lt [version]'1.9.54'){throw 'Second attempt is not authorized for this source.'}
  $paths=Get-ModelEdgePaths $RepoPath $Base
  $receipt=Read-ScanRecoveryJson $paths.receipt
  if($receipt.state -cne 'result-ready' -or $receipt.baseHash -cne $Queue.sourceHash){throw 'Second attempt requires a completed first attempt.'}
  $edge=Read-ScanRecoveryJson (Get-SavedEdgeRunPath $Folder $receipt.runId)
  Assert-ModelEdgeResult $edge $receipt $Base
  $expected=@(Get-BlueSecondCandidates $Queue $edge)
  if(-not $expected.Count -or (@($Queue.secondTargetItemIds|Sort-Object) -join ',') -cne ($expected -join ',')){throw 'Second targets are not exactly the remaining transient failures.'}
  $notBefore=([DateTimeOffset]::Parse($edge.completedAt)).AddMinutes(10)
  $first=Read-ScanRecoveryJson $paths.merged
  if($first.modelRecovery.recovered -gt 0 -and ($Queue.attemptOneFinalCommit -cnotmatch '^[a-f0-9]{40}$' -or -not $Queue.attemptOnePublishedAt -or [DateTimeOffset]::Parse($Queue.attemptOnePublishedAt) -lt [DateTimeOffset]::Parse($edge.completedAt))){throw 'The first improvement has not been confirmed published.'}
  if([DateTimeOffset]::Parse($Queue.secondNotBefore) -ne $notBefore -or
    (Get-FileHash $paths.merged -Algorithm SHA256).Hash.ToLowerInvariant() -cne $Queue.previousMergedHash){throw 'Second attempt timing or first merged source changed.'}
  [pscustomobject]@{notBefore=$notBefore;targetItemIds=$expected}
}
function Set-BlueRecoveryNextStep($Queue,$Base,[string]$Folder,[string]$RepoPath) {
  if($Queue.activeAttempt -eq 2 -or $Queue.maxAttempts -ne 2){$Queue.state='deferred';return}
  $paths=Get-ModelEdgePaths $RepoPath $Base
  $receipt=Read-ScanRecoveryJson $paths.receipt
  # No result is not proof of an inactive browser worker; defer to the next slot.
  if($receipt.state -cne 'result-ready'){$Queue.state='deferred';return}
  $edge=Read-ScanRecoveryJson (Get-SavedEdgeRunPath $Folder $receipt.runId)
  Assert-ModelEdgeResult $edge $receipt $Base
  $targets=@(Get-BlueSecondCandidates $Queue $edge)
  $notBefore=([DateTimeOffset]::Parse($edge.completedAt)).AddMinutes(10)
  $limit=[DateTimeOffset]::Parse($Base.deadlineAt)
  if([DateTimeOffset]::Parse($Queue.publicationDeadline) -lt $limit){$limit=[DateTimeOffset]::Parse($Queue.publicationDeadline)}
  if(-not $targets.Count -or $notBefore.AddMinutes(1) -ge $limit -or [DateTimeOffset]::UtcNow.AddMinutes(1) -ge $limit){$Queue.state='deferred';return}
  $Queue|Add-Member secondTargetItemIds $targets -Force
  $Queue|Add-Member secondNotBefore $notBefore.ToString('o') -Force
  $Queue|Add-Member previousMergedHash ((Get-FileHash $paths.merged -Algorithm SHA256).Hash.ToLowerInvariant()) -Force
  $Queue|Add-Member lastPublishedRunId $(if($Queue.finalCommit){(Read-ScanRecoveryJson $paths.merged).runId}else{$Base.runId}) -Force
  $Queue|Add-Member attemptOneFinalCommit $Queue.finalCommit -Force
  $Queue|Add-Member attemptOnePublishedAt $Queue.finalPublishedAt -Force
  $Queue|Add-Member activeAttempt 2 -Force
  $Queue.finalCommit=$null;$Queue.finalPublishedAt=$null;$Queue.state='waiting-second';$Queue.nextCheckAt=$null
}

function Get-BlueIssueLedgerHash([string]$Path) {
  if(Test-Path -LiteralPath $Path){return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash}
  return ''
}
function Save-BlueIssueLedger([string]$Path,$Data,[string]$ExpectedHash) {
  $key=[IO.Path]::GetFullPath($Path) -replace '[^a-zA-Z0-9]',''
  $mutex=New-Object Threading.Mutex($false,('Local\MarketPulse.IssueLedger.'+$key));$held=$false
  try {
    try{$held=$mutex.WaitOne(1000)}catch [Threading.AbandonedMutexException]{$held=$true}
    if(-not $held -or (Get-BlueIssueLedgerHash $Path) -cne $ExpectedHash){return $false}
    Write-ModelEdgeJson $Path $Data;return $true
  } finally {if($held){$mutex.ReleaseMutex()};$mutex.Dispose()}
}

# Private identity/error ledger: never carries an old price into a new slot.
function Update-BlueIssueLedger($Payload,[string]$RepoPath,[string]$Folder,[int]$Retry=0) {
  $catalog=Read-ScanRecoveryJson (Join-Path $Folder 'product-catalog.json')
  $visible=Get-BluePublicationState $Payload $catalog $RepoPath
  $path=Join-Path $RepoPath 'reports\recovery-issues.json';$priorHash=Get-BlueIssueLedgerHash $path;$prior=Read-ScanRecoveryJson $path
  if($prior.lastSnapshotAt -and [DateTimeOffset]::Parse($prior.lastSnapshotAt) -gt [DateTimeOffset]::Parse($Payload.scannedAt)){return}
  $records=@();$keys=@()
  foreach($row in @($catalog.products|Where-Object {$_.enabled -ne $false})) {
    $key=Get-ModelEdgeKey $row;$keys+=$key
    $old=@($prior.models|Where-Object {$_.key -ceq $key})|Select-Object -First 1
    $blue=[string]$row.itemId -cin $visible.blueItemIds
    if(-not $blue -and -not $old){continue}
    $result=@($Payload.results|Where-Object {$_.itemId -ceq $row.itemId})|Select-Object -First 1
    $records+=[pscustomobject]@{key=$key;brand=$row.brand;mtm=$row.mtm;productId=$row.productId;itemId=$row.itemId;vendorItemId=$row.vendorItemId;
      state=if($blue){'unresolved'}else{'awaiting-publication'};failureClass=if($blue -and $old.lastRecoverySlot -ceq $Payload.scanSlot){$old.lastRecoveryClass}elseif($blue){Get-BlueFailureClass $result}else{$null};
      lastRecoverySlot=$old.lastRecoverySlot;lastRecoveryRunId=$old.lastRecoveryRunId;lastRecoveryClass=$old.lastRecoveryClass;lastRecoveryCompletedAt=$old.lastRecoveryCompletedAt;
      firstSeenAt=if($old){$old.firstSeenAt}else{$Payload.scannedAt};lastSnapshotAt=$Payload.scannedAt;scanSlot=$Payload.scanSlot;runId=$Payload.runId;
      failedRuns=if($old){[int]$old.failedRuns+[int]($blue -and $old.runId -cne $Payload.runId)}else{1}}
  }
  foreach($old in @($prior.models|Where-Object {$_})){if($old.key -cnotin $keys){$old.state='retired';$records+=$old}}
  $next=[pscustomobject]@{version=1;lastSnapshotAt=$Payload.scannedAt;models=$records}
  if(-not(Save-BlueIssueLedger $path $next $priorHash) -and $Retry -lt 2){Update-BlueIssueLedger $Payload $RepoPath $Folder ($Retry+1)}
}
function Confirm-BlueIssueLedger([string]$RepoPath,[string]$Folder) {
  $path=Join-Path $RepoPath 'reports\recovery-issues.json';$priorHash=Get-BlueIssueLedgerHash $path;$ledger=Read-ScanRecoveryJson $path
  if(-not $ledger){return}
  $catalog=Read-ScanRecoveryJson (Join-Path $Folder 'product-catalog.json')
  foreach($group in @($ledger.models|Where-Object {$_.state -cin @('unresolved','awaiting-publication')}|Group-Object runId)) {
    $sample=$group.Group[0]
    $base=[pscustomobject]@{runId=$sample.runId;scanSlot=$sample.scanSlot;scannedAt=$sample.lastSnapshotAt}
    $public=Get-BluePublicationState $base $catalog $RepoPath -Remote
    foreach($row in $group.Group){$row.state=if([string]$row.itemId -cin $public.blueItemIds){'unresolved'}else{'resolved'}}
  }
  [void](Save-BlueIssueLedger $path $ledger $priorHash)
}

function Record-BlueRecoveryOutcome($Queue,$Base,[string]$Folder,[string]$RepoPath) {
  $path=Join-Path $RepoPath 'reports\recovery-issues.json';$hash=Get-BlueIssueLedgerHash $path;$ledger=Read-ScanRecoveryJson $path
  if(-not $ledger){return}
  $attempt=if($Queue.activeAttempt -eq 2){2}else{1};$receipt=Read-ScanRecoveryJson ((Get-ModelEdgePaths $RepoPath $Base $attempt).receipt)
  if($receipt.state -cne 'result-ready'){return}
  $edge=Read-ScanRecoveryJson (Get-SavedEdgeRunPath $Folder $receipt.runId);Assert-ModelEdgeResult $edge $receipt $Base
  $allowed=@($Base.runId)
  if($attempt -eq 2){$allowed+=(Read-ScanRecoveryJson ((Get-ModelEdgePaths $RepoPath $Base).merged)).runId}
  foreach($row in @($ledger.models)) {
    if($row.scanSlot -cne $Base.scanSlot -or $row.runId -cnotin $allowed){continue}
    $result=@($edge.results|Where-Object {(Get-ModelEdgeKey $_) -ceq $row.key})|Select-Object -First 1
    if(-not $result){continue}
    $row|Add-Member lastRecoverySlot $Base.scanSlot -Force
    $row|Add-Member lastRecoveryRunId $edge.runId -Force
    $row|Add-Member lastRecoveryClass $(if(Test-ModelEdgeVerifiedRow $result){'verified'}else{Get-BlueFailureClass $result}) -Force
    $row|Add-Member lastRecoveryCompletedAt $edge.completedAt -Force
    if($row.state -eq 'unresolved'){$row.failureClass=$row.lastRecoveryClass}
  }
  [void](Save-BlueIssueLedger $path $ledger $hash)
}
