# restart-preview-5199.ps1 — Restart the 5199 preview server to serve the latest dist
# Why: `vite preview` caches dist/index.html at startup. After every dist rebuild
#      (new hashed entry), you MUST restart preview so :5199 serves the new build.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\restart-preview-5199.ps1
$ErrorActionPreference = 'SilentlyContinue'
$runtimeNode = 'C:\Users\LIUYUAN\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$node = if (Test-Path $runtimeNode) { $runtimeNode } else { 'node' }
$repoRoot = Split-Path -Parent $PSScriptRoot
$src = Join-Path $repoRoot '01_源码'

$conn = Get-NetTCPConnection -LocalPort 5199 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) {
  $p = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
  if ($p -and $p.ProcessName -eq 'node') { Stop-Process -Id $conn.OwningProcess -Force; Write-Host "Stopped old preview PID $($conn.OwningProcess)" }
  Start-Sleep -Milliseconds 800
}
$out = Join-Path $env:TEMP 'vite5199.out.log'
$err = Join-Path $env:TEMP 'vite5199.err.log'
$np = Start-Process -FilePath $node -ArgumentList @('node_modules/vite/bin/vite.js','preview','--port','5199','--host') -WorkingDirectory $src -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err -PassThru
Start-Sleep -Seconds 3
$c2 = Get-NetTCPConnection -LocalPort 5199 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($c2) { Write-Host "OK 5199 restarted to latest dist (PID $($c2.OwningProcess)). Hard-refresh the browser (Ctrl+F5)." }
else { Write-Host "Start FAILED. Log:"; Get-Content $err -ErrorAction SilentlyContinue | Select-Object -Last 5 }
