param(
  [string]$RepoPath = "C:\MarketPulse"
)

$ErrorActionPreference = 'Stop'
$historyPath = Join-Path $RepoPath 'reports\my-coupang-price-history.csv'

function Read-Data([string]$path) {
  $raw = [IO.File]::ReadAllText($path,[Text.Encoding]::UTF8)
  return ($raw -replace '^\s*window\.MARKET_DATA\s*=\s*','' -replace ';\s*$','') | ConvertFrom-Json
}

$specs = @()
$brandRoot = Join-Path $RepoPath 'brand'
if (Test-Path $brandRoot) {
  Get-ChildItem $brandRoot -Directory | ForEach-Object {
    $dataPath = Join-Path $_.FullName 'market-data.js'
    if (Test-Path $dataPath) { $specs += @{ Brand=$_.Name; Path=$dataPath } }
  }
}

$rows = @()
foreach ($spec in $specs) {
  $dataPath = if ([IO.Path]::IsPathRooted($spec.Path)) { $spec.Path } else { Join-Path $RepoPath $spec.Path }
  if (-not (Test-Path $dataPath)) { continue }
  $data = Read-Data $dataPath
  $brand = if ($data.meta.brand) { [string]$data.meta.brand } else { [string]$spec.Brand }
  $collectedAt = [string]$data.meta.snapshotAt
  foreach ($product in @($data.products)) {
    $mine = $product.offers | Where-Object { $_.role -eq 'mine' } | Select-Object -First 1
    if (-not $mine) { continue }
    $srp = if ($null -ne $mine.srp) { $mine.srp } elseif ($null -ne $product.srp) { $product.srp } else { $null }
    $basis = $mine.observedListPrice
    $preCard = $mine.preCardPrice
    $shipping = if ($null -ne $mine.shipping) { [long]$mine.shipping } else { 0 }
    $preCardItem = if ($null -ne $preCard) { [long]$preCard-$shipping } else { $null }
    $match = if ($null -ne $basis -and $null -ne $srp) { [long]$basis-[long]$srp } else { $null }
    $couponTotal = if ($null -ne $basis -and $null -ne $preCardItem -and [long]$basis -ge [long]$preCardItem) { [long]$basis-[long]$preCardItem } else { $null }
    $rows += [pscustomobject][ordered]@{
      '수집일'=$collectedAt.Substring(0,10)
      '수집시각'=$collectedAt
      '브랜드'=$brand
      'MTM'=[string]$product.mtm
      '상태'=[string]$mine.status
      '수집결과'=if($mine.alertEligible -eq $true -or ([string]$mine.checkoutDiscountStatus -eq 'soldout' -and $null -ne $mine.checkoutCouponDiscount)){'success'}else{'failed'}
      'SRP'=$srp
      '표시가'=$basis
      '표시가 종류'=[string]$mine.priceBasisType
      '매칭차액'=$match
      '일반 쿠폰할인'=$mine.checkoutCouponDiscount
      '와우 전용 즉시할인'=$mine.wowInstantDiscount
      '와우 전용 쿠폰할인'=$mine.wowCouponDiscount
      '쿠폰할인 총금액'=$couponTotal
      '카드할인 전 가격'=$preCard
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
}

if ($rows.Count -eq 0) { throw 'No current Market Pulse product data was found.' }
New-Item -ItemType Directory -Path (Split-Path -Parent $historyPath) -Force | Out-Null
$combined = @()
if (Test-Path $historyPath) { $combined += @(Import-Csv -Path $historyPath -Encoding UTF8) }
$keys = New-Object 'System.Collections.Generic.HashSet[string]'
foreach ($row in $combined) { [void]$keys.Add("$($row.'수집시각')|$($row.'브랜드')|$($row.MTM)") }
foreach ($row in $rows) {
  $key = "$($row.'수집시각')|$($row.'브랜드')|$($row.MTM)"
  if ($keys.Add($key)) { $combined += $row }
}
$combined | Sort-Object '수집시각','브랜드','MTM' | Export-Csv -Path $historyPath -NoTypeInformation -Encoding UTF8
Write-Host "Price history created: $historyPath"
Write-Host "Rows: $($combined.Count)"
Start-Process explorer.exe -ArgumentList "/select,`"$historyPath`""
