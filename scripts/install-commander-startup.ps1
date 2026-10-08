param([string]$RepoPath='C:\MarketPulse',[Parameter(Mandatory=$true)][string]$EntryPath,[string]$Version='0.2.52')
$ErrorActionPreference='Stop'
$scriptPath=Join-Path $RepoPath 'scripts\run-commander-remote.ps1'
if(-not (Test-Path $scriptPath) -or -not (Test-Path $EntryPath)){throw 'Commander startup source or cached entry missing.'}
if($Version -notmatch '^\d+\.\d+\.\d+$'){throw 'Invalid package version.'}
$node=(Get-Command node.exe -ErrorAction Stop).Source
$npx=(Get-Command npx.cmd -ErrorAction Stop).Source
$stateRoot=Join-Path $env:LOCALAPPDATA 'MarketPulseCommander'
New-Item -ItemType Directory $stateRoot -Force | Out-Null
$config=@{nodePath=$node;npxPath=$npx;entryPath=[IO.Path]::GetFullPath($EntryPath);version=$Version}
[IO.File]::WriteAllText((Join-Path $stateRoot 'startup.json'),($config|ConvertTo-Json),(New-Object Text.UTF8Encoding($false)))
$user=[Security.Principal.WindowsIdentity]::GetCurrent().Name
$action=New-ScheduledTaskAction -Execute (Join-Path $PSHOME 'powershell.exe') -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$scriptPath+'"') -WorkingDirectory $RepoPath
$trigger=New-ScheduledTaskTrigger -AtLogOn -User $user
$trigger.Delay='PT30S'
$principal=New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'Market Pulse Commander Remote' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Hidden Remote Commander supervisor after Windows login. Preserves existing sessions and restarts an exited client.' -Force | Out-Null
Start-ScheduledTask -TaskName 'Market Pulse Commander Remote'
Write-Output 'Commander logon supervisor registered and started. Existing remote connection is preserved.'
