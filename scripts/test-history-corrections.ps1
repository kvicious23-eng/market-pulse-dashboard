$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'apply-history-corrections.ps1')
$path=Join-Path $PSScriptRoot 'history-corrections.json'
$correction=@(Get-Content -Path $path -Raw -Encoding UTF8 | ConvertFrom-Json)[0]
$correctionCount=@(Get-Content -Path $path -Raw -Encoding UTF8 | ConvertFrom-Json).Count

function Assert-Equal($actual,$expected,[string]$message) {
  if ([string]$actual -ne [string]$expected) { throw "$message`: expected '$expected', got '$actual'." }
}

$failed=$correction.corrected | ConvertTo-Json -Depth 5 | ConvertFrom-Json
foreach ($field in $correction.expected.PSObject.Properties.Name) {
  $failed.$field=$correction.expected.$field
}
foreach ($field in @('일반 쿠폰할인','와우 전용 즉시할인','와우 전용 쿠폰할인','쿠폰할인 총금액','카드할인 전 가격','카드할인','최종 실구매가')) {
  $failed.$field=''
}
$repaired=@(Apply-HistoryCorrections -Rows @($failed) -CorrectionsPath $path)
Assert-Equal $repaired.Count $correctionCount 'All audited historical rows must be restored'
Assert-Equal $repaired[0].'수집결과' 'success' 'Result status'
Assert-Equal $repaired[0].'와우 전용 쿠폰할인' 150000 'Independent checkout coupon'
Assert-Equal $repaired[0].'최종 실구매가' 1662210 'Final price'
$repeated=@(Apply-HistoryCorrections -Rows $repaired -CorrectionsPath $path)
Assert-Equal $repeated.Count $correctionCount 'Repeating the correction must not add a row'

$unrelated=@([pscustomobject]@{'수집시각'='2026-09-24T08:00:00+09:00';'브랜드'='Acer';MTM='ANV16-I31-514Z'})
$inserted=@(Apply-HistoryCorrections -Rows $unrelated -CorrectionsPath $path)
Assert-Equal $inserted.Count ($correctionCount+1) 'Missing audited rows must be restored without losing another row'

$conflict=$failed | ConvertTo-Json -Depth 5 | ConvertFrom-Json
$conflict.'상품 URL'='https://www.coupang.com/vp/products/unrelated'
$blocked=$false
try { $null=Apply-HistoryCorrections -Rows @($conflict) -CorrectionsPath $path } catch { $blocked=$true }
if (-not $blocked) { throw 'A mismatched original must not be rewritten.' }

# An old successful row can still contain a product-page coupon that was never
# verified at checkout. Require an exact audited original before clearing it.
$soldoutCorrection=@(Get-Content -Path $path -Raw -Encoding UTF8 | ConvertFrom-Json) | Where-Object {
  $_.expected.'수집결과' -eq 'success' -and $_.corrected.'일반 쿠폰할인' -eq ''
} | Select-Object -First 1
if (-not $soldoutCorrection) { throw 'Sold-out source correction is missing.' }
$oldSoldout=$soldoutCorrection.expected | ConvertTo-Json -Depth 5 | ConvertFrom-Json
$reconciled=@(Apply-HistoryCorrections -Rows @($oldSoldout) -CorrectionsPath $path)
$correctedSoldout=$reconciled | Where-Object {
  $_.'수집시각' -eq $soldoutCorrection.corrected.'수집시각' -and $_.MTM -eq $soldoutCorrection.corrected.MTM
} | Select-Object -First 1
Assert-Equal $correctedSoldout.'일반 쿠폰할인' '' 'Unverified sold-out coupon must be cleared'
$oldSoldout.'일반 쿠폰할인'='99999'
$blocked=$false
try { $null=Apply-HistoryCorrections -Rows @($oldSoldout) -CorrectionsPath $path } catch { $blocked=$true }
if (-not $blocked) { throw 'Mismatched successful history must not be rewritten.' }
Write-Host 'Audited history correction passed.'
