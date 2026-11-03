param([string]$RepoPath='C:\MarketPulse',[string]$Slot)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'scan-recovery.ps1')
. (Join-Path $PSScriptRoot 'brand-lifecycle.ps1')
$folder=Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads\MarketPulse'
if(-not(Get-CommonProtocolId $Slot) -or $Slot -cne (Get-ScanRecoverySlot)){throw 'Common primary slot is not current'}
$lock=New-Object Threading.Mutex($false,('Local\MarketPulse.CommonStart.'+(Get-ScanSlotKey $Slot)));$held=$false
$log=Join-Path $RepoPath 'reports\scan-watchdog.log'
function Write-CommonLog([string]$Text){Add-Content $log -Encoding UTF8 -Value "[$([DateTimeOffset]::Now.ToString('o'))] Slot=$Slot; common primary: $Text"}
try{
 try{$held=$lock.WaitOne(0)}catch [Threading.AbandonedMutexException]{$held=$true};if(-not $held){return}
 $edge=Read-EdgeOwnership $RepoPath $Slot
 if($edge -and $edge.scanSlot -ceq $Slot){Write-CommonLog ('Edge already owns recovery; state='+$edge.state);return}
 $catalog=Read-ScanRecoveryJson (Join-Path $folder 'product-catalog.json')
 $path=Get-CommonRequestPath $RepoPath $Slot;$q=Read-CommonRequest $RepoPath $Slot
 if((Test-Path $path) -and -not $q){throw 'Common request corrupt; do not replace its identity'}
 if(-not $q){
  $now=[DateTimeOffset]::UtcNow
  $targets=@($catalog.products|Where-Object {$_.enabled -ne $false}|Select-Object brand,mtm,category,srp,enabled,productId,itemId,vendorItemId,url,danawaUrl,enuriUrl)
  $q=[pscustomobject]@{version=1;browser=(Get-PrimaryScanBrowser $Slot);primaryProtocolId=(Get-CommonProtocolId $Slot);policyId=(Get-ScanSlotPolicy $Slot).id;scanSlot=$Slot;requestId=[guid]::NewGuid().ToString('N');requestedAt=$now.ToString('o');targets=$targets;launchAttempts=0;lastLaunchAt=$now.ToString('o');lastProbeAt=$null;stopRequestedAt=$null}
 }
 Assert-CommonRequest $q $Slot $catalog
 if(Get-CommonSavedResult $folder $Slot $RepoPath){Write-CommonLog 'already complete; start skipped';return}
 if([int]$q.launchAttempts -lt 2){
  $q.launchAttempts++;$q.lastLaunchAt=[DateTimeOffset]::UtcNow.ToString('o');$q.lastProbeAt=$q.lastLaunchAt
  Write-ScanRecoveryJson $path $q
  $accepted=Send-CommonPrimaryPage $RepoPath $folder $q 'start'
  Write-CommonLog "browser=$($q.browser); request=$($q.requestId); start acknowledged=$([bool]$accepted.ok)"
 }else{Write-ScanRecoveryJson $path $q}
 $seen=$false;$absent=0;$session=(Get-Process -Id $PID).SessionId
 while([DateTimeOffset]::UtcNow -lt (Get-CommonDeadline $q)){
  $r=Read-EdgeOwnership $RepoPath $Slot
  if($r -and $r.scanSlot -ceq $Slot){Write-CommonLog "Edge owns recovery; state=$($r.state)";return}
  $saved=Get-CommonSavedResult $folder $Slot $RepoPath
  if($saved){Write-CommonLog 'completed result saved and verified';return}
  $alive=@(Get-Process|Where-Object {$_.ProcessName -eq $q.browser -and $_.SessionId -eq $session}).Count -gt 0
  if($alive){$seen=$true;$absent=0}elseif($seen){$absent++}
  $w=Get-CommonStartWitness $folder $q
  if($w -and $seen -and $absent -ge 2){
   Assert-CommonWitness $w $q $catalog
   $proof=[pscustomobject]@{chromeSeen=$true;absentChecks=$absent;observedAt=[DateTimeOffset]::UtcNow.ToString('o')}
   & (Join-Path $PSScriptRoot 'edge-fallback.ps1') -RepoPath $RepoPath -StartWitness $w -ExitProof $proof -PrimaryBrowser $q.browser
   return
  }
  Invoke-AccessStopRecovery $RepoPath $folder $Slot
  Invoke-ScanSaveRecovery $RepoPath $folder $Slot
  Invoke-CommonPrimaryStep $RepoPath $folder $Slot
  Start-Sleep -Seconds 10
 }
 Write-CommonLog 'original collection budget exhausted; no inferred recovery'
}finally{if($held){$lock.ReleaseMutex()};$lock.Dispose()}
