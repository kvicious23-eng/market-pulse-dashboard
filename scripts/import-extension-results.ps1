param(
  [string]$RepoPath = (Split-Path -Parent $PSScriptRoot),
  [switch]$WaitForToday
)
$ErrorActionPreference = 'Stop'
$resultFolder = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads\MarketPulse'
$catalogPath = Join-Path $resultFolder 'product-catalog.json'
$kstZone = [TimeZoneInfo]::FindSystemTimeZoneById('Korea Standard Time')

function Get-LatestResultPath {
  return Get-ChildItem -Path $resultFolder -Filter 'latest-coupang-scan*.json' -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1 -ExpandProperty FullName
}

$deadline = [DateTime]::UtcNow.AddMinutes(45)
do {
  $resultPath = Get-LatestResultPath
  $payload = if ($resultPath) { Get-Content -Raw -Encoding UTF8 $resultPath | ConvertFrom-Json } else { $null }
  if ($payload) {
    $resultDay = [TimeZoneInfo]::ConvertTime([DateTimeOffset]$payload.scannedAt,$kstZone).ToString('yyyy-MM-dd')
    $todayKst = [TimeZoneInfo]::ConvertTime([DateTimeOffset]::UtcNow,$kstZone).ToString('yyyy-MM-dd')
    if (-not $WaitForToday -or $resultDay -eq $todayKst) { break }
  }
  if (-not $WaitForToday -or [DateTime]::UtcNow -ge $deadline) { exit 0 }
  Start-Sleep -Seconds 30
} while ($true)

# Version 1 results were produced before reliable main-price and card-detail
# capture. Ignore them so installing an update cannot overwrite good dashboard
# data with a stale, incompatible scan.
if ([int]$payload.version -lt 2) {
  Write-Host 'Skipping an older scan file. Run scanner version 1.2.3 or newer.'
  exit 0
}

$scanKst = [TimeZoneInfo]::ConvertTime([DateTimeOffset]$payload.scannedAt,$kstZone).ToString('yyyy-MM-ddTHH:mm:sszzz')
$catalog = if (Test-Path $catalogPath) { Get-Content -Raw -Encoding UTF8 $catalogPath | ConvertFrom-Json } else { $null }

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
  Schedule = Decode-Utf8 '66ek7J28IDEwOjAwIEtTVA=='
  Route = Decode-Utf8 'V2luZG93cyBQQyDCtyDsnbzrsJggQ2hyb21lIO2Zleyepe2UhOuhnOq3uOueqA=='
  MarketplacePattern = Decode-Utf8 'MTHrsojqsIB87Jil7IWYfEfrp4jsvJN866Gv642wT0587L+g7YyhfFNTR3zrhKTsnbTrsoQ='
  AcerPattern = Decode-Utf8 'QWNlcnzsl5DsnbTshJw='
  ScanSummary = Decode-Utf8 '7J2867CYIENocm9tZSDsobDsgqwgwrcg7ZiE7J6s6rCAIO2ZleyduA=='
  Coupang = Decode-Utf8 '7L+g7Yyh'
  MyProduct = Decode-Utf8 '64K0IOy/oO2MoSDsg4Htkog='
  ManagedUrl = Decode-Utf8 '6rSA66as7ZmU66m0IOuTseuhnSBVUkw='
  FirstScan = Decode-Utf8 '7LKrIENocm9tZSDsobDsgqwg64yA6riw'
  ManagedProduct = Decode-Utf8 '7IKs7Jqp7J6QIOq0gOumrCDsg4Htkog='
}

function Read-Data($path) {
  $raw=[IO.File]::ReadAllText($path,[Text.Encoding]::UTF8)
  return ($raw -replace '^\s*window\.MARKET_DATA\s*=\s*','' -replace ';\s*$','') | ConvertFrom-Json
}
function Write-Data($path,$data) {
  $json=$data | ConvertTo-Json -Depth 100
  [IO.File]::WriteAllText($path,"window.MARKET_DATA = $json;`n",(New-Object Text.UTF8Encoding($false)))
}

function Get-BrandSlug([string]$brand) {
  $slug=($brand.Trim().ToLowerInvariant() -replace '[^\p{L}\p{Nd}]+','-').Trim('-')
  if (-not $slug) { throw "Brand name cannot be converted to a dashboard URL." }
  return $slug
}

