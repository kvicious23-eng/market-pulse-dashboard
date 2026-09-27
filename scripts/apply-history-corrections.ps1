function Apply-HistoryCorrections {
  param([object[]]$Rows,[string]$CorrectionsPath)
  $combined=@($Rows)
  $corrections=@(if (Test-Path $CorrectionsPath) {
    Get-Content -Path $CorrectionsPath -Raw -Encoding UTF8 | ConvertFrom-Json
  })
  foreach ($correction in $corrections) {
    $fixed=$correction.corrected
    $matching=@($combined | Where-Object {
      [string]$_.'수집시각' -eq [string]$fixed.'수집시각' -and
      [string]$_.'브랜드' -eq [string]$fixed.'브랜드' -and
      [string]$_.MTM -eq [string]$fixed.MTM
    })
    if ($matching.Count -gt 1) {
      # A PC CSV can contain repeated copies of both the old row and the
      # audited correction. Validate every copy before retaining one.
      $verified=@(foreach ($candidate in $matching) {
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
        [pscustomobject]@{ Row=$candidate; IsCorrected=$isCorrected }
      })
      $preferred=@($verified | Where-Object IsCorrected | Select-Object -First 1)
      $keep=if ($preferred.Count -gt 0) { $preferred[0].Row } else { $verified[0].Row }
      $kept=$false
      $combined=@(foreach ($candidate in $combined) {
        if ([string]$candidate.'수집시각' -eq [string]$fixed.'수집시각' -and
            [string]$candidate.'브랜드' -eq [string]$fixed.'브랜드' -and
            [string]$candidate.MTM -eq [string]$fixed.MTM) {
          if (-not $kept -and [object]::ReferenceEquals($candidate,$keep)) {
            $kept=$true
            $candidate
          }
        } else { $candidate }
      })
      $matching=@($keep)
    }
    if ($matching.Count -eq 0) {
      $combined += $fixed
      continue
    }
    $entry=$matching[0]
    $alreadyCorrected=$true
    foreach ($field in $fixed.PSObject.Properties.Name) {
      if ([string]$entry.$field -ne [string]$fixed.$field) { $alreadyCorrected=$false; break }
    }
    if ($alreadyCorrected) { continue }
    foreach ($field in $correction.expected.PSObject.Properties.Name) {
      if ([string]$entry.$field -ne [string]$correction.expected.$field) {
        throw "Original history differs from audited correction: $($fixed.MTM) $field"
      }
    }
    foreach ($field in $fixed.PSObject.Properties.Name) {
      $entry.$field=[string]$fixed.$field
    }
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
