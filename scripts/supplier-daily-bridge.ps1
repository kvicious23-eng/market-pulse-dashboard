param([string]$RequestBase64,[string]$RepoPath=(Split-Path $PSScriptRoot -Parent))
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'supplier-daily.ps1')
$root=Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads'
$folder=Join-Path $root 'MarketPulse'
$zone=[TimeZoneInfo]::FindSystemTimeZoneById('Korea Standard Time')
$now=[TimeZoneInfo]::ConvertTime([DateTimeOffset]::UtcNow,$zone);$day=$now.Date;$date=$day.ToString('yyyy-MM-dd')
$queuePath=Join-Path $RepoPath 'reports\supplier-daily-queue.json'
function Start-PendingSupplierPublication($Queue) {
  if ($Queue -and $Queue.PSObject.Properties['nextAttemptAt'] -and $Queue.nextAttemptAt -and $now -lt [DateTimeOffset]::Parse($Queue.nextAttemptAt)) { return }
  if ($Queue -and $Queue.day -eq $date -and $Queue.status -ne 'published' -and [int]$Queue.attempts -lt 4 -and $now.Hour -ge 8 -and ($now.Hour -gt 8 -or $now.Minute -ge 30)) {
    $task=Get-ScheduledTask -TaskName 'Market Pulse Supplier Metrics' -ErrorAction SilentlyContinue
    if ($task -and $task.State -ne 'Running') { Start-ScheduledTask -InputObject $task }
  }
}
try {
  $request=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($RequestBase64)) | ConvertFrom-Json
  $result=@{ok=$false;reason='invalid_operation'}
  if ($request.operation -eq 'morning_status') {
    $signal=Get-SupplierInventorySignal $now
    # Preserve the trusted Edge acknowledgement when available, without making
    # inventory depend on a price run or a pending/failed recovery receipt.
    if ($signal.ready) {
      $priceSignal=Get-SupplierMorningSignal -Folder $folder -Day $day -Now $now -RepoPath $RepoPath
      if ($priceSignal) { $signal=$priceSignal }
    }
    Save-SupplierLocalState (Join-Path $RepoPath 'reports\supplier-inventory-signal.json') $signal
    $result=$signal
  } elseif ($request.operation -eq 'csv_complete') {
    if ([string]$request.day -cne $date) { $result=@{ok=$false;reason='csv_day_mismatch'} }
    else {
      $check=Test-SupplierDailyCsv -Path ([string]$request.filename) -DownloadRoot $root -Day $day -RequestedAt ([DateTimeOffset]::Parse([string]$request.requestedAt))
      $result=$check
      if ($check.ok) {
        $queue=Read-SupplierLocalState $queuePath
        if (-not $queue -or $queue.day -ne $date) {
          $queue=[pscustomobject]@{day=$date;filename=[string]$request.filename;requestedAt=[string]$request.requestedAt;status='queued';attempts=0;reason='csv_validated';checkedAt=$now.ToString('o')}
          Save-SupplierLocalState $queuePath $queue
        }
        Start-PendingSupplierPublication $queue
      }
    }
  } elseif ($request.operation -eq 'daily_status') {
    $queue=Read-SupplierLocalState $queuePath
    Start-PendingSupplierPublication $queue
    $result=if ($queue -and $queue.day -eq $date) { @{ok=$true;day=$queue.day;status=$queue.status;attempts=$queue.attempts;reason=$queue.reason;checkedAt=$queue.checkedAt} } else { @{ok=$true;day=$date;status='not_queued'} }
  }
  $result | ConvertTo-Json -Depth 5 -Compress
} catch { @{ok=$false;reason='daily_local_connection_error'} | ConvertTo-Json -Compress }
