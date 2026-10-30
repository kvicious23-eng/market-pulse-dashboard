param([string]$RepoPath='C:\MarketPulse')
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'scan-recovery.ps1')
. (Join-Path $PSScriptRoot 'brand-lifecycle.ps1')
. (Join-Path $PSScriptRoot 'git-timeout.ps1')
. (Join-Path $PSScriptRoot 'model-edge-recovery.ps1')
. (Join-Path $PSScriptRoot 'blue-recovery-queue.ps1')
$folder=Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads\MarketPulse'
$log=Join-Path $RepoPath 'reports\blue-recovery.log'
$mutex=New-Object Threading.Mutex($false,'Local\MarketPulse.BlueRecoveryPoll');$held=$false
try {
  try{$held=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$held=$true};if(-not $held){return}
  try {Confirm-BlueIssueLedger $RepoPath $folder}catch{Add-Content $log -Encoding UTF8 -Value "$([DateTimeOffset]::UtcNow.ToString('o')) Issue ledger awaiting a matching public snapshot: $($_.Exception.Message)"}
  foreach($file in @(Get-ChildItem (Join-Path $RepoPath 'reports') -Filter 'blue-recovery-*.json' -File -ErrorAction SilentlyContinue|Sort-Object LastWriteTimeUtc -Descending)) {
    $q=$null
    try {
    $q=Read-ScanRecoveryJson $file.FullName
    if(-not $q -or $q.state -cin @('complete','partial','unresolved','deferred','expired','superseded','integrity-failed')){continue}
    $now=[DateTimeOffset]::UtcNow
    # Once the next regular slot starts this queue can never collect again.
    # Stop polling an old final-uploaded commit forever if Pages never completed.
    if($now -ge (Get-NextScanTime $q.scanSlot)){$q.state='superseded';Write-ModelEdgeJson $file.FullName $q;continue}
    if($q.state -ne 'final-uploaded' -and $now -ge [DateTimeOffset]::Parse($q.publicationDeadline)){$q.state='expired';Write-ModelEdgeJson $file.FullName $q;continue}
    if($q.nextCheckAt -and $now -lt [DateTimeOffset]::Parse($q.nextCheckAt)){continue}
      $attempt=if($q.activeAttempt -eq 2){2}else{1}
      $paths=Get-ModelEdgePaths $RepoPath ([pscustomobject]@{scanSlot=$q.scanSlot;runId=$q.sourceRunId}) $attempt;$base=Read-ScanRecoveryJson $paths.source
      if($q.state -eq 'waiting-deployment') {
        $published=Get-BlueDeploymentSuccess $q.initialCommit
        if(-not $published){$q.nextCheckAt=$now.AddMinutes(1).ToString('o');Write-ModelEdgeJson $file.FullName $q;continue}
        $q.firstPublishedAt=$published.at;$q.notBefore=([DateTimeOffset]::Parse($published.at)).AddMinutes(10).ToString('o');$q.state='waiting-interval'
        Write-ModelEdgeJson $file.FullName $q
      }
      Assert-BlueRecoveryQueue $q $base
      if($q.state -eq 'final-uploaded') {
        $final=Get-BlueDeploymentSuccess $q.finalCommit
        if($final){
          $merged=Read-ScanRecoveryJson $paths.merged
          $visible=Get-BluePublicationState $merged (Read-ScanRecoveryJson (Join-Path $folder 'product-catalog.json')) $RepoPath -Remote
          $q.finalPublishedAt=$final.at
          if($visible.blueItemIds.Count -eq 0){$q.state='complete'}else{Set-BlueRecoveryNextStep $q $base $folder $RepoPath}
          Write-ModelEdgeJson $file.FullName $q
        }
        continue
      }
      $gate=Get-BlueAttemptGate $q $attempt $base $folder $RepoPath
      if($now -lt $gate.notBefore){continue}
      if($q.state -cin @('waiting-interval','waiting-second')) {
        if($now -ge [DateTimeOffset]::Parse($base.deadlineAt)){$q.state='expired';Write-ModelEdgeJson $file.FullName $q;continue}
        $catalog=Read-ScanRecoveryJson (Join-Path $folder 'product-catalog.json')
        $published=if($attempt -eq 2 -and $q.attemptOneFinalCommit){Read-ScanRecoveryJson ((Get-ModelEdgePaths $RepoPath $base).merged)}else{$base}
        $visible=Get-BluePublicationState $published $catalog $RepoPath -Remote
        if(@($gate.targetItemIds|Where-Object {$_ -cnotin $visible.blueItemIds}).Count){throw 'blue-publication-superseded'}
      }
      # Reuse the ORIGINAL uploader supervisor and its persistent slot deadline.
      # This executes one bounded child; no ten-minute blocking sleep is used.
      $normalized=([DateTimeOffset]::Parse($q.scanSlot)).ToOffset([TimeSpan]::FromHours(9)).ToString('yyyy-MM-ddTHH:mm:sszzz')
      & (Join-Path $PSScriptRoot 'run-scheduled-upload.ps1') -RepoPath $RepoPath -ExpectedSlotStart $normalized -BlueRecoveryQueue $file.FullName
      return
    } catch {
      # A malformed date/property in one queue must not stop later queues.
      if(-not $q){Add-Content $log -Encoding UTF8 -Value "$([DateTimeOffset]::UtcNow.ToString('o')) Queue=$($file.Name); unreadable queue: $($_.Exception.Message)";continue}
      $q|Add-Member lastError $_.Exception.Message -Force
      if($q.lastError -eq 'blue-publication-superseded'){$q.state='superseded'}
      $q|Add-Member nextCheckAt ([DateTimeOffset]::UtcNow.AddMinutes(1).ToString('o')) -Force;Write-ModelEdgeJson $file.FullName $q
      Add-Content $log -Encoding UTF8 -Value "$($now.ToString('o')) Slot=$($q.scanSlot); deferred recovery: $($q.lastError)"
    }
  }
} finally {if($held){$mutex.ReleaseMutex()};$mutex.Dispose()}

