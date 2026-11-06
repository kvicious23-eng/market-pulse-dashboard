$ErrorActionPreference='Stop'
$root=Join-Path ([IO.Path]::GetTempPath()) ('MPCompPublish-'+[guid]::NewGuid().ToString('N'))
$repo=Join-Path $root 'repo';$folder=Join-Path $root 'downloads';$remote=Join-Path $root 'remote.git'
try{
 New-Item -ItemType Directory (Join-Path $repo 'scripts'),(Join-Path $repo 'chrome-extension'),(Join-Path $repo 'brand\test'),(Join-Path $repo 'dist'),$folder -Force|Out-Null
 Copy-Item (Join-Path $PSScriptRoot '*.ps1') (Join-Path $repo 'scripts')
 Copy-Item (Join-Path $PSScriptRoot 'competitor-data.mjs') (Join-Path $repo 'scripts')
 Copy-Item (Join-Path $PSScriptRoot '..\chrome-extension\competitor-models.js') (Join-Path $repo 'chrome-extension')
 Copy-Item (Join-Path $PSScriptRoot '..\chrome-extension\scan-policy.js') (Join-Path $repo 'chrome-extension')
 . (Join-Path $repo 'scripts\scan-recovery.ps1');. (Join-Path $repo 'scripts\git-timeout.ps1');. (Join-Path $repo 'scripts\brand-lifecycle.ps1');. (Join-Path $repo 'scripts\competitor-phase.ps1')
 function Git-Comp([string[]]$a){$r=Invoke-MarketPulseGit -RepoPath $repo -Arguments $a;if($r.Code){throw ($a -join ' ')};$r.Output}
 function Check($v,$s){if(-not $v){throw $s}}
 $slot='2026-11-04T08:00+09:00';$id='a'*32;$nonce='b'*32
 $target=[pscustomobject]@{model='Comp';competitorKey='1-2-3';productId='1';itemId='2';vendorItemId='3';url='https://www.coupang.com/vp/products/1?itemId=2&vendorItemId=3'}
 $owner=[pscustomobject]@{brand='Test';mtm='OWN';productId='10';itemId='20';vendorItemId='30';enabled=$true;competitors=@([pscustomobject]@{model='Comp';url=$target.url})}
 $catalog=[pscustomobject]@{products=@($owner)};Write-ScanRecoveryJson (Join-Path $folder 'product-catalog.json') $catalog
 $mine=[pscustomobject]@{role='mine';finalPrice=777777;priceChange=-3}
 $data=[pscustomobject]@{meta=[pscustomobject]@{brand='Test';snapshotAt=$slot;collectionEvidence=[pscustomobject]@{scanSlot=$slot;runId=$id};monitoring=[pscustomobject]@{}};products=@([pscustomobject]@{mtm='OWN';productId='10';itemId='20';vendorItemId='30';offers=@($mine);supplierMetrics=[pscustomobject]@{stock=7}})}
 $file=Join-Path $repo 'brand\test\market-data.js';[IO.File]::WriteAllText($file,('window.MARKET_DATA = '+($data|ConvertTo-Json -Depth 20)+';'),[Text.UTF8Encoding]::new($false))
 [IO.File]::WriteAllText((Join-Path $repo 'brand\test\index.html'),'<title>Test</title>')
 [IO.File]::WriteAllText((Join-Path $repo '.gitignore'),"reports/`nchrome-extension/runtime/`n")
 [IO.File]::WriteAllText((Join-Path $repo 'dist\price-history.js'),'preserve-my-history')
 [IO.File]::WriteAllText((Join-Path $repo 'dist\competitor-price-history.js'),'window.MARKET_PULSE_COMPETITOR_HISTORY = {"schema":2,"headers":[],"rows":[]};')
 $null=Git-Comp @('init','-q','--initial-branch=main');$null=Git-Comp @('config','user.name','Test');$null=Git-Comp @('config','user.email','test@example.invalid');$null=Git-Comp @('add','.');$null=Git-Comp @('commit','-qm','baseline');$null=Git-Comp @('init','--bare','--initial-branch=main',$remote);$null=Git-Comp @('remote','add','origin',$remote);$null=Git-Comp @('push','-u','origin','main')
 $q=[pscustomobject]@{sourceRunId=$id;requestId=$nonce;browser='chrome';scanSlot=$slot;deadlineAt='2026-11-04T10:00:00+09:00';publicationDeadline=[DateTimeOffset]::UtcNow.AddHours(1).ToString('o');firstPublishedAt='2026-11-04T08:34:00+09:00';targets=@($target);finalCommit=$null}
 $qp=Join-Path $repo 'reports\queue.json';Write-ScanRecoveryJson $qp $q
 $row=$target|ConvertTo-Json|ConvertFrom-Json
 foreach($kv in @{ok=$true;checkedAt='2026-11-04T08:40:00+09:00';price=600000;basisPrice=700000;strikePrice=700000;basisEvidence=@{text='700000'};priceBasisSource='visible-product-price';priceBasisType='top-visible';strikeReliable=$true;strikeAnchorVerified=$true;checkoutDiscountStatus='captured';checkoutCouponSource='checkout';checkoutCouponDiscount=100000;wowInstantDiscount=0;wowCouponDiscount=0;checkoutDiscountTotal=100000;checkoutShipping=0;cardBenefitStatus='none';cardDiscount=0}.GetEnumerator()){$row|Add-Member $kv.Key $kv.Value}
 $result=[pscustomobject]@{version=1;scope='competitors';sourceRunId=$id;requestId=$nonce;browser='chrome';scanSlot=$slot;deadlineAt=$q.deadlineAt;terminal=$true;total=1;startedAt='2026-11-04T08:35:00+09:00';completedAt='2026-11-04T08:41:00+09:00';results=@($row)}
 $rp=Join-Path $repo 'reports\result.json';Write-ScanRecoveryJson $rp $result
 $before=(Get-FileHash $file -Algorithm SHA256).Hash
 $script:realData=(Get-Command Invoke-CompetitorData).ScriptBlock
 function Invoke-CompetitorData([string]$RepoPath,[string]$Mode,[string]$CatalogPath,[string]$QueuePath='',[string]$ResultPath=''){& $script:realData @PSBoundParameters;throw 'synthetic-before-commit'}
 $failed=$false;try{Publish-CompetitorResult $q $qp $rp $repo $folder}catch{$failed=$_.Exception.Message -eq 'synthetic-before-commit'}
 Check $failed 'Fault was not injected';Check ((Get-FileHash $file -Algorithm SHA256).Hash -ceq $before) 'Failed competitor publication damaged own data';Check (-not(Test-Path (Join-Path $repo 'reports\price-publication-transaction.json'))) 'Rollback left a journal'
 Set-Item Function:\Invoke-CompetitorData -Value $script:realData
 Publish-CompetitorResult $q $qp $rp $repo $folder
 $d=Read-ScanRecoveryJson $qp
 $raw=[IO.File]::ReadAllText($file);$published=$raw.Substring($raw.IndexOf('=')+1).Trim().TrimEnd(';')|ConvertFrom-Json
 Check ($published.products[0].offers[0].finalPrice -eq 777777 -and $published.products[0].offers[0].priceChange -eq -3 -and $published.products[0].supplierMetrics.stock -eq 7) 'Own prices/inventory changed'
 Check ($published.products[0].competitorModels[0].finalPrice -eq 600000) 'Competitor price not published'
 Check ([IO.File]::ReadAllText((Join-Path $repo 'dist\price-history.js')) -ceq 'preserve-my-history') 'Own price history changed'
 $head=(Git-Comp @('rev-parse','HEAD')) -join ''
 Publish-CompetitorResult $q $qp $rp $repo $folder
 Check (((Git-Comp @('rev-parse','HEAD')) -join '') -ceq $head) 'Retry added a duplicate commit'
 Check (-not(@(Git-Comp @('status','--porcelain')).Count)) 'Publisher left a dirty checkout'
 Write-Host 'Real competitor merge -> shared journal -> rollback fault -> commit/push -> idempotent retry passed; local bare remote only.'
}finally{Remove-Item $root -Recurse -Force -ErrorAction SilentlyContinue}
