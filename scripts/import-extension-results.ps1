param([string]$RepoPath = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = 'Stop'
$resultFolder = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads\MarketPulse'
$resultPath = Get-ChildItem -Path $resultFolder -Filter 'latest-coupang-scan*.json' -File -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1 -ExpandProperty FullName
if (-not $resultPath) { exit 0 }
$payload = Get-Content -Raw -Encoding UTF8 $resultPath | ConvertFrom-Json
$kstZone = [TimeZoneInfo]::FindSystemTimeZoneById('Korea Standard Time')

function Decode-Utf8([string]$value) {
  return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($value))
}
$text = @{
  Current = Decode-Utf8 '7ZiE7J6s6rCAIOyngeygkSDtmZXsnbg='
  CurrentDetail = Decode-Utf8 '64+Z7J28IEl0ZW0gSUTsnZgg7J2867CYIENocm9tZSDtmZTrqbTsl5DshJwg6rCA6rKpIO2ZleyduA=='
  RecentFailed = Decode-Utf8 '7LWc6re8IOqygOymneqwgCDCtyBDaHJvbWUg7ZmV7J24IOyLpO2MqA=='
  MissingFailed = Decode-Utf8 '6rCA6rKpIOuvuO2ZleyduCDCtyBDaHJvbWUg7ZmV7J24IOyLpO2MqA=='
  Marketplace = Decode-Utf8 '7Jik7ZSI66eI7LyT'
  Manufacturer = Decode-Utf8 '7KCc7KGw7IKs66qw'
  Specialist = Decode-Utf8 '7KCE66y466qw'
  OnSale = Decode-Utf8 '7YyQ66ek7KSR'
  SellerCondition = Decode-Utf8 '64uk64KY7JmAIOuwsOyGoeu5hCDtj6ztlagg6rO16rCcIO2MkOunpOqwgC4g7LaU6rCAIOy/oO2PsMK37Lm065Oc7ZWg7J247J2AIOuvuO2ZleyduC4='
  SellerSource = Decode-Utf8 '64uk64KY7JmAIOqwgOqyqeu5hOq1kCDtjJDrp6Tsspgg66qp66Gd'
  SellerDetail = Decode-Utf8 '7KCV7ZmV7ZWcIE1UTeydmCDsh7ztlZHrqrDrs4Qg7YyQ66ek6rCA66W8IOydvOuwmCBDaHJvbWXsl5DshJwg7ZmV7J24'
  Schedule = Decode-Utf8 '66ek7J28IDExOjMwIEtTVA=='
  Route = Decode-Utf8 'V2luZG93cyBQQyDCtyDsnbzrsJggQ2hyb21lIO2Zleyepe2UhOuhnOq3uOueqA=='
  MarketplacePattern = Decode-Utf8 'MTHrsojqsIB87Jil7IWYfEfrp4jsvJN866Gv642wT0587L+g7YyhfFNTR3zrhKTsnbTrsoQ='
  AcerPattern = Decode-Utf8 'QWNlcnzsl5DsnbTshJw='
  ScanSummary = Decode-Utf8 '7J2867CYIENocm9tZSDsobDsgqwgwrcg7ZiE7J6s6rCAIO2ZleyduA=='
}

function Read-Data($path) {
  $raw=[IO.File]::ReadAllText($path,[Text.Encoding]::UTF8)
  return ($raw -replace '^\s*window\.MARKET_DATA\s*=\s*','' -replace ';\s*$','') | ConvertFrom-Json
}
function Write-Data($path,$data) {
  $json=$data | ConvertTo-Json -Depth 100
  [IO.File]::WriteAllText($path,"window.MARKET_DATA = $json;`n",(New-Object Text.UTF8Encoding($false)))
}

git -C $RepoPath pull --rebase origin main
foreach ($spec in @(@{Brand='Lenovo';Path='dist\market-data.js'},@{Brand='Acer';Path='acer\market-data.js'})) {
  $path=Join-Path $RepoPath $spec.Path
  $data=Read-Data $path
  $brandResults=@($payload.results | Where-Object {$_.brand -eq $spec.Brand})
  $confirmed=0
  foreach ($product in $data.products) {
    $result=$brandResults | Where-Object {$_.itemId -eq [string]$product.itemId} | Select-Object -First 1
    $mine=$product.offers | Where-Object {$_.role -eq 'mine'} | Select-Object -First 1
    if (-not $mine -or -not $result) { continue }
    $kst=[TimeZoneInfo]::ConvertTime([DateTimeOffset]$result.checkedAt,$kstZone).ToString('yyyy-MM-dd HH:mm')
    $mine | Add-Member -NotePropertyName availabilityCheckedAt -NotePropertyValue $kst -Force
    if ($result.ok -and [long]$result.price -ge 250000 -and [long]$result.price -le 7000000) {
      $mine.displayPrice=[long]$result.price; $mine.finalPrice=[long]$result.price + [long]($mine.shipping)
      $mine.checkedAt=$kst; $mine | Add-Member -NotePropertyName priceCheckedAt -NotePropertyValue $kst -Force
      $mine.status=$text.Current; $mine.confidence='A'
      $mine.confidenceText=$text.CurrentDetail
      $confirmed++
    } else {
      $mine.status=if($null -ne $mine.finalPrice){$text.RecentFailed}else{$text.MissingFailed}
    }
    if ($spec.Brand -eq 'Acer' -and $result.competitors -and @($result.competitors).Count -gt 0) {
      $product.offers=@($product.offers | Where-Object {$_.role -ne 'competitor'})
      foreach ($entry in @($result.competitors)) {
        $channel=if($entry.seller -match $text.MarketplacePattern){$text.Marketplace}elseif($entry.seller -match $text.AcerPattern){$text.Manufacturer}else{$text.Specialist}
        $product.offers += [pscustomobject]@{
          role='competitor'; channel=$channel; seller=[string]$entry.seller; status=$text.OnSale
          displayPrice=[long]$entry.price; instantDiscount=$null; couponDiscount=$null; cardDiscount=$null
          finalPrice=[long]$entry.price; shipping=0
          condition=$text.SellerCondition
          sourceType=$text.SellerSource; checkedAt=$kst; confidence='B'
          confidenceText=$text.SellerDetail; url=[string]$result.danawaUrl
        }
      }
    }
  }
  $data.meta.monitoring.lastAttemptStatus=if($confirmed -eq $brandResults.Count){'success'}else{'partial'}
  $data.meta.monitoring.lastAttemptText="$($spec.Brand) $($text.ScanSummary) $confirmed/$($brandResults.Count)"
  $data.meta.monitoring.quickWatch=$text.Schedule
  $data.meta.monitoring.collectionRoute=$text.Route
  Write-Data $path $data
}
git -C $RepoPath add -- dist/market-data.js acer/market-data.js
git -C $RepoPath diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  git -C $RepoPath commit -m 'data: import Coupang prices from Chrome extension'
  git -C $RepoPath pull --rebase origin main
  git -C $RepoPath push origin main
}
