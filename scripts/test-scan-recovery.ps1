$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'scan-recovery.ps1')
. (Join-Path $PSScriptRoot 'brand-lifecycle.ps1')
function Must-Fail([scriptblock]$Action) { $failed=$false;try {& $Action}catch{$failed=$true};if(-not $failed){throw 'Expected validation failure.'} }
$slot=Get-ScanRecoverySlot
if (-not $slot) {$slot=[DateTimeOffset]::UtcNow.ToOffset([TimeSpan]::FromHours(9)).AddDays(-1).ToString('yyyy-MM-dd')+'T20:00+09:00'}
$start=[DateTimeOffset]::Parse($slot)
$row=[pscustomobject]@{brand='Acer';mtm='Current';enabled=$true;productId='1';itemId='2';vendorItemId='3';url='https://www.coupang.com/vp/products/1?itemId=2&vendorItemId=3'}
$catalog=[pscustomobject]@{products=@($row)}
$w=[pscustomobject]@{version=1;browser='chrome';runId=('a'*32);scanSlot=$slot;startedAt=$start.ToString('o');targetCount=1;targets=@($row)}
Assert-ScanStartWitness $w $slot $catalog
if(Test-ChromeExitRecovery $null $null $true 2){throw 'Missing witness triggered recovery.'}
if(Test-ChromeExitRecovery $w $null $false 2){throw 'Unobserved Chrome triggered recovery.'}
if(Test-ChromeExitRecovery $w $null $true 1){throw 'One absent observation triggered recovery.'}
if(-not(Test-ChromeExitRecovery $w $null $true 2)){throw 'Proven exit failed to recover.'}
$completed=[pscustomobject]@{browser='chrome';runId=$w.runId;scanSlot=$slot;complete=$true}
if(Test-ChromeExitRecovery $w $completed $true 3){throw 'Already completed Chrome triggered recovery.'}
$wrong=$w | ConvertTo-Json -Depth 8 | ConvertFrom-Json;$wrong.scanSlot='2000-01-01T08:00+09:00';Must-Fail {Assert-ScanStartWitness $wrong $slot $catalog}
$wrong=$w | ConvertTo-Json -Depth 8 | ConvertFrom-Json;$wrong.targets+= $wrong.targets[0];$wrong.targetCount=2;Must-Fail {Assert-ScanStartWitness $wrong $slot $catalog}
$changed=[pscustomobject]@{products=@([pscustomobject]@{brand='Acer';mtm='Deleted';productId='4';itemId='5';vendorItemId='6'})}
Must-Fail {Assert-ScanStartWitness $w $slot $changed}
$receipt=[pscustomobject]@{state='started';scanSlot=$slot;runId=('b'*32);chromeRunId=$w.runId;reason='chrome-process-exit';triggeredAt=$start.AddMinutes(3).ToString('o');targets=@($row)}
$resultRow=$row | ConvertTo-Json | ConvertFrom-Json;$resultRow | Add-Member ok $true
$payload=[pscustomobject]@{browser='edge';complete=$true;scanSlot=$slot;runId=$receipt.runId;recovery=[pscustomobject]@{reason=$receipt.reason;chromeRunId=$w.runId};startedAt=$start.AddMinutes(4).ToString('o');targetCount=1;resultCount=1;results=@($resultRow)}
Assert-EdgeRecoveryResult $payload $receipt $receipt.targets
$payload.runId='c'*32;Must-Fail {Assert-EdgeRecoveryResult $payload $receipt $receipt.targets};$payload.runId=$receipt.runId
$payload.startedAt=$start.ToString('o');Must-Fail {Assert-EdgeRecoveryResult $payload $receipt $receipt.targets};$payload.startedAt=$start.AddMinutes(4).ToString('o')
$payload.results[0].ok=$false;Must-Fail {Assert-EdgeRecoveryResult $payload $receipt $receipt.targets};$payload.results[0].ok=$true
$evidence=Get-ScanCollectionEvidence $payload
if ($evidence.browser -ne 'edge' -or $evidence.targetCount -ne 1 -or $evidence.PSObject.Properties['results']) {throw 'Public collection evidence is incorrect or contains raw results.'}
$importSource=Get-Content (Join-Path $PSScriptRoot 'import-extension-results.ps1') -Raw -Encoding UTF8
$textStart=$importSource.IndexOf('$text = @{');$textEnd=$importSource.IndexOf('function Read-Data($path)', $textStart)
function Decode-Utf8([string]$Value) {[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Value))}
. ([ScriptBlock]::Create($importSource.Substring($textStart,$textEnd-$textStart)))
if ($text.Route -notmatch 'Edge' -or @($text.Values | Where-Object {$_ -match 'Chrome'}).Count) {throw 'Edge collection is incorrectly labelled Chrome.'}
$temp=Join-Path ([IO.Path]::GetTempPath()) ('MPRecovery-'+[guid]::NewGuid().ToString('N'))
try {
  $folder=Join-Path $temp 'Downloads';New-Item -ItemType Directory $folder -Force | Out-Null
  $path=Join-Path $temp 'reports\edge-recovery.json'
  Write-ScanRecoveryJson $path $receipt
  if(Get-EdgeRecoveryResultPath $temp $folder $slot){throw 'Pending recovery selected a late Chrome result.'}
  if(Get-EdgeRecoveryResultPath $temp $folder '2000-01-01T08:00+09:00'){throw 'Old recovery selected for another slot.'}
  $receipt.state='result-ready';Write-ScanRecoveryJson $path $receipt
  Write-ScanRecoveryJson (Join-Path $folder "edge-recovery-$($receipt.runId).json") $payload
  $selected=Get-EdgeRecoveryResultPath $temp $folder $slot
  if(-not $selected -or $selected -match 'latest-coupang'){throw 'Recovery file was not pinned.'}
  $receipt.state='failed';Write-ScanRecoveryJson $path $receipt;Must-Fail {Get-EdgeRecoveryResultPath $temp $folder $slot}
  Write-Host 'Process-exit evidence, completed scan exclusion, stale/duplicate/catalogue checks, Edge timing/identity/completeness and pinned publication selection passed.'
} finally {Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue}

