# Catalogue reconciliation only; public and local history rows are never renamed or deleted.
function Assert-ScanCatalog($Catalog,$Results) {
  $rows=@($Results)
  if (-not $Catalog -or $null -eq $Catalog.PSObject.Properties['products']) {
    if ($rows.Count -eq 0) { throw 'An empty scan requires a saved product catalogue.' }
    return
  }
  if ($null -eq $Catalog.products) { throw 'Saved catalogue products must be an array, not null.' }
  $active=@($Catalog.products | Where-Object { $_.enabled -ne $false })
  $expected=@($active | ForEach-Object { "$(($_.brand).Trim())|$(($_.mtm).Trim())|$($_.productId)|$($_.itemId)|$($_.vendorItemId)" } | Sort-Object)
  $actual=@($rows | ForEach-Object { "$(($_.brand).Trim())|$(($_.mtm).Trim())|$($_.productId)|$($_.itemId)|$($_.vendorItemId)" } | Sort-Object)
  if ($expected.Count -ne $actual.Count -or ($expected -join "`n") -cne ($actual -join "`n")) {
    throw 'Scan/catalogue mismatch: save the catalogue and complete a new scan before publication.'
  }
}

function Get-BrandSpecs($Catalog,[string]$RepositoryPath) {
  $bySlug=@{}
  $brandRoot=Join-Path $RepositoryPath 'brand'
  if (Test-Path $brandRoot) {
    foreach ($directory in @(Get-ChildItem $brandRoot -Directory)) {
      $dataPath=Join-Path $directory.FullName 'market-data.js'
      if (-not (Test-Path $dataPath)) { continue }
      $existing=Read-Data $dataPath
      $brand=if($existing.meta.brand){[string]$existing.meta.brand}else{$directory.Name}
      $bySlug[$directory.Name]=@{Brand=$brand;Path="brand\$($directory.Name)\market-data.js";HistoryBrands=@($existing.meta.historyBrands)+@($brand);RenamedTo=$existing.meta.renamedTo;Existing=$existing}
    }
  }
  if ($Catalog) {
    $owners=@{}
    foreach ($brand in @($Catalog.products | Where-Object {$_.brand} | ForEach-Object {[string]$_.brand.Trim()} | Sort-Object -Unique)) {
      $slug=Get-BrandSlug $brand
      if ($owners.ContainsKey($slug) -and $owners[$slug] -cne $brand) { throw 'Brand URL names collide.' }
      $owners[$slug]=$brand
      $previous=$bySlug[$slug]
      $path="brand\$slug\market-data.js"
      $fullPath=Join-Path $RepositoryPath $path
      $category=@($Catalog.products | Where-Object {$_.brand -ceq $brand -and $_.enabled -ne $false} | ForEach-Object {$_.category} | Sort-Object -Unique)
      if (-not (Test-Path (Join-Path (Split-Path $fullPath) 'index.html')) -or ($previous -and $previous.Brand -cne $brand)) {
        New-BrandDashboard $brand $fullPath $(if($category.Count -eq 1){[string]$category[0]}else{'Products'})
      }
      $bySlug[$slug]=@{Brand=$brand;Path=$path;HistoryBrands=@($previous.HistoryBrands)+@($brand);RenamedTo=$null;Existing=$previous.Existing}
    }
    # A complete move of the old catalogue identifies a rename; deleted products
    # alone cannot invent a destination. Retain this hint after old products are cleared.
    foreach ($slug in @($bySlug.Keys)) {
      if ($owners.ContainsKey($slug)) { continue }
      $spec=$bySlug[$slug]
      $old=@($spec.Existing.products)
      if ($old.Count -eq 0) { continue }
      $destinations=@()
      foreach ($product in $old) {
        $match=@($Catalog.products | Where-Object { $_.enabled -ne $false -and [string]$_.itemId -eq [string]$product.itemId -and [string]$_.productId -eq [string]$product.productId -and [string]$_.vendorItemId -eq [string]$product.vendorItemId })
        if ($match.Count -eq 1) { $destinations+= [string]$match[0].brand }
      }
      $unique=@($destinations | Sort-Object -Unique)
      if ($destinations.Count -eq $old.Count -and $unique.Count -eq 1) {
        $spec.RenamedTo=[pscustomobject]@{brand=$unique[0];slug=(Get-BrandSlug $unique[0])}
      }
    }
  }
  foreach ($slug in @($bySlug.Keys | Sort-Object)) { $bySlug[$slug] }
}

function Set-BrandLifecycle($Data,$Spec,$Catalog) {
  if (-not $Catalog) { return }
  $ids=@($Catalog.products | Where-Object {$_.brand -ceq $Spec.Brand -and $_.enabled -ne $false} | ForEach-Object {[string]$_.itemId})
  $Data.products=@($Data.products | Where-Object {$ids -contains [string]$_.itemId})
  $Data.meta | Add-Member -NotePropertyName historyBrands -NotePropertyValue @($Spec.HistoryBrands | Where-Object {$_} | Sort-Object -Unique) -Force
  $Data.meta | Add-Member -NotePropertyName lifecycleStatus -NotePropertyValue $(if(@($Data.products).Count){'active'}else{'archived'}) -Force
  $Data.meta | Add-Member -NotePropertyName renamedTo -NotePropertyValue $Spec.RenamedTo -Force
}
