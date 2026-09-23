param(
  [string]$RepoPath = (Split-Path -Parent $PSScriptRoot),
  [switch]$WaitForToday,
  [string]$ExpectedSlotStart = '',
  [int]$MaxScanAgeHours = 24
)
$ErrorActionPreference = 'Stop'
$resultFolder = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads\MarketPulse'
$catalogPath = Join-Path $resultFolder 'product-catalog.json'
$kstZone = [TimeZoneInfo]::FindSystemTimeZoneById('Korea Standard Time')
$minimumStart=if ($ExpectedSlotStart) { [DateTimeOffset]::Parse($ExpectedSlotStart) } else { $null }

# Windows PowerShell 5.1 can surface Git's normal stderr progress (for example,
# "From https://github.com/...") as an ErrorRecord. Judge Git by its exit code.
function Invoke-Git {
  param([string[]]$Arguments, [int[]]$AcceptedExitCodes = @(0))
  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    & git -C $RepoPath @Arguments
    $gitExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousPreference
  }
  if ($gitExitCode -notin $AcceptedExitCodes) {
    throw "Git $($Arguments -join ' ') failed (exit $gitExitCode)."
  }
  return $gitExitCode
}

# Keep the C:\MarketPulse checkout and brand-generation template current before
# importing a scan. This makes future shared-dashboard changes self-updating.
Invoke-Git -Arguments @('pull','--rebase','origin','main') | Out-Null

function Get-LatestResultPath {
  return Get-ChildItem -Path $resultFolder -Filter 'latest-coupang-scan*.json' -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1 -ExpandProperty FullName
}

$deadline = [DateTime]::UtcNow.AddMinutes(45)
do {
  $resultPath = Get-LatestResultPath
  $payload = if ($resultPath) { Get-Content -Raw -Encoding UTF8 $resultPath | ConvertFrom-Json } else { $null }
  if ($payload) {
    try { $scanAt = [DateTimeOffset]$payload.scannedAt } catch { $scanAt = $null }
    if ($scanAt) {
      $age = [DateTimeOffset]::UtcNow - $scanAt.ToUniversalTime()
      if ($age.TotalMinutes -lt -10) { throw 'The scan timestamp is in the future. Check the Windows clock and time zone.' }
      $resultDay = [TimeZoneInfo]::ConvertTime($scanAt,$kstZone).ToString('yyyy-MM-dd')
      $todayKst = [TimeZoneInfo]::ConvertTime([DateTimeOffset]::UtcNow,$kstZone).ToString('yyyy-MM-dd')
      $fresh = $age.TotalHours -le $MaxScanAgeHours
      $slotMatches=$true
      if ($minimumStart) {
        try { $slotMatches=([DateTimeOffset]$payload.startedAt) -ge $minimumStart } catch { $slotMatches=$false }
      }
      if ($fresh -and $slotMatches -and (-not $WaitForToday -or $resultDay -eq $todayKst)) { break }
    }
  }
  if (-not $WaitForToday) { throw 'No fresh Market Pulse scan result was found.' }
  if ([DateTime]::UtcNow -ge $deadline) { throw 'Timed out waiting for a fresh Market Pulse scan result.' }
  Start-Sleep -Seconds 30
} while ($true)

# Payload v5 and scanner 1.9.3 are required for evidence-aware checkout capture of all three
# discount layers, checkout zero handling, and sold-out product-page fallback.
if ([int]$payload.version -ne 5) {
  throw 'This scan was created by an incompatible extension. Reload Market Pulse scanner 1.9.3 and scan again.'
}
try { $extensionVersion=[version]([string]$payload.extensionVersion) } catch {
  throw 'The scan does not contain a valid extensionVersion.'
}
if ($extensionVersion -lt [version]'1.9.3') {
  throw 'This scan was created by an older extension. Reload Market Pulse scanner 1.9.3 and scan again.'
}

try {
  $startedAt=[DateTimeOffset]$payload.startedAt
  $completedAt=[DateTimeOffset]$payload.completedAt
  $scannedAt=[DateTimeOffset]$payload.scannedAt
} catch {
  throw 'The scan does not contain valid startedAt, completedAt, and scannedAt timestamps.'
}
if ($completedAt -lt $startedAt) { throw 'The scan completedAt timestamp is earlier than startedAt.' }
if (($completedAt-$startedAt).TotalHours -gt 3) { throw 'The scan duration exceeds the three-hour safety limit.' }
if ([math]::Abs(($scannedAt-$completedAt).TotalMinutes) -gt 10) {
  throw 'The scan completedAt and scannedAt timestamps do not describe the same scan.'
}

