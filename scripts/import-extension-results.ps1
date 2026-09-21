param(
  [string]$RepoPath = (Split-Path -Parent $PSScriptRoot),
  [switch]$WaitForToday
)
$ErrorActionPreference = 'Stop'
$resultFolder = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads\MarketPulse'
$catalogPath = Join-Path $resultFolder 'product-catalog.json'
$kstZone = [TimeZoneInfo]::FindSystemTimeZoneById('Korea Standard Time')

# Keep the C:\MarketPulse checkout and brand-generation template current before
# importing a scan. This makes future shared-dashboard changes self-updating.
git -C $RepoPath pull --rebase origin main
if ($LASTEXITCODE -ne 0) { throw 'Dashboard update failed before result import.' }

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
function Get-SafeCardBenefitText([string]$value) {
  $compact=[regex]::Replace([string]$value,'https?://\S+',' ')
  $compact=[regex]::Replace($compact,'\s+',' ').Trim()
  $summary=[regex]::Match($compact,'^.*?카드\s*즉시할인\s*\([^)]*\)')
  if ($summary.Success) { return $summary.Value }
  if ($compact.Length -gt 240) { return $compact.Substring(0,240) }
  return $compact
}
function Get-CheckoutEvidenceAmount($evidence,[string]$pattern,[string]$excludePattern='') {
  foreach ($line in @($evidence)) {
    $text=[string]$line
    if ($excludePattern -and $text -match $excludePattern) { continue }
    $match=[regex]::Match($text,$pattern)
    if ($match.Success) { return [long]($match.Groups[1].Value -replace ',','') }
  }
  return $null
}
function Resolve-CheckoutDiscounts($result,$productPageDiscount) {
  $status=if ($result.checkoutDiscountStatus) {[string]$result.checkoutDiscountStatus}else{'missing'}
  $regular=if ($null -ne $result.checkoutCouponDiscount) {[long]$result.checkoutCouponDiscount}else{$null}
  $instant=if ($null -ne $result.wowInstantDiscount) {[long]$result.wowInstantDiscount}else{$null}
  $coupon=if ($null -ne $result.wowCouponDiscount) {[long]$result.wowCouponDiscount}else{$null}
  if ($status -eq 'summary' -and $result.checkoutDiscountEvidence) {
    $regular=Get-CheckoutEvidenceAmount $result.checkoutDiscountEvidence '쿠폰할인 변경\s*-?\s*([0-9][0-9,]*)\s*원' '와우.*쿠폰할인 변경'
    $instant=Get-CheckoutEvidenceAmount $result.checkoutDiscountEvidence '와우\s*(?:전용|회원)?\s*즉시할인\s*-?\s*([0-9][0-9,]*)\s*원'
    $coupon=Get-CheckoutEvidenceAmount $result.checkoutDiscountEvidence '와우\s*(?:전용|회원)?\s*쿠폰할인(?:\s*변경)?\s*-?\s*([0-9][0-9,]*)\s*원'
  }
  if ($null -ne $productPageDiscount) {
    if ($null -eq $regular -and $null -ne $instant -and $instant -le $productPageDiscount) { $regular=$productPageDiscount-$instant }
    if ($null -eq $instant -and $null -ne $regular -and $regular -le $productPageDiscount) { $instant=$productPageDiscount-$regular }
  }
  if ($null -eq $coupon -and $null -ne $regular -and $null -ne $instant) { $coupon=0 }
  if ($null -ne $regular -and $null -ne $instant -and $null -ne $coupon -and
      $regular -ge 0 -and $instant -ge 0 -and $coupon -ge 0 -and
      ($null -eq $productPageDiscount -or ($regular+$instant) -eq $productPageDiscount)) {
    $total=$regular+$instant+$coupon
    if ($null -ne $result.checkoutDiscountTotal -and [long]$result.checkoutDiscountTotal -ne $total -and $status -ne 'summary') {
      return [pscustomobject]@{Status='unverified';Reason='checkout-full-total-mismatch';Regular=$null;Instant=$null;Coupon=$null;Total=$null}
    }
    $reason=if($status -eq 'summary'){'evidence-layer-totals-matched'}else{[string]$result.checkoutDiscountReason}
    return [pscustomobject]@{Status='captured';Reason=$reason;Regular=$regular;Instant=$instant;Coupon=$coupon;Total=$total}
  }
  return [pscustomobject]@{Status=$status;Reason=[string]$result.checkoutDiscountReason;Regular=$null;Instant=$null;Coupon=$null;Total=$null}
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
  Schedule = '매일 08:00 KST'
  Route = Decode-Utf8 'V2luZG93cyBQQyDCtyDsnbzrsJggQ2hyb21lIO2Zleyepe2UhOuhnOq3uOueqA=='
  MarketplacePattern = Decode-Utf8 'MTHrsojqsIB87Jil7IWYfEfrp4jsvJN866Gv642wT0587L+g7YyhfFNTR3zrhKTsnbTrsoQ='
  AcerPattern = Decode-Utf8 'QWNlcnzsl5DsnbTshJw='
  ScanSummary = Decode-Utf8 '7J2867CYIENocm9tZSDsobDsgqwgwrcg7ZiE7J6s6rCAIO2ZleyduA=='
  Coupang = Decode-Utf8 '7L+g7Yyh'
  MyProduct = Decode-Utf8 '64K0IOy/oO2MoSDsg4Htkog='
  SoldOut = Decode-Utf8 '7ZKI7KCI'
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
  $html=$html -replace 'href="(?:\.\.\/dist\/|\.\/)styles\.css([^\"]*)"','href="../../dist/styles.css$1"'
  $html=$html -replace 'src="\.\.\/dist\/xlsx-export\.js([^\"]*)"','src="../../dist/xlsx-export.js$1"'
  $html=$html -replace 'src="(?:\.\.\/dist\/|\.\/)app\.js([^\"]*)"','src="../../dist/app.js$1"'
  [IO.File]::WriteAllText($indexPath,$html,(New-Object Text.UTF8Encoding($false)))
  if (-not (Test-Path $dataPath)) {
    $empty=[pscustomobject]@{
      meta=[pscustomobject]@{
        brand=$brand; snapshotAt=$scanKst; sourceFile='product-catalog.json'
        comparisonBasis='Exact model and item price comparison'
        exclusions='Personal rewards and unverified benefits are excluded'
        monitoring=[pscustomobject]@{
          enabled=$true; quickWatch='Daily 08:00 KST'; fullResearch='Basic and precision scan'
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
$historyRows=@()
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
          category=[string]$config.category; srp=$config.srp; validation='identifiers-verified'
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
      foreach ($field in @('mtm','productId','itemId','vendorItemId','category','srp')) {
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
      $previousFinalPrice=if($mine.alertEligible -eq $true -and $null -ne $mine.finalPrice){[long]$mine.finalPrice}else{$null}
      $previousPriceCheckedAt=if($null -ne $previousFinalPrice){[string]$mine.priceCheckedAt}else{''}
      $productPagePrice=[long]$result.price
      $srp=if ($null -ne $result.srp -and [long]$result.srp -gt 0) {
        [long]$result.srp
      } elseif ($null -ne $product.srp -and [long]$product.srp -gt 0) {
        [long]$product.srp
      } else {
        $null
      }
      $strike=if ($result.strikeReliable -eq $true -and $null -ne $result.strikePrice -and [long]$result.strikePrice -ge $productPagePrice) {[long]$result.strikePrice}else{$null}
      $productPageDiscount=if ($null -ne $strike){$strike-$productPagePrice}else{$null}
      $checkout=Resolve-CheckoutDiscounts $result $productPageDiscount
      $checkoutStatus=[string]$checkout.Status
      $checkoutCoupon=$checkout.Regular
      $wowInstant=$checkout.Instant
      $wowCoupon=$checkout.Coupon
      $preCardItemPrice=if ($checkoutStatus -eq 'captured' -and $null -ne $wowCoupon -and $wowCoupon -le $productPagePrice) {$productPagePrice-$wowCoupon}else{$productPagePrice}
      $preCardPrice=$preCardItemPrice + [long]($mine.shipping)
      $cardBenefitStatus=if ($result.cardBenefitStatus) {[string]$result.cardBenefitStatus}else{'partial'}
      $cardDiscount=if ($cardBenefitStatus -eq 'none') {
        0
      } elseif ($cardBenefitStatus -eq 'captured' -and $null -ne $result.cardRate -and [decimal]$result.cardRate -gt 0) {
        $calculated=[long][math]::Floor($preCardItemPrice*[decimal]$result.cardRate/100)
        if ($null -ne $result.cardMaxDiscount -and [long]$result.cardMaxDiscount -gt 0) {[long][math]::Min($calculated,[long]$result.cardMaxDiscount)}else{$calculated}
      } else {
        $null
      }
      # A missing card-detail result is not the same as a zero discount.
      # Publish a final purchase price only when the benefit was captured or
      # the page explicitly confirmed that no card benefit exists.
      $final=if ($null -ne $cardDiscount){$preCardPrice-$cardDiscount}else{$null}
      $couponTotal=if ($null -ne $strike -and $strike -ge $preCardItemPrice){$strike-$preCardItemPrice}else{$null}
      $mine.displayPrice=$srp
      $mine.finalPrice=$final
      $mine.instantDiscount=if ($null -ne $srp -and $null -ne $strike -and $srp -ge $strike){$srp-$strike}else{$null}
      $mine.couponDiscount=$couponTotal
      $mine.cardDiscount=$cardDiscount
      $mine | Add-Member -NotePropertyName srp -NotePropertyValue $srp -Force
      $mine | Add-Member -NotePropertyName observedListPrice -NotePropertyValue $strike -Force
      $mine | Add-Member -NotePropertyName preCardPrice -NotePropertyValue $preCardPrice -Force
      $mine | Add-Member -NotePropertyName priceBasisType -NotePropertyValue ([string]$result.priceBasisType) -Force
      $mine | Add-Member -NotePropertyName cardBenefitStatus -NotePropertyValue $cardBenefitStatus -Force
      $mine | Add-Member -NotePropertyName cardRate -NotePropertyValue $result.cardRate -Force
      $mine | Add-Member -NotePropertyName cardMaxDiscount -NotePropertyValue $result.cardMaxDiscount -Force
      $mine | Add-Member -NotePropertyName cardProviders -NotePropertyValue @($result.cardProviders) -Force
      $mine | Add-Member -NotePropertyName cardBenefitText -NotePropertyValue (Get-SafeCardBenefitText ([string]$result.cardBenefitText)) -Force
      $mine | Add-Member -NotePropertyName checkoutDiscountStatus -NotePropertyValue $checkoutStatus -Force
      $mine | Add-Member -NotePropertyName checkoutDiscountReason -NotePropertyValue ([string]$checkout.Reason) -Force
      $mine | Add-Member -NotePropertyName checkoutCouponDiscount -NotePropertyValue $checkoutCoupon -Force
      $mine | Add-Member -NotePropertyName wowInstantDiscount -NotePropertyValue $wowInstant -Force
      $mine | Add-Member -NotePropertyName wowCouponDiscount -NotePropertyValue $wowCoupon -Force
      $mine | Add-Member -NotePropertyName checkoutDiscountCheckedAt -NotePropertyValue ([string]$result.checkoutDiscountCapturedAt) -Force
      $soldOut=([string]$result.checkoutDiscountReason -eq 'buy-now-button-not-found')
      $mine | Add-Member -NotePropertyName alertEligible -NotePropertyValue (-not $soldOut) -Force
      $priceChange=if(-not $soldOut -and $null -ne $final -and $null -ne $previousFinalPrice){[long]$final-[long]$previousFinalPrice}else{$null}
      $priceTrend=if($null -eq $priceChange){'unavailable'}elseif($priceChange -lt 0){'down'}elseif($priceChange -gt 0){'up'}else{'same'}
      $mine | Add-Member -NotePropertyName priceChange -NotePropertyValue $priceChange -Force
      $mine | Add-Member -NotePropertyName priceTrend -NotePropertyValue $priceTrend -Force
      $mine | Add-Member -NotePropertyName priceComparisonAt -NotePropertyValue $previousPriceCheckedAt -Force
      $mine.checkedAt=$kst; $mine | Add-Member -NotePropertyName priceCheckedAt -NotePropertyValue $kst -Force
      $mine.status=if($soldOut){$text.SoldOut}else{$text.Current}; $mine.confidence='A'
      $mine.confidenceText=$text.CurrentDetail
      $confirmed++
    } else {
      $mine | Add-Member -NotePropertyName alertEligible -NotePropertyValue $false -Force
      $mine | Add-Member -NotePropertyName priceChange -NotePropertyValue $null -Force
      $mine | Add-Member -NotePropertyName priceTrend -NotePropertyValue 'unavailable' -Force
      $mine | Add-Member -NotePropertyName priceComparisonAt -NotePropertyValue '' -Force
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
    $historySrp=if($null -ne $mine.srp){$mine.srp}elseif($null -ne $product.srp){$product.srp}else{$null}
    $historyBasis=$mine.observedListPrice
    $historyPreCard=$mine.preCardPrice
    $historyMatch=if($null -ne $historyBasis -and $null -ne $historySrp){[long]$historyBasis-[long]$historySrp}else{$null}
    $historyCouponTotal=if($null -ne $historyBasis -and $null -ne $historyPreCard -and [long]$historyBasis -ge [long]$historyPreCard){[long]$historyBasis-[long]$historyPreCard}else{$null}
    $historyRows += [pscustomobject][ordered]@{
      '수집일'=$scanKst.Substring(0,10)
      '수집시각'=$scanKst
      '브랜드'=$spec.Brand
      'MTM'=[string]$product.mtm
      '상태'=[string]$mine.status
      '수집결과'=if($result.ok){'success'}else{'failed'}
      'SRP'=$historySrp
      '표시가'=$historyBasis
      '표시가 종류'=[string]$mine.priceBasisType
      '매칭차액'=$historyMatch
      '일반 쿠폰할인'=$mine.checkoutCouponDiscount
      '와우 전용 즉시할인'=$mine.wowInstantDiscount
      '와우 전용 쿠폰할인'=$mine.wowCouponDiscount
      '쿠폰할인 총금액'=$historyCouponTotal
      '카드할인 전 가격'=$historyPreCard
      '카드할인 상태'=[string]$mine.cardBenefitStatus
      '카드할인'=$mine.cardDiscount
      '적용 카드사'=(@($mine.cardProviders) -join ', ')
      '카드 할인율(%)'=$mine.cardRate
      '최대 할인한도'=$mine.cardMaxDiscount
      '최종 실구매가'=$mine.finalPrice
      '가격 확인 시각'=[string]$mine.priceCheckedAt
      '상품 URL'=[string]$mine.url
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
$historyPath=Join-Path $RepoPath 'reports\my-coupang-price-history.csv'
if ($historyRows.Count -gt 0) {
  New-Item -ItemType Directory -Path (Split-Path -Parent $historyPath) -Force | Out-Null
  $combined=@()
  if (Test-Path $historyPath) { $combined+=@(Import-Csv -Path $historyPath -Encoding UTF8) }
  $keys=New-Object 'System.Collections.Generic.HashSet[string]'
  foreach ($row in $combined) { [void]$keys.Add("$($row.'수집시각')|$($row.'브랜드')|$($row.MTM)") }
  foreach ($row in $historyRows) {
    $key="$($row.'수집시각')|$($row.'브랜드')|$($row.MTM)"
    if ($keys.Add($key)) { $combined+=$row }
  }
  $combined | Sort-Object '수집시각','브랜드','MTM' | Export-Csv -Path $historyPath -NoTypeInformation -Encoding UTF8
  Write-Host "Price history saved: $historyPath ($($combined.Count) rows)"
}
git -C $RepoPath add -- dist/market-data.js acer/market-data.js
if (Test-Path (Join-Path $RepoPath 'brand')) { git -C $RepoPath add -- brand }
git -C $RepoPath diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  git -C $RepoPath commit -m 'data: import Coupang prices from Chrome extension'
  if ($LASTEXITCODE -ne 0) { throw 'Dashboard data commit failed.' }
  git -C $RepoPath pull --rebase origin main
  if ($LASTEXITCODE -ne 0) { throw 'Dashboard update failed before upload.' }
  git -C $RepoPath push origin main
  if ($LASTEXITCODE -ne 0) { throw 'Dashboard upload to GitHub failed.' }
}
