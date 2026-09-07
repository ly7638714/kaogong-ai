// scripts/update-shizheng.mjs —— 时政月度滚动更新（人工整理要点 txt → 去重入库）
// 用法：node scripts/update-shizheng.mjs [要点txt路径]
//   txt 行格式（| 或 ｜ 分隔）：表述｜正确术语｜干扰项1｜干扰项2
//   （可多组干扰项；至少 1 组）
// 默认读取：03_资料/4_政治理论/_时政要点导入.txt；不存在则跳过（非阻塞）。
// 产出：追加到 01_源码/src/data/shizhengExtra.js（zzGen 自动合并，去重以表述为准）。

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const extraPath = join(root, '01_源码', 'src', 'data', 'shizhengExtra.js')
const defaultIn = join(root, '03_资料', '4_政治理论', '_时政要点导入.txt')
const input = process.argv[2] || defaultIn

if (!existsSync(input)) {
  console.log(`未找到要点文件（${input}），跳过。可先整理一行一题的 txt 再运行。`)
  process.exit(0)
}

// 读取现有增量池（去重）
const src = readFileSync(extraPath, 'utf8')
const existing = [...src.matchAll(/\[\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*,\s*\[([^\]]*)\]\s*\]/g)].map((m) => ({
  stmt: m[1], term: m[2], decoys: m[3].split(',').map((s) => s.trim().replace(/^'|'$/g, ''))
}))
const known = new Set(existing.map((e) => e.stmt))

const lines = readFileSync(input, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
let added = 0
const skipped = []
const news = []

for (const line of lines) {
  if (line.startsWith('#') || line.startsWith('//')) continue
  const parts = line.split(/[|｜]/).map((s) => s.trim()).filter(Boolean)
  if (parts.length < 3) { skipped.push('格式不足: ' + line.slice(0, 40)); continue }
  const [stmt, term, ...decoys] = parts
  if (known.has(stmt)) { skipped.push('重复: ' + stmt.slice(0, 40)); continue }
  known.add(stmt)
  news.push({ stmt, term, decoys })
  added++
}

if (!added) {
  console.log(`无新增条目（读取 ${lines.length} 行，跳过 ${skipped.length}）。`)
  process.exit(0)
}

const esc = (s) => "'" + s.replace(/'/g, "\\'") + "'"
const all = [...existing, ...news]
const block = all.map((e) => `  [${esc(e.stmt)}, ${esc(e.term)}, [${e.decoys.map(esc).join(', ')}]],`).join('\n')
const newSrc = `// data/shizhengExtra.js —— 时政增量事实池（由 scripts/update-shizheng.mjs 追加，请勿手改）\n// 条目格式与 zzGen 的 FACTS 一致：[表述, 正确术语, [干扰项...]]\nexport const SHIZHENG_EXTRA = [\n${block}\n]\n`
writeFileSync(extraPath, newSrc, 'utf8')

console.log(`已入库 ${added} 条；跳过 ${skipped.length} 条（含重复/格式不足）。`)
if (skipped.length) skipped.slice(0, 5).forEach((s) => console.log('  -', s))
