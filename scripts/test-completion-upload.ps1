$ErrorActionPreference='Stop'
$root=Join-Path ([IO.Path]::GetTempPath()) ('MPCompletion-'+[guid]::NewGuid().ToString('N'))
function Check($ok,[string]$message){if(-not $ok){throw $message}}
. (Join-Path $PSScriptRoot 'scan-recovery.ps1')
. (Join-Path $PSScriptRoot 'completion-upload.ps1')
try{
 New-Item -ItemType Directory $root -Force|Out-Null
 $folder=Join-Path $root 'downloads';New-Item -ItemType Directory $folder -Force|Out-Null
 $slot='2026-11-05T16:00+09:00';$script:owner=$null;$script:normal=$null;$script:edge=$null;$script:validated=0;$script:catalogReject=$false
 function Read-EdgeOwnership {return $script:owner}
 function Get-SavedPrimaryResultPath($Folder,$Slot,$RepoPath){Check ($Slot -ceq '2026-11-05T16:00+09:00') 'Slot seconds not normalized';return $script:normal}
 function Get-EdgeRecoveryResultPath {return $script:edge}
 function Assert-PrimaryScanSource {$script:validated++}
 function Assert-ScanCatalog {if($script:catalogReject){throw 'catalog-conflict'}}
 function Invoke-MarketPulseGit {return [pscustomobject]@{Code=0;Output=@()}}
 $script:fingerprint=('f'*64)
 function Get-CompletedOwnFingerprint {return $script:fingerprint}
 Check (-not(Get-CompletedUploadCandidate $root $folder $slot)) 'Missing source admitted'
 Write-ScanRecoveryJson (Join-Path $folder 'product-catalog.json') @{products=@()}
 $p=Join-Path $folder 'normal.json';$script:normal=$p
 Write-ScanRecoveryJson $p @{complete=$true;runId=('a'*32);scanSlot=$slot;browser='chrome';results=@()}
 $c=Get-CompletedUploadCandidate $root $folder '2026-11-05T16:00:00+09:00'
 Check ($c.runId -ceq ('a'*32) -and $script:validated -eq 1) 'Completed source not bound before launch'
 $receipt=[pscustomobject]@{version=2;commit=('b'*40);scanSlot=$slot;runId=$c.runId;resultHash=$c.resultHash;catalogHash=$c.catalogHash;ownFingerprint=$script:fingerprint}
 Check (Test-CompletedUploadReceipt $receipt $c $root) 'Successful identical result not recognized'
 $receipt.runId=('c'*32);Check (-not(Test-CompletedUploadReceipt $receipt $c $root)) 'Different run skipped';$receipt.runId=$c.runId
 $script:fingerprint=('e'*64);Check (-not(Test-CompletedUploadReceipt $receipt $c $root)) 'Changed own state was skipped despite old receipt';$script:fingerprint=('f'*64)
 $script:owner=@{state='collecting'};$script:edge=$null
 Check (-not(Get-CompletedUploadCandidate $root $folder $slot)) 'Late primary reused after Edge ownership'
 $script:edge=Join-Path $folder 'edge.json';Write-ScanRecoveryJson $script:edge @{complete=$true;runId=('d'*32);scanSlot=$slot;browser='edge';results=@()}
 Check ((Get-CompletedUploadCandidate $root $folder $slot).runId -ceq ('d'*32)) 'Completed full Edge not admitted'
 $script:catalogReject=$true;$denied=$false;try{Get-CompletedUploadCandidate $root $folder $slot|Out-Null}catch{$denied=$true};Check $denied 'Catalogue conflict launched early publication';$script:catalogReject=$false
 Write-ScanRecoveryJson $script:edge @{complete=$false;runId=('d'*32);scanSlot=$slot;results=@()};$denied=$false;try{Get-CompletedUploadCandidate $root $folder $slot|Out-Null}catch{$denied=$true};Check $denied 'Partial source launched early publication'
 # Dispatch never waits on the supervisor while holding the shared minute poll.
 $script:owner=$null;$script:dispatches=0
 function Start-Process {$script:dispatches++;$p=[pscustomobject]@{Id=1234};$p|Add-Member ScriptMethod Dispose {};return $p}
 Check (Invoke-CompletionUpload $root $folder $slot) 'First completion not dispatched'
 Check (-not(Invoke-CompletionUpload $root $folder $slot)) 'Pending dispatch launched a duplicate before budget creation'
 Check ($script:dispatches -eq 1) 'Dispatch count not bounded'
 Remove-Item Function:\Start-Process
 # Real supervisor/child/Git proof, isolated from browser and network.
 $repo=Join-Path $root 'repo';$scripts=Join-Path $repo 'scripts'
 New-Item -ItemType Directory $scripts,(Join-Path $repo 'chrome-extension') -Force|Out-Null
 Copy-Item (Join-Path $PSScriptRoot '*.ps1') $scripts
 Copy-Item (Join-Path $PSScriptRoot 'completion-state.mjs') $scripts
 Copy-Item (Join-Path $PSScriptRoot '..\chrome-extension\scan-policy.js') (Join-Path $repo 'chrome-extension\scan-policy.js')
 $now=[DateTimeOffset]::UtcNow;$clockOrigin=$now.ToString('o');$scenario='2026-11-05T16:18:00+09:00'
 $runner=Join-Path $scripts 'run-scheduled-upload.ps1';$source=Get-Content $runner -Raw -Encoding UTF8
 $source=$source.Replace('[DateTimeOffset]::UtcNow',"([DateTimeOffset]::Parse('$scenario').Add(([DateTimeOffset]::UtcNow-[DateTimeOffset]::Parse('$clockOrigin'))))")
 $source=$source.Replace('Local\MarketPulse',('Local\MPCompletion.'+(Split-Path $root -Leaf)))
 Set-Content $runner $source -Encoding UTF8
 $helper=Get-Content (Join-Path $scripts 'completion-upload.ps1') -Raw -Encoding UTF8
 $stub=@'
function Get-CompletedUploadCandidate([string]$RepoPath,[string]$Folder,[string]$Slot){
 $p=Join-Path $RepoPath 'reports\candidate.json';if(Test-Path $p){return Get-Content $p -Raw|ConvertFrom-Json};return $null
}
'@
 $helper=$stub+$helper.Substring($helper.IndexOf('function Test-CompletedUploadReceipt'))
 Set-Content (Join-Path $scripts 'completion-upload.ps1') $helper -Encoding UTF8
 $import=@'
param([string]$RepoPath,[switch]$WaitForToday,[string]$ExpectedSlotStart)
[IO.File]::AppendAllText((Join-Path $RepoPath 'reports\launches.txt'),"started`n")
if(Test-Path (Join-Path $RepoPath 'reports\fail')){throw 'synthetic-import-failure'}
$q=Get-Content (Join-Path $RepoPath 'reports\candidate.json') -Raw|ConvertFrom-Json
Set-Content (Join-Path $RepoPath 'own.txt') $q.runId
Set-Content (Join-Path $RepoPath 'history.txt') $q.runId
Set-Content (Join-Path $RepoPath 'competitor-queue.txt') $q.runId
$data=@{meta=@{brand='Test';snapshotAt=$q.scanSlot;publishedAt=$q.scanSlot;collectionEvidence=@{scanSlot=$q.scanSlot;runId=$q.runId}};products=@(@{mtm='OWN';productId='1';itemId='2';vendorItemId='3';offers=@(@{role='mine';finalPrice=777})})}
New-Item -ItemType Directory (Join-Path $RepoPath 'brand\test') -Force|Out-Null
Set-Content (Join-Path $RepoPath 'brand\test\market-data.js') ('window.MARKET_DATA = '+($data|ConvertTo-Json -Depth 12)+';') -Encoding UTF8
$ErrorActionPreference='Continue'
git -C $RepoPath add own.txt history.txt competitor-queue.txt brand 2>&1|Out-Null
git -C $RepoPath diff --cached --quiet
if($LASTEXITCODE -eq 1){git -C $RepoPath commit -qm 'fixture own publication'}
git -C $RepoPath push origin main 2>&1|Out-Null
if($LASTEXITCODE){throw 'fixture push failed'}
'@
 Set-Content (Join-Path $scripts 'import-extension-results.ps1') $import -Encoding UTF8
 . (Join-Path $PSScriptRoot 'git-timeout.ps1')
 function Git-Case([string[]]$a){$r=Invoke-MarketPulseGit -RepoPath $repo -Arguments $a;if($r.Code){throw ('Fixture Git failed: '+($a -join ' '))};$r.Output}
 Set-Content (Join-Path $repo '.gitignore') "reports/`n"
 $null=Git-Case @('init','-q','--initial-branch=main');$null=Git-Case @('config','user.name','Test');$null=Git-Case @('config','user.email','test@example.invalid');$null=Git-Case @('add','.');$null=Git-Case @('commit','-qm','baseline')
 $remote=Join-Path $root 'remote.git';$null=Git-Case @('init','--bare','--initial-branch=main',$remote);$null=Git-Case @('remote','add','origin',$remote);$null=Git-Case @('push','-u','origin','main')
 & powershell.exe -NoProfile -File $runner -RepoPath $repo -ExpectedSlotStart $slot -CompletedOnly
 Check ($LASTEXITCODE -eq 0 -and -not(Test-Path (Join-Path $repo 'reports\scheduled-upload-budget.json'))) 'Missing result created early budget/worker'
 $catalogPath=Join-Path $repo 'reports\catalog.json';Write-ScanRecoveryJson $catalogPath @{products=@(@{brand='Test';mtm='OWN';productId='1';itemId='2';vendorItemId='3'})}
 $candidate=[pscustomobject]@{scanSlot=$slot;runId=('a'*32);resultHash=('1'*64);catalogHash=('2'*64);catalogPath=$catalogPath}
 Write-ScanRecoveryJson (Join-Path $repo 'reports\candidate.json') $candidate
 & powershell.exe -NoProfile -File $runner -RepoPath $repo -ExpectedSlotStart $slot -CompletedOnly;Check ($LASTEXITCODE -eq 0) 'Early uploader failed'
 $bp=Join-Path $repo 'reports\scheduled-upload-budget.json';$b=Read-ScanRecoveryJson $bp
 Check ($b.publicationReceipt.runId -ceq $candidate.runId) 'Success receipt missing'
 Check ([DateTimeOffset]::Parse($b.startedAt).ToOffset([TimeSpan]::FromHours(9)).Minute -eq 18) 'Upload waited for :30'
 $firstDeadline=$b.deadlineAt;$firstStart=$b.startedAt
 # A later competitor commit is preserved by the :30 fallback, without importer replay.
 Set-Content (Join-Path $repo 'competitor-queue.txt') 'competitors-published';$null=Git-Case @('add','.');$null=Git-Case @('commit','-qm','fixture competitor publication');$null=Git-Case @('push','origin','main')
 $head=(@(Git-Case @('rev-parse','HEAD')) -join '')
 & powershell.exe -NoProfile -File $runner -RepoPath $repo -ExpectedSlotStart $slot
 Check ($LASTEXITCODE -eq 0 -and @(Get-Content (Join-Path $repo 'reports\launches.txt')).Count -eq 1) 'Fallback repeated already pushed own importer'
 Check ((@(Git-Case @('rev-parse','HEAD')) -join '') -ceq $head) 'Fallback overwrote descendant competitor publication'
 # Changed source admits another valid import; failure cannot mint a success receipt.
 $candidate.runId=('c'*32);$candidate.resultHash=('3'*64);Write-ScanRecoveryJson (Join-Path $repo 'reports\candidate.json') $candidate
 Set-Content (Join-Path $repo 'reports\fail') 'fail'
 & powershell.exe -NoProfile -File $runner -RepoPath $repo -ExpectedSlotStart $slot -CompletedOnly
 Check ($LASTEXITCODE -ne 0) 'Failed upload reported success'
 $b=Read-ScanRecoveryJson $bp;Check ($b.publicationReceipt.runId -cne $candidate.runId) 'Failure marked new source pushed'
 Remove-Item (Join-Path $repo 'reports\fail')
 & powershell.exe -NoProfile -File $runner -RepoPath $repo -ExpectedSlotStart $slot
 Check ($LASTEXITCODE -eq 0) 'Scheduled fallback did not recover failed new source'
 $b=Read-ScanRecoveryJson $bp;Check ($b.publicationReceipt.runId -ceq $candidate.runId -and $b.deadlineAt -ceq $firstDeadline -and $b.startedAt -ceq $firstStart) 'Retry changed source receipt or extended first budget'
 Write-Host 'Completion admission, bound Chrome/Whale/full Edge routing, no partial/late primary, immediate upload, fallback dedupe, descendant competitor preservation, failure retry and unchanged first budget passed.'
}finally{Remove-Item $root -Recurse -Force -ErrorAction SilentlyContinue}
