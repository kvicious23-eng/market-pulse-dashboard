$ErrorActionPreference='Stop'
$source=Get-Content -Raw -Encoding UTF8 (Join-Path $PSScriptRoot 'import-extension-results.ps1')
$start=$source.IndexOf('function Decode-Utf8(');$end=$source.IndexOf('function Read-Data(', $start)
. ([ScriptBlock]::Create($source.Substring($start,$end-$start)))
$start=$source.IndexOf('  foreach ($product in $data.products) {');$end=$source.IndexOf('  $data.meta.monitoring.lastAttemptStatus=', $start)
$loop=[ScriptBlock]::Create($source.Substring($start,$end-$start))
function Check-PagePrice([long]$Page,[long]$Wow,[long]$Shipping=0,[switch]$Card,[switch]$SamePolicy){
 $payload=[pscustomobject]@{browser='chrome'};$kstZone=[TimeZoneInfo]::FindSystemTimeZoneById('Korea Standard Time')
 $scanKst='2026-11-16T15:10:00+09:00';$spec=[pscustomobject]@{Brand='Test'}
 $mine=[pscustomobject]@{role='mine';displayPrice=2299000;finalPrice=1829000;instantDiscount=150000;couponDiscount=320000;cardDiscount=0;checkedAt='2026-11-16 12:03';priceCheckedAt='2026-11-16 12:03';status='현재가 직접 확인';condition='';confidence='A';confidenceText='';shipping=$Shipping;url='https://www.coupang.com/';alertEligible=$true;cardBenefitStatus='none';checkoutDiscountStatus='captured'}
 if($SamePolicy){$mine|Add-Member priceCalculationPolicy 'product-page-v1'}
 $data=[pscustomobject]@{products=@([pscustomobject]@{mtm='MODEL';productId='1';itemId='2';vendorItemId='3';srp=2299000;offers=@($mine)})}
 $row=[pscustomobject]@{mtm='MODEL';productId='1';itemId='2';vendorItemId='3';checkedAt='2026-11-16T06:03:00Z';ok=$true;price=$Page;priceBasisSource='visible-product-price';strikeReliable=$true;strikeAnchorVerified=$true;basisEvidence=@{top=100};basisPrice=2149000;strikePrice=2149000;priceBasisType='crossed-out';checkoutDiscountStatus='captured';checkoutDiscountReason='';checkoutCouponDiscount=150000;checkoutCouponSource='checkout';wowInstantDiscount=90000;wowCouponDiscount=$Wow;checkoutDiscountTotal=(240000+$Wow);checkoutDiscountCapturedAt='2026-11-16T06:04:00Z';cardBenefitStatus='none';cardDiscount=0;competitorPages=@()}
 if($Card){$row.cardBenefitStatus='captured';$row.cardDiscount=[math]::Min([math]::Floor($Page*0.03),50000);foreach($pair in @{cardRate=3;cardMaxDiscount=50000;cardProviders=@('B');cardEvidenceSource='dom';cardTerms=@([pscustomobject]@{rate=2;maxDiscount=20000;providers=@('A')},[pscustomobject]@{rate=3;maxDiscount=50000;providers=@('B')})}.GetEnumerator()){$row|Add-Member $pair.Key $pair.Value}}
 $brandResults=@($row);$historyRows=@();$competitorHistoryRows=@();$verified=0;$soldOutCount=0;$partialCount=0;$validatedCompetitorCount=0
 . $loop
 $actual=$data.products[0].offers[0];$discount=if($Card){[math]::Min([math]::Floor($Page*0.03),50000)}else{0}
 if(-not $actual.alertEligible -or $actual.finalPrice -ne ($Page+$Shipping-$discount) -or $actual.preCardPrice -ne ($Page+$Shipping)){throw 'Product-page final/card basis mismatch'}
 if($actual.wowCouponDiscount -ne 0 -or $actual.excludedWowCouponDiscount -ne $Wow -or $actual.couponDiscount -ne (2149000-$Page)){throw 'WOW exclusion or page discount total mismatch'}
 if($historyRows[0].'와우 전용 쿠폰할인' -ne 0 -or $historyRows[0].'최종 실구매가' -ne $actual.finalPrice){throw 'History does not follow product-page policy'}
 if(-not $SamePolicy -and $null -ne $actual.priceChange){throw 'Policy migration was reported as a real price change'}
 if($SamePolicy -and $actual.priceChange -ne ($actual.finalPrice-1829000)){throw 'Same-policy comparison was lost'}
}
Check-PagePrice 1909000 80000
Check-PagePrice 1829000 80000
Check-PagePrice 1909000 0
Check-PagePrice 1909000 80000 3000 -Card
Check-PagePrice 1909000 80000 0 -SamePolicy
Write-Host 'Product-page policy: account coupon exclusion, embedded coupon, card caps, shipping, history and policy baseline passed.'
