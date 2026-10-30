# Exercise the actual stop-proof -> full Edge transport -> source selection in
# isolated files. No live browser, network request or production state is used.
$ErrorActionPreference='Stop'
$originalProgramFiles=$env:ProgramFiles;$originalLocalAppData=$env:LOCALAPPDATA
function Must-Fail([scriptblock]$Action){$failed=$false;try{& $Action}catch{$failed=$true};if(-not $failed){throw 'Expected stop-proof rejection.'}}
function Checkpoint-NotLaunched {if($global:AccessStopLaunches -ne 0){throw 'Conflicting proof launched Edge.'}}
function Start-Sleep {param([int]$Seconds)}
function Start-Process {
  param([string]$FilePath,[string[]]$ArgumentList)
  if($FilePath -notmatch 'msedge\.exe$'){throw 'Unexpected browser launch.'}
  $global:AccessStopLaunches++
  $q=Read-ScanRecoveryJson (Join-Path $env:ProgramFiles 'chrome-extension\runtime\edge-request.json')
  if(@($q.products).Count -ne 2 -or $q.recovery.reason -cne 'access-check'){throw 'Edge did not receive the full pinned list.'}
  $at=[DateTimeOffset]::Parse($q.recovery.triggeredAt)
  $p=[pscustomobject]@{version=5;browser='edge';extensionVersion='1.9.55';complete=$true;scanSlot=$q.scanSlot;runId=$q.runId;recovery=$q.recovery;
    targetCount=2;resultCount=2;startedAt=$at.AddMilliseconds(1).ToString('o');completedAt=$at.AddMilliseconds(2).ToString('o');results=@($q.products)}
  Write-ScanRecoveryJson (Join-Path $global:AccessStopFolder ("edge-recovery-$($q.runId).json")) $p
}
try {
 foreach($slot in @('2026-10-30T08:00+09:00','2026-10-30T16:00+09:00','2026-10-30T12:00+09:00','2026-10-30T20:00+09:00')) {
  $temp=Join-Path ([IO.Path]::GetTempPath()) ('MPAccessStop-'+[guid]::NewGuid().ToString('N'))
  try {
   $env:ProgramFiles=$temp;$env:LOCALAPPDATA=$temp;$global:AccessStopFolder=Join-Path $temp 'Downloads';$global:AccessStopLaunches=0
   $start=[DateTimeOffset]::Parse($slot);$now=$start.AddMinutes(2)
   New-Item -ItemType Directory (Join-Path $temp 'scripts'),(Join-Path $temp 'chrome-extension'),$global:AccessStopFolder -Force|Out-Null
   Copy-Item (Join-Path $PSScriptRoot '..\chrome-extension\scan-policy.js') (Join-Path $temp 'chrome-extension\scan-policy.js')
   foreach($name in @('scan-recovery.ps1','edge-fallback.ps1','brand-lifecycle.ps1','browser-profile.ps1')) {
    $source=Get-Content (Join-Path $PSScriptRoot $name) -Raw -Encoding UTF8
    $source=$source.Replace('[DateTimeOffset]::UtcNow',"([DateTimeOffset]::Parse('$($now.ToString('o'))'))")
    if($name -eq 'edge-fallback.ps1') {
     $source=$source.Replace("`$resultFolder = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads\MarketPulse'",'$resultFolder=$global:AccessStopFolder')
    }
    $source|Set-Content (Join-Path $temp ('scripts\'+$name)) -Encoding UTF8
   }
   . (Join-Path $temp 'scripts\scan-recovery.ps1')
   . (Join-Path $temp 'scripts\brand-lifecycle.ps1')
   $browser=Get-PrimaryScanBrowser $slot
   $targets=@(1,4 | ForEach-Object {[pscustomobject]@{brand='Test';mtm="M$_";enabled=$true;productId="$_";itemId="$($_+1)";vendorItemId="$($_+2)";url="https://www.coupang.com/vp/products/$($_)?itemId=$($_+1)&vendorItemId=$($_+2)"}})
   $catalog=[pscustomobject]@{products=$targets}
   $w=[pscustomobject]@{version=1;browser=$browser;scanSlot=$slot;runId=('a'*32);extensionVersion='1.9.55';startedAt=$start.ToString('o');deadlineAt=$start.AddHours(2).ToString('o');policyId=(Get-ScanSlotPolicy $slot).id;primaryRequestId=$(if($browser -eq 'whale'){'b'*32}else{$null});targetCount=2;targets=$targets}
   $stop=[pscustomobject]@{version=1;browser=$browser;scanSlot=$slot;runId=$w.runId;extensionVersion=$w.extensionVersion;startedAt=$w.startedAt;deadlineAt=$w.deadlineAt;policyId=$w.policyId;primaryRequestId=$w.primaryRequestId;
    terminal=$true;complete=$false;reason='access-check';stopReason='http-403-access-denied';stoppedAt=$start.AddMinutes(1).ToString('o');targetCount=2;attemptedCount=1;targets=$targets;trigger=$targets[0];
    attempt=[pscustomobject]@{phase='initial';reason='access-check';diagnostic=[pscustomobject]@{observedAt=$start.AddSeconds(59).ToString('o');responses=@([pscustomobject]@{route='product';event='complete';status=403});page=[pscustomobject]@{marker='access denied';navigationStatus=403}}}}
   Write-ScanRecoveryJson (Join-Path $global:AccessStopFolder 'product-catalog.json') $catalog
   if($browser -eq 'whale') {
    $q=[pscustomobject]@{version=1;browser='whale';scanSlot=$slot;policyId=$w.policyId;requestId=$w.primaryRequestId;requestedAt=$w.startedAt;targets=$targets;launchAttempts=1}
    Write-ScanRecoveryJson (Get-WhaleRequestPath $temp $slot) $q
    $wpath=Join-Path $global:AccessStopFolder ('whale-scan-start-'+(Get-ScanSlotKey $slot)+'-'+$q.requestId+'.json')
    $health=[pscustomobject]@{scanSlot=$slot;requestId=$q.requestId;launchAttempt=1;status='access-stopped';at=$now.ToString('o')}
    if((Get-WhalePrimaryAction $health $w $q $start $now) -ne 'wait'){throw 'Whale access stop was treated as generic retry/failure.'}
   }else{$wpath=Join-Path $global:AccessStopFolder 'scan-start.json'}
   Write-ScanRecoveryJson $wpath $w
   Assert-AccessStop $stop $slot $catalog $w $temp $now
   foreach($change in @('status','marker','run','deadline','catalog','request','complete')) {
    if($change -eq 'request' -and $browser -ne 'whale'){continue}
    $bad=$stop|ConvertTo-Json -Depth 12|ConvertFrom-Json
    switch($change){
     status {$bad.attempt.diagnostic.responses[0].status=200}
     marker {$bad.attempt.diagnostic.page.marker='captcha'}
     run {$bad.runId='c'*32}
     deadline {$bad.deadlineAt=$now.AddSeconds(-1).ToString('o')}
     catalog {$bad.targets=@($bad.targets[0]);$bad.targetCount=1}
     request {$bad.primaryRequestId='c'*32}
     complete {$bad.complete=$true}
    }
    Must-Fail {Assert-AccessStop $bad $slot $catalog $w $temp $now}
   }
   $exe=Join-Path $temp 'Microsoft\Edge\Application\msedge.exe';New-Item -ItemType Directory (Split-Path $exe) -Force|Out-Null;New-Item -ItemType File $exe|Out-Null
   $profile=Join-Path $temp 'Microsoft\Edge\User Data\Default';New-Item -ItemType Directory $profile -Force|Out-Null
   @{extensions=@{settings=@{('d'*32)=@{path=(Join-Path $temp 'chrome-extension')}}}}|ConvertTo-Json -Depth 8|Set-Content (Join-Path $profile 'Secure Preferences') -Encoding UTF8
   $stopPath=Join-Path $global:AccessStopFolder ('access-stop-'+$w.runId+'.json')
   $savedPath=Join-Path $global:AccessStopFolder ('access-stop-'+$w.runId+'-saved.json')
   if($browser -eq 'whale'){Write-ScanRecoveryJson $savedPath $stop}else{
    Write-ScanRecoveryJson $stopPath $stop
    $bad=$stop|ConvertTo-Json -Depth 12|ConvertFrom-Json;$bad.trigger.itemId='999'
    Write-ScanRecoveryJson $savedPath $bad
    Must-Fail {Invoke-AccessStopRecovery $temp $global:AccessStopFolder $slot}
    Checkpoint-NotLaunched
    Write-ScanRecoveryJson $savedPath $stop
   }
   Invoke-AccessStopRecovery $temp $global:AccessStopFolder $slot
   $r=Read-ScanRecoveryJson (Get-EdgeReceiptPath $temp $slot)
   if($r.state -cne 'result-ready' -or $r.targets.Count -ne 2 -or $r.accessStopEvidence.runId -cne $w.runId -or $global:AccessStopLaunches -ne 1){throw 'Access stop full Edge flow failed.'}
   $selected=Get-EdgeRecoveryResultPath $temp $global:AccessStopFolder $slot
   Assert-PrimaryScanSource (Read-ScanRecoveryJson $selected) $slot $global:AccessStopFolder $temp
   Invoke-AccessStopRecovery $temp $global:AccessStopFolder $slot
   if($global:AccessStopLaunches -ne 1){throw 'Duplicate access stop launched Edge twice.'}
   Write-Host "$slot $browser stop proof -> full Edge -> pinned publication source, deduplication and negative evidence/budget/catalog tests passed."
  }finally{Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue}
 }
}finally{
 $env:ProgramFiles=$originalProgramFiles;$env:LOCALAPPDATA=$originalLocalAppData
 Remove-Item Function:\Start-Sleep,Function:\Start-Process -ErrorAction SilentlyContinue
 Remove-Variable AccessStopFolder,AccessStopLaunches -Scope Global -ErrorAction SilentlyContinue
}
