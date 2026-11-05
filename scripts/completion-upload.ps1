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
 return [pscustomobject]@{scanSlot=$Slot;runId=$payload.runId;resultHash=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash;catalogHash=(Get-FileHash -LiteralPath $catalogPath -Algorithm SHA256).Hash}
}
function Test-CompletedUploadReceipt($Receipt,$Candidate,[string]$RepoPath) {
 if(Test-Path (Join-Path $RepoPath 'reports\price-publication-transaction.json')){return $false}
 if(-not $Receipt -or -not $Candidate -or $Receipt.version -ne 1 -or $Receipt.commit -cnotmatch '^[a-f0-9]{40}$'){return $false}
 foreach($key in @('runId','resultHash','catalogHash')){if($Receipt.$key -cne $Candidate.$key){return $false}}
 if([DateTimeOffset]::Parse($Receipt.scanSlot) -ne [DateTimeOffset]::Parse($Candidate.scanSlot)){return $false}
 # Descendant competitor/Supplier commits must not be replaced by an old own import.
 $r=Invoke-MarketPulseGit -RepoPath $RepoPath -Arguments @('merge-base','--is-ancestor',$Receipt.commit,'HEAD')
 return $r.Code -eq 0
}
function Invoke-CompletionUpload([string]$RepoPath,[string]$Folder,[string]$Slot) {
 if(-not $Slot -or -not(Get-CommonProtocolId $Slot)){return $false}
 $candidate=Get-CompletedUploadCandidate $RepoPath $Folder $Slot
 if(-not $candidate){return $false}
 $budget=Read-ScanRecoveryJson (Join-Path $RepoPath 'reports\scheduled-upload-budget.json')
 if($budget -and (Test-CompletedUploadReceipt $budget.publicationReceipt $candidate $RepoPath)){return $false}
 # The poll starts only the first upload. Existing scheduled retries keep their
 # 15-minute/three-retry policy and all attempts share the first-start budget.
 if($budget -and [DateTimeOffset]::Parse($budget.scanSlot) -eq [DateTimeOffset]::Parse($Slot)){return $false}
 $normalized=([DateTimeOffset]::Parse($Slot)).ToOffset([TimeSpan]::FromHours(9)).ToString('yyyy-MM-ddTHH:mm:sszzz')
 # A separate process preserves the supervisor's exit/timeout cleanup semantics.
 $args=@('-NoProfile','-NonInteractive','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',(Join-Path $RepoPath 'scripts\run-scheduled-upload.ps1'),'-RepoPath',$RepoPath,'-ExpectedSlotStart',$normalized,'-CompletedOnly')
 $p=Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList (($args|ForEach-Object {ConvertTo-MarketPulseArgument $_}) -join ' ') -WindowStyle Hidden -PassThru
 try{$p.WaitForExit();if($p.ExitCode -ne 0){throw 'Completion upload failed; original budget and scheduled fallback retained'}}finally{$p.Dispose()}
 return $true
}
