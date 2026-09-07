// scripts/tag-zhenti.mjs —— 真题题型打标跑批（规则先行，零成本）
// 用法：node scripts/tag-zhenti.mjs
// 产出：01_源码/public/zhenti/types.json（{ papers:{卷id:{题号:题型}}, summary:{科目:{题型:题量}} }）
// 不修改原始卷 JSON；无法覆盖的题归「综合」。

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifyZhentiType } from '../01_源码/src/utils/zhentiType.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dir = join(root, '01_源码', 'public', 'zhenti')

const papers = {}
const summary = {}
let total = 0
let unknown = 0
const unknownSamples = []

for (const f of readdirSync(dir)) {
  if (f === 'index.json' || f === 'types.json' || !f.endsWith('.json')) continue
  const paper = JSON.parse(readFileSync(join(dir, f), 'utf8'))
  const byNo = {}
  for (const [sec, qs] of Object.entries(paper.sections || {})) {
    for (const q of qs) {
      const t = classifyZhentiType(sec, q.stem)
      const no = String(q.n)
      byNo[no] = t
      total++
      summary[sec] = summary[sec] || {}
      summary[sec][t] = (summary[sec][t] || 0) + 1
      if (t === '综合') {
        unknown++
        if (unknownSamples.length < 8) unknownSamples.push(`[${sec}] ${String(q.stem).slice(0, 40)}`)
      }
    }
  }
  papers[paper.id] = byNo
}

const out = {
  generatedAt: new Date().toISOString().slice(0, 10),
  note: '真题题型规则打标（零成本，规则先行）；无法覆盖归「综合」；可与 index.json counts 对账',
  papers,
  summary
}
writeFileSync(join(dir, 'types.json'), JSON.stringify(out, null, 1), 'utf8')

console.log('总题数:', total)
console.log('综合(未覆盖):', unknown, '占', (unknown / total * 100).toFixed(1) + '%')
for (const [sec, m] of Object.entries(summary)) {
  const arr = Object.entries(m).sort((a, b) => b[1] - a[1])
  console.log(`[${sec}]`, arr.map(([k, v]) => `${k}:${v}`).join('  '))
}
if (unknownSamples.length) {
  console.log('综合样本:')
  unknownSamples.forEach((s) => console.log('  -', s))
}
