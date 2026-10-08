param([string]$StateRoot=(Join-Path $env:LOCALAPPDATA 'MarketPulseCommander'),[switch]$CheckOnly)
$ErrorActionPreference='Stop'
New-Item -ItemType Directory -Path $StateRoot -Force | Out-Null
$config=Get-Content (Join-Path $StateRoot 'startup.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$session=[Diagnostics.Process]::GetCurrentProcess().SessionId
$log=Join-Path $StateRoot 'startup.log'
$statePath=Join-Path $StateRoot 'status.json'
function Write-CommanderState([string]$Status,[int]$RemotePid=0) {
  $stamp=[DateTimeOffset]::Now.ToString('o')
  $state=@{checkedAt=$stamp;status=$Status;supervisorPid=$PID;remotePid=$RemotePid;sessionId=$session}
  $tmp=$statePath+'.'+$PID+'.tmp'
  [IO.File]::WriteAllText($tmp,($state|ConvertTo-Json -Compress),(New-Object Text.UTF8Encoding($false)))
  Move-Item $tmp $statePath -Force
  if($script:lastStatus -ne $Status) {
    if((Test-Path $log) -and (Get-Item $log).Length -gt 1MB){Move-Item $log ($log+'.previous') -Force}
    Add-Content $log -Encoding UTF8 -Value ($stamp+' '+$Status)
    $script:lastStatus=$Status
  }
}
function Get-CommanderRemote {
  return @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
    $_.SessionId -eq $session -and $_.CommandLine -match 'desktop-commander' -and
    $_.CommandLine -match '(?:^|\s)remote(?:\s|$)' -and $_.CommandLine -notmatch 'npx-cli'
  })
}
function Test-CommanderNetwork {
  $tcp=New-Object Net.Sockets.TcpClient
  try{return $tcp.ConnectAsync('mcp.desktopcommander.app',443).Wait(3000) -and $tcp.Connected}
  catch{return $false}finally{$tcp.Dispose()}
}
if($CheckOnly){
  [pscustomobject]@{existingRemoteCount=@(Get-CommanderRemote).Count;sessionId=$session;nodeExists=(Test-Path $config.nodePath);cachedEntryExists=(Test-Path $config.entryPath);savedSessionExists=(Test-Path (Join-Path $env:USERPROFILE '.desktop-commander-device\device.json'))}
  exit 0
}
$mutex=New-Object Threading.Mutex($false,('Local\MarketPulse.CommanderSupervisor.'+$session))
$held=$false
try{
  try{$held=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$held=$true}
  if(-not $held){exit 0}
  while($true){
    # Preserve a manually started connection; take over only after it exits.
    $existing=@(Get-CommanderRemote)
    if($existing.Count){Write-CommanderState 'existing_remote_observed' ([int]$existing[0].ProcessId);Start-Sleep -Seconds 15;continue}
    if(-not (Test-Path (Join-Path $env:USERPROFILE '.desktop-commander-device\device.json'))){Write-CommanderState 'authorization_required';exit 0}
    if(-not (Test-CommanderNetwork)){Write-CommanderState 'waiting_for_network';Start-Sleep -Seconds 15;continue}
    try{
      $out=Join-Path $StateRoot 'remote-output.log';$err=Join-Path $StateRoot 'remote-error.log'
      if(Test-Path $config.entryPath){
        $child=Start-Process -FilePath $config.nodePath -ArgumentList ('"'+$config.entryPath+'" remote --disable-no-sleep') -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err -PassThru
      }else{
        # Recover a removed npm cache using the same reviewed package version.
        $args='/d /s /c ""'+$config.npxPath+'" --yes @wonderwhy-er/desktop-commander@'+$config.version+' remote --disable-no-sleep"'
        $child=Start-Process -FilePath $env:COMSPEC -ArgumentList $args -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err -PassThru
      }
      Write-CommanderState 'remote_started' $child.Id
      # The Remote CLI handles transient socket reconnection internally.
      while(-not $child.WaitForExit(15000)){Write-CommanderState 'remote_process_running' $child.Id}
      Write-CommanderState ('remote_exited_'+$child.ExitCode)
    }catch{Write-CommanderState 'remote_launch_failed'}
    Start-Sleep -Seconds 30
  }
}finally{if($held){$mutex.ReleaseMutex()};$mutex.Dispose()}
