param([string]$RepoPath='C:\MarketPulse')
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'supplier-daily.ps1')
$mutex=$null;$queue=$null;$phase='queue'
$queuePath=Join-Path $RepoPath 'reports\supplier-daily-queue.json'
$log=Join-Path $RepoPath 'reports\supplier-daily-upload.log'
try {
  $zone=[TimeZoneInfo]::FindSystemTimeZoneById('Korea Standard Time')
  $day=[TimeZoneInfo]::ConvertTime([DateTimeOffset]::UtcNow,$zone).Date
  $queue=Read-SupplierLocalState $queuePath
  if (-not $queue -or $queue.day -ne $day.ToString('yyyy-MM-dd') -or $queue.status -eq 'published') { exit 0 }
  $phase='lock'
  $mutex=Enter-MarketPulseRepositoryLock $RepoPath
  $phase='publication'
  $queue=Read-SupplierLocalState $queuePath
  if (-not $queue -or $queue.day -ne $day.ToString('yyyy-MM-dd') -or $queue.status -eq 'published') { exit 0 }
  if ([int]$queue.attempts -ge 4) { throw 'publication_retry_limit' }
  $queue.attempts=[int]$queue.attempts+1;$queue.status='publishing';$queue.reason='publication_started';$queue.checkedAt=[DateTimeOffset]::UtcNow.ToString('o')
  Save-SupplierLocalState $queuePath $queue
  Add-Content -LiteralPath $log -Encoding UTF8 -Value ($queue.checkedAt+' Supplier metrics publication started.')
  Publish-SupplierDailyMetrics -RepoPath $RepoPath -Queue $queue -DownloadRoot (Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads') -Day $day
  $queue.status='published';$queue.reason='github_push_completed';$queue.checkedAt=[DateTimeOffset]::UtcNow.ToString('o')
  Save-SupplierLocalState $queuePath $queue
  Add-Content -LiteralPath $log -Encoding UTF8 -Value ($queue.checkedAt+' Supplier metrics GitHub push completed; Pages deployment is separate.')
  exit 0
} catch {
  if ($queue) { $queue.status='failed';$queue.reason='publication_failed';$queue.checkedAt=[DateTimeOffset]::UtcNow.ToString('o');$queue | Add-Member -NotePropertyName nextAttemptAt -NotePropertyValue ([DateTimeOffset]::UtcNow.AddMinutes(15).ToString('o')) -Force;Save-SupplierLocalState $queuePath $queue }
  $failure=switch ($phase) { 'lock' { 'repository_lock_unavailable' }; 'queue' { 'queue_read_failed' }; default { 'publication_failed' } }
  Add-Content -LiteralPath $log -Encoding UTF8 -Value ([DateTimeOffset]::UtcNow.ToString('o')+' Supplier metrics publication failed: '+$failure+'.')
  exit 1
} finally { if ($mutex) { $mutex.ReleaseMutex();$mutex.Dispose() } }
