# Recover only this publisher's price/history outputs, under the shared repo lock.
function Invoke-PricePublicationGit([string]$RepoPath,[string[]]$Arguments) {
 $r=Invoke-MarketPulseGit -RepoPath $RepoPath -Arguments $Arguments
 if($r.Code -ne 0){throw 'Price publication Git state cannot be verified'}
 $r.Output
}
function Get-PricePublicationJournal([string]$RepoPath) {
 $path=Join-Path $RepoPath 'reports\price-publication-transaction.json'
 if(-not(Test-Path -LiteralPath $path)){return $null}
 $j=Read-ScanRecoveryJson $path
 if(-not $j -or $j.version -ne 1 -or $j.id -cnotmatch '^[a-f0-9]{32}$' -or $j.baseCommit -cnotmatch '^[a-f0-9]{40}$' -or $j.files -isnot [array] -or $j.files.Count -lt 4){throw 'Corrupt price publication journal'}
 foreach($required in @('dist/price-history.js','dist/competitor-price-history.js','reports/my-coupang-price-history.csv','reports/competitor-price-history.csv')){if($required -cnotin $j.files.relative){throw 'Incomplete price publication recovery paths'}}
 foreach($f in $j.files){
  if($f.existed -isnot [bool] -or $f.relative -isnot [string] -or $f.relative -cnotmatch '^(?:brand/[\p{L}\p{Nd}_-]+/(?:market-data\.js|index\.html)|dist/(?:price-history|competitor-price-history)\.js|reports/(?:my-coupang-price-history|competitor-price-history)\.csv)$' -or
   ($f.existed -and $f.hash -cnotmatch '^[a-f0-9]{64}$')){throw 'Unsafe price publication recovery path/hash'}
 }
 if(@($j.files.relative|Sort-Object -Unique).Count -ne $j.files.Count){throw 'Duplicate price publication recovery path'}
 $j
}
function Complete-PricePublication([string]$RepoPath) {
 $j=Get-PricePublicationJournal $RepoPath
 if(-not $j){return}
 Remove-Item -LiteralPath (Join-Path $RepoPath 'reports\price-publication-transaction.json') -Force
 Remove-Item -LiteralPath (Join-Path $RepoPath ('reports\price-publication-backup-'+$j.id)) -Recurse -Force -ErrorAction SilentlyContinue
}
function Repair-PricePublication([string]$RepoPath) {
 if(-not(Test-Path (Join-Path $RepoPath 'reports\price-publication-transaction.json'))){return}
 $lock=Enter-MarketPulseRepositoryLock $RepoPath
 try{
  $j=Get-PricePublicationJournal $RepoPath;if(-not $j){return}
  $head=[string]@(Invoke-PricePublicationGit $RepoPath @('rev-parse','HEAD'))[0]
  if($head -cne $j.baseCommit){
   if(@(Invoke-PricePublicationGit $RepoPath @('status','--porcelain')).Count){throw 'Publication HEAD changed with unresolved edits; preserve recovery evidence for review'}
   Complete-PricePublication $RepoPath;return
  }
  $backup=Join-Path $RepoPath ('reports\price-publication-backup-'+$j.id)
  # Validate every backup before restoring anything.
  for($i=0;$i -lt $j.files.Count;$i++){
   $f=$j.files[$i];$saved=Join-Path $backup ($i.ToString()+'.bak')
   if($f.existed -and (-not(Test-Path -LiteralPath $saved) -or (Get-FileHash -LiteralPath $saved -Algorithm SHA256).Hash.ToLowerInvariant() -cne $f.hash)){throw 'Price publication backup integrity failure'}
  }
  $null=Invoke-PricePublicationGit $RepoPath (@('reset','-q','HEAD','--')+@($j.files.relative))
  for($i=0;$i -lt $j.files.Count;$i++){
   $f=$j.files[$i];$path=Join-Path $RepoPath $f.relative
   if($f.existed){New-Item -ItemType Directory (Split-Path $path) -Force|Out-Null;Copy-Item -LiteralPath (Join-Path $backup ($i.ToString()+'.bak')) -Destination $path -Force}
   elseif(Test-Path -LiteralPath $path){Remove-Item -LiteralPath $path -Force}
  }
  Complete-PricePublication $RepoPath
 }finally{$lock.ReleaseMutex();$lock.Dispose()}
}
function Start-PricePublication([string]$RepoPath,$Catalog) {
 if(Test-Path (Join-Path $RepoPath 'reports\price-publication-transaction.json')){throw 'Previous price publication must be recovered first'}
 $head=[string]@(Invoke-PricePublicationGit $RepoPath @('rev-parse','HEAD'))[0]
 if($head -cnotmatch '^[a-f0-9]{40}$'){throw 'Missing publication baseline commit'}
 $relative=@('dist/price-history.js','dist/competitor-price-history.js','reports/my-coupang-price-history.csv','reports/competitor-price-history.csv')
 $brands=@(Get-ChildItem (Join-Path $RepoPath 'brand') -Directory -ErrorAction SilentlyContinue|ForEach-Object {$_.Name})
 $brands+=@($Catalog.products|Where-Object {$_.brand}|ForEach-Object {(([string]$_.brand).Trim().ToLowerInvariant() -replace '[^\p{L}\p{Nd}]+','-').Trim('-')})
 foreach($brand in @($brands|Sort-Object -Unique)){$relative+=@(('brand/'+$brand+'/market-data.js'),('brand/'+$brand+'/index.html'))}
 $id=[guid]::NewGuid().ToString('N');$backup=Join-Path $RepoPath ('reports\price-publication-backup-'+$id)
 New-Item -ItemType Directory $backup -Force|Out-Null
 $files=@()
 foreach($rel in @($relative|Sort-Object -Unique)){
  $path=Join-Path $RepoPath $rel;$exists=Test-Path -LiteralPath $path;$hash=$null
  if($exists){Copy-Item -LiteralPath $path -Destination (Join-Path $backup ($files.Count.ToString()+'.bak'));$hash=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()}
  $files+=@([pscustomobject]@{relative=$rel;existed=[bool]$exists;hash=$hash})
 }
 Write-ScanRecoveryJson (Join-Path $RepoPath 'reports\price-publication-transaction.json') ([pscustomobject]@{version=1;id=$id;baseCommit=$head;createdAt=[DateTimeOffset]::UtcNow.ToString('o');files=$files})
 $null=Get-PricePublicationJournal $RepoPath
}
