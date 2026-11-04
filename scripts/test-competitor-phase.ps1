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
function Publish-CompetitorResult($Queue,[string]$QueuePath,[string]$ResultPath,[string]$RepoPath,[string]$Folder){$script:published++;$Queue.finalCommit=('d'*40)}
function Check($v,$m){if(-not $v){throw $m}}
try{
 New-Item -ItemType Directory (Join-Path $root 'reports'),(Join-Path $root 'downloads') -Force|Out-Null
 $folder=Join-Path $root 'downloads';$path=Get-CompetitorQueuePath $root $slot
 $q=[pscustomobject]@{version=1;scope='competitors';state='waiting-deployment';scanSlot=$slot;sourceRunId=('a'*32);sourceStartedAt=$slot;initialCommit=('b'*40);deadlineAt=[DateTimeOffset]::UtcNow.AddHours(1).ToString('o');publicationDeadline=[DateTimeOffset]::UtcNow.AddHours(2).ToString('o');targets=@([pscustomobject]@{competitorKey='1-2-3'});requestId=('c'*32);browser='chrome';attempt='primary';firstPublishedAt=$null;nextCheckAt=$null;lastError=$null;finalCommit=$null}
 function Tick { $v=Read-ScanRecoveryJson $path;$v.nextCheckAt=$null;Write-ScanRecoveryJson $path $v;Invoke-CompetitorPhase $root $folder }
 Write-ScanRecoveryJson $path $q;Tick
 Check ($script:starts.Count -eq 0) 'Competitors started before Pages success'
 $script:deployed=$true;Tick;Check ($script:starts.Count -eq 1 -and $script:starts[0] -like 'start|chrome|*') 'First phase did not start after publication'
 Tick;Check (@($script:starts|Where-Object {$_ -like 'start|*'}).Count -eq 1) 'Lost acknowledgement replayed a start'
 $q=Read-ScanRecoveryJson $path;$originalDeadline=$q.deadlineAt
 $resultPath=Join-Path $folder ('competitor-'+$q.requestId+'-result.json')
 Write-ScanRecoveryJson $resultPath ([pscustomobject]@{scope='competitors';requestId=$q.requestId;sourceRunId=$q.sourceRunId;scanSlot=$slot;terminal=$true;stoppedReason='access-check'})
 Tick;Check ((Read-ScanRecoveryJson $path).browser -eq 'chrome') 'Edge started without idle proof'
 Write-ScanRecoveryJson (Join-Path $folder ('competitor-'+$q.requestId+'-status-ack.json')) ([pscustomobject]@{requestId=$q.requestId;busy=$false;state=[pscustomobject]@{requestId=$q.requestId}})
 Tick;$q=Read-ScanRecoveryJson $path
 Check ($q.browser -eq 'edge' -and $q.attempt -eq 'edge' -and $q.deadlineAt -ceq $originalDeadline) 'Edge lost the original competitor budget'
 Tick;Check (@($script:starts|Where-Object {$_ -like 'start|edge|*'}).Count -eq 1) 'Expected one Edge phase'
 Write-ScanRecoveryJson (Join-Path $folder ('competitor-'+$q.requestId+'-result.json')) ([pscustomobject]@{scope='competitors';requestId=$q.requestId;sourceRunId=$q.sourceRunId;scanSlot=$slot;terminal=$true;stoppedReason=$null})
 Tick;Check ($script:published -eq 1 -and (Read-ScanRecoveryJson $path).state -eq 'uploaded') 'Result was not separately published'
 Tick;Check ((Read-ScanRecoveryJson $path).state -eq 'complete') 'Final Pages success was not checked'
 Tick;Check ($script:published -eq 1) 'Complete queue published twice'
 $q.state='ready';$q.deadlineAt=[DateTimeOffset]::UtcNow.AddMinutes(-1).ToString('o');$q.nextCheckAt=$null;Write-ScanRecoveryJson $path $q
 $count=$script:starts.Count;Tick;Check ($script:starts.Count -eq $count) 'Expired competitor budget launched a browser'
 Write-Host 'Competitor Pages gate, no start replay, explicit idle Edge handoff, inherited budget, separate publication and final deployment gate passed.'
}finally{Remove-Item $root -Recurse -Force -ErrorAction SilentlyContinue}
