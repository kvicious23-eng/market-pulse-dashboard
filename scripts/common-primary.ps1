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
 if(-not $Catalog -or $null -eq $Catalog.products){throw 'Common catalogue unavailable'}
 Assert-ScanCatalog $Catalog @($Request.targets)
 foreach($row in @($Request.targets)){
  $uri=[uri]$row.url
  if($uri.Scheme -ne 'https' -or $uri.Host -ne 'www.coupang.com' -or $uri.AbsolutePath -cne ('/vp/products/'+$row.productId) -or
    $uri.Query -notmatch ('(?:\?|&)itemId='+[regex]::Escape($row.itemId)+'(?:&|$)') -or
    $uri.Query -notmatch ('(?:\?|&)vendorItemId='+[regex]::Escape($row.vendorItemId)+'(?:&|$)')){throw 'Common product URL mismatch'}
 }
}
function Get-CommonStartWitness([string]$Folder,$Request) {
 Read-ScanRecoveryJson (Join-Path $Folder ($Request.browser+'-scan-start-'+(Get-ScanSlotKey $Request.scanSlot)+'-'+$Request.requestId+'.json'))
}
function Assert-CommonWitness($Witness,$Request,$Catalog) {
 Assert-ScanStartWitness $Witness $Request.scanSlot $Catalog $Request.browser
 if($Witness.primaryRequestId -cne $Request.requestId -or $Witness.primaryProtocolId -cne $Request.primaryProtocolId -or
   [version]$Witness.extensionVersion -lt [version]'1.9.61' -or
   [DateTimeOffset]::Parse($Witness.startedAt) -lt [DateTimeOffset]::Parse($Request.requestedAt) -or
   [DateTimeOffset]::Parse($Witness.deadlineAt) -ne (Get-CommonDeadline $Request)){throw 'Common start witness mismatch'}
}
function Get-CommonSavedResult([string]$Folder,[string]$Slot,[string]$RepoPath,[DateTimeOffset]$Now=[DateTimeOffset]::UtcNow) {
 $q=Read-CommonRequest $RepoPath $Slot
 if(-not $q){return $null}
 $catalog=Read-ScanRecoveryJson (Join-Path $Folder 'product-catalog.json')
 Assert-CommonRequest $q $Slot $catalog $Now
 $filter=if($q.browser -eq 'chrome'){'latest-coupang-scan*.json'}else{'whale-scan-*.json'}
 foreach($f in @(Get-ChildItem $Folder -Filter $filter -File -ErrorAction SilentlyContinue|Sort-Object LastWriteTimeUtc -Descending)){
  if($q.browser -eq 'whale' -and $f.Name -cnotmatch '^whale-scan-[a-f0-9]{32}(?:-saved)?\.json$'){continue}
  if($q.browser -eq 'chrome' -and $f.Name -cnotmatch '^latest-coupang-scan(?:-[a-f0-9]{32})?\.json$'){continue}
  $d=Read-ScanRecoveryJson $f.FullName
  if(-not $d -or $d.browser -cne $q.browser -or $d.scanSlot -cne $Slot -or $d.primaryRequestId -cne $q.requestId){continue}
  if($d.runId -cnotmatch '^[a-f0-9]{32}$' -or [version]$d.extensionVersion -lt [version]'1.9.61' -or $d.primaryProtocolId -cne $q.primaryProtocolId -or
    $d.complete -ne $true -or $d.targetCount -ne @($d.results).Count -or $d.resultCount -ne @($d.results).Count -or
    [DateTimeOffset]::Parse($d.startedAt) -lt [DateTimeOffset]::Parse($q.requestedAt) -or
    [DateTimeOffset]::Parse($d.completedAt) -lt [DateTimeOffset]::Parse($d.startedAt) -or
    [DateTimeOffset]::Parse($d.completedAt) -gt $Now.AddMinutes(2) -or
    [DateTimeOffset]::Parse($d.completedAt) -gt (Get-CommonDeadline $q)){throw 'Invalid common completed result'}
  if($q.browser -eq 'whale' -and $f.Name -cnotmatch ('^whale-scan-'+$d.runId+'(?:-saved)?\.json$')){throw 'Invalid common Whale result path'}
  if($q.browser -eq 'chrome' -and $f.Name -cnotmatch ('^latest-coupang-scan(?:-'+$d.runId+')?\.json$')){throw 'Invalid common Chrome result path'}
  Assert-ScanCatalog $catalog @($d.results);Assert-ScanCatalog ([pscustomobject]@{products=@($q.targets)}) @($d.results)
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
 Start-Process $browser.exe -ArgumentList @(('--profile-directory='+$browser.profile),$url)
 $filename='common-primary-'+$Request.browser+'-'+(Get-ScanSlotKey $Request.scanSlot)+'-'+$Request.requestId+'-'+$nonce+'.json'
 $path=Join-Path $Folder $filename
 for($i=0;$i -lt 25;$i++){if(Test-Path $path){break};Start-Sleep -Milliseconds 500}
 $r=Read-ScanRecoveryJson $path
 if(-not $r){return $null}
 if($r.version -ne 1 -or $r.nonce -cne $nonce -or $r.mode -cne $Mode -or $r.browser -cne $Request.browser -or
   $r.scanSlot -cne $Request.scanSlot -or $r.requestId -cne $Request.requestId -or $r.primaryProtocolId -cne $Request.primaryProtocolId -or
   $r.policyId -cne $Request.policyId -or $r.verifyOnly -ne ($Mode -eq 'verify') -or
   [version]$r.workerVersion -lt [version]'1.9.61' -or
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
  [version]$Failure.workerVersion -lt [version]'1.9.61' -or
  [DateTimeOffset]::Parse($Failure.deadlineAt) -ne (Get-CommonDeadline $Request) -or
  [DateTimeOffset]::Parse($Failure.deadlineAt) -le $Now -or
  [DateTimeOffset]::Parse($Failure.at) -gt $Now.AddSeconds(5) -or
  ($Now-[DateTimeOffset]::Parse($Failure.at)).TotalSeconds -gt 90){throw 'Unconfirmed common worker handoff'}
 if($Request.browser -eq 'whale' -and $Failure.retryCount -ne 1){throw 'Whale bounded retry not consumed'}
 if($Request.browser -eq 'chrome' -and $Failure.retryCount -notin @(0,1)){throw 'Chrome retry count invalid'}
 if(-not $Failure.workerRestarted -and -not $Failure.stopAcknowledged){throw 'No confirmed restart or acknowledged stop'}
 if($Failure.workerRestarted -and ($Failure.originalWorkerInstanceId -cne $Witness.workerInstanceId -or
    $Failure.workerInstanceId -cnotmatch '^[a-f0-9]{32}$' -or $Failure.workerInstanceId -ceq $Witness.workerInstanceId)){throw 'Worker identity mismatch'}
}
function Invoke-CommonPrimaryStep([string]$RepoPath,[string]$Folder,[string]$Slot) {
 if(-not(Get-CommonProtocolId $Slot)){return}
 $existing=Read-ScanRecoveryJson (Get-EdgeReceiptPath $RepoPath $Slot)
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
  if($q.browser -eq 'whale' -and [int]$state.retryCount -lt 1 -and -not $state.handoff){
   $null=Send-CommonPrimaryPage $RepoPath $Folder $q 'retry';return
  }
  $proof=Send-CommonPrimaryPage $RepoPath $Folder $q 'freeze'
  if(-not $proof -or $proof.handoff -ne $true){return}
  $w=Get-CommonStartWitness $Folder $q
  Assert-CommonFailure $proof $Slot $catalog $q $w
  & (Join-Path $PSScriptRoot 'edge-fallback.ps1') -RepoPath $RepoPath -PrimaryFailure $proof -PrimaryBrowser $q.browser
 }finally{if($held){$mutex.ReleaseMutex()};$mutex.Dispose()}
}
