// gen-golden.mjs —— 黄金问题集生成器（P3）：由 437 卡派生可检索的评测问题（纯规则，不调 API）
import { pathToFileURL } from 'url'
import fs from 'fs'

const KB = 'E:/公务员备考资料/行测/kaogong-review-skill-main/01_源码/src/kb'
const FILES = ['cards-panduan', 'cards-yanyu', 'cards-ziliao', 'cards-shuliang', 'cards-changshi', 'cards-zhengzhi']
const ALL = []
for (const f of FILES) {
  const mod = await import(pathToFileURL(KB + '/' + f + '.js').href)
  for (const c of mod.CARDS) ALL.push(c)
}

const items = []
let dup = 0
const seen = new Set()
for (const c of ALL) {
  const signs = (c.signs || []).filter((s) => s && s.length >= 2).slice(0, 3)
  const qs = []
  if (signs.length) qs.push('这题' + c.type + '怎么解：' + signs.join('，'))
  if (signs.length) qs.push(String(c.example && c.example.q || ''))
  qs.push(c.type + '这类题怎么做（' + (signs[0] || '判断要点') + '）')
  for (const q of qs) {
    const t = String(q || '').trim()
    if (!t || t.length < 4) continue
    const key = c.plate + '|' + t
    if (seen.has(key)) { dup++; continue }
    seen.add(key)
    items.push({ id: c.id, plate: c.plate, type: c.type, q: t })
  }
}

const out = { generatedAt: new Date().toISOString().slice(0, 10), cards: ALL.length, items }
const dir = 'E:/公务员备考资料/行测/kaogong-review-skill-main/05_工程与产品评估/_golden'
fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(dir + '/golden.json', JSON.stringify(out, null, 1))
console.log('items=' + items.length + ' dupSkip=' + dup)