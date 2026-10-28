# Completed primary source + one bounded subset Edge attempt. Never publish a
# subset directly; bind immutable source bytes, receipt, IDs and full catalogue.
function Test-ModelEdgeEnabled($Payload) {
  try {return ($Payload.browser -ceq 'edge' -and $Payload.recovery -and $Payload.recovery.scope -cne 'models' -and $Payload.scanSlot -cge '2026-10-28T16:00+09:00' -and [version]$Payload.extensionVersion -ge [version]'1.9.52')}catch{return $false}
}
function Get-ModelEdgeKey($Row) { "$($Row.brand)|$($Row.mtm)|$($Row.productId)|$($Row.itemId)|$($Row.vendorItemId)" }
function Get-ModelEdgeEligibleRows($Payload,[string[]]$TargetItemIds) {
  foreach($row in @($Payload.results)){if([string]$row.itemId -cin $TargetItemIds){$row}}
}
function Write-ModelEdgeJson([string]$Path,$Data) {
  New-Item -ItemType Directory (Split-Path $Path) -Force|Out-Null
  $tmp=$Path+'.'+[guid]::NewGuid().ToString('N')+'.tmp'
  try {$Data|ConvertTo-Json -Depth 40|Set-Content -LiteralPath $tmp -Encoding UTF8;Move-Item -LiteralPath $tmp -Destination $Path -Force}
  finally {Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue}
}
function Get-ModelEdgePaths([string]$RepoPath,$Base) {
  if($Base.runId -cnotmatch '^[a-f0-9]{32}$'){throw 'Invalid model recovery base run.'}
  $stem='model-edge-'+(Get-ScanSlotKey $Base.scanSlot)+'-'+$Base.runId
  @{receipt=Join-Path $RepoPath ('reports\'+$stem+'.json');source=Join-Path $RepoPath ('reports\'+$stem+'-source.json');merged=Join-Path $RepoPath ('reports\'+$stem+'-merged.json')}
}
function Assert-ModelEdgeBase($Base,$Catalog,[string]$Slot,[DateTimeOffset]$Now=[DateTimeOffset]::UtcNow) {
  if(-not(Test-ModelEdgeEnabled $Base) -or $Base.version -ne 5 -or $Base.complete -ne $true -or $Base.scanSlot -cne $Slot -or
    $Base.browser -cne 'edge' -or $Base.runId -cnotmatch '^[a-f0-9]{32}$' -or -not $Base.recovery -or $Base.recovery.scope -eq 'models' -or
    $Base.policyId -cne (Get-ScanSlotPolicy $Slot).id){throw 'Invalid model recovery primary source.'}
  if(-not $Catalog -or $Catalog.products -isnot [array]){throw 'Model recovery requires a saved full catalogue.'}
  $rows=@($Base.results)
  if([int]$Base.targetCount -ne $rows.Count -or [int]$Base.resultCount -ne $rows.Count){throw 'Incomplete model recovery base.'}
  foreach($key in @('itemId','vendorItemId')){if(@($rows|Group-Object $key|Where-Object {$_.Count -gt 1}).Count){throw 'Duplicate model recovery base IDs.'}}
  if(@($rows|Group-Object {"$($_.brand)|$($_.mtm)"}|Where-Object {$_.Count -gt 1}).Count){throw 'Duplicate model recovery base MTMs.'}
  $start=[DateTimeOffset]::Parse([string]$Base.startedAt);$end=[DateTimeOffset]::Parse([string]$Base.completedAt)
  $slotAt=[DateTimeOffset]::Parse($Slot);$scanned=[DateTimeOffset]::Parse([string]$Base.scannedAt)
  if($start -lt $slotAt -or $start -gt $slotAt.AddMinutes(140) -or $end -lt $start -or $end -gt $Now.AddMinutes(1) -or
    $end -gt $slotAt.AddMinutes(140) -or $end -gt [DateTimeOffset]::Parse($Base.deadlineAt) -or [math]::Abs(($scanned-$end).TotalSeconds) -gt 1){throw 'Invalid model recovery source time.'}
  foreach($row in $rows) {
    $url=[uri]([string]$row.url)
    if(-not $row.brand -or -not $row.mtm -or $row.productId -cnotmatch '^\d+$' -or $row.itemId -cnotmatch '^\d+$' -or $row.vendorItemId -cnotmatch '^\d+$' -or
      $url.Scheme -cne 'https' -or $url.Host -cne 'www.coupang.com' -or $url.AbsolutePath -cne "/vp/products/$($row.productId)" -or
      $url.Query -cnotmatch "(?:\?|&)itemId=$($row.itemId)(?:&|$)" -or $url.Query -cnotmatch "(?:\?|&)vendorItemId=$($row.vendorItemId)(?:&|$)" -or
      [string]$row.reason -match 'identif.*mismatch|mismatch.*identif'){throw 'Model recovery source identity is not trusted.'}
    $checked=[DateTimeOffset]::Parse([string]$row.checkedAt)
    if($checked -lt $start -or $checked -gt $end){throw 'Model recovery source row time is invalid.'}
    if($row.checkoutDiscountCapturedAt){$at=[DateTimeOffset]::Parse([string]$row.checkoutDiscountCapturedAt);if($at -lt $start -or $at -gt $end){throw 'Source checkout time invalid.'}}
  }
  Assert-ScanCatalog $Catalog $rows
}
function Test-ModelEdgeVerifiedRow($Row) {
  $minimum=if($Row.srp -and [long]$Row.srp -lt 250000){10000}else{250000}
  if($Row.ok -ne $true -or $null -eq $Row.price -or [double]$Row.price -lt $minimum -or [double]$Row.price -gt 7000000){return $false}
  if($Row.priceBasisSource -ne 'visible-product-price' -or -not $Row.basisEvidence){return $false}
  if($Row.priceBasisType -eq 'crossed-out' -and ($Row.strikeReliable -ne $true -or $Row.strikeAnchorVerified -ne $true)){return $false}
  if($Row.checkoutDiscountReason -cin @('buy-now-button-not-found','buy-now-button-sold-out')){return $true}
  if($Row.checkoutDiscountStatus -cne 'captured' -or $Row.checkoutCouponSource -cne 'checkout'){return $false}
  foreach($key in @('checkoutCouponDiscount','wowInstantDiscount','wowCouponDiscount')){
    $value=$Row.PSObject.Properties[$key].Value
    if($null -eq $value -or $value -is [string] -or [double]$value -lt 0 -or [math]::Floor([double]$value) -ne [double]$value){return $false}
  }
  if(([double]$Row.checkoutCouponDiscount+[double]$Row.wowInstantDiscount+[double]$Row.wowCouponDiscount) -gt [double]$Row.price){return $false}
  if($Row.cardBenefitStatus -eq 'none'){return $true}
  if($Row.cardBenefitStatus -ne 'captured' -or -not @($Row.cardTerms).Count){return $false}
  foreach($term in @($Row.cardTerms)){if($null -eq $term.rate -or [double]$term.rate -le 0 -or [double]$term.rate -gt 100 -or ($null -ne $term.maxDiscount -and [double]$term.maxDiscount -lt 0) -or -not @($term.providers|Where-Object {$_ -is [string] -and $_.Trim()}).Count){return $false}}
  $rates=@([regex]::Matches([string]$Row.cardBenefitText,'(?<!\d)(\d+(?:\.\d+)?)\s*%')|ForEach-Object {[decimal]::Parse($_.Groups[1].Value,[Globalization.CultureInfo]::InvariantCulture)}|Sort-Object -Unique)
  $terms=@($Row.cardTerms|ForEach-Object {[decimal]$_.rate}|Sort-Object -Unique)
  if(@($rates|Where-Object {$_ -notin $terms}).Count){return $false}
  return $true
}
function Assert-ModelEdgeResult($Edge,$Receipt,$Base) {
  Assert-EdgeRecoveryResult $Edge $Receipt @($Receipt.targets)
  if($Edge.recovery.scope -cne 'models' -or $Edge.recovery.baseHash -cne $Receipt.baseHash -or
    $Edge.recovery.baseRunId -cne $Base.runId -or [version]$Edge.extensionVersion -lt [version]'1.9.52' -or
    $Edge.policyId -cne $Base.policyId -or $Edge.recovery.policyId -cne $Base.policyId -or
    $Edge.recovery.primaryBrowser -cne (Get-PrimaryScanBrowser $Base.scanSlot) -or $Edge.recovery.primaryRequestId -cne $Base.recovery.primaryRequestId){throw 'Subset Edge provenance mismatch.'}
  $start=[DateTimeOffset]::Parse([string]$Edge.startedAt);$end=[DateTimeOffset]::Parse([string]$Edge.completedAt)
  if($end -lt $start -or $start -le [DateTimeOffset]::Parse($Base.completedAt) -or [math]::Abs(([DateTimeOffset]::Parse($Edge.scannedAt)-$end).TotalSeconds) -gt 1){throw 'Subset Edge time mismatch.'}
  foreach($row in @($Edge.results)) {
    $source=@($Receipt.targets|Where-Object {$_.itemId -ceq $row.itemId})
    if($source.Count -ne 1 -or $row.url -cne $source[0].url -or [string]$row.reason -match 'identif.*mismatch|mismatch.*identif'){throw 'Subset Edge row identity mismatch.'}
    $at=[DateTimeOffset]::Parse([string]$row.checkedAt)
    if($at -lt $start -or $at -gt $end){throw 'Subset Edge row time mismatch.'}
    if($row.checkoutDiscountCapturedAt){$at=[DateTimeOffset]::Parse([string]$row.checkoutDiscountCapturedAt);if($at -lt $start -or $at -gt $end){throw 'Subset Edge checkout time mismatch.'}}
  }
}
function New-ModelEdgeMergedPayload($Base,$Receipt,$Edge) {
  $merged=$Base|ConvertTo-Json -Depth 40|ConvertFrom-Json
  $replaced=@();$origins=@()
  foreach($row in @($merged.results)) {
    $replacement=@($Edge.results|Where-Object {$_.itemId -ceq $row.itemId})
    $source=$Base
    if($replacement.Count -eq 1 -and (Test-ModelEdgeVerifiedRow $replacement[0])) {
      $index=[array]::IndexOf($merged.results,$row);$merged.results[$index]=$replacement[0]|ConvertTo-Json -Depth 40|ConvertFrom-Json
      $row=$merged.results[$index];$source=$Edge;$replaced+= [string]$row.itemId
    }
    $origin=[pscustomobject]@{browser=$source.browser;extensionVersion=$source.extensionVersion;runId=$source.runId;checkedAt=$row.checkedAt;startedAt=$source.startedAt;completedAt=$source.completedAt}
    $row|Add-Member collectionSource $origin -Force
    $origins+= [pscustomobject]@{itemId=$row.itemId;browser=$origin.browser;runId=$origin.runId;checkedAt=$row.checkedAt}
  }
  $merged.browser='mixed';$merged.runId=$Receipt.mergedRunId
  $merged.completedAt=if($Edge){$Edge.completedAt}else{$Base.completedAt};$merged.scannedAt=$merged.completedAt
  $merged|Add-Member modelRecovery ([pscustomobject]@{version=1;scope='models';sourceBrowser=$Base.browser;sourceRunId=$Base.runId;sourceHash=$Receipt.baseHash;primaryBrowser=(Get-PrimaryScanBrowser $Base.scanSlot);primaryRunId=$Base.recovery.chromeRunId;edgeRunId=$Receipt.runId;
    attempted=@($Receipt.targets).Count;recovered=$replaced.Count;unresolved=(@($Receipt.targets).Count-$replaced.Count);state=$Receipt.state;replacedItemIds=$replaced;origins=$origins}) -Force
  return $merged
}
function Assert-ModelEdgeComposite($Payload,[string]$Slot,[string]$Folder,[string]$RepoPath) {
  if($Payload.browser -cne 'mixed' -or $Payload.modelRecovery.scope -cne 'models'){throw 'Invalid model recovery composite.'}
  $id=[string]$Payload.modelRecovery.sourceRunId
  $paths=Get-ModelEdgePaths $RepoPath ([pscustomobject]@{scanSlot=$Slot;runId=$id})
  $receipt=Read-ScanRecoveryJson $paths.receipt;$base=Read-ScanRecoveryJson $paths.source
  $catalog=Read-ScanRecoveryJson (Join-Path $Folder 'product-catalog.json')
  Assert-ModelEdgeBase $base $catalog $Slot
  Assert-PrimaryScanSource $base $Slot $Folder $RepoPath
  if(-not $receipt -or $receipt.state -cnotin @('result-ready','failed') -or
    $receipt.scanSlot -cne $Slot -or $receipt.baseRunId -cne $base.runId -or $receipt.mergedRunId -cne $Payload.runId -or
    $receipt.baseHash -cne (Get-FileHash -LiteralPath $paths.source -Algorithm SHA256).Hash.ToLowerInvariant()) {throw 'Composite immutable source/receipt mismatch.'}
  $queue=Read-ScanRecoveryJson (Get-BlueRecoveryQueuePath $RepoPath $base)
  Assert-BlueRecoveryQueue $queue $base
  if($queue.sourceHash -cne $receipt.baseHash -or [DateTimeOffset]::Parse($receipt.triggeredAt) -lt [DateTimeOffset]::Parse($queue.notBefore)){throw 'Recovery precedes the first deployment ten-minute interval.'}
  $eligible=@(Get-ModelEdgeEligibleRows $base @($queue.targetItemIds))
  Assert-ScanCatalog ([pscustomobject]@{products=$eligible}) @($receipt.targets)
  $edge=$null
  if($receipt.state -eq 'result-ready') {
    $edge=Read-ScanRecoveryJson (Get-SavedEdgeRunPath $Folder $receipt.runId)
    Assert-ModelEdgeResult $edge $receipt $base
  }
  $expected=New-ModelEdgeMergedPayload $base $receipt $edge
  if(($Payload|ConvertTo-Json -Depth 40 -Compress) -cne ($expected|ConvertTo-Json -Depth 40 -Compress)){throw 'Composite contains unproven or modified rows.'}
  Assert-ScanCatalog $catalog @($Payload.results)
}
function Invoke-ModelEdgeRecovery([string]$SourcePath,[string]$Slot,[string]$Folder,[string]$RepoPath,$Queue) {
  $base=Read-ScanRecoveryJson $SourcePath
  if(-not (Test-ModelEdgeEnabled $base)){return $SourcePath}
  $catalog=Read-ScanRecoveryJson (Join-Path $Folder 'product-catalog.json')
  Assert-ModelEdgeBase $base $catalog $Slot
  Assert-PrimaryScanSource $base $Slot $Folder $RepoPath
  Assert-BlueRecoveryQueue $Queue $base
  if([DateTimeOffset]::UtcNow -lt [DateTimeOffset]::Parse($Queue.notBefore)){throw 'The first deployment ten-minute interval has not elapsed.'}
  $eligible=@(Get-ModelEdgeEligibleRows $base @($Queue.targetItemIds))
  if(-not $eligible.Count){return $SourcePath}
  $paths=Get-ModelEdgePaths $RepoPath $base
  $mutex=New-Object Threading.Mutex($false,('Local\MarketPulseEdgeHandoff.'+($Slot -replace '[^0-9]','')));$held=$false
  try {
    try{$held=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$held=$true}
    if(-not $held){throw 'Another Edge handoff owns this slot; retry publication without launching another worker.'}
    $full=Read-ScanRecoveryJson (Get-EdgeReceiptPath $RepoPath $Slot)
    if(-not $full -or $full.state -cne 'result-ready' -or $full.runId -cne $base.runId){throw 'Post-publication retry must follow this full Edge recovery.'}
    Assert-EdgeRecoveryResult $base $full @($full.targets)
    $hash=(Get-FileHash -LiteralPath $SourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
    $receipt=Read-ScanRecoveryJson $paths.receipt
    if($receipt) {
      if($receipt.baseHash -cne $hash -or $receipt.baseRunId -cne $base.runId -or $receipt.scanSlot -cne $Slot -or
        $receipt.runId -cnotmatch '^[a-f0-9]{32}$' -or $receipt.mergedRunId -cnotmatch '^[a-f0-9]{32}$' -or $receipt.state -cnotin @('started','result-ready','failed')){throw 'Mismatched model recovery receipt.'}
      if(-not (Test-Path $paths.source) -or (Get-FileHash $paths.source -Algorithm SHA256).Hash.ToLowerInvariant() -cne $hash){throw 'Model recovery source archive changed.'}
      Assert-ScanCatalog ([pscustomobject]@{products=$eligible}) @($receipt.targets)
    } else {
      if([IO.Path]::GetFullPath($SourcePath) -cne [IO.Path]::GetFullPath($paths.source)){
        $tmp=$paths.source+'.tmp';New-Item -ItemType Directory (Split-Path $tmp) -Force|Out-Null
        Copy-Item -LiteralPath $SourcePath -Destination $tmp;Move-Item -LiteralPath $tmp -Destination $paths.source -Force
      }
      $targets=@(foreach($row in $eligible){$t=[ordered]@{};foreach($key in @('brand','mtm','category','srp','enabled','productId','itemId','vendorItemId','url','danawaUrl','enuriUrl')){$t[$key]=$row.PSObject.Properties[$key].Value};[pscustomobject]$t})
      $now=[DateTimeOffset]::UtcNow;$deadline=[DateTimeOffset]::Parse($base.startedAt).AddHours(2)
      foreach($limit in @([DateTimeOffset]::Parse($Slot).AddMinutes(140),$now.AddMinutes(40),[DateTimeOffset]::Parse($base.deadlineAt))){if($limit -lt $deadline){$deadline=$limit}}
      $receipt=[pscustomobject]@{version=1;state='started';scope='models';reason='model-errors';scanSlot=$Slot;runId=[guid]::NewGuid().ToString('N');mergedRunId=[guid]::NewGuid().ToString('N');
        baseRunId=$base.runId;baseHash=$hash;chromeRunId=$base.recovery.chromeRunId;chromeStartedAt=$base.recovery.chromeStartedAt;chromeCompletedAt=$base.recovery.chromeCompletedAt;
        primaryBrowser=(Get-PrimaryScanBrowser $Slot);primaryRequestId=$base.recovery.primaryRequestId;policyId=$base.policyId;triggeredAt=$now.ToString('o');deadlineAt=$deadline.ToString('o');targets=$targets}
      # Persist before launch. An interrupted process never assumes launch failed.
      Write-ModelEdgeJson $paths.receipt $receipt
      try {
        if($deadline -le $now){throw 'collection-budget-exhausted'}
        . (Join-Path $PSScriptRoot 'browser-profile.ps1')
        $exe=@("$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe","${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe","$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe")|Where-Object {Test-Path $_}|Select-Object -First 1
        if(-not $exe){throw 'edge-unavailable'}
        $profiles=@(Get-BrowserExtensionInstallations (Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\User Data') (Join-Path $RepoPath 'chrome-extension'))
        if($profiles.Count -ne 1){throw 'edge-profile-ambiguous'}
        $request=[pscustomobject]@{version=1;browser='edge';scope='models';scanSlot=$Slot;runId=$receipt.runId;products=$targets;recovery=$receipt}
        Write-ModelEdgeJson (Join-Path $RepoPath ('chrome-extension\runtime\model-edge-'+$receipt.runId+'.json')) $request
        $url="chrome-extension://$($profiles[0].Id)/fallback.html?scope=models&slot=$([uri]::EscapeDataString($Slot))&runId=$($receipt.runId)"
        Start-Process -FilePath $exe -ArgumentList @("--profile-directory=`"$($profiles[0].Profile)`"",'--new-window',$url)
        Write-Host "Model Edge recovery started: $($targets.Count) of $(@($base.results).Count); source=$($base.browser)/$($base.runId); edge=$($receipt.runId)."
      } catch {
        $receipt.state='failed';$receipt|Add-Member failureKind 'launch-or-budget-failed' -Force
        Write-ModelEdgeJson $paths.receipt $receipt
      }
    }
    while($receipt.state -eq 'started') {
      $edgePath=Get-SavedEdgeRunPath $Folder $receipt.runId
      $edge=Read-ScanRecoveryJson $edgePath
      if($edge) {Assert-ModelEdgeResult $edge $receipt $base;$receipt.state='result-ready';Write-ModelEdgeJson $paths.receipt $receipt;break}
      $accepted=Read-ScanRecoveryJson (Join-Path $Folder ('model-edge-acceptance-'+$receipt.runId+'.json'))
      if($accepted -and $accepted.scanSlot -ceq $Slot -and $accepted.runId -ceq $receipt.runId -and $accepted.baseHash -ceq $receipt.baseHash -and $accepted.status -eq 'rejected') {
        $receipt.state='failed';$receipt|Add-Member failureKind 'transport-rejected' -Force;Write-ModelEdgeJson $paths.receipt $receipt;break
      }
      if([DateTimeOffset]::UtcNow -ge [DateTimeOffset]::Parse($receipt.deadlineAt)) {
        if($edgePath){throw 'Subset Edge JSON is unreadable; publication integrity cannot be established.'}
        $receipt.state='failed';$receipt|Add-Member failureKind 'timeout' -Force;Write-ModelEdgeJson $paths.receipt $receipt;break
      }
      Start-Sleep -Seconds 5
    }
    $edge=$null
    if($receipt.state -eq 'result-ready'){$edge=Read-ScanRecoveryJson (Get-SavedEdgeRunPath $Folder $receipt.runId);Assert-ModelEdgeResult $edge $receipt $base}
    $merged=New-ModelEdgeMergedPayload $base $receipt $edge
    Write-ModelEdgeJson $paths.merged $merged
    Assert-ModelEdgeComposite $merged $Slot $Folder $RepoPath
    Write-Host "Model Edge merge: attempted=$($merged.modelRecovery.attempted); recovered=$($merged.modelRecovery.recovered); unresolved=$($merged.modelRecovery.unresolved); state=$($receipt.state)."
    return $paths.merged
  } finally {if($held){$mutex.ReleaseMutex()};$mutex.Dispose()}
}
