$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$source=Get-Content -Raw -Encoding UTF8 (Join-Path $repo 'scripts\import-extension-results.ps1')
$start=$source.IndexOf('function Read-Data(')
$end=$source.IndexOf("Invoke-Git -Arguments @('pull'",$start)
if ($start -lt 0 -or $end -le $start) {throw 'Brand helper functions missing.'}
. ([ScriptBlock]::Create($source.Substring($start,$end-$start)))
. (Join-Path $repo 'scripts\brand-lifecycle.ps1')
$RepoPath=Join-Path ([IO.Path]::GetTempPath()) ('market-pulse-brands-'+[guid]::NewGuid())
$scanKst='2026-10-06T16:15:00+09:00'
function Product($brand,$id,$enabled=$true) {
  [pscustomobject]@{brand=$brand;mtm="MODEL$id";productId=$id;itemId=$id;vendorItemId=$id;enabled=$enabled;category='Camera'}
}
function Seed($brand,$id) {
  $slug=Get-BrandSlug $brand
  $path=Join-Path $RepoPath "brand\$slug\market-data.js"
  New-Item -ItemType Directory (Split-Path $path) -Force | Out-Null
  Write-Data $path ([pscustomobject]@{meta=[pscustomobject]@{brand=$brand;snapshotAt='2026-10-06T08:00:00+09:00'};products=@((Product $brand $id))})
  Copy-Item (Join-Path $repo 'brand\acer\index.html') (Join-Path (Split-Path $path) 'index.html')
}
function Must-Fail($block) {
  $failed=$false
  try { & $block } catch { $failed=$true }
  if (-not $failed) {throw 'An inconsistent catalogue was accepted.'}
}
try {
  Seed 'Acer' '1';Seed 'Old Brand' '2'
  $history=Join-Path $RepoPath 'history.csv'
  [IO.File]::WriteAllText($history,'old-brand-history-preserved')
  $catalog=[pscustomobject]@{products=@((Product 'Acer' '1'),(Product 'New Brand' '2'))}
  Assert-ScanCatalog $catalog $catalog.products
  Must-Fail {Assert-ScanCatalog $catalog @((Product 'Acer' '1'),(Product 'Old Brand' '2'))}
  $specs=@(Get-BrandSpecs $catalog $RepoPath)
  if ($specs.Count -ne 3) {throw 'Old and new brand routes were not reconciled.'}
  $old=$specs | Where-Object {$_.Brand -eq 'Old Brand'}
  if ($old.RenamedTo.slug -ne 'new-brand') {throw 'Rename destination missing.'}
  $oldData=Read-Data (Join-Path $RepoPath $old.Path)
  Set-BrandLifecycle $oldData $old $catalog
  if (@($oldData.products).Count -ne 0 -or $oldData.meta.lifecycleStatus -ne 'archived') {throw 'Old brand retained current products.'}
  Write-Data (Join-Path $RepoPath $old.Path) $oldData
  if (-not (Test-Path (Join-Path $RepoPath 'brand\new-brand\index.html'))) {throw 'New route missing.'}
  $again=@(Get-BrandSpecs $catalog $RepoPath) | Where-Object {$_.Brand -eq 'Old Brand'}
  if ($again.RenamedTo.slug -ne 'new-brand') {throw 'Rename destination lost on next scan.'}
  # Same slug, different display name: keep both history labels at the same URL.
  Seed 'Same Brand' '3'
  $same=[pscustomobject]@{products=@((Product 'Same-Brand' '3'))}
  $sameSpec=@(Get-BrandSpecs $same $RepoPath) | Where-Object {$_.Brand -ceq 'Same-Brand'}
  if ('Same Brand' -notin $sameSpec.HistoryBrands -or 'Same-Brand' -notin $sameSpec.HistoryBrands) {throw 'Same-URL rename lost history labels.'}
  $collision=[pscustomobject]@{products=@((Product 'Same Brand' '3'),(Product 'Same-Brand' '4'))}
  Must-Fail {Get-BrandSpecs $collision $RepoPath}
  $empty=[pscustomobject]@{products=@()}
  Assert-ScanCatalog $empty @()
  Must-Fail {Assert-ScanCatalog $null @()}
  Must-Fail {Assert-ScanCatalog $catalog @()}
  Must-Fail {Assert-ScanCatalog ([pscustomobject]@{products=$null}) @()}
  $disabled=[pscustomobject]@{products=@((Product 'Acer' '1' $false))}
  Assert-ScanCatalog $disabled @()
  foreach ($spec in @(Get-BrandSpecs $empty $RepoPath)) {
    $data=Read-Data (Join-Path $RepoPath $spec.Path)
    Set-BrandLifecycle $data $spec $empty
    if (@($data.products).Count -ne 0 -or $data.meta.lifecycleStatus -ne 'archived') {throw 'Last-product removal failed.'}
    if (-not (Test-Path (Join-Path (Split-Path (Join-Path $RepoPath $spec.Path)) 'index.html'))) {throw 'History route removed.'}
  }
  if ([IO.File]::ReadAllText($history) -ne 'old-brand-history-preserved') {throw 'Historical records changed.'}
  Write-Host 'Brand removal, rename, same URL, re-import, zero targets and catalogue mismatch gates passed.'
} finally { Remove-Item -Recurse -Force $RepoPath -ErrorAction SilentlyContinue }
