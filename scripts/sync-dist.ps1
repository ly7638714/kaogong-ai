<#
.synopsis
  一键发布同步脚本：build → 同步 dist 到 02_发布物（网页/iPad）→ 清理旧 hash → 重建发布包 zip。
  用法（仓库根目录下）：
    powershell -ExecutionPolicy Bypass -File scripts/sync-dist.ps1
  或： ./scripts/sync-dist.ps1
.notes
  只同步部署所需 web 资源（index.html / assets / sw.js / workbox / registerSW / manifest / icon）。
  主仓库不再维护旧版 04_安卓/5+App 壳；安卓深度开发由独立仓库
  06_MobileApp-DeepDev（frontend + xingce-app-shell + android-host）单独负责。
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$src  = Join-Path $root '01_源码'
$dist = Join-Path $src 'dist'
$pub  = Join-Path $root '02_发布物'
$docs = Join-Path $root 'docs'
$zipPath = Join-Path $pub '行测名师AI小助理-正式版发布包.zip'

if (-not (Test-Path $dist)) { Write-Error "未找到 dist：$dist，请先确认 01_源码 已安装依赖。"; exit 1 }

Write-Host "==> 构建 dist ..." -ForegroundColor Cyan
Push-Location $src
try {
  # 用 cmd 包裹，避免 PowerShell 把 npm 的 stderr 提示误当错误
  cmd /c "npm run build > `"$root\scripts\_build.log`" 2>&1"
  if ($LASTEXITCODE -ne 0) { Get-Content "$root\scripts\_build.log" -Tail 20; throw "构建失败" }
  Write-Host "    构建成功" -ForegroundColor Green
} finally {
  Pop-Location
  Remove-Item "$root\scripts\_build.log" -Force -ErrorAction SilentlyContinue
}

# 需要从 dist 同步到网页/iPad 的文件（相对路径）
$webFiles = @('index.html','manifest.webmanifest','sw.js','workbox-*.js','registerSW.js','icon.svg','pdf.worker.min.mjs')
$deployDirs = @($pub)

foreach ($d in $deployDirs) {
  if (-not (Test-Path $d)) { Write-Warning "跳过不存在目录：$d"; continue }
  Write-Host "==> 同步到 $d ..." -ForegroundColor Cyan

  # 1) 顶层 web 文件
  foreach ($pat in $webFiles) {
    Get-ChildItem $dist -File -Filter $pat | ForEach-Object { Copy-Item $_.FullName (Join-Path $d $_.Name) -Force }
  }
  # 2) assets 整目录同步（先清空目标 assets 内 index-*，避免残留旧 hash）
  $dstAssets = Join-Path $d 'assets'
  New-Item -ItemType Directory -Force -Path $dstAssets | Out-Null
  Get-ChildItem $dstAssets -Filter 'index-*' -ErrorAction SilentlyContinue | Remove-Item -Force
  # 同时清理旧 hash 的 three/pdf 分包（Vite 分包产物），避免残留旧版本
  Get-ChildItem $dstAssets -Filter 'three-*' -ErrorAction SilentlyContinue | Remove-Item -Force
  Get-ChildItem $dstAssets -Filter 'pdf-*' -ErrorAction SilentlyContinue | Remove-Item -Force
  Get-ChildItem $dstAssets -Filter 'SolidTrain-*' -ErrorAction SilentlyContinue | Remove-Item -Force
  Copy-Item (Join-Path $dist 'assets\*') $dstAssets -Recurse -Force

  Write-Host "    ^ $d 已同步" -ForegroundColor Green
}

# 同步 docs/：作为 Gitee Pages（部署分支 main、部署目录 /docs）的站点内容
if (Test-Path $dist) {
  Write-Host "==> 同步到 Gitee Pages 目录 docs/ ..." -ForegroundColor Cyan
  if (-not (Test-Path $docs)) { New-Item -ItemType Directory -Force -Path $docs | Out-Null }
  Get-ChildItem -LiteralPath $docs -Force | Remove-Item -Recurse -Force
  Copy-Item (Join-Path $dist '*') -Destination $docs -Recurse -Force
  New-Item -ItemType File -Force -Path (Join-Path $docs '.nojekyll') | Out-Null
  Write-Host "    ^ $docs 已同步" -ForegroundColor Green
}

# 重建发布包 zip（不含 APK/文档，只含部署资源）
Write-Host "==> 重建发布包 zip ..." -ForegroundColor Cyan
$stage = Join-Path $env:TEMP ('_synczip_' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $stage | Out-Null
try {
  foreach ($pat in $webFiles) {
    Get-ChildItem $pub -File -Filter $pat | ForEach-Object { Copy-Item $_.FullName (Join-Path $stage $_.Name) -Force }
  }
  Copy-Item (Join-Path $pub 'assets') (Join-Path $stage 'assets') -Recurse -Force
  if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
  Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zipPath -CompressionLevel Optimal
  Write-Host "    ^ $zipPath 已重建" -ForegroundColor Green
} finally {
  Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "✅ 同步完成。网页/iPad 产物已更新；旧 04_安卓 不再同步，安卓开发请走 06_MobileApp-DeepDev。" -ForegroundColor Green
