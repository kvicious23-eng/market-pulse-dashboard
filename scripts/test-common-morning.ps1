$ErrorActionPreference='Stop'
$root=Join-Path ([IO.Path]::GetTempPath()) ('MPCommonMorning-'+[guid]::NewGuid().ToString('N'))
$folder=Join-Path $root 'Downloads';$scripts=Join-Path $root 'scripts'
$global:CommonMorningNow=[DateTimeOffset]'2026-11-04T08:45:00+09:00'
try{
 New-Item -ItemType Directory $folder,$scripts,(Join-Path $root 'chrome-extension') -Force|Out-Null
 Copy-Item (Join-Path $PSScriptRoot '..\chrome-extension\scan-policy.js') (Join-Path $root 'chrome-extension\scan-policy.js')
 foreach($name in @('scan-recovery.ps1','common-primary.ps1','brand-lifecycle.ps1','supplier-daily.ps1','supplier-metrics.ps1','git-timeout.ps1','browser-profile.ps1','supplier-after-edge.ps1')){
  $text=Get-Content (Join-Path $PSScriptRoot $name) -Raw -Encoding UTF8
  $text=$text.Replace('[DateTimeOffset]::UtcNow','$global:CommonMorningNow')
  $text|Set-Content (Join-Path $scripts $name) -Encoding UTF8
 }
 . (Join-Path $scripts 'supplier-daily.ps1')
 $slot='2026-11-04T08:00+09:00';$day=[datetime]'2026-11-04'
 $t=[pscustomobject]@{brand='Test';mtm='M';productId='1';itemId='2';vendorItemId='3';enabled=$true;url='https://www.coupang.com/vp/products/1?itemId=2&vendorItemId=3'}
 $catalog=[pscustomobject]@{products=@($t)};Write-ScanRecoveryJson (Join-Path $folder 'product-catalog.json') $catalog
 $q=[pscustomobject]@{version=1;browser='chrome';primaryProtocolId='windows-primary-v2';policyId=(Get-ScanSlotPolicy $slot).id;scanSlot=$slot;requestId=('e'*32);requestedAt=$slot;targets=@($t)}
 Write-ScanRecoveryJson (Get-CommonRequestPath $root $slot) $q
 $w=[pscustomobject]@{version=1;browser='chrome';extensionVersion='1.9.64';primaryProtocolId=$q.primaryProtocolId;policyId=$q.policyId;primaryRequestId=$q.requestId;runId=('a'*32);workerInstanceId=('b'*32);scanSlot=$slot;startedAt='2026-11-04T08:00:01+09:00';deadlineAt=(Get-CommonDeadline $q).ToString('o');targetCount=1;targets=@($t)}
 Write-ScanRecoveryJson (Join-Path $folder ('chrome-scan-start-'+(Get-ScanSlotKey $slot)+'-'+$q.requestId+'.json')) $w
 $p=[pscustomobject]@{version=5;browser='chrome';extensionVersion='1.9.64';primaryProtocolId=$q.primaryProtocolId;primaryRequestId=$q.requestId;policyId=$q.policyId;runId=$w.runId;scanSlot=$slot;startedAt=$w.startedAt;scannedAt='2026-11-04T08:20:00+09:00';completedAt='2026-11-04T08:20:00+09:00';deadlineAt=$w.deadlineAt;complete=$true;targetCount=1;resultCount=1;results=@($t)}
 Write-ScanRecoveryJson (Join-Path $folder 'latest-coupang-scan.json') $p
 if((Get-SupplierMorningSignal $folder $day $global:CommonMorningNow $root).source -ne 'chrome'){throw 'Common Chrome morning source rejected'}
 $legacy=Join-Path $root 'reports\edge-recovery.json';Write-ScanRecoveryJson $legacy ([pscustomobject]@{state='failed';scanSlot=$slot;runId=('f'*32)})
 if((Get-SupplierMorningSignal $folder $day $global:CommonMorningNow $root).source -ne 'chrome'){throw 'Legacy shared receipt contaminated common morning'}
 $r=[pscustomobject]@{version=1;state='result-ready';scanSlot=$slot;runId=('c'*32);reason='primary-worker-failed';chromeRunId=$w.runId;chromeStartedAt=$w.startedAt;triggeredAt='2026-11-04T08:25:00+09:00';primaryBrowser='chrome';primaryProtocolId=$q.primaryProtocolId;primaryRequestId=$q.requestId;policyId=$q.policyId;deadlineAt=$w.deadlineAt;targets=@($t)}
 $edge=[pscustomobject]@{version=5;browser='edge';extensionVersion='1.9.64';runId=$r.runId;scanSlot=$slot;policyId=$q.policyId;startedAt='2026-11-04T08:25:01+09:00';scannedAt='2026-11-04T08:40:00+09:00';completedAt='2026-11-04T08:40:00+09:00';deadlineAt=$w.deadlineAt;complete=$true;targetCount=1;resultCount=1;results=@($t);recovery=[pscustomobject]@{reason=$r.reason;chromeRunId=$w.runId;primaryBrowser='chrome';primaryProtocolId=$q.primaryProtocolId;primaryRequestId=$q.requestId;policyId=$q.policyId;deadlineAt=$w.deadlineAt}}
 $receiptPath=Get-EdgeReceiptPath $root $slot;$edgePath=Join-Path $folder ('edge-recovery-'+$r.runId+'.json')
 Write-ScanRecoveryJson $receiptPath $r;Write-ScanRecoveryJson $edgePath $edge
 if((Get-SupplierMorningSignal $folder $day $global:CommonMorningNow $root).source -ne 'edge'){throw 'Common worker-failure Edge morning source rejected'}
 foreach($state in @('started','failed')){
  $r.state=$state;Write-ScanRecoveryJson $receiptPath $r
  if(Get-SupplierMorningSignal $folder $day $global:CommonMorningNow $root){throw 'Pending/failed common Edge fell back to Chrome'}
 }
 $r.state='result-ready';Write-ScanRecoveryJson $receiptPath $r
 $edge.recovery.primaryRequestId='f'*32;Write-ScanRecoveryJson $edgePath $edge
 if(Get-SupplierMorningSignal $folder $day $global:CommonMorningNow $root){throw 'Unbound common Edge morning source admitted'}
 $edge.recovery.primaryRequestId=$q.requestId;Write-ScanRecoveryJson $edgePath $edge
 $oldLA=$env:LOCALAPPDATA;$oldPF=$env:ProgramFiles;$global:CommonMorningLaunches=0
 function Start-Process {param([string]$FilePath,[string[]]$ArgumentList);if($FilePath -notmatch 'chrome\.exe$' -or ($ArgumentList -join ' ') -notmatch 'daily-resume.html'){throw 'Unexpected launch'};$global:CommonMorningLaunches++}
 try{
  $env:LOCALAPPDATA=$root;$env:ProgramFiles=$root
  $profile=Join-Path $root 'Google\Chrome\User Data\Default';$exe=Join-Path $root 'Google\Chrome\Application\chrome.exe'
  New-Item -ItemType Directory $profile,(Split-Path $exe) -Force|Out-Null;New-Item -ItemType File $exe|Out-Null
  @{extensions=@{settings=@{('a'*32)=@{path=(Join-Path $root 'chrome-extension')};'djmlkkflbncanonpjhkdhghjmcompjnp'=@{path=(Join-Path $root 'supplier-hub-extension')}}}}|ConvertTo-Json -Depth 8|Set-Content (Join-Path $profile 'Secure Preferences') -Encoding UTF8
  $legacyHash=(Get-FileHash $legacy).Hash
  & (Join-Path $scripts 'supplier-after-edge.ps1') -RepoPath $root -ResultFolder $folder
  & (Join-Path $scripts 'supplier-after-edge.ps1') -RepoPath $root -ResultFolder $folder
  if($global:CommonMorningLaunches -ne 1 -or -not(Read-EdgeOwnership $root $slot).supplierResumeLaunchedAt){throw 'Common morning resume lost deduplication'}
  if((Get-FileHash $legacy).Hash -cne $legacyHash){throw 'Common resume changed historical shared receipt'}
 }finally{$env:LOCALAPPDATA=$oldLA;$env:ProgramFiles=$oldPF;Remove-Item Function:\Start-Process -ErrorAction SilentlyContinue}
 Write-Host 'Common morning Chrome/Edge ownership, worker failure, pending/failed isolation, bound request and one-time Supplier resume passed.'
}finally{Remove-Item $root -Recurse -Force -ErrorAction SilentlyContinue;Remove-Variable CommonMorningNow,CommonMorningLaunches -Scope Global -ErrorAction SilentlyContinue}
