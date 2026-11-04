$ErrorActionPreference='Stop'
$source=Get-Content -Raw -Encoding UTF8 (Join-Path $PSScriptRoot 'import-extension-results.ps1')
$numberStart=$source.IndexOf('function Test-MarketPulseNumber(')
$numberEnd=$source.IndexOf('function Resolve-CheckoutDiscounts(', $numberStart)
. ([ScriptBlock]::Create($source.Substring($numberStart,$numberEnd-$numberStart)))
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

# Exercise the complete real per-product importer loop on mixed successes/failures.
$payload=[pscustomobject]@{browser='edge'}
$helperStart=$source.IndexOf('function Decode-Utf8(')
$helperEnd=$source.IndexOf('function Read-Data(', $helperStart)
. ([ScriptBlock]::Create($source.Substring($helperStart,$helperEnd-$helperStart)))
$loopStart=$source.IndexOf('  foreach ($product in $data.products) {')
$loopEnd=$source.IndexOf('  $data.meta.monitoring.lastAttemptStatus=', $loopStart)
$loop=[ScriptBlock]::Create($source.Substring($loopStart,$loopEnd-$loopStart))
$kstZone=[TimeZoneInfo]::FindSystemTimeZoneById('Korea Standard Time')
$scanKst='2026-10-16T16:42:56+09:00';$spec=[pscustomobject]@{Brand='Test'}
$data=[pscustomobject]@{products=@()};$brandResults=@()
foreach($i in 1..4) {
  $mine=[pscustomobject]@{role='mine';displayPrice=1000000;finalPrice=750000;instantDiscount=0;couponDiscount=250000;cardDiscount=0;
    checkedAt='2026-10-16 12:13';priceCheckedAt='2026-10-16 12:13';status='현재가 직접 확인';condition='';confidence='A';confidenceText='';
    shipping=0;url='https://www.coupang.com/';alertEligible=$true;cardBenefitStatus='none';checkoutDiscountStatus='captured'}
  if($i -eq 4){$mine.finalPrice=$null;$mine.alertEligible=$false;$mine.priceCheckedAt=''}
  $data.products += [pscustomobject]@{mtm="MODEL$i";productId="$i";itemId="$i";vendorItemId="$i";srp=1000000;offers=@($mine)}
  $brandResults += [pscustomobject]@{mtm="MODEL$i";productId="$i";itemId="$i";vendorItemId="$i";checkedAt='2026-10-16T07:42:00Z';ok=$true;
    price=800000;srp=1000000;priceBasisSource='visible-product-price';strikeReliable=$true;strikeAnchorVerified=$true;basisEvidence=@{top=100};basisPrice=1000000;strikePrice=1000000;priceBasisType='crossed-out';
    checkoutDiscountStatus='captured';checkoutDiscountReason='';checkoutCouponDiscount=200000;checkoutCouponSource='checkout';wowInstantDiscount=0;wowCouponDiscount=0;
    checkoutDiscountCapturedAt='2026-10-16T07:42:00Z';cardBenefitStatus='none';cardDiscount=0;competitorPages=@()}
}
$brandResults[1].checkoutDiscountStatus='missing';$brandResults[1].checkoutDiscountReason='Tabs cannot be edited right now (user may be dragging a tab).'
$brandResults[2].ok=$false;$brandResults[2] | Add-Member reason 'access-check'
$brandResults[3].ok=$false
$historyRows=@();$competitorHistoryRows=@();$verified=0;$soldOutCount=0;$partialCount=0;$validatedCompetitorCount=0
. $loop
if($verified -ne 1 -or $partialCount -ne 3){throw 'Mixed model results did not preserve the successful model.'}
$normal=$data.products[0].offers[0]
if($normal.finalPrice -ne 800000 -or -not $normal.alertEligible -or $normal.priceChange -ne 50000){throw 'Successful model price/trend changed.'}
foreach($i in 1..3){
  $failed=$data.products[$i].offers[0]
  if($failed.collectionStatus -ne 'review-needed' -or $failed.alertEligible -or $null -ne $failed.priceChange -or $null -ne $failed.preCardPrice -or $null -ne $failed.cardDiscount){throw 'Failure leaked current price/discount eligibility.'}
}
$failed=$data.products[1].offers[0]
if($failed.finalPrice -ne 750000 -or $failed.priceCheckedAt -ne '2026-10-16 12:13' -or $failed.collectionAttemptedAt -ne '2026-10-16 16:42' -or $failed.collectionIssue -ne 'tab-edit-busy'){throw 'Failure did not distinguish previous verification and current attempt.'}
if($data.products[2].offers[0].collectionIssue -ne 'access-check' -or $null -ne $data.products[3].offers[0].finalPrice){throw 'Access failure or no-history failure handling changed.'}
if(@($historyRows | Where-Object {$_.'수집결과' -eq 'failed'}).Count -ne 3 -or @($historyRows | Where-Object {$_.'수집결과' -eq 'failed' -and $null -ne $_.'최종 실구매가'}).Count){throw 'Failed history claimed a fresh verified price.'}
# A later real successful capture clears the marker and resumes correct comparisons.
$brandResults[1].checkoutDiscountStatus='captured';$brandResults[1].checkoutDiscountReason=''
$historyRows=@();$verified=0;$soldOutCount=0;$partialCount=0
. $loop
$recovered=$data.products[1].offers[0]
if($recovered.collectionStatus -or -not $recovered.alertEligible -or $recovered.finalPrice -ne 800000 -or $recovered.priceChange -ne 50000){throw 'Recovered model retained an error or compared against an unverified price.'}
Write-Host 'Mixed model publication, failure history, no prior price and next-success recovery passed.'

