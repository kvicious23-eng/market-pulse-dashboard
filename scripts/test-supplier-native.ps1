$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -ne 5) { throw 'Windows PowerShell 5.1 is required.' }
$repo = Split-Path $PSScriptRoot -Parent
$originalInputEncoding = [Console]::InputEncoding
# .NET Framework creates an autoflushing text writer for redirected stdin.
# Its default UTF-8 preamble would corrupt Chrome's binary length prefix.
[Console]::InputEncoding = New-Object Text.UTF8Encoding($false)
$temp = Join-Path ([IO.Path]::GetTempPath()) ('MarketPulseSupplierTest-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
  $exe = Join-Path $temp 'SupplierHubHost.exe'
  $origin = 'chrome-extension://test-origin/'
  $source = (Get-Content (Join-Path $repo 'supplier-hub-native\Program.cs') -Raw -Encoding UTF8).Replace('__EXTENSION_ORIGIN__',$origin)
  Add-Type -TypeDefinition $source -Language CSharp -ReferencedAssemblies @('System.dll','System.Core.dll','System.Web.Extensions.dll','System.Windows.Forms.dll','System.Drawing.dll') -OutputAssembly $exe -OutputType ConsoleApplication
  & $exe --self-test
  if ($LASTEXITCODE -ne 0) { throw ('Supplier credential vault and protocol self-test failed: ' + $LASTEXITCODE) }
  & $exe 'chrome-extension://wrong-origin/'
  if ($LASTEXITCODE -ne 2) { throw 'Unexpected native host origin was accepted.' }
  # Read/status operations accept no password input from the web UI. Test invalid operations without touching the real credential target.
  $start = New-Object Diagnostics.ProcessStartInfo
  $start.FileName=$exe; $start.Arguments=$origin; $start.UseShellExecute=$false
  $start.RedirectStandardInput=$true; $start.RedirectStandardOutput=$true; $start.RedirectStandardError=$true
  $process=New-Object Diagnostics.Process; $process.StartInfo=$start; [void]$process.Start()
  $payload=[Text.Encoding]::UTF8.GetBytes('{"operation":"invalid"}')
  [byte[]]$frame=[BitConverter]::GetBytes([uint32]$payload.Length)+$payload
  if([BitConverter]::ToUInt32($frame,0) -ne $payload.Length){throw 'Test request frame has an invalid size.'}
  $process.StandardInput.BaseStream.Write($frame,0,$frame.Length); $process.StandardInput.BaseStream.Flush(); $process.StandardInput.BaseStream.Close()
  $lengthBytes=New-Object byte[] 4; $offset=0
  while($offset -lt 4){$n=$process.StandardOutput.BaseStream.Read($lengthBytes,$offset,4-$offset);if($n -eq 0){[void]$process.WaitForExit(10000);throw ('No native frame returned. Exit: '+$process.ExitCode+' Category: '+$process.StandardError.ReadToEnd())};$offset+=$n}
  $length=[BitConverter]::ToUInt32($lengthBytes,0)
  if($length -gt 4096){throw 'Native frame unexpectedly large.'}
  $resultBytes=New-Object byte[] $length; $offset=0
  while($offset -lt $length){$n=$process.StandardOutput.BaseStream.Read($resultBytes,$offset,$length-$offset);if($n -eq 0){throw 'Truncated native frame.'};$offset+=$n}
  $result=[Text.Encoding]::UTF8.GetString($resultBytes) | ConvertFrom-Json
  if($result.ok -ne $false -or $result.reason -ne 'invalid_operation'){throw 'Invalid native operation was not rejected.'}
  if(-not $process.WaitForExit(10000)){ $process.Kill(); throw 'Native host did not exit.' }
  if($process.ExitCode -ne 0){throw 'Native protocol failed.'}
  $process.Dispose()
  Write-Host 'Supplier native vault, origin allowlist, and binary framing tests passed.'
} finally { [Console]::InputEncoding = $originalInputEncoding; Remove-Item -LiteralPath $temp -Recurse -Force }
