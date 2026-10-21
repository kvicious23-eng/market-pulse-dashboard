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
 $proof=[pscustomobject]@{version=1;browser='whale';scanSlot=$slot;requestId=$request.requestId;status='edge-ready';handoff=$true;running=$false;completed=$false;requestExists=$true;retryCount=1;targetCount=1;workerVersion='1.9.46';at=$now.ToString('o');deadlineAt=$now.AddMinutes(60).ToString('o')}
 Assert-WhalePrimaryFailure $proof $slot $catalog $request $now
 $proof.running=$true;Reject {Assert-WhalePrimaryFailure $proof $slot $catalog $request $now};$proof.running=$false
 $proof.retryCount=0;Reject {Assert-WhalePrimaryFailure $proof $slot $catalog $request $now};$proof.retryCount=1
 $proof.at=$now.AddMinutes(-4).ToString('o');Reject {Assert-WhalePrimaryFailure $proof $slot $catalog $request $now}
 $empty=[pscustomobject]@{version=1;browser='whale';scanSlot=$slot;requestId=('e'*32);requestedAt=$request.requestedAt;targets=@()}
 Assert-WhalePrimaryRequest $empty $slot ([pscustomobject]@{products=@()}) $now
 Write-Host 'Whale noon routing, manual isolation, request/catalog/count/version/time admission, save proof and full Edge correlation passed.'
} finally {Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue}

