$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'scan-recovery.ps1')
. (Join-Path $PSScriptRoot 'git-timeout.ps1')
function Check($Value,[string]$Message){if(-not $Value){throw $Message}}
$hours=@(7,12,15,20)
foreach($day in @('2026-11-07','2026-11-08')){
 foreach($hour in 0..23){
  $now=[DateTimeOffset]::Parse(('{0}T{1:00}:00:00+09:00' -f $day,$hour));$slot=Get-ScanRecoverySlot $now
  $expected=@($hours|Where-Object {$_ -le $hour}|Select-Object -Last 1)
  if(-not $expected.Count){Check (-not $slot) 'Unexpected pre-morning recovery';continue}
  Check ($slot -ceq ('{0}T{1:00}:00+09:00' -f $day,$expected[0])) 'Wrong current recovery slot'
 }
 foreach($hour in $hours){
  $slot='{0}T{1:00}:00+09:00' -f $day,$hour
  Check ((Get-PrimaryScanBrowser $slot) -ceq $(if($hour -in @(7,15)){'chrome'}else{'whale'})) 'Wrong browser owner'
  Check ((Test-CompetitorScanDue $slot) -eq ($hour -in @(7,15))) 'Wrong competitor collection slot'
  $next=Get-NextScanTime $slot
  Check ($next -gt [DateTimeOffset]::Parse($slot)) 'Next slot did not advance'
  Check ((Get-MarketPulseUploadDeadline $slot ([DateTimeOffset]::Parse($slot).AddMinutes(74))) -eq [DateTimeOffset]::Parse($slot).AddMinutes(150)) 'Absolute publication cap changed'
 }
}
Check ((Get-NextScanTime '2026-11-06T12:00+09:00') -eq [DateTimeOffset]::Parse('2026-11-06T15:00+09:00')) 'Cutover did not select 15:00'
Check ((Get-NextScanTime '2026-11-07T20:00+09:00') -eq [DateTimeOffset]::Parse('2026-11-08T07:00+09:00')) 'Overnight rollover is not 07:00'
Check ((Get-PrimaryScanBrowser '2026-11-06T08:00+09:00') -ceq 'chrome') 'Historical morning owner lost'
foreach($slot in @('2026-11-07T08:00+09:00','2026-11-07T16:00+09:00')){
 $failed=$false;try{Get-ScanSlotPolicy $slot|Out-Null}catch{$failed=$true};Check $failed 'Retired slot accepted after cutover'
}
. (Join-Path $PSScriptRoot 'competitor-phase.ps1')
foreach($hour in @(12,20)){Add-CompetitorPhase ([pscustomobject]@{scanSlot=('2026-11-07T{0:00}:00+09:00' -f $hour);extensionVersion='1.9.77'}) 'C:\must-not-create-competitor-queue' 'C:\must-not-read-catalog'}
Write-Host 'Windows dated routing, all 24 hours, twice-daily competitors, publication caps and midnight rollover passed.'
