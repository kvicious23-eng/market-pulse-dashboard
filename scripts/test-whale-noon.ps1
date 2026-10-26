param([string]$FlowSlot='2026-10-21T12:00+09:00')
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'scan-recovery.ps1')
. (Join-Path $PSScriptRoot 'brand-lifecycle.ps1')
function Reject([scriptblock]$Action) {$failed=$false;try{& $Action}catch{$failed=$true};if(-not $failed){throw 'Expected rejection.'}}
$slot='2026-10-21T12:00+09:00';$now=[DateTimeOffset]::Parse('2026-10-21T12:30:00+09:00')
foreach($entry in @(@('2026-10-20T12:00+09:00','chrome'),@($slot,'whale'),@('2026-10-21T08:00+09:00','chrome'),@('2026-10-21T16:00+09:00','chrome'),@('2026-10-21T20:00+09:00','chrome'))) {
 if((Get-PrimaryScanBrowser $entry[0]) -cne $entry[1]){throw 'Wrong slot owner.'}
}
$temp=Join-Path ([IO.Path]::GetTempPath()) ('MPWhaleNoon-'+[guid]::NewGuid().ToString('N'))
try {
 $folder=Join-Path $temp 'Downloads';New-Item -ItemType Directory $folder -Force|Out-Null
 $row=[pscustomobject]@{brand='Example';mtm='A';enabled=$true;productId='1';itemId='2';vendorItemId='3';url='https://www.coupang.com/vp/products/1?itemId=2&vendorItemId=3'}
 $catalog=[pscustomobject]@{products=@($row)}
 $request=[pscustomobject]@{version=1;browser='whale';scanSlot=$slot;requestId=('a'*32);requestedAt='2026-10-21T12:00:01+09:00';targets=@($row)}
 Write-ScanRecoveryJson (Join-Path $temp 'reports\whale-primary-request.json') $request
 Write-ScanRecoveryJson (Join-Path $folder 'product-catalog.json') $catalog
 Assert-WhalePrimaryRequest $request $slot $catalog $now
 $launch=$now.AddMinutes(-3)
 Reject {Assert-WhalePrimaryStarted $null $null $request $launch $now}
 $start=[pscustomobject]@{scanSlot=$slot;primaryRequestId=$request.requestId}
 Assert-WhalePrimaryStarted $null $start $request $launch $now
 $start.primaryRequestId='z'*32;Reject {Assert-WhalePrimaryStarted $null $start $request $launch $now}
 $ack=[pscustomobject]@{scanSlot=$slot;requestId=$request.requestId;status='rejected';reason='request-file-mismatch'}
 Reject {Assert-WhalePrimaryStarted $ack $null $request $now $now}
 Assert-WhalePrimaryStarted $null $null $request $now $now
 Reject {Assert-WhalePrimaryRequest $request $slot $null $now}
 $payload=[pscustomobject]@{browser='whale';extensionVersion='1.9.44';complete=$true;scanSlot=$slot;primaryRequestId=$request.requestId;runId=('b'*32);startedAt='2026-10-21T12:00:02+09:00';completedAt='2026-10-21T12:20:00+09:00';targetCount=1;resultCount=1;results=@($row)}
 $manual=Join-Path $folder ('whale-validation-'+$payload.runId+'.json');Write-ScanRecoveryJson $manual $payload
 if(Get-SavedPrimaryResultPath $folder $slot $temp $now){throw 'Manual validation admitted.'}
 $file=Join-Path $folder ('whale-scan-'+$payload.runId+'.json');Write-ScanRecoveryJson $file $payload
 if((Get-SavedPrimaryResultPath $folder $slot $temp $now) -cne $file){throw 'Valid noon result not selected.'}
 $payload.primaryRequestId='c'*32;Write-ScanRecoveryJson $file $payload
 if(Get-SavedPrimaryResultPath $folder $slot $temp $now){throw 'Another request admitted.'}
 $payload.primaryRequestId=$request.requestId;$payload.targetCount=2;Write-ScanRecoveryJson $file $payload
 Reject {Get-SavedPrimaryResultPath $folder $slot $temp $now}
 $payload.targetCount=1;$payload.startedAt='2026-10-21T11:59:00+09:00';Write-ScanRecoveryJson $file $payload
 Reject {Get-SavedPrimaryResultPath $folder $slot $temp $now}
 $payload.startedAt='2026-10-21T12:00:02+09:00';$payload.results=@();Write-ScanRecoveryJson $file $payload
 Reject {Get-SavedPrimaryResultPath $folder $slot $temp $now}
 $payload.results=@($row);$payload.extensionVersion='1.9.43';Write-ScanRecoveryJson $file $payload
 Reject {Get-SavedPrimaryResultPath $folder $slot $temp $now}
 $payload.extensionVersion='1.9.44';Write-ScanRecoveryJson $file $payload
 $request.targets=@();Reject {Assert-WhalePrimaryRequest $request $slot $catalog $now};$request.targets=@($row)
 $save=[pscustomobject]@{version=1;browser='whale';primaryRequestId=$request.requestId;reason='file-save-error';error='FILE_ACCESS_DENIED';saveAttempts=2;stage='edge-ready';chromeRetries=1;scanSlot=$slot;runId=('c'*32);firstStartedAt='2026-10-21T12:00:02+09:00';startedAt='2026-10-21T12:10:00+09:00';completedAt='2026-10-21T12:29:00+09:00';deadlineAt='2026-10-21T14:00:02+09:00';targetCount=1;targets=@($row)}
 Assert-ScanSaveFailure $save $slot $catalog $now $temp
 $save.primaryRequestId='d'*32;Reject {Assert-ScanSaveFailure $save $slot $catalog $now $temp}
 $receipt=[pscustomobject]@{scanSlot=$slot;runId=('d'*32);reason='access-check';chromeRunId=$payload.runId;primaryBrowser='whale';primaryRequestId=$request.requestId;triggeredAt='2026-10-21T12:30:00+09:00'}
 $edge=[pscustomobject]@{browser='edge';complete=$true;scanSlot=$slot;runId=$receipt.runId;recovery=[pscustomobject]@{reason='access-check';chromeRunId=$payload.runId;primaryBrowser='whale';primaryRequestId=$request.requestId};startedAt='2026-10-21T12:30:01+09:00';targetCount=1;resultCount=1;results=@($row)}
 Assert-EdgeRecoveryResult $edge $receipt @($row)
 $edge.recovery.primaryRequestId='e'*32;Reject {Assert-EdgeRecoveryResult $edge $receipt @($row)}
 $edge.recovery.primaryRequestId=$request.requestId;$edge.results=@();Reject {Assert-EdgeRecoveryResult $edge $receipt @($row)}
 $request|Add-Member launchAttempts 1 -Force
 $qHealth=[pscustomobject]@{scanSlot=$slot;requestId=$request.requestId;launchAttempt=1;status='running';at=$now.ToString('o')}
 if((Get-WhalePrimaryAction $null $null $request $now.AddMinutes(-3) $now) -ne 'relaunch'){throw 'Missing startup did not get one bounded transport retry.'}
 $request.launchAttempts=2
 if((Get-WhalePrimaryAction $null $null $request $now.AddMinutes(-3) $now) -ne 'fail'){throw 'Missing startup allowed an unbounded retry.'}
 $request.launchAttempts=1
 $start.primaryRequestId=$request.requestId
 $qHealth.status='rejected';$qHealth|Add-Member reason 'primary-receipt-save-failed' -Force
 if((Get-WhalePrimaryAction $qHealth $start $request $now $now) -ne 'relaunch'){throw 'Legacy receipt I/O did not receive bounded page retry.'}
 $request.launchAttempts=2;$qHealth.launchAttempt=2
 if((Get-WhalePrimaryAction $qHealth $start $request $now $now) -ne 'monitor-degraded'){throw 'Receipt I/O ended real completion monitoring.'}
 if((Get-WhalePrimaryAction $null $start $request $now.AddMinutes(-4) $now) -ne 'monitor-degraded'){throw 'Lost heartbeat ended real completion monitoring.'}
 $qHealth.reason='request-file-mismatch'
 if((Get-WhalePrimaryAction $qHealth $start $request $now $now) -ne 'fail'){throw 'Real request rejection was hidden.'}
 $request.launchAttempts=1
 $r=[pscustomobject]@{version=1;browser='whale';scanSlot=$slot;requestId=$request.requestId;launchAttempt=1;status='running';at=$now.AddSeconds(-5).ToString('o');receiptVersion=2;receiptProducerVersion='1.9.48';pageId=('f'*32);sequence=2;receiptDelivery='unique-fallback'}
 $unique=Join-Path $folder ("whale-primary-acceptance-$($r.requestId)-$($r.pageId)-000002.json")
 Write-ScanRecoveryJson $unique $r
 $canonical=Join-Path $folder 'whale-primary-acceptance.json'
 $old=$r|ConvertTo-Json|ConvertFrom-Json;$old.at=$now.AddSeconds(-30).ToString('o');$old.status='rejected';$old.receiptDelivery='canonical'
 Write-ScanRecoveryJson $canonical $old
 (Get-Item $canonical).LastWriteTimeUtc=$now.AddHours(1).UtcDateTime
 if((Get-WhalePrimaryReceipt $folder $request $now).status -ne 'running'){throw 'Late canonical replaced newer unique event.'}
 $r.sequence=3;Write-ScanRecoveryJson $unique $r
 if((Get-WhalePrimaryReceipt $folder $request $now).status -ne 'rejected'){throw 'Filename sequence mismatch admitted.'}
 $r.sequence=2;$r.at=$now.AddMinutes(1).ToString('o');Write-ScanRecoveryJson $unique $r
 if((Get-WhalePrimaryReceipt $folder $request $now).status -ne 'rejected'){throw 'Future receipt admitted.'}
 $r.at=$now.AddSeconds(-5).ToString('o');$r.launchAttempt=2;Write-ScanRecoveryJson $unique $r
 if((Get-WhalePrimaryReceipt $folder $request $now).status -ne 'rejected'){throw 'Other launch admitted.'}
 $r.launchAttempt=1;$r.requestId='b'*32;Write-ScanRecoveryJson $unique $r
 if((Get-WhalePrimaryReceipt $folder $request $now).status -ne 'rejected'){throw 'Other request admitted.'}
 Set-Content -LiteralPath $unique -Value '{'
 if((Get-WhalePrimaryReceipt $folder $request $now).status -ne 'rejected'){throw 'Partial receipt hid valid canonical.'}
 $old.at='2026-10-21T11:59:59+09:00';Write-ScanRecoveryJson $canonical $old
 if(Get-WhalePrimaryReceipt $folder $request $now){throw 'Pre-request receipt admitted.'}
 Write-Host 'Receipt event ordering, namespace/request/launch/time/sequence binding, partial JSON and monitoring degradation guards passed.'
 $proof=[pscustomobject]@{version=1;browser='whale';scanSlot=$slot;requestId=$request.requestId;status='edge-ready';handoff=$true;running=$false;completed=$false;requestExists=$true;retryCount=1;targetCount=1;workerVersion='1.9.47';at=$now.ToString('o');deadlineAt=$now.AddMinutes(60).ToString('o')}
 Assert-WhalePrimaryFailure $proof $slot $catalog $request $now
 $proof.running=$true;Reject {Assert-WhalePrimaryFailure $proof $slot $catalog $request $now};$proof.running=$false
 $proof.retryCount=0;Reject {Assert-WhalePrimaryFailure $proof $slot $catalog $request $now};$proof.retryCount=1
 $proof.at=$now.AddMinutes(-4).ToString('o');Reject {Assert-WhalePrimaryFailure $proof $slot $catalog $request $now}
 $empty=[pscustomobject]@{version=1;browser='whale';scanSlot=$slot;requestId=('e'*32);requestedAt=$request.requestedAt;targets=@()}
 Assert-WhalePrimaryRequest $empty $slot ([pscustomobject]@{products=@()}) $now
 # Two scheduled Whale slots must remain independently readable after either runs.
 $n='2026-10-27T12:00+09:00';$e='2026-10-27T20:00+09:00';$later=[DateTimeOffset]::Parse('2026-10-27T20:35+09:00')
 if((Get-PrimaryScanBrowser '2026-10-25T20:00+09:00') -ne 'chrome' -or (Get-PrimaryScanBrowser '2026-10-26T20:00+09:00') -ne 'whale'){throw 'Activation changed historical routing.'}
 if((Get-NextScanTime $e) -ne [DateTimeOffset]::Parse('2026-10-28T08:00+09:00')){throw 'Evening next slot must be next-day 08.'}
 foreach($which in @($n,$e)) {
  $q=[pscustomobject]@{version=1;browser='whale';policyId=(Get-ScanSlotPolicy $which).id;scanSlot=$which;requestId=$(if($which -eq $n){'1'*32}else{'2'*32});requestedAt=$which;targets=@($row);launchAttempts=1}
  Write-ScanRecoveryJson (Get-WhaleRequestPath $temp $which) $q
  Assert-WhalePrimaryRequest $q $which $catalog $later
  $done=[pscustomobject]@{browser='whale';policyId=$q.policyId;extensionVersion='1.9.49';complete=$true;scanSlot=$which;primaryRequestId=$q.requestId;runId=$q.requestId;startedAt=$which;completedAt=([DateTimeOffset]::Parse($which).AddMinutes(16).ToString('o'));targetCount=1;resultCount=1;results=@($row)}
  Write-ScanRecoveryJson (Join-Path $folder ('whale-scan-'+$done.runId+'.json')) $done
 }
 if((Read-WhalePrimaryRequest $temp $n).requestId -ne ('1'*32) -or (Read-WhalePrimaryRequest $temp $e).requestId -ne ('2'*32)){throw 'Evening overwrote noon request.'}
 if(-not (Get-SavedPrimaryResultPath $folder $n $temp $later) -or -not (Get-SavedPrimaryResultPath $folder $e $temp $later)){throw 'Noon/evening saved result selection conflicted.'}
 $q=Read-WhalePrimaryRequest $temp $e;$q.policyId='whale-noon-v1';Reject {Assert-WhalePrimaryRequest $q $e $catalog $later}
 $q.policyId=(Get-ScanSlotPolicy $e).id;$q.requestedAt='2026-10-27T21:15+09:00'
 if((Get-WhaleDeadline $q) -ne [DateTimeOffset]::Parse('2026-10-27T22:20+09:00')){throw 'Night deadline was extended past budget.'}
 if((Get-EdgeReceiptPath $temp $n) -eq (Get-EdgeReceiptPath $temp $e)){throw 'Edge receipts share a Whale slot pointer.'}
 # A legacy pointer or another slot can never admit a post-activation request.
 Remove-Item (Get-WhaleRequestPath $temp $e) -Force
 Write-ScanRecoveryJson (Join-Path $temp 'reports\whale-primary-request.json') $q
 if(Read-WhalePrimaryRequest $temp $e){throw 'New evening admitted legacy request pointer.'}
 Write-Host 'Evening activation/history, next-day08, nighttime cap, dual-slot archives/results and policy/legacy isolation passed.'
 Write-Host 'Whale noon routing, manual isolation, request/catalog/count/version/time admission, save proof and full Edge correlation passed.'
} finally {Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue}

