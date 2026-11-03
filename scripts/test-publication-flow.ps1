$ErrorActionPreference='Stop'
$root=Join-Path ([IO.Path]::GetTempPath()) ('MPPublicationFlow-'+[guid]::NewGuid().ToString('N'))
$repo=Join-Path $root 'repo';$folder=Join-Path $root 'downloads';$remote=Join-Path $root 'remote.git'
$global:PublicationFlowNow=[DateTimeOffset]'2026-11-03T16:45:00+09:00'
function Check($condition,[string]$message){if(-not $condition){throw $message}}
try{
 New-Item -ItemType Directory (Join-Path $repo 'scripts'),(Join-Path $repo 'chrome-extension'),(Join-Path $repo 'dist'),(Join-Path $repo 'brand\acer'),$folder -Force|Out-Null
 foreach($file in @(Get-ChildItem $PSScriptRoot -File|Where-Object {$_.Extension -in @('.ps1','.json')})){
  $text=Get-Content $file.FullName -Raw -Encoding UTF8
  $text=$text.Replace('[DateTimeOffset]::UtcNow','$global:PublicationFlowNow').Replace('Local\MarketPulse',('Local\MPPublicationFlow.'+(Split-Path $root -Leaf)))
  $text=$text.Replace("`$resultFolder = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads\MarketPulse'",("`$resultFolder = '"+$folder.Replace("'","''")+"'"))
  $text|Set-Content (Join-Path $repo ('scripts\'+$file.Name)) -Encoding UTF8
 }
 Copy-Item (Join-Path $PSScriptRoot '..\chrome-extension\scan-policy.js') (Join-Path $repo 'chrome-extension\scan-policy.js')
 [IO.File]::WriteAllText((Join-Path $repo '.gitignore'),'reports/'+[Environment]::NewLine+'chrome-extension/runtime/'+[Environment]::NewLine)
 [IO.File]::WriteAllText((Join-Path $repo 'brand\acer\index.html'),'<title>Acer</title><small id="brandSubtitle">Acer</small>')
 [IO.File]::WriteAllText((Join-Path $repo 'dist\price-history.js'),'window.MARKET_PULSE_HISTORY = {"headers":[],"rows":[]};')
 [IO.File]::WriteAllText((Join-Path $repo 'dist\competitor-price-history.js'),'window.MARKET_PULSE_COMPETITOR_HISTORY = {"headers":[],"rows":[]};')
 . (Join-Path $repo 'scripts\scan-recovery.ps1');. (Join-Path $repo 'scripts\brand-lifecycle.ps1');. (Join-Path $PSScriptRoot 'git-timeout.ps1')
 function Git-Flow([string[]]$a){$r=Invoke-MarketPulseGit -RepoPath $repo -Arguments $a;if($r.Code){throw ('Fixture Git failed: '+($a -join ' '))};$r.Output}
 $null=Git-Flow @('init','-q','--initial-branch=main');$null=Git-Flow @('config','user.name','Audit');$null=Git-Flow @('config','user.email','audit@example.invalid')
 $null=Git-Flow @('add','.');$null=Git-Flow @('commit','-qm','baseline');$null=Git-Flow @('init','--bare','--initial-branch=main',$remote);$null=Git-Flow @('remote','add','origin',$remote);$null=Git-Flow @('push','-u','origin','main')
 $slot='2026-11-03T16:00+09:00'
 $target=[pscustomobject]@{brand='Test';mtm='TEST1';category='Test';srp=1000000;enabled=$true;productId='1';itemId='2';vendorItemId='3';url='https://www.coupang.com/vp/products/1?itemId=2&vendorItemId=3'}
 Write-ScanRecoveryJson (Join-Path $folder 'product-catalog.json') ([pscustomobject]@{products=@($target)})
 $q=[pscustomobject]@{version=1;browser='chrome';primaryProtocolId='windows-primary-v2';policyId=(Get-ScanSlotPolicy $slot).id;scanSlot=$slot;requestId=('a'*32);requestedAt=$slot;targets=@($target)}
 Write-ScanRecoveryJson (Get-CommonRequestPath $repo $slot) $q
 $w=[pscustomobject]@{version=1;browser='chrome';extensionVersion='1.9.64';primaryProtocolId=$q.primaryProtocolId;policyId=$q.policyId;primaryRequestId=$q.requestId;runId=('b'*32);workerInstanceId=('c'*32);scanSlot=$slot;startedAt='2026-11-03T16:00:01+09:00';deadlineAt=(Get-CommonDeadline $q).ToString('o');targetCount=1;targets=@($target)}
 Write-ScanRecoveryJson (Join-Path $folder ('chrome-scan-start-'+(Get-ScanSlotKey $slot)+'-'+$q.requestId+'.json')) $w
 $row=$target|ConvertTo-Json|ConvertFrom-Json;$row|Add-Member ok $false;$row|Add-Member reason 'synthetic-read-failure';$row|Add-Member checkedAt '2026-11-03T16:05:00+09:00'
 $payload=[pscustomobject]@{version=5;browser='chrome';extensionVersion='1.9.64';runId=$w.runId;scanSlot=$slot;primaryProtocolId=$q.primaryProtocolId;primaryRequestId=$q.requestId;policyId=$q.policyId;startedAt=$w.startedAt;scannedAt='2026-11-03T16:15:00+09:00';completedAt='2026-11-03T16:15:00+09:00';deadlineAt=$w.deadlineAt;complete=$true;targetCount=1;resultCount=1;results=@($row)}
 Write-ScanRecoveryJson (Join-Path $folder 'latest-coupang-scan.json') $payload
 # Inject one push failure AFTER the real importer has written, staged and committed.
 $gitPath=Join-Path $repo 'scripts\git-timeout.ps1';$originalGit=Get-Content $gitPath -Raw -Encoding UTF8
 $shim=$originalGit.Replace('function Invoke-MarketPulseGit {','function Invoke-FlowRealGit {')+@'

function Invoke-MarketPulseGit {
 param([string]$RepoPath,[string[]]$Arguments,[int]$TimeoutSeconds=600,[string]$Executable='')
 if($Arguments[0] -eq 'push'){return [pscustomobject]@{Code=128;Output=@();ErrorText='synthetic-push-failure'}}
 Invoke-FlowRealGit -RepoPath $RepoPath -Arguments $Arguments -TimeoutSeconds $TimeoutSeconds -Executable $Executable
}
'@
 $shim|Set-Content $gitPath -Encoding UTF8
 # The test-only shim must be committed before the publication baseline starts.
 $null=Git-Flow @('add','scripts/git-timeout.ps1');$null=Git-Flow @('commit','-qm','private fault injection');$null=Git-Flow @('push','origin','main')
 $importer=Join-Path $repo 'scripts\import-extension-results.ps1';$failed=$false
 try{& $importer -RepoPath $repo -ExpectedSlotStart $slot}catch{$failed=$_.Exception.Message -match 'Git operation failed'}
 Check $failed 'The injected post-commit push failure was not reached'
 Check (-not(Test-Path (Join-Path $repo 'reports\price-publication-transaction.json'))) 'Verified committed publication was not retained after push failure'
 $history=Join-Path $repo 'reports\my-coupang-price-history.csv';$rows=@(Import-Csv $history -Encoding UTF8);Check (@($rows|Where-Object {$_.MTM -ceq 'TEST1'}).Count -eq 1) 'Initial synthetic failed-price history was not recorded once';$historyCount=$rows.Count
 $dataPath=Join-Path $repo 'brand\test\market-data.js';$published=Get-Content $dataPath -Raw -Encoding UTF8
 Check ($published -match 'review-needed') 'Failed model was not published with review status'
 # Switch the private Git wrapper to success; the fixture source change is
 # committed before rerunning, so the real importer still requires clean Git.
 $shim=$shim.Replace("if(`$Arguments[0] -eq 'push')",'if($false)');$shim|Set-Content $gitPath -Encoding UTF8
 $null=Git-Flow @('add','scripts/git-timeout.ps1');$null=Git-Flow @('commit','-qm','end private fault injection')
 $beforeRetry=(@(Git-Flow @('rev-parse','HEAD')) -join '')
 & $importer -RepoPath $repo -ExpectedSlotStart $slot
 Check ((@(Git-Flow @('rev-parse','HEAD')) -join '') -ceq $beforeRetry) 'Retry created a duplicate price/history commit'
 Check (@(Import-Csv $history -Encoding UTF8).Count -eq $historyCount) 'Retry duplicated failed-price history';Check (@(Import-Csv $history -Encoding UTF8|Where-Object {$_.MTM -ceq 'TEST1'}).Count -eq 1) 'Retry duplicated the synthetic failed-price row'
 Check ((Get-Content $dataPath -Raw -Encoding UTF8) -ceq $published) 'Retry recalculated the existing failed model'
 Check (-not(Test-Path (Join-Path $repo 'reports\price-publication-transaction.json'))) 'Retry left a recovery journal'
 Check (-not(@(Git-Flow @('status','--porcelain')).Count)) 'Full importer left a dirty fixture'
 Write-Host 'Full common-result importer -> new brand -> failed-model history -> commit -> injected push failure -> retained output -> idempotent retry passed; local bare remote only.'
}finally{Remove-Item $root -Recurse -Force -ErrorAction SilentlyContinue;Remove-Variable PublicationFlowNow -Scope Global -ErrorAction SilentlyContinue}
