$ErrorActionPreference='Stop'
$source=Get-Content -Raw -Encoding UTF8 (Join-Path $PSScriptRoot 'import-extension-results.ps1')
$start=$source.IndexOf('    $eligibleCompetitors=@(foreach($page in $pages){')
$end=$source.IndexOf('    if ($eligibleCompetitors.Count -gt 0)', $start)
if($start -lt 0 -or $end -le $start){throw 'Competitor import block not found.'}
$block=[ScriptBlock]::Create($source.Substring($start,$end-$start))
function Read-TestEntries($entries,$pageTitle='Godox C100 정품') {
  $product=[pscustomobject]@{mtm='C100';srp=42000}
  $spec=[pscustomobject]@{Brand='Godox'}
  $excludedCompetitor='해외\s*(구매|직구|배송)|구매\s*대행|현금(?!\s*영수증)|무통장\s*입금|계좌\s*이체'
  $pages=@([pscustomobject]@{source='다나와';title=$pageTitle;url='https://prod.danawa.com/info/?pcode=124247591';sellers=@($entries)})
  . $block
  return @($eligibleCompetitors)
}
$paid=[pscustomobject]@{seller='오늘의집';price=42000;shipping=3000;shippingStatus='verified';sellerRowVerified=$true;matchedMtm='C100';productTitle='Godox C100 정품';label='42,000원 3,000원'}
$rows=@(Read-TestEntries @($paid))
if($rows.Count -ne 1 -or $rows[0].price -ne 45000 -or $rows[0].itemPrice -ne 42000 -or $rows[0].shipping -ne 3000){throw 'Paid delivery was not included.'}
$free=$paid | ConvertTo-Json | ConvertFrom-Json
$free.shipping=0;$free.label='42,000원 무료배송'
$rows=@(Read-TestEntries @($free))
if($rows.Count -ne 1 -or $rows[0].price -ne 42000){throw 'Free delivery failed.'}
$legacy=[pscustomobject]@{seller='광고';price=42000;label='42,000원 무료배송'}
if(@(Read-TestEntries @($legacy)).Count -ne 0){throw 'Legacy unverified row was accepted.'}
$unknown=$paid | ConvertTo-Json | ConvertFrom-Json
$unknown.shippingStatus='unknown'
if(@(Read-TestEntries @($unknown)).Count -ne 0){throw 'Unknown delivery was accepted.'}
$mismatch=$paid | ConvertTo-Json | ConvertFrom-Json
$mismatch.matchedMtm='OTHER'
if(@(Read-TestEntries @($mismatch)).Count -ne 0){throw 'Wrong model row was accepted.'}
if(@(Read-TestEntries @($paid) '애플 맥북 정품').Count -ne 0){throw 'Wrong page identity was accepted.'}
Write-Host 'Competitor import shipping and identity gates passed.'


# Exercise actual importer card handling without writing real data or invoking Git.
$cardStart=$source.IndexOf('$cardBenefitStatus=if ($result.cardBenefitStatus)')
$cardEnd=$source.IndexOf('$couponTotal=if ($checkoutStatus', $cardStart)
if($cardStart -lt 0 -or $cardEnd -le $cardStart){throw 'Card calculation block missing.'}
$cardBlock=[ScriptBlock]::Create($source.Substring($cardStart,$cardEnd-$cardStart))
function Test-CardState($state,$terms,$reason='') {
  $result=[pscustomobject]@{cardBenefitStatus=$state;cardRate=3;cardProviders=@('Test');cardEvidenceSource='dom';cardMaxDiscount=38900;cardTerms=$terms;cardDiscount=38900;checkoutDiscountReason=$reason}
  $preCardItemPrice=1000000;$preCardPrice=1003000;$productPagePrice=1300000
  $checkoutStatus='captured';$previousFinalPrice=900000
  . $cardBlock
  [pscustomobject]@{review=$cardReviewRequired;status=$cardBenefitStatus;eligible=$alertEligible;final=$final;discount=$cardDiscount}
}
$partial=Test-CardState 'partial' @()
if(-not $partial.review -or $partial.status -ne 'review-needed' -or $partial.eligible -or $partial.final -ne 1003000 -or $null -ne $partial.discount){throw 'Incomplete card evidence did not publish only the current pre-card amount.'}
$captured=Test-CardState 'captured' @([pscustomobject]@{rate=3;maxDiscount=38900;providers=@('Test')})
if($captured.review -or -not $captured.eligible -or $captured.discount -ne 30000 -or $captured.final -ne 973000){throw 'Verified coupon-first capped card calculation changed.'}
$sold=Test-CardState 'partial' @() 'buy-now-button-sold-out'
if($sold.review -or $sold.eligible){throw 'Sold-out card conditions became a purchasable pre-card amount.'}
Write-Host 'Card review publication, previous-price exclusion, shipping and verified-card calculation passed.'
