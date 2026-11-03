$ErrorActionPreference='Stop'
$oldProgramFiles=$env:ProgramFiles;$oldLocalAppData=$env:LOCALAPPDATA
function Start-Sleep {param([int]$Seconds,[int]$Milliseconds)}
function Start-Process {
 param([string]$FilePath,[string[]]$ArgumentList)
 if($FilePath -match 'chrome\.exe$'){
  $global:ProbeChrome++
  if($global:ProbeMode -eq 'missing'){return}
  $nonce=[regex]::Match(($ArgumentList -join ' '),'nonce=([a-f0-9]{32})').Groups[1].Value
  $w=Read-ScanRecoveryJson (Join-Path $global:ProbeFolder 'scan-start.json')
  $proof=[pscustomobject]@{version=1;browser='chrome';nonce=$nonce;scanSlot=$w.scanSlot;runId=$w.runId;observedAt=$global:ProbeNow.ToString('o');workerVersion='1.9.60';originalWorkerInstanceId=('b'*32);currentWorkerInstanceId=('c'*32);status='interrupted';reason='chrome-worker-interrupted';running=$false;primaryFrozen=$true;startedAt=$w.startedAt;deadlineAt=$w.deadlineAt;progressUpdatedAt=$global:ProbeNow.AddSeconds(-30).ToString('o');completed=2;total=2;stage='download'}
  switch($global:ProbeMode){'running'{$proof.status='running'};'wrong-run'{$proof.runId='f'*32};'stale'{$proof.observedAt=$global:ProbeNow.AddSeconds(-91).ToString('o')};'complete'{$proof.stage='complete'};'wrong-instance'{$proof.originalWorkerInstanceId='e'*32}}
  Write-ScanRecoveryJson (Join-Path $global:ProbeFolder "worker-probe-$nonce.json") $proof
  if($global:ProbeMode -eq 'late-completion'){Write-ScanRecoveryJson (Join-Path $global:ProbeFolder 'latest-coupang-scan.json') ([pscustomobject]@{browser='chrome';complete=$true;runId=$w.runId;scanSlot=$w.scanSlot;targetCount=2;resultCount=2;results=@($w.targets)})}
 }elseif($FilePath -match 'msedge\.exe$'){
  $global:ProbeEdge++
  $q=Read-ScanRecoveryJson (Join-Path $env:ProgramFiles 'chrome-extension\runtime\edge-request.json')
  if($q.products.Count -ne 2 -or $q.recovery.reason -ne 'chrome-worker-interrupted'){throw 'Wrong full Edge request'}
  $at=[DateTimeOffset]::Parse($q.recovery.triggeredAt)
  Write-ScanRecoveryJson (Join-Path $global:ProbeFolder "edge-recovery-$($q.runId).json") ([pscustomobject]@{version=5;browser='edge';extensionVersion='1.9.60';complete=$true;scanSlot=$q.scanSlot;runId=$q.runId;recovery=$q.recovery;targetCount=2;resultCount=2;startedAt=$at.AddMilliseconds(1).ToString('o');completedAt=$at.AddMilliseconds(2).ToString('o');results=@($q.products)})
 }else{throw 'Unexpected process in isolated test'}
}
try {
 foreach($mode in @('past-receipt','same-receipt','running','missing','wrong-run','stale','complete','wrong-instance','late-completion')){
  $temp=Join-Path ([IO.Path]::GetTempPath()) ('MPWorkerProbe-'+[guid]::NewGuid().ToString('N'))
  try{
   $env:ProgramFiles=$temp;$env:LOCALAPPDATA=$temp
   $global:ProbeMode=$mode;$global:ProbeChrome=0;$global:ProbeEdge=0
   $global:ProbeFolder=Join-Path $temp 'Downloads'
   $slot='2026-10-30T16:00+09:00';$start=[DateTimeOffset]::Parse($slot);$global:ProbeNow=$start.AddMinutes(3)
   New-Item -ItemType Directory (Join-Path $temp 'scripts'),(Join-Path $temp 'chrome-extension'),$global:ProbeFolder -Force|Out-Null
   Copy-Item (Join-Path $PSScriptRoot '..\chrome-extension\scan-policy.js') (Join-Path $temp 'chrome-extension\scan-policy.js')
   foreach($name in @('scan-recovery.ps1','edge-fallback.ps1','brand-lifecycle.ps1','browser-profile.ps1')){
    $source=Get-Content (Join-Path $PSScriptRoot $name) -Raw -Encoding UTF8
    $source=$source.Replace('[DateTimeOffset]::UtcNow',"([DateTimeOffset]::Parse('$($global:ProbeNow.ToString('o'))'))")
    if($name -eq 'edge-fallback.ps1'){$source=$source.Replace('$resultFolder = Join-Path ([Environment]::GetFolderPath(''UserProfile'')) ''Downloads\MarketPulse''','$resultFolder=$global:ProbeFolder')}
    $source|Set-Content (Join-Path $temp ('scripts\'+$name)) -Encoding UTF8
   }
   . (Join-Path $temp 'scripts\scan-recovery.ps1')
   . (Join-Path $temp 'scripts\brand-lifecycle.ps1')
   $targets=@(1,4|ForEach-Object {[pscustomobject]@{brand='Test';mtm="M$_";enabled=$true;productId="$_";itemId="$($_+1)";vendorItemId="$($_+2)";url="https://www.coupang.com/vp/products/$($_)?itemId=$($_+1)&vendorItemId=$($_+2)"}})
   $w=[pscustomobject]@{version=1;browser='chrome';runId=('a'*32);scanSlot=$slot;extensionVersion='1.9.60';workerInstanceId=('b'*32);startedAt=$start.ToString('o');deadlineAt=$start.AddHours(2).ToString('o');targetCount=2;targets=$targets}
   if((Get-ChromeWitnessMonitorDeadline $w $slot ([pscustomobject]@{products=$targets})) -ne $start.AddHours(2).UtcDateTime){throw 'Monitor lost the original deadline'}
   $badWitness=$w|ConvertTo-Json -Depth 8|ConvertFrom-Json;$badWitness.deadlineAt=$start.AddHours(3).ToString('o')
   $badFailed=$false;try{Get-ChromeWitnessMonitorDeadline $badWitness $slot ([pscustomobject]@{products=$targets})|Out-Null}catch{$badFailed=$true}
   if(-not $badFailed){throw 'Monitor accepted an extended deadline'}
   Write-ScanRecoveryJson (Join-Path $global:ProbeFolder 'scan-start.json') $w
   Write-ScanRecoveryJson (Join-Path $global:ProbeFolder 'product-catalog.json') @{products=$targets}
   foreach($browser in @(@{exe='Google\Chrome\Application\chrome.exe';data='Google\Chrome\User Data'},@{exe='Microsoft\Edge\Application\msedge.exe';data='Microsoft\Edge\User Data'})){
    $exe=Join-Path $temp $browser.exe;New-Item -ItemType Directory (Split-Path $exe) -Force|Out-Null;New-Item -ItemType File $exe|Out-Null
    $profile=Join-Path $temp ($browser.data+'\Default');New-Item -ItemType Directory $profile -Force|Out-Null
    @{extensions=@{settings=@{('d'*32)=@{path=(Join-Path $temp 'chrome-extension')}}}}|ConvertTo-Json -Depth 8|Set-Content (Join-Path $profile 'Secure Preferences') -Encoding UTF8
   }
   if($mode -in @('past-receipt','same-receipt')){
    Write-ScanRecoveryJson (Get-EdgeReceiptPath $temp $slot) @{scanSlot=$(if($mode -eq 'same-receipt'){$slot}else{'2026-10-30T08:00+09:00'});state='result-ready'}
   }
   $failed=$false;try{Invoke-ChromeWorkerRecovery $temp $global:ProbeFolder $slot}catch{$failed=$true;Write-Host $_}
   if($mode -in @('wrong-run','stale','complete','wrong-instance')){
    if(-not $failed -or $global:ProbeEdge){throw "Invalid proof was accepted: $mode"}
   }elseif($failed){throw "Valid isolated flow failed: $mode"}
   if($mode -eq 'past-receipt'){
    $r=Read-ScanRecoveryJson (Get-EdgeReceiptPath $temp $slot)
    if($global:ProbeChrome -ne 1 -or $global:ProbeEdge -ne 1 -or $r.state -ne 'result-ready' -or $r.deadlineAt -ne $w.deadlineAt){throw 'Past receipt blocked new slot or budget changed'}
    $path=Get-EdgeRecoveryResultPath $temp $global:ProbeFolder $slot
    Assert-PrimaryScanSource (Read-ScanRecoveryJson $path) $slot $global:ProbeFolder $temp
    Invoke-ChromeWorkerRecovery $temp $global:ProbeFolder $slot
    if($global:ProbeChrome -ne 1 -or $global:ProbeEdge -ne 1){throw 'Duplicate probe or Edge'}
   }elseif($global:ProbeEdge){throw "No Edge should launch: $mode"}
   if($mode -eq 'same-receipt' -and $global:ProbeChrome){throw 'Same-slot receipt failed deduplication'}
   Write-Host "Worker probe scenario $mode passed."
  }finally{Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue}
 }
}finally{
 $env:ProgramFiles=$oldProgramFiles;$env:LOCALAPPDATA=$oldLocalAppData
 Remove-Item Function:\Start-Sleep,Function:\Start-Process -ErrorAction SilentlyContinue
 Remove-Variable ProbeMode,ProbeChrome,ProbeEdge,ProbeFolder,ProbeNow -Scope Global -ErrorAction SilentlyContinue
}
