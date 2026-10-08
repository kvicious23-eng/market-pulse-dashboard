# Bounded Git execution for Windows PowerShell 5.1. No interactive prompts.
function ConvertTo-MarketPulseArgument([string]$Value) {
  return '"' + (($Value -replace '(\\*)"', '$1$1\"') -replace '(\\+)$', '$1$1') + '"'
}
function Stop-MarketPulseProcessTree($Process) {
  if ($Process.HasExited) { return }
  if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) {
    $killer=New-Object Diagnostics.Process
    $killer.StartInfo.FileName=Join-Path $env:SystemRoot 'System32\taskkill.exe'
    $killer.StartInfo.Arguments='/PID '+$Process.Id+' /T /F'
    $killer.StartInfo.UseShellExecute=$false
    $killer.StartInfo.CreateNoWindow=$true
    [void]$killer.Start()
    if (-not $killer.WaitForExit(5000)) { $killer.Kill() }
    $killer.Dispose()
  } else { $Process.Kill($true) }
  if (-not $Process.WaitForExit(5000)) { throw 'process_tree_stop_failed' }
}
function Invoke-MarketPulseGit {
  param([string]$RepoPath,[string[]]$Arguments,[int]$TimeoutSeconds=600,[string]$Executable='')
  if (-not $Executable) { $Executable=(Get-Command git -ErrorAction Stop).Source }
  if ($env:MARKET_PULSE_UPLOAD_DEADLINE) {
    $remaining=([DateTimeOffset]::Parse($env:MARKET_PULSE_UPLOAD_DEADLINE)-[DateTimeOffset]::UtcNow).TotalSeconds
    if ($remaining -le 0) { throw 'upload_time_budget_exhausted' }
    $TimeoutSeconds=[int][math]::Max(1,[math]::Min($TimeoutSeconds,[math]::Floor($remaining)))
  }
  $process=New-Object Diagnostics.Process
  $started=$false
  try {
    $process.StartInfo.FileName=$Executable
    $process.StartInfo.WorkingDirectory=$RepoPath
    $process.StartInfo.Arguments=(@(@('-C',$RepoPath)+$Arguments) | ForEach-Object {ConvertTo-MarketPulseArgument ([string]$_)}) -join ' '
    $process.StartInfo.UseShellExecute=$false
    $process.StartInfo.CreateNoWindow=$true
    $process.StartInfo.RedirectStandardOutput=$true
    $process.StartInfo.RedirectStandardError=$true
    $process.StartInfo.EnvironmentVariables['GIT_TERMINAL_PROMPT']='0'
    $process.StartInfo.EnvironmentVariables['GCM_INTERACTIVE']='Never'
    [void]$process.Start();$started=$true
    $stdout=$process.StandardOutput.ReadToEndAsync()
    $stderr=$process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit($TimeoutSeconds*1000)) {
      Stop-MarketPulseProcessTree $process
      throw 'git_command_timeout'
    }
    if (-not $stdout.Wait(5000) -or -not $stderr.Wait(5000)) { throw 'git_output_timeout' }
    return [pscustomobject]@{Code=$process.ExitCode;Output=@($stdout.Result -split '\r?\n' | Where-Object {$_});ErrorText=$stderr.Result}
  } finally {
    if ($started -and -not $process.HasExited) { Stop-MarketPulseProcessTree $process }
    $process.Dispose()
  }
}
