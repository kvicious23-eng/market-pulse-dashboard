param([string]$RepoPath = (Split-Path $PSScriptRoot -Parent))
$ErrorActionPreference = 'Stop'
$manifest = Get-Content (Join-Path $RepoPath 'supplier-hub-extension\manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$key = [Convert]::FromBase64String($manifest.key)
$hash = [Security.Cryptography.SHA256]::Create()
try { $bytes = $hash.ComputeHash($key) } finally { $hash.Dispose() }
$extensionId = -join (0..15 | ForEach-Object { [char](97 + ($bytes[$_] -shr 4)); [char](97 + ($bytes[$_] -band 15)) })
$origin = 'chrome-extension://' + $extensionId + '/'
$installPath = Join-Path $env:LOCALAPPDATA 'MarketPulse\SupplierHub'
New-Item -ItemType Directory -Force -Path $installPath | Out-Null
$exe = Join-Path $installPath 'SupplierHubHost.exe'
$bridge = [IO.Path]::GetFullPath((Join-Path $RepoPath 'scripts\supplier-daily-bridge.ps1'))
if (-not (Test-Path -LiteralPath $bridge)) { throw 'Supplier Hub daily bridge script is missing.' }
$source = (Get-Content (Join-Path $RepoPath 'supplier-hub-native\Program.cs') -Raw -Encoding UTF8).Replace('__EXTENSION_ORIGIN__', $origin).Replace('__AUTOMATION_SCRIPT__',$bridge.Replace('\','\\').Replace('"','\"'))
$build = Join-Path $installPath ('SupplierHubHost-' + [Guid]::NewGuid().ToString('N') + '.exe')
Add-Type -TypeDefinition $source -Language CSharp -ReferencedAssemblies @('System.dll','System.Core.dll','System.Web.Extensions.dll','System.Windows.Forms.dll','System.Drawing.dll') -OutputAssembly $build -OutputType ConsoleApplication
# Compile first. A running settings window may prevent replacement; preserve the existing host on failure.
try { Move-Item -LiteralPath $build -Destination $exe -Force } catch { Remove-Item -LiteralPath $build -Force; throw 'Close the Supplier Hub account settings window and run the installer again.' }
$hostManifest = Join-Path $installPath 'com.marketpulse.supplierhub.json'
$hostJson = @{name='com.marketpulse.supplierhub';description='Market Pulse Supplier Hub local credential connector';path=$exe;type='stdio';allowed_origins=@($origin)} | ConvertTo-Json
[IO.File]::WriteAllText($hostManifest, $hostJson, (New-Object Text.UTF8Encoding($false)))
$registry = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.marketpulse.supplierhub'
New-Item -Path $registry -Force | Out-Null
Set-Item -Path $registry -Value $hostManifest
$runner=Join-Path $RepoPath 'scripts\run-supplier-metrics-upload.ps1'
$arguments='-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$runner+'" -RepoPath "'+$RepoPath+'"'
$action=New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument $arguments
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 15)
Register-ScheduledTask -TaskName 'Market Pulse Supplier Metrics' -Action $action -Trigger (New-ScheduledTaskTrigger -Daily -At '08:31') -Settings $settings -Description 'Publish a validated daily Supplier Hub CSV after normal price upload; late file completion starts this same task.' -Force | Out-Null
Write-Host 'Supplier Hub local connector installed for this Windows user.'
Write-Host ('Chrome extension folder: ' + (Join-Path $RepoPath 'supplier-hub-extension'))
Write-Host ('Expected extension ID: ' + $extensionId)
Write-Host 'Load this folder as a separate unpacked extension. Keep the price scanner as it is.'
Write-Host 'Open the Supplier Hub connector icon, register the account in its local window, and check the connection.'
Write-Host 'Daily CSV bridge and hidden metrics publication task installed. Existing saved credentials are retained.'
