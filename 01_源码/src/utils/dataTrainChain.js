// dataTrainChain.js —— 资料速算「同材料连问」：同一篇 文字+表格+统计图 材料连续出 5 问
import { normalizeSvg } from './svgFix'

function hashIdx(n, len) { let h = n >>> 0; return ((h % len) + len) % len }
function shuffle(a, seed) {
  const arr = a.slice()
  let x = seed >>> 0
  for (let i = arr.length - 1; i > 0; i--) {
    x = (x * 9301 + 49297) % 233280
    const j = Math.floor((x / 233280) * (i + 1))
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t
  }
  return arr
}
const fmt = (n) => Number(n).toLocaleString('en-US')
const KEYS = ['A', 'B', 'C', 'D']
function buildOpts(correct, dists, seed) {
  const set = [String(correct)]
  ;(dists || []).forEach((d) => { const v = String(d); if (!set.includes(v)) set.push(v) })
  while (set.length < 4) set.push('—')
  const at = hashIdx(seed + 3, 4)
  const arr = [' ', ' ', ' ', ' ']
  arr[at] = String(correct)
  const others = shuffle(set.filter((x) => x !== String(correct)), seed + 7).slice(0, 3)
  let k = 0
  for (let i = 0; i < 4; i++) if (arr[i] === ' ') arr[i] = others[k++]
  return { options: KEYS.map((k2, i) => ({ k: k2, t: String(arr[i]) })), answer: KEYS[at] }
}
function unitOf(idx, groupUnit) {
  return idx && idx.units && idx.units[idx.ind] ? idx.units[idx.ind] : (groupUnit || '亿元')
}
function dVal(seed, off, a = 4200, b = 96000) {
  return a + hashIdx(seed + off * 1013, b - a + 1)
}
function dRate(seed, off, min = 0.5, max = 18) {
  const span = Math.round((max - min) * 10) + 1
  return min + hashIdx(seed + off * 131, span) / 10
}
function richChart(labels, vals, rates) {
  const W = 620, H = 340, pl = 76, pr = 66, pt = 30, pb = 50
  const max = Math.max(...vals)
  const yMax = Math.ceil(max / 500) * 500 + 300
  const n = vals.length
  const cw = (W - pl - pr) / n
  const bw = Math.min(52, cw * 0.45)
  const rMin = Math.min(0, ...rates), rMax = Math.max(0, ...rates)
  const rSpan = Math.max(8, rMax - rMin)
  let s = '<rect width="' + W + '" height="' + H + '" fill="#ffffff"/>'
  for (let i = 0; i <= 4; i++) {
    const val = Math.round(((yMax * i) / 4) / 100) * 100
    const y = H - pb - (i / 4) * (H - pt - pb)
    s += '<line x1="' + pl + '" y1="' + y + '" x2="' + (W - pr) + '" y2="' + y + '" stroke="#e2e8f0"/><text x="' + (pl - 8) + '" y="' + (y + 4) + '" font-size="11" text-anchor="end" fill="#666">' + val + '</text>'
    const rv = Math.round(((rMin + (rSpan * i) / 4)) * 10) / 10
    s += '<text x="' + (W - pr + 12) + '" y="' + (y + 4) + '" font-size="11" fill="#dc2626">' + rv + '%</text>'
  }
  const pts = []
  for (let i = 0; i < n; i++) {
    const x = pl + cw * i + cw / 2
    const h = Math.max(6, (vals[i] / yMax) * (H - pt - pb))
    const y = H - pb - h
    s += '<rect x="' + (x - bw / 2) + '" y="' + y + '" width="' + bw + '" height="' + h + '" fill="' + (i === n - 1 ? '#dc2626' : '#2563eb') + '" rx="3"/>'
    s += '<text x="' + x + '" y="' + (y - 5) + '" font-size="12" text-anchor="middle" font-weight="700" fill="#333">' + vals[i] + '</text>'
    const py = H - pb - ((rates[i] - rMin) / rSpan) * (H - pt - pb)
    pts.push(x + ',' + py)
    s += '<circle cx="' + x + '" cy="' + py + '" r="5" fill="#fff" stroke="#dc2626" stroke-width="2.5"/>'
    s += '<text x="' + x + '" y="' + (py - 10) + '" font-size="12" text-anchor="middle" fill="#dc2626" font-weight="700">' + rates[i] + '%</text>'
    s += '<text x="' + x + '" y="' + (H - pb + 22) + '" font-size="12" text-anchor="middle" fill="#333">' + labels[i] + '</text>'
  }
  s += '<polyline points="' + pts.join(' ') + '" fill="none" stroke="#dc2626" stroke-width="2.5"/>'
  s += '<rect x="' + pl + '" y="6" width="10" height="10" fill="#2563eb"/><text x="' + (pl + 14) + '" y="15" font-size="11" fill="#333">数值（左轴）</text><line x1="' + (pl + 82) + '" y1="11" x2="' + (pl + 102) + '" y2="11" stroke="#dc2626" stroke-width="2.5"/><text x="' + (pl + 106) + '" y="15" font-size="11" fill="#333">同比增速（右轴）</text>'
  return normalizeSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">' + s + '</svg>')
}