# Real Windows watchdog/Edge transport with a fixed clock and fake browser processes.
# All files live in a disposable clone; no real browser, download or public data is touched.
$temp=Join-Path ([IO.Path]::GetTempPath()) ('MPWhaleFlow-'+[guid]::NewGuid().ToString('N'))
$oldProgramFiles=$env:ProgramFiles;$oldLocalAppData=$env:LOCALAPPDATA
$global:WhaleFlowFolder=Join-Path $temp 'Downloads';$global:WhaleFlowChecks=0;$global:WhaleFlowLaunches=0;$global:WhaleEdgeLaunches=0
function Get-Process {param($Id,[string]$ErrorAction)
 if($Id){return [pscustomobject]@{SessionId=1}}
 $global:WhaleFlowChecks++
 if($global:WhaleFlowChecks -eq 1){return [pscustomobject]@{SessionId=1;ProcessName='whale'}}
}
function Start-Sleep {param([int]$Seconds)}
function Start-Process {param([string]$FilePath,[string[]]$ArgumentList)
 $url=@($ArgumentList|Where-Object {$_ -match '^chrome-extension://'})[0];if(-not $url){throw 'Missing internal transport.'}
 $q=@{};foreach($pair in ([uri]$url).Query.TrimStart('?').Split('&')){$v=$pair.Split('=',2);$q[$v[0]]=[uri]::UnescapeDataString($v[1])}
 if($q.slot -cne '2026-10-21T12:00+09:00'){throw 'Wrong slot transport.'}
 if($FilePath -match 'whale.exe$'){
   if($q.ContainsKey('catalog') -or $url.Length -gt 256){throw 'Whale command URL must stay short.'}
   $request=Read-ScanRecoveryJson (Join-Path $env:ProgramFiles 'chrome-extension\runtime\noon-request.json')
   if($request.requestId -cne $q.requestId -or $request.scanSlot -cne $q.slot){throw 'Runtime request transport mismatch.'}
   $products=@($request.targets)
 }else{$transport=Read-ScanRecoveryJson (Join-Path $env:ProgramFiles 'chrome-extension\runtime\edge-request.json');$products=@($transport.products);$q.recovery=($transport.recovery|ConvertTo-Json -Compress)}
 if($products.Count -ne 1){throw 'Wrong full catalog transport.'}
 if($FilePath -match 'whale.exe$'){
   $global:WhaleFlowLaunches++
   if($url -notmatch '/primary.html\?' -or $q.requestId -notmatch '^[a-f0-9]{32}$'){throw 'Wrong Whale transport.'}
   $w=[pscustomobject]@{version=1;browser='whale';primaryRequestId=$q.requestId;scanSlot=$q.slot;runId=('b'*32);startedAt='2026-10-21T12:30:00+09:00';targetCount=1;targets=$products}
   Write-ScanRecoveryJson (Join-Path $global:WhaleFlowFolder 'whale-scan-start.json') $w
 }elseif($FilePath -match 'msedge.exe$'){
   $global:WhaleEdgeLaunches++;$c=$q.recovery|ConvertFrom-Json
   if($c.primaryBrowser -ne 'whale' -or $c.primaryRequestId -notmatch '^[a-f0-9]{32}$'){throw 'Missing Whale Edge correlation.'}
   $e=[pscustomobject]@{browser='edge';complete=$true;scanSlot=$q.slot;runId=$c.runId;recovery=$c;startedAt='2026-10-21T12:30:01+09:00';targetCount=1;resultCount=1;results=$products}
   Write-ScanRecoveryJson (Join-Path $global:WhaleFlowFolder ('edge-recovery-'+$c.runId+'.json')) $e
 }else{throw 'No Chrome launch is allowed at noon.'}
}
try {
 $env:ProgramFiles=$temp;$env:LOCALAPPDATA=$temp
 $scripts=Join-Path $temp 'scripts';$global:WhaleFlowScripts=$scripts;New-Item -ItemType Directory $scripts -Force|Out-Null
 foreach($name in @('scan-recovery.ps1','brand-lifecycle.ps1','browser-profile.ps1','run-scheduled-scan.ps1','edge-fallback.ps1')) {
   $s=Get-Content -Raw -Encoding UTF8 (Join-Path $PSScriptRoot $name)
   $s=$s.Replace("(Join-Path `$PSScriptRoot 'edge-fallback.ps1')","(Join-Path `$global:WhaleFlowScripts 'edge-fallback.ps1')")
   $s=$s.Replace('[DateTimeOffset]::UtcNow',"([DateTimeOffset]::Parse('2026-10-21T12:30:00+09:00'))")
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
 $request=Read-ScanRecoveryJson (Join-Path $temp 'reports\whale-primary-request.json')
 $receipt=Read-ScanRecoveryJson (Join-Path $temp 'reports\edge-recovery.json')
 if($global:WhaleFlowLaunches -ne 1 -or $global:WhaleEdgeLaunches -ne 1 -or $receipt.state -ne 'result-ready' -or $receipt.reason -ne 'whale-process-exit'){throw 'Whale exit recovery flow failed.'}
 $selected=Get-EdgeRecoveryResultPath $temp $global:WhaleFlowFolder $request.scanSlot
 $result=Read-ScanRecoveryJson $selected;Assert-PrimaryScanSource $result $request.scanSlot $global:WhaleFlowFolder $temp
 Remove-Item (Join-Path $temp 'reports\edge-recovery.json')
 $row|Add-Member ok $false -Force;$row|Add-Member reason 'access-check' -Force
 $payload=[pscustomobject]@{browser='whale';extensionVersion='1.9.44';complete=$true;scanSlot=$request.scanSlot;primaryRequestId=$request.requestId;runId=('b'*32);startedAt='2026-10-21T12:30:00+09:00';completedAt='2026-10-21T12:30:00+09:00';targetCount=1;resultCount=1;results=@($row)}
 $file=Join-Path $global:WhaleFlowFolder ('whale-scan-'+$payload.runId+'.json');Write-ScanRecoveryJson $file $payload
 & (Join-Path $scripts 'edge-fallback.ps1') -RepoPath $temp -PrimaryBrowser whale
 $receipt=Read-ScanRecoveryJson (Join-Path $temp 'reports\edge-recovery.json')
 if($global:WhaleEdgeLaunches -ne 2 -or $receipt.state -ne 'result-ready' -or $receipt.reason -ne 'access-check'){throw 'Whale access recovery flow failed.'}
 Remove-Item (Join-Path $temp 'reports\edge-recovery.json'),$file -Force
 $proof=[pscustomobject]@{version=1;browser='whale';primaryRequestId=$request.requestId;reason='file-save-error';error='FILE_ACCESS_DENIED';saveAttempts=2;stage='edge-ready';chromeRetries=1;scanSlot=$request.scanSlot;runId=('c'*32);firstStartedAt='2026-10-21T12:30:00+09:00';startedAt='2026-10-21T12:30:00+09:00';completedAt='2026-10-21T12:30:00+09:00';deadlineAt='2026-10-21T14:30:00+09:00';targetCount=1;targets=@($row)}
 Write-ScanRecoveryJson (Join-Path $global:WhaleFlowFolder ('scan-save-recovery-'+$proof.runId+'.json')) $proof
 Invoke-ScanSaveRecovery $temp $global:WhaleFlowFolder $request.scanSlot
 $receipt=Read-ScanRecoveryJson (Join-Path $temp 'reports\edge-recovery.json')
 if($global:WhaleEdgeLaunches -ne 3 -or $receipt.state -ne 'result-ready' -or $receipt.reason -ne 'file-save-error'){throw 'Whale save recovery flow failed.'}
 Invoke-ScanSaveRecovery $temp $global:WhaleFlowFolder $request.scanSlot
 if($global:WhaleEdgeLaunches -ne 3){throw 'Whale save handoff duplicated.'}
 Remove-Item (Join-Path $temp 'reports\edge-recovery.json') -Force
 $failed=[pscustomobject]@{version=1;browser='whale';scanSlot=$request.scanSlot;requestId=$request.requestId;status='edge-ready';handoff=$true;running=$false;completed=$false;requestExists=$true;retryCount=1;targetCount=1;workerVersion='1.9.46';at='2026-10-21T12:30:00+09:00';deadlineAt='2026-10-21T14:30:00+09:00'}
 & (Join-Path $scripts 'edge-fallback.ps1') -RepoPath $temp -PrimaryBrowser whale -PrimaryFailure $failed
 $receipt=Read-ScanRecoveryJson (Join-Path $temp 'reports\edge-recovery.json')
 if($global:WhaleEdgeLaunches -ne 4 -or $receipt.reason -ne 'whale-primary-failed' -or $receipt.state -ne 'result-ready'){throw 'Explicit inactive worker failure did not recover through Edge.'}
 & (Join-Path $scripts 'edge-fallback.ps1') -RepoPath $temp -PrimaryBrowser whale -PrimaryFailure $failed
 if($global:WhaleEdgeLaunches -ne 4){throw 'Worker-failure Edge handoff duplicated.'}
 Write-Host 'Isolated Whale launch/catalog/witness, exit/access/save-error -> full Edge receipt -> importer admission and handoff deduplication passed; no live browser touched.'
} finally {
 $env:ProgramFiles=$oldProgramFiles;$env:LOCALAPPDATA=$oldLocalAppData
 Remove-Item Function:\Get-Process,Function:\Start-Process,Function:\Start-Sleep -ErrorAction SilentlyContinue
 Remove-Variable WhaleFlowFolder,WhaleFlowChecks,WhaleFlowLaunches,WhaleEdgeLaunches,WhaleFlowScripts -Scope Global -ErrorAction SilentlyContinue
 Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue
}
