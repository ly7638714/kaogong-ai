// sample-zhenti-audit.mjs —— P3-4 真题质量抽样（确定性）：index 内 28 卷按 5 板块各抽 6 题 = 30 题
// 用途：导出《42_真题质量抽样_待人工核验.md》供人工判断题干/选项质量（回忆版无官方答案，不自动判对错）。
// 用法（仓库根目录）：node scripts/sample-zhenti-audit.mjs [输出路径]
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dir = join(root, '01_源码', 'public', 'zhenti')
const outPath = resolve(process.argv[2] || join(root, '05_工程与产品评估', '42_真题质量抽样_待人工核验.md'))

// 确定性伪随机（mulberry32）
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]] }
  return arr
}

const SKIP = new Set(['index.json', 'types.json', 'kpoint-index.json'])
const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'))
const indexed = new Set(index.papers.map((p) => p.id))
const types = JSON.parse(readFileSync(join(dir, 'types.json'), 'utf8'))
const papers = readdirSync(dir)
  .filter((f) => f.endsWith('.json') && !SKIP.has(f) && indexed.has(f.replace(/\.json$/, '')))
  .sort()
  .map((f) => ({ id: f.replace(/\.json$/, ''), data: JSON.parse(readFileSync(join(dir, f), 'utf8')) }))

const plates = ['常识判断', '言语理解', '数量关系', '判断推理', '资料分析'] // 真题回忆卷无「政治」板块
const PER = 6
const rand = rng(20260905)
const picks = []
for (const plate of plates) {
  const cands = []
  for (const p of papers) {
    const sec = p.data.sections && p.data.sections[plate]
    if (!sec) continue
    sec.forEach((q) => {
      const t = (types.papers[p.id] && types.papers[p.id][String(q.n)]) || '未分类'
      cands.push({ paper: p.id, year: p.data.year, title: p.data.title, n: q.n, type: t, stem: q.stem, opts: q.opts })
    })
  }
  shuffle(cands, rand)
  picks.push(...cands.slice(0, PER).map((c) => ({ ...c, plate })))
}

const L = []
L.push('# 42 · 真题质量抽样 · 待人工核验（2026-09-05）')
L.push('')
L.push(`> 抽样范围：**index.json 收录的 ${indexed.size} 卷**（孤儿卷不参与）；抽样方法：确定性种子 20260905，按 5 板块各抽 ${PER} 题 = **${picks.length} 题**（真题回忆卷无「政治」板块，故为 5×${PER}）。`)
L.push('> 用途：人工核验题干/选项的**可读性与结构质量**（回忆版 answer 均为空、由 AI 判题，本表**不判对错**）。')
L.push('> 判定指引：对每题勾选「✅ 可接受 / ⚠️ 存疑（题干残缺/选项错乱/明显笔误）/ ❌ 不可用」。若 ⚠️+❌ 占比 ≥10%（即 <90% 可信），建议锚点题改用本地确定性生成（见 40 号 §3）。')
L.push('')
L.push('## 抽样结果')
L.push('')
const rows = picks.map((c, i) => `| ${i + 1} | ${c.plate} | ${c.year}·${c.title}（${c.paper}） | 第${c.n}题 | ${c.type} | ✅/⚠️/❌ |`).join('\n')
L.push('| # | 板块 | 卷 | 题号 | 题型 | 判定 |')
L.push('| --- | --- | --- | --- | --- | --- |')
L.push(rows)
L.push('')
L.push('## 逐题内容（供核验）')
L.push('')
for (let i = 0; i < picks.length; i++) {
  const c = picks[i]
  L.push(`### ${i + 1}. [${c.plate}·${c.type}] ${c.year} ${c.title}（${c.paper} 第${c.n}题）`)
  L.push('')
  L.push('**题干：**')
  L.push('')
  L.push('```')
  L.push(c.stem)
  L.push('```')
  L.push('')
  L.push('**选项：**')
  L.push('')
  ;(c.opts || []).forEach((o) => L.push('- ' + o))
  L.push('')
  L.push('**判定：** ✅ 可接受 / ⚠️ 存疑 / ❌ 不可用（原因：____）')
  L.push('')
}
mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, L.join('\n'), 'utf8')
console.log(`已生成 ${outPath}（${picks.length} 题）`)