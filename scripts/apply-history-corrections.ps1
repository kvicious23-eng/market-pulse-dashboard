function Apply-HistoryCorrections {
  param([object[]]$Rows,[string]$CorrectionsPath)
  $combined=@($Rows)
  if (-not (Test-Path $CorrectionsPath)) { throw "Audited history corrections are missing: $CorrectionsPath" }
  # Windows PowerShell 5.1 may emit a JSON array as one pipeline object. A
  # direct cast preserves its seven entries as individual correction records.
  $corrections=[object[]](Get-Content -Path $CorrectionsPath -Raw -Encoding UTF8 | ConvertFrom-Json)
  if ($corrections.Count -eq 0 -or -not $corrections[0].PSObject.Properties['corrected']) {
    throw "Audited history corrections could not be loaded as records: $CorrectionsPath"
  }
  foreach ($correction in $corrections) {
    $fixed=$correction.corrected
    $matching=@($combined | Where-Object {
      [string]$_.'수집시각' -eq [string]$fixed.'수집시각' -and
      [string]$_.'브랜드' -eq [string]$fixed.'브랜드' -and
      [string]$_.MTM -eq [string]$fixed.MTM
    })
    foreach ($candidate in $matching) {
        $isCorrected=$true
        foreach ($field in $fixed.PSObject.Properties.Name) {
          if ([string]$candidate.$field -ne [string]$fixed.$field) { $isCorrected=$false; break }
        }
        $isOriginal=$true
        foreach ($field in $correction.expected.PSObject.Properties.Name) {
          if ([string]$candidate.$field -ne [string]$correction.expected.$field) { $isOriginal=$false; break }
        }
        if (-not $isCorrected -and -not $isOriginal) {
          throw "Conflicting duplicate for audited correction: $($fixed.MTM) $($fixed.'수집시각')"
        }
    }
    # Replace every audited key with its exact corrected row, regardless of
    # how many stale copies the ignored PC CSV still contains.
    $combined=@($combined | Where-Object {
      [string]$_.'수집시각' -ne [string]$fixed.'수집시각' -or
      [string]$_.'브랜드' -ne [string]$fixed.'브랜드' -or
      [string]$_.MTM -ne [string]$fixed.MTM
    })
    $combined+= $fixed
  }
  # Keep one row per scan time, brand and product, including historical rows
  # without an audited correction. Never discard a conflicting value silently.
  $seen=@{}
  $unique=@(foreach ($row in $combined) {
    $key="$($row.'수집시각')|$($row.'브랜드')|$($row.MTM)"
    if (-not $seen.ContainsKey($key)) {
      $seen[$key]=$row
      $row
      continue
    }
    $original=$seen[$key]
    $fields=@($original.PSObject.Properties.Name)
    if (@($row.PSObject.Properties.Name).Count -ne $fields.Count) {
      throw "Conflicting history columns for $key"
    }
    foreach ($field in $fields) {
      if (-not $row.PSObject.Properties[$field] -or [string]$row.$field -ne [string]$original.$field) {
        throw "Conflicting history rows for $key ($field)"
      }
    }
  })
  return $unique
}
