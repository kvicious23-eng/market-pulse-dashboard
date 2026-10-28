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
if([DateTimeOffset]::UtcNow -lt [DateTimeOffset]::Parse($q.notBefore) -or $q.state -cnotin @('waiting-interval','collecting','publishing')){throw 'Blue recovery is not eligible to run.'}
if($q.state -eq 'waiting-interval') {
  $visible=Get-BluePublicationState $base (Read-ScanRecoveryJson (Join-Path $folder 'product-catalog.json')) $RepoPath -Remote
  if(@($q.targetItemIds|Where-Object {$_ -cnotin $visible.blueItemIds}).Count){$q.state='superseded';Write-ModelEdgeJson $QueuePath $q;return}
}
$q.state='collecting';Write-ModelEdgeJson $QueuePath $q
try {$mergedPath=Invoke-ModelEdgeRecovery $paths.source $q.scanSlot $folder $RepoPath $q}
catch {$q.lastError=$_.Exception.Message;if($q.lastError -notmatch 'Another Edge handoff owns'){$q.state='integrity-failed'};Write-ModelEdgeJson $QueuePath $q;throw}
$merged=Read-ScanRecoveryJson $mergedPath
if($merged.modelRecovery.recovered -eq 0){$q.state='unresolved';Write-ModelEdgeJson $QueuePath $q;Write-Host 'Additional Edge attempt finished without a verified replacement; first published blue models preserved.';return}
$q.state='publishing';Write-ModelEdgeJson $QueuePath $q
& (Join-Path $PSScriptRoot 'import-extension-results.ps1') -RepoPath $RepoPath -ExpectedSlotStart $q.scanSlot -ModelRecoverySource $mergedPath
$q=Read-ScanRecoveryJson $QueuePath
if($q.state -ne 'final-uploaded' -or $q.finalCommit -cnotmatch '^[a-f0-9]{40}$'){throw 'Final recovery commit was not pinned by the importer.'}
Write-Host "Additional Edge publication uploaded: recovered=$($merged.modelRecovery.recovered); still-blue=$($merged.modelRecovery.unresolved); Pages success is separate."
