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
$content = [System.IO.File]::ReadAllText($indexPath)
$pattern = "const REPO_VERSION = '\d+';"
$replacement = "const REPO_VERSION = '$nextVersion';"
$updated = [System.Text.RegularExpressions.Regex]::Replace($content, $pattern, $replacement, 1)

if ($updated -ne $content) {
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($indexPath, $updated, $utf8NoBom)
  git add -- index.html
  Write-Host "Updated REPO_VERSION to $nextVersion"
} else {
  Write-Warning "REPO_VERSION declaration not found; no update applied."
}
