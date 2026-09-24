param(
  [string]$RepoPath = (Split-Path -Parent $PSScriptRoot),
  [switch]$NoPush
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Find-Chrome {
  $candidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  )
  $programFilesX86 = [Environment]::GetFolderPath("ProgramFilesX86")
  if ($programFilesX86) {
    $candidates += "$programFilesX86\Google\Chrome\Application\chrome.exe"
    $candidates += "$programFilesX86\Microsoft\Edge\Application\msedge.exe"
  }
  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) { return $candidate }
  }
  throw "Chrome 또는 Edge를 찾지 못했습니다."
}

function Read-MarketData([string]$Path) {
  $source = [IO.File]::ReadAllText($Path)
  $body = $source -replace '^\s*window\.MARKET_DATA\s*=\s*', '' -replace ';\s*$', ''
  return $body | ConvertFrom-Json
}

function Write-MarketData([string]$Path, $Data) {
  $json = $Data | ConvertTo-Json -Depth 100
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($Path, "window.MARKET_DATA = $json;" + [Environment]::NewLine, $utf8)
}

function Get-CoupangHtml([string]$ChromePath, [string]$Url, [string]$ProfilePath) {
  $arguments = @(
    "--headless=new", "--disable-gpu",
    "--disable-blink-features=AutomationControlled",
    "--no-first-run", "--no-default-browser-check",
    "--user-data-dir=$ProfilePath", "--virtual-time-budget=12000",
    "--dump-dom", $Url
  )
  return (& $ChromePath $arguments 2>$null | Out-String)
}

function Get-ExactItemPrice([string]$Html, [string]$ItemId) {
  if ([string]::IsNullOrWhiteSpace($Html) -or -not $Html.Contains($ItemId)) { return $null }
  $pattern = '(?i)(salePrice|finalPrice|discountPrice|totalPrice)["''\s]*[:=]\s*["'']?(?<price>[0-9]{5,9})'
  $candidates = New-Object System.Collections.Generic.List[object]
  $searchFrom = 0
  while ($true) {
    $position = $Html.IndexOf($ItemId, $searchFrom, [StringComparison]::Ordinal)
    if ($position -lt 0) { break }
    $start = [Math]::Max(0, $position - 6000)
    $length = [Math]::Min($Html.Length - $start, 12000)
    $scope = $Html.Substring($start, $length)
    foreach ($match in [regex]::Matches($scope, $pattern)) {
      $price = [long]$match.Groups['price'].Value
      if ($price -ge 250000 -and $price -le 7000000) {
        $distance = [Math]::Abs(($start + $match.Index) - $position)
        $candidates.Add([pscustomobject]@{ Price = $price; Distance = $distance })
      }
    }
    $searchFrom = $position + $ItemId.Length
  }
  if ($candidates.Count -eq 0) { return $null }
  $winner = $candidates | Group-Object Price | ForEach-Object {
    [pscustomobject]@{
      Price = [long]$_.Name
      Count = $_.Count
      Distance = ($_.Group | Measure-Object Distance -Minimum).Minimum
    }
  } | Sort-Object @{Expression='Count';Descending=$true}, @{Expression='Distance';Ascending=$true} | Select-Object -First 1
  return $winner.Price
}

function Update-Brand([string]$RelativePath, [string]$Brand, [string]$ChromePath, [string]$ProfilePath) {
  $path = Join-Path $RepoPath $RelativePath
  $data = Read-MarketData $path
  $kst = [TimeZoneInfo]::FindSystemTimeZoneById("Korea Standard Time")
  $nowKst = [TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $kst)
  $checkedAt = $nowKst.ToString("yyyy-MM-dd HH:mm")
  $stamp = $nowKst.ToString("yyyy-MM-ddTHH:mm:ss+09:00")
  $confirmed = 0

  foreach ($product in $data.products) {
    $mine = $product.offers | Where-Object { $_.role -eq "mine" } | Select-Object -First 1
    if (-not $mine) { continue }
    try {
      $html = Get-CoupangHtml $ChromePath $mine.url $ProfilePath
      $mine | Add-Member -NotePropertyName availabilityCheckedAt -NotePropertyValue $checkedAt -Force
      $price = Get-ExactItemPrice $html ([string]$product.itemId)
      if ($price) {
        $mine.displayPrice = $price
        $shipping = if ($mine.shipping) { [long]$mine.shipping } else { 0 }
        $mine.finalPrice = $price + $shipping
        $mine.checkedAt = $checkedAt
        $mine | Add-Member -NotePropertyName priceCheckedAt -NotePropertyValue $checkedAt -Force
        $mine.status = "현재가 직접 확인"
        $mine.confidence = "A"
        $mine.confidenceText = "동일 Item ID 주변의 공개 가격을 국내 PC에서 직접 확인"
        $mine.condition = "일반 공개 판매가 기준. 개인화·로그인·카드·와우 조건부 혜택 제외."
        $confirmed++
      } elseif ($null -ne $mine.finalPrice) {
        $mine.status = "최근 검증가 · 자동확인 실패"
      } else {
        $mine.status = "가격 미확인 · 자동접근 제한"
      }
    } catch {
      $mine | Add-Member -NotePropertyName availabilityCheckedAt -NotePropertyValue $checkedAt -Force
      if ($null -ne $mine.finalPrice) { $mine.status = "최근 검증가 · 자동확인 실패" }
      else { $mine.status = "가격 미확인 · 자동접근 제한" }
    }
  }

  $data.meta.snapshotAt = $stamp
  $data.meta.monitoring.lastAttemptAt = $stamp
  $data.meta.monitoring.lastAttemptStatus = if ($confirmed -eq $data.products.Count) { "success" } else { "partial" }
  $data.meta.monitoring.lastAttemptText = "$Brand 국내 PC 조사 완료 · 내 쿠팡 현재가 직접확인 $confirmed/$($data.products.Count) · 실패 시 마지막 검증가 유지"
  $data.meta.monitoring | Add-Member -NotePropertyName collectionRoute -NotePropertyValue "국내 Windows PC · Chrome/Edge" -Force
  Write-MarketData $path $data
  return $confirmed
}

$chrome = Find-Chrome
$profile = Join-Path $env:LOCALAPPDATA "MarketPulseChrome"
New-Item -ItemType Directory -Path $profile -Force | Out-Null
git -C $RepoPath pull --rebase origin main
if ($LASTEXITCODE -ne 0) { throw "Git 최신화에 실패했습니다." }

$lenovo = Update-Brand "brand\lenovo\market-data.js" "Lenovo" $chrome $profile
$acer = Update-Brand "brand\acer\market-data.js" "Acer" $chrome $profile

git -C $RepoPath add -- "brand"
git -C $RepoPath diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
  Write-Host "변경된 가격이 없습니다. Lenovo $lenovo/3, Acer $acer/10"
  exit 0
}
git -C $RepoPath commit -m "data: refresh Coupang prices from local scanner"
if ($LASTEXITCODE -ne 0) { throw "가격 데이터 커밋에 실패했습니다." }

if (-not $NoPush) {
  git -C $RepoPath pull --rebase origin main
  if ($LASTEXITCODE -ne 0) { throw "원격 변경사항 병합에 실패했습니다." }
  git -C $RepoPath push origin main
  if ($LASTEXITCODE -ne 0) { throw "GitHub 전송에 실패했습니다. 최초 1회 GitHub 로그인이 필요할 수 있습니다." }
}
Write-Host "완료: Lenovo $lenovo/3, Acer $acer/10"
