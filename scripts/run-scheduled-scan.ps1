param([string]$RepoPath='C:\MarketPulse',[int]$MonitorMinutes=75)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'scan-recovery.ps1')
. (Join-Path $PSScriptRoot 'brand-lifecycle.ps1')
. (Join-Path $PSScriptRoot 'browser-profile.ps1')
$slot=Get-ScanRecoverySlot
if (-not $slot -or ([DateTimeOffset]::UtcNow-[DateTimeOffset]::Parse($slot)).TotalMinutes -gt 75) { exit 0 }
$folder=Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads\MarketPulse'
$log=Join-Path $RepoPath 'reports\scan-watchdog.log'
New-Item -ItemType Directory -Path (Split-Path $log) -Force | Out-Null
function Write-WatchLog([string]$Message) { Add-Content $log -Encoding UTF8 -Value "[$([DateTimeOffset]::Now.ToString('o'))] $Message" }
$mutex=New-Object Threading.Mutex($false,('Local\MarketPulseScanWatch-'+($slot -replace '[^0-9]','')))
$locked=$false
try {
  try { $locked=$mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $locked=$true }
  if (-not $locked) { exit 0 }
  $primaryBrowser=Get-PrimaryScanBrowser $slot
  $chrome=@("$env:ProgramFiles\Google\Chrome\Application\chrome.exe","${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe","$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object {Test-Path $_} | Select-Object -First 1
  if($primaryBrowser -eq 'whale') {
    $chrome=@("$env:ProgramFiles\Naver\Naver Whale\Application\whale.exe","${env:ProgramFiles(x86)}\Naver\Naver Whale\Application\whale.exe","$env:LOCALAPPDATA\Naver\Naver Whale\Application\whale.exe")|Where-Object {Test-Path $_}|Select-Object -First 1
    if(-not $chrome){throw 'Whale is not installed; no silent Chrome duplicate.'}
    $profiles=@(Get-BrowserExtensionInstallations (Join-Path $env:LOCALAPPDATA 'Naver\Naver Whale\User Data') (Join-Path $RepoPath 'chrome-extension'))
    if($profiles.Count -ne 1){throw 'Exactly one eligible Whale scanner profile is required.'}
    $catalog=Read-ScanRecoveryJson (Join-Path $folder 'product-catalog.json')
    $targets=@($catalog.products|Where-Object {$_.enabled -ne $false}|Select-Object brand,mtm,category,srp,enabled,productId,itemId,vendorItemId,url,danawaUrl,enuriUrl)
    $requestPath=Join-Path $RepoPath 'reports\whale-primary-request.json'
    $request=Read-ScanRecoveryJson $requestPath
    if(-not $request -or $request.scanSlot -cne $slot) {
      $request=[pscustomobject]@{version=1;browser='whale';scanSlot=$slot;requestId=[guid]::NewGuid().ToString('N');requestedAt=[DateTimeOffset]::UtcNow.ToString('o');targets=$targets}
      Assert-WhalePrimaryRequest $request $slot $catalog
      Write-ScanRecoveryJson $requestPath $request
    } else {Assert-WhalePrimaryRequest $request $slot $catalog}
    if(Get-SavedPrimaryResultPath $folder $slot $RepoPath){Write-WatchLog "Slot=$slot; Whale already completed; duplicate skipped.";exit 0}
    # Keep the command URL short: Whale silently drops the full-catalog URL.
    Write-ScanRecoveryJson (Join-Path $RepoPath 'chrome-extension\runtime\noon-request.json') $request
    $url="chrome-extension://$($profiles[0].Id)/primary.html?slot=$([uri]::EscapeDataString($slot))&requestId=$($request.requestId)"
    Start-Process $chrome -ArgumentList @("--profile-directory=`"$($profiles[0].Profile)`"",'--new-window',$url)
  } else {
    if (-not $chrome) { throw 'Google Chrome is not installed.' }
    Start-Process $chrome -ArgumentList '--no-first-run --new-window "chrome://newtab/"'
  }
  Write-WatchLog "Slot=$slot; $primaryBrowser launched; waiting for the extension start witness."
  $seen=$false;$absent=0
  $launchAt=[DateTime]::UtcNow
  $session=(Get-Process -Id $PID).SessionId
  $deadline=[DateTime]::UtcNow.AddMinutes($MonitorMinutes)
  while ([DateTime]::UtcNow -lt $deadline) {
    $receipt=Read-ScanRecoveryJson (Join-Path $RepoPath 'reports\edge-recovery.json')
    if ($receipt -and $receipt.scanSlot -ceq $slot) { Write-WatchLog "Slot=$slot; existing recovery state=$($receipt.state); no second handoff.";exit 0 }
    $alive=@(Get-Process -ErrorAction Stop | Where-Object {$_.ProcessName -eq $primaryBrowser -and $_.SessionId -eq $session}).Count -gt 0
    if ($alive) {$seen=$true;$absent=0} elseif($seen) {$absent++}
    Invoke-ScanSaveRecovery $RepoPath $folder $slot
    $witnessName=if($primaryBrowser -eq 'whale'){'whale-scan-start.json'}else{'scan-start.json'}
    $witness=Read-ScanRecoveryJson (Join-Path $folder $witnessName)
    if ($witness -and $witness.scanSlot -ceq $slot) {
      $completedPath=Get-SavedPrimaryResultPath $folder $slot $RepoPath
      $completed=Read-ScanRecoveryJson $completedPath
      if ($completed -and $completed.browser -eq $primaryBrowser -and $completed.runId -ceq $witness.runId -and $completed.complete -eq $true) {
        Write-WatchLog "Slot=$slot; $primaryBrowser completed and saved JSON; watchdog finished.";exit 0
      }
      if (Test-ChromeExitRecovery $witness $completed $seen $absent) {
        $catalog=Read-ScanRecoveryJson (Join-Path $folder 'product-catalog.json')
        Assert-ScanStartWitness $witness $slot $catalog $primaryBrowser
        if($primaryBrowser -eq 'whale' -and $witness.primaryRequestId -cne $request.requestId){throw 'Whale witness request mismatch.'}
        $proof=[pscustomobject]@{chromeSeen=$seen;absentChecks=$absent;observedAt=[DateTimeOffset]::UtcNow.ToString('o')}
        Write-WatchLog "Slot=$slot; start witness confirmed; $primaryBrowser absent on $absent consecutive checks; exit cause unknown; requesting full Edge recollection."
        & (Join-Path $PSScriptRoot 'edge-fallback.ps1') -RepoPath $RepoPath -StartWitness $witness -ExitProof $proof -PrimaryBrowser $primaryBrowser
        exit 0
      }
    }
    if($primaryBrowser -eq 'whale') {
      $accepted=Read-ScanRecoveryJson (Join-Path $folder 'whale-primary-acceptance.json')
      Assert-WhalePrimaryStarted $accepted $witness $request $launchAt
    }
    Start-Sleep -Seconds 10
  }
  Write-WatchLog "Slot=$slot; monitor timed out; no proven process-exit handoff. Missing JSON alone is not an access-check or shutdown diagnosis."
  exit 1
} catch {
  Write-WatchLog "Slot=$slot; failed: $($_.Exception.Message)"
  Write-Error $_;exit 1
} finally {if($locked){$mutex.ReleaseMutex()};$mutex.Dispose()}
