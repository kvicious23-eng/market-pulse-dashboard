# Queue after the FIRST full Edge publication. Git push, Pages deployment and
# ten-minute delay are distinct gates. This module never starts collection.
function Get-BlueRecoveryQueuePath([string]$RepoPath,$Base) {
  if($Base.runId -cnotmatch '^[a-f0-9]{32}$'){throw 'Invalid blue recovery source run.'}
  Join-Path $RepoPath ('reports\blue-recovery-'+(Get-ScanSlotKey $Base.scanSlot)+'-'+$Base.runId+'.json')
}
function Read-BlueMarketData([string]$Text) {
  ($Text.TrimStart([char]0xFEFF) -replace '^\s*window\.MARKET_DATA\s*=\s*','' -replace ';\s*$','')|ConvertFrom-Json
}
function Get-BluePublicationState($Base,$Catalog,[string]$RepoPath,[switch]$Remote,[string[]]$AllowedRunIds=@()) {
  if(-not $AllowedRunIds.Count){$AllowedRunIds=@($Base.runId)}
  $all=@();$blue=@()
  foreach($brand in @($Catalog.products|Where-Object {$_.enabled -ne $false}|ForEach-Object {$_.brand}|Sort-Object -Unique)) {
    $slug=([string]$brand).ToLowerInvariant() -replace '[^\p{L}\p{N}]+','-';$slug=$slug.Trim('-')
    if($Remote) {
      $url='https://kvicious23-eng.github.io/market-pulse-dashboard/brand/'+$slug+'/market-data.js?blue-recovery='+$Base.runId
      $raw=(Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 20).Content
    } else {$raw=Get-Content (Join-Path $RepoPath ('brand\'+$slug+'\market-data.js')) -Raw -Encoding UTF8}
    $data=Read-BlueMarketData $raw
    if($data.meta.collectionEvidence.runId -cnotin $AllowedRunIds) {
      if([DateTimeOffset]::Parse($data.meta.snapshotAt) -lt [DateTimeOffset]::Parse($Base.scannedAt)){throw 'blue-publication-not-visible'}
      throw 'blue-publication-superseded'
    }
    if($data.meta.collectionEvidence.scanSlot -cne $Base.scanSlot){throw 'blue-publication-superseded'}
    if(([string]$data.meta.brand).Trim() -and ([string]$data.meta.brand).Trim() -cne ([string]$brand).Trim()){throw 'blue-publication-brand-mismatch'}
    foreach($product in @($data.products)) {
      # Public rows inherit their brand from meta/file; unlike scan rows they
      # intentionally do not carry a redundant brand property.
      $all+=[pscustomobject]@{brand=$brand;mtm=$product.mtm;productId=$product.productId;itemId=$product.itemId;vendorItemId=$product.vendorItemId}
      $mine=@($product.offers|Where-Object {$_.role -eq 'mine'})
      if($mine.Count -ne 1){throw 'blue-publication-invalid-offer'}
      if($mine[0].collectionStatus -eq 'review-needed' -or $mine[0].cardBenefitStatus -eq 'review-needed'){$blue+=[string]$product.itemId}
    }
  }
  Assert-ScanCatalog $Catalog $all
  [pscustomobject]@{blueItemIds=@($blue|Sort-Object -Unique);total=$all.Count}
}
function Assert-BlueRecoveryQueue($Queue,$Base) {
  if(-not $Queue -or $Queue.version -ne 1 -or $Queue.sourceRunId -cne $Base.runId -or $Queue.scanSlot -cne $Base.scanSlot -or
    $Queue.initialCommit -cnotmatch '^[a-f0-9]{40}$' -or $Queue.sourceHash -cnotmatch '^[a-f0-9]{64}$' -or
    -not @($Queue.targetItemIds).Count -or @($Queue.targetItemIds|Sort-Object -Unique).Count -ne @($Queue.targetItemIds).Count -or
    -not $Queue.firstPublishedAt -or ([DateTimeOffset]::Parse($Queue.notBefore)-[DateTimeOffset]::Parse($Queue.firstPublishedAt)).TotalSeconds -ne 600) {throw 'Unverified first publication or ten-minute interval.'}
  if([DateTimeOffset]::Parse($Queue.firstPublishedAt) -lt [DateTimeOffset]::Parse($Base.completedAt)){throw 'First deployment predates its full Edge source.'}
  $ids=@($Base.results|ForEach-Object {[string]$_.itemId})
  if(@($Queue.targetItemIds|Where-Object {$_ -cnotin $ids}).Count){throw 'Queued recovery targets outside the first full Edge scan.'}
}
function Add-BlueRecoveryQueue($Payload,[string]$SourcePath,[string]$RepoPath,[string]$Folder) {
  if(-not(Test-ModelEdgeEnabled $Payload)){return}
  $catalog=Read-ScanRecoveryJson (Join-Path $Folder 'product-catalog.json')
  Assert-ModelEdgeBase $Payload $catalog $Payload.scanSlot
  $receipt=Read-ScanRecoveryJson (Get-EdgeReceiptPath $RepoPath $Payload.scanSlot)
  Assert-EdgeRecoveryResult $Payload $receipt @($receipt.targets)
  $path=Get-BlueRecoveryQueuePath $RepoPath $Payload
  $state=Get-BluePublicationState $Payload $catalog $RepoPath
  if(-not $state.blueItemIds.Count){return}
  $prior=Read-ScanRecoveryJson $path
  if($prior){if($prior.sourceRunId -cne $Payload.runId){throw 'Blue queue source changed.'};return}
  $budget=Read-ScanRecoveryJson (Join-Path $RepoPath 'reports\scheduled-upload-budget.json')
  if(-not $budget -or [DateTimeOffset]::Parse($budget.scanSlot) -ne [DateTimeOffset]::Parse($Payload.scanSlot)){throw 'Original slot upload budget is missing.'}
  $git=Invoke-MarketPulseGit -RepoPath $RepoPath -Arguments @('rev-parse','HEAD')
  $commit=[string]@($git.Output)[0]
  if($git.Code -ne 0 -or $commit -cnotmatch '^[a-f0-9]{40}$'){throw 'Cannot identify first publication commit.'}
  $paths=Get-ModelEdgePaths $RepoPath $Payload
  $tmp=$paths.source+'.tmp';Copy-Item -LiteralPath $SourcePath -Destination $tmp;Move-Item -LiteralPath $tmp -Destination $paths.source -Force
  $queue=[pscustomobject]@{version=1;state='waiting-deployment';scanSlot=$Payload.scanSlot;sourceRunId=$Payload.runId;sourceHash=(Get-FileHash $paths.source -Algorithm SHA256).Hash.ToLowerInvariant();
    initialCommit=$commit;createdAt=[DateTimeOffset]::UtcNow.ToString('o');targetItemIds=@($state.blueItemIds);firstPublishedAt=$null;notBefore=$null;nextCheckAt=$null;
    publicationDeadline=$budget.deadlineAt;lastError=$null;finalCommit=$null;finalPublishedAt=$null}
  Write-ModelEdgeJson $path $queue
  Write-Host "Blue retry queued AFTER first upload: run=$($Payload.runId); models=$($state.blueItemIds.Count); waiting for Pages success + 10 minutes."
}
function Get-BlueDeploymentSuccess([string]$Commit) {
  if($Commit -cnotmatch '^[a-f0-9]{40}$'){throw 'Invalid deployment commit.'}
  $root='https://api.github.com/repos/kvicious23-eng/market-pulse-dashboard'
  $headers=@{'User-Agent'='MarketPulse-Local-BlueRecovery';Accept='application/vnd.github+json'}
  $runs=Invoke-RestMethod -Uri ($root+'/actions/runs?head_sha='+$Commit+'&per_page=10') -Headers $headers -TimeoutSec 20
  foreach($run in @($runs.workflow_runs|Where-Object {$_.head_sha -ceq $Commit -and $_.name -eq 'Market Pulse Update' -and $_.conclusion -eq 'success'})) {
    $jobs=Invoke-RestMethod -Uri ($root+'/actions/runs/'+$run.id+'/jobs?per_page=100') -Headers $headers -TimeoutSec 20
    $deploy=@($jobs.jobs|Where-Object {$_.name -eq 'deploy' -and $_.conclusion -eq 'success'})
    if($deploy.Count -eq 1 -and @($jobs.jobs|Where-Object {$_.name -cin @('update','windows_history') -and $_.conclusion -eq 'success'}).Count -eq 2) {
      return [pscustomobject]@{at=([DateTimeOffset]::Parse($deploy[0].completed_at)).ToString('o');runId=[string]$run.id}
    }
  }
  return $null
}
function Assert-BlueRecoveryCurrentPublication($Payload,[string]$RepoPath) {
  $paths=Get-ModelEdgePaths $RepoPath ([pscustomobject]@{scanSlot=$Payload.scanSlot;runId=$Payload.modelRecovery.sourceRunId})
  $base=Read-ScanRecoveryJson $paths.source
  $folder=Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads\MarketPulse'
  $catalog=Read-ScanRecoveryJson (Join-Path $folder 'product-catalog.json')
  [void](Get-BluePublicationState $base $catalog $RepoPath -AllowedRunIds @($base.runId,$Payload.runId))
}

function Resolve-BluePublicationResult([string]$BasePath,[string]$Slot,[string]$Folder,[string]$RepoPath) {
  $base=Read-ScanRecoveryJson $BasePath
  if(-not(Test-ModelEdgeEnabled $base)){return $BasePath}
  $q=Read-ScanRecoveryJson (Get-BlueRecoveryQueuePath $RepoPath $base)
  if($q -and $q.state -cin @('publishing','final-uploaded','complete','partial')) {
    $paths=Get-ModelEdgePaths $RepoPath $base;$m=Read-ScanRecoveryJson $paths.merged
    if($m -and $m.modelRecovery.recovered -gt 0){Assert-ModelEdgeComposite $m $Slot $Folder $RepoPath;return $paths.merged}
  }
  return $BasePath
}

function Save-BlueRecoveryFinalCommit($Payload,[string]$RepoPath) {
  if(-not $Payload.modelRecovery){return}
  $base=[pscustomobject]@{scanSlot=$Payload.scanSlot;runId=$Payload.modelRecovery.sourceRunId}
  $path=Get-BlueRecoveryQueuePath $RepoPath $base;$q=Read-ScanRecoveryJson $path
  $git=Invoke-MarketPulseGit -RepoPath $RepoPath -Arguments @('rev-parse','HEAD')
  $commit=[string]@($git.Output)[0]
  if($git.Code -ne 0 -or $commit -cnotmatch '^[a-f0-9]{40}$'){throw 'Cannot pin final recovery publication commit.'}
  $q.finalCommit=$commit;$q.state='final-uploaded';Write-ModelEdgeJson $path $q
}
