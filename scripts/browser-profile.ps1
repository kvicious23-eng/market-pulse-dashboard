# Only extension path/enable metadata is read; no credentials or browser session data.
function Get-BrowserExtensionInstallations {
  param([string]$UserDataPath,[string]$ExtensionPath)
  $expectedPath=[IO.Path]::GetFullPath($ExtensionPath).TrimEnd('\')
  foreach ($profile in @(Get-ChildItem $UserDataPath -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq 'Default' -or $_.Name -match '^Profile \d+$' })) {
    $byId=@{}
    foreach ($filename in @('Preferences','Secure Preferences')) {
      $path=Join-Path $profile.FullName $filename
      if (-not (Test-Path -LiteralPath $path)) { continue }
      try { $settings=(Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json).extensions.settings } catch { continue }
      if (-not $settings) { continue }
      foreach ($property in $settings.PSObject.Properties) {
        if ($property.Name -notmatch '^[a-p]{32}$') { continue }
        if (-not $byId.ContainsKey($property.Name)) { $byId[$property.Name]=@{} }
        foreach ($field in @('path','state','disable_reasons')) {
          if ($property.Value.PSObject.Properties[$field]) { $byId[$property.Name][$field]=$property.Value.$field }
        }
      }
    }
    foreach ($id in $byId.Keys) {
      $entry=$byId[$id]
      if (-not $entry.path) { continue }
      try { $path=[IO.Path]::GetFullPath([string]$entry.path).TrimEnd('\') } catch { continue }
      if ($path -ine $expectedPath) { continue }
      # New Edge profiles omit legacy state=1. Explicit disabled state/reasons
      # still exclude an installation; a fresh matching Edge JSON proves execution.
      if ($entry.ContainsKey('state') -and [string]$entry.state -ne '1') { continue }
      if (@($entry.disable_reasons | Where-Object { $null -ne $_ -and [string]$_ -notin @('','0') }).Count) { continue }
      [pscustomobject]@{Profile=$profile.Name;Id=$id}
    }
  }
}