function New-BrandDashboard([string]$brand,[string]$dataPath) {
  $directory=Split-Path -Parent $dataPath
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
  $indexPath=Join-Path $directory 'index.html'
  $safeBrand=[Net.WebUtility]::HtmlEncode($brand)
  $html=[IO.File]::ReadAllText((Join-Path $RepoPath 'acer\index.html'),[Text.Encoding]::UTF8)
  $html=$html -replace '<meta name="description" content="[^"]*" />',("<meta name=`"description`" content=`"$safeBrand online price dashboard`" />")
  $html=$html -replace '<title>.*?</title>',("<title>$safeBrand price dashboard</title>")
  $html=$html -replace '<small id="brandSubtitle">.*?</small>',("<small id=`"brandSubtitle`">$safeBrand Notebook · Korea</small>")
  $html=$html -replace 'href="\.\/styles\.css([^\"]*)"','href="../../dist/styles.css$1"'
  $html=$html -replace 'src="\.\/app\.js([^\"]*)"','src="../../dist/app.js$1"'
  [IO.File]::WriteAllText($indexPath,$html,(New-Object Text.UTF8Encoding($false)))
  if (-not (Test-Path $dataPath)) {
    $empty=[pscustomobject]@{
      meta=[pscustomobject]@{
        brand=$brand; snapshotAt=$scanKst; sourceFile='product-catalog.json'
        comparisonBasis='Exact model and item price comparison'
        exclusions='Personal rewards and unverified benefits are excluded'
        monitoring=[pscustomobject]@{
          enabled=$true; quickWatch='Daily 10:00 KST'; fullResearch='Basic and precision scan'
          dashboardSync='GitHub Pages automatic deployment'; lastAttemptAt=$scanKst
          lastAttemptStatus='pending'; lastAttemptText='Waiting for first scan'
          collectionRoute='Windows PC and Chrome extension'
        }
      }
      products=@()
    }
    Write-Data $dataPath $empty
  }
}

git -C $RepoPath pull --rebase origin main
$specs=@(@{Brand='Lenovo';Path='dist\market-data.js'},@{Brand='Acer';Path='acer\market-data.js'})
if ($catalog) {
  $extraBrands=@($catalog.products | Where-Object {$_.brand -and $_.brand -notin @('Lenovo','Acer')} | ForEach-Object {[string]$_.brand.Trim()} | Sort-Object -Unique)
  foreach ($brand in $extraBrands) {
    $slug=Get-BrandSlug $brand
    $relativePath="brand\$slug\market-data.js"
    $fullPath=Join-Path $RepoPath $relativePath
    New-BrandDashboard $brand $fullPath
    $specs+=@{Brand=$brand;Path=$relativePath}
  }
}
foreach ($spec in $specs) {
  $path=Join-Path $RepoPath $spec.Path
  $data=Read-Data $path
  $data.meta | Add-Member -NotePropertyName brand -NotePropertyValue $spec.Brand -Force
  $brandResults=@($payload.results | Where-Object {$_.brand -eq $spec.Brand})
  $catalogProducts=@($catalog.products | Where-Object {$_.brand -eq $spec.Brand -and $_.enabled -ne $false})
  if ($catalog -and $catalogProducts.Count -ge 0) {
    $activeIds=@($catalogProducts | ForEach-Object {[string]$_.itemId})
    $data.products=@($data.products | Where-Object {$activeIds -contains [string]$_.itemId})
    foreach ($config in $catalogProducts) {
      $product=$data.products | Where-Object {[string]$_.itemId -eq [string]$config.itemId} | Select-Object -First 1
      if (-not $product) {
        $product=[pscustomobject]@{
          mtm=[string]$config.mtm; storage=''; display=[string]$config.mtm
          productId=[string]$config.productId; itemId=[string]$config.itemId; vendorItemId=[string]$config.vendorItemId
          category=[string]$config.category; skuid=[string]$config.skuid; srp=$config.srp; validation='identifiers-verified'
          offers=@([pscustomobject]@{
            role='mine'; channel=$text.Coupang; seller=$text.MyProduct; status=$text.MissingFailed
            displayPrice=$null; instantDiscount=$null; couponDiscount=$null; cardDiscount=$null
            cardBenefitStatus='unverified'; priceBasisType=$null
            finalPrice=$null; shipping=0; condition=$text.ManagedProduct; sourceType=$text.ManagedUrl
            checkedAt=''; confidence='C'; confidenceText=$text.FirstScan; url=[string]$config.url
          }); references=@()
        }
        $data.products+= $product
      }
      foreach ($field in @('mtm','productId','itemId','vendorItemId','category','skuid','srp')) {
        $product | Add-Member -NotePropertyName $field -NotePropertyValue $config.PSObject.Properties[$field].Value -Force
      }
      $mine=$product.offers | Where-Object {$_.role -eq 'mine'} | Select-Object -First 1
      if ($mine) { $mine.url=[string]$config.url }
      if ($config.danawaUrl) {
        $danawaRef=$product.references | Where-Object {$_.url -like 'https://prod.danawa.com/*'} | Select-Object -First 1
        if ($danawaRef) {
          $danawaRef.url=[string]$config.danawaUrl
        } else {
          $product.references += [pscustomobject]@{
            role='competitor'; channel='Price comparison'; seller='Danawa'; status='Waiting for scan'
            displayPrice=$null; finalPrice=$null; referencePrice=$null; condition='Exact MTM comparison'
            sourceType='Danawa product page'; checkedAt=''; confidence='C'; confidenceText='Waiting for first scan'
            url=[string]$config.danawaUrl
          }
        }
      }
    }
  }
  $confirmed=0
  foreach ($product in $data.products) {
    $result=$brandResults | Where-Object {$_.itemId -eq [string]$product.itemId} | Select-Object -First 1
    $mine=$product.offers | Where-Object {$_.role -eq 'mine'} | Select-Object -First 1
    if (-not $mine -or -not $result) { continue }
    $kst=[TimeZoneInfo]::ConvertTime([DateTimeOffset]$result.checkedAt,$kstZone).ToString('yyyy-MM-dd HH:mm')
    $mine | Add-Member -NotePropertyName availabilityCheckedAt -NotePropertyValue $kst -Force
    if ($result.ok -and [long]$result.price -ge 250000 -and [long]$result.price -le 7000000) {
      $preCardPrice=[long]$result.price + [long]($mine.shipping)
      $cardBenefitStatus=if ($result.cardBenefitStatus) {[string]$result.cardBenefitStatus}else{'partial'}
      $cardDiscount=if ($cardBenefitStatus -eq 'none') {0}elseif($cardBenefitStatus -eq 'captured' -and $null -ne $result.cardDiscount -and [long]$result.cardDiscount -gt 0 -and [long]$result.cardDiscount -le $preCardPrice) {[long]$result.cardDiscount}else{$null}
      # A missing card-detail result is not the same as a zero discount.
      # Publish a final purchase price only when the benefit was captured or
      # the page explicitly confirmed that no card benefit exists.
      $final=if ($null -ne $cardDiscount){$preCardPrice-$cardDiscount}else{$null}
      $srp=if ($null -ne $result.srp -and [long]$result.srp -gt 0) {[long]$result.srp}else{$null}
      $strike=if ($result.strikeReliable -eq $true -and $null -ne $result.strikePrice -and [long]$result.strikePrice -ge [long]$result.price) {[long]$result.strikePrice}else{$null}
      $mine.displayPrice=$srp
      $mine.finalPrice=$final
      $mine.instantDiscount=if ($null -ne $srp -and $null -ne $strike -and $srp -ge $strike){$srp-$strike}else{$null}
      $mine.couponDiscount=if ($null -ne $strike -and $strike -ge [long]$result.price){$strike-[long]$result.price}else{$null}
      $mine.cardDiscount=$cardDiscount
      $mine | Add-Member -NotePropertyName srp -NotePropertyValue $srp -Force
      $mine | Add-Member -NotePropertyName observedListPrice -NotePropertyValue $strike -Force
      $mine | Add-Member -NotePropertyName preCardPrice -NotePropertyValue $preCardPrice -Force
      $mine | Add-Member -NotePropertyName priceBasisType -NotePropertyValue ([string]$result.priceBasisType) -Force
      $mine | Add-Member -NotePropertyName cardBenefitStatus -NotePropertyValue $cardBenefitStatus -Force
      $mine | Add-Member -NotePropertyName cardRate -NotePropertyValue $result.cardRate -Force
      $mine | Add-Member -NotePropertyName cardMaxDiscount -NotePropertyValue $result.cardMaxDiscount -Force
      $mine | Add-Member -NotePropertyName cardProviders -NotePropertyValue @($result.cardProviders) -Force
      $mine | Add-Member -NotePropertyName cardBenefitText -NotePropertyValue ([string]$result.cardBenefitText) -Force
      $mine.checkedAt=$kst; $mine | Add-Member -NotePropertyName priceCheckedAt -NotePropertyValue $kst -Force
      $mine.status=$text.Current; $mine.confidence='A'
      $mine.confidenceText=$text.CurrentDetail
      $confirmed++
    } else {
      $mine.status=if($null -ne $mine.finalPrice){$text.RecentFailed}else{$text.MissingFailed}
    }
    if ($result.competitors -and @($result.competitors).Count -gt 0) {
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
  $data.meta.snapshotAt=$scanKst
  $data.meta.monitoring.lastAttemptAt=$scanKst
  if (@($brandResults | Where-Object {@($_.competitors).Count -gt 0}).Count -gt 0) {
    $data.meta.monitoring.competitionLastAttemptAt=$scanKst
  }
  $data.meta.monitoring.quickWatch=$text.Schedule
  $data.meta.monitoring.collectionRoute=$text.Route
  Write-Data $path $data
}
git -C $RepoPath add -- dist/market-data.js acer/market-data.js
if (Test-Path (Join-Path $RepoPath 'brand')) { git -C $RepoPath add -- brand }
git -C $RepoPath diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  git -C $RepoPath commit -m 'data: import Coupang prices from Chrome extension'
  git -C $RepoPath pull --rebase origin main
  git -C $RepoPath push origin main
}
