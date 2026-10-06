$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$tempRoot=Join-Path ([IO.Path]::GetTempPath()) ('market-pulse-schedule-'+[guid]::NewGuid())
$originalProgramFiles=$env:ProgramFiles
$global:MarketPulseScheduleTestTasks=@{}
function New-ScheduledTaskSettingsSet { [pscustomobject]@{} }
function New-ScheduledTaskAction {
  param([string]$Execute,[string]$Argument)
  [pscustomobject]@{Execute=$Execute;Arguments=$Argument}
}
function New-ScheduledTaskTrigger {
  param([switch]$Daily,[string]$At)
  [pscustomobject]@{StartBoundary=$At}
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
  $scan=$global:MarketPulseScheduleTestTasks['Market Pulse Chrome Start']
  $upload=$global:MarketPulseScheduleTestTasks['Market Pulse Result Upload']
  if ((@($scan.Triggers.StartBoundary)-join ',') -ne '08:00,12:00,16:00,20:00') {throw 'Wrong scan triggers.'}
  if ((@($upload.Triggers.StartBoundary)-join ',') -ne '08:30,12:30,16:30,20:30') {throw 'Wrong upload triggers.'}
  if ($upload.Actions.Arguments -notmatch '-NonInteractive -WindowStyle Hidden') {throw 'Upload console is visible.'}
  if ($upload.Actions.Arguments -notmatch [regex]::Escape((Join-Path $repo 'scripts\run-scheduled-upload.ps1'))) {throw 'Wrong upload runner.'}
  $runner=Get-Content -Raw -Encoding UTF8 (Join-Path $repo 'scripts\run-scheduled-upload.ps1')
  $block=[regex]::Match($runner,'(?ms)^\$slotHour=@.*?(?=^\$expectedSlotStart)').Value
  if (-not $block) {throw 'Slot selection code missing.'}
  foreach ($hour in 0..23) {
    $kstNow=[pscustomobject]@{Hour=$hour}
    Invoke-Expression $block
    $expected=if($hour -ge 20){20}elseif($hour -ge 16){16}elseif($hour -ge 12){12}elseif($hour -ge 8){8}else{$null}
    if ($slotHour -ne $expected) {throw "Wrong upload slot for hour $hour."}
  }
  Write-Host 'Windows schedule registration, hidden arguments and all 24 upload hours passed.'
} finally {
  Remove-Variable MarketPulseScheduleTestTasks -Scope Global -ErrorAction SilentlyContinue
  $env:ProgramFiles=$originalProgramFiles
  Remove-Item -Recurse -Force $tempRoot -ErrorAction SilentlyContinue
}
