// buildZhentiIndex.mjs —— 生成 public/zhenti/kpoint-index.json（35号批次5：真题蓝本 RAG 索引，构建期一次性）
// 目标：把 3583 道真题的 (paper,n,板块,题型,题干骨架) 做成倒排检索源，运行时零成本按需 fetch，
//       供出题时按同板块/同题型检索 2-3 道真题骨架作 few-shot 蓝本（默认关，设置项开启）。
import { readFile, writeFile } from 'node:fs/promises'
const ROOT = new URL('../', import.meta.url)
const index = JSON.parse(await readFile(new URL('public/zhenti/index.json', ROOT), 'utf8'))
let types = null
try { types = JSON.parse(await readFile(new URL('public/zhenti/types.json', ROOT), 'utf8')) } catch (e) {}
const norm = (s) => String(s || '').replace(/\s+/g, '').replace(/[【】（）()“”"'《》，。、；：？！?！.…·-]/g, '')
const qs = []
let total = 0
for (const paper of (index.papers || [])) {
  let rec = null
  try { rec = JSON.parse(await readFile(new URL('public/zhenti/' + paper.id + '.json', ROOT), 'utf8')) } catch (e) { continue }
  const tmap = types && types.papers ? types.papers[paper.id] || {} : {}
  Object.keys(rec.sections || {}).forEach((plate) => {
    const sec = rec.sections[plate]
    if (!Array.isArray(sec)) return
    sec.forEach((q) => {
      if (!q || !q.stem) return
      total++
      qs.push({
        p: paper.id,
        n: Number(q.n) || 0,
        pl: plate,
        ty: (tmap && tmap[String(q.n)]) || '',
        s: norm(String(q.stem)).slice(0, 200)
      })
    })
  })
}
const out = { _meta: { source: 'public/zhenti/*.json + types.json', total, note: '题干骨架经空白/标点归一，仅用于检索与相似度比对；运行时按需 fetch 不打包', generatedAt: new Date().toISOString().slice(0, 10) }, qs }
await writeFile(new URL('public/zhenti/kpoint-index.json', ROOT), JSON.stringify(out), 'utf8')
console.log('written kpoint-index.json entries:', total, 'bytes:', JSON.stringify(out).length)