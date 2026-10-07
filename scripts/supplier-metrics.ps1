# Read the approved local Supplier Hub export. Only three totals and their periods
# leave this module; source rows, SKU codes, costs and local paths stay on the PC.
function ConvertTo-SupplierDay([string]$Value) {
  $day=[datetime]::MinValue
  foreach ($format in @('yyyyMMdd','yyyy-MM-dd')) {
    if ([datetime]::TryParseExact($Value.Trim(),$format,[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::None,[ref]$day)) { return $day.Date }
  }
  throw 'Invalid Supplier Hub date.'
}
function Get-SupplierQuantity($Value) {
  $text=([string]$Value).Trim()
  if ($text -notmatch '^-?(?:\d+|\d{1,3}(?:,\d{3})+)$') { return @{valid=$false;value=$null} }
  $number=[decimal]0
  if (-not [decimal]::TryParse($text.Replace(',',''),[Globalization.NumberStyles]::AllowLeadingSign,[Globalization.CultureInfo]::InvariantCulture,[ref]$number) -or [math]::Abs($number) -gt 9007199254740991) { return @{valid=$false;value=$null} }
  return @{valid=$true;value=$number}
}
function Get-SupplierSku($Product) {
  $codes=@()
  foreach ($property in $Product.PSObject.Properties) {
    $key=([string]$property.Name -replace '[\s_]','').ToLowerInvariant()
    if ($key -notin @('skuid','productcode','상품코드') -or $null -eq $property.Value) { continue }
    $value=$property.Value
    if ($value -isnot [string]) {
      $number=Get-SupplierQuantity $value
      if (-not $number.valid -or $number.value -lt 0) { return @{status='sku-invalid';code=''} }
    }
    $code=([string]$value).Trim()
    if (-not $code) { continue }
    if ($code -notmatch '^\d+$') { return @{status='sku-invalid';code=''} }
    $codes+=$code
  }
  $unique=@($codes | Sort-Object -Unique)
  if ($unique.Count -gt 1) { return @{status='sku-conflict';code=''} }
  if ($unique.Count -eq 0) { return @{status='sku-unregistered';code=''} }
  return @{status='registered';code=[string]$unique[0]}
}
function New-SupplierMetric($Day,[string]$Reason) {
  return [pscustomobject][ordered]@{
    stock=$null;dailySales=$null;monthSales=$null
    stockStatus=$Reason;dailySalesStatus=$Reason;monthSalesStatus=$Reason
    asOfDate=$Day.AddDays(-1).ToString('yyyy-MM-dd');month=$Day.ToString('yyyy-MM')
    monthThrough=$Day.AddDays(-1).ToString('yyyy-MM-dd');sourceDate=$null
    salesBasis='outbound';source='Supplier Hub CSV'
  }
}
function Get-SupplierRowMetrics {
  param($Catalog,$Rows,[datetime]$AsOfDay,[string]$SourceStatus='available')
  $day=$AsOfDay.Date;$previous=$day.AddDays(-1);$monthStart=$day.AddDays(1-$day.Day)
  $products=@($Catalog.products | Where-Object { $_.enabled -ne $false })
  $byItem=@{};$registrations=@{};$owners=@{};$duplicateSku=New-Object 'System.Collections.Generic.HashSet[string]'
  foreach ($product in $products) {
    $id=[string]$product.itemId;$sku=Get-SupplierSku $product;$registrations[$id]=$sku
    if ($sku.code) {
      if ($owners.ContainsKey($sku.code)) { [void]$duplicateSku.Add($sku.code) } else { $owners[$sku.code]=$id }
    }
  }
  $records=New-Object 'System.Collections.Generic.List[object]';$days=New-Object 'System.Collections.Generic.HashSet[string]'
  $keys=New-Object 'System.Collections.Generic.HashSet[string]';$duplicateRows=New-Object 'System.Collections.Generic.HashSet[string]'
  if ($SourceStatus -eq 'available') {
    try {
      $sourceRows=@($Rows)
      if ($sourceRows.Count -eq 0 -or $sourceRows.Count -gt 200000) { throw 'CSV row count invalid.' }
      $columns=@{}
      foreach ($name in $sourceRows[0].PSObject.Properties.Name) {
        $key=([string]$name -replace '\s','').ToUpperInvariant()
        if ($columns.ContainsKey($key)) { throw 'Duplicate CSV header.' }
        $columns[$key]=[string]$name
      }
      foreach ($required in @('날짜','센터','SKUID','현재재고수량','출고수량')) {
        if (-not $columns.ContainsKey($required)) { throw 'Required CSV header missing.' }
      }
      foreach ($row in $sourceRows) {
        $rowDay=ConvertTo-SupplierDay ([string]$row.($columns['날짜']))
        # This is a previous-day batch. Today's or future rows are never added.
        if ($rowDay -gt $previous) { continue }
        $sku=([string]$row.($columns['SKUID'])).Trim()
        $center=([string]$row.($columns['센터'])).Trim().ToUpperInvariant()
        if ($sku -notmatch '^\d+$' -or -not $center) { throw 'CSV identity missing.' }
        $dateKey=$rowDay.ToString('yyyy-MM-dd');[void]$days.Add($dateKey)
        $key="$dateKey|$sku|$center"
        if (-not $keys.Add($key)) { [void]$duplicateRows.Add($sku) }
        [void]$records.Add([pscustomobject]@{day=$rowDay;code=$sku;stock=(Get-SupplierQuantity $row.($columns['현재재고수량']));sales=(Get-SupplierQuantity $row.($columns['출고수량']))})
      }
      if ($records.Count -eq 0) { $SourceStatus='date-missing' }
    } catch { $SourceStatus='csv-invalid';$records.Clear() }
  }
  $sourceDate=if ($records.Count) { ($records | Sort-Object day -Descending | Select-Object -First 1).day.ToString('yyyy-MM-dd') } else { $null }
  if ($SourceStatus -eq 'available' -and $sourceDate -ne $previous.ToString('yyyy-MM-dd')) { $SourceStatus='date-missing' }
  $monthComplete=$true
  for ($date=$monthStart;$date -le $previous;$date=$date.AddDays(1)) {
    if (-not $days.Contains($date.ToString('yyyy-MM-dd'))) { $monthComplete=$false;break }
  }
  foreach ($product in $products) {
    $id=[string]$product.itemId;$sku=$registrations[$id]
    $reason=if ($sku.status -ne 'registered') { $sku.status } elseif ($duplicateSku.Contains($sku.code)) { 'sku-duplicate' } elseif ($SourceStatus -ne 'available') { $SourceStatus } elseif ($duplicateRows.Contains($sku.code)) { 'duplicate-row' } else { 'sku-not-found' }
    $metric=New-SupplierMetric $day $reason;$metric.sourceDate=$sourceDate
    if ($reason -eq 'sku-not-found') {
      $own=@($records | Where-Object { $_.code -ceq $sku.code })
      if ($own.Count -eq 0) { $byItem[$id]=$metric;continue }
      $daily=@($own | Where-Object { $_.day -eq $previous })
      $monthly=@($own | Where-Object { $_.day -ge $monthStart -and $_.day -le $previous })
      foreach ($definition in @(@{field='stock';status='stockStatus';rows=$daily;column='stock'},@{field='dailySales';status='dailySalesStatus';rows=$daily;column='sales'},@{field='monthSales';status='monthSalesStatus';rows=$monthly;column='sales'})) {
        $subset=@($definition.rows);$field=$definition.field;$status=$definition.status
        if ($field -eq 'monthSales' -and $previous -lt $monthStart) { $metric.$field=0;$metric.$status='confirmed';continue }
        if ($field -eq 'monthSales' -and -not $monthComplete) { $metric.$status='period-incomplete';continue }
        # For a current export, the user defines no rows for a known SKU as zero.
        # An absent SKU remains unknown; malformed/blank quantities remain errors.
        if ($subset.Count -eq 0) { $metric.$field=0;$metric.$status='confirmed';continue }
        $total=[decimal]0;$valid=$true
        foreach ($record in $subset) {
          $quantity=$record.($definition.column)
          if (-not $quantity.valid) { $valid=$false;break }
          $total+=$quantity.value
        }
        if (-not $valid -or [math]::Abs($total) -gt 9007199254740991) { $metric.$status='value-invalid';continue }
        $metric.$field=[long]$total;$metric.$status='confirmed'
      }
    }
    $byItem[$id]=$metric
  }
  return [pscustomobject]@{ByItemId=$byItem;SourceStatus=$SourceStatus}
}
function Get-SupplierMetricBatch {
  param($Catalog,[string[]]$CsvFolders,[datetime]$AsOfDay)
  $files=@()
  foreach ($folder in $CsvFolders) {
    foreach ($file in @(Get-ChildItem -LiteralPath $folder -Filter 'basic_operation_rocket_*.csv' -File -ErrorAction SilentlyContinue)) {
      if ($file.Name -match '^basic_operation_rocket_(\d{8})(\d{8})(?: \(\d+\))?\.csv$') {
        $files+= [pscustomobject]@{file=$file;through=$Matches[2]}
      }
    }
  }
  $selected=$files | Sort-Object @{Expression={$_.through};Descending=$true},@{Expression={$_.file.LastWriteTimeUtc};Descending=$true} | Select-Object -First 1
  if (-not $selected) { return Get-SupplierRowMetrics $Catalog @() $AsOfDay 'csv-missing' }
  try {
    if ($selected.file.Length -gt 32MB) { throw 'CSV exceeds the size limit.' }
    $bytes=[IO.File]::ReadAllBytes($selected.file.FullName)
    if ($bytes.Length -ge 2 -and $bytes[0] -eq 255 -and $bytes[1] -eq 254) { $text=[Text.Encoding]::Unicode.GetString($bytes) }
    elseif ($bytes.Length -ge 2 -and $bytes[0] -eq 254 -and $bytes[1] -eq 255) { $text=[Text.Encoding]::BigEndianUnicode.GetString($bytes) }
    else {
      try { $text=[Text.UTF8Encoding]::new($false,$true).GetString($bytes) }
      catch { $text=[Text.Encoding]::GetEncoding(949).GetString($bytes) }
    }
    $text=$text.TrimStart([char]0xfeff)
    $rows=@($text | ConvertFrom-Csv -ErrorAction Stop)
    return Get-SupplierRowMetrics $Catalog $rows $AsOfDay
  } catch { return Get-SupplierRowMetrics $Catalog @() $AsOfDay 'csv-invalid' }
}
function Set-BrandSupplierMetrics {
  param($Data,$Batch,[string]$PublishedAt)
  $changed=$false
  foreach ($product in @($Data.products)) {
    $metric=$Batch.ByItemId[[string]$product.itemId]
    if (-not $metric) { continue }
    $before=if ($product.PSObject.Properties['supplierMetrics']) { $product.supplierMetrics | ConvertTo-Json -Depth 4 -Compress } else { '' }
    $after=$metric | ConvertTo-Json -Depth 4 -Compress
    if ($before -cne $after) { $changed=$true }
    $product | Add-Member -NotePropertyName supplierMetrics -NotePropertyValue $metric -Force
  }
  if ($changed) { $Data.meta | Add-Member -NotePropertyName publishedAt -NotePropertyValue $PublishedAt -Force }
  return $changed
}
