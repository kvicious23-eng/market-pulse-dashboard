$ErrorActionPreference='Stop'
$oldPF=$env:ProgramFiles;$oldLA=$env:LOCALAPPDATA
function Start-Sleep {param([int]$Seconds,[int]$Milliseconds)}
function Start-Process {
 param([string]$FilePath,[string[]]$ArgumentList)
 if($ArgumentList[0] -cne '--profile-directory="Profile 1"'){throw 'Spaced profile directory was not quoted'}
 if($FilePath -match 'msedge\.exe$'){
  $global:CommonEdges++
  $q=Read-ScanRecoveryJson (Join-Path $env:ProgramFiles 'chrome-extension\runtime\edge-request.json')
  if($q.products.Count -ne 2 -or $q.recovery.primaryProtocolId -ne 'windows-primary-v2'){throw 'Common Edge lost full targets/protocol'}
  $at=[DateTimeOffset]::Parse($q.recovery.triggeredAt)
  Write-ScanRecoveryJson (Join-Path $global:CommonFolder "edge-recovery-$($q.runId).json") ([pscustomobject]@{version=5;policyId=$q.recovery.policyId;browser='edge';extensionVersion='1.9.63';complete=$true;scanSlot=$q.scanSlot;runId=$q.runId;recovery=$q.recovery;startedAt=$at.AddMilliseconds(1).ToString('o');scannedAt=$at.AddMilliseconds(2).ToString('o');completedAt=$at.AddMilliseconds(2).ToString('o');targetCount=2;resultCount=2;results=@($q.products)})
  return
 }
 if($FilePath -notmatch '(chrome|whale)\.exe$'){throw 'Unexpected process in isolated common test'}
 $global:CommonStarts++;$url=$ArgumentList[-1];$nonce=[regex]::Match($url,'nonce=([a-f0-9]{32})').Groups[1].Value;$mode=[regex]::Match($url,'mode=([a-z]+)').Groups[1].Value
 $id=[regex]::Match($url,'requestId=([a-f0-9]{32})').Groups[1].Value
 $q=Read-ScanRecoveryJson (Join-Path $env:ProgramFiles ("chrome-extension\runtime\primary-request-$id.json"))
 $w=[pscustomobject]@{version=1;browser=$q.browser;extensionVersion='1.9.63';primaryProtocolId=$q.primaryProtocolId;policyId=$q.policyId;primaryRequestId=$q.requestId;runId=('a'*32);workerInstanceId=('b'*32);scanSlot=$q.scanSlot;startedAt=([DateTimeOffset]::Parse($q.requestedAt)).AddSeconds(1).ToString('o');deadlineAt=(Get-CommonDeadline $q).ToString('o');targetCount=2;targets=@($q.targets)}
 if($mode -eq 'retry'){throw 'Worker interruption must never request a primary retry'}
 $r=[pscustomobject]@{version=1;browser=$q.browser;workerVersion='1.9.63';primaryProtocolId=$q.primaryProtocolId;policyId=$q.policyId;scanSlot=$q.scanSlot;requestId=$id;nonce=$nonce;mode=$mode;verifyOnly=($mode -eq 'verify');at=$global:CommonNow.ToString('o');ok=$true;requestExists=$true;running=$false;requestRunning=$false;completed=$false;handoff=($mode -eq 'freeze');status=$(if($mode -eq 'freeze'){'edge-ready'}else{'accepted'});retryCount=$global:CommonRetry;targetCount=2;runId=$w.runId;deadlineAt=$w.deadlineAt;workerRestarted=$true;stopAcknowledged=$false;workerInstanceId=('c'*32);originalWorkerInstanceId=$w.workerInstanceId}
 Write-ScanRecoveryJson (Join-Path $global:CommonFolder ("common-primary-"+$q.browser+'-'+(Get-ScanSlotKey $q.scanSlot)+'-'+$id+'-'+$nonce+'.json')) $r
 if($mode -eq 'start'){
  Write-ScanRecoveryJson (Join-Path $global:CommonFolder ($q.browser+'-scan-start-'+(Get-ScanSlotKey $q.scanSlot)+'-'+$id+'.json')) $w
  if($global:CommonMode -eq 'healthy'){
   $p=[pscustomobject]@{version=5;policyId=$q.policyId;browser=$q.browser;extensionVersion='1.9.63';primaryProtocolId=$q.primaryProtocolId;scanSlot=$q.scanSlot;runId=$w.runId;primaryRequestId=$id;startedAt=$w.startedAt;scannedAt=$global:CommonNow.AddSeconds(2).ToString('o');completedAt=$global:CommonNow.AddSeconds(2).ToString('o');deadlineAt=$w.deadlineAt;complete=$true;targetCount=2;resultCount=2;results=@($q.targets)}
   $name=if($q.browser -eq 'chrome'){'latest-coupang-scan.json'}else{'whale-scan-'+$w.runId+'.json'}
   Write-ScanRecoveryJson (Join-Path $global:CommonFolder $name) $p
  }
 }
}
try{
 foreach($slot in @('2026-11-03T16:00+09:00','2026-11-03T20:00+09:00','2026-11-04T08:00+09:00','2026-11-04T12:00+09:00','2026-11-04T16:00+09:00','2026-11-04T20:00+09:00')){
 foreach($mode in @('healthy','worker','access','save')){
 $temp=Join-Path ([IO.Path]::GetTempPath()) ('MPCommon-'+[guid]::NewGuid().ToString('N'))
 try{
  $env:ProgramFiles=$temp;$env:LOCALAPPDATA=$temp;$global:CommonFolder=Join-Path $temp 'Downloads';$global:CommonEdges=0;$global:CommonStarts=0;$global:CommonRetry=0;$global:CommonMode=$mode
  $start=[DateTimeOffset]::Parse($slot);$global:CommonNow=$start.AddMinutes(3)
  New-Item -ItemType Directory (Join-Path $temp 'scripts'),(Join-Path $temp 'chrome-extension'),$global:CommonFolder -Force|Out-Null
  Copy-Item (Join-Path $PSScriptRoot '..\chrome-extension\scan-policy.js') (Join-Path $temp 'chrome-extension\scan-policy.js')
  foreach($name in @('scan-recovery.ps1','common-primary.ps1','run-common-primary.ps1','edge-fallback.ps1','brand-lifecycle.ps1','browser-profile.ps1')){
   $text=Get-Content (Join-Path $PSScriptRoot $name) -Raw -Encoding UTF8
   $text=$text.Replace('[DateTimeOffset]::UtcNow','$global:CommonNow')
   $text=$text.Replace('$resultFolder = Join-Path ([Environment]::GetFolderPath(''UserProfile'')) ''Downloads\MarketPulse''','$resultFolder=$global:CommonFolder')
   $text=$text.Replace('$folder=Join-Path ([Environment]::GetFolderPath(''UserProfile'')) ''Downloads\MarketPulse''','$folder=$global:CommonFolder')
   $text|Set-Content (Join-Path $temp ('scripts\'+$name)) -Encoding UTF8
  }
  . (Join-Path $temp 'scripts\scan-recovery.ps1');. (Join-Path $temp 'scripts\brand-lifecycle.ps1')
  $targets=@(1,4|ForEach-Object {[pscustomobject]@{brand='Test';mtm="M$_";enabled=$true;productId="$_";itemId="$($_+1)";vendorItemId="$($_+2)";url="https://www.coupang.com/vp/products/$($_)?itemId=$($_+1)&vendorItemId=$($_+2)";ok=$true}})
  $catalog=[pscustomobject]@{products=$targets};Write-ScanRecoveryJson (Join-Path $global:CommonFolder 'product-catalog.json') $catalog
  foreach($b in @(@{exe='Google\Chrome\Application\chrome.exe';data='Google\Chrome\User Data'},@{exe='Naver\Naver Whale\Application\whale.exe';data='Naver\Naver Whale\User Data'},@{exe='Microsoft\Edge\Application\msedge.exe';data='Microsoft\Edge\User Data'})){
   $exe=Join-Path $temp $b.exe;New-Item -ItemType Directory (Split-Path $exe) -Force|Out-Null;New-Item -ItemType File $exe|Out-Null
   $profile=Join-Path $temp ($b.data+'\Profile 1');New-Item -ItemType Directory $profile -Force|Out-Null
   @{extensions=@{settings=@{('d'*32)=@{path=(Join-Path $temp 'chrome-extension')}}}}|ConvertTo-Json -Depth 8|Set-Content (Join-Path $profile 'Secure Preferences') -Encoding UTF8
  }
  $q=[pscustomobject]@{version=1;browser=(Get-PrimaryScanBrowser $slot);primaryProtocolId=(Get-CommonProtocolId $slot);policyId=(Get-ScanSlotPolicy $slot).id;scanSlot=$slot;requestId=('e'*32);requestedAt=$start.ToString('o');targets=$targets;launchAttempts=1;lastLaunchAt=$start.ToString('o');lastProbeAt=$null;stopRequestedAt=$null}
  if($mode -eq 'healthy'){
   & (Join-Path $temp 'scripts\run-common-primary.ps1') -RepoPath $temp -Slot $slot
   $q=Read-CommonRequest $temp $slot;$p=Get-SavedPrimaryResultPath $global:CommonFolder $slot $temp $global:CommonNow.AddSeconds(5)
   if(-not $p){throw 'Common healthy result not selected'}
   Assert-PrimaryScanSource (Read-ScanRecoveryJson $p) $slot $global:CommonFolder $temp
   if($global:CommonEdges){throw 'Healthy primary incorrectly launched Edge'}
   $payload=Read-ScanRecoveryJson $p;$w=Get-CommonStartWitness $global:CommonFolder $q
   $priorAttempt=$payload|ConvertTo-Json -Depth 40|ConvertFrom-Json;$priorAttempt.runId=('f'*32);Write-ScanRecoveryJson $p $priorAttempt
   if(Get-CommonSavedResult $global:CommonFolder $slot $temp){throw 'Previous attempt shadowed current start witness'}
   Write-ScanRecoveryJson $p $payload
   foreach($url in @('https://user:secret@www.coupang.com/vp/products/1?itemId=2&vendorItemId=3','https://www.coupang.com:8443/vp/products/1?itemId=2&vendorItemId=3','https://www.coupang.com/vp/products/1?itemId=2&itemId=2&vendorItemId=3')){
    $bad=$q|ConvertTo-Json -Depth 20|ConvertFrom-Json;$bad.targets[0].url=$url;$denied=$false
    try{Assert-CommonRequest $bad $slot $catalog}catch{$denied=$true};if(-not $denied){throw 'Ambiguous or credential-bearing target URL admitted'}
   }
   $bad=$q|ConvertTo-Json -Depth 20|ConvertFrom-Json;$bad.targets+=@($bad.targets[0]);$denied=$false
   try{Assert-CommonRequest $bad $slot ([pscustomobject]@{products=$bad.targets})}catch{$denied=$true};if(-not $denied){throw 'Duplicate catalog reached browser launch'}
   foreach($field in @('browser','primaryRequestId','primaryProtocolId','policyId','runId','startedAt','deadlineAt','scannedAt','targetCount','resultCount')){
    $bad=$payload|ConvertTo-Json -Depth 40|ConvertFrom-Json;$bad.$field='invalid';$denied=$false
    try{Assert-CommonPayload $bad $q $w $catalog}catch{$denied=$true}
    if(-not $denied){throw ('Altered primary source admitted: '+$field)}
   }
   $bad=$payload|ConvertTo-Json -Depth 40|ConvertFrom-Json;$bad.results[0]|Add-Member price 123456 -Force;$denied=$false
   try{Assert-PrimaryScanSource $bad $slot $global:CommonFolder $temp}catch{$denied=$true}
   if(-not $denied){throw 'Same-run altered result was accepted as the saved source'}
   $clock=$global:CommonNow;$global:CommonNow=$start.AddMinutes(95)
   try{
    $late=$w|ConvertTo-Json -Depth 20|ConvertFrom-Json;$late.startedAt=$start.AddMinutes(90).ToString('o')
    Assert-CommonWitness $late $q $catalog
    $late.startedAt=(Get-CommonDeadline $q).AddSeconds(1).ToString('o');$denied=$false
    try{Assert-CommonWitness $late $q $catalog}catch{$denied=$true};if(-not $denied){throw 'Late retry extended original budget'}
   }finally{$global:CommonNow=$clock}
   $fallback=$global:CommonNow.AddMinutes(45);$originalEnv=$env:MARKET_PULSE_UPLOAD_DEADLINE
   try{
    $env:MARKET_PULSE_UPLOAD_DEADLINE=$null
    if((Get-CommonResultWaitDeadline $temp $slot $fallback) -ne (Get-CommonDeadline $q).AddSeconds(30)){throw 'Importer abandoned valid long collection'}
    $env:MARKET_PULSE_UPLOAD_DEADLINE=$global:CommonNow.AddMinutes(20).ToString('o')
    if((Get-CommonResultWaitDeadline $temp $slot $fallback) -ne [DateTimeOffset]::Parse($env:MARKET_PULSE_UPLOAD_DEADLINE)){throw 'Importer exceeded parent upload cutoff'}
   }finally{$env:MARKET_PULSE_UPLOAD_DEADLINE=$originalEnv}
   $brandDir=Join-Path $temp 'brand\test';New-Item -ItemType Directory $brandDir -Force|Out-Null
   $brandPath=Join-Path $brandDir 'market-data.js'
   $data=[pscustomobject]@{meta=@{snapshotAt=$payload.scannedAt};products=@()}
   Set-Content $brandPath ('window.MARKET_DATA = '+($data|ConvertTo-Json -Depth 5)+';') -Encoding UTF8
   Assert-ScanPublicationOrder $payload $temp
   $data.meta.snapshotAt=([DateTimeOffset]::Parse($payload.scannedAt)).AddMinutes(1).ToString('o')
   Set-Content $brandPath ('window.MARKET_DATA = '+($data|ConvertTo-Json -Depth 5)+';') -Encoding UTF8
   $hash=(Get-FileHash $brandPath -Algorithm SHA256).Hash;$denied=$false
   try{Assert-ScanPublicationOrder $payload $temp}catch{$denied=$true}
   if(-not $denied -or (Get-FileHash $brandPath -Algorithm SHA256).Hash -cne $hash){throw 'Older scan could roll back a newer snapshot'}
   $emptyQ=$q|ConvertTo-Json -Depth 20|ConvertFrom-Json;$emptyQ.targets=@()
   $emptyW=$w|ConvertTo-Json -Depth 20|ConvertFrom-Json;$emptyW.targets=@();$emptyW.targetCount=0
   Assert-CommonWitness $emptyW $emptyQ ([pscustomobject]@{products=@()})

  }else{
   Write-ScanRecoveryJson (Get-CommonRequestPath $temp $slot) $q
   $null=Send-CommonPrimaryPage $temp $global:CommonFolder $q 'start'
   $w=Get-CommonStartWitness $global:CommonFolder $q;Assert-CommonWitness $w $q $catalog
   foreach($field in @('requestId','browser','primaryProtocolId','policyId','requestedAt')){
    $bad=$q|ConvertTo-Json -Depth 12|ConvertFrom-Json
    $bad.$field='invalid';$rejected=$false
    try{Assert-CommonRequest $bad $slot $catalog}catch{$rejected=$true}
    if(-not $rejected){throw ('Invalid common request admitted: '+$field)}
   }
   $proof=[pscustomobject]@{version=1;mode='freeze';verifyOnly=$false;browser=$q.browser;scanSlot=$slot;requestId=$q.requestId;primaryProtocolId=$q.primaryProtocolId;nonce=('f'*32);status='edge-ready';ok=$true;handoff=$true;running=$false;completed=$false;requestExists=$true;targetCount=2;runId=$w.runId;workerVersion='1.9.63';deadlineAt=$w.deadlineAt;at=$global:CommonNow.ToString('o');retryCount=1;workerRestarted=$true;stopAcknowledged=$false;workerInstanceId=('c'*32);originalWorkerInstanceId=$w.workerInstanceId}
   Assert-CommonFailure $proof $slot $catalog $q $w
   foreach($field in @('requestId','primaryProtocolId','runId','targetCount','originalWorkerInstanceId','at')){
    $bad=$proof|ConvertTo-Json -Depth 8|ConvertFrom-Json;$bad.$field='invalid';$rejected=$false
    try{Assert-CommonFailure $bad $slot $catalog $q $w}catch{$rejected=$true}
    if(-not $rejected){throw ('Invalid common failure admitted: '+$field)}
   }
   foreach($field in @('running','completed')){
    $bad=$proof|ConvertTo-Json -Depth 8|ConvertFrom-Json;$bad.$field=$true;$rejected=$false
    try{Assert-CommonFailure $bad $slot $catalog $q $w}catch{$rejected=$true}
    if(-not $rejected){throw ('Unsafe common failure admitted: '+$field)}
   }

   if($mode -eq 'worker'){
    Invoke-CommonPrimaryStep $temp $global:CommonFolder $slot
    if($global:CommonRetry -ne 0){throw 'Worker retry was consumed before direct Edge handoff'}
   }elseif($mode -eq 'access'){
    $stop=[pscustomobject]@{version=1;browser=$q.browser;scanSlot=$slot;runId=$w.runId;extensionVersion='1.9.63';primaryProtocolId=$q.primaryProtocolId;policyId=$q.policyId;primaryRequestId=$q.requestId;startedAt=$w.startedAt;stoppedAt=$global:CommonNow.AddSeconds(-1).ToString('o');deadlineAt=$w.deadlineAt;terminal=$true;complete=$false;reason='access-check';stopReason='http-403-access-denied';targetCount=2;attemptedCount=1;targets=$targets;trigger=$targets[0];attempt=@{reason='access-check';diagnostic=@{observedAt=$global:CommonNow.AddSeconds(-2).ToString('o');responses=@(@{route='product';event='complete';status=403});page=@{marker='access denied';navigationStatus=403}}}}
    Write-ScanRecoveryJson (Join-Path $global:CommonFolder ('access-stop-'+$w.runId+'.json')) $stop
    Invoke-AccessStopRecovery $temp $global:CommonFolder $slot
   }else{
    $failure=[pscustomobject]@{version=1;browser=$q.browser;scanSlot=$slot;runId=$w.runId;primaryRequestId=$q.requestId;reason='file-save-error';error='FILE_ACCESS_DENIED';stage='edge-ready';chromeRetries=1;saveAttempts=2;firstStartedAt=$q.requestedAt;startedAt=$w.startedAt;completedAt=$global:CommonNow.AddSeconds(-1).ToString('o');deadlineAt=$w.deadlineAt;extensionVersion='1.9.63';targetCount=2;targets=$targets}
    Write-ScanRecoveryJson (Join-Path $global:CommonFolder ('scan-save-recovery-'+$w.runId+'.json')) $failure
    Invoke-ScanSaveRecovery $temp $global:CommonFolder $slot
   }
   $r=Read-ScanRecoveryJson (Get-EdgeReceiptPath $temp $slot)
   if($global:CommonEdges -ne 1 -or $r.state -ne 'result-ready' -or [DateTimeOffset]::Parse($r.deadlineAt) -ne (Get-CommonDeadline $q)){throw 'Common full Edge/budget flow failed'}
   $p=Get-EdgeRecoveryResultPath $temp $global:CommonFolder $slot;Assert-PrimaryScanSource (Read-ScanRecoveryJson $p) $slot $global:CommonFolder $temp
   Invoke-CommonPrimaryStep $temp $global:CommonFolder $slot;if($global:CommonEdges -ne 1){throw 'Common duplicate Edge'}
   $beforeStarts=$global:CommonStarts;& (Join-Path $temp 'scripts\run-common-primary.ps1') -RepoPath $temp -Slot $slot
   if($global:CommonStarts -ne $beforeStarts){throw 'Common primary restarted after Edge ownership'}
   $edgePath=$p;$goodEdge=Read-ScanRecoveryJson $edgePath;$receiptPath=Get-EdgeReceiptPath $temp $slot;$goodReceipt=Read-ScanRecoveryJson $receiptPath
   foreach($prior in @('started','monitor-timeout')){
    $interrupted=$goodReceipt|ConvertTo-Json -Depth 40|ConvertFrom-Json
    $interrupted.state=if($prior -eq 'started'){'started'}else{'failed'}
    if($prior -eq 'monitor-timeout'){$interrupted|Add-Member failureKind 'monitor-timeout' -Force}
    Write-ScanRecoveryJson $receiptPath $interrupted
    if((Get-EdgeRecoveryResultPath $temp $global:CommonFolder $slot) -cne $edgePath){throw 'Valid late Edge result was lost'}
    if((Read-EdgeOwnership $temp $slot).state -ne 'result-ready' -or $global:CommonEdges -ne 1){throw 'Reconciliation relaunched Edge or did not restore readiness'}
   }
   $interrupted=$goodReceipt|ConvertTo-Json -Depth 40|ConvertFrom-Json;$interrupted.state='failed';$interrupted|Add-Member failureKind 'monitor-timeout' -Force
   Write-ScanRecoveryJson $receiptPath $interrupted
   $holding=$edgePath+'.fixture';Move-Item $edgePath $holding
   $clock=$global:CommonNow
   try{
    if(Get-EdgeRecoveryResultPath $temp $global:CommonFolder $slot){throw 'Pending Edge invented a completed result'}
    $global:CommonNow=(Get-CommonDeadline $q).AddSeconds(31);$denied=$false
    try{Get-EdgeRecoveryResultPath $temp $global:CommonFolder $slot|Out-Null}catch{$denied=$true}
    if(-not $denied){throw 'Pending Edge wait exceeded original budget grace'}
   }finally{$global:CommonNow=$clock;Move-Item $holding $edgePath}
   foreach($field in @('primaryRequestId','primaryProtocolId','primaryBrowser','policyId')){
    $bad=$goodEdge|ConvertTo-Json -Depth 40|ConvertFrom-Json;$bad.recovery.$field='invalid';$denied=$false
    try{Assert-EdgeRecoveryResult $bad $goodReceipt $q.targets}catch{$denied=$true}
    if(-not $denied){throw ('Altered Edge context admitted: '+$field)}
   }
   $interrupted.failureKind='launch-or-validation-failed';Write-ScanRecoveryJson $receiptPath $interrupted;$denied=$false
   try{Get-EdgeRecoveryResultPath $temp $global:CommonFolder $slot|Out-Null}catch{$denied=$true}
   if(-not $denied){throw 'A real launch/integrity failure was silently reclassified'}
   Set-Content $receiptPath '{' -Encoding UTF8;$denied=$false
   try{Invoke-CommonPrimaryStep $temp $global:CommonFolder $slot}catch{$denied=$true}
   if(-not $denied -or $global:CommonEdges -ne 1){throw 'Corrupt ownership allowed another collection'}
   Write-ScanRecoveryJson $receiptPath $goodReceipt

  }
  Write-Host "Common slot=$slot browser=$($q.browser) mode=$mode passed."
 }finally{Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue}
 }}
}finally{
 $env:ProgramFiles=$oldPF;$env:LOCALAPPDATA=$oldLA
 Remove-Item Function:\Start-Sleep,Function:\Start-Process -ErrorAction SilentlyContinue
 Remove-Variable CommonStarts,CommonFolder,CommonEdges,CommonRetry,CommonMode,CommonNow -Scope Global -ErrorAction SilentlyContinue
}
