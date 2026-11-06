param(
  [string]$RepoPath = "C:\MarketPulse",
  [ValidateRange(1,7200)][int]$TimeoutSeconds=7200,
  [switch]$Worker,
  [switch]$CompletedOnly,
  [string]$ExpectedSlotStart='',
  [string]$BlueRecoveryQueue=''
)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'supplier-daily.ps1')
. (Join-Path $PSScriptRoot 'completion-upload.ps1')
$reportsPath=Join-Path $RepoPath 'reports'
New-Item -ItemType Directory $reportsPath -Force | Out-Null
$logPath=Join-Path $reportsPath 'scheduled-upload.log'
$kstZone=[TimeZoneInfo]::FindSystemTimeZoneById('Korea Standard Time')
$kstNow=[TimeZoneInfo]::ConvertTime([DateTimeOffset]::UtcNow,$kstZone)
$currentSlot=Get-ScanRecoverySlot
$expectedSlotStart=if ($ExpectedSlotStart) {$ExpectedSlotStart} elseif($currentSlot){([DateTimeOffset]::Parse($currentSlot)).ToString('yyyy-MM-ddTHH:mm:sszzz')}else{''}
function Write-UploadLog([string]$Message) {
  Add-Content $logPath -Encoding UTF8 -Value ("[$([DateTimeOffset]::Now.ToString('o'))] $Message")
}
if ($Worker) {
  try {
    Write-UploadLog 'Scheduled upload worker started.'
    Start-Transcript -Path $logPath -Append | Out-Null
    try {
      if($BlueRecoveryQueue){& (Join-Path $RepoPath 'scripts\blue-recovery-worker.ps1') -RepoPath $RepoPath -QueuePath $BlueRecoveryQueue}
      else{& (Join-Path $RepoPath 'scripts\import-extension-results.ps1') -RepoPath $RepoPath -WaitForToday -ExpectedSlotStart $ExpectedSlotStart}
    }
    finally { Stop-Transcript | Out-Null }
    Write-UploadLog 'Scheduled upload completed.'
    exit 0
  } catch {
    Write-UploadLog ("Scheduled upload failed: "+$_.ToString())
    exit 1
  }
}
if (-not $ExpectedSlotStart) { Write-UploadLog 'No current upload slot; skipped.';exit 0 }
# A delayed start must also finish before the next collection slot.
$slotTime=[DateTimeOffset]::Parse($ExpectedSlotStart).ToOffset([TimeSpan]::FromHours(9))
$nextSlotDeadline=Get-NextScanTime $slotTime.ToString('yyyy-MM-ddTHH:mmzzz')
$budgetPath=Join-Path $reportsPath 'scheduled-upload-budget.json'
$key=([IO.Path]::GetFullPath($RepoPath) -replace '[^a-zA-Z0-9]','')
$supervisor=New-Object Threading.Mutex($false,('Local\MarketPulse.UploadSupervisor.'+$key))
$held=$false;$child=$null;$budget=$null
try {
  try {$held=$supervisor.WaitOne(0)}catch [Threading.AbandonedMutexException]{$held=$true}
  if(-not $held){Write-UploadLog 'Upload supervisor already running; skipped duplicate.';exit 1}
  $budget=Read-SupplierLocalState $budgetPath
  $candidate=$null
  if(-not $BlueRecoveryQueue){
    $folder=Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads\MarketPulse'
    # Missing/incomplete results never become an early upload or a success receipt.
    $candidate=Get-CompletedUploadCandidate $RepoPath $folder $ExpectedSlotStart
    if($CompletedOnly -and -not $candidate){Write-UploadLog 'Completed-only source not ready; scheduled fallback retained.';exit 0}
    if($budget -and (Test-CompletedUploadReceipt $budget.publicationReceipt $candidate $RepoPath)){
      Write-UploadLog ("Slot="+$ExpectedSlotStart+'; exact own result already pushed; duplicate import skipped.');exit 0
    }
  }
  if($BlueRecoveryQueue -and (-not $budget -or $budget.scanSlot -cne $ExpectedSlotStart)){throw 'Deferred recovery cannot create a new upload budget.'}
  if (-not $budget -or $budget.scanSlot -cne $ExpectedSlotStart) {
    $now=[DateTimeOffset]::UtcNow
    $end=Get-MarketPulseUploadDeadline $ExpectedSlotStart $now $TimeoutSeconds
    if($end -gt $nextSlotDeadline){$end=$nextSlotDeadline}
    $budget=[pscustomobject]@{scanSlot=$ExpectedSlotStart;startedAt=$now.ToString('o');deadlineAt=$end.ToString('o');exhausted=$false;status='starting'}
    Save-SupplierLocalState $budgetPath $budget
  }
  $deadline=[DateTimeOffset]::Parse($budget.deadlineAt)
  $bounded=Get-MarketPulseUploadDeadline $ExpectedSlotStart ([DateTimeOffset]::Parse($budget.startedAt)) $TimeoutSeconds
  if($deadline -gt $bounded){$deadline=$bounded;$budget.deadlineAt=$deadline.ToString('o');Save-SupplierLocalState $budgetPath $budget}
  $remaining=($deadline-[DateTimeOffset]::UtcNow).TotalSeconds
  if ($budget.exhausted -or $remaining -le 0) {
    $budget.status='deadline-exhausted';$budget.exhausted=$true
    Save-SupplierLocalState $budgetPath $budget
    Write-UploadLog ("Slot="+$ExpectedSlotStart+"; two-hour budget exhausted; waiting for the next scheduled slot; no new worker.")
    exit 1
  }
  # Leave cleanup time before Task Scheduler's two-hour hard limit.
  $reserve=[math]::Min(10,$remaining/10)
  $cutoff=$deadline.AddSeconds(-$reserve)
  $oldDeadline=$env:MARKET_PULSE_UPLOAD_DEADLINE
  try {
    $env:MARKET_PULSE_UPLOAD_DEADLINE=$cutoff.ToString('o')
    $arguments=@('-NoProfile','-NonInteractive','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',$PSCommandPath,'-RepoPath',$RepoPath,'-Worker','-ExpectedSlotStart',$ExpectedSlotStart)
    if($BlueRecoveryQueue){$arguments+=@('-BlueRecoveryQueue',$BlueRecoveryQueue)}
    $child=Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList (($arguments | ForEach-Object {ConvertTo-MarketPulseArgument $_}) -join ' ') -WindowStyle Hidden -PassThru
  } finally { $env:MARKET_PULSE_UPLOAD_DEADLINE=$oldDeadline }
  $budget.status='running';Save-SupplierLocalState $budgetPath $budget
  $waitMilliseconds=[int][math]::Max(1,($cutoff-[DateTimeOffset]::UtcNow).TotalMilliseconds)
  if (-not $child.WaitForExit($waitMilliseconds)) {
    Stop-MarketPulseProcessTree $child
    $budget.status='timed-out';$budget.exhausted=$true
    Save-SupplierLocalState $budgetPath $budget
    Write-UploadLog ("Slot="+$ExpectedSlotStart+"; upload timeout; worker and its child processes stopped; next slot remains scheduled.")
    exit 1
  }
  $code=$child.ExitCode
  $budget.status=if($code -eq 0){'completed'}else{'failed'}
  if($code -eq 0 -and $candidate -and -not $BlueRecoveryQueue){
    $after=Get-CompletedUploadCandidate $RepoPath $folder $ExpectedSlotStart
    if($after -and $after.runId -ceq $candidate.runId -and $after.resultHash -ceq $candidate.resultHash -and $after.catalogHash -ceq $candidate.catalogHash){
      $receiptLock=$null
      try{
        $left=[int][math]::Floor(($deadline-[DateTimeOffset]::UtcNow).TotalSeconds)
        if($left -gt 1){
          $receiptLock=Enter-MarketPulseRepositoryLock $RepoPath ([math]::Min(5,$left))
          if(-not(Test-Path (Join-Path $RepoPath 'reports\price-publication-transaction.json'))){
            $fingerprint=Get-CompletedOwnFingerprint $after $RepoPath
            $left=[int][math]::Floor(($deadline-[DateTimeOffset]::UtcNow).TotalSeconds)
            if($fingerprint -and $left -gt 0){
              $head=Invoke-MarketPulseGit -RepoPath $RepoPath -Arguments @('rev-parse','HEAD') -TimeoutSeconds ([math]::Min(5,$left))
              if($head.Code -or [string]@($head.Output)[0] -cnotmatch '^[a-f0-9]{40}$'){throw 'Cannot verify pushed publication identity'}
              $receipt=[pscustomobject]@{version=2;scanSlot=$ExpectedSlotStart;runId=$candidate.runId;resultHash=$candidate.resultHash;catalogHash=$candidate.catalogHash;ownFingerprint=$fingerprint;commit=[string]@($head.Output)[0];pushedAt=[DateTimeOffset]::UtcNow.ToString('o')}
              $budget|Add-Member publicationReceipt $receipt -Force
            }
          }
        }
      }catch{Write-UploadLog 'Own upload pushed; skip receipt unavailable, scheduled fallback may revalidate.'}
      finally{if($receiptLock){$receiptLock.ReleaseMutex();$receiptLock.Dispose()}}
    }
  }
  Save-SupplierLocalState $budgetPath $budget
  exit $code
} catch {
  Write-UploadLog ("Upload supervisor failed: "+$_.Exception.Message)
  exit 1
} finally {
  if($child){if(-not $child.HasExited){Stop-MarketPulseProcessTree $child};$child.Dispose()}
  if($held){$supervisor.ReleaseMutex()};$supervisor.Dispose()
}
