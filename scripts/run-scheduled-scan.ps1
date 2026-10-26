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
    $requestPath=Get-WhaleRequestPath $RepoPath $slot
    $request=Read-WhalePrimaryRequest $RepoPath $slot
    if((Test-Path -LiteralPath $requestPath) -and -not $request){throw 'Existing Whale request is corrupt or mismatched; do not create another request.'}
    if(-not $request -or $request.scanSlot -cne $slot) {
      $request=[pscustomobject]@{version=1;browser='whale';scanSlot=$slot;policyId=(Get-ScanSlotPolicy $slot).id;requestId=[guid]::NewGuid().ToString('N');requestedAt=[DateTimeOffset]::UtcNow.ToString('o');targets=$targets}
      Assert-WhalePrimaryRequest $request $slot $catalog
      Write-ScanRecoveryJson $requestPath $request
    } else {Assert-WhalePrimaryRequest $request $slot $catalog}
    if(Get-SavedPrimaryResultPath $folder $slot $RepoPath){Write-WatchLog "Slot=$slot; Whale already completed; duplicate skipped.";exit 0}
    function Start-WhalePrimaryPage {
      if([int]$request.launchAttempts -ge 2){throw 'Whale primary transport launch budget exhausted.'}
      $request|Add-Member -NotePropertyName launchAttempts -NotePropertyValue ([int]$request.launchAttempts+1) -Force
      Write-ScanRecoveryJson $requestPath $request
      Write-ScanRecoveryJson (Join-Path $RepoPath ('chrome-extension\runtime\primary-request-'+$request.requestId+'.json')) $request
      $url="chrome-extension://$($profiles[0].Id)/primary.html?slot=$([uri]::EscapeDataString($slot))&requestId=$($request.requestId)&launch=$($request.launchAttempts)"
      Start-Process $chrome -ArgumentList @("--profile-directory=`"$($profiles[0].Profile)`"",'--new-window',$url)
    }
    if([int]$request.launchAttempts -lt 2){Start-WhalePrimaryPage}

  } else {
    if (-not $chrome) { throw 'Google Chrome is not installed.' }
    Start-Process $chrome -ArgumentList '--no-first-run --new-window "chrome://newtab/"'
  }
  Write-WatchLog "Slot=$slot; $primaryBrowser launched; waiting for the extension start witness."
  $seen=$false;$absent=0;$monitorDegraded=$false
  $launchAt=[DateTime]::UtcNow
  $session=(Get-Process -Id $PID).SessionId
  $deadline=if($primaryBrowser -eq 'whale'){(Get-WhaleDeadline $request).UtcDateTime}else{[DateTime]::UtcNow.AddMinutes($MonitorMinutes)}
  while ([DateTime]::UtcNow -lt $deadline) {
    $receipt=Read-ScanRecoveryJson (Get-EdgeReceiptPath $RepoPath $slot)
    if ($receipt -and $receipt.scanSlot -ceq $slot) { Write-WatchLog "Slot=$slot; existing recovery state=$($receipt.state); no second handoff.";exit 0 }
    $alive=@(Get-Process -ErrorAction Stop | Where-Object {$_.ProcessName -eq $primaryBrowser -and $_.SessionId -eq $session}).Count -gt 0
    if ($alive) {$seen=$true;$absent=0} elseif($seen) {$absent++}
    Invoke-ScanSaveRecovery $RepoPath $folder $slot
    $witness=if($primaryBrowser -eq 'whale'){Get-WhaleStartWitness $folder $request}else{Read-ScanRecoveryJson (Join-Path $folder 'scan-start.json')}
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
      $accepted=Get-WhalePrimaryReceipt $folder $request
      $action=Get-WhalePrimaryAction $accepted $witness $request $launchAt
      if($action -eq 'monitor-degraded') {
        if(-not $monitorDegraded){Write-WatchLog "Slot=$slot; primary receipt monitoring degraded; matching start confirmed; continue completion/process checks within original deadline; no inferred Edge handoff.";$monitorDegraded=$true}
      } elseif($action -eq 'relaunch') {
        Write-WatchLog "Slot=$slot; primary transport/liveness retry; same request ID; no Chrome substitution."
        Start-WhalePrimaryPage;$launchAt=[DateTime]::UtcNow
      } elseif($action -eq 'edge') {
        $catalog=Read-ScanRecoveryJson (Join-Path $folder 'product-catalog.json')
        Assert-WhalePrimaryFailure $accepted $slot $catalog $request
        $minutes=[math]::Min(40,[math]::Floor(([DateTimeOffset]::Parse($accepted.deadlineAt)-[DateTimeOffset]::UtcNow).TotalMinutes))
        if($minutes -lt 1){throw 'No primary recovery budget remains for Edge.'}
        Write-WatchLog "Slot=$slot; Whale worker explicitly inactive after one retry; handoff frozen; requesting full Edge recollection."
        & (Join-Path $PSScriptRoot 'edge-fallback.ps1') -RepoPath $RepoPath -PrimaryFailure $accepted -PrimaryBrowser whale -TimeoutMinutes $minutes
        exit 0
      } elseif($action -eq 'wait' -and $monitorDegraded) {Write-WatchLog "Slot=$slot; primary receipt monitoring restored.";$monitorDegraded=$false
      } elseif($action -eq 'fail') {throw 'Whale primary start/liveness failed; no confirmed safe handoff. Inspect whale-primary-acceptance.json.'}
    }
    Start-Sleep -Seconds 10
  }
  Write-WatchLog "Slot=$slot; monitor timed out; no proven process-exit handoff. Missing JSON alone is not an access-check or shutdown diagnosis."
  exit 1
} catch {
  Write-WatchLog "Slot=$slot; failed: $($_.Exception.Message)"
  Write-Error $_;exit 1
} finally {if($locked){$mutex.ReleaseMutex()};$mutex.Dispose()}
