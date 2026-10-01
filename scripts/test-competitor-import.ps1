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
