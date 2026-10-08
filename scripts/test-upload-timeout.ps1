$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'git-timeout.ps1')
$root=Join-Path ([IO.Path]::GetTempPath()) ('market-pulse-upload-timeout-'+[guid]::NewGuid())
$originalDeadline=$env:MARKET_PULSE_UPLOAD_DEADLINE
try {
  New-Item -ItemType Directory $root -Force | Out-Null
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
    if(Get-Process -Id $childId -ErrorAction SilentlyContinue){throw 'Git child survived timeout.'}
  }else{throw 'Fake Git child did not start.'}
  $env:MARKET_PULSE_UPLOAD_DEADLINE=[DateTimeOffset]::UtcNow.AddSeconds(-1).ToString('o')
  try {Invoke-MarketPulseGit -RepoPath $root -Arguments @('--version') | Out-Null;throw 'Expired budget accepted.'}
  catch {if($_.Exception.Message -ne 'upload_time_budget_exhausted'){throw}}
  $env:MARKET_PULSE_UPLOAD_DEADLINE=$originalDeadline
  $fixture=Join-Path $root 'fixture';$scripts=Join-Path $fixture 'scripts'
  New-Item -ItemType Directory $scripts -Force | Out-Null
  Copy-Item (Join-Path $repo 'scripts\*.ps1') $scripts
  $importer=Join-Path $scripts 'import-extension-results.ps1'
  [IO.File]::WriteAllText($importer,@'
param([string]$RepoPath,[switch]$WaitForToday,[string]$ExpectedSlotStart)
$child=Start-Process powershell.exe -ArgumentList '-NoProfile -NonInteractive -Command "Start-Sleep -Seconds 30"' -WindowStyle Hidden -PassThru
[IO.File]::WriteAllText((Join-Path $RepoPath 'worker-child.pid'),[string]$child.Id)
while($true){Start-Sleep -Seconds 1}
'@)
  $runner=Join-Path $scripts 'run-scheduled-upload.ps1'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $runner -RepoPath $fixture -TimeoutSeconds 5 -ExpectedSlotStart '2026-10-08T08:00:00+09:00'
  if($LASTEXITCODE -ne 1){throw 'Whole upload timeout did not fail.'}
  $budget=Get-Content (Join-Path $fixture 'reports\scheduled-upload-budget.json') -Raw | ConvertFrom-Json
  if(-not $budget.exhausted -or $budget.status -ne 'timed-out'){throw 'Timeout status missing.'}
  $workerChild=[int](Get-Content (Join-Path $fixture 'worker-child.pid'))
  if(Get-Process -Id $workerChild -ErrorAction SilentlyContinue){throw 'Upload child survived timeout.'}
  $watch=[Diagnostics.Stopwatch]::StartNew()
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $runner -RepoPath $fixture -TimeoutSeconds 5 -ExpectedSlotStart '2026-10-08T08:00:00+09:00'
  if($LASTEXITCODE -ne 1 -or $watch.Elapsed.TotalSeconds -gt 3){throw 'Same slot restarted an exhausted worker.'}
  [IO.File]::WriteAllText($importer,('param([string]$RepoPath,[switch]$WaitForToday,[string]$ExpectedSlotStart)'+[Environment]::NewLine))
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $runner -RepoPath $fixture -TimeoutSeconds 20 -ExpectedSlotStart '2026-10-08T12:00:00+09:00'
  if($LASTEXITCODE -ne 0){throw 'Next slot could not run.'}
  $budget=Get-Content (Join-Path $fixture 'reports\scheduled-upload-budget.json') -Raw | ConvertFrom-Json
  if($budget.exhausted -or $budget.status -ne 'completed'){throw 'Next slot budget not reset.'}
  . (Join-Path $scripts 'supplier-daily.ps1')
  $mutex=Enter-MarketPulseRepositoryLock $fixture 1
  $mutex.ReleaseMutex();$mutex.Dispose()
  Write-Host 'Git timeout/child cleanup, whole upload timeout, exhausted retry, next-slot reset and lock release passed.'
} finally {
  $env:MARKET_PULSE_UPLOAD_DEADLINE=$originalDeadline
  Remove-Item $root -Recurse -Force -ErrorAction SilentlyContinue
}