$payloadResults=@($payload.results)
if ($payloadResults.Count -eq 0) { throw 'The scan contains no product results.' }
$duplicateItemIds=@($payloadResults | Group-Object {[string]$_.itemId} | Where-Object {$_.Name -and $_.Count -gt 1})
if ($duplicateItemIds.Count -gt 0) { throw "Duplicate itemId values were found in the scan: $(@($duplicateItemIds.Name) -join ', ')" }
$duplicateVendorItemIds=@($payloadResults | Group-Object {[string]$_.vendorItemId} | Where-Object {$_.Name -and $_.Count -gt 1})
if ($duplicateVendorItemIds.Count -gt 0) { throw "Duplicate vendorItemId values were found in the scan: $(@($duplicateVendorItemIds.Name) -join ', ')" }
$duplicateBrandMtms=@($payloadResults | Group-Object {("$([string]$_.brand)|$([string]$_.mtm)").ToLowerInvariant()} | Where-Object {$_.Name -and $_.Count -gt 1})
if ($duplicateBrandMtms.Count -gt 0) { throw "Duplicate brand and MTM pairs were found in the scan: $(@($duplicateBrandMtms.Name) -join ', ')" }
foreach ($result in $payloadResults) {
  if (-not $result.productId -or -not $result.itemId -or -not $result.vendorItemId -or -not $result.brand -or -not $result.mtm) {
    throw 'Every scan result must contain brand, MTM, productId, itemId, and vendorItemId.'
  }
  try { $resultCheckedAt=[DateTimeOffset]$result.checkedAt } catch {
    throw "The scan result for $($result.mtm) has an invalid checkedAt timestamp."
  }
  if ($resultCheckedAt -lt $startedAt.AddMinutes(-5) -or $resultCheckedAt -gt $completedAt.AddMinutes(10)) {
    throw "The scan result for $($result.mtm) falls outside the scan time window."
  }
  if ($result.checkoutDiscountCapturedAt) {
    try { $checkoutCapturedAt=[DateTimeOffset]$result.checkoutDiscountCapturedAt } catch {
      throw "The scan result for $($result.mtm) has an invalid checkout capture timestamp."
    }
    if ($checkoutCapturedAt -lt $startedAt.AddMinutes(-5) -or $checkoutCapturedAt -gt $completedAt.AddMinutes(10)) {
      throw "The checkout result for $($result.mtm) falls outside the scan time window."
    }
  }
}
if ($null -eq $payload.targetCount -or $null -eq $payload.resultCount -or $payload.complete -ne $true) {
  throw 'Incomplete scan: targetCount, resultCount, and complete=true are required.'
}
if ([int]$payload.targetCount -ne $payloadResults.Count) {
  throw "Incomplete scan: expected $($payload.targetCount) products but found $($payloadResults.Count)."
}
if ([int]$payload.resultCount -ne $payloadResults.Count) {
  throw "Inconsistent scan: resultCount is $($payload.resultCount) but the file contains $($payloadResults.Count) results."
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
function Get-SafeCheckoutEvidence($values) {
  $safe=@()
  foreach ($value in @($values)) {
    $compact=[regex]::Replace([string]$value,'\s+',' ').Trim()
    if (-not $compact) { continue }
    if ($compact -notmatch '(일반\s*쿠폰할인|상품\s*쿠폰\s*할인|쿠폰\s*할인|와우.*(?:즉시|쿠폰)\s*할인|와우.*총\s*추가\s*혜택)') { continue }
    if ($compact -match '(결제수단|카드번호|배송지|수령인|전화번호|개인정보|쿠페이|쿠팡캐시|https?://)') { continue }
    if ($compact.Length -gt 180) { $compact=$compact.Substring(0,180) }
    if ($safe -notcontains $compact) { $safe+=$compact }
    if ($safe.Count -ge 12) { break }
  }
  return @($safe)
}
function Resolve-CheckoutDiscounts($result,$productPageDiscount) {
  $status=if ($result.checkoutDiscountStatus) {[string]$result.checkoutDiscountStatus}else{'missing'}
  $reason=[string]$result.checkoutDiscountReason
  $soldOut=$reason -in @('buy-now-button-not-found','buy-now-button-sold-out')
  if ($soldOut) {
    if ([string]$result.checkoutCouponSource -ne 'product-page-soldout') {
      return [pscustomobject]@{Status='unverified';Reason='soldout-coupon-source-invalid';Regular=$null;Instant=$null;Coupon=$null;Total=$null}
    }
    $regular=if ($null -ne $productPageDiscount) {[long]$productPageDiscount}else{$null}
    if ($null -ne $result.checkoutCouponDiscount -and $null -ne $regular -and [long]$result.checkoutCouponDiscount -ne $regular) {
      return [pscustomobject]@{Status='unverified';Reason='soldout-product-page-coupon-mismatch';Regular=$null;Instant=$null;Coupon=$null;Total=$null}
    }
    return [pscustomobject]@{Status='soldout';Reason=$reason;Regular=$regular;Instant=$null;Coupon=$null;Total=$regular}
  }
  if ($status -ne 'captured') {
    $partialRegular=if ($null -ne $result.checkoutCouponDiscount) {[long]$result.checkoutCouponDiscount}else{$null}
    $partialInstant=if ($null -ne $result.wowInstantDiscount) {[long]$result.wowInstantDiscount}else{$null}
    $partialCoupon=if ($null -ne $result.wowCouponDiscount) {[long]$result.wowCouponDiscount}else{$null}
    return [pscustomobject]@{Status=$status;Reason=$reason;Regular=$partialRegular;Instant=$partialInstant;Coupon=$partialCoupon;Total=$null}
  }
  if ([string]$result.checkoutCouponSource -ne 'checkout') {
    return [pscustomobject]@{Status='unverified';Reason='checkout-coupon-source-invalid';Regular=$null;Instant=$null;Coupon=$null;Total=$null}
  }
  $regular=if ($null -ne $result.checkoutCouponDiscount) {[long]$result.checkoutCouponDiscount}else{$null}
  $instant=if ($null -ne $result.wowInstantDiscount) {[long]$result.wowInstantDiscount}else{$null}
  $coupon=if ($null -ne $result.wowCouponDiscount) {[long]$result.wowCouponDiscount}else{$null}
  if ($null -ne $regular -and $null -ne $instant -and $null -ne $coupon -and
      $regular -ge 0 -and $instant -ge 0 -and $coupon -ge 0) {
    $total=$regular+$instant+$coupon
    if ($null -ne $result.checkoutDiscountTotal -and [long]$result.checkoutDiscountTotal -ne $total) {
      return [pscustomobject]@{Status='unverified';Reason='checkout-full-total-mismatch';Regular=$regular;Instant=$null;Coupon=$null;Total=$regular}
    }
    return [pscustomobject]@{Status='captured';Reason=$reason;Regular=$regular;Instant=$instant;Coupon=$coupon;Total=$total}
  }
  return [pscustomobject]@{Status='unverified';Reason='checkout-three-fields-invalid';Regular=$null;Instant=$null;Coupon=$null;Total=$null}
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
  Schedule = '매일 08:00 · 14:00 KST'
  Route = Decode-Utf8 'V2luZG93cyBQQyDCtyDsnbzrsJggQ2hyb21lIO2Zleyepe2UhOuhnOq3uOueqA=='
  MarketplacePattern = Decode-Utf8 'MTHrsojqsIB87Jil7IWYfEfrp4jsvJN866Gv642wT0587L+g7YyhfFNTR3zrhKTsnbTrsoQ='
  AcerPattern = Decode-Utf8 'QWNlcnzsl5DsnbTshJw='
  ScanSummary = Decode-Utf8 '7J2867CYIENocm9tZSDsobDsgqwgwrcg7ZiE7J6s6rCAIO2ZleyduA=='
  Coupang = Decode-Utf8 '7L+g7Yyh'
  MyProduct = Decode-Utf8 '64K0IOy/oO2MoSDsg4Htkog='
  SoldOut = Decode-Utf8 '7ZKI7KCI'
  Partial = Decode-Utf8 '6rCA6rKpwrftlaDsnbgg7J2867aAIO2ZleyduA=='
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
  $html=[IO.File]::ReadAllText((Join-Path $RepoPath 'brand\acer\index.html'),[Text.Encoding]::UTF8)
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
          enabled=$true; quickWatch='Daily 08:00 and 14:00 KST'; fullResearch='Basic and precision scan'
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

Invoke-Git -Arguments @('pull','--rebase','origin','main') | Out-Null
$historyRows=@()
$specs=@(
  @{Brand='Lenovo';Path='brand\lenovo\market-data.js'},
  @{Brand='Acer';Path='brand\acer\market-data.js'}
)
if ($catalog) {
  $slugOwners=@{}
  foreach ($brand in @($catalog.products | Where-Object {$_.brand} | ForEach-Object {[string]$_.brand.Trim()} | Sort-Object -Unique)) {
    $slug=Get-BrandSlug $brand
    if ($slugOwners.ContainsKey($slug) -and $slugOwners[$slug] -ne $brand) {
      throw "Brand names '$($slugOwners[$slug])' and '$brand' produce the same dashboard slug '$slug'."
    }
    $slugOwners[$slug]=$brand
  }
  $extraBrands=@($catalog.products | Where-Object {$_.brand -and $_.brand -notin @('Lenovo','Acer')} | ForEach-Object {[string]$_.brand.Trim()} | Sort-Object -Unique)
  foreach ($brand in $extraBrands) {
    $slug=Get-BrandSlug $brand
    $relativePath="brand\$slug\market-data.js"
    $fullPath=Join-Path $RepoPath $relativePath
    New-BrandDashboard $brand $fullPath
    $specs+=@{Brand=$brand;Path=$relativePath}
  }
}
# A retry after a commit/push failure must push the existing import, not recalculate
# the same scan against its own last verified price (which would erase its trend).
$alreadyImported=$specs.Count -gt 0
foreach ($spec in $specs) {
  $existingPath=Join-Path $RepoPath $spec.Path
  if (-not (Test-Path $existingPath)) { $alreadyImported=$false; break }
  $existingData=Read-Data $existingPath
  if ([string]$existingData.meta.snapshotAt -ne $scanKst) { $alreadyImported=$false; break }
}
if ($alreadyImported) {
  Write-Host "This scan was already imported at $scanKst; retrying the pending push."
  Invoke-Git -Arguments @('push','origin','main') | Out-Null
  return
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
  $verified=0
  $soldOutCount=0
  $partialCount=0
  foreach ($product in $data.products) {
    $result=$brandResults | Where-Object {
      $_.productId -and $_.itemId -and $_.vendorItemId -and
      [string]$_.productId -eq [string]$product.productId -and
      [string]$_.itemId -eq [string]$product.itemId -and
      [string]$_.vendorItemId -eq [string]$product.vendorItemId
    } | Select-Object -First 1
    $mine=$product.offers | Where-Object {$_.role -eq 'mine'} | Select-Object -First 1
    if (-not $mine) { continue }
    $alertEligible=$false
    $currentVerifiedFinal=$null
    $checkoutStatus='missing'
    $soldOut=$false
    $previousFinalPrice=if($null -ne $mine.lastVerifiedFinalPrice){[long]$mine.lastVerifiedFinalPrice}elseif($mine.alertEligible -eq $true -and $null -ne $mine.finalPrice){[long]$mine.finalPrice}else{$null}
    $previousPriceCheckedAt=if($mine.lastVerifiedPriceCheckedAt){[string]$mine.lastVerifiedPriceCheckedAt}elseif($null -ne $previousFinalPrice){[string]$mine.priceCheckedAt}else{''}
    if ($null -ne $previousFinalPrice) {
      $mine | Add-Member -NotePropertyName lastVerifiedFinalPrice -NotePropertyValue $previousFinalPrice -Force
      $mine | Add-Member -NotePropertyName lastVerifiedPriceCheckedAt -NotePropertyValue $previousPriceCheckedAt -Force
    }
    if (-not $result) {
      $mine | Add-Member -NotePropertyName alertEligible -NotePropertyValue $false -Force
      $mine | Add-Member -NotePropertyName priceChange -NotePropertyValue $null -Force
      $mine | Add-Member -NotePropertyName priceTrend -NotePropertyValue 'unavailable' -Force
      $mine.status=if($null -ne $mine.finalPrice){$text.RecentFailed}else{$text.MissingFailed}
      $partialCount++
      continue
    }
    $kst=[TimeZoneInfo]::ConvertTime([DateTimeOffset]$result.checkedAt,$kstZone).ToString('yyyy-MM-dd HH:mm')
    $mine | Add-Member -NotePropertyName availabilityCheckedAt -NotePropertyValue $kst -Force
    if ($result.ok -and [long]$result.price -ge 250000 -and [long]$result.price -le 7000000) {
      $productPagePrice=[long]$result.price
      # The managed catalog/dashboard value is authoritative. A scan result can
      # be older than a catalog edit, so it must not overwrite the current SRP.
      $srp=if ($null -ne $product.srp -and [long]$product.srp -gt 0) {
        [long]$product.srp
      } elseif ($null -ne $result.srp -and [long]$result.srp -gt 0) {
        [long]$result.srp
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
      $preCardItemPrice=if ($checkoutStatus -eq 'captured' -and $null -ne $strike -and
          $null -ne $checkoutCoupon -and $null -ne $wowInstant -and $null -ne $wowCoupon) {
        [long]$strike-[long]$checkoutCoupon-[long]$wowInstant-[long]$wowCoupon
      } else {$null}
      if ($null -ne $preCardItemPrice -and ($preCardItemPrice -lt 0 -or $preCardItemPrice -gt $strike)) {
        $checkoutStatus='unverified'
        $checkout.Reason='pre-card-price-out-of-range'
        $preCardItemPrice=$null
      }
      if ($null -ne $preCardItemPrice -and $preCardItemPrice -ne $productPagePrice) {
        $checkoutStatus='unverified'
        $checkout.Reason='pre-card-price-does-not-match-product-page'
        $preCardItemPrice=$null
      }
      $preCardPrice=if($null -ne $preCardItemPrice){$preCardItemPrice+[long]($mine.shipping)}else{$null}
      $cardBenefitStatus=if ($result.cardBenefitStatus) {[string]$result.cardBenefitStatus}else{'partial'}
      if ($cardBenefitStatus -notin @('none','captured','partial','unverified')) { $cardBenefitStatus='unverified' }
      $cardProviders=@($result.cardProviders | Where-Object { $_ })
      $cardRateValid=$null -ne $result.cardRate -and [decimal]$result.cardRate -gt 0 -and [decimal]$result.cardRate -le 100
      $cardCapturedValid=$cardBenefitStatus -eq 'captured' -and $cardRateValid -and $cardProviders.Count -gt 0
      if ($cardBenefitStatus -eq 'captured' -and -not $cardCapturedValid) { $cardBenefitStatus='unverified' }
      $cardDiscount=if ($null -eq $preCardItemPrice) {
        $null
      } elseif ($cardBenefitStatus -eq 'none') {
        if ($null -ne $result.cardDiscount -and [long]$result.cardDiscount -ne 0) {
          $cardBenefitStatus='unverified'
          $null
        } else { 0 }
      } elseif ($cardCapturedValid) {
        $calculated=[long][math]::Floor($preCardItemPrice*[decimal]$result.cardRate/100)
        $verifiedCardDiscount=if ($null -ne $result.cardMaxDiscount -and [long]$result.cardMaxDiscount -gt 0) {[long][math]::Min($calculated,[long]$result.cardMaxDiscount)}else{$calculated}
        if ($null -eq $result.cardDiscount -or [long]$result.cardDiscount -ne $verifiedCardDiscount) {
          $cardBenefitStatus='unverified'
          $null
        } else { $verifiedCardDiscount }
      } else {
        $null
      }
      $soldOut=([string]$result.checkoutDiscountReason -in @('buy-now-button-not-found','buy-now-button-sold-out'))
      # A missing checkout layer or card detail is not a verified current final price.
      $alertEligible=(-not $soldOut) -and $checkoutStatus -eq 'captured' -and $null -ne $cardDiscount
      $currentVerifiedFinal=if ($alertEligible){$preCardPrice-$cardDiscount}else{$null}
      $final=if ($alertEligible){$currentVerifiedFinal}else{$previousFinalPrice}
      $couponTotal=if ($checkoutStatus -eq 'captured') {$checkout.Total} elseif($soldOut) {$checkoutCoupon} else {$null}
      $mine.displayPrice=$srp
      $mine.finalPrice=$final
      $mine.instantDiscount=if ($null -ne $srp -and $null -ne $strike -and $srp -ge $strike){$srp-$strike}else{$null}
      $mine.couponDiscount=$couponTotal
      $mine.cardDiscount=$cardDiscount
      $mine | Add-Member -NotePropertyName srp -NotePropertyValue $srp -Force
      $mine | Add-Member -NotePropertyName observedListPrice -NotePropertyValue $strike -Force
      $mine | Add-Member -NotePropertyName productPagePrice -NotePropertyValue $productPagePrice -Force
      $mine | Add-Member -NotePropertyName preCardPrice -NotePropertyValue $preCardPrice -Force
      $mine | Add-Member -NotePropertyName priceBasisType -NotePropertyValue ([string]$result.priceBasisType) -Force
      $mine | Add-Member -NotePropertyName cardBenefitStatus -NotePropertyValue $cardBenefitStatus -Force
      $mine | Add-Member -NotePropertyName cardRate -NotePropertyValue $result.cardRate -Force
      $mine | Add-Member -NotePropertyName cardMaxDiscount -NotePropertyValue $result.cardMaxDiscount -Force
      $mine | Add-Member -NotePropertyName cardProviders -NotePropertyValue $cardProviders -Force
      $mine | Add-Member -NotePropertyName cardBenefitText -NotePropertyValue (Get-SafeCardBenefitText ([string]$result.cardBenefitText)) -Force
      $mine | Add-Member -NotePropertyName checkoutDiscountStatus -NotePropertyValue $checkoutStatus -Force
      $mine | Add-Member -NotePropertyName checkoutDiscountReason -NotePropertyValue ([string]$checkout.Reason) -Force
      $mine | Add-Member -NotePropertyName checkoutCouponDiscount -NotePropertyValue $checkoutCoupon -Force
      $mine | Add-Member -NotePropertyName checkoutCouponSource -NotePropertyValue ([string]$result.checkoutCouponSource) -Force
      $mine | Add-Member -NotePropertyName wowInstantDiscount -NotePropertyValue $wowInstant -Force
      $mine | Add-Member -NotePropertyName wowCouponDiscount -NotePropertyValue $wowCoupon -Force
      $mine | Add-Member -NotePropertyName checkoutDiscountCheckedAt -NotePropertyValue ([string]$result.checkoutDiscountCapturedAt) -Force
      $mine | Add-Member -NotePropertyName checkoutUnparsedFields -NotePropertyValue @($result.checkoutUnparsedFields | Where-Object { $_ }) -Force
      $mine | Add-Member -NotePropertyName checkoutDiscountFieldStatus -NotePropertyValue $result.checkoutDiscountFieldStatus -Force
      $mine | Add-Member -NotePropertyName checkoutDiscountEvidence -NotePropertyValue @(Get-SafeCheckoutEvidence $result.checkoutDiscountEvidence) -Force
      $mine | Add-Member -NotePropertyName alertEligible -NotePropertyValue $alertEligible -Force
      $priceChange=if($alertEligible -and $null -ne $previousFinalPrice){[long]$currentVerifiedFinal-[long]$previousFinalPrice}else{$null}
      $priceTrend=if($null -eq $priceChange){'unavailable'}elseif($priceChange -lt 0){'down'}elseif($priceChange -gt 0){'up'}else{'same'}
      $mine | Add-Member -NotePropertyName priceChange -NotePropertyValue $priceChange -Force
      $mine | Add-Member -NotePropertyName priceTrend -NotePropertyValue $priceTrend -Force
      $mine | Add-Member -NotePropertyName priceComparisonAt -NotePropertyValue $previousPriceCheckedAt -Force
      if ($alertEligible) {
        $mine | Add-Member -NotePropertyName lastVerifiedFinalPrice -NotePropertyValue $currentVerifiedFinal -Force
        $mine | Add-Member -NotePropertyName lastVerifiedPriceCheckedAt -NotePropertyValue $kst -Force
      }
      $mine.checkedAt=$kst; $mine | Add-Member -NotePropertyName priceCheckedAt -NotePropertyValue $kst -Force
      $mine.status=if($soldOut){$text.SoldOut}elseif($alertEligible){$text.Current}else{$text.Partial}
      $mine.confidence=if($alertEligible -or $soldOut){'A'}else{'B'}
      $mine.confidenceText=if($alertEligible -or $soldOut){$text.CurrentDetail}else{$text.Partial}
      if ($alertEligible) {$verified++} elseif ($soldOut) {$soldOutCount++} else {$partialCount++}
    } else {
      $mine | Add-Member -NotePropertyName alertEligible -NotePropertyValue $false -Force
      $mine | Add-Member -NotePropertyName priceChange -NotePropertyValue $null -Force
      $mine | Add-Member -NotePropertyName priceTrend -NotePropertyValue 'unavailable' -Force
      $mine | Add-Member -NotePropertyName priceComparisonAt -NotePropertyValue '' -Force
      $mine.status=if($null -ne $mine.finalPrice){$text.RecentFailed}else{$text.MissingFailed}
      $partialCount++
    }
    if ($result.competitors -and @($result.competitors).Count -gt 0) {
      $product.offers=@($product.offers | Where-Object {$_.role -ne 'competitor'})
      foreach ($entry in @($result.competitors)) {
        $channel=if($entry.seller -match $text.MarketplacePattern){$text.Marketplace}elseif($entry.seller -match $text.AcerPattern){$text.Manufacturer}else{$text.Specialist}
        $product.offers += [pscustomobject]@{
          role='competitor'; channel=$channel; seller=[string]$entry.seller; status=$text.OnSale
          displayPrice=[long]$entry.price; instantDiscount=$null; couponDiscount=$null; cardDiscount=$null
          finalPrice=[long]$entry.price; shipping=0; alertEligible=$true
          condition=$text.SellerCondition
          sourceType=$text.SellerSource; checkedAt=$kst; priceCheckedAt=$kst; confidence='B'
          confidenceText=$text.SellerDetail; url=[string]$result.danawaUrl
        }
      }
    } else {
      foreach ($competitor in @($product.offers | Where-Object {$_.role -eq 'competitor'})) {
        $competitor | Add-Member -NotePropertyName alertEligible -NotePropertyValue $false -Force
      }
    }
    $historyHasCurrentPrice=($result.ok -eq $true)
    $historyCollectionSucceeded=$alertEligible -or ($checkoutStatus -eq 'soldout' -and $null -ne $checkoutCoupon)
    $historySrp=if($historyHasCurrentPrice -and $null -ne $mine.srp){$mine.srp}elseif($historyHasCurrentPrice -and $null -ne $product.srp){$product.srp}else{$null}
    $historyBasis=if($historyHasCurrentPrice){$mine.observedListPrice}else{$null}
    $historyPreCard=if($historyHasCurrentPrice){$mine.preCardPrice}else{$null}
    $historyMatch=if($null -ne $historyBasis -and $null -ne $historySrp){[long]$historyBasis-[long]$historySrp}else{$null}
    $historyPreCardItem=if($null -ne $historyPreCard){[long]$historyPreCard-[long]($mine.shipping)}else{$null}
    $historyCouponTotal=if($null -ne $historyBasis -and $null -ne $historyPreCardItem -and [long]$historyBasis -ge [long]$historyPreCardItem){[long]$historyBasis-[long]$historyPreCardItem}else{$null}
    $historyRows += [pscustomobject][ordered]@{
      '수집일'=$scanKst.Substring(0,10)
      '수집시각'=$scanKst
      '브랜드'=$spec.Brand
      'MTM'=[string]$product.mtm
      '상태'=[string]$mine.status
      '수집결과'=if($historyCollectionSucceeded){'success'}else{'failed'}
      'SRP'=$historySrp
      '표시가'=$historyBasis
      '표시가 종류'=[string]$mine.priceBasisType
      '매칭차액'=$historyMatch
      '일반 쿠폰할인'=if($historyHasCurrentPrice){$mine.checkoutCouponDiscount}else{$null}
      '와우 전용 즉시할인'=if($historyHasCurrentPrice){$mine.wowInstantDiscount}else{$null}
      '와우 전용 쿠폰할인'=if($historyHasCurrentPrice){$mine.wowCouponDiscount}else{$null}
      '쿠폰할인 총금액'=$historyCouponTotal
      '카드할인 전 가격'=$historyPreCard
      '카드할인 상태'=if($historyHasCurrentPrice){[string]$mine.cardBenefitStatus}else{'unverified'}
      '카드할인'=if($historyHasCurrentPrice){$mine.cardDiscount}else{$null}
      '적용 카드사'=if($historyHasCurrentPrice){(@($mine.cardProviders) -join ', ')}else{''}
      '카드 할인율(%)'=if($historyHasCurrentPrice){$mine.cardRate}else{$null}
      '최대 할인한도'=if($historyHasCurrentPrice){$mine.cardMaxDiscount}else{$null}
      '최종 실구매가'=if($alertEligible){$currentVerifiedFinal}else{$null}
      '가격 확인 시각'=if($historyHasCurrentPrice){[string]$mine.priceCheckedAt}else{''}
      '상품 URL'=[string]$mine.url
    }
  }
  $data.meta.monitoring.lastAttemptStatus=if($partialCount -eq 0){'success'}else{'partial'}
  $data.meta.monitoring.lastAttemptText="$($spec.Brand) 수집 결과: 검증 $verified, 품절 $soldOutCount, 일부 $partialCount / 전체 $(@($data.products).Count)"
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
$historyStart=[DateTimeOffset]::Parse('2026-09-23T09:20:52+09:00')
if ($historyRows.Count -gt 0) {
  New-Item -ItemType Directory -Path (Split-Path -Parent $historyPath) -Force | Out-Null
  $combined=@()
  if (Test-Path $historyPath) {
    $combined+=@(Import-Csv -Path $historyPath -Encoding UTF8 | Where-Object {
      try { [DateTimeOffset]::Parse([string]$_.'수집시각') -ge $historyStart } catch { $false }
    })
  }
  $keys=New-Object 'System.Collections.Generic.HashSet[string]'
  foreach ($row in $combined) { [void]$keys.Add("$($row.'수집시각')|$($row.'브랜드')|$($row.MTM)") }
  foreach ($row in $historyRows) {
    $key="$($row.'수집시각')|$($row.'브랜드')|$($row.MTM)"
    if ([DateTimeOffset]::Parse([string]$row.'수집시각') -ge $historyStart -and $keys.Add($key)) { $combined+=$row }
  }
  $combined=@($combined | Sort-Object '수집시각','브랜드','MTM')
  $combined | Export-Csv -Path $historyPath -NoTypeInformation -Encoding UTF8
  $headers=@($combined[0].PSObject.Properties.Name)
  $numberColumns=@('SRP','표시가','매칭차액','일반 쿠폰할인','와우 전용 즉시할인','와우 전용 쿠폰할인','쿠폰할인 총금액','카드할인 전 가격','카드할인','카드 할인율(%)','최대 할인한도','최종 실구매가')
  $publicRows=@(foreach ($entry in $combined) {
    ,@($headers | ForEach-Object {
      $value=[string]$entry.$_
      if ($_ -in $numberColumns -and $value -match '^-?\d+(\.\d+)?$') { [decimal]$value }
      else { $value }
    })
  })
  $published=@{headers=$headers;rows=$publicRows} | ConvertTo-Json -Depth 5 -Compress
  [IO.File]::WriteAllText((Join-Path $RepoPath 'dist\price-history.js'),"window.MARKET_PULSE_HISTORY = $published;",[Text.UTF8Encoding]::new($false))
  Write-Host "Price history saved: $historyPath ($($combined.Count) rows)"
}
if (Test-Path (Join-Path $RepoPath 'brand')) { Invoke-Git -Arguments @('add','--','brand') | Out-Null }
Invoke-Git -Arguments @('add','--','dist/price-history.js') | Out-Null
$diffExit=Invoke-Git -Arguments @('diff','--cached','--quiet') -AcceptedExitCodes @(0,1)
if ($diffExit -eq 1) {
  Invoke-Git -Arguments @('commit','-m','data: import Coupang prices from Chrome extension') | Out-Null
}
Invoke-Git -Arguments @('pull','--rebase','origin','main') | Out-Null
Invoke-Git -Arguments @('push','origin','main') | Out-Null