# Real Windows watchdog/Edge transport with a fixed clock and fake browser processes.
# All files live in a disposable clone; no real browser, download or public data is touched.
$temp=Join-Path ([IO.Path]::GetTempPath()) ('MPWhaleFlow-'+[guid]::NewGuid().ToString('N'))
$global:WhaleFlowSlot=$FlowSlot;$global:WhaleFlowStart=([DateTimeOffset]::Parse($FlowSlot).AddMinutes(30)).ToString('yyyy-MM-ddTHH:mm:sszzz');$global:WhaleFlowDeadline=([DateTimeOffset]::Parse($FlowSlot).AddHours(2)).ToString('yyyy-MM-ddTHH:mm:sszzz')
$oldProgramFiles=$env:ProgramFiles;$oldLocalAppData=$env:LOCALAPPDATA
$global:WhaleFlowFolder=Join-Path $temp 'Downloads';$global:WhaleFlowChecks=0;$global:WhaleFlowLaunches=0;$global:WhaleEdgeLaunches=0
function Get-Process {param($Id,[string]$ErrorAction)
 if($Id){return [pscustomobject]@{SessionId=1}}
 if($global:WhaleFlowReceiptMode){return [pscustomobject]@{SessionId=1;ProcessName='whale'}}
 $global:WhaleFlowChecks++
 if($global:WhaleFlowChecks -eq 1){return [pscustomobject]@{SessionId=1;ProcessName='whale'}}
}
function Start-Sleep {param([int]$Seconds)
 if($global:WhaleFlowReceiptMode){
  $global:WhaleFlowSleeps++
  if($global:WhaleFlowSleeps -ge 3){
   $current=Read-WhalePrimaryRequest $env:ProgramFiles $global:WhaleFlowSlot;$w=Get-WhaleStartWitness $global:WhaleFlowFolder $current
   $done=[pscustomobject]@{browser='whale';policyId=$current.policyId;extensionVersion='1.9.49';complete=$true;scanSlot=$w.scanSlot;primaryRequestId=$w.primaryRequestId;runId=$w.runId;startedAt=$w.startedAt;completedAt=$w.startedAt;targetCount=$w.targetCount;resultCount=$w.targetCount;results=@($w.targets)}
   Write-ScanRecoveryJson (Join-Path $global:WhaleFlowFolder ('whale-scan-'+$w.runId+'.json')) $done
  }
 }
}
function Start-Process {param([string]$FilePath,[string[]]$ArgumentList)
 $url=@($ArgumentList|Where-Object {$_ -match '^chrome-extension://'})[0];if(-not $url){throw 'Missing internal transport.'}
 $q=@{};foreach($pair in ([uri]$url).Query.TrimStart('?').Split('&')){$v=$pair.Split('=',2);$q[$v[0]]=[uri]::UnescapeDataString($v[1])}
 if($q.slot -cne $global:WhaleFlowSlot){throw 'Wrong slot transport.'}
 if($FilePath -match 'whale.exe$'){
   if($q.ContainsKey('catalog') -or $url.Length -gt 256){throw 'Whale command URL must stay short.'}
   $request=Read-ScanRecoveryJson (Join-Path $env:ProgramFiles ('chrome-extension\runtime\primary-request-'+$q.requestId+'.json'))
   if($request.requestId -cne $q.requestId -or $request.scanSlot -cne $q.slot){throw 'Runtime request transport mismatch.'}
   $products=@($request.targets)
 }else{$transport=Read-ScanRecoveryJson (Join-Path $env:ProgramFiles 'chrome-extension\runtime\edge-request.json');$products=@($transport.products);$q.recovery=($transport.recovery|ConvertTo-Json -Compress)}
 if($products.Count -ne 1){throw 'Wrong full catalog transport.'}
 if($FilePath -match 'whale.exe$'){
   $global:WhaleFlowLaunches++
   if($url -notmatch '/primary.html\?' -or $q.requestId -notmatch '^[a-f0-9]{32}$'){throw 'Wrong Whale transport.'}
   $w=[pscustomobject]@{version=1;browser='whale';policyId=$request.policyId;extensionVersion='1.9.49';primaryRequestId=$q.requestId;scanSlot=$q.slot;runId=('b'*32);startedAt=$global:WhaleFlowStart;targetCount=1;targets=$products}
   Write-ScanRecoveryJson (Join-Path $global:WhaleFlowFolder ('whale-scan-start-'+(Get-ScanSlotKey $global:WhaleFlowSlot)+'-'+$request.requestId+'.json')) $w
   if($global:WhaleFlowReceiptMode){
    $bad=[pscustomobject]@{version=1;receiptVersion=2;receiptProducerVersion='1.9.49';pageId=('e'*32);sequence=1;receiptDelivery='canonical';browser='whale';policyId=$request.policyId;scanSlot=$q.slot;requestId=$q.requestId;launchAttempt=$request.launchAttempts;status='rejected';reason='primary-receipt-save-failed';at=$global:WhaleFlowStart}
    Write-ScanRecoveryJson (Join-Path $global:WhaleFlowFolder ('whale-primary-acceptance-'+(Get-ScanSlotKey $global:WhaleFlowSlot)+'-'+$request.requestId+'.json')) $bad
   }
 }elseif($FilePath -match 'msedge.exe$'){
   $global:WhaleEdgeLaunches++;$c=$q.recovery|ConvertFrom-Json
   if($c.primaryBrowser -ne 'whale' -or $c.primaryRequestId -notmatch '^[a-f0-9]{32}$'){throw 'Missing Whale Edge correlation.'}
   $e=[pscustomobject]@{browser='edge';complete=$true;scanSlot=$q.slot;runId=$c.runId;recovery=$c;completedAt=([DateTimeOffset]::Parse($global:WhaleFlowStart).AddSeconds(2).ToString('o'));startedAt=([DateTimeOffset]::Parse($global:WhaleFlowStart).AddSeconds(1).ToString('o'));targetCount=1;resultCount=1;results=$products}
   Write-ScanRecoveryJson (Join-Path $global:WhaleFlowFolder ('edge-recovery-'+$c.runId+'.json')) $e
 }else{throw 'No Chrome launch is allowed at noon.'}
}
try {
 $env:ProgramFiles=$temp;$env:LOCALAPPDATA=$temp
  New-Item -ItemType Directory (Join-Path $temp 'chrome-extension') -Force|Out-Null
  Copy-Item (Join-Path $PSScriptRoot '..\chrome-extension\scan-policy.js') (Join-Path $temp 'chrome-extension\scan-policy.js')
 $scripts=Join-Path $temp 'scripts';$global:WhaleFlowScripts=$scripts;New-Item -ItemType Directory $scripts -Force|Out-Null
 foreach($name in @('scan-recovery.ps1','brand-lifecycle.ps1','browser-profile.ps1','run-scheduled-scan.ps1','edge-fallback.ps1')) {
   $s=Get-Content -Raw -Encoding UTF8 (Join-Path $PSScriptRoot $name)
   $s=$s.Replace("(Join-Path `$PSScriptRoot 'edge-fallback.ps1')","(Join-Path `$global:WhaleFlowScripts 'edge-fallback.ps1')")
   $s=$s.Replace('[DateTimeOffset]::UtcNow',"([DateTimeOffset]::Parse('$global:WhaleFlowStart'))")
   $s=$s.Replace('[DateTime]::UtcNow',"([DateTimeOffset]::Parse('$global:WhaleFlowStart').UtcDateTime)")
   $s=$s.Replace("`$folder=Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads\MarketPulse'",'$folder=$global:WhaleFlowFolder')
   $s=$s.Replace("`$resultFolder = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads\MarketPulse'",'$resultFolder=$global:WhaleFlowFolder')
   $s|Set-Content (Join-Path $scripts $name) -Encoding UTF8
 }
 foreach($exe in @('Naver\Naver Whale\Application\whale.exe','Microsoft\Edge\Application\msedge.exe')){
   $p=Join-Path $temp $exe;New-Item -ItemType Directory (Split-Path $p) -Force|Out-Null;New-Item -ItemType File $p|Out-Null
 }
 foreach($browser in @('Naver\Naver Whale','Microsoft\Edge')){
   $p=Join-Path $temp ($browser+'\User Data\Default');New-Item -ItemType Directory $p -Force|Out-Null
   @{extensions=@{settings=@{('a'*32)=@{path=(Join-Path $temp 'chrome-extension')}}}}|ConvertTo-Json -Depth 8|Set-Content (Join-Path $p 'Secure Preferences') -Encoding UTF8
 }
 Write-ScanRecoveryJson (Join-Path $global:WhaleFlowFolder 'product-catalog.json') $catalog
 & (Join-Path $scripts 'run-scheduled-scan.ps1') -RepoPath $temp
 . (Join-Path $scripts 'scan-recovery.ps1')
 $request=Read-WhalePrimaryRequest $temp $global:WhaleFlowSlot
 $receipt=Read-ScanRecoveryJson (Get-EdgeReceiptPath $temp $global:WhaleFlowSlot)
 if($global:WhaleFlowLaunches -ne 1 -or $global:WhaleEdgeLaunches -ne 1 -or $receipt.state -ne 'result-ready' -or $receipt.reason -ne 'whale-process-exit'){throw 'Whale exit recovery flow failed.'}
 $selected=Get-EdgeRecoveryResultPath $temp $global:WhaleFlowFolder $request.scanSlot
 $result=Read-ScanRecoveryJson $selected;Assert-PrimaryScanSource $result $request.scanSlot $global:WhaleFlowFolder $temp
 Remove-Item (Get-EdgeReceiptPath $temp $global:WhaleFlowSlot)
 $row|Add-Member ok $false -Force;$row|Add-Member reason 'access-check' -Force
 $payload=[pscustomobject]@{browser='whale';policyId=$request.policyId;extensionVersion='1.9.49';complete=$true;scanSlot=$request.scanSlot;primaryRequestId=$request.requestId;runId=('b'*32);startedAt=$global:WhaleFlowStart;completedAt=$global:WhaleFlowStart;targetCount=1;resultCount=1;results=@($row)}
 $file=Join-Path $global:WhaleFlowFolder ('whale-scan-'+$payload.runId+'.json');Write-ScanRecoveryJson $file $payload
 & (Join-Path $scripts 'edge-fallback.ps1') -RepoPath $temp -PrimaryBrowser whale
 $receipt=Read-ScanRecoveryJson (Get-EdgeReceiptPath $temp $global:WhaleFlowSlot)
 if($global:WhaleEdgeLaunches -ne 2 -or $receipt.state -ne 'result-ready' -or $receipt.reason -ne 'access-check'){throw 'Whale access recovery flow failed.'}
 Remove-Item (Get-EdgeReceiptPath $temp $global:WhaleFlowSlot),$file -Force
 $proof=[pscustomobject]@{version=1;browser='whale';primaryRequestId=$request.requestId;reason='file-save-error';error='FILE_ACCESS_DENIED';saveAttempts=2;stage='edge-ready';chromeRetries=1;scanSlot=$request.scanSlot;runId=('c'*32);firstStartedAt=$global:WhaleFlowStart;startedAt=$global:WhaleFlowStart;completedAt=$global:WhaleFlowStart;deadlineAt=$global:WhaleFlowDeadline;targetCount=1;targets=@($row)}
 Write-ScanRecoveryJson (Join-Path $global:WhaleFlowFolder ('scan-save-recovery-'+$proof.runId+'.json')) $proof
 Invoke-ScanSaveRecovery $temp $global:WhaleFlowFolder $request.scanSlot
 $receipt=Read-ScanRecoveryJson (Get-EdgeReceiptPath $temp $global:WhaleFlowSlot)
 if($global:WhaleEdgeLaunches -ne 3 -or $receipt.state -ne 'result-ready' -or $receipt.reason -ne 'file-save-error'){throw 'Whale save recovery flow failed.'}
 Invoke-ScanSaveRecovery $temp $global:WhaleFlowFolder $request.scanSlot
 if($global:WhaleEdgeLaunches -ne 3){throw 'Whale save handoff duplicated.'}
 Remove-Item (Get-EdgeReceiptPath $temp $global:WhaleFlowSlot) -Force
 $failed=[pscustomobject]@{version=1;browser='whale';policyId=$request.policyId;scanSlot=$request.scanSlot;requestId=$request.requestId;status='edge-ready';handoff=$true;running=$false;completed=$false;requestExists=$true;retryCount=1;targetCount=1;workerVersion='1.9.49';at=$global:WhaleFlowStart;deadlineAt=$global:WhaleFlowDeadline}
 & (Join-Path $scripts 'edge-fallback.ps1') -RepoPath $temp -PrimaryBrowser whale -PrimaryFailure $failed
 $receipt=Read-ScanRecoveryJson (Get-EdgeReceiptPath $temp $global:WhaleFlowSlot)
 if($global:WhaleEdgeLaunches -ne 4 -or $receipt.reason -ne 'whale-primary-failed' -or $receipt.state -ne 'result-ready'){throw 'Explicit inactive worker failure did not recover through Edge.'}
 & (Join-Path $scripts 'edge-fallback.ps1') -RepoPath $temp -PrimaryBrowser whale -PrimaryFailure $failed
 if($global:WhaleEdgeLaunches -ne 4){throw 'Worker-failure Edge handoff duplicated.'}
 Remove-Item (Get-EdgeReceiptPath $temp $global:WhaleFlowSlot),(Join-Path $global:WhaleFlowFolder 'scan-save-recovery-*.json') -Force
 Remove-Item (Get-WhaleRequestPath $temp $global:WhaleFlowSlot) -Force
 $global:WhaleFlowReceiptMode=$true;$global:WhaleFlowSleeps=0
 $beforeWhale=$global:WhaleFlowLaunches;$beforeEdge=$global:WhaleEdgeLaunches
 & (Join-Path $scripts 'run-scheduled-scan.ps1') -RepoPath $temp
 if($global:WhaleFlowLaunches -ne $beforeWhale+2 -or $global:WhaleEdgeLaunches -ne $beforeEdge){throw 'Receipt I/O caused unbounded page retry or inferred Edge.'}
 $watch=Get-Content (Join-Path $temp 'reports\scan-watchdog.log') -Raw
 if($watch -notmatch 'monitoring degraded' -or $watch -notmatch 'whale completed and saved JSON'){throw 'Degraded monitoring did not continue to saved completion.'}
 Write-Host 'Real watchdog isolated I/O flow: bounded same-ID page relaunch, degraded monitoring, eventual saved completion, no inferred Edge passed.'
 Write-Host 'Isolated Whale launch/catalog/witness, exit/access/save-error -> full Edge receipt -> importer admission and handoff deduplication passed; no live browser touched.'
} finally {
 $env:ProgramFiles=$oldProgramFiles;$env:LOCALAPPDATA=$oldLocalAppData
 Remove-Item Function:\Get-Process,Function:\Start-Process,Function:\Start-Sleep -ErrorAction SilentlyContinue
 Remove-Variable WhaleFlowFolder,WhaleFlowChecks,WhaleFlowLaunches,WhaleEdgeLaunches,WhaleFlowScripts,WhaleFlowReceiptMode,WhaleFlowSleeps,WhaleFlowSlot,WhaleFlowStart,WhaleFlowDeadline -Scope Global -ErrorAction SilentlyContinue
 Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue
}
