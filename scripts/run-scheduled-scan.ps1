param([string]$RepoPath='C:\MarketPulse',[int]$MonitorMinutes=75)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'scan-recovery.ps1')
. (Join-Path $PSScriptRoot 'brand-lifecycle.ps1')
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
  $chrome=@("$env:ProgramFiles\Google\Chrome\Application\chrome.exe","${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe","$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object {Test-Path $_} | Select-Object -First 1
  if (-not $chrome) { throw 'Google Chrome is not installed.' }
  Start-Process $chrome -ArgumentList '--no-first-run --new-window "chrome://newtab/"'
  Write-WatchLog "Slot=$slot; Chrome launched; waiting for the extension start witness."
  $seen=$false;$absent=0
  $session=(Get-Process -Id $PID).SessionId
  $deadline=[DateTime]::UtcNow.AddMinutes($MonitorMinutes)
  while ([DateTime]::UtcNow -lt $deadline) {
    $receipt=Read-ScanRecoveryJson (Join-Path $RepoPath 'reports\edge-recovery.json')
    if ($receipt -and $receipt.scanSlot -ceq $slot) { Write-WatchLog "Slot=$slot; existing recovery state=$($receipt.state); no second handoff.";exit 0 }
    $alive=@(Get-Process -ErrorAction Stop | Where-Object {$_.ProcessName -eq 'chrome' -and $_.SessionId -eq $session}).Count -gt 0
    if ($alive) {$seen=$true;$absent=0} elseif($seen) {$absent++}
    $witness=Read-ScanRecoveryJson (Join-Path $folder 'scan-start.json')
    if ($witness -and $witness.scanSlot -ceq $slot) {
      $completed=Read-ScanRecoveryJson (Join-Path $folder 'latest-coupang-scan.json')
      if ($completed -and $completed.browser -eq 'chrome' -and $completed.runId -ceq $witness.runId -and $completed.complete -eq $true) {
        Write-WatchLog "Slot=$slot; Chrome completed and saved JSON; watchdog finished.";exit 0
      }
      if (Test-ChromeExitRecovery $witness $completed $seen $absent) {
        $catalog=Read-ScanRecoveryJson (Join-Path $folder 'product-catalog.json')
        Assert-ScanStartWitness $witness $slot $catalog
        $proof=[pscustomobject]@{chromeSeen=$seen;absentChecks=$absent;observedAt=[DateTimeOffset]::UtcNow.ToString('o')}
        Write-WatchLog "Slot=$slot; start witness confirmed; Chrome absent on $absent consecutive checks; exit cause unknown; requesting full Edge recollection."
        & (Join-Path $PSScriptRoot 'edge-fallback.ps1') -RepoPath $RepoPath -StartWitness $witness -ExitProof $proof
        exit 0
      }
    }
    Start-Sleep -Seconds 10
  }
  Write-WatchLog "Slot=$slot; monitor timed out; no proven process-exit handoff. Missing JSON alone is not an access-check or shutdown diagnosis."
  exit 1
} catch {
  Write-WatchLog "Slot=$slot; failed: $($_.Exception.Message)"
  Write-Error $_;exit 1
} finally {if($locked){$mutex.ReleaseMutex()};$mutex.Dispose()}
