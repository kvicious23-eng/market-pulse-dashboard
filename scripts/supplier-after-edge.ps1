param([string]$RepoPath='C:\MarketPulse',[string]$ResultFolder=(Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads\MarketPulse'))
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'supplier-daily.ps1')
. (Join-Path $PSScriptRoot 'browser-profile.ps1')
$log=Join-Path $RepoPath 'reports\supplier-edge-resume.log'
try {
  $zone=[TimeZoneInfo]::FindSystemTimeZoneById('Korea Standard Time')
  $now=[TimeZoneInfo]::ConvertTime([DateTimeOffset]::UtcNow,$zone)
  $signal=Get-SupplierMorningSignal $ResultFolder $now.Date $now $RepoPath
  if (-not $signal -or $signal.source -ne 'edge') { return }
  Save-SupplierLocalState (Join-Path $RepoPath 'reports\supplier-morning-signal.json') $signal
  $receiptPath=Join-Path $RepoPath 'reports\edge-recovery.json'
  $receipt=Read-ScanRecoveryJson $receiptPath
  if ($receipt.supplierResumeLaunchedAt) {return}
  $root=Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data'
  $prices=@(Get-BrowserExtensionInstallations $root (Join-Path $RepoPath 'chrome-extension'))
  $suppliers=@(Get-BrowserExtensionInstallations $root (Join-Path $RepoPath 'supplier-hub-extension') | Where-Object {$_.Id -ceq 'djmlkkflbncanonpjhkdhghjmcompjnp'})
  $pairs=@(foreach($price in $prices) {foreach($supplier in $suppliers) {if($price.Profile -ceq $supplier.Profile) {$price}}})
  if ($pairs.Count -ne 1) {throw 'Exactly one Chrome profile with both enabled Market Pulse extensions is required.'}
  $chrome=@("$env:ProgramFiles\Google\Chrome\Application\chrome.exe","${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe","$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object {Test-Path -LiteralPath $_} | Select-Object -First 1
  if (-not $chrome) {throw 'Chrome installation missing.'}
  $url='chrome-extension://djmlkkflbncanonpjhkdhghjmcompjnp/daily-resume.html?slot='+[uri]::EscapeDataString($signal.scanSlot)+'&runId='+$signal.runId+'&priceId='+$pairs[0].Id
  Start-Process -FilePath $chrome -ArgumentList @("--profile-directory=`"$($pairs[0].Profile)`"",'--new-window',$url)
  $receipt | Add-Member -NotePropertyName supplierResumeLaunchedAt -NotePropertyValue $now.ToString('o') -Force
  Write-ScanRecoveryJson $receiptPath $receipt
  Add-Content -LiteralPath $log -Encoding UTF8 -Value "$($now.ToString('o')) Edge morning signal validated; Chrome Supplier resume launched. Authentication/CSV completion is not yet confirmed."
} catch {
  New-Item -ItemType Directory (Split-Path $log) -Force | Out-Null
  Add-Content -LiteralPath $log -Encoding UTF8 -Value "$([DateTimeOffset]::UtcNow.ToString('o')) Supplier resume failed: $($_.Exception.Message)"
  throw
}
