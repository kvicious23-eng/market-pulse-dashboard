$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'supplier-daily.ps1')
function Check($Condition,[string]$Message) { if (-not $Condition) { throw $Message } }
function Stamp-CsvDay([string]$Path,[datetime]$Day) { (Get-Item -LiteralPath $Path).LastWriteTimeUtc=([DateTimeOffset]($Day.ToString('yyyy-MM-dd')+'T08:00:00+09:00')).UtcDateTime }
function Row($Date,$Sku,$Center,$Stock,$Sales) { [pscustomobject]@{'날짜'=$Date;'SKU ID'=$Sku;'센터'=$Center;'현재재고수량'=$Stock;'출고수량'=$Sales;'매입원가'='private-cost'} }
$temp=Join-Path ([IO.Path]::GetTempPath()) ('MarketPulseDaily-'+[guid]::NewGuid().ToString('N'))
$root=Join-Path $temp 'Downloads';$folder=Join-Path $root 'MarketPulse';$repo=Join-Path $temp 'Repository';$remote=Join-Path $temp 'Remote.git'
New-Item -ItemType Directory -Path $folder,(Join-Path $folder 'SupplierPending'),(Join-Path $repo 'brand\example'),(Join-Path $repo 'dist') -Force | Out-Null
try {
  Check (-not (Get-SupplierInventorySignal ([DateTimeOffset]'2026-10-03T22:59:59Z')).ready) 'Inventory started before 08 KST.'
  $inventory=Get-SupplierInventorySignal ([DateTimeOffset]'2026-10-03T23:00:00Z')
  Check ($inventory.ready -and $inventory.day -eq '2026-10-04' -and $inventory.source -eq 'independent') 'Inventory did not start independently at 08 KST.'
  Check (-not (Get-SupplierInventorySignal ([DateTimeOffset]'2026-10-04T15:00:00Z')).ready) 'Yesterday readiness crossed KST midnight.'
  # Execute the production dispatch function with only in-memory task mocks.
  # This must never start an actual scheduled task or submit another CSV request.
  & {
    $tokens=$null;$errors=$null
    $ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'supplier-daily-bridge.ps1'),[ref]$tokens,[ref]$errors)
    Check (-not $errors.Count) 'Supplier bridge syntax failed.'
    $definition=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Start-PendingSupplierPublication'},$true)
    Check ($null -ne $definition) 'Supplier dispatch function missing.'
    . ([scriptblock]::Create($definition.Extent.Text))
    $mock=[pscustomobject]@{state='Ready';starts=0;missing=$false}
    function Get-ScheduledTask {
      [CmdletBinding()]param([string]$TaskName)
      Check ($TaskName -eq 'Market Pulse Supplier Metrics') 'Unexpected task selected.'
      if(-not $mock.missing){[pscustomobject]@{State=$mock.state}}
    }
    function Start-ScheduledTask {
      [CmdletBinding()]param($InputObject)
      $mock.starts++;$mock.state='Running'
    }
    $date='2026-11-10'
    foreach($stamp in @('07:59:59','08:00:36','08:29:59','09:10:00')) {
      $now=[DateTimeOffset]($date+'T'+$stamp+'+09:00');$mock.state='Ready';$mock.starts=0
      $queue=[pscustomobject]@{day=$date;status='queued';attempts=0}
      Start-PendingSupplierPublication $queue
      Check ($mock.starts -eq 1) ('Validated CSV did not dispatch immediately at '+$stamp)
      Start-PendingSupplierPublication $queue
      Check ($mock.starts -eq 1) 'Running task was started twice.'
      $queue.status='published';$mock.state='Ready'
      Start-PendingSupplierPublication $queue
      Check ($mock.starts -eq 1) 'Already-published queue dispatched again.'
    }
    $now=[DateTimeOffset]'2026-11-10T08:00:36+09:00'
    foreach($queue in @($null,[pscustomobject]@{day='2026-11-09';status='queued';attempts=0},[pscustomobject]@{day=$date;status='queued';attempts=4})) {
      $mock.state='Ready';$mock.starts=0;Start-PendingSupplierPublication $queue
      Check ($mock.starts -eq 0) 'Absent, stale or exhausted queue was dispatched.'
    }
    $queue=[pscustomobject]@{day=$date;status='failed';attempts=1;nextAttemptAt=$now.AddMinutes(15).ToString('o')}
    $mock.state='Ready';$mock.starts=0;Start-PendingSupplierPublication $queue
    Check ($mock.starts -eq 0) 'Publication retry ignored its backoff.'
    $now=$now.AddMinutes(15);Start-PendingSupplierPublication $queue
    Check ($mock.starts -eq 1) 'Eligible failed publication did not resume.'
    $mock.starts=0;$mock.state='Ready';$mock.missing=$true
    Start-PendingSupplierPublication $queue
    Check ($mock.starts -eq 0) 'Missing publication task was treated as started.'
    Write-Host 'Validated Supplier CSV dispatches ASAP before 08:30; task-running/published/stale/exhausted/backoff guards passed.'
  }
  $day=[datetime]'2026-10-04';$request=[DateTimeOffset]'2026-10-04T08:15:00+09:00'
  $csv=Join-Path $folder 'basic_operation_rocket_2026100120261003.csv'
  $rows=@((Row '20261001' '0001' 'FC' '90' '2'),(Row '20261002' '0001' 'FC' '80' '1'),(Row '20261003' '0001' 'FC' '10' '3'),(Row '20261003' '0001' 'RC' '4' '2'),(Row '20261001' '2' 'FC' '99' '9'))
  $rows | Export-Csv -LiteralPath $csv -NoTypeInformation -Encoding UTF8
  Stamp-CsvDay $csv $day
  (Get-Item -LiteralPath $csv).LastWriteTimeUtc=$request.UtcDateTime.AddSeconds(5)
  $valid=Test-SupplierDailyCsv $csv $root $day $request
  Check $valid.ok 'Valid all-center daily export rejected.'
  $batchCatalog=[pscustomobject]@{products=@([pscustomobject]@{brand='Example';itemId='1';skuId='0001'})}
  $checkedBatch=Get-SupplierMetricBatch -Catalog $batchCatalog -CsvFolders @($root,$folder) -AsOfDay $day -RequireDailyValidation -DownloadRoot $root
  Check ($checkedBatch.ByItemId['1'].stock -eq 14) 'Original CSV did not pass shared publication validation.'
  $pending=Join-Path $folder 'SupplierPending\basic_operation_rocket_2026100120261003.csv'
  Copy-Item $csv $pending
  Check (Test-SupplierDailyCsv $pending $root $day $request).ok 'Automatic pending folder rejected.'
  # Pending downloads are not recursively included in normal CSV discovery.
  Remove-Item $csv
  Check ((Get-SupplierMetricBatch ([pscustomobject]@{products=@()}) @($folder) $day).SourceStatus -eq 'csv-missing') 'Unvalidated pending download was selected.'
  Copy-Item $pending $csv
  Check (Test-SupplierDailyCsv $csv $root $day $request.AddHours(6)).ok 'Same-day earlier file rejected by clock time.'
  Stamp-CsvDay $csv $day.AddDays(-1)
  Check (-not (Test-SupplierDailyCsv $csv $root $day $request).ok) 'Yesterday file accepted.'
  Stamp-CsvDay $csv $day.AddDays(1)
  Check (-not (Test-SupplierDailyCsv $csv $root $day $request).ok) 'Future file accepted.'
  (Get-Item -LiteralPath $csv).LastWriteTimeUtc=([DateTimeOffset]'2026-10-03T15:00:00Z').UtcDateTime
  Check (Test-SupplierDailyCsv $csv $root $day $request).ok 'KST midnight file rejected.'
  Check (-not (Test-SupplierDailyCsv (Join-Path $temp 'outside.csv') $root $day $request).ok) 'Outside download path accepted.'
  Check (-not (Test-SupplierDailyCsv $csv $root $day.AddDays(1) $request).ok) 'Wrong previous day accepted.'
  $broken=@($rows | Where-Object { $_.'날짜' -ne '20261002' });$broken | Export-Csv $csv -NoTypeInformation -Encoding UTF8
  Stamp-CsvDay $csv $day
  Check ((Test-SupplierDailyCsv $csv $root $day $request).reason -eq 'csv_period_incomplete') 'Missing monthly date accepted.'
  Check ((Get-SupplierMetricBatch -Catalog $batchCatalog -CsvFolders @($root,$folder) -AsOfDay $day -RequireDailyValidation -DownloadRoot $root).SourceStatus -eq 'csv-invalid') 'Unvalidated original CSV bypassed full-month validation.'
  @($rows+$rows[0]) | Export-Csv $csv -NoTypeInformation -Encoding UTF8
  Stamp-CsvDay $csv $day
  Check ((Test-SupplierDailyCsv $csv $root $day $request).reason -eq 'csv_duplicate_row') 'Duplicate date/SKU/center accepted.'
  $bad=@($rows | ForEach-Object { $_ | Select-Object * });$bad[0].'출고수량'=''
  $bad | Export-Csv $csv -NoTypeInformation -Encoding UTF8
  Stamp-CsvDay $csv $day
  Check (-not (Test-SupplierDailyCsv $csv $root $day $request).ok) 'Blank quantity accepted.'
  $rows | Export-Csv $csv -NoTypeInformation -Encoding UTF8
  Stamp-CsvDay $csv $day
  # Month boundary: prior-day stock exists, current month has zero elapsed days.
  $boundary=Join-Path $folder 'basic_operation_rocket_2026093020260930.csv'
  @((Row '20260930' '0001' 'FC' '8' '2')) | Export-Csv $boundary -NoTypeInformation -Encoding UTF8
  Stamp-CsvDay $boundary ([datetime]'2026-10-01')
  Check (Test-SupplierDailyCsv $boundary $root ([datetime]'2026-10-01') ([DateTimeOffset]'2026-10-01T08:10:00+09:00')).ok 'First day of month rejected.'
  # A finished morning scan is distinct from an afternoon/manual/Edge scan.
  $scan=[pscustomobject]@{version=5;runId=('a'*32);browser='chrome';scanSlot='2026-10-04T08:00+09:00';startedAt='2026-10-03T23:00:00Z';completedAt='2026-10-03T23:15:00Z';complete=$true;targetCount=1;resultCount=1;results=@([pscustomobject]@{brand='Example';mtm='EXAMPLE1';productId='1';itemId='1';vendorItemId='1';ok=$true})}
  Save-SupplierLocalState (Join-Path $folder 'product-catalog.json') ([pscustomobject]@{products=@($scan.results)})
  $scanPath=Join-Path $folder 'latest-coupang-scan.json';Save-SupplierLocalState $scanPath $scan
  Check (Get-SupplierMorningSignal $folder $day $request).ready 'Morning signal rejected.'
  $scan.results[0].ok=$false;Save-SupplierLocalState $scanPath $scan
  Check (Get-SupplierMorningSignal $folder $day $request).ready 'Price failure prevented daily inventory.'
  $scan.targetCount=2;Save-SupplierLocalState $scanPath $scan
  Check ($null -eq (Get-SupplierMorningSignal $folder $day $request)) 'Missing result accepted.'
  $scan.targetCount=1;$scan.results+=@($scan.results[0]);$scan.targetCount=2;$scan.resultCount=2;Save-SupplierLocalState $scanPath $scan
  Check ($null -eq (Get-SupplierMorningSignal $folder $day $request)) 'Duplicate failed result accepted.'
  $scan.results=@($scan.results[0]);$scan.targetCount=1;$scan.resultCount=1
  $scan.browser='edge';Save-SupplierLocalState $scanPath $scan;Check ($null -eq (Get-SupplierMorningSignal $folder $day $request)) 'Edge scan started independent CSV.'
  $scan.browser='chrome';$scan.scanSlot='2026-10-04T12:00+09:00';Save-SupplierLocalState $scanPath $scan;Check ($null -eq (Get-SupplierMorningSignal $folder $day $request)) 'Noon scan started daily CSV.'
  $scan.scanSlot='2026-10-04T08:00+09:00';$scan.complete=$false;Save-SupplierLocalState $scanPath $scan;Check ($null -eq (Get-SupplierMorningSignal $folder $day $request)) 'Incomplete JSON accepted.'
  $catalog=[pscustomobject]@{products=@([pscustomobject]@{brand='Example';itemId='1';skuId='0001'},[pscustomobject]@{brand='Example';itemId='2';skuId='2'},[pscustomobject]@{brand='Example';itemId='3';skuId='3'})}
  Save-SupplierLocalState (Join-Path $folder 'product-catalog.json') $catalog
  $data=[pscustomobject]@{meta=[pscustomobject]@{brand='Example';snapshotAt='2026-10-04T08:14:00+09:00'};products=@([pscustomobject]@{itemId='1';mtm='EXAMPLE1';coupang=[pscustomobject]@{price=100;trend='down';previous=120}},[pscustomobject]@{itemId='2';mtm='EXAMPLE2';coupang=[pscustomobject]@{price=200}},[pscustomobject]@{itemId='3';mtm='EXAMPLE3';coupang=[pscustomobject]@{price=300}})}
  $dataPath=Join-Path $repo 'brand\example\market-data.js'
  [IO.File]::WriteAllText($dataPath,('window.MARKET_DATA = '+($data | ConvertTo-Json -Depth 20)+';'),(New-Object Text.UTF8Encoding($false)))
  $historyPath=Join-Path $repo 'dist\price-history.js';[IO.File]::WriteAllText($historyPath,'preserved-history')
  [void](Invoke-SupplierGit $repo @('init','--initial-branch=main'))
  [void](Invoke-SupplierGit $repo @('config','user.name','Fixture'))
  [void](Invoke-SupplierGit $repo @('config','user.email','fixture@example.invalid'))
  [void](Invoke-SupplierGit $repo @('add','.'));[void](Invoke-SupplierGit $repo @('commit','-m','fixture'))
  [void](Invoke-SupplierGit $repo @('init','--bare','--initial-branch=main',$remote))
  [void](Invoke-SupplierGit $repo @('remote','add','origin',$remote));[void](Invoke-SupplierGit $repo @('push','-u','origin','main'))
  $queue=[pscustomobject]@{filename=$csv;requestedAt=$request.ToString('o')}
  Publish-SupplierDailyMetrics $repo $queue $root $day
  $after=([IO.File]::ReadAllText($dataPath) -replace '^window\.MARKET_DATA\s*=\s*','' -replace ';\s*$','') | ConvertFrom-Json
  Check ($after.meta.snapshotAt -eq $data.meta.snapshotAt) 'Late CSV changed price timestamp.'
  foreach ($i in 0..2) {Check (($after.products[$i].coupang | ConvertTo-Json -Compress) -ceq ($data.products[$i].coupang | ConvertTo-Json -Compress)) 'Late CSV changed price/trend.'}
  Check ($after.products[0].supplierMetrics.stock -eq 14 -and $after.products[0].supplierMetrics.dailySales -eq 5 -and $after.products[0].supplierMetrics.monthSales -eq 8) 'All centers not summed.'
  Check ($after.products[1].supplierMetrics.stock -eq 0 -and $after.products[1].supplierMetrics.dailySales -eq 0 -and $after.products[1].supplierMetrics.monthSales -eq 9) 'Known SKU absent on previous day must be zero.'
  Check ($after.products[2].supplierMetrics.stockStatus -eq 'sku-not-found') 'Absent SKU must remain unknown.'
  Check ([IO.File]::ReadAllText($historyPath) -ceq 'preserved-history') 'CSV publication changed history.'
  Check (-not ([IO.File]::ReadAllText($dataPath).Contains('private-cost'))) 'Raw business fields published.'
  $first=(Invoke-SupplierGit $repo @('rev-parse','HEAD')).Output -join ''
  Publish-SupplierDailyMetrics $repo $queue $root $day
  Check (((Invoke-SupplierGit $repo @('rev-parse','HEAD')).Output -join '') -eq $first) 'Repeated CSV made a duplicate commit.'
  # Independent inventory publication repairs an interrupted price transaction
  # before checking Git cleanliness; no price scan or extra CSV is requested.
  . (Join-Path $PSScriptRoot 'price-publication.ps1')
  [IO.File]::WriteAllText((Join-Path $repo '.gitignore'),'reports/'+[Environment]::NewLine)
  [void](Invoke-SupplierGit $repo @('add','.gitignore'));[void](Invoke-SupplierGit $repo @('commit','-m','ignore local journals'))
  Start-PricePublication $repo $catalog
  [IO.File]::WriteAllText($dataPath,'interrupted-price-output')
  [IO.File]::WriteAllText($historyPath,'interrupted-history-output')
  Publish-SupplierDailyMetrics $repo $queue $root $day
  Check (-not(Get-PricePublicationJournal $repo)) 'Independent inventory left an interrupted price journal.'
  Check ([IO.File]::ReadAllText($historyPath) -ceq 'preserved-history') 'Independent inventory failed to restore verified history.'
  $restored=([IO.File]::ReadAllText($dataPath) -replace '^window\.MARKET_DATA\s*=\s*','' -replace ';\s*$','')|ConvertFrom-Json
  Check ($restored.products[0].coupang.price -eq 100 -and $restored.products[0].supplierMetrics.stock -eq 14) 'Inventory recovery damaged price or CSV metrics.'
  # Fault injection uses only this temporary repository, CSV and bare remote.
  $script:OriginalSupplierGit=(Get-Command Invoke-SupplierGit).ScriptBlock
  $script:SupplierFaultPhase=''
  function Invoke-SupplierGit([string]$RepoPath,[string[]]$Arguments,[int[]]$Accepted=@(0)) {
    if($script:SupplierFaultPhase -and $Arguments[0] -ceq $script:SupplierFaultPhase){throw 'synthetic-supplier-publication-failure'}
    & $script:OriginalSupplierGit -RepoPath $RepoPath -Arguments $Arguments -Accepted $Accepted
  }
  function Read-FixtureSupplierData {
    $value=[IO.File]::ReadAllText($dataPath);$value.Substring($value.IndexOf('=')+1).Trim().TrimEnd(';')|ConvertFrom-Json
  }
  try {
    $beforeBrand=(Get-FileHash $dataPath -Algorithm SHA256).Hash
    $beforeHistory=(Get-FileHash $historyPath -Algorithm SHA256).Hash
    $faultRows=@(Import-Csv $csv -Encoding UTF8);$faultRows[2].'현재재고수량'='11';$faultRows|Export-Csv $csv -NoTypeInformation -Encoding UTF8;Stamp-CsvDay $csv $day
    $script:SupplierFaultPhase='add';$failed=$false
    try{Publish-SupplierDailyMetrics $repo $queue $root $day}catch{$failed=$_.Exception.Message -eq 'synthetic-supplier-publication-failure'}
    Check $failed 'Supplier pre-commit fault was not reached.'
    Check ((Get-FileHash $dataPath -Algorithm SHA256).Hash -ceq $beforeBrand) 'Supplier failure left partially updated brand data.'
    Check ((Get-FileHash $historyPath -Algorithm SHA256).Hash -ceq $beforeHistory) 'Supplier rollback changed price history.'
    Check (-not(Get-PricePublicationJournal $repo)) 'Supplier pre-commit recovery left a journal.'
    $script:SupplierFaultPhase=''
    Check (-not(Invoke-SupplierGit $repo @('status','--porcelain')).Output.Count) 'Supplier failure left a dirty repository.'
    Publish-SupplierDailyMetrics $repo $queue $root $day
    Check ((Read-FixtureSupplierData).products[0].supplierMetrics.stock -eq 15) 'Supplier retry did not publish fresh metrics.'
    $faultRows[2].'현재재고수량'='12';$faultRows|Export-Csv $csv -NoTypeInformation -Encoding UTF8;Stamp-CsvDay $csv $day
    $script:SupplierFaultPhase='push';$failed=$false
    try{Publish-SupplierDailyMetrics $repo $queue $root $day}catch{$failed=$_.Exception.Message -eq 'synthetic-supplier-publication-failure'}
    Check $failed 'Supplier post-commit push fault was not reached.'
    Check (-not(Get-PricePublicationJournal $repo)) 'Supplier committed result was not retained safely.'
    $script:SupplierFaultPhase=''
    $retained=(Invoke-SupplierGit $repo @('rev-parse','HEAD')).Output -join ''
    Publish-SupplierDailyMetrics $repo $queue $root $day
    Check (((Invoke-SupplierGit $repo @('rev-parse','HEAD')).Output -join '') -ceq $retained) 'Supplier push retry duplicated its metrics commit.'
    Check ((Get-FileHash $historyPath -Algorithm SHA256).Hash -ceq $beforeHistory) 'Supplier push retry changed price history.'
    $afterPush=Read-FixtureSupplierData
    Check ($afterPush.products[0].supplierMetrics.stock -eq 16 -and $afterPush.products[0].coupang.price -eq 100) 'Supplier push retry lost committed metrics or changed price.'
    Check (((Invoke-SupplierGit $repo @('ls-remote','origin','refs/heads/main')).Output -join '') -match $retained) 'Supplier retry did not push its retained commit.'
    Write-Host 'Supplier own pre-commit rollback, post-commit push retention and idempotent retry passed.'
  } finally {
    Set-Item Function:\Invoke-SupplierGit -Value $script:OriginalSupplierGit
    Remove-Variable OriginalSupplierGit,SupplierFaultPhase -Scope Script -ErrorAction SilentlyContinue
  }
  $catalog.products[0].brand='Renamed';Save-SupplierLocalState (Join-Path $folder 'product-catalog.json') $catalog
  $blocked=$false;try { Publish-SupplierDailyMetrics $repo $queue $root $day } catch {$blocked=$true}
  Check $blocked 'Metrics-only upload altered current product/brand list.'
  # Another process cannot enter the repository lock while it is held.
  $lock=Enter-MarketPulseRepositoryLock $repo 1
  try {
    $job=Start-Job -ArgumentList $PSScriptRoot,$repo -ScriptBlock {param($Scripts,$Repo);. (Join-Path $Scripts 'supplier-daily.ps1');try{$m=Enter-MarketPulseRepositoryLock $Repo 1;$m.ReleaseMutex();$m.Dispose();'entered'}catch{'blocked'}}
    $result=$job | Wait-Job | Receive-Job;Remove-Job $job
    Check ($result -eq 'blocked') 'Concurrent repository upload was allowed.'
  } finally {$lock.ReleaseMutex();$lock.Dispose()}
  $global:LASTEXITCODE=0
  Write-Host 'Daily CSV dates/schema/freshness, morning signal, zero/unknown, late Git publication, preserved prices/history, idempotency and cross-process lock passed.'
} finally {Remove-Item -LiteralPath $temp -Recurse -Force}
