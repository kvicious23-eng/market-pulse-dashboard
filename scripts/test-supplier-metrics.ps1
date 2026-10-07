$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'supplier-metrics.ps1')
function Check($Condition,[string]$Message) { if (-not $Condition) { throw $Message } }
function Row($Date,$Sku,$Center,$Stock,$Sales) {
  [pscustomobject]@{'날짜'=$Date;'SKU ID'=$Sku;'센터'=$Center;'현재재고수량'=$Stock;'출고수량'=$Sales;'매입원가'='private-cost'}
}
$catalog=[pscustomobject]@{products=@(
  [pscustomobject]@{itemId='1';skuId='0001';enabled=$true},
  [pscustomobject]@{itemId='2';skuId='2';enabled=$true},
  [pscustomobject]@{itemId='3';skuId='';enabled=$true},
  [pscustomobject]@{itemId='4';skuId='0001';enabled=$false}
)}
$rows=@((Row '20261001' '0001' 'FC' '90' '2'),(Row '20261002' '0001' 'FC' '80' '1'),(Row '20261003' '0001' 'FC' '10' '3'),(Row '20261003' '0001' 'RC' '4' '2'),(Row '20261003' '0001' 'WIC01' '0' '0'),(Row '20261001' '2' 'FC' '99' '9'),(Row '20261004' '0001' 'FC' '10000' '10000'))
$day=[datetime]'2026-10-04'
$batch=Get-SupplierRowMetrics $catalog $rows $day
$m=$batch.ByItemId['1']
Check ($m.stock -eq 14 -and $m.dailySales -eq 5 -and $m.monthSales -eq 8) 'All centers or period boundaries were summed incorrectly.'
Check ($m.stockStatus -eq 'confirmed' -and $m.asOfDate -eq '2026-10-03' -and $m.month -eq '2026-10') 'Period evidence missing.'
Check ($batch.ByItemId['2'].stock -eq 0 -and $batch.ByItemId['2'].dailySales -eq 0 -and $batch.ByItemId['2'].monthSales -eq 9 -and $batch.ByItemId['2'].stockStatus -eq 'confirmed') 'A SKU present in this CSV must use zero for a day with no rows and preserve monthly sales.'
Check ($batch.ByItemId['3'].stockStatus -eq 'sku-unregistered' -and $null -eq $batch.ByItemId['3'].stock) 'Unregistered SKU became zero.'
Check (-not $batch.ByItemId.ContainsKey('4')) 'Disabled product re-entered publication.'
$zero=@((Row '20261001' '0001' 'FC' '0' '0'),(Row '20261002' '0001' 'FC' '0' '0'),(Row '20261003' '0001' 'FC' '0' '0'))
$z=(Get-SupplierRowMetrics $catalog $zero $day).ByItemId['1']
Check ($z.stock -eq 0 -and $z.dailySales -eq 0 -and $z.monthSales -eq 0 -and $z.stockStatus -eq 'confirmed') 'Real zero lost.'
$duplicate=(Get-SupplierRowMetrics $catalog ($rows+@($rows[2])) $day).ByItemId['1']
Check ($duplicate.stockStatus -eq 'duplicate-row' -and $null -eq $duplicate.stock) 'Duplicate daily center/SKU row doubled the counts.'
$partial=(Get-SupplierRowMetrics $catalog @($rows | Where-Object { $_.'날짜' -ne '20261002' }) $day).ByItemId['1']
Check ($partial.stock -eq 14 -and $partial.dailySales -eq 5 -and $null -eq $partial.monthSales -and $partial.monthSalesStatus -eq 'period-incomplete') 'Incomplete month presented as complete.'
$blank=@($rows | ForEach-Object { $copy=$_ | Select-Object *;if ($copy.'날짜' -eq '20261003' -and $copy.'센터' -eq 'RC') {$copy.'현재재고수량'=''};$copy })
$b=(Get-SupplierRowMetrics $catalog $blank $day).ByItemId['1']
Check ($null -eq $b.stock -and $b.stockStatus -eq 'value-invalid' -and $b.dailySales -eq 5) 'Blank quantity was treated as zero or invalidated another metric.'
$blankSales=@($rows | ForEach-Object { $copy=$_ | Select-Object *;if ($copy.'날짜' -eq '20261003' -and $copy.'센터' -eq 'RC') {$copy.'출고수량'=''};$copy })
$b=(Get-SupplierRowMetrics $catalog $blankSales $day).ByItemId['1']
Check ($b.stock -eq 14 -and $null -eq $b.dailySales -and $null -eq $b.monthSales) 'Missing sales quantity entered either sales sum.'
$wrong=[pscustomobject]@{products=@([pscustomobject]@{itemId='1';skuId='1';enabled=$true})}
Check ((Get-SupplierRowMetrics $wrong $rows $day).ByItemId['1'].stockStatus -eq 'sku-not-found') 'Leading zeros were removed from SKU identities.'
$ambiguous=[pscustomobject]@{products=@($catalog.products[0],[pscustomobject]@{itemId='other';skuId='0001';enabled=$true})}
Check ((Get-SupplierRowMetrics $ambiguous $rows $day).ByItemId['1'].stockStatus -eq 'sku-duplicate') 'Two active products were assigned the same SKU.'
$newMonth=(Get-SupplierRowMetrics $catalog @((Row '20261031' '0001' 'FC' '4' '2')) ([datetime]'2026-11-01')).ByItemId['1']
Check ($newMonth.stock -eq 4 -and $newMonth.dailySales -eq 2 -and $newMonth.monthSales -eq 0 -and $newMonth.month -eq '2026-11') 'Month boundary used the previous month for current-month sales.'
Check ((Get-SupplierRowMetrics $catalog @((Row '20261031' '2' 'FC' '4' '2')) ([datetime]'2026-11-01')).ByItemId['1'].monthSalesStatus -eq 'sku-not-found') 'An absent SKU became zero at the month boundary.'
Check ((Get-SupplierRowMetrics $catalog $rows ([datetime]'2026-10-06')).ByItemId['1'].stockStatus -eq 'date-missing') 'An older date was reused as yesterday.'
$overflow=@((Row '20261001' '0001' 'FC' '1' '1'),(Row '20261002' '0001' 'FC' '1' '1'),(Row '20261003' '0001' 'FC' '9007199254740991' '1'),(Row '20261003' '0001' 'RC' '1' '1'))
Check ((Get-SupplierRowMetrics $catalog $overflow $day).ByItemId['1'].stockStatus -eq 'value-invalid') 'Integer overflow was published.'
$work=Join-Path ([IO.Path]::GetTempPath()) ('market-pulse-metric-test-'+[guid]::NewGuid())
try {
  New-Item -ItemType Directory $work -Force | Out-Null
  $csvPath=Join-Path $work 'basic_operation_rocket_2026100120261003.csv'
  $rows | Export-Csv $csvPath -NoTypeInformation -Encoding UTF8
  $fromFile=Get-SupplierMetricBatch $catalog @($work) $day
  Check ($fromFile.ByItemId['1'].stock -eq 14 -and $fromFile.ByItemId['1'].monthSales -eq 8) 'Actual CSV loading changed totals.'
  $csvText=($rows | ConvertTo-Csv -NoTypeInformation) -join [Environment]::NewLine
  [IO.File]::WriteAllText($csvPath,$csvText,[Text.Encoding]::Unicode)
  Check ((Get-SupplierMetricBatch $catalog @($work) $day).ByItemId['1'].stock -eq 14) 'UTF-16 BOM CSV failed.'
  [IO.File]::WriteAllText($csvPath,$csvText,[Text.Encoding]::GetEncoding(949))
  Check ((Get-SupplierMetricBatch $catalog @($work) $day).ByItemId['1'].stock -eq 14) 'Korean CP949 CSV failed.'
  $public=ConvertTo-Json $fromFile.ByItemId['1'] -Depth 5 -Compress
  Check ($public -notmatch '0001|private-cost|매입원가|FullName|skuId') 'Private source fields leaked into the published metric object.'
  $data=[pscustomobject]@{meta=[pscustomobject]@{snapshotAt='price-snapshot-preserved';publishedAt='old'};products=@([pscustomobject]@{itemId='1';offers=@([pscustomobject]@{finalPrice=100})})}
  Check (Set-BrandSupplierMetrics $data $fromFile 'new-publication') 'New metrics did not trigger publication refresh.'
  Check (-not (Set-BrandSupplierMetrics $data $fromFile 'retry-time')) 'Same CSV/SKU retry changed publication time.'
  Check ($data.meta.snapshotAt -eq 'price-snapshot-preserved' -and $data.meta.publishedAt -eq 'new-publication' -and $data.products[0].offers[0].finalPrice -eq 100) 'Metric-only refresh changed price or scan time.'
  $empty=Join-Path $work 'empty';New-Item -ItemType Directory $empty -Force | Out-Null
  Check ((Get-SupplierMetricBatch $catalog @($empty) $day).ByItemId['1'].stockStatus -eq 'csv-missing') 'Missing CSV became a valid quantity.'
  [IO.File]::WriteAllText($csvPath,'wrong,header'+[Environment]::NewLine+'bad,data',[Text.UTF8Encoding]::new($true))
  Check ((Get-SupplierMetricBatch $catalog @($work) $day).ByItemId['1'].stockStatus -eq 'csv-invalid') 'Invalid CSV published values.'
  Write-Host 'Supplier metrics: all centers, day/month boundaries, missing/zero, duplicates, overflow, local CSV and price-preserving retries passed.'
} finally { Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue }
