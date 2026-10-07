# Local CSV automation helpers. No credential access or raw CSV output.
. (Join-Path $PSScriptRoot 'supplier-metrics.ps1')
function Enter-MarketPulseRepositoryLock([string]$RepoPath,[int]$Seconds=600) {
  $sha=[Security.Cryptography.SHA256]::Create()
  try { $key=([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes([IO.Path]::GetFullPath($RepoPath).ToLowerInvariant())))).Replace('-','') } finally { $sha.Dispose() }
  $mutex=New-Object Threading.Mutex($false,('Local\MarketPulse.Repository.'+$key))
  try { $held=$mutex.WaitOne([TimeSpan]::FromSeconds($Seconds)) } catch [Threading.AbandonedMutexException] { $held=$true }
  if (-not $held) { $mutex.Dispose();throw 'Repository upload is busy.' }
  return $mutex
}
function Save-SupplierLocalState([string]$Path,$State) {
  New-Item -ItemType Directory -Path (Split-Path -Parent $Path) -Force | Out-Null
  $temp=$Path+'.'+[guid]::NewGuid().ToString('N')+'.tmp'
  [IO.File]::WriteAllText($temp,($State | ConvertTo-Json -Depth 12 -Compress),(New-Object Text.UTF8Encoding($false)))
  Move-Item -LiteralPath $temp -Destination $Path -Force
}
function Read-SupplierLocalState([string]$Path) {
  if (Test-Path -LiteralPath $Path) { return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json }
  return $null
}
function Get-SupplierMorningSignal([string]$Folder,[datetime]$Day,[DateTimeOffset]$Now) {
  try {
    $path=Join-Path $Folder 'latest-coupang-scan.json'
    if ((Get-Item -LiteralPath $path).Length -gt 10MB) { return $null }
    $scan=Read-SupplierLocalState $path
    $slot=$Day.ToString('yyyy-MM-dd')+'T08:00+09:00'
    $start=[DateTimeOffset]::Parse([string]$scan.startedAt);$end=[DateTimeOffset]::Parse([string]$scan.completedAt)
    $zone=[TimeZoneInfo]::FindSystemTimeZoneById('Korea Standard Time')
    $local=[TimeZoneInfo]::ConvertTime($start,$zone)
    $ids=@($scan.results | ForEach-Object { [string]$_.itemId })
    if ($scan.browser -ne 'chrome' -or $scan.complete -ne $true -or $scan.scanSlot -cne $slot -or
        $local.Date -ne $Day.Date -or $local.Hour -lt 8 -or $local.Hour -ge 12 -or $end -lt $start -or $end -gt $Now.AddMinutes(1) -or
        [int]$scan.targetCount -ne $ids.Count -or [int]$scan.resultCount -ne $ids.Count -or
        @($ids | Sort-Object -Unique).Count -ne $ids.Count -or @($ids | Where-Object { -not $_ }).Count -gt 0) { return $null }
    return [pscustomobject]@{ready=$true;day=$Day.ToString('yyyy-MM-dd');completedAt=$end.ToString('o')}
  } catch { return $null }
}
function Test-SupplierDailyCsv {
  param([string]$Path,[string]$DownloadRoot,[datetime]$Day,[DateTimeOffset]$RequestedAt)
  try {
    $full=[IO.Path]::GetFullPath($Path);$root=[IO.Path]::GetFullPath($DownloadRoot).TrimEnd('\','/')
    $parent=[IO.Path]::GetDirectoryName($full)
    if ($parent -ine $root -and $parent -ine (Join-Path $root 'MarketPulse') -and $parent -ine (Join-Path $root 'MarketPulse\SupplierPending')) { return @{ok=$false;reason='csv_path_not_allowed'} }
    $name=[IO.Path]::GetFileName($full)
    if ($name -notmatch '^basic_operation_rocket_(\d{8})(\d{8})(?: \(\d+\))?\.csv$') { return @{ok=$false;reason='csv_filename_invalid'} }
    $from=ConvertTo-SupplierDay $Matches[1];$through=ConvertTo-SupplierDay $Matches[2]
    $previous=$Day.Date.AddDays(-1);$start=if ($Day.Day -eq 1) { $previous } else { $Day.Date.AddDays(1-$Day.Day) }
    if ($from -gt $start -or $through -ne $previous) { return @{ok=$false;reason='csv_period_mismatch'} }
    $file=Get-Item -LiteralPath $full
    if ($file.LastWriteTimeUtc -lt $RequestedAt.UtcDateTime.AddSeconds(-2)) { return @{ok=$false;reason='csv_file_not_fresh'} }
    # Only direct files in the known download folders; no junction/symlink escape.
    $entries=@($file)
    for ($directory=$parent;$directory.Length -ge $root.Length;$directory=[IO.Path]::GetDirectoryName($directory)) { $entries+=Get-Item -LiteralPath $directory }
    foreach ($entry in $entries) {
      if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { return @{ok=$false;reason='csv_path_not_allowed'} }
    }
    $rows=@(Read-SupplierCsvRows $full)
    if ($rows.Count -lt 1 -or $rows.Count -gt 200000) { return @{ok=$false;reason='csv_invalid'} }
    $columns=@{}
    foreach ($name in $rows[0].PSObject.Properties.Name) {
      $key=([string]$name -replace '\s','').ToUpperInvariant()
      if ($columns.ContainsKey($key)) { return @{ok=$false;reason='csv_invalid'} };$columns[$key]=[string]$name
    }
    foreach ($name in @('날짜','센터','SKUID','현재재고수량','출고수량')) { if (-not $columns.ContainsKey($name)) { return @{ok=$false;reason='csv_invalid'} } }
    $days=New-Object 'System.Collections.Generic.HashSet[string]';$keys=New-Object 'System.Collections.Generic.HashSet[string]'
    foreach ($row in $rows) {
      $date=ConvertTo-SupplierDay ([string]$row.($columns['날짜']))
      $sku=([string]$row.($columns['SKUID'])).Trim();$center=([string]$row.($columns['센터'])).Trim().ToUpperInvariant()
      if ($date -lt $from -or $date -gt $through -or $sku -notmatch '^\d+$' -or -not $center -or
          -not (Get-SupplierQuantity $row.($columns['현재재고수량'])).valid -or -not (Get-SupplierQuantity $row.($columns['출고수량'])).valid) { return @{ok=$false;reason='csv_invalid'} }
      $dateKey=$date.ToString('yyyy-MM-dd');[void]$days.Add($dateKey)
      if (-not $keys.Add("$dateKey|$sku|$center")) { return @{ok=$false;reason='csv_duplicate_row'} }
    }
    for ($date=$start;$date -le $previous;$date=$date.AddDays(1)) {
      if (-not $days.Contains($date.ToString('yyyy-MM-dd'))) { return @{ok=$false;reason='csv_period_incomplete'} }
    }
    return @{ok=$true;asOfDate=$previous.ToString('yyyy-MM-dd');monthThrough=$previous.ToString('yyyy-MM-dd')}
  } catch { return @{ok=$false;reason='csv_invalid'} }
}
function Invoke-SupplierGit([string]$RepoPath,[string[]]$Arguments,[int[]]$Accepted=@(0)) {
  $old=$ErrorActionPreference;$prompt=$env:GIT_TERMINAL_PROMPT
  try { $ErrorActionPreference='Continue';$env:GIT_TERMINAL_PROMPT='0';$output=@(& git -C $RepoPath @Arguments 2>&1);$code=$LASTEXITCODE }
  finally { $ErrorActionPreference=$old;$env:GIT_TERMINAL_PROMPT=$prompt }
  if ($code -notin $Accepted) { throw 'Supplier metrics Git operation failed.' }
  return [pscustomobject]@{Code=$code;Output=$output}
}
function Publish-SupplierDailyMetrics {
  param([string]$RepoPath,$Queue,[string]$DownloadRoot,[datetime]$Day)
  $check=Test-SupplierDailyCsv -Path $Queue.filename -DownloadRoot $DownloadRoot -Day $Day -RequestedAt ([DateTimeOffset]::Parse($Queue.requestedAt))
  if (-not $check.ok) { throw $check.reason }
  $catalog=Read-SupplierLocalState (Join-Path $DownloadRoot 'MarketPulse\product-catalog.json')
  if (-not $catalog -or $null -eq $catalog.products) { throw 'catalog_missing' }
  $dirty=Invoke-SupplierGit $RepoPath @('status','--porcelain')
  if ($dirty.Output.Count) { throw 'repository_has_pending_changes' }
  [void](Invoke-SupplierGit $RepoPath @('pull','--ff-only','origin','main'))
  $rows=@(Read-SupplierCsvRows $Queue.filename)
  $batch=Get-SupplierRowMetrics $catalog $rows $Day
  $products=@($catalog.products | Where-Object { $_.enabled -ne $false })
  $expected=@($products | ForEach-Object { [string]$_.brand+'|'+[string]$_.itemId } | Sort-Object)
  $actual=@();$files=@()
  foreach ($file in @(Get-ChildItem -LiteralPath (Join-Path $RepoPath 'brand') -Filter 'market-data.js' -File -Recurse)) {
    $raw=[IO.File]::ReadAllText($file.FullName,[Text.Encoding]::UTF8)
    $data=($raw -replace '^\s*window\.MARKET_DATA\s*=\s*','' -replace ';\s*$','') | ConvertFrom-Json
    foreach ($product in @($data.products)) { $actual+=[string]$data.meta.brand+'|'+[string]$product.itemId }
    $files+=@{file=$file;data=$data}
  }
  # Metrics alone cannot add/remove products or repair a brand rename.
  if (($expected -join ',') -cne (@($actual | Sort-Object) -join ',')) { throw 'catalog_publication_mismatch' }
  $zone=[TimeZoneInfo]::FindSystemTimeZoneById('Korea Standard Time')
  $stamp=[TimeZoneInfo]::ConvertTime([DateTimeOffset]::UtcNow,$zone).ToString('yyyy-MM-ddTHH:mm:sszzz')
  foreach ($entry in $files) {
    if (Set-BrandSupplierMetrics -Data $entry.data -Batch $batch -PublishedAt $stamp) {
      $json=$entry.data | ConvertTo-Json -Depth 100
      [IO.File]::WriteAllText($entry.file.FullName,"window.MARKET_DATA = $json;`n",(New-Object Text.UTF8Encoding($false)))
    }
  }
  # Only these brand data files are staged. Price/competitor history is untouched.
  foreach ($entry in $files) { [void](Invoke-SupplierGit $RepoPath @('add','--',$entry.file.FullName)) }
  $diff=Invoke-SupplierGit $RepoPath @('diff','--cached','--quiet') @(0,1)
  if ($diff.Code -eq 1) { [void](Invoke-SupplierGit $RepoPath @('commit','-m','data: refresh daily Supplier Hub metrics')) }
  [void](Invoke-SupplierGit $RepoPath @('push','origin','main'))
}
