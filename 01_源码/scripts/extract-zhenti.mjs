// 真题批量提取器 v2：5_真题套卷 → public/zhenti/*.json + index.json
// 顺序状态机解析（期望题号/选项字母驱动+行中切分+材料挂起+板块归属）
// 用法: node scripts/extract-zhenti.mjs
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const pdfjs = require('../node_modules/pdfjs-dist/legacy/build/pdf.mjs')
import { readFileSync, mkdirSync, writeFileSync, readdirSync } from 'fs'
import path from 'path'

const SRC_DIR = '../03_资料/5_真题套卷/国考十年+贵州真题'
const OUT_DIR = './public/zhenti'
const SECS = ['常识判断', '言语理解', '数量关系', '判断推理', '资料分析']
const isMaterial = (l) => /根据以下资料|根据下表|阅读以下资料|根据所给资料完成|根据下面资料/.test(l)

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

function parseQuestions(lines) {
  const qs = []
  let cur = null
  let expectN = 1
  let pendingMaterial = []
  lines.forEach((line, li) => {
    let rest = line
    let guard = 0
    while (rest.length && guard++ < 14) {
      if (!cur) {
        if (isMaterial(rest)) { pendingMaterial = [rest]; break }
        const m = rest.match(new RegExp('(?:^|[^0-9.])(' + expectN + ')[.．、]\\s*'))
        if (!m) break
        const at = rest.indexOf(expectN + '.')
        cur = { n: expectN, stem: rest.slice(at + String(expectN).length + 1) + (pendingMaterial.length ? '\n【材料】' + pendingMaterial.join(' ') : ''), opts: [], li }
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
        cur = { n: wantN, stem: rest.slice(at + String(wantN).length + 1) + (pendingMaterial.length ? '\n【材料】' + pendingMaterial.join(' ') : ''), opts: [], li }
        pendingMaterial = []
        qs.push(cur)
        rest = ''
      }
    }
  })
  return qs
}

function parsePaper(lines) {
  const bounds = []
  let cursor0 = 0
  SECS.forEach((sec) => {
    const idx = lines.findIndex((l, i) => i >= cursor0 && l.replace(/\s/g, '').includes(sec) && !/^\d{1,3}[.．、]/.test(l))
    if (idx >= 0) { bounds.push({ sec, i: idx }); cursor0 = idx + 1 }
  })
  const qs = parseQuestions(lines)
  const sections = {}
  qs.forEach((q) => {
    let sec = bounds.length ? bounds[bounds.length - 1].sec : '综合'
    for (const b of bounds) { if (q.li >= b.i) sec = b.sec; else break }
    if (!sections[sec]) sections[sec] = []
    sections[sec].push({ n: q.n, stem: q.stem.replace(/\s+$/, ''), opts: q.opts.map(o => o.replace(/\s+/g, ' ').trim()) })
  })
  Object.keys(sections).forEach((k) => {
    sections[k] = sections[k].filter(q => q.opts.length >= 2 && q.stem.length >= 8)
    sections[k].forEach(q => { q.stem = q.stem.trim() })
  })
  return sections
}

function hashName(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h.toString(36).slice(0, 4) }

mkdirSync(OUT_DIR, { recursive: true })
const files = readdirSync(SRC_DIR).filter(f => f.endsWith('.pdf')).sort()
const index = []
let totalQ = 0
for (const f of files) {
  try {
    const full = path.join(SRC_DIR, f)
    const lines = await extractLines(full)
    const sections = parsePaper(lines)
    const nq = Object.values(sections).reduce((n, arr) => n + arr.length, 0)
    if (nq < 30) { console.log('[跳过] 题目过少(' + nq + '): ' + f.slice(0, 40)); continue }
    const yearM = f.match(/(\d{4})年/)
    const isGz = /贵州/.test(f)
    const level = /副省/.test(f) ? '副省级' : /地市/.test(f) ? '地市级' : /行政执法/.test(f) ? '行政执法' : (isGz ? '贵州省考' : '省考')
    const id = (yearM ? yearM[1] : f.slice(0, 4)) + '-' + level + '-' + hashName(f)
    const record = {
      id, year: yearM ? +yearM[1] : null, level,
      title: f.replace(/\.pdf$/, ''),
      answerIncluded: false,
      counts: Object.fromEntries(Object.entries(sections).map(([s, a]) => [s, a.length])),
      totalQ: nq,
      sections
    }
    writeFileSync(path.join(OUT_DIR, id + '.json'), JSON.stringify(record), 'utf-8')
    index.push({ id, year: record.year, level, title: record.title, totalQ: nq, counts: record.counts })
    totalQ += nq
    console.log('[OK] ' + id + ' ' + nq + '题 ' + Object.entries(record.counts).map(([k, v]) => k + v).join('/'))
  } catch (e) {
    console.log('[错误] ' + f.slice(0, 40) + ': ' + String(e.message).slice(0, 60))
  }
}
writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify({
  generatedAt: new Date().toISOString().slice(0, 10),
  note: '真题库当前收录不全：首批为国考2017-2026+贵州卷（网友回忆版，共' + index.length + '卷' + totalQ + '题）。多数回忆版无官方答案，作答后由AI判题；省考专项/资料分析图表题等将持续补充。',
  papers: index
}, null, 1), 'utf-8')
console.log('完成：' + index.length + ' 卷 / ' + totalQ + ' 题 → ' + OUT_DIR)
