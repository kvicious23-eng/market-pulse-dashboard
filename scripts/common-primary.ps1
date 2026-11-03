# Shared Windows entry and sparse liveness checks. No product requests originate here.
function Get-CommonRequestPath([string]$RepoPath,[string]$Slot) {
 Join-Path $RepoPath ('reports\primary-request-'+(Get-PrimaryScanBrowser $Slot)+'-'+(Get-ScanSlotKey $Slot)+'.json')
}
function Read-CommonRequest([string]$RepoPath,[string]$Slot) {
 $q=Read-ScanRecoveryJson (Get-CommonRequestPath $RepoPath $Slot)
 if($q -and $q.scanSlot -ceq $Slot){return $q};return $null
}
function Get-CommonDeadline($Request) {
 $end=[DateTimeOffset]::Parse($Request.requestedAt).AddHours(2)
 $cap=[DateTimeOffset]::Parse($Request.scanSlot).AddMinutes(140);$next=Get-NextScanTime $Request.scanSlot
 if($cap -lt $end){$end=$cap};if($next -lt $end){$end=$next};$end
}
function Assert-CommonRequest($Request,[string]$Slot,$Catalog,[DateTimeOffset]$Now=[DateTimeOffset]::UtcNow) {
 $protocol=Get-CommonProtocolId $Slot
 if(-not $protocol -or -not $Request -or $Request.version -ne 1 -or $Request.primaryProtocolId -cne $protocol -or
  $Request.browser -cne (Get-PrimaryScanBrowser $Slot) -or $Request.scanSlot -cne $Slot -or
  $Request.policyId -cne (Get-ScanSlotPolicy $Slot).id -or $Request.requestId -cnotmatch '^[a-f0-9]{32}$'){throw 'Invalid common primary request'}
 $at=[DateTimeOffset]::Parse($Request.requestedAt);$slotAt=[DateTimeOffset]::Parse($Slot)
 if($at -lt $slotAt -or $at -gt $slotAt.AddMinutes(75) -or $at -gt $Now.AddMinutes(2)){throw 'Common request outside start window'}
 if(-not $Catalog -or $Catalog.products -isnot [array] -or $Request.targets -isnot [array]){throw 'Common catalogue/targets must be arrays'}
 foreach($key in @('itemId','vendorItemId')){if(@($Request.targets|Group-Object $key|Where-Object {$_.Count -gt 1}).Count){throw 'Duplicate common target ID'}}
 if(@($Request.targets|Group-Object {([string]$_.brand+'|'+[string]$_.mtm).ToLowerInvariant()}|Where-Object {$_.Count -gt 1}).Count){throw 'Duplicate common brand/model'}
 Assert-ScanCatalog $Catalog @($Request.targets)
 foreach($row in @($Request.targets)){
  $uri=[uri]$row.url
  if(-not $row.brand -or -not $row.mtm -or $row.productId -cnotmatch '^\d+$' -or $row.itemId -cnotmatch '^\d+$' -or $row.vendorItemId -cnotmatch '^\d+$' -or
    $uri.UserInfo -or -not $uri.IsDefaultPort -or [regex]::Matches($uri.Query,'(?:\?|&)itemId=').Count -ne 1 -or [regex]::Matches($uri.Query,'(?:\?|&)vendorItemId=').Count -ne 1 -or
    $uri.Scheme -ne 'https' -or $uri.Host -ne 'www.coupang.com' -or $uri.AbsolutePath -cne ('/vp/products/'+$row.productId) -or
    $uri.Query -notmatch ('(?:\?|&)itemId='+[regex]::Escape($row.itemId)+'(?:&|$)') -or
    $uri.Query -notmatch ('(?:\?|&)vendorItemId='+[regex]::Escape($row.vendorItemId)+'(?:&|$)')){throw 'Common product URL mismatch'}
 }
}
function Get-CommonStartWitness([string]$Folder,$Request) {
 Read-ScanRecoveryJson (Join-Path $Folder ($Request.browser+'-scan-start-'+(Get-ScanSlotKey $Request.scanSlot)+'-'+$Request.requestId+'.json'))
}
function Assert-CommonWitness($Witness,$Request,$Catalog) {
 Assert-ScanStartWitness $Witness $Request.scanSlot $Catalog $Request.browser -LatestStart (Get-CommonDeadline $Request).ToString('o') -AllowEmpty
 if($Witness.primaryRequestId -cne $Request.requestId -or $Witness.primaryProtocolId -cne $Request.primaryProtocolId -or
   [version]$Witness.extensionVersion -lt [version]'1.9.62' -or
   [DateTimeOffset]::Parse($Witness.startedAt) -lt [DateTimeOffset]::Parse($Request.requestedAt) -or
   [DateTimeOffset]::Parse($Witness.deadlineAt) -ne (Get-CommonDeadline $Request)){throw 'Common start witness mismatch'}
}
function Get-CommonSavedResult([string]$Folder,[string]$Slot,[string]$RepoPath,[DateTimeOffset]$Now=[DateTimeOffset]::UtcNow) {
 $q=Read-CommonRequest $RepoPath $Slot
 if(-not $q){return $null}
 $catalog=Read-ScanRecoveryJson (Join-Path $Folder 'product-catalog.json')
 Assert-CommonRequest $q $Slot $catalog $Now
 $w=Get-CommonStartWitness $Folder $q
 if(-not $w){return $null}
 $names=if($q.browser -eq 'chrome'){@('latest-coupang-scan.json',('latest-coupang-scan-'+$w.runId+'.json'))}else{@(('whale-scan-'+$w.runId+'.json'),('whale-scan-'+$w.runId+'-saved.json'))}
 foreach($f in @($names|ForEach-Object {Get-Item -LiteralPath (Join-Path $Folder $_) -ErrorAction SilentlyContinue}|Sort-Object LastWriteTimeUtc -Descending)){
  $d=Read-ScanRecoveryJson $f.FullName
  if(-not $d -or $d.browser -cne $q.browser -or $d.scanSlot -cne $Slot -or $d.primaryRequestId -cne $q.requestId -or $d.runId -cne $w.runId){continue}
  Assert-CommonPayload $d $q $w $catalog $Now
  return $f.FullName
 }
 return $null
}
function Get-CommonBrowser([string]$RepoPath,[string]$Browser) {
 . (Join-Path $PSScriptRoot 'browser-profile.ps1')
 $relative=if($Browser -eq 'chrome'){'Google\Chrome'}else{'Naver\Naver Whale'}
 $exeName=if($Browser -eq 'chrome'){'chrome.exe'}else{'whale.exe'}
 $exe=@($env:ProgramFiles,[Environment]::GetFolderPath('ProgramFilesX86'),$env:LOCALAPPDATA)|Where-Object {$_}|ForEach-Object {Join-Path $_ ($relative+'\Application\'+$exeName)}|Where-Object {Test-Path $_}|Select-Object -First 1
 $profiles=@(Get-BrowserExtensionInstallations (Join-Path $env:LOCALAPPDATA ($relative+'\User Data')) (Join-Path $RepoPath 'chrome-extension'))
 if(-not $exe -or $profiles.Count -ne 1){throw 'Exactly one common browser installation/profile is required'}
 [pscustomobject]@{exe=$exe;profile=$profiles[0].Profile;id=$profiles[0].Id}
}
function Send-CommonPrimaryPage([string]$RepoPath,[string]$Folder,$Request,[string]$Mode) {
 $browser=Get-CommonBrowser $RepoPath $Request.browser
 $nonce=[guid]::NewGuid().ToString('N')
 Write-ScanRecoveryJson (Join-Path $RepoPath ('chrome-extension\runtime\primary-request-'+$Request.requestId+'.json')) $Request
 $url='chrome-extension://'+$browser.id+'/common-primary.html?slot='+[uri]::EscapeDataString($Request.scanSlot)+'&requestId='+$Request.requestId+'&nonce='+$nonce+'&mode='+$Mode
 Start-Process $browser.exe -ArgumentList @(("--profile-directory="+[char]34+$browser.profile+[char]34),$url)
 $filename='common-primary-'+$Request.browser+'-'+(Get-ScanSlotKey $Request.scanSlot)+'-'+$Request.requestId+'-'+$nonce+'.json'
 $path=Join-Path $Folder $filename
 for($i=0;$i -lt 70;$i++){if(Test-Path $path){break};Start-Sleep -Milliseconds 500}
 $r=Read-ScanRecoveryJson $path
 if(-not $r){return $null}
 if($r.version -ne 1 -or $r.nonce -cne $nonce -or $r.mode -cne $Mode -or $r.browser -cne $Request.browser -or
   $r.scanSlot -cne $Request.scanSlot -or $r.requestId -cne $Request.requestId -or $r.primaryProtocolId -cne $Request.primaryProtocolId -or
   $r.policyId -cne $Request.policyId -or $r.verifyOnly -ne ($Mode -eq 'verify') -or
   [version]$r.workerVersion -lt [version]'1.9.62' -or
   [DateTimeOffset]::Parse($r.at) -gt [DateTimeOffset]::UtcNow.AddSeconds(5) -or
   ([DateTimeOffset]::UtcNow-[DateTimeOffset]::Parse($r.at)).TotalSeconds -gt 90){throw 'Common receipt mismatch'}
 return $r
}
function Assert-CommonFailure($Failure,[string]$Slot,$Catalog,$Request,$Witness,[DateTimeOffset]$Now=[DateTimeOffset]::UtcNow) {
 Assert-CommonRequest $Request $Slot $Catalog $Now
 Assert-CommonWitness $Witness $Request $Catalog
 if(-not $Failure -or $Failure.version -ne 1 -or $Failure.mode -cne 'freeze' -or $Failure.verifyOnly -ne $false -or
  $Failure.browser -cne $Request.browser -or $Failure.scanSlot -cne $Slot -or $Failure.requestId -cne $Request.requestId -or
  $Failure.primaryProtocolId -cne $Request.primaryProtocolId -or $Failure.nonce -cnotmatch '^[a-f0-9]{32}$' -or
  $Failure.status -cne 'edge-ready' -or $Failure.ok -ne $true -or $Failure.handoff -ne $true -or
  $Failure.running -ne $false -or $Failure.completed -ne $false -or $Failure.requestExists -ne $true -or
  $Failure.targetCount -ne @($Request.targets).Count -or $Failure.runId -cne $Witness.runId -or
  [version]$Failure.workerVersion -lt [version]'1.9.62' -or
  [DateTimeOffset]::Parse($Failure.deadlineAt) -ne (Get-CommonDeadline $Request) -or
  [DateTimeOffset]::Parse($Failure.deadlineAt) -le $Now -or
  [DateTimeOffset]::Parse($Failure.at) -gt $Now.AddSeconds(5) -or
  ($Now-[DateTimeOffset]::Parse($Failure.at)).TotalSeconds -gt 90){throw 'Unconfirmed common worker handoff'}
 if($Failure.retryCount -notin @(0,1)){throw 'Common retry count invalid'}
 if(-not $Failure.workerRestarted -and -not $Failure.stopAcknowledged){throw 'No confirmed restart or acknowledged stop'}
 if($Failure.workerRestarted -and ($Failure.originalWorkerInstanceId -cne $Witness.workerInstanceId -or
    $Failure.workerInstanceId -cnotmatch '^[a-f0-9]{32}$' -or $Failure.workerInstanceId -ceq $Witness.workerInstanceId)){throw 'Worker identity mismatch'}
}
function Invoke-CommonPrimaryStep([string]$RepoPath,[string]$Folder,[string]$Slot) {
 if(-not(Get-CommonProtocolId $Slot)){return}
 $existing=Read-EdgeOwnership $RepoPath $Slot
 if($existing -and $existing.scanSlot -ceq $Slot){return}
 if(Get-CommonSavedResult $Folder $Slot $RepoPath){return}
 $mutex=New-Object Threading.Mutex($false,('Local\MarketPulse.CommonProbe.'+(Get-ScanSlotKey $Slot)));$held=$false
 try{
  try{$held=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$held=$true};if(-not $held){return}
  $q=Read-CommonRequest $RepoPath $Slot
  if(-not $q){return}
  $catalog=Read-ScanRecoveryJson (Join-Path $Folder 'product-catalog.json');Assert-CommonRequest $q $Slot $catalog
  $now=[DateTimeOffset]::UtcNow
  if($now -ge (Get-CommonDeadline $q) -or $Slot -cne (Get-ScanRecoverySlot)){return}
  if($q.lastProbeAt -and ($now-[DateTimeOffset]::Parse($q.lastProbeAt)).TotalSeconds -lt 60){return}
  $q|Add-Member lastProbeAt $now.ToString('o') -Force;Write-ScanRecoveryJson (Get-CommonRequestPath $RepoPath $Slot) $q
  $state=Send-CommonPrimaryPage $RepoPath $Folder $q 'probe'
  if(-not $state -or $state.requestExists -ne $true){
   if([int]$q.launchAttempts -lt 2 -and ($now-[DateTimeOffset]::Parse($q.lastLaunchAt)).TotalSeconds -ge 120){
    $q.launchAttempts++;$q.lastLaunchAt=$now.ToString('o');Write-ScanRecoveryJson (Get-CommonRequestPath $RepoPath $Slot) $q
    $null=Send-CommonPrimaryPage $RepoPath $Folder $q 'start'
   }
   return
  }
  if($state.completed -or $state.accessStopRunId){return}
  if($state.running){
   if($state.requestRunning){
    $changed=if($state.progress.updatedAt){[DateTimeOffset]::Parse($state.progress.updatedAt)}else{[DateTimeOffset]::Parse($state.attemptStartedAt)}
    if(($now-$changed).TotalMinutes -ge 6 -and -not $q.stopRequestedAt){
     $stop=Send-CommonPrimaryPage $RepoPath $Folder $q 'stop'
     if($stop.ok -and $stop.requestRunning){$q|Add-Member stopRequestedAt $now.ToString('o') -Force;Write-ScanRecoveryJson (Get-CommonRequestPath $RepoPath $Slot) $q}
    }
   }
   return
  }
  if(-not $state.workerRestarted -and -not $state.stopAcknowledged){return}
  $proof=Send-CommonPrimaryPage $RepoPath $Folder $q 'freeze'
  if(-not $proof -or $proof.handoff -ne $true){return}
  $w=Get-CommonStartWitness $Folder $q
  Assert-CommonFailure $proof $Slot $catalog $q $w
  & (Join-Path $PSScriptRoot 'edge-fallback.ps1') -RepoPath $RepoPath -PrimaryFailure $proof -PrimaryBrowser $q.browser
 }finally{if($held){$mutex.ReleaseMutex()};$mutex.Dispose()}
}

function Assert-CommonPayload($Payload,$Request,$Witness,$Catalog,[DateTimeOffset]$Now=[DateTimeOffset]::UtcNow) {
 Assert-CommonWitness $Witness $Request $Catalog
 if(-not $Payload -or $Payload.version -ne 5 -or $Payload.browser -cne $Request.browser -or $Payload.scanSlot -cne $Request.scanSlot -or
   $Payload.primaryRequestId -cne $Request.requestId -or $Payload.primaryProtocolId -cne $Request.primaryProtocolId -or
   $Payload.policyId -cne $Request.policyId -or $Payload.runId -cne $Witness.runId -or $Payload.startedAt -cne $Witness.startedAt -or
   [version]$Payload.extensionVersion -lt [version]'1.9.62' -or $Payload.complete -ne $true -or
   $Payload.targetCount -ne @($Request.targets).Count -or $Payload.resultCount -ne @($Payload.results).Count -or
   $Payload.targetCount -ne @($Payload.results).Count -or
   [DateTimeOffset]::Parse($Payload.deadlineAt) -ne (Get-CommonDeadline $Request) -or
   [DateTimeOffset]::Parse($Payload.completedAt) -lt [DateTimeOffset]::Parse($Payload.startedAt) -or
   [DateTimeOffset]::Parse($Payload.completedAt) -gt (Get-CommonDeadline $Request) -or
   [DateTimeOffset]::Parse($Payload.completedAt) -gt $Now.AddMinutes(2) -or
   [math]::Abs(([DateTimeOffset]::Parse($Payload.scannedAt)-[DateTimeOffset]::Parse($Payload.completedAt)).TotalSeconds) -gt 1){throw 'Common payload provenance/time/count mismatch'}
 Assert-ScanCatalog $Catalog @($Payload.results)
 Assert-ScanCatalog ([pscustomobject]@{products=@($Request.targets)}) @($Payload.results)
}
function Get-CommonResultWaitDeadline([string]$RepoPath,[string]$Slot,[DateTimeOffset]$Fallback) {
 if(-not(Get-CommonProtocolId $Slot)){return $Fallback}
 $q=Read-CommonRequest $RepoPath $Slot
 if(-not $q){return $Fallback}
 # Only file-delivery grace; the collector deadline itself never changes.
 $end=(Get-CommonDeadline $q).AddSeconds(30)
 foreach($limit in @(([DateTimeOffset]::Parse($Slot)).AddMinutes(150),(Get-NextScanTime $Slot))){
  if($limit -lt $end){$end=$limit}
 }
 if($env:MARKET_PULSE_UPLOAD_DEADLINE){$limit=[DateTimeOffset]::Parse($env:MARKET_PULSE_UPLOAD_DEADLINE);if($limit -lt $end){$end=$limit}}
 $end
}
