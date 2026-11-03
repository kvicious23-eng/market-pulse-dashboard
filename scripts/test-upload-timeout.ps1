$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'git-timeout.ps1')
function Assert-UploadChildStopped([int]$ChildId,[string]$Message,[int]$WaitMilliseconds=5000) {
  $child=Get-Process -Id $ChildId -ErrorAction SilentlyContinue
  if(-not $child){return}
  try {
    # taskkill can return while Windows still exposes an exiting process.
    # Require actual exit within the bounded cleanup allowance, not absence
    # from an immediately sampled process list. A live orphan still fails.
    if(-not $child.WaitForExit($WaitMilliseconds)){throw $Message}
    $child.Refresh()
    if(-not $child.HasExited){throw $Message}
  } finally {$child.Dispose()}
}
foreach($case in @(
 @('2026-10-26T20:00+09:00','2026-10-26T20:30+09:00','2026-10-26T22:30+09:00'),
 @('2026-10-26T20:00+09:00','2026-10-26T21:15+09:00','2026-10-26T22:30+09:00'),
 @('2026-10-26T20:00+09:00','2026-10-26T23:00+09:00','2026-10-26T22:30+09:00'),
 @('2026-10-27T08:00+09:00','2026-10-27T09:15+09:00','2026-10-27T10:30+09:00'),
 @('2026-10-27T12:00+09:00','2026-10-27T12:30+09:00','2026-10-27T14:30+09:00'),
 @('2026-10-27T16:00+09:00','2026-10-27T17:15+09:00','2026-10-27T18:30+09:00')
)) {
 if((Get-MarketPulseUploadDeadline $case[0] ([DateTimeOffset]::Parse($case[1]))) -ne [DateTimeOffset]::Parse($case[2])){throw 'Delayed upload moved its absolute slot cutoff.'}
}
Write-Host 'All four absolute upload cutoffs, delayed20 start and after22:30 exhausted budget passed.'
$root=Join-Path ([IO.Path]::GetTempPath()) ('market-pulse-upload-timeout-'+[guid]::NewGuid())
$originalDeadline=$env:MARKET_PULSE_UPLOAD_DEADLINE
try {
  New-Item -ItemType Directory $root -Force | Out-Null
  # The exit-observation helper must still reject a genuinely running orphan.
  $live=Start-Process powershell.exe -ArgumentList '-NoProfile -NonInteractive -Command "Start-Sleep -Seconds 30"' -WindowStyle Hidden -PassThru
  try {
    $rejected=$false;try{Assert-UploadChildStopped $live.Id 'live-child-not-stopped' 200}catch{if($_.Exception.Message -ne 'live-child-not-stopped'){throw};$rejected=$true}
    if(-not $rejected){throw 'A live child passed the cleanup assertion.'}
  }finally{Stop-MarketPulseProcessTree $live;$live.Dispose()}
  $spaced=Join-Path $root 'repo with spaces'
  New-Item -ItemType Directory $spaced -Force | Out-Null
  $result=Invoke-MarketPulseGit -RepoPath $spaced -Arguments @('--version')
  if($result.Code -ne 0 -or ($result.Output -join '') -notmatch 'git version'){throw 'Git output or argument quoting failed.'}
  $fake=Join-Path $root 'fake-git.exe'
  Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
public class FakeGit {
  public static void Main(string[] args) {
    var info=new ProcessStartInfo("powershell.exe","-NoProfile -NonInteractive -Command \"Start-Sleep -Seconds 30\"");
    info.UseShellExecute=false;info.CreateNoWindow=true;
    var child=Process.Start(info);
    File.WriteAllText(args[args.Length-1],child.Id.ToString());
    Thread.Sleep(30000);
  }
}
'@ -OutputAssembly $fake -OutputType ConsoleApplication
  $pidFile=Join-Path $root 'git-child.pid'
  try {Invoke-MarketPulseGit -RepoPath $root -Arguments @('hang',$pidFile) -Executable $fake -TimeoutSeconds 2 | Out-Null;throw 'Git hang was not stopped.'}
  catch {if($_.Exception.Message -ne 'git_command_timeout'){throw}}
  if(Test-Path $pidFile){
    $childId=[int](Get-Content $pidFile)
    Assert-UploadChildStopped $childId 'Git child survived timeout.'
  }else{throw 'Fake Git child did not start.'}
  $env:MARKET_PULSE_UPLOAD_DEADLINE=[DateTimeOffset]::UtcNow.AddSeconds(-1).ToString('o')
  try {Invoke-MarketPulseGit -RepoPath $root -Arguments @('--version') | Out-Null;throw 'Expired budget accepted.'}
  catch {if($_.Exception.Message -ne 'upload_time_budget_exhausted'){throw}}
  $env:MARKET_PULSE_UPLOAD_DEADLINE=$originalDeadline
  $zone=[TimeZoneInfo]::FindSystemTimeZoneById('Korea Standard Time')
  $kst=[TimeZoneInfo]::ConvertTime([DateTimeOffset]::UtcNow,$zone)
  $hour=@(8,12,16,20 | Where-Object {$_ -le $kst.Hour} | Select-Object -Last 1)
  if(-not $hour.Count){$hour=@(20);$date=$kst.Date.AddDays(-1)}else{$date=$kst.Date}
  $slotTime=New-Object DateTimeOffset($date.AddHours($hour[0]),[TimeSpan]::FromHours(9))
  $slot=$slotTime.ToString('yyyy-MM-ddTHH:mm:sszzz')
  $nextHour=@(8,12,16,20 | Where-Object {$_ -gt $hour[0]} | Select-Object -First 1)
  $next=if($nextHour.Count){(New-Object DateTimeOffset($date.AddHours($nextHour[0]),[TimeSpan]::FromHours(9))).ToString('yyyy-MM-ddTHH:mm:sszzz')}else{(New-Object DateTimeOffset($date.AddDays(1).AddHours(8),[TimeSpan]::FromHours(9))).ToString('yyyy-MM-ddTHH:mm:sszzz')}
  $fixture=Join-Path $root 'fixture';$scripts=Join-Path $fixture 'scripts'
  New-Item -ItemType Directory $scripts -Force | Out-Null
  Copy-Item (Join-Path $repo 'scripts\*.ps1') $scripts
  New-Item -ItemType Directory (Join-Path $fixture 'chrome-extension') -Force|Out-Null
  Copy-Item (Join-Path $repo 'chrome-extension\scan-policy.js') (Join-Path $fixture 'chrome-extension\scan-policy.js')
  $importer=Join-Path $scripts 'import-extension-results.ps1'
  [IO.File]::WriteAllText($importer,@'
param([string]$RepoPath,[switch]$WaitForToday,[string]$ExpectedSlotStart)
[IO.File]::AppendAllText((Join-Path $RepoPath 'worker-launch-count.txt'),'started'+[Environment]::NewLine)
$child=Start-Process powershell.exe -ArgumentList '-NoProfile -NonInteractive -Command "Start-Sleep -Seconds 30"' -WindowStyle Hidden -PassThru
[IO.File]::WriteAllText((Join-Path $RepoPath 'worker-child.pid'),[string]$child.Id)
while($true){Start-Sleep -Seconds 1}
'@)
  $runner=Join-Path $scripts 'run-scheduled-upload.ps1'
  # Keep the scenario inside its upload window even when CI runs after 22:30.
  # Advance from the synthetic slot using real elapsed time so timeout/kill tests stay real.
  $clockOrigin=[DateTimeOffset]::UtcNow.ToString('o')
  $scenarioNow=$slotTime.AddMinutes(30).ToString('o')
  $runnerSource=Get-Content -LiteralPath $runner -Raw -Encoding UTF8
  $clockExpression="([DateTimeOffset]::Parse('$scenarioNow').Add(([DateTimeOffset]::UtcNow-[DateTimeOffset]::Parse('$clockOrigin'))))"
  $runnerSource=$runnerSource.Replace('[DateTimeOffset]::UtcNow',$clockExpression)
  [IO.File]::WriteAllText($runner,$runnerSource,(New-Object Text.UTF8Encoding($true)))
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $runner -RepoPath $fixture -TimeoutSeconds 5 -ExpectedSlotStart $slot
  if($LASTEXITCODE -ne 1){throw 'Whole upload timeout did not fail.'}
  $budget=Get-Content (Join-Path $fixture 'reports\scheduled-upload-budget.json') -Raw | ConvertFrom-Json
  if(-not $budget.exhausted -or $budget.status -ne 'timed-out'){throw 'Timeout status missing.'}
  $workerChild=[int](Get-Content (Join-Path $fixture 'worker-child.pid'))
  Assert-UploadChildStopped $workerChild 'Upload child survived timeout.'
  $launchCount=[IO.File]::ReadAllText((Join-Path $fixture 'worker-launch-count.txt'))
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $runner -RepoPath $fixture -TimeoutSeconds 5 -ExpectedSlotStart $slot
  if($LASTEXITCODE -ne 1 -or [IO.File]::ReadAllText((Join-Path $fixture 'worker-launch-count.txt')) -cne $launchCount){throw 'Same slot restarted an exhausted worker.'}
  [IO.File]::WriteAllText($importer,('param([string]$RepoPath,[switch]$WaitForToday,[string]$ExpectedSlotStart)'+[Environment]::NewLine))
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $runner -RepoPath $fixture -TimeoutSeconds 20 -ExpectedSlotStart $next
  if($LASTEXITCODE -ne 0){throw 'Next slot could not run.'}
  $budget=Get-Content (Join-Path $fixture 'reports\scheduled-upload-budget.json') -Raw | ConvertFrom-Json
  if($budget.exhausted -or $budget.status -ne 'completed'){throw 'Next slot budget not reset.'}
  . (Join-Path $scripts 'supplier-daily.ps1')
  $mutex=Enter-MarketPulseRepositoryLock $fixture 1
  $mutex.ReleaseMutex();$mutex.Dispose()
  # Run the real worker/importer against an empty isolated download folder.
  # While it waits for a result, independent inventory must acquire the repo lock.
  $waitFolder=Join-Path $root 'empty-downloads';New-Item -ItemType Directory $waitFolder | Out-Null
  $waitMarker=Join-Path $root 'price-waiting.txt'
  $actual=Get-Content (Join-Path $repo 'scripts\import-extension-results.ps1') -Raw -Encoding UTF8
  $actual=$actual.Replace("`$resultFolder = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads\MarketPulse'","`$resultFolder = '"+$waitFolder.Replace("'","''")+"'")
  $actual=$actual.Replace('  Start-Sleep -Seconds 30',"  [IO.File]::WriteAllText('"+$waitMarker.Replace("'","''")+"','waiting');Start-Sleep -Seconds 30")
  [IO.File]::WriteAllText($importer,$actual,(New-Object Text.UTF8Encoding($true)))
  $arguments=@('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',$runner,'-RepoPath',$fixture,'-Worker','-ExpectedSlotStart',$slot)
  $waiter=$null
  try {
    $waiter=Start-Process powershell.exe -ArgumentList (($arguments | ForEach-Object {ConvertTo-MarketPulseArgument $_}) -join ' ') -WindowStyle Hidden -PassThru
    # Common-protocol policy reads add process startup work on Windows CI.
    # Readiness is bounded separately from the real timeout/cleanup assertions above.
    for($i=0;$i -lt 300 -and -not (Test-Path $waitMarker) -and -not $waiter.HasExited;$i++){Start-Sleep -Milliseconds 100}
    if(-not (Test-Path $waitMarker) -or $waiter.HasExited){
      $workerLog=Join-Path $fixture 'reports\scheduled-upload.log'
      if(Test-Path $workerLog){Get-Content $workerLog -Encoding UTF8 -Tail 24 | Write-Host}
      throw 'Actual price worker did not reach the isolated collection wait.'
    }
    $inventoryLock=Enter-MarketPulseRepositoryLock $fixture 1
    $inventoryLock.ReleaseMutex();$inventoryLock.Dispose()
  } finally {if($waiter){Stop-MarketPulseProcessTree $waiter;$waiter.Dispose()}}
  Write-Host 'Git timeout/child cleanup, whole upload timeout, exhausted retry, next-slot reset and independent inventory lock access during actual price wait passed.'
} finally {
  $env:MARKET_PULSE_UPLOAD_DEADLINE=$originalDeadline
  Remove-Item $root -Recurse -Force -ErrorAction SilentlyContinue
}
