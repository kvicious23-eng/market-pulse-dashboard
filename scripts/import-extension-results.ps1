param([string]$RepoPath = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = 'Stop'
$resultFolder = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads\MarketPulse'
$resultPath = Get-ChildItem -Path $resultFolder -Filter 'latest-coupang-scan*.json' -File -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1 -ExpandProperty FullName
if (-not $resultPath) { exit 0 }
$payload = Get-Content -Raw -Encoding UTF8 $resultPath | ConvertFrom-Json
$kstZone = [TimeZoneInfo]::FindSystemTimeZoneById('Korea Standard Time')

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
      $mine.status='현재가 직접 확인'; $mine.confidence='A'
      $mine.confidenceText='동일 Item ID의 일반 Chrome 화면에서 가격 확인'
      $confirmed++
    } else {
      $mine.status=if($null -ne $mine.finalPrice){'최근 검증가 · Chrome 확인 실패'}else{'가격 미확인 · Chrome 확인 실패'}
    }
    if ($spec.Brand -eq 'Acer' -and $result.competitors -and @($result.competitors).Count -gt 0) {
      $product.offers=@($product.offers | Where-Object {$_.role -ne 'competitor'})
      foreach ($entry in @($result.competitors)) {
        $channel=if($entry.seller -match '11번가|옥션|G마켓|롯데ON|쿠팡|SSG|네이버'){'오픈마켓'}elseif($entry.seller -match 'Acer|에이서'){'제조사몰'}else{'전문몰'}
        $product.offers += [pscustomobject]@{
          role='competitor'; channel=$channel; seller=[string]$entry.seller; status='판매중'
          displayPrice=[long]$entry.price; instantDiscount=$null; couponDiscount=$null; cardDiscount=$null
          finalPrice=[long]$entry.price; shipping=0
          condition='다나와 배송비 포함 공개 판매가. 추가 쿠폰·카드할인은 미확인.'
          sourceType='다나와 가격비교 판매처 목록'; checkedAt=$kst; confidence='B'
          confidenceText='정확한 MTM의 쇼핑몰별 판매가를 일반 Chrome에서 확인'; url=[string]$result.danawaUrl
        }
      }
    }
  }
  $data.meta.monitoring.lastAttemptStatus=if($confirmed -eq $brandResults.Count){'success'}else{'partial'}
  $data.meta.monitoring.lastAttemptText="$($spec.Brand) 일반 Chrome 조사 · 현재가 확인 $confirmed/$($brandResults.Count)"
  $data.meta.monitoring.quickWatch='매일 11:30 KST'
  $data.meta.monitoring.collectionRoute='Windows PC · 일반 Chrome 확장프로그램'
  Write-Data $path $data
}
git -C $RepoPath add -- dist/market-data.js acer/market-data.js
git -C $RepoPath diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  git -C $RepoPath commit -m 'data: import Coupang prices from Chrome extension'
  git -C $RepoPath pull --rebase origin main
  git -C $RepoPath push origin main
}
