// 顺序状态机解析器 v2：期望题号/选项字母驱动 + 行中切分 + 内联选项 + 材料挂起
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const pdfjs = require('../node_modules/pdfjs-dist/legacy/build/pdf.mjs')
import { readFileSync } from 'fs'

async function extractLines(file) {
  const data = new Uint8Array(readFileSync(file))
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise
  const lines = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const tc = await page.getTextContent()
    const rows = new Map()
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue
      const y = Math.round(it.transform[5] / 3) * 3
      if (!rows.has(y)) rows.set(y, [])
      rows.get(y).push({ x: it.transform[4], s: it.str })
    }
    for (const [y] of [...rows.entries()].sort((a, b) => b[0] - a[0])) {
      const line = rows.get(y).sort((a, b) => a.x - b.x).map(o => o.s).join('').normalize('NFKC').trim()
      if (line) lines.push(line)
    }
  }
  return lines
}

const isMaterial = (l) => /根据以下资料|根据下表|阅读以下资料|根据所给资料完成|根据下面资料/.test(l)

function parseQuestions(lines) {
  const qs = []
  let cur = null
  let expectN = 1
  let pendingMaterial = []
  for (const line of lines) {
    let rest = line
    let guard = 0
    while (rest.length && guard++ < 14) {
      if (!cur) {
        if (isMaterial(rest)) { pendingMaterial = [rest]; break }
        const m = rest.match(new RegExp('(?:^|[^0-9.])(' + expectN + ')[．.、]\\s*'))
        if (!m) break
        const at = rest.indexOf(expectN + '.')
        cur = { n: expectN, stem: rest.slice(at + String(expectN).length + 1) + (pendingMaterial.length ? '\n【材料】' + pendingMaterial.join(' ') : ''), opts: [] }
        pendingMaterial = []
        qs.push(cur)
        rest = ''
        continue
      }
      const wantOpt = 'ABCD'[cur.opts.length]
      const wantN = cur.n + 1
      const optAt = rest.indexOf(wantOpt + '.')
      const nAt = rest.indexOf(wantN + '.')
      if (optAt === -1 && nAt === -1) {
        if (isMaterial(rest)) { pendingMaterial = pendingMaterial.concat([rest]); break }
        if (rest.trim()) {
          if (cur.opts.length) cur.opts[cur.opts.length - 1] += ' ' + rest.trim()
          else cur.stem += '\n' + rest.trim()
        }
        break
      }
      if (optAt !== -1 && (nAt === -1 || optAt < nAt)) {
        const seg = rest.slice(optAt).trim()
        const parts = seg.split(new RegExp('(?=[BCD][.])')).filter(Boolean)
        for (const pt of parts) {
          const km = pt.match(/^([ABCD])[.]\s*([\s\S]*)$/)
          if (km && cur.opts.length < 4 && km[1] === 'ABCD'[cur.opts.length]) cur.opts.push(km[1] + '.' + km[2])
          else if (cur.opts.length) cur.opts[cur.opts.length - 1] += ' ' + pt
        }
        rest = ''
      } else {
        const at = rest.indexOf(wantN + '.')
        const before = rest.slice(0, at).trim()
        if (before) {
          if (cur.opts.length) cur.opts[cur.opts.length - 1] += ' ' + before
          else cur.stem += ' ' + before
        }
        cur = { n: wantN, stem: rest.slice(at + String(wantN).length + 1) + (pendingMaterial.length ? '\n【材料】' + pendingMaterial.join(' ') : ''), opts: [] }
        pendingMaterial = []
        qs.push(cur)
        rest = ''
      }
    }
  }
  return qs
}

const file = process.argv[2] || 'E:/公务员备考资料/行测/kaogong-review-skill-main/03_资料/5_真题套卷/国考十年+贵州真题/2021年国家公务员录用考试《行测》题（地市级网友回忆版）.pdf'
const lines = await extractLines(file)
const qs = parseQuestions(lines)
const nums = qs.map(q => q.n)
const missing = []
for (let i = 1; i <= (nums[nums.length - 1] || 0); i++) if (!nums.includes(i)) missing.push(i)
console.log('抓题:', qs.length, '范围: 1-' + (nums[nums.length - 1] || 0), '缺失:', missing.length ? missing.join(',') : '无')
console.log('选项数分布:', JSON.stringify(qs.reduce((m, q) => { const k = Math.min(q.opts.length, 5); m[k] = (m[k] || 0) + 1; return m }, {})))
const q21 = qs.find(q => q.n === 21)
console.log('Q21:', JSON.stringify(q21).slice(0, 300))
const qMat = qs.find(q => q.stem.includes('【材料】'))
console.log('带材料题样本:', qMat ? JSON.stringify({ n: qMat.n, head: qMat.stem.slice(0, 120) }) : '(本卷无)')
