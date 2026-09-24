function Apply-HistoryCorrections {
  param([object[]]$Rows,[string]$CorrectionsPath)
  $combined=@($Rows)
  if (-not (Test-Path $CorrectionsPath)) { return $combined }
  $corrections=@(Get-Content -Path $CorrectionsPath -Raw -Encoding UTF8 | ConvertFrom-Json)
  foreach ($correction in $corrections) {
    $fixed=$correction.corrected
    $matching=@($combined | Where-Object {
      [string]$_.'수집시각' -eq [string]$fixed.'수집시각' -and
      [string]$_.'브랜드' -eq [string]$fixed.'브랜드' -and
      [string]$_.MTM -eq [string]$fixed.MTM
    })
    if ($matching.Count -gt 1) { throw "Duplicate history rows for audited correction: $($fixed.MTM) $($fixed.'수집시각')" }
    if ($matching.Count -eq 0) {
      $combined += $fixed
      continue
    }
    $entry=$matching[0]
    if ([string]$entry.'수집결과' -eq 'success') {
      foreach ($field in @('상태','쿠폰할인 총금액','카드할인','최종 실구매가','상품 URL')) {
        if ([string]$entry.$field -ne [string]$fixed.$field) {
          throw "Verified history differs from audited correction: $($fixed.MTM) $field"
        }
      }
      continue
    }
    foreach ($field in $correction.expected.PSObject.Properties.Name) {
      if ([string]$entry.$field -ne [string]$correction.expected.$field) {
        throw "Original history differs from audited correction: $($fixed.MTM) $field"
      }
    }
    foreach ($field in $fixed.PSObject.Properties.Name) {
      $entry.$field=[string]$fixed.$field
    }
  }
  return $combined
}
