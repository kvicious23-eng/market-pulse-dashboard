$ErrorActionPreference='Stop'
$root=Join-Path ([IO.Path]::GetTempPath()) ('MPCompPhase-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $root -Force|Out-Null
. (Join-Path $PSScriptRoot 'scan-recovery.ps1')
. (Join-Path $PSScriptRoot 'brand-lifecycle.ps1')
. (Join-Path $PSScriptRoot 'git-timeout.ps1')
. (Join-Path $PSScriptRoot 'competitor-phase.ps1')
$slot='2026-11-04T08:00+09:00';$script:deployed=$false;$script:starts=@();$script:published=0
function Get-ScanRecoverySlot {return $slot}
function Start-CompetitorPage($Queue,[string]$RepoPath,[string]$Action){$script:starts+=@($Action+'|'+$Queue.browser+'|'+$Queue.requestId)}
function Get-BlueDeploymentSuccess([string]$Commit){if($script:deployed){return [pscustomobject]@{at=[DateTimeOffset]::UtcNow.AddMinutes(-5).ToString('o')}};return $null}
function Invoke-CompetitorData([string]$RepoPath,[string]$Mode,[string]$CatalogPath,[string]$QueuePath='',[string]$ResultPath=''){if($Mode -eq 'plan'){return [pscustomobject]@{targets=@([pscustomobject]@{competitorKey='1-2-3'})}}}
function Publish-CompetitorResult($Queue,[string]$QueuePath,[string]$ResultPath,[string]$RepoPath,[string]$Folder){$script:published++;$Queue.finalCommit=('d'*40)}
function Check($v,$m){if(-not $v){throw $m}}
try{
 New-Item -ItemType Directory (Join-Path $root 'reports'),(Join-Path $root 'downloads') -Force|Out-Null
 $folder=Join-Path $root 'downloads';$path=Get-CompetitorQueuePath $root $slot
 $q=[pscustomobject]@{version=1;scope='competitors';state='waiting-deployment';scanSlot=$slot;sourceRunId=('a'*32);sourceStartedAt=$slot;initialCommit=('b'*40);deadlineAt=[DateTimeOffset]::UtcNow.AddHours(1).ToString('o');publicationDeadline=[DateTimeOffset]::UtcNow.AddHours(2).ToString('o');targets=@([pscustomobject]@{competitorKey='1-2-3'});requestId=('c'*32);browser='chrome';attempt='primary';firstPublishedAt=$null;nextCheckAt=$null;lastError=$null;finalCommit=$null}
 function Tick { $v=Read-ScanRecoveryJson $path;$v.nextCheckAt=$null;Write-ScanRecoveryJson $path $v;Invoke-CompetitorPhase $root $folder }
 Write-ScanRecoveryJson $path $q;Tick
 Check ($script:starts.Count -eq 0) 'Competitors started before Pages success'
 $script:deployed=$true;
 $ownPath=Join-Path $root 'reports\blue-recovery-priority.json';Write-ScanRecoveryJson $ownPath ([pscustomobject]@{scanSlot=$slot;state='waiting-interval';publicationDeadline=[DateTimeOffset]::UtcNow.AddHours(1).ToString('o')});Tick;Check ($script:starts.Count -eq 0) 'Competitors starved pending own recovery';Remove-Item $ownPath
 Tick;Check ($script:starts.Count -eq 1 -and $script:starts[0] -like 'start|chrome|*') 'First phase did not start after publication'
 $admitted=Read-ScanRecoveryJson $path;Write-ScanRecoveryJson (Join-Path $folder ('competitor-'+$admitted.requestId+'-start-ack.json')) ([pscustomobject]@{requestId=$admitted.requestId;action='start';ok=$false;reason='busy';at=[DateTimeOffset]::UtcNow.AddMinutes(-2).ToString('o')})
 Tick;Check (@($script:starts|Where-Object {$_ -like 'start|*'}).Count -eq 1) 'Lost acknowledgement replayed a start'
 $q=Read-ScanRecoveryJson $path;$originalDeadline=$q.deadlineAt
 $resultPath=Join-Path $folder ('competitor-'+$q.requestId+'-result.json')
 Write-ScanRecoveryJson $resultPath ([pscustomobject]@{scope='competitors';requestId=$q.requestId;sourceRunId=$q.sourceRunId;scanSlot=$slot;terminal=$true;stoppedReason='access-check'})
 Tick;Check ((Read-ScanRecoveryJson $path).browser -eq 'chrome') 'Edge started without idle proof'
 Write-ScanRecoveryJson (Join-Path $folder ('competitor-'+$q.requestId+'-status-ack.json')) ([pscustomobject]@{requestId=$q.requestId;action='status';ok=$true;at=[DateTimeOffset]::UtcNow.ToString('o');sourceRunId=$q.sourceRunId;scanSlot=$q.scanSlot;browser=$q.browser;busy=$false;state=[pscustomobject]@{requestId=$q.requestId}})
 Tick;$q=Read-ScanRecoveryJson $path
 Check ($q.browser -eq 'edge' -and $q.attempt -eq 'edge' -and $q.deadlineAt -ceq $originalDeadline) 'Edge lost the original competitor budget'
 Tick;Check (@($script:starts|Where-Object {$_ -like 'start|edge|*'}).Count -eq 1) 'Expected one Edge phase'
 Write-ScanRecoveryJson (Join-Path $folder ('competitor-'+$q.requestId+'-result.json')) ([pscustomobject]@{scope='competitors';requestId=$q.requestId;sourceRunId=$q.sourceRunId;scanSlot=$slot;terminal=$true;stoppedReason=$null})
 Tick;Check ($script:published -eq 1 -and (Read-ScanRecoveryJson $path).state -eq 'uploaded') 'Result was not separately published'
 $done=Read-ScanRecoveryJson $path;$savedPub=$done.publicationDeadline;$done.publicationDeadline=[DateTimeOffset]::UtcNow.AddSeconds(-1).ToString('o');Write-ScanRecoveryJson $path $done;Tick;Check ((Read-ScanRecoveryJson $path).state -eq 'complete') 'Committed result lost Pages confirmation after publication cutoff';$done=Read-ScanRecoveryJson $path;$done.publicationDeadline=$savedPub;Write-ScanRecoveryJson $path $done
 Tick;Check ($script:published -eq 1) 'Complete queue published twice'
 $q.state='ready';$q.deadlineAt=[DateTimeOffset]::UtcNow.AddSeconds(45).ToString('o');$q.nextCheckAt=$null;Write-ScanRecoveryJson $path $q;$beforePublish=$script:published;Tick;Check ($script:published -eq $beforePublish+1 -and (Read-ScanRecoveryJson $path).state -eq 'uploaded') 'Short budget left competitor models pending instead of publishing not-collected'
 $q.state='ready';$q.deadlineAt=[DateTimeOffset]::UtcNow.AddMinutes(-1).ToString('o');$q.nextCheckAt=$null;Write-ScanRecoveryJson $path $q
 $count=$script:starts.Count;Tick;Check ($script:starts.Count -eq $count) 'Expired competitor budget launched a browser'
 # An idle terminal payload is re-exported without revisiting products or launching Edge.
 $q.state='collecting';$q.browser='chrome';$q.attempt='primary';$q.requestId=('e'*32);$q.deadlineAt=[DateTimeOffset]::UtcNow.AddMinutes(5).ToString('o');$q.nextCheckAt=$null;$q|Add-Member startRequestedAt ([DateTimeOffset]::UtcNow.AddMinutes(-1).ToString('o')) -Force;Write-ScanRecoveryJson $path $q
 $ack=[pscustomobject]@{requestId=$q.requestId;action='status';ok=$true;at=[DateTimeOffset]::UtcNow.ToString('o');sourceRunId=$q.sourceRunId;scanSlot=$q.scanSlot;browser=$q.browser;busy=$false;state=[pscustomobject]@{requestId=$q.requestId;resultAvailable=$true}}
 Write-ScanRecoveryJson (Join-Path $folder ('competitor-'+$q.requestId+'-status-ack.json')) $ack;Tick
 Check ($script:starts[-1] -like 'save-result|chrome|*') 'Completed results were not re-exported'
 $ack.sourceRunId=('f'*32);Check (-not (Test-CompetitorIdleAck $ack $q)) 'Unrelated idle acknowledgement accepted'
 # Real uploader budget uses seconds while extension slots omit them.
 function Invoke-MarketPulseGit {return [pscustomobject]@{Code=0;Output=@(('d'*40))}}
 $addRoot=Join-Path $root 'add';New-Item -ItemType Directory (Join-Path $addRoot 'reports') -Force|Out-Null
 $payload=[pscustomobject]@{scanSlot=$slot;extensionVersion='1.9.69';deadlineAt='2026-11-04T10:00:00+09:00';startedAt='2026-11-04T08:00:01+09:00';runId=('a'*32);browser='chrome'}
 foreach($budgetSlot in @('2026-11-04T08:00:00+09:00','2026-11-03T23:00:00Z')){
  $queueFile=Get-CompetitorQueuePath $addRoot $slot;Remove-Item $queueFile -Force -ErrorAction SilentlyContinue
  Write-ScanRecoveryJson (Join-Path $addRoot 'reports\scheduled-upload-budget.json') ([pscustomobject]@{scanSlot=$budgetSlot;deadlineAt='2026-11-04T10:30:00+09:00'})
  Add-CompetitorPhase $payload $addRoot $folder;Check (Test-Path $queueFile) 'Equivalent original publication budget failed to create queue'
 }
 Remove-Item $queueFile -Force;Write-ScanRecoveryJson (Join-Path $addRoot 'reports\scheduled-upload-budget.json') ([pscustomobject]@{scanSlot='2026-11-04T08:00:01+09:00';deadlineAt='2026-11-04T10:30:00+09:00'})
 $rejected=$false;try{Add-CompetitorPhase $payload $addRoot $folder}catch{$rejected=$true};Check $rejected 'Different original slot accepted'
 Write-Host 'Competitor normalized-slot queue creation, own recovery priority, Pages gate, no start replay, bound idle Edge, durable result re-export, short-budget publication and final deployment passed.'
}finally{Remove-Item $root -Recurse -Force -ErrorAction SilentlyContinue}
