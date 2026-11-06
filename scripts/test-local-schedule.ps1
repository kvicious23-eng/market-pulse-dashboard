$ErrorActionPreference='Stop'
# Probe actual CIM trigger types without registering a real task. A daily
# trigger has no writable nested pattern until one is explicitly assigned.
$nativeDaily=ScheduledTasks\New-ScheduledTaskTrigger -Daily -At '08:00'
$nativePattern=ScheduledTasks\New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Hours 16)
$nativeDaily.Repetition=$nativePattern.Repetition
if($nativeDaily.Repetition.Interval -ne 'PT1M' -or $nativeDaily.Repetition.Duration -ne 'PT16H'){throw 'Native Windows repetition pattern is invalid.'}
$repo=Split-Path -Parent $PSScriptRoot
$tempRoot=Join-Path ([IO.Path]::GetTempPath()) ('market-pulse-schedule-'+[guid]::NewGuid())
$originalProgramFiles=$env:ProgramFiles
$global:MarketPulseScheduleTestTasks=@{}
function New-ScheduledTaskSettingsSet {
  param([switch]$StartWhenAvailable,[switch]$WakeToRun,[switch]$AllowStartIfOnBatteries,[switch]$DontStopIfGoingOnBatteries,[TimeSpan]$ExecutionTimeLimit,[string]$MultipleInstances,[int]$RestartCount,[TimeSpan]$RestartInterval)
  [pscustomobject]@{ExecutionTimeLimit=$ExecutionTimeLimit;MultipleInstances=$MultipleInstances;RestartCount=$RestartCount}
}
function New-ScheduledTaskAction {
  param([string]$Execute,[string]$Argument)
  [pscustomobject]@{Execute=$Execute;Arguments=$Argument}
}
function New-ScheduledTaskTrigger {
  param([switch]$Daily,[switch]$Once,$At,[TimeSpan]$RepetitionInterval,[TimeSpan]$RepetitionDuration)
  [pscustomobject]@{StartBoundary=$At;Repetition=if($Once){[pscustomobject]@{Interval='PT1M';Duration='PT16H'}}else{$null}}
}
function Register-ScheduledTask {
  param([string]$TaskName,$Action,$Trigger,$Settings,[string]$Description,[switch]$Force)
  $global:MarketPulseScheduleTestTasks[$TaskName]=[pscustomobject]@{Actions=$Action;Triggers=$Trigger;Settings=$Settings}
}
function Get-ScheduledTask {
  param([string]$TaskName,[string]$ErrorAction)
  $global:MarketPulseScheduleTestTasks[$TaskName]
}
try {
  $env:ProgramFiles=$tempRoot
  $chrome=Join-Path $tempRoot 'Google\Chrome\Application\chrome.exe'
  New-Item -ItemType Directory -Path (Split-Path $chrome) -Force | Out-Null
  New-Item -ItemType File -Path $chrome -Force | Out-Null
  & (Join-Path $repo 'scripts\set-local-schedule.ps1') -InstallPath $repo
  $blue=$global:MarketPulseScheduleTestTasks['Market Pulse Blue Model Recovery']
  if($blue.Triggers.Repetition.Interval -ne 'PT1M' -or $blue.Triggers.Repetition.Duration -ne 'PT16H' -or $blue.Settings.MultipleInstances -ne 'IgnoreNew' -or $blue.Actions.Arguments -notmatch 'run-blue-recovery.ps1'){throw 'Deferred blue retry task is not safely registered.'}
  $scan=$global:MarketPulseScheduleTestTasks['Market Pulse Chrome Start']
  $upload=$global:MarketPulseScheduleTestTasks['Market Pulse Result Upload']
  if ((@($scan.Triggers.StartBoundary)-join ',') -ne '07:00,12:00,15:00,20:00') {throw 'Wrong scan triggers.'}
  if ((@($upload.Triggers.StartBoundary)-join ',') -ne '07:30,12:30,15:30,20:30') {throw 'Wrong upload triggers.'}
  if ($scan.Actions.Arguments -notmatch 'run-scheduled-scan.ps1' -or $scan.Actions.Arguments -notmatch '-NonInteractive -WindowStyle Hidden') {throw 'Scan watchdog is not installed as a hidden action.'}
  if ($upload.Actions.Arguments -notmatch '-NonInteractive -WindowStyle Hidden') {throw 'Upload console is visible.'}
  if ($upload.Actions.Arguments -notmatch [regex]::Escape((Join-Path $repo 'scripts\run-scheduled-upload.ps1'))) {throw 'Wrong upload runner.'}
  if ($upload.Settings.ExecutionTimeLimit -ne [TimeSpan]::FromHours(2) -or $upload.Settings.MultipleInstances -ne 'IgnoreNew') {throw 'Upload is not bounded to two hours.'}
  . (Join-Path $repo 'scripts\scan-recovery.ps1')
  foreach ($hour in 0..23) {
    $now=[DateTimeOffset]::Parse(('2026-11-07T{0:00}:00:00+09:00' -f $hour))
    $slot=Get-ScanRecoverySlot $now
    $expected=if($hour -ge 20){20}elseif($hour -ge 15){15}elseif($hour -ge 12){12}elseif($hour -ge 7){7}else{$null}
    if ($null -eq $expected) {if($slot){throw 'Unexpected pre-morning slot'}}
    elseif(([DateTimeOffset]::Parse($slot)).Hour -ne $expected){throw "Wrong upload slot for hour $hour."}
  }
  Write-Host 'Windows schedule registration, hidden arguments and all 24 upload hours passed.'
} finally {
  Remove-Variable MarketPulseScheduleTestTasks -Scope Global -ErrorAction SilentlyContinue
  $env:ProgramFiles=$originalProgramFiles
  Remove-Item -Recurse -Force $tempRoot -ErrorAction SilentlyContinue
}
