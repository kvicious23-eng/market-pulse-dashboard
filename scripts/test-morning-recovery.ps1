$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'supplier-daily.ps1')
function Check($Value,[string]$Message) {if(-not $Value){throw $Message}}
$temp=Join-Path ([IO.Path]::GetTempPath()) ('MPMorning-'+[guid]::NewGuid().ToString('N'))
$folder=Join-Path $temp 'Downloads';New-Item -ItemType Directory $folder -Force | Out-Null
try {
  $day=[datetime]'2026-10-08';$now=[DateTimeOffset]'2026-10-08T08:45:00+09:00';$slot='2026-10-08T08:00+09:00'
  $target=[pscustomobject]@{brand='Example';mtm='Current';productId='1';itemId='2';vendorItemId='3';enabled=$true}
  $catalog=[pscustomobject]@{products=@($target)};Save-SupplierLocalState (Join-Path $folder 'product-catalog.json') $catalog
  $row=$target | ConvertTo-Json | ConvertFrom-Json;$row | Add-Member ok $true
  $chrome=[pscustomobject]@{version=5;browser='chrome';runId=('a'*32);scanSlot=$slot;startedAt='2026-10-08T08:00:00+09:00';completedAt='2026-10-08T08:15:00+09:00';complete=$true;targetCount=1;resultCount=1;results=@($row)}
  $latest=Join-Path $folder 'latest-coupang-scan.json';Save-SupplierLocalState $latest $chrome
  $signal=Get-SupplierMorningSignal $folder $day $now $temp
  Check ($signal.version -eq 2 -and $signal.source -eq 'chrome') 'Normal Chrome morning completion rejected.'
  $chrome.results[0].ok=$false;Save-SupplierLocalState $latest $chrome
  Check ($null -eq (Get-SupplierMorningSignal $folder $day $now $temp)) 'Blocked Chrome prematurely started CSV.'
  $receipt=[pscustomobject]@{version=1;state='started';reason='access-check';runId=('b'*32);chromeRunId=$chrome.runId;scanSlot=$slot;triggeredAt='2026-10-08T08:30:00+09:00';targets=@($target)}
  $receiptPath=Join-Path $temp 'reports\edge-recovery.json';Save-SupplierLocalState $receiptPath $receipt
  $row.ok=$true;$edge=[pscustomobject]@{version=5;browser='edge';runId=$receipt.runId;recovery=[pscustomobject]@{reason=$receipt.reason;chromeRunId=$chrome.runId};scanSlot=$slot;startedAt='2026-10-08T08:30:01+09:00';completedAt='2026-10-08T08:40:00+09:00';complete=$true;targetCount=1;resultCount=1;results=@($row)}
  $edgePath=Join-Path $folder "edge-recovery-$($receipt.runId).json";Save-SupplierLocalState $edgePath $edge
  Check ($null -eq (Get-SupplierMorningSignal $folder $day $now $temp)) 'Pending receipt accepted.'
  $receipt.state='result-ready';Save-SupplierLocalState $receiptPath $receipt
  $signal=Get-SupplierMorningSignal $folder $day $now $temp
  Check ($signal.ready -and $signal.source -eq 'edge' -and $signal.runId -eq $edge.runId) 'Correlated access Edge result did not start CSV.'
  # Even a late successful Chrome file cannot supersede the validated Edge run.
  $chrome.results[0].ok=$true;Save-SupplierLocalState $latest $chrome
  Check ((Get-SupplierMorningSignal $folder $day $now $temp).source -eq 'edge') 'Late Chrome superseded pinned Edge signal.'
  $receipt.reason='chrome-process-exit';$edge.recovery.reason=$receipt.reason;Save-SupplierLocalState $receiptPath $receipt;Save-SupplierLocalState $edgePath $edge
  Check ((Get-SupplierMorningSignal $folder $day $now $temp).source -eq 'edge') 'Process-exit Edge completion rejected.'
  $edge.complete=$false;Save-SupplierLocalState $edgePath $edge;Check ($null -eq (Get-SupplierMorningSignal $folder $day $now $temp)) 'Partial Edge accepted.';$edge.complete=$true
  $edge.results[0].mtm='Unexpected';Save-SupplierLocalState $edgePath $edge;Check ($null -eq (Get-SupplierMorningSignal $folder $day $now $temp)) 'Wrong Edge list accepted.';$edge.results[0].mtm='Current'
  $edge.results[0].ok=$false;Save-SupplierLocalState $edgePath $edge;Check ($null -eq (Get-SupplierMorningSignal $folder $day $now $temp)) 'Failed Edge product accepted.';$edge.results[0].ok=$true
  $edge.runId='c'*32;Save-SupplierLocalState $edgePath $edge;Check ($null -eq (Get-SupplierMorningSignal $folder $day $now $temp)) 'Uncorrelated Edge accepted.';$edge.runId=$receipt.runId
  $edge.completedAt='2026-10-08T09:50:00+09:00';Save-SupplierLocalState $edgePath $edge;Check ($null -eq (Get-SupplierMorningSignal $folder $day $now $temp)) 'Future completion accepted.';$edge.completedAt='2026-10-08T08:40:00+09:00';Save-SupplierLocalState $edgePath $edge
  $catalog.products[0].mtm='Changed';Save-SupplierLocalState (Join-Path $folder 'product-catalog.json') $catalog;Check ($null -eq (Get-SupplierMorningSignal $folder $day $now $temp)) 'Edited catalogue accepted.';$catalog.products[0].mtm='Current';Save-SupplierLocalState (Join-Path $folder 'product-catalog.json') $catalog
  $receipt.state='failed';Save-SupplierLocalState $receiptPath $receipt;Check ($null -eq (Get-SupplierMorningSignal $folder $day $now $temp)) 'Failed receipt accepted.'
  Remove-Item $receiptPath;Save-SupplierLocalState $latest $edge;Check ($null -eq (Get-SupplierMorningSignal $folder $day $now $temp)) 'Independent Edge started CSV.'
  $chrome.scanSlot='2026-10-08T12:00+09:00';Save-SupplierLocalState $latest $chrome;Check ($null -eq (Get-SupplierMorningSignal $folder $day $now $temp)) 'Noon scan started CSV.'
  # Exercise Chrome resume with isolated profile metadata and a fake launcher.
  $receipt.state='result-ready';Save-SupplierLocalState $receiptPath $receipt
  . (Join-Path $PSScriptRoot 'browser-profile.ps1')
  $originalLocalAppData=$env:LOCALAPPDATA;$originalProgramFiles=$env:ProgramFiles
  $global:MorningResumeLaunches=0
  function Start-Process {
    param([string]$FilePath,[string[]]$ArgumentList)
    if ($FilePath -notmatch 'chrome\.exe$' -or ($ArgumentList -join ' ') -notmatch 'daily-resume.html') {throw 'Wrong Supplier resume launcher.'}
    if (($ArgumentList -join ' ') -notmatch '--profile-directory="Default"') {throw 'Resume changed Chrome profile.'}
    $global:MorningResumeLaunches++
  }
  try {
    $env:LOCALAPPDATA=$temp;$env:ProgramFiles=$temp
    $profile=Join-Path $temp 'Google\Chrome\User Data\Default';New-Item -ItemType Directory $profile -Force | Out-Null
    $exe=Join-Path $temp 'Google\Chrome\Application\chrome.exe';New-Item -ItemType Directory (Split-Path $exe) -Force | Out-Null;New-Item -ItemType File $exe | Out-Null
    @{extensions=@{settings=@{('a'*32)=@{path=(Join-Path $temp 'chrome-extension')};'djmlkkflbncanonpjhkdhghjmcompjnp'=@{path=(Join-Path $temp 'supplier-hub-extension')}}}} | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $profile 'Secure Preferences') -Encoding UTF8
    $source=Get-Content (Join-Path $PSScriptRoot 'supplier-after-edge.ps1') -Raw -Encoding UTF8
    $source=$source -replace '(?m)^\. \(Join-Path \$PSScriptRoot [^\r\n]+\r?\n',''
    $source=$source.Replace('$now=[TimeZoneInfo]::ConvertTime([DateTimeOffset]::UtcNow,$zone)',"`$now=[DateTimeOffset]'2026-10-08T08:45:00+09:00'")
    $resume=[ScriptBlock]::Create($source)
    & $resume -RepoPath $temp -ResultFolder $folder
    & $resume -RepoPath $temp -ResultFolder $folder
    Check ($global:MorningResumeLaunches -eq 1) 'Repeated Edge result launched duplicate Supplier resume.'
    Check ((Read-SupplierLocalState (Join-Path $temp 'reports\supplier-morning-signal.json')).source -eq 'edge') 'Validated Edge signal was not persisted.'
    Check ((Read-ScanRecoveryJson $receiptPath).state -eq 'result-ready') 'Supplier resume damaged price recovery.'
  } finally {
    $env:LOCALAPPDATA=$originalLocalAppData;$env:ProgramFiles=$originalProgramFiles
    Remove-Item Function:\Start-Process -ErrorAction SilentlyContinue
    Remove-Variable MorningResumeLaunches -Scope Global -ErrorAction SilentlyContinue
  }
  Write-Host 'Chrome success/blocked, correlated access/exit Edge, pending/failed/stale/partial/wrong-list/noon/independent Edge and current catalogue morning gates passed.'
} finally {Remove-Item $temp -Recurse -Force}