# Exercise the real watchdog -> Edge transport -> receipt -> importer selection
# with isolated profile/download files and fake process observations. Never close
# a real browser or navigate to Coupang in this regression test.
$temp=Join-Path ([IO.Path]::GetTempPath()) ('MPRecoveryFlow-'+[guid]::NewGuid().ToString('N'))
$originalProgramFiles=$env:ProgramFiles;$originalLocalAppData=$env:LOCALAPPDATA
$second=[pscustomobject]@{brand='Lenovo';mtm='Second';enabled=$true;productId='4';itemId='5';vendorItemId='6';url='https://www.coupang.com/vp/products/4?itemId=5&vendorItemId=6'}
$catalog.products+= $second;$w.targets+= $second;$w.targetCount=2
$global:RecoveryTestFolder=Join-Path $temp 'Downloads'
$global:RecoveryProcessChecks=0;$global:RecoveryLaunches=0;$global:RecoveryTestSlot=$slot
function Get-Process {
  param($Id,[string]$Name,[string]$ErrorAction)
  if ($Id) {return [pscustomobject]@{SessionId=1}}
  $global:RecoveryProcessChecks++
  if ($global:RecoveryProcessChecks -eq 1) {[pscustomobject]@{SessionId=1;ProcessName='chrome'}}
}
function Start-Sleep { param([int]$Seconds) }
function Start-Process {
  param([string]$FilePath,[string[]]$ArgumentList)
  if ($FilePath -match 'chrome\.exe$') {
    Write-ScanRecoveryJson (Join-Path $global:RecoveryTestFolder 'scan-start.json') $w
    return
  }
  if ($FilePath -notmatch 'msedge\.exe$') {throw 'Unexpected test process.'}
  $global:RecoveryLaunches++
  $url=@($ArgumentList | Where-Object {$_ -match '^chrome-extension://'})[0]
  if (-not $url) {throw 'Missing Edge extension handoff URL.'}
  $query=@{}
  foreach ($pair in ([uri]$url).Query.TrimStart('?').Split('&')) {
    $fields=$pair.Split('=',2);$query[$fields[0]]=[uri]::UnescapeDataString($fields[1])
  }
  $sent=$query.catalog | ConvertFrom-Json;$sent=@($sent);$context=$query.recovery | ConvertFrom-Json
  if ($query.slot -cne $slot -or $sent.Count -ne 2 -or $context.reason -ne 'chrome-process-exit') {throw 'Wrong handoff context.'}
  foreach ($product in $sent) {$product | Add-Member ok $true -Force}
  $edgePayload=[pscustomobject]@{browser='edge';complete=$true;scanSlot=$query.slot;runId=$context.runId;recovery=$context;
    startedAt=[DateTimeOffset]::Parse($context.triggeredAt).AddMilliseconds(1).ToString('o');targetCount=$sent.Count;resultCount=$sent.Count;results=$sent}
  # Simulate a late Chrome result during Edge work; it must not be selected.
  Write-ScanRecoveryJson (Join-Path $global:RecoveryTestFolder 'latest-coupang-scan.json') ([pscustomobject]@{browser='chrome';runId=$w.runId;scanSlot=$slot;complete=$true})
  Write-ScanRecoveryJson (Join-Path $global:RecoveryTestFolder "edge-recovery-$($context.runId).json") $edgePayload
}
try {
  $env:ProgramFiles=$temp;$env:LOCALAPPDATA=$temp
  $scripts=Join-Path $temp 'scripts'
  New-Item -ItemType Directory $scripts,$global:RecoveryTestFolder -Force | Out-Null
  foreach ($name in @('scan-recovery.ps1','brand-lifecycle.ps1','browser-profile.ps1')) {Copy-Item (Join-Path $PSScriptRoot $name) $scripts}
  $edgeSource=Get-Content (Join-Path $PSScriptRoot 'edge-fallback.ps1') -Raw -Encoding UTF8
  $edgeSource=$edgeSource.Replace("`$resultFolder = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads\MarketPulse'",' $resultFolder=$global:RecoveryTestFolder')
  $edgeSource=$edgeSource.Replace('$slot=Get-ScanRecoverySlot','$slot=$global:RecoveryTestSlot')
  $edgeSource | Set-Content (Join-Path $scripts 'edge-fallback.ps1') -Encoding UTF8
  $watchSource=Get-Content (Join-Path $PSScriptRoot 'run-scheduled-scan.ps1') -Raw -Encoding UTF8
  $watchSource=$watchSource.Replace("`$folder=Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads\MarketPulse'",'$folder=$global:RecoveryTestFolder')
  $watchSource=$watchSource.Replace('$slot=Get-ScanRecoverySlot','$slot=$global:RecoveryTestSlot').Replace('if (-not $slot -or ([DateTimeOffset]::UtcNow-[DateTimeOffset]::Parse($slot)).TotalMinutes -gt 75) { exit 0 }','if (-not $slot) { exit 0 }')
  $watchSource | Set-Content (Join-Path $scripts 'run-scheduled-scan.ps1') -Encoding UTF8
  foreach ($exe in @('Google\Chrome\Application\chrome.exe','Microsoft\Edge\Application\msedge.exe')) {
    $path=Join-Path $temp $exe;New-Item -ItemType Directory (Split-Path $path) -Force | Out-Null;New-Item -ItemType File $path | Out-Null
  }
  $profile=Join-Path $temp 'Microsoft\Edge\User Data\Default';New-Item -ItemType Directory $profile -Force | Out-Null
  @{extensions=@{settings=@{('a'*32)=@{path=(Join-Path $temp 'chrome-extension')}}}} | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $profile 'Secure Preferences') -Encoding UTF8
  Write-ScanRecoveryJson (Join-Path $global:RecoveryTestFolder 'product-catalog.json') $catalog
  if ($true) {
    & (Join-Path $scripts 'run-scheduled-scan.ps1') -RepoPath $temp
    $receipt=Read-ScanRecoveryJson (Join-Path $temp 'reports\edge-recovery.json')
    if ($global:RecoveryLaunches -ne 1 -or $receipt.state -ne 'result-ready' -or $receipt.processObservation.absentChecks -ne 2) {Get-Content (Join-Path $temp 'reports\scan-watchdog.log') -ErrorAction SilentlyContinue;throw 'Watchdog did not produce exactly one proven full recollection.'}
    $selected=Get-EdgeRecoveryResultPath $temp $global:RecoveryTestFolder $slot
    if ($selected -match 'latest-coupang' -or -not $selected) {throw 'Late Chrome result overrode the Edge result.'}
    Write-Host 'Isolated watchdog -> Edge launch -> full collection -> pinned receipt -> upload selection passed; no live browser was touched.'
  }
} finally {
  $env:ProgramFiles=$originalProgramFiles;$env:LOCALAPPDATA=$originalLocalAppData
  Remove-Item Function:\Get-Process,Function:\Start-Process,Function:\Start-Sleep -ErrorAction SilentlyContinue
  Remove-Variable RecoveryTestFolder,RecoveryProcessChecks,RecoveryLaunches,RecoveryTestSlot -Scope Global -ErrorAction SilentlyContinue
  Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue
}