function buildChainFromCtx(seed, count, ctx) {
  const years = ctx.years || []
  const cols = (ctx.inds || []).slice(0, 4)
  const rows = ctx.vals || []
  const rates = ctx.rates || []
  const area = ctx.area || '该领域'
  const unit = ctx.unit || '亿元'
  const n = Math.min(Math.max(3, Number(count) || 5), years.length || 5)
  const qs = []
  for (let i = 0; i < n; i++) {
    const ci = (i + 1) % cols.length
    const ti = 1 + ((i * 2 + 1) % Math.max(1, years.length - 1))
    const col = cols[ci] || cols[0]
    const yr = years[ti]
    if (i === 3) {
      const rs = rates[0] || []
      let mi = 0
      rs.forEach((r, idx) => { if (r > rs[mi]) mi = idx })
      const opts = buildOpts(years[mi] + '年', years.filter((y, idx) => idx !== mi).map((y) => y + '年'), seed + i)
      qs.push({ q: '【读图】统计图中哪一年「' + (cols[0] || '主要指标') + '」的同比增速最快？', options: opts.options, answer: opts.answer, explain: '看图看红色折线：最高点对应 ' + years[mi] + ' 年（' + rs[mi] + '%）。', tip: '组合图先认双轴：柱看数值，折线看增速。' })
    } else if (i === 4) {
      const prevYr = years[ti - 1]
      const pairs = [yr + '年与' + prevYr + '年', yr + '年与' + years[Math.max(0, ti - 2)] + '年', prevYr + '年与' + years[Math.max(0, ti - 2)] + '年', (years[Math.min(years.length - 1, ti + 1)] || '') + '年与' + yr + '年']
      const opts = buildOpts(pairs[0], pairs.slice(1), seed + i)
      qs.push({ q: '求' + yr + '年「' + col + '」的同比增速，需要材料中哪两年的数据？', options: opts.options, answer: opts.answer, explain: '求同比增速需 ' + yr + ' 年现期与 ' + prevYr + ' 年基期。', tip: '增速=(现期−基期)÷基期。' })
    } else {
      const correct = rows[ci] ? rows[ci][ti] : 0
      const dists = []
      for (let r2 = 0; r2 < years.length; r2++) {
        for (let c2 = 0; c2 < cols.length; c2++) {
          const v = rows[c2] && rows[c2][r2]
          if ((c2 !== ci || r2 !== ti) && v !== undefined && !dists.includes(fmt(v))) dists.push(fmt(v))
        }
      }
      const opts = buildOpts(fmt(correct), shuffle(dists, seed + i).slice(0, 3), seed + i)
      qs.push({ q: '求' + yr + '年「' + col + '」的数值（单位 ' + unit + '），应读取表中哪一行哪一列？', options: opts.options, answer: opts.answer, explain: '【定位】行 = ' + yr + '年，列 = ' + col + ' → 交叉格 = ' + fmt(correct) + unit + '。', tip: '先锁「行年份 × 列指标」再读格。' })
    }
  }
  return { materialMd: ctx.materialMd || '', materialSvg: ctx.materialSvg || '', qs, total: qs.length, area, _sharedCtx: true }
}

