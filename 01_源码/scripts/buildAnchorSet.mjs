// buildAnchorSet.mjs —— 生成 src/data/anchorSet.json（35号批次4-B 锚点题：每板块固定10题，写死不换）
// 用途：单人纵向标定的 θ 绝对校正（doc 35 §3.3）——锚点题=真题固定题，作答结果构成与 b 无关的纯 θ 观测序列。
// 选择规则：按 index.json 试卷顺序扁平化各板块真题（(paper,n) 稳定定位），按步长均匀抽样 10 题，保证确定性、跨年份分布。
import { readFile, writeFile } from 'node:fs/promises'
const ROOT = new URL('../', import.meta.url)
const PLATES = ['常识判断', '言语理解', '数量关系', '判断推理', '资料分析'] // 真题库未收录政治理论独立板块（政治归入常识）；判断推理不分细分子板块
const index = JSON.parse(await readFile(new URL('public/zhenti/index.json', ROOT), 'utf8'))
const poolBy = {}
PLATES.forEach((pl) => { poolBy[pl] = [] })
for (const paper of (index.papers || [])) {
  let rec = null
  for (const pl of PLATES) {
    if (!rec) { try { rec = JSON.parse(await readFile(new URL('public/zhenti/' + paper.id + '.json', ROOT), 'utf8')) } catch (e) { rec = null; break } }
    const qs = rec && rec.sections && rec.sections[pl] ? rec.sections[pl] : []
    qs.forEach((q) => { if (q && q.n) poolBy[pl].push({ paper: paper.id, n: q.n, s: String(q.stem || '').slice(0, 12) }) })
  }
  rec = null
}
const pick = (pool) => {
  const out = []
  const step = pool.length > 10 ? (pool.length - 1) / 9 : 1
  for (let i = 0; i < 10; i++) { const idx = Math.min(pool.length - 1, Math.round(i * step)); const it = pool[idx]; if (it) out.push({ paper: it.paper, n: it.n }) }
  return out
}
const anchors = {}
const counts = {}
PLATES.forEach((pl) => { anchors[pl] = pick(poolBy[pl]); counts[pl] = poolBy[pl].length })
const out = {
  _meta: { source: 'public/zhenti 真题库（index.json 顺序）', rule: '按步长均匀抽样每板块固定10题，永不更换', note: '真题库未收录政治理论独立板块；判断推理未分细分子板块', counts, generatedAt: new Date().toISOString().slice(0, 10) },
  anchors
}
await writeFile(new URL('src/data/anchorSet.json', ROOT), JSON.stringify(out, null, 2) + '\n', 'utf8')
console.log('written anchorSet.json', JSON.stringify(out).length)