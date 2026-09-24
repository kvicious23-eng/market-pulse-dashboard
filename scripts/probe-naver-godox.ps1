#requires -Version 5.1
param([string]$RepoPath=(Split-Path -Parent $PSScriptRoot),[string]$FixturePath='')
$ErrorActionPreference='Stop'

function Get-Candidate($item) {
  $title=[Net.WebUtility]::HtmlDecode(([regex]::Replace([string]$item.title,'<[^>]*>',' ')))
  $title=[regex]::Replace($title,'\s+',' ').Trim()
  $brand=[string]$item.brand
  $name="$title $brand $($item.maker)"
  if ($title -notmatch '(?i)(?<![a-z0-9])c100(?![a-z0-9])' -or $name -notmatch '(?i)(godox|고독스)') { return $null }
  if ($brand -and $brand -notmatch '(?i)(godox|고독스)') { return $null }
  if ($title -match '(?i)c100\s*(?:[-/]\s*)?(?:pro|plus|max)(?![a-z0-9])') { return $null }
  if ($title -match '케이스|파우치|필름|스트랩|보호필름|거치대|메모리카드|배터리|렌즈캡|액세서리|악세사리') { return $null }
  $price=0L
  if (-not [long]::TryParse([string]$item.lprice,[ref]$price) -or $price -le 0) { return $null }
  $productType=0
  if (-not [int]::TryParse([string]$item.productType,[ref]$productType) -or $productType -notin @(1,2,3)) { return $null }
  $link=[string]$item.link
  if ($link -notmatch '^https?://') { $link='' }
  return [pscustomobject][ordered]@{
    title=$title; brand=$brand; mall=[string]$item.mallName; price=$price
    productType=$productType
    priceScope=$(if($productType -eq 1){'Naver price-comparison minimum'}else{'Individual mall listing'})
    productId=[string]$item.productId; url=$link
  }
}

if ($FixturePath) {
  $payload=Get-Content -Raw -Encoding UTF8 $FixturePath | ConvertFrom-Json
} else {
  $clientId=[Environment]::GetEnvironmentVariable('NAVER_CLIENT_ID')
  if (-not $clientId) { $clientId=Read-Host 'Naver Client ID' }
  $clientSecret=[Environment]::GetEnvironmentVariable('NAVER_CLIENT_SECRET')
  if (-not $clientSecret) {
    $secure=Read-Host 'Naver Client Secret' -AsSecureString
    $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $clientSecret=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  }
  if (-not $clientId -or -not $clientSecret) { throw 'Naver Shopping API Client ID and Secret are required.' }
  $query=[Uri]::EscapeDataString('Godox C100')
  $uri="https://openapi.naver.com/v1/search/shop.json?query=$query&display=100&start=1&sort=sim&exclude=used:rental:cbshop"
  $payload=Invoke-RestMethod -Uri $uri -Method Get -TimeoutSec 20 -Headers @{
    'X-Naver-Client-Id'=$clientId; 'X-Naver-Client-Secret'=$clientSecret
  }
}
if ($null -eq $payload.items) { throw 'The Naver API response does not have an items array.' }
$matches=@($payload.items | ForEach-Object { Get-Candidate $_ } | Where-Object { $null -ne $_ })
$report=[ordered]@{
  source='Naver Shopping Search API'; query='Godox C100'
  capturedAt=[DateTimeOffset]::Now.ToString('yyyy-MM-ddTHH:mm:sszzz')
  resultCount=@($payload.items).Count; matchingCount=$matches.Count
  note='Listing/lowest prices only. Checkout price, shipping, stock, and exact bundle contents are not verified.'
  matches=$matches
}
$path=Join-Path $RepoPath 'reports\naver-godox-probe.json'
New-Item -ItemType Directory -Path (Split-Path -Parent $path) -Force | Out-Null
[IO.File]::WriteAllText($path,($report | ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
Write-Host "Naver Godox probe saved: $path ($($matches.Count) candidates; no dashboard changes)"