export function buildLocateTableChain(seed, count = 5, dom = null, sharedCtx = null) {
  if (sharedCtx && sharedCtx.vals && sharedCtx.materialMd) {
    return buildChainFromCtx(seed, count, sharedCtx)
  }
  const GENERIC = [
    { g: '种植业', inds: ['粮食产量', '蔬菜产量'], units: { 粮食产量: '万吨', 蔬菜产量: '万吨' } },
    { g: '养殖业', inds: ['肉类产量', '水产品产量'], units: { 肉类产量: '万吨', 水产品产量: '万吨' } },
    { g: '工业', inds: ['钢材产量', '发电量'], units: { 钢材产量: '万吨', 发电量: '亿千瓦时' } },
    { g: '服务业', inds: ['快递业务量', '互联网业务收入'], units: { 快递业务量: '亿件', 互联网业务收入: '亿元' } }
  ]
  const groups = dom
    ? [{ g: String(dom.n || '该领域'), inds: (dom.inds || []).slice(0, 4), units: {} }]
    : shuffle(GENERIC, seed).slice(0, 2)
  if (!dom && groups.length === 1) groups.push(GENERIC[(groups[0] && GENERIC.indexOf(groups[0]) + 1) % GENERIC.length])
  groups.forEach((gr) => {
    const need = dom ? 4 : 2
    while ((gr.inds || []).length < need) gr.inds.push(String(gr.g || '该领域') + '·其他指标')
    gr.inds = gr.inds.slice(0, need)
  })
  const cols = groups.flatMap((gr) => gr.inds)
  const units = groups.flatMap((gr) => gr.inds.map((ind) => unitOf({ ind, units: gr.units }, dom ? dom.unit : '亿元')))
  const years = [2021, 2022, 2023, 2024]
  const rows = years.map((y, ri) => cols.map((c, ci) => dVal(seed, ri * 5 + ci + 2, 4200, 96000)))
  const rates = years.map((y, ri) => cols.map((c, ci) => dRate(seed, ri * 11 + ci + 3)))
  const areaName = dom ? String(dom.n || '该领域') : '综合领域'
  const col0 = cols[0] || '主要指标', col1 = cols[1] || '相关指标'
  const p1 = '2024年，' + areaName + col0 + '为' + fmt(rows[3][0]) + units[0] + '，比上年增长' + rates[3][0] + '%。'
  const p2 = '其中，' + col1 + '为' + fmt(rows[3][1]) + units[1] + '，比上年增长' + rates[3][1] + '%，占' + col0 + '比重较上年继续提升。'
  const p3 = '分年份看，' + areaName + col0 + '总体保持平稳增长，各年增速和绝对规模见表与图。'
  const textMd = p1 + '\n\n' + p2 + '\n\n' + p3
  const head = '| 年份 | ' + cols.join(' | ') + ' |'
  const sep = '| --- | ' + cols.map(() => '---').join(' | ') + ' |'
  const body = years.map((y, ri) => '| ' + y + ' | ' + rows[ri].map((v) => fmt(v)).join(' | ') + ' |').join('\n')
  const unitRow = '| 单位 | ' + units.join(' | ') + ' |'
  const note = '注：本材料为训练模拟数据，非官方实际公布值；包含文字、统计表与组合统计图，排版参照资料分析真题。'
  const materialMd = '【材料】' + areaName + '领域 · ' + col0 + '及相关指标运行情况（2021—2024年）\n\n**一、文字资料**\n\n' + textMd + '\n\n**二、统计表**\n\n' + head + '\n' + sep + '\n' + body + '\n' + unitRow + '\n\n**三、统计图**（柱形为' + col0 + '规模，折线为同比增速）\n\n' + note
  const svg = richChart(years.map((y) => y + '年'), rows.map((r) => r[0]), rates.map((r) => r[0]))
  const qs = []
  const n = Math.min(Math.max(3, Number(count) || 5), 6)
  for (let i = 0; i < n; i++) {
    const ci = (i + 1) % cols.length
    const ti = 1 + ((i * 2 + 1) % 3)
    const col = cols[ci]
    if (i === 3) {
      const rates0 = rates.map((r) => r[0])
      let mi = 0
      rates0.forEach((r, idx) => { if (r > rates0[mi]) mi = idx })
      const opts = buildOpts(years[mi] + '年', years.filter((y, idx) => idx !== mi).map((y) => y + '年'), seed + i)
      qs.push({ q: '【读图】统计图中哪一年「' + col0 + '」的同比增速最快？', options: opts.options, answer: opts.answer, explain: '看图看红色折线：最高点对应 ' + years[mi] + ' 年（' + rates0[mi] + '%）。', tip: '组合图先认双轴：柱看数值，折线看增速。' })
    } else if (i === 4) {
      const pairs = [years[ti] + '年与' + years[ti - 1] + '年', years[ti] + '年与' + years[Math.max(0, ti - 2)] + '年', years[ti - 1] + '年与' + years[Math.max(0, ti - 2)] + '年', years[ti + 1] + '年与' + years[ti] + '年']
      const opts = buildOpts(pairs[0], pairs.slice(1), seed + i)
      qs.push({ q: '求' + years[ti] + '年「' + col + '」的同比增速，需要材料中哪两年的数据？', options: opts.options, answer: opts.answer, explain: '求同比增速需 ' + years[ti] + ' 年现期与 ' + years[ti - 1] + ' 年基期。', tip: '增速=(现期−基期)÷基期。' })
    } else {
      const correct = rows[ti][ci]
      const dists = [rows[ti][(ci + 1) % cols.length], rows[(ti + 1) % 4][ci], rows[(ti + 3) % 4][(ci + 2) % cols.length]].map((v) => fmt(v))
      const opts = buildOpts(fmt(correct), dists, seed + i)
      qs.push({ q: '求' + years[ti] + '年「' + col + '」的数值（单位 ' + units[ci] + '），应读取表中哪一行哪一列？', options: opts.options, answer: opts.answer, explain: '【定位】行 = ' + years[ti] + '年，列 = ' + col + ' → 交叉格 = ' + fmt(correct) + units[ci] + '。', tip: '先锁「行年份 × 列指标」再读格。' })
    }
  }
  return { materialMd, materialSvg: svg, qs, total: qs.length, area: areaName }
}
export function genLocateChain(seed, count = 5, dom = null, sharedCtx = null) {
  if (seed === undefined) seed = Date.now() % 100000
  const min = Math.max(3, Number(count) || 5)
  for (let attempt = 0; attempt < 8; attempt++) {
    const c = buildLocateTableChain(seed + attempt * 977, count, dom, sharedCtx)
    if (c && c.qs && c.qs.length >= min) return c
  }
  return null
}
export default { buildLocateTableChain, genLocateChain }