# A second publication must not recheck or append history for retained healthy rows.
$payload|Add-Member modelRecovery ([pscustomobject]@{sourceRunId='original'}) -Force
foreach($result in $brandResults){$result|Add-Member collectionSource ([pscustomobject]@{browser='edge';runId='original'}) -Force}
$before=@($data.products|ForEach-Object {$_|ConvertTo-Json -Depth 20 -Compress})
$historyRows=@();$competitorHistoryRows=@();$verified=0;$soldOutCount=0;$partialCount=0;$validatedCompetitorCount=0
. $loop
$after=@($data.products|ForEach-Object {$_|ConvertTo-Json -Depth 20 -Compress})
if(($before -join '') -cne ($after -join '') -or $historyRows.Count -ne 0 -or $competitorHistoryRows.Count -ne 0){throw 'Post-publication retry rewrote retained rows or appended duplicate history.'}
Write-Host 'Post-publication retained prices, timestamps, trends, comparison eligibility and both histories remain unchanged.'

# Malformed financial fields are per-model review results, never rounded or fatal.
foreach($value in @(-1,0.5,'1000','bad',[double]::NaN,[double]::PositiveInfinity,$true)){
 if(Test-MarketPulseMoney $value){throw 'Invalid money was accepted'}
 $r=[pscustomobject]@{checkoutDiscountStatus='captured';checkoutCouponSource='checkout';checkoutCouponDiscount=$value;wowInstantDiscount=0;wowCouponDiscount=0}
 if((Resolve-CheckoutDiscounts $r).Status -eq 'captured'){throw 'Invalid checkout amount became verified'}
}
foreach($value in @(0,1,7000000)){if(-not (Test-MarketPulseMoney $value)){throw 'Valid whole money was rejected'}}
$payload=[pscustomobject]@{browser='edge'}
foreach($r in $brandResults){$r.PSObject.Properties.Remove('collectionSource')}
$brandResults[0].cardBenefitStatus='captured';$brandResults[0].cardDiscount=24000
$brandResults[0]|Add-Member cardRate 3 -Force
$brandResults[0]|Add-Member cardProviders @('Test') -Force
$brandResults[0]|Add-Member cardEvidenceSource 'dom' -Force
foreach($field in @('price','basisPrice','cardRate','cardDiscount')){
 $brandResults[0]|Add-Member $field 'malformed' -Force
 $historyRows=@();$verified=0;$soldOutCount=0;$partialCount=0
 . $loop
 if($data.products[0].offers[0].alertEligible){throw 'Malformed field became an eligible price'}
 $brandResults[0]|Add-Member $field $(if($field -eq 'price'){800000}elseif($field -eq 'basisPrice'){1000000}elseif($field -eq 'cardRate'){3}else{24000}) -Force
}
Write-Host 'Strict money/rate boundaries: invalid types/fractions/non-finite values stay isolated without rounding or publication failure.'
