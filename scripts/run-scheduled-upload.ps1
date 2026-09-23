param(
  [string]$RepoPath = "C:\MarketPulse"
)

$ErrorActionPreference = 'Stop'
$reportsPath=Join-Path $RepoPath 'reports'
New-Item -ItemType Directory -Path $reportsPath -Force | Out-Null
$logPath=Join-Path $reportsPath 'scheduled-upload.log'
$importScript=Join-Path $RepoPath 'scripts\import-extension-results.ps1'
$started=(Get-Date).ToString('yyyy-MM-dd HH:mm:ss zzz')
$kstZone=[TimeZoneInfo]::FindSystemTimeZoneById('Korea Standard Time')
$kstNow=[TimeZoneInfo]::ConvertTime([DateTimeOffset]::UtcNow,$kstZone)
$slotHour=if ($kstNow.Hour -ge 14) { 14 } elseif ($kstNow.Hour -ge 8) { 8 } else { $null }
$expectedSlotStart=if ($null -ne $slotHour) {
  "{0}T{1:00}:00:00+09:00" -f $kstNow.ToString('yyyy-MM-dd'),$slotHour
} else { '' }

try {
  Add-Content -Path $logPath -Encoding UTF8 -Value "[$started] Scheduled upload started."
  # A 2>&1 pipeline makes PowerShell 5.1 treat normal native Git stderr
  # (including the "From ..." line of a successful pull) as a fatal error.
  Start-Transcript -Path $logPath -Append | Out-Null
  try {
    & $importScript -RepoPath $RepoPath -WaitForToday -ExpectedSlotStart $expectedSlotStart
  } finally {
    Stop-Transcript | Out-Null
  }
  Add-Content -Path $logPath -Encoding UTF8 -Value "[$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss zzz'))] Scheduled upload completed."
  exit 0
} catch {
  $message="[$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss zzz'))] Scheduled upload failed: $($_.ToString())"
  Add-Content -Path $logPath -Encoding UTF8 -Value $message
  Write-Error $message
  exit 1
}
