# Push the web source repo to GitHub (origin) and Gitee (gitee) after a release.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  git push origin main
  git push gitee main
  Write-Host 'OK: GitHub + Gitee pushed'
} finally {
  Pop-Location
}
