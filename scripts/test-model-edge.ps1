param([ValidateSet('2026-10-28T16:00+09:00','2026-10-28T20:00+09:00')][string]$FlowSlot='2026-10-28T16:00+09:00')
$ErrorActionPreference='Stop'
function Check($Value,[string]$Message){if(-not $Value){throw $Message}}
function Must-Fail([scriptblock]$Block){$bad=$false;try{& $Block|Out-Null}catch{$bad=$true};Check $bad 'Expected integrity rejection.'}
$temp=Join-Path ([IO.Path]::GetTempPath()) ('MPModel-'+[guid]::NewGuid().ToString('N'))
$oldProgramFiles=$env:ProgramFiles;$oldLocal=$env:LOCALAPPDATA
$global:ModelTestNow=([DateTimeOffset]::Parse($FlowSlot)).AddMinutes(60)
$global:ModelTestLaunches=0;$global:ModelTestMode='success'
try {
  New-Item -ItemType Directory (Join-Path $temp 'scripts'),(Join-Path $temp 'chrome-extension'),(Join-Path $temp 'Downloads') -Force|Out-Null
  $global:ModelTestRepo=$temp;$global:ModelTestFolder=Join-Path $temp 'Downloads'
  Copy-Item (Join-Path $PSScriptRoot '..\chrome-extension\scan-policy.js') (Join-Path $temp 'chrome-extension\scan-policy.js')
  foreach($name in @('scan-recovery.ps1','model-edge-recovery.ps1','blue-recovery-queue.ps1','blue-retry-policy.ps1','run-blue-recovery.ps1','git-timeout.ps1','brand-lifecycle.ps1')){
    $s=Get-Content (Join-Path $PSScriptRoot $name) -Raw -Encoding UTF8
    $s=$s.Replace('[DateTimeOffset]::UtcNow','$global:ModelTestNow')
    $s=$s.Replace("`$folder=Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads\MarketPulse'",'$folder=$global:ModelTestFolder')
    $s|Set-Content (Join-Path $temp ('scripts\'+$name)) -Encoding UTF8
  }
  'function Get-BrowserExtensionInstallations {param($UserDataPath,$ExtensionPath);[pscustomobject]@{Id=("a"*32);Profile="Default"}}'|Set-Content (Join-Path $temp 'scripts\browser-profile.ps1') -Encoding UTF8
  . (Join-Path $temp 'scripts\scan-recovery.ps1')
  . (Join-Path $temp 'scripts\brand-lifecycle.ps1')
  . (Join-Path $temp 'scripts\model-edge-recovery.ps1')
  . (Join-Path $temp 'scripts\blue-recovery-queue.ps1')
  $env:ProgramFiles=$temp;$env:LOCALAPPDATA=$temp
  $exe=Join-Path $temp 'Microsoft\Edge\Application\msedge.exe';New-Item -ItemType Directory (Split-Path $exe) -Force|Out-Null;New-Item -ItemType File $exe|Out-Null
  function Start-Sleep {param([int]$Seconds);$global:ModelTestNow=$global:ModelTestNow.AddMinutes(10)}
  function Start-Process {
    param($FilePath,$ArgumentList)
    $global:ModelTestLaunches++
    Check ($FilePath -match 'msedge.exe$') 'Wrong recovery browser.'
    Check (($ArgumentList -join ' ') -match 'scope=models') 'Subset scope lost.'
    if($global:ModelTestMode -eq 'launch-fail'){throw 'launch-rejected'}
    if($global:ModelTestMode -eq 'timeout'){return}
    $requestFile=Get-ChildItem (Join-Path $global:ModelTestRepo 'chrome-extension\runtime') -Filter 'model-edge-*.json'|Sort-Object LastWriteTimeUtc -Descending|Select-Object -First 1
    $q=Read-ScanRecoveryJson $requestFile.FullName
    Check (@($q.products).Count -eq 1) 'A healthy model was recollected.'
    $row=$q.products[0]|ConvertTo-Json -Depth 10|ConvertFrom-Json
    foreach($pair in @{ok=$true;price=810000;basisPrice=810000;strikePrice=810000;strikeReliable=$true;strikeAnchorVerified=$true;priceBasisSource='visible-product-price';basisEvidence=@{top=10};priceBasisType='top-visible';checkoutDiscountStatus='captured';checkoutCouponSource='checkout';checkoutCouponDiscount=0;wowInstantDiscount=0;wowCouponDiscount=0;cardBenefitStatus='none';checkedAt=$global:ModelTestNow.AddSeconds(2).ToString('o');checkoutDiscountCapturedAt=$global:ModelTestNow.AddSeconds(2).ToString('o')}.GetEnumerator()){$row|Add-Member $pair.Key $pair.Value -Force}
    if($global:ModelTestMode -eq 'row-fail'){$row.ok=$false;$row|Add-Member reason 'scan-timeout:product'}
    if($global:ModelTestMode -eq 'card-partial'){$row.cardBenefitStatus='partial'}
    if($global:ModelTestMode -eq 'wrong-id'){$row.itemId='999'}
    $p=[pscustomobject]@{version=5;browser='edge';extensionVersion='1.9.54';scanSlot=$q.scanSlot;runId=$q.runId;policyId=$q.recovery.policyId;recovery=$q.recovery;
      startedAt=$global:ModelTestNow.AddSeconds(1).ToString('o');completedAt=$global:ModelTestNow.AddSeconds(3).ToString('o');scannedAt=$global:ModelTestNow.AddSeconds(3).ToString('o');targetCount=1;resultCount=1;complete=$true;results=@($row)}
    Write-ModelEdgeJson (Join-Path $global:ModelTestFolder ('edge-recovery-'+$q.runId+'.json')) $p
  }
  $slotAt=[DateTimeOffset]::Parse($FlowSlot);$primary=Get-PrimaryScanBrowser $FlowSlot
  $rows=@(foreach($i in 1..2){[pscustomobject]@{brand='Test';mtm="MODEL$i";productId="$i";itemId="$i";vendorItemId="$i";enabled=$true;srp=1000000;url="https://www.coupang.com/vp/products/$i`?itemId=$i&vendorItemId=$i";
    ok=$true;price=800000;priceBasisSource='visible-product-price';basisEvidence=@{top=10};priceBasisType='top-visible';checkoutDiscountStatus='captured';checkoutCouponSource='checkout';checkoutCouponDiscount=0;wowInstantDiscount=0;wowCouponDiscount=0;cardBenefitStatus='none';checkedAt=$slotAt.AddMinutes(35).ToString('o');checkoutDiscountCapturedAt=$slotAt.AddMinutes(36).ToString('o')}})
  $rows[1].ok=$false;$rows[1]|Add-Member reason 'access-check'
  $catalog=[pscustomobject]@{products=$rows}
  Write-ModelEdgeJson (Join-Path $global:ModelTestFolder 'product-catalog.json') $catalog
  $base=[pscustomobject]@{version=5;browser='edge';extensionVersion='1.9.52';scanSlot=$FlowSlot;runId=('b'*32);policyId=(Get-ScanSlotPolicy $FlowSlot).id;primaryRequestId=$null;
    startedAt=$slotAt.AddMinutes(30).ToString('o');completedAt=$slotAt.AddMinutes(45).ToString('o');scannedAt=$slotAt.AddMinutes(45).ToString('o');deadlineAt=$slotAt.AddHours(2).ToString('o');complete=$true;targetCount=2;resultCount=2;results=$rows}
  $sourcePath=Join-Path $global:ModelTestFolder 'latest-coupang-scan.json'
  if($primary -eq 'whale') {
    $base.primaryRequestId='d'*32;$sourcePath=Join-Path $global:ModelTestFolder ('whale-scan-'+$base.runId+'.json')
    $q=[pscustomobject]@{version=1;browser='whale';scanSlot=$FlowSlot;requestId=$base.primaryRequestId;requestedAt=$slotAt.ToString('o');policyId=$base.policyId;targets=$rows;launchAttempts=1}
    Write-ModelEdgeJson (Get-WhaleRequestPath $temp $FlowSlot) $q
  }
  $recovery=[pscustomobject]@{reason='access-check';chromeRunId=('a'*32);chromeStartedAt=$slotAt.AddSeconds(1).ToString('o');chromeCompletedAt=$slotAt.AddMinutes(15).ToString('o');primaryBrowser=$primary;primaryRequestId=$base.primaryRequestId;policyId=$base.policyId;deadlineAt=$base.deadlineAt}
  $base.primaryRequestId=$null;$base|Add-Member recovery $recovery
  $full=[pscustomobject]@{state='result-ready';scanSlot=$FlowSlot;runId=$base.runId;chromeRunId=('a'*32);reason='access-check';triggeredAt=$slotAt.AddMinutes(29).ToString('o');targets=$rows;primaryBrowser=$primary;primaryRequestId=$recovery.primaryRequestId;policyId=$base.policyId;deadlineAt=$base.deadlineAt}
  Write-ModelEdgeJson (Get-EdgeReceiptPath $temp $FlowSlot) $full
  Write-ModelEdgeJson $sourcePath $base
  $queue=[pscustomobject]@{version=1;state='collecting';sourceRunId=$base.runId;scanSlot=$FlowSlot;sourceHash=(Get-FileHash $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant();targetItemIds=@('2');initialCommit=('e'*40);firstPublishedAt=$slotAt.AddMinutes(47).ToString('o');notBefore=$slotAt.AddMinutes(57).ToString('o')}
  Write-ModelEdgeJson (Get-BlueRecoveryQueuePath $temp $base) $queue
  $global:ModelTestNow=$slotAt.AddMinutes(56);Must-Fail {Invoke-ModelEdgeRecovery $sourcePath $FlowSlot $global:ModelTestFolder $temp $queue};$global:ModelTestNow=$slotAt.AddMinutes(60)
  Check ($global:ModelTestLaunches -eq 0) 'Collected before deployment plus ten minutes.'
  $hash=(Get-FileHash $sourcePath).Hash
  $pubRows=@($rows|ConvertTo-Json -Depth 12|ConvertFrom-Json|ForEach-Object {$_})
  foreach($row in $pubRows){$row.PSObject.Properties.Remove('brand');$offer=[pscustomobject]@{role='mine';collectionStatus=if($row.itemId -eq '2'){'review-needed'}else{'verified'};cardBenefitStatus='none'};$row|Add-Member offers @($offer)}
  $pub=[pscustomobject]@{meta=[pscustomobject]@{snapshotAt=$base.scannedAt;collectionEvidence=[pscustomobject]@{runId=$base.runId;scanSlot=$FlowSlot}};products=$pubRows}
  $brandFolder=Join-Path $temp 'brand\test';New-Item -ItemType Directory $brandFolder -Force|Out-Null
  ('window.MARKET_DATA = '+($pub|ConvertTo-Json -Depth 15)+';')|Set-Content (Join-Path $brandFolder 'market-data.js') -Encoding UTF8
  $visible=Get-BluePublicationState $base $catalog $temp
  Check ($visible.blueItemIds.Count -eq 1 -and $visible.blueItemIds[0] -eq '2') 'Published blue-only selection failed.'
  # Queue creation cannot collect or start its timer at Git push alone.
  Remove-Item (Get-BlueRecoveryQueuePath $temp $base) -Force
  function Invoke-MarketPulseGit {param($RepoPath,$Arguments);[pscustomobject]@{Code=0;Output=@(('e'*40))}}
  Write-ModelEdgeJson (Join-Path $temp 'reports\scheduled-upload-budget.json') ([pscustomobject]@{scanSlot=$FlowSlot;deadlineAt=$slotAt.AddMinutes(150).ToString('o')})
  Add-BlueRecoveryQueue $base $sourcePath $temp $global:ModelTestFolder
  $pending=Read-ScanRecoveryJson (Get-BlueRecoveryQueuePath $temp $base)
  Check ($pending.state -eq 'waiting-deployment' -and -not $pending.firstPublishedAt -and -not $pending.notBefore -and $global:ModelTestLaunches -eq 0) 'Git push alone started the wait/collection.'
  $pending.firstPublishedAt=$queue.firstPublishedAt;$pending.notBefore=$queue.notBefore;$pending.state='collecting';$queue=$pending
  Write-ModelEdgeJson (Get-BlueRecoveryQueuePath $temp $base) $queue
  function Invoke-RestMethod {
    param($Uri,$Headers,$TimeoutSec)
    if($Uri -match '/jobs'){return [pscustomobject]@{jobs=@([pscustomobject]@{name='deploy';conclusion='success';completed_at=([DateTimeOffset]::Parse($global:ModelTestSlot)).AddMinutes(47).ToUniversalTime().ToString('o')},[pscustomobject]@{name='update';conclusion='success'},[pscustomobject]@{name='windows_history';conclusion=if($global:ModelDeployBad){'failure'}else{'success'}})}}
    if($global:ModelDeployPending){return [pscustomobject]@{workflow_runs=@()}}
    [pscustomobject]@{workflow_runs=@([pscustomobject]@{id=123;head_sha=('e'*40);name='Market Pulse Update';conclusion='success'})}
  }
  $global:ModelTestSlot=$FlowSlot
  Check ($null -ne (Get-BlueDeploymentSuccess ('e'*40))) 'Pinned successful deployment was not detected.'
  $global:ModelDeployBad=$true;Check ($null -eq (Get-BlueDeploymentSuccess ('e'*40))) 'Incomplete CI counted as publication.';$global:ModelDeployBad=$false
  # Drive the actual queue poller with synthetic API/Pages replies. Its uploader
  # is a recording stub: no live process, price collection or Git operation.
  function Invoke-WebRequest {param($Uri,[switch]$UseBasicParsing,$TimeoutSec);[pscustomobject]@{Content=(Get-Content (Join-Path $global:ModelTestRepo 'brand\test\market-data.js') -Raw -Encoding UTF8)}}
  'param($RepoPath,$ExpectedSlotStart,$BlueRecoveryQueue);[IO.File]::WriteAllText((Join-Path $RepoPath "reports\poll-dispatch.txt"),$ExpectedSlotStart)'|Set-Content (Join-Path $temp 'scripts\run-scheduled-upload.ps1') -Encoding UTF8
  $pending.state='waiting-deployment';$pending.firstPublishedAt=$null;$pending.notBefore=$null
  Write-ModelEdgeJson (Get-BlueRecoveryQueuePath $temp $base) $pending
  $global:ModelTestNow=$slotAt.AddMinutes(48);$global:ModelDeployPending=$true
  & (Join-Path $temp 'scripts\run-blue-recovery.ps1') -RepoPath $temp
  Check (-not(Test-Path (Join-Path $temp 'reports\poll-dispatch.txt'))) 'No deployment triggered dispatch.'
  $global:ModelTestNow=$slotAt.AddMinutes(50);$global:ModelDeployPending=$false
  & (Join-Path $temp 'scripts\run-blue-recovery.ps1') -RepoPath $temp
  Check (-not(Test-Path (Join-Path $temp 'reports\poll-dispatch.txt'))) 'Dispatch occurred before the ten-minute interval.'
  $broken=$pending|ConvertTo-Json -Depth 20|ConvertFrom-Json
  $broken.publicationDeadline='invalid-date'
  Write-ModelEdgeJson (Join-Path $temp 'reports\blue-recovery-corrupt.json') $broken
  $global:ModelTestNow=$slotAt.AddMinutes(57)
  & (Join-Path $temp 'scripts\run-blue-recovery.ps1') -RepoPath $temp
  Check (Test-Path (Join-Path $temp 'reports\poll-dispatch.txt')) 'Due verified first publication did not dispatch.'
  Check ((Read-ScanRecoveryJson (Join-Path $temp 'reports\blue-recovery-corrupt.json')).lastError) 'Malformed queue was not isolated and recorded.'
  $queue=Read-ScanRecoveryJson (Get-BlueRecoveryQueuePath $temp $base)
  Check (([DateTimeOffset]::Parse($queue.notBefore)-[DateTimeOffset]::Parse($queue.firstPublishedAt)).TotalSeconds -eq 600) 'Timer was not based on actual deploy completion.'
  $global:ModelTestNow=$slotAt.AddMinutes(60)
  $mergedPath=Invoke-ModelEdgeRecovery $sourcePath $FlowSlot $global:ModelTestFolder $temp $queue
  $merged=Read-ScanRecoveryJson $mergedPath
  Check ($global:ModelTestLaunches -eq 1 -and $merged.browser -eq 'mixed' -and $merged.results.Count -eq 2) 'Not one complete merged publication.'
  Check ($merged.results[0].price -eq 800000 -and $merged.results[0].collectionSource.runId -eq $base.runId) 'Healthy source changed.'
  Check ($merged.results[1].price -eq 810000 -and $merged.results[1].collectionSource.browser -eq 'edge') 'Whole recovered row not replaced.'
  Check ($merged.modelRecovery.recovered -eq 1 -and $merged.modelRecovery.unresolved -eq 0) 'Recovery counts wrong.'
  $discounted=$merged.results[1]|ConvertTo-Json -Depth 20|ConvertFrom-Json
  $discounted.price=300000;$discounted.basisPrice=1000000;$discounted.strikePrice=1000000;$discounted.wowCouponDiscount=700000
  Check (Test-ModelEdgeVerifiedRow $discounted) 'Valid large coupon was compared to the already-discounted price.'
  $discounted.wowCouponDiscount=1000001
  Check (-not(Test-ModelEdgeVerifiedRow $discounted)) 'Coupon larger than the true basis was accepted.'
  $discounted.wowCouponDiscount=0;$discounted.basisPrice=$null
  Check (-not(Test-ModelEdgeVerifiedRow $discounted)) 'Missing anchored basis was counted as a recovered model.'
  Check ((Get-FileHash $sourcePath).Hash -ceq $hash) 'Primary source overwritten.'
  $replay=Invoke-ModelEdgeRecovery $sourcePath $FlowSlot $global:ModelTestFolder $temp $queue
  Check ($replay -ceq $mergedPath -and $global:ModelTestLaunches -eq 1) 'Replay repeated collection.'
  Assert-PrimaryScanSource $merged $FlowSlot $global:ModelTestFolder $temp
  $paths=Get-ModelEdgePaths $temp $base;$receipt=Read-ScanRecoveryJson $paths.receipt
  $subset=Read-ScanRecoveryJson (Get-SavedEdgeRunPath $global:ModelTestFolder $receipt.runId)
  Must-Fail {Assert-PrimaryScanSource $subset $FlowSlot $global:ModelTestFolder $temp}
  $merged.results[0].price=123456;Must-Fail {Assert-PrimaryScanSource $merged $FlowSlot $global:ModelTestFolder $temp}
  $old=$base.results[1].reason;$base.results[1].reason='product-identifiers-mismatch';Must-Fail {Assert-ModelEdgeBase $base $catalog $FlowSlot};$base.results[1].reason=$old
  foreach($mode in @('row-fail','card-partial','launch-fail','timeout','wrong-id')) {
    Remove-Item $paths.receipt,$paths.source,$paths.merged -Force -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $temp 'chrome-extension\runtime\model-edge-*.json') -Force -ErrorAction SilentlyContinue
    $global:ModelTestNow=$slotAt.AddMinutes(60);$global:ModelTestMode=$mode;$before=$global:ModelTestLaunches
    if($mode -eq 'wrong-id'){Must-Fail {Invoke-ModelEdgeRecovery $sourcePath $FlowSlot $global:ModelTestFolder $temp $queue};Check ($global:ModelTestLaunches -eq ($before+1)) 'Bad IDs restarted recovery.';continue}
    $p=Invoke-ModelEdgeRecovery $sourcePath $FlowSlot $global:ModelTestFolder $temp $queue;$m=Read-ScanRecoveryJson $p
    Check ($m.modelRecovery.recovered -eq 0 -and $m.results[1].ok -eq $false -and $m.results[0].price -eq 800000) "Failed $mode recovery damaged primary rows."
    $stamp=$m.scannedAt;Invoke-ModelEdgeRecovery $sourcePath $FlowSlot $global:ModelTestFolder $temp $queue|Out-Null
    Check ($global:ModelTestLaunches -eq ($before+1) -and (Read-ScanRecoveryJson $p).scannedAt -ceq $stamp) "Failed $mode recovery repeated or moved history key."
  }
  # The existing 1.9.52 sources keep one attempt. Only a new 1.9.54
  # source may schedule an independently persisted second bounded attempt.
  Remove-Item $paths.receipt,$paths.source,$paths.merged -Force -ErrorAction SilentlyContinue
  $base.extensionVersion='1.9.54';Write-ModelEdgeJson $sourcePath $base
  $queue.sourceHash=(Get-FileHash $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
  $queue|Add-Member maxAttempts 2 -Force;$queue|Add-Member activeAttempt 1 -Force
  $queue.finalCommit=$null;$queue.state='collecting'
  Write-ModelEdgeJson (Get-BlueRecoveryQueuePath $temp $base) $queue
  $global:ModelTestNow=$slotAt.AddMinutes(60);$global:ModelTestMode='row-fail';$before=$global:ModelTestLaunches
  $firstPath=Invoke-ModelEdgeRecovery $sourcePath $FlowSlot $global:ModelTestFolder $temp $queue
  $first=Read-ScanRecoveryJson $firstPath
  Check ($first.modelRecovery.recovered -eq 0) 'Failed first attempt claimed a recovery.'
  Set-BlueRecoveryNextStep $queue $base $global:ModelTestFolder $temp
  Check ($queue.state -eq 'waiting-second' -and $queue.activeAttempt -eq 2) 'Transient failure was not queued for the second attempt.'
  $firstReceipt=Read-ScanRecoveryJson $paths.receipt
  $firstEdge=Read-ScanRecoveryJson (Get-SavedEdgeRunPath $global:ModelTestFolder $firstReceipt.runId)
  Check (([DateTimeOffset]::Parse($queue.secondNotBefore)-[DateTimeOffset]::Parse($firstEdge.completedAt)).TotalSeconds -eq 600) 'Second cooldown was not ten minutes from first completion.'
  Write-ModelEdgeJson (Get-BlueRecoveryQueuePath $temp $base) $queue
  $global:ModelTestNow=([DateTimeOffset]::Parse($queue.secondNotBefore)).AddSeconds(-1)
  Must-Fail {Invoke-ModelEdgeRecovery $sourcePath $FlowSlot $global:ModelTestFolder $temp $queue}
  Check ($global:ModelTestLaunches -eq ($before+1)) 'Early second attempt started a browser.'
  $goodTargets=$queue.secondTargetItemIds;$queue.secondTargetItemIds=@('1','2')
  Must-Fail {Get-BlueAttemptGate $queue 2 $base $global:ModelTestFolder $temp};$queue.secondTargetItemIds=$goodTargets
  $global:ModelTestNow=([DateTimeOffset]::Parse($queue.secondNotBefore));$global:ModelTestMode='success'
  $secondPath=Invoke-ModelEdgeRecovery $sourcePath $FlowSlot $global:ModelTestFolder $temp $queue
  $second=Read-ScanRecoveryJson $secondPath
  Check ($global:ModelTestLaunches -eq ($before+2) -and $second.modelRecovery.attemptCount -eq 2 -and $second.modelRecovery.recovered -eq 1) 'Second completion did not recover exactly one failed model.'
  Check (($second.results[0]|ConvertTo-Json -Depth 20 -Compress) -ceq ($first.results[0]|ConvertTo-Json -Depth 20 -Compress)) 'Second attempt altered a healthy row or its provenance.'
  Assert-ModelEdgeComposite $second $FlowSlot $global:ModelTestFolder $temp
  Invoke-ModelEdgeRecovery $sourcePath $FlowSlot $global:ModelTestFolder $temp $queue|Out-Null
  Check ($global:ModelTestLaunches -eq ($before+2)) 'Resume launched a third collection.'
  Set-BlueRecoveryNextStep $queue $base $global:ModelTestFolder $temp
  Check ($queue.state -eq 'deferred') 'The second attempt allowed an unbounded retry.'
  Write-ModelEdgeJson (Get-BlueRecoveryQueuePath $temp $base) $queue
  $beforeReplay=Get-Content (Get-BlueRecoveryQueuePath $temp $base) -Raw
  Save-BlueRecoveryFinalCommit $first $temp
  Check ((Get-Content (Get-BlueRecoveryQueuePath $temp $base) -Raw) -ceq $beforeReplay) 'An old first composite reactivated a completed/deferred second attempt.'
  $queue.activeAttempt=3;Must-Fail {Assert-BlueRecoveryQueue $queue $base};$queue.activeAttempt=2
  foreach($reason in @('login-required','captcha-required','product-identifiers-mismatch','invalid-catalog')) {
    Check ((Get-BlueFailureClass ([pscustomobject]@{reason=$reason})) -ne 'transient') "Unsafe automatic retry classification: $reason"
  }
  # Drive the actual poller for the second cooldown as well as the worker gate.
  $queue.state='waiting-second';$queue.nextCheckAt=$null
  Write-ModelEdgeJson (Get-BlueRecoveryQueuePath $temp $base) $queue
  Remove-Item (Join-Path $temp 'reports\poll-dispatch.txt') -Force -ErrorAction SilentlyContinue
  $global:ModelTestNow=([DateTimeOffset]::Parse($queue.secondNotBefore)).AddSeconds(-1)
  & (Join-Path $temp 'scripts\run-blue-recovery.ps1') -RepoPath $temp
  Check (-not(Test-Path (Join-Path $temp 'reports\poll-dispatch.txt'))) 'Poller dispatched before the second ten-minute cooldown.'
  $global:ModelTestNow=([DateTimeOffset]::Parse($queue.secondNotBefore))
  & (Join-Path $temp 'scripts\run-blue-recovery.ps1') -RepoPath $temp
  Check (Test-Path (Join-Path $temp 'reports\poll-dispatch.txt')) 'Due second cooldown did not dispatch the guarded worker.'
  # Cumulative merge preserves a model already fixed by attempt one, including
  # all per-row provenance, while attempt two replaces only the other model.
  $previous=$first|ConvertTo-Json -Depth 40|ConvertFrom-Json
  $previous.results[0].collectionSource.runId='f'*32
  $previous.modelRecovery.replacedItemIds=@('1');$previous.modelRecovery.recovered=1;$previous.modelRecovery.attempted=2
  $secondReceipt=Read-ScanRecoveryJson ((Get-ModelEdgePaths $temp $base 2).receipt)
  $secondEdge=Read-ScanRecoveryJson (Get-SavedEdgeRunPath $global:ModelTestFolder $secondReceipt.runId)
  $combined=New-ModelEdgeMergedPayload $base $secondReceipt $secondEdge $previous
  Check ($combined.modelRecovery.recovered -eq 2 -and $combined.results[0].collectionSource.runId -ceq ('f'*32)) 'Previously recovered provenance was rewritten.'
  # The issue ledger tracks identities, not previous prices. A newer normal
  # published scan can resolve the issue without replaying an older slot.
  Update-BlueIssueLedger $base $temp $global:ModelTestFolder
  $ledgerPath=Join-Path $temp 'reports\recovery-issues.json'
  $ledger=Read-ScanRecoveryJson $ledgerPath
  Check ($ledger.models.Count -eq 1 -and $ledger.models[0].state -eq 'unresolved') 'Unresolved identity was not retained.'
  Check (-not($ledger.models[0].PSObject.Properties.Name -contains 'price')) 'A price was carried across slots.'
  $newBase=$base|ConvertTo-Json -Depth 30|ConvertFrom-Json;$newBase.runId='f'*32;$newBase.scannedAt=$slotAt.AddHours(4).ToString('o')
  $pub.meta.collectionEvidence.runId=$newBase.runId;$pub.meta.snapshotAt=$newBase.scannedAt
  $pub.products[1].offers[0].collectionStatus='verified'
  ('window.MARKET_DATA = '+($pub|ConvertTo-Json -Depth 20)+';')|Set-Content (Join-Path $brandFolder 'market-data.js') -Encoding UTF8
  Update-BlueIssueLedger $newBase $temp $global:ModelTestFolder
  $pendingLedger=Read-ScanRecoveryJson $ledgerPath;$pendingHash=Get-BlueIssueLedgerHash $ledgerPath
  Confirm-BlueIssueLedger $temp $global:ModelTestFolder
  Check (-not(Save-BlueIssueLedger $ledgerPath $pendingLedger $pendingHash)) 'A stale monitor overwrote a newer issue ledger.'
  Check ((Read-ScanRecoveryJson $ledgerPath).models[0].state -eq 'resolved') 'New published normal collection did not clear the carried issue.'
  $short=$queue|ConvertTo-Json -Depth 30|ConvertFrom-Json;$short.activeAttempt=1
  $short.publicationDeadline=([DateTimeOffset]::Parse($firstEdge.completedAt)).AddMinutes(9).ToString('o')
  Set-BlueRecoveryNextStep $short $base $global:ModelTestFolder $temp
  Check ($short.state -eq 'deferred') 'Cooldown extended the original publication budget.'
  # Execute the real importer's preservation branch against an already-fixed
  # first-attempt row and a newly fixed second-attempt row.
  $importSource=Get-Content (Join-Path $PSScriptRoot 'import-extension-results.ps1') -Raw -Encoding UTF8
  $preserveStart=$importSource.IndexOf('    if($payload.modelRecovery -and (')
  $preserveEnd=$importSource.IndexOf('    $rowSource=', $preserveStart)
  Check ($preserveStart -gt 0 -and $preserveEnd -gt $preserveStart) 'Importer preservation branch missing.'
  $branch=$importSource.Substring($preserveStart,$preserveEnd-$preserveStart)
  $payload=$combined;$partialCount=0;$verified=0;$soldOutCount=0;$script:preserveWrites=0
  $saved=[pscustomobject]@{collectionEvidence=[pscustomobject]@{runId=$combined.results[0].collectionSource.runId;checkedAt=$combined.results[0].checkedAt};priceChange=123;priceCheckedAt='preserved'}
  $fresh=[pscustomobject]@{collectionEvidence=[pscustomobject]@{runId='older';checkedAt='older'}}
  & ([ScriptBlock]::Create('param($rows); foreach($entry in $rows){$result=$entry.result;$mine=$entry.mine;'+$branch+'$script:preserveWrites++}')) @([pscustomobject]@{result=$combined.results[0];mine=$saved},[pscustomobject]@{result=$combined.results[1];mine=$fresh})
  Check ($script:preserveWrites -eq 1 -and $saved.priceChange -eq 123 -and $saved.priceCheckedAt -ceq 'preserved') 'The importer recomputed a previously fixed model.'
  Write-Host 'Bounded second attempt: exact ten-minute completion cooldown, transient-only subset, replay/third-attempt guards, cumulative provenance and cross-run issue resolution passed.'
  Write-Host "Post-publication $primary/full Edge -> delayed subset: exact failed subset, full-row merge/provenance, pinned original, replay, direct-subset/tamper/identity rejection and failed/partial/launch/timeout preservation passed."
} finally {
  $env:ProgramFiles=$oldProgramFiles;$env:LOCALAPPDATA=$oldLocal
  Remove-Item Function:\Start-Process,Function:\Start-Sleep,Function:\Invoke-MarketPulseGit,Function:\Invoke-RestMethod,Function:\Invoke-WebRequest -ErrorAction SilentlyContinue
  Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Variable ModelTestNow,ModelTestLaunches,ModelTestMode,ModelTestRepo,ModelTestFolder,ModelDeployBad,ModelTestSlot,ModelDeployPending -Scope Global -ErrorAction SilentlyContinue
}

