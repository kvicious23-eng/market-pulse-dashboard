param(
  [string]$RepoPath = "C:\MarketPulse",
  [ValidateRange(1,7200)][int]$TimeoutSeconds=7200,
  [switch]$Worker,
  [string]$ExpectedSlotStart=''
)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'supplier-daily.ps1')
$reportsPath=Join-Path $RepoPath 'reports'
New-Item -ItemType Directory $reportsPath -Force | Out-Null
$logPath=Join-Path $reportsPath 'scheduled-upload.log'
$kstZone=[TimeZoneInfo]::FindSystemTimeZoneById('Korea Standard Time')
$kstNow=[TimeZoneInfo]::ConvertTime([DateTimeOffset]::UtcNow,$kstZone)
$slotHour=@(8,12,16,20 | Where-Object { $_ -le $kstNow.Hour } | Select-Object -Last 1)
$slotHour=if ($slotHour.Count) { $slotHour[0] } else { $null }
$expectedSlotStart=if ($ExpectedSlotStart) {$ExpectedSlotStart} elseif($null -ne $slotHour){"{0}T{1:00}:00:00+09:00" -f $kstNow.ToString('yyyy-MM-dd'),$slotHour}else{''}
function Write-UploadLog([string]$Message) {
  Add-Content $logPath -Encoding UTF8 -Value ("[$([DateTimeOffset]::Now.ToString('o'))] $Message")
}
if ($Worker) {
  $repositoryMutex=$null
  try {
    $repositoryMutex=Enter-MarketPulseRepositoryLock $RepoPath
    Write-UploadLog 'Scheduled upload worker started.'
    Start-Transcript -Path $logPath -Append | Out-Null
    try { & (Join-Path $RepoPath 'scripts\import-extension-results.ps1') -RepoPath $RepoPath -WaitForToday -ExpectedSlotStart $ExpectedSlotStart }
    finally { Stop-Transcript | Out-Null }
    Write-UploadLog 'Scheduled upload completed.'
    exit 0
  } catch {
    Write-UploadLog ("Scheduled upload failed: "+$_.ToString())
    exit 1
  } finally { if($repositoryMutex){$repositoryMutex.ReleaseMutex();$repositoryMutex.Dispose()} }
}
if (-not $ExpectedSlotStart) { Write-UploadLog 'No current upload slot; skipped.';exit 0 }
# A delayed start must also finish before the next collection slot.
$slotTime=[DateTimeOffset]::Parse($ExpectedSlotStart).ToOffset([TimeSpan]::FromHours(9))
$nextHour=@(8,12,16,20 | Where-Object {$_ -gt $slotTime.Hour} | Select-Object -First 1)
$nextDate=$slotTime.Date
if($nextHour.Count){$nextDate=$nextDate.AddHours($nextHour[0])}else{$nextDate=$nextDate.AddDays(1).AddHours(8)}
$nextSlotDeadline=New-Object DateTimeOffset($nextDate,[TimeSpan]::FromHours(9))
$budgetPath=Join-Path $reportsPath 'scheduled-upload-budget.json'
$key=([IO.Path]::GetFullPath($RepoPath) -replace '[^a-zA-Z0-9]','')
$supervisor=New-Object Threading.Mutex($false,('Local\MarketPulse.UploadSupervisor.'+$key))
$held=$false;$child=$null;$budget=$null
try {
  try {$held=$supervisor.WaitOne(0)}catch [Threading.AbandonedMutexException]{$held=$true}
  if(-not $held){Write-UploadLog 'Upload supervisor already running; skipped duplicate.';exit 1}
  $budget=Read-SupplierLocalState $budgetPath
  if (-not $budget -or $budget.scanSlot -cne $ExpectedSlotStart) {
    $now=[DateTimeOffset]::UtcNow
    $end=$now.AddSeconds($TimeoutSeconds)
    if($end -gt $nextSlotDeadline){$end=$nextSlotDeadline}
    $budget=[pscustomobject]@{scanSlot=$ExpectedSlotStart;startedAt=$now.ToString('o');deadlineAt=$end.ToString('o');exhausted=$false;status='starting'}
    Save-SupplierLocalState $budgetPath $budget
  }
  $deadline=[DateTimeOffset]::Parse($budget.deadlineAt)
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
  Save-SupplierLocalState $budgetPath $budget
  exit $code
} catch {
  Write-UploadLog ("Upload supervisor failed: "+$_.Exception.Message)
  exit 1
} finally {
  if($child){if(-not $child.HasExited){Stop-MarketPulseProcessTree $child};$child.Dispose()}
  if($held){$supervisor.ReleaseMutex()};$supervisor.Dispose()
}
