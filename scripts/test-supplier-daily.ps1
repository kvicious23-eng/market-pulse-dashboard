$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'supplier-daily.ps1')
function Check($Condition,[string]$Message) { if (-not $Condition) { throw $Message } }
function Row($Date,$Sku,$Center,$Stock,$Sales) { [pscustomobject]@{'날짜'=$Date;'SKU ID'=$Sku;'센터'=$Center;'현재재고수량'=$Stock;'출고수량'=$Sales;'매입원가'='private-cost'} }
$temp=Join-Path ([IO.Path]::GetTempPath()) ('MarketPulseDaily-'+[guid]::NewGuid().ToString('N'))
$root=Join-Path $temp 'Downloads';$folder=Join-Path $root 'MarketPulse';$repo=Join-Path $temp 'Repository';$remote=Join-Path $temp 'Remote.git'
New-Item -ItemType Directory -Path $folder,(Join-Path $folder 'SupplierPending'),(Join-Path $repo 'brand\example'),(Join-Path $repo 'dist') -Force | Out-Null
try {
  $day=[datetime]'2026-10-04';$request=[DateTimeOffset]'2026-10-04T08:15:00+09:00'
  $csv=Join-Path $folder 'basic_operation_rocket_2026100120261003.csv'
  $rows=@((Row '20261001' '0001' 'FC' '90' '2'),(Row '20261002' '0001' 'FC' '80' '1'),(Row '20261003' '0001' 'FC' '10' '3'),(Row '20261003' '0001' 'RC' '4' '2'),(Row '20261001' '2' 'FC' '99' '9'))
  $rows | Export-Csv -LiteralPath $csv -NoTypeInformation -Encoding UTF8
  (Get-Item -LiteralPath $csv).LastWriteTimeUtc=$request.UtcDateTime.AddSeconds(5)
  $valid=Test-SupplierDailyCsv $csv $root $day $request
  Check $valid.ok 'Valid all-center daily export rejected.'
  $pending=Join-Path $folder 'SupplierPending\basic_operation_rocket_2026100120261003.csv'
  Copy-Item $csv $pending
  Check (Test-SupplierDailyCsv $pending $root $day $request).ok 'Automatic pending folder rejected.'
  # Pending downloads are not recursively included in normal CSV discovery.
  Remove-Item $csv
  Check ((Get-SupplierMetricBatch ([pscustomobject]@{products=@()}) @($folder) $day).SourceStatus -eq 'csv-missing') 'Unvalidated pending download was selected.'
  Copy-Item $pending $csv
  Check (-not (Test-SupplierDailyCsv $csv $root $day $request.AddMinutes(1)).ok) 'Old file accepted as new request.'
  Check (-not (Test-SupplierDailyCsv (Join-Path $temp 'outside.csv') $root $day $request).ok) 'Outside download path accepted.'
  Check (-not (Test-SupplierDailyCsv $csv $root $day.AddDays(1) $request).ok) 'Wrong previous day accepted.'
  $broken=@($rows | Where-Object { $_.'날짜' -ne '20261002' });$broken | Export-Csv $csv -NoTypeInformation -Encoding UTF8
  Check ((Test-SupplierDailyCsv $csv $root $day $request).reason -eq 'csv_period_incomplete') 'Missing monthly date accepted.'
  @($rows+$rows[0]) | Export-Csv $csv -NoTypeInformation -Encoding UTF8
  Check ((Test-SupplierDailyCsv $csv $root $day $request).reason -eq 'csv_duplicate_row') 'Duplicate date/SKU/center accepted.'
  $bad=@($rows | ForEach-Object { $_ | Select-Object * });$bad[0].'출고수량'=''
  $bad | Export-Csv $csv -NoTypeInformation -Encoding UTF8
  Check (-not (Test-SupplierDailyCsv $csv $root $day $request).ok) 'Blank quantity accepted.'
  $rows | Export-Csv $csv -NoTypeInformation -Encoding UTF8
  # Month boundary: prior-day stock exists, current month has zero elapsed days.
  $boundary=Join-Path $folder 'basic_operation_rocket_2026093020260930.csv'
  @((Row '20260930' '0001' 'FC' '8' '2')) | Export-Csv $boundary -NoTypeInformation -Encoding UTF8
  Check (Test-SupplierDailyCsv $boundary $root ([datetime]'2026-10-01') ([DateTimeOffset]'2026-10-01T08:10:00+09:00')).ok 'First day of month rejected.'
  # A finished morning scan is distinct from an afternoon/manual/Edge scan.
  $scan=[pscustomobject]@{version=5;runId=('a'*32);browser='chrome';scanSlot='2026-10-04T08:00+09:00';startedAt='2026-10-03T23:00:00Z';completedAt='2026-10-03T23:15:00Z';complete=$true;targetCount=1;resultCount=1;results=@([pscustomobject]@{brand='Example';mtm='EXAMPLE1';productId='1';itemId='1';vendorItemId='1';ok=$true})}
  Save-SupplierLocalState (Join-Path $folder 'product-catalog.json') ([pscustomobject]@{products=@($scan.results)})
  $scanPath=Join-Path $folder 'latest-coupang-scan.json';Save-SupplierLocalState $scanPath $scan
  Check (Get-SupplierMorningSignal $folder $day $request).ready 'Morning signal rejected.'
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
