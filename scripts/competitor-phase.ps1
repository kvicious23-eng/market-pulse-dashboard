# Competitor queues share the original slot budget. No primary price file is consumed or overwritten here.
function Get-CompetitorQueuePath([string]$RepoPath,[string]$Slot){Join-Path $RepoPath ('reports\competitor-phase-'+(Get-ScanSlotKey $Slot)+'.json')}
function Invoke-CompetitorData([string]$RepoPath,[string]$Mode,[string]$CatalogPath,[string]$QueuePath='',[string]$ResultPath=''){
 $args=@((Join-Path $RepoPath 'scripts\competitor-data.mjs'),$Mode,$RepoPath,$CatalogPath)
 if($QueuePath){$args+=@($QueuePath,$ResultPath)}
 $priorErrorPreference=$ErrorActionPreference
 try{$ErrorActionPreference='Continue';$output=& node @args 2>&1;$code=$LASTEXITCODE}finally{$ErrorActionPreference=$priorErrorPreference}
 if($code){if($Mode -eq 'verify-source' -and ($output -join "`n") -match 'Competitor publication superseded'){throw 'Competitor publication superseded'};throw 'Competitor data validation/update failed'}
 if($Mode -eq 'plan'){return ($output -join "`n"|ConvertFrom-Json)}
}
function Add-CompetitorPhase($Payload,[string]$RepoPath,[string]$Folder){
 if(-not $Payload.scanSlot -or [version]$Payload.extensionVersion -lt [version]'1.9.66'){return}
 $path=Get-CompetitorQueuePath $RepoPath $Payload.scanSlot
 $sourceRunId=if($Payload.modelRecovery.scope -ceq 'models'){$Payload.modelRecovery.sourceRunId}else{$Payload.runId}
 $competitorBrowser=if($Payload.browser -ceq 'edge' -or $Payload.modelRecovery.sourceBrowser -ceq 'edge'){'edge'}else{Get-PrimaryScanBrowser $Payload.scanSlot}
 $prior=$null
 if(Test-Path $path){
  $prior=Read-ScanRecoveryJson $path
  if(-not $prior -or $prior.version -ne 1 -or $prior.scope -cne 'competitors' -or $prior.scanSlot -cne $Payload.scanSlot -or $prior.requestId -cnotmatch '^[a-f0-9]{32}$'){throw 'Existing competitor queue invalid; preserve original'}
  if($prior.sourceRunId -ceq $sourceRunId){return}
  if($prior.state -cne 'complete'){throw 'Different own run has a non-complete competitor phase; inspect idle state before replacement'}
 }
 $catalogPath=Join-Path $Folder 'product-catalog.json'
 $plan=Invoke-CompetitorData $RepoPath 'plan' $catalogPath
 if(-not @($plan.targets).Count){return}
 $r=Invoke-MarketPulseGit -RepoPath $RepoPath -Arguments @('rev-parse','HEAD');if($r.Code){throw 'Cannot identify primary publication'}
 $deadline=[DateTimeOffset]::Parse($Payload.deadlineAt)
 $cap=([DateTimeOffset]::Parse($Payload.startedAt)).AddHours(2);if($cap -lt $deadline){$deadline=$cap}
 $budget=Read-ScanRecoveryJson (Join-Path $RepoPath 'reports\scheduled-upload-budget.json')
 if(-not $budget -or [DateTimeOffset]::Parse($budget.scanSlot) -ne [DateTimeOffset]::Parse($Payload.scanSlot)){throw 'Original publication budget missing'}
 $pub=[DateTimeOffset]::Parse($budget.deadlineAt)
 $q=[pscustomobject]@{version=1;scope='competitors';state='waiting-deployment';scanSlot=$Payload.scanSlot;sourceRunId=$sourceRunId;sourceStartedAt=$Payload.startedAt;
   initialCommit=([string]@($r.Output)[0]);deadlineAt=$deadline.ToString('o');publicationDeadline=$pub.ToString('o');targets=@($plan.targets);
   requestId=[guid]::NewGuid().ToString('N');browser=$competitorBrowser;attempt=$(if($competitorBrowser -ceq 'edge'){'edge'}else{'primary'});firstPublishedAt=$null;nextCheckAt=$null;lastError=$null;finalCommit=$null}
 if($prior){Copy-Item -LiteralPath $path -Destination (Join-Path $RepoPath ('reports\competitor-superseded-'+$prior.requestId+'.json')) -ErrorAction Stop}
 Write-ScanRecoveryJson $path $q
}
function Start-CompetitorPage($Queue,[string]$RepoPath,[string]$Action){
 . (Join-Path $PSScriptRoot 'browser-profile.ps1')
 $config=switch($Queue.browser){
  'chrome' {@{data='Google\Chrome\User Data';exe='C:\Program Files\Google\Chrome\Application\chrome.exe'}}
  'whale' {@{data='Naver\Naver Whale\User Data';exe='C:\Program Files\Naver\Naver Whale\Application\whale.exe'}}
  'edge' {@{data='Microsoft\Edge\User Data';exe='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'}}
  default {throw 'Unknown competitor browser'}
 }
 $profiles=@(Get-BrowserExtensionInstallations (Join-Path $env:LOCALAPPDATA $config.data) (Join-Path $RepoPath 'chrome-extension'))
 if($profiles.Count -ne 1){throw 'Competitor browser profile ambiguous'}
 $runtime=Join-Path $RepoPath ('chrome-extension\runtime\competitor-'+$Queue.requestId+'.json')
 Write-ScanRecoveryJson $runtime $Queue
 $url='chrome-extension://'+$profiles[0].Id+'/competitor.html?request='+$Queue.requestId+'&action='+$Action
 Start-Process $config.exe -ArgumentList @(('--profile-directory='+$profiles[0].Profile),$url)
}
function Publish-CompetitorResult($Queue,[string]$QueuePath,[string]$ResultPath,[string]$RepoPath,[string]$Folder){
 if([DateTimeOffset]::UtcNow -ge [DateTimeOffset]::Parse($Queue.publicationDeadline)){throw 'Competitor publication deadline exhausted'}
 . (Join-Path $PSScriptRoot 'supplier-daily.ps1')
 . (Join-Path $PSScriptRoot 'price-publication.ps1')
 $lock=Enter-MarketPulseRepositoryLock $RepoPath 10
 try{
  Repair-PricePublication $RepoPath
  $r=Invoke-MarketPulseGit -RepoPath $RepoPath -Arguments @('pull','--rebase','origin','main');if($r.Code){throw 'Competitor publication fetch failed'}
  if((Invoke-MarketPulseGit -RepoPath $RepoPath -Arguments @('status','--porcelain')).Output){throw 'Competitor publication requires a clean repository'}
  $catalogPath=Join-Path $Folder 'product-catalog.json';$catalog=Read-ScanRecoveryJson $catalogPath
  Start-PricePublication $RepoPath $catalog
  try{
   Invoke-CompetitorData $RepoPath 'merge' $catalogPath $QueuePath $ResultPath
   $r=Invoke-MarketPulseGit -RepoPath $RepoPath -Arguments @('add','--','brand','dist/competitor-price-history.js');if($r.Code){throw 'Competitor stage failed'}
   $diff=Invoke-MarketPulseGit -RepoPath $RepoPath -Arguments @('diff','--cached','--quiet');if($diff.Code -notin @(0,1)){throw 'Competitor diff failed'}
   Prepare-PricePublicationCommit $RepoPath
   if($diff.Code -eq 1){$r=Invoke-MarketPulseGit -RepoPath $RepoPath -Arguments @('commit','-m','data: publish designated Coupang competitor models');if($r.Code){throw 'Competitor commit failed'}}
   $r=Invoke-MarketPulseGit -RepoPath $RepoPath -Arguments @('push','origin','main');if($r.Code){throw 'Competitor push failed'}
   $head=Invoke-MarketPulseGit -RepoPath $RepoPath -Arguments @('rev-parse','HEAD');$Queue.finalCommit=[string]@($head.Output)[0]
   Complete-PricePublication $RepoPath
  }catch{$failure=$_;try{Repair-PricePublication $RepoPath}catch{};throw $failure}
 }finally{$lock.ReleaseMutex();$lock.Dispose()}
}
function Test-CompetitorOwnRecoveryReady([string]$RepoPath,[string]$Slot){
 foreach($file in @(Get-ChildItem (Join-Path $RepoPath 'reports') -Filter 'blue-recovery-*.json' -File -ErrorAction SilentlyContinue)){
  $own=Read-ScanRecoveryJson $file.FullName
  if(-not $own){throw 'Unreadable own recovery queue; competitor start deferred'}
  if($own.scanSlot -and [DateTimeOffset]::Parse($own.scanSlot) -eq [DateTimeOffset]::Parse($Slot) -and
     $own.state -cnotin @('complete','partial','unresolved','deferred','expired','superseded','integrity-failed') -and
     [DateTimeOffset]::UtcNow -lt [DateTimeOffset]::Parse($own.publicationDeadline)){return $false}
 }
 return $true
}
function Test-CompetitorIdleAck($Ack,$Queue){
 if(-not $Ack -or $Ack.requestId -cne $Queue.requestId -or $Ack.action -cne 'status' -or $Ack.ok -ne $true -or $Ack.busy -ne $false -or
    $Ack.sourceRunId -cne $Queue.sourceRunId -or $Ack.scanSlot -cne $Queue.scanSlot -or $Ack.browser -cne $Queue.browser -or $Ack.state.requestId -cne $Queue.requestId){return $false}
 try{$at=[DateTimeOffset]::Parse($Ack.at);$start=[DateTimeOffset]::Parse($(if($Queue.startRequestedAt){$Queue.startRequestedAt}else{$Queue.firstPublishedAt}));return $at -ge $start -and $at -le [DateTimeOffset]::UtcNow.AddSeconds(30) -and ([DateTimeOffset]::UtcNow-$at).TotalSeconds -le 180}catch{return $false}
}
function Invoke-CompetitorPhase([string]$RepoPath,[string]$Folder){
 $slot=Get-ScanRecoverySlot;if(-not $slot){return}
 $path=Get-CompetitorQueuePath $RepoPath $slot;$q=Read-ScanRecoveryJson $path
 if(-not $q){return}
 if($q.version -ne 1 -or $q.scope -ne 'competitors' -or $q.scanSlot -cne $slot -or $q.requestId -cnotmatch '^[a-f0-9]{32}$' -or $q.sourceRunId -cnotmatch '^[a-f0-9]{32}$' -or $q.initialCommit -cnotmatch '^[a-f0-9]{40}$' -or $q.attempt -cnotin @('primary','edge') -or $q.browser -cnotin @('chrome','whale','edge') -or $q.targets -isnot [array]){throw 'Invalid competitor queue'}
 $now=[DateTimeOffset]::UtcNow
 if($q.state -cin @('complete','expired','superseded','integrity-failed')){return}
 if($q.nextCheckAt -and $now -lt [DateTimeOffset]::Parse($q.nextCheckAt)){return}
 try{
  if($q.state -eq 'uploaded'){
   if(Get-BlueDeploymentSuccess $q.finalCommit){$q.state='complete'};return
  }
  if($now -ge [DateTimeOffset]::Parse($q.publicationDeadline)){$q.state='expired';return}
  if($q.state -eq 'waiting-deployment'){
   $published=Get-BlueDeploymentSuccess $q.initialCommit;if(-not $published){return}
   $q.firstPublishedAt=$published.at;$q.state='ready'
  }
  $resultPath=Join-Path $Folder ('competitor-'+$q.requestId+'-result.json')
  if($q.state -in @('starting','collecting','publishing') -and (Test-Path $resultPath)){
   $r=Read-ScanRecoveryJson $resultPath
   if(-not $r -or $r.scope -ne 'competitors' -or $r.requestId -cne $q.requestId -or $r.sourceRunId -cne $q.sourceRunId -or $r.scanSlot -cne $q.scanSlot -or $r.terminal -ne $true){$q.state='integrity-failed';throw 'Invalid competitor result'}
   if($r.stoppedReason -in @('access-check','worker-error') -and $q.attempt -eq 'primary' -and $now.AddSeconds(75) -lt [DateTimeOffset]::Parse($q.deadlineAt)){
    # The stopped worker must be idle before a different browser takes ownership.
    $ack=Read-ScanRecoveryJson (Join-Path $Folder ('competitor-'+$q.requestId+'-status-ack.json'))
    if(-not (Test-CompetitorIdleAck $ack $q)){Start-CompetitorPage $q $RepoPath 'status';return}
    $q.requestId=[guid]::NewGuid().ToString('N');$q.browser='edge';$q.attempt='edge';$q|Add-Member saveAttempts 0 -Force;$q.state='ready';return
   }
   $q.state='publishing';Write-ScanRecoveryJson $path $q
   Publish-CompetitorResult $q $path $resultPath $RepoPath $Folder;$q.state='uploaded';return
  }
  $ack=Read-ScanRecoveryJson (Join-Path $Folder ('competitor-'+$q.requestId+'-status-ack.json'))
  if($q.state -in @('starting','collecting') -and (Test-CompetitorIdleAck $ack $q) -and $ack.state.resultAvailable -eq $true){
   $attempts=if($q.saveAttempts){[int]$q.saveAttempts}else{0}
   if($attempts -lt 2){$q|Add-Member saveAttempts ($attempts+1) -Force;Write-ScanRecoveryJson $path $q;Start-CompetitorPage $q $RepoPath 'save-result';return}
  }
  if($q.noTargets -eq $true -or $now -ge [DateTimeOffset]::Parse($q.deadlineAt) -or ($q.state -eq 'ready' -and $now.AddSeconds(75) -ge [DateTimeOffset]::Parse($q.deadlineAt))){
   $empty=Join-Path $RepoPath ('reports\competitor-expired-'+$q.requestId+'.json')
   Write-ScanRecoveryJson $empty ([pscustomobject]@{version=1;scope='competitors';requestId=$q.requestId;sourceRunId=$q.sourceRunId;scanSlot=$q.scanSlot;browser=$q.browser;deadlineAt=$q.deadlineAt;terminal=$true;total=$q.targets.Count;startedAt=$q.firstPublishedAt;completedAt=$now.ToString('o');stoppedReason='budget';results=@()})
   Publish-CompetitorResult $q $path $empty $RepoPath $Folder;$q.state='uploaded';return
  }
  if($q.state -eq 'ready'){
   if(-not (Test-CompetitorOwnRecoveryReady $RepoPath $slot)){return}
   Invoke-CompetitorData $RepoPath 'verify-source' (Join-Path $Folder 'product-catalog.json') $path
   $plan=Invoke-CompetitorData $RepoPath 'plan' (Join-Path $Folder 'product-catalog.json');$keys=@($plan.targets|ForEach-Object {$_.competitorKey})
   $q.targets=@($q.targets|Where-Object {$_.competitorKey -cin $keys})
   if(-not $q.targets.Count){$q|Add-Member noTargets $true -Force;Write-ScanRecoveryJson $path $q;return}
   $q|Add-Member startRequestedAt $now.ToString('o') -Force
   $q.state='starting';Write-ScanRecoveryJson $path $q
   Start-CompetitorPage $q $RepoPath 'start';return
  }
  if($q.state -in @('starting','collecting')){
   if((Test-CompetitorIdleAck $ack $q) -and $ack.workerRestarted -eq $true -and $q.attempt -eq 'primary'){
    $q.requestId=[guid]::NewGuid().ToString('N');$q.browser='edge';$q.attempt='edge';$q|Add-Member saveAttempts 0 -Force;$q.state='ready';return
   }
   # A busy preflight is safe to repeat; an unacknowledged start is not.
   $started=Read-ScanRecoveryJson (Join-Path $Folder ('competitor-'+$q.requestId+'-start-ack.json'))
   if($started -and $started.requestId -ceq $q.requestId -and $started.action -ceq 'start' -and $started.ok -eq $false -and $started.reason -eq 'busy' -and $q.startRequestedAt){
    try{if([DateTimeOffset]::Parse($started.at) -ge [DateTimeOffset]::Parse($q.startRequestedAt)){$q.state='ready';return}}catch{}
   }
   Start-CompetitorPage $q $RepoPath 'status';$q.state='collecting'
  }
 }catch{$q.lastError=$_.Exception.Message;if($q.lastError -match 'superseded'){$q.state='superseded'};Add-Content (Join-Path $RepoPath 'reports\competitor-phase.log') -Encoding UTF8 -Value ($now.ToString('o')+' '+$q.lastError)}
 finally{$q.nextCheckAt=$now.AddMinutes(1).ToString('o');Write-ScanRecoveryJson $path $q}
}
