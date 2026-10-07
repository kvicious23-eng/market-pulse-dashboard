$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot 'browser-profile.ps1')
$source=Get-Content (Join-Path $repo 'scripts\edge-fallback.ps1') -Raw -Encoding UTF8
$start=$source.IndexOf('function Get-EdgeScannerInstallations {')
$end=$source.IndexOf('$scan = Get-LatestScan',$start)
if ($start -lt 0 -or $end -le $start) { throw 'Edge profile helper missing.' }
. ([ScriptBlock]::Create($source.Substring($start,$end-$start)))
$temp=Join-Path ([IO.Path]::GetTempPath()) ('MarketPulseEdge-'+[guid]::NewGuid().ToString('N'))
$profile=Join-Path $temp 'Default'
$extension=Join-Path $temp 'Scanner'
$id='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
function Save-Profile($Name,$Entry,$Folder=$profile) {
  New-Item -ItemType Directory $Folder -Force | Out-Null
  @{extensions=@{settings=@{$id=$Entry}}} | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $Folder $Name) -Encoding UTF8
}
function Count-Is($Expected) {
  if (@(Get-EdgeScannerInstallations $temp $extension).Count -ne $Expected) { throw "Unexpected Edge installation count: expected $Expected." }
}
try {
  Save-Profile 'Preferences' @{path=$extension;state=1};Count-Is 1
  Save-Profile 'Secure Preferences' @{path=$extension;state=1};Count-Is 1
  Remove-Item (Join-Path $profile 'Preferences')
  Save-Profile 'Secure Preferences' @{path=$extension;location=4};Count-Is 1
  Save-Profile 'Secure Preferences' @{path=$extension;disable_reasons=@(0)};Count-Is 1
  Save-Profile 'Secure Preferences' @{path=$extension;disable_reasons=@(1)};Count-Is 0
  Save-Profile 'Secure Preferences' @{path=$extension;state=0};Count-Is 0
  Save-Profile 'Secure Preferences' @{path=(Join-Path $temp 'Other')};Count-Is 0
  Save-Profile 'Secure Preferences' @{path=$extension};Count-Is 1
  Save-Profile 'Preferences' @{path=$extension;state=1} (Join-Path $temp 'Profile 1');Count-Is 2
  Remove-Item (Join-Path $temp 'Profile 1') -Recurse -Force
  Save-Profile 'Preferences' @{path=$extension;state=0};Count-Is 0
  '{broken' | Set-Content (Join-Path $profile 'Preferences') -Encoding UTF8;Count-Is 1
  Write-Host 'Edge legacy/secure preferences, missing legacy state, explicit disable, path matching, deduplication and ambiguity passed.'
} finally { Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue }
