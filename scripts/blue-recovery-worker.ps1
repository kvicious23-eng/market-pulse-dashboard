param([string]$RepoPath='C:\MarketPulse',[string]$QueuePath)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'scan-recovery.ps1')
. (Join-Path $PSScriptRoot 'brand-lifecycle.ps1')
. (Join-Path $PSScriptRoot 'git-timeout.ps1')
. (Join-Path $PSScriptRoot 'model-edge-recovery.ps1')
. (Join-Path $PSScriptRoot 'blue-recovery-queue.ps1')
$folder=Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads\MarketPulse'
$q=Read-ScanRecoveryJson $QueuePath
$paths=Get-ModelEdgePaths $RepoPath ([pscustomobject]@{scanSlot=$q.scanSlot;runId=$q.sourceRunId})
if([IO.Path]::GetFullPath($QueuePath) -cne [IO.Path]::GetFullPath((Get-BlueRecoveryQueuePath $RepoPath ([pscustomobject]@{scanSlot=$q.scanSlot;runId=$q.sourceRunId})))){throw 'Unexpected blue recovery queue path.'}
$base=Read-ScanRecoveryJson $paths.source
Assert-BlueRecoveryQueue $q $base
if((Get-FileHash $paths.source -Algorithm SHA256).Hash.ToLowerInvariant() -cne $q.sourceHash){throw 'First full Edge source archive changed.'}
if([DateTimeOffset]::UtcNow -lt [DateTimeOffset]::Parse($q.notBefore) -or $q.state -cnotin @('waiting-interval','waiting-second','collecting','publishing')){throw 'Blue recovery is not eligible to run.'}
if($q.state -cin @('waiting-interval','waiting-second','collecting')) {
  $gate=Get-BlueAttemptGate $q $(if($q.activeAttempt -eq 2){2}else{1}) $base $folder $RepoPath
  if([DateTimeOffset]::UtcNow -lt $gate.notBefore){throw 'Follow-up interval has not elapsed.'}
  $published=if($q.activeAttempt -eq 2){Read-ScanRecoveryJson $paths.merged}else{$base}
  if($q.activeAttempt -eq 2 -and -not $q.attemptOneFinalCommit){$published=$base}
  $visible=Get-BluePublicationState $published (Read-ScanRecoveryJson (Join-Path $folder 'product-catalog.json')) $RepoPath -Remote
  if(@($gate.targetItemIds|Where-Object {$_ -cnotin $visible.blueItemIds}).Count){$q.state='superseded';Write-ModelEdgeJson $QueuePath $q;return}
}
$q.state='collecting';Write-ModelEdgeJson $QueuePath $q
try {$mergedPath=Invoke-ModelEdgeRecovery $paths.source $q.scanSlot $folder $RepoPath $q}
catch {$q.lastError=$_.Exception.Message;if($q.lastError -notmatch 'Another Edge handoff owns'){$q.state='integrity-failed'};Write-ModelEdgeJson $QueuePath $q;throw}
$merged=Read-ScanRecoveryJson $mergedPath
Record-BlueRecoveryOutcome $q $base $folder $RepoPath
if(@($merged.modelRecovery.newlyRecoveredItemIds).Count -eq 0){Set-BlueRecoveryNextStep $q $base $folder $RepoPath;Write-ModelEdgeJson $QueuePath $q;Write-Host 'No new verified replacement; keep the published rows and follow the bounded retry/defer policy.';return}
$q.state='publishing';Write-ModelEdgeJson $QueuePath $q
& (Join-Path $PSScriptRoot 'import-extension-results.ps1') -RepoPath $RepoPath -ExpectedSlotStart $q.scanSlot -ModelRecoverySource $mergedPath
$q=Read-ScanRecoveryJson $QueuePath
if($q.state -ne 'final-uploaded' -or $q.finalCommit -cnotmatch '^[a-f0-9]{40}$'){throw 'Final recovery commit was not pinned by the importer.'}
Write-Host "Additional Edge publication uploaded: recovered=$($merged.modelRecovery.recovered); still-blue=$($merged.modelRecovery.unresolved); Pages success is separate."

