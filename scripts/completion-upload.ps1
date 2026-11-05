# Shares the production source selector and uploader; never publishes raw/partial files.
function Get-CompletedUploadCandidate([string]$RepoPath,[string]$Folder,[string]$Slot) {
 $Slot=([DateTimeOffset]::Parse($Slot)).ToOffset([TimeSpan]::FromHours(9)).ToString('yyyy-MM-ddTHH:mmzzz')
 $owner=Read-EdgeOwnership $RepoPath $Slot
 $path=if($owner){Get-EdgeRecoveryResultPath -RepoPath $RepoPath -ResultFolder $Folder -Slot $Slot}else{Get-SavedPrimaryResultPath $Folder $Slot $RepoPath}
 if(-not $path){return $null}
 $payload=Read-ScanRecoveryJson $path
 if(-not $payload -or $payload.complete -ne $true -or $payload.runId -cnotmatch '^[a-f0-9]{32}$' -or [DateTimeOffset]::Parse($payload.scanSlot) -ne [DateTimeOffset]::Parse($Slot)){throw 'Completion upload source identity invalid'}
 Assert-PrimaryScanSource $payload $Slot $Folder $RepoPath
 $catalogPath=Join-Path $Folder 'product-catalog.json'
 $catalog=Read-ScanRecoveryJson $catalogPath
 Assert-ScanCatalog -Catalog $catalog -Results @($payload.results)
 return [pscustomobject]@{scanSlot=$Slot;runId=$payload.runId;resultHash=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash;catalogHash=(Get-FileHash -LiteralPath $catalogPath -Algorithm SHA256).Hash;catalogPath=$catalogPath}
}
function Get-CompletedOwnFingerprint($Candidate,[string]$RepoPath) {
 if(-not $Candidate -or -not $Candidate.catalogPath){return $null}
 $prior=$ErrorActionPreference
 try{
  $ErrorActionPreference='Continue'
  $value=& node (Join-Path $RepoPath 'scripts\completion-state.mjs') $RepoPath $Candidate.catalogPath $Candidate.scanSlot $Candidate.runId 2>$null
  if($LASTEXITCODE -eq 0 -and ($value -join '') -cmatch '^[a-f0-9]{64}$'){return ($value -join '')}
 }finally{$ErrorActionPreference=$prior}
 return $null
}
function Test-CompletedUploadReceipt($Receipt,$Candidate,[string]$RepoPath) {
 if(Test-Path (Join-Path $RepoPath 'reports\price-publication-transaction.json')){return $false}
 if(-not $Receipt -or -not $Candidate -or $Receipt.version -ne 2 -or $Receipt.commit -cnotmatch '^[a-f0-9]{40}$' -or $Receipt.ownFingerprint -cnotmatch '^[a-f0-9]{64}$'){return $false}
 foreach($key in @('runId','resultHash','catalogHash')){if($Receipt.$key -cne $Candidate.$key){return $false}}
 if([DateTimeOffset]::Parse($Receipt.scanSlot) -ne [DateTimeOffset]::Parse($Candidate.scanSlot)){return $false}
 # Descendant competitor/Supplier commits must not be replaced by an old own import.
 $r=Invoke-MarketPulseGit -RepoPath $RepoPath -Arguments @('merge-base','--is-ancestor',$Receipt.commit,'HEAD')
 if($r.Code -ne 0){return $false}
 return (Get-CompletedOwnFingerprint $Candidate $RepoPath) -ceq $Receipt.ownFingerprint
}
function Invoke-CompletionUpload([string]$RepoPath,[string]$Folder,[string]$Slot) {
 if(-not $Slot -or -not(Get-CommonProtocolId $Slot)){return $false}
 $budgetPath=Join-Path $RepoPath 'reports\scheduled-upload-budget.json'
 $budget=Read-ScanRecoveryJson $budgetPath
 if((Test-Path $budgetPath) -and -not $budget){throw 'Corrupt upload budget; preserve before dispatch'}
 # The poll starts only the first upload. Existing scheduled retries keep their
 # 15-minute/three-retry policy and all attempts share the first-start budget.
 if($budget -and [DateTimeOffset]::Parse($budget.scanSlot) -eq [DateTimeOffset]::Parse($Slot)){return $false}
 $dispatchPath=Join-Path $RepoPath ('reports\completion-dispatch-'+(Get-ScanSlotKey $Slot)+'.json')
 if(Test-Path $dispatchPath){
  $prior=Read-ScanRecoveryJson $dispatchPath
  if(-not $prior -or $prior.version -ne 1 -or $prior.scanSlot -cne $Slot){throw 'Corrupt completion dispatch; preserve before retry'}
  return $false
 }
 $candidate=Get-CompletedUploadCandidate $RepoPath $Folder $Slot
 if(-not $candidate){return $false}
 $normalized=([DateTimeOffset]::Parse($Slot)).ToOffset([TimeSpan]::FromHours(9)).ToString('yyyy-MM-ddTHH:mm:sszzz')
 # One durable dispatch per slot. The supervisor owns timeout/retry handling;
 # never wait while holding the minute poll shared by competitor/blue queues.
 $args=@('-NoProfile','-NonInteractive','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',(Join-Path $RepoPath 'scripts\run-scheduled-upload.ps1'),'-RepoPath',$RepoPath,'-ExpectedSlotStart',$normalized,'-CompletedOnly')
 $dispatch=[pscustomobject]@{version=1;scanSlot=$Slot;runId=$candidate.runId;state='launching';at=[DateTimeOffset]::UtcNow.ToString('o')}
 Write-ScanRecoveryJson $dispatchPath $dispatch
 $p=$null
 try{
  $p=Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList (($args|ForEach-Object {ConvertTo-MarketPulseArgument $_}) -join ' ') -WindowStyle Hidden -PassThru
  $dispatch.state='dispatched';$dispatch|Add-Member pid $p.Id -Force;Write-ScanRecoveryJson $dispatchPath $dispatch
 }catch{$dispatch.state='launch-failed';Write-ScanRecoveryJson $dispatchPath $dispatch;throw}
 finally{if($p){$p.Dispose()}}
 return $true
}
