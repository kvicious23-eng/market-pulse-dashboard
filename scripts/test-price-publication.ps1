$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'supplier-daily.ps1')
. (Join-Path $PSScriptRoot 'price-publication.ps1')
$root=Join-Path ([IO.Path]::GetTempPath()) ('MPPublication-'+[guid]::NewGuid().ToString('N'))
function Git-Test([string[]]$a){$null=Invoke-PricePublicationGit $root $a}
try{
 New-Item -ItemType Directory $root,(Join-Path $root 'brand\test'),(Join-Path $root 'dist'),(Join-Path $root 'reports') -Force|Out-Null
 [IO.File]::WriteAllText((Join-Path $root '.gitignore'),'reports/'+[Environment]::NewLine)
 Git-Test @('init','-q');Git-Test @('config','user.name','Audit Test');Git-Test @('config','user.email','audit@example.invalid')
 $brand=Join-Path $root 'brand\test\market-data.js';$history=Join-Path $root 'dist\price-history.js';$csv=Join-Path $root 'reports\my-coupang-price-history.csv'
 Set-Content $brand 'original-price' -Encoding UTF8;Set-Content $history 'original-history' -Encoding UTF8;Set-Content $csv 'original-local-history' -Encoding UTF8
 Git-Test @('add','.');Git-Test @('commit','-qm','baseline')
 $catalog=[pscustomobject]@{products=@([pscustomobject]@{brand='New'})}
 $original=@{};foreach($p in @($brand,$history,$csv)){$original[$p]=(Get-FileHash $p -Algorithm SHA256).Hash}
 Start-PricePublication $root $catalog
 # Inject interruption before commit, including a staged partial brand and new files.
 Set-Content $brand 'partial-price' -Encoding UTF8;Remove-Item $history;Set-Content $csv 'partial-local-history' -Encoding UTF8
 $new=Join-Path $root 'brand\new\market-data.js';New-Item -ItemType Directory (Split-Path $new) -Force|Out-Null;Set-Content $new 'partial-new-brand' -Encoding UTF8
 Git-Test @('add','brand','dist')
 Repair-PricePublication $root
 foreach($p in $original.Keys){if((Get-FileHash $p -Algorithm SHA256).Hash -cne $original[$p]){throw 'Interrupted publication did not restore original outputs'}}
 if(Test-Path $new){throw 'Partial new brand survived rollback'}
 if(@(Invoke-PricePublicationGit $root @('status','--porcelain')).Count){throw 'Interrupted publication left a dirty index/tree'}
 if(Get-PricePublicationJournal $root){throw 'Recovered journal remained active'}
 # A committed result is retained, allowing a subsequent retry to push it.
 Start-PricePublication $root $catalog
 Set-Content $brand 'committed-price' -Encoding UTF8;Set-Content $csv 'committed-local-history' -Encoding UTF8
 Git-Test @('add','brand');Prepare-PricePublicationCommit $root;Git-Test @('commit','-qm','completed-price')
 Repair-PricePublication $root
 if((Get-Content $brand -Raw).Trim() -ne 'committed-price' -or (Get-Content $csv -Raw).Trim() -ne 'committed-local-history'){throw 'A committed result was rolled back'}
 # An unrelated clean HEAD must not silently bless a partial ignored CSV.
 Start-PricePublication $root $catalog
 Set-Content $csv 'partial-uncommitted-history' -Encoding UTF8
 Git-Test @('commit','--allow-empty','-qm','unrelated-head')
 $failed=$false;try{Repair-PricePublication $root}catch{$failed=$true}
 if(-not $failed -or -not(Get-PricePublicationJournal $root) -or (Get-Content $csv -Raw).Trim() -ne 'partial-uncommitted-history'){throw 'Unrelated HEAD erased recovery evidence'}
 $j=Get-PricePublicationJournal $root
 Git-Test @('reset','--soft',$j.baseCommit);Repair-PricePublication $root
 # A prepared tree must match both committed outputs and ignored local history.
 foreach($mutation in @('committed-output','local-history')){
  Start-PricePublication $root $catalog
  Set-Content $brand ('ready-'+$mutation) -Encoding UTF8;Set-Content $csv 'prepared-history' -Encoding UTF8
  Git-Test @('add','brand');Prepare-PricePublicationCommit $root;Git-Test @('commit','-qm','prepared-price')
  if($mutation -eq 'committed-output'){Set-Content $brand 'external-price' -Encoding UTF8;Git-Test @('add','brand');Git-Test @('commit','-qm','external-price')}
  else{Set-Content $csv 'external-history' -Encoding UTF8}
  $failed=$false;try{Repair-PricePublication $root}catch{$failed=$true}
  if(-not $failed -or -not(Get-PricePublicationJournal $root)){throw ('Unverified prepared result admitted: '+$mutation)}
  $j=Get-PricePublicationJournal $root;Git-Test @('reset','--hard',$j.baseCommit);Repair-PricePublication $root
 }
 # Corrupt backup evidence must never overwrite current files.
 Start-PricePublication $root $catalog
 $j=Get-PricePublicationJournal $root;$backup=Join-Path $root ('reports\price-publication-backup-'+$j.id)
 $index=0;for($i=0;$i -lt $j.files.Count;$i++){if($j.files[$i].existed){$index=$i;break}}
 Set-Content (Join-Path $backup ($index.ToString()+'.bak')) 'corrupt-backup' -Encoding UTF8
 Set-Content $brand 'uncommitted-price' -Encoding UTF8;$before=(Get-FileHash $brand -Algorithm SHA256).Hash;$failed=$false
 try{Repair-PricePublication $root}catch{$failed=$true}
 if(-not $failed -or (Get-FileHash $brand -Algorithm SHA256).Hash -cne $before -or -not(Get-PricePublicationJournal $root)){throw 'Corrupt backup was used or recovery evidence was lost'}
 $path=Join-Path $root 'reports\price-publication-transaction.json';$j.files[0].relative='../outside.txt';Write-ScanRecoveryJson $path $j;$failed=$false
 try{Get-PricePublicationJournal $root|Out-Null}catch{$failed=$true}
 if(-not $failed){throw 'Recovery path escaped the owned price/history outputs'}
 $j.files=@();Write-ScanRecoveryJson $path $j;$failed=$false
 try{Repair-PricePublication $root}catch{$failed=$true}
 if(-not $failed -or (Get-FileHash $brand -Algorithm SHA256).Hash -cne $before){throw 'Empty recovery paths changed publication outputs/index'}
 Write-Host 'Interrupted/staged publication rollback, new-file cleanup, ignored history recovery, committed-result retention and corrupt/path evidence guards passed.'
}finally{Remove-Item $root -Recurse -Force -ErrorAction SilentlyContinue}
