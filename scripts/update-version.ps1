$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$indexPath = Join-Path $repoRoot 'index.html'

if (-not (Test-Path $indexPath)) {
  Write-Error "index.html not found at $indexPath"
}

$countRaw = git rev-list --count HEAD
if (-not $countRaw) {
  Write-Error "Unable to read git commit count."
}

$nextVersion = ([int]$countRaw) + 1
$now = Get-Date
$repoDate = "{0}.{1}.{2}" -f $now.Month, $now.Day, ($now.Year % 100)

$content = [System.IO.File]::ReadAllText($indexPath)
$versionPattern = "const REPO_VERSION = '\d+';"
$versionReplacement = "const REPO_VERSION = '$nextVersion';"
$updated = [System.Text.RegularExpressions.Regex]::Replace($content, $versionPattern, $versionReplacement, 1)
$datePattern = "const REPO_DATE = '\d{1,2}\.\d{1,2}\.\d{2}';"
$dateReplacement = "const REPO_DATE = '$repoDate';"
$updated = [System.Text.RegularExpressions.Regex]::Replace($updated, $datePattern, $dateReplacement, 1)

if ($updated -ne $content) {
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($indexPath, $updated, $utf8NoBom)
  git add -- index.html
  Write-Host "Updated REPO_VERSION to $nextVersion and REPO_DATE to $repoDate"
} else {
  Write-Warning "REPO_VERSION/REPO_DATE declaration not found; no update applied."
}
