// zlChartGroup.js —— 资料分析「图形材料」确定性本地题组（深化·图形材料必有图）
// 当用户选择 图形材料/混合材料 但未配置图形增强模型(fig) 时，用本内置生成器直接产出
// 真·SVG 统计图（柱状/折线/饼图；零 API、坐标合法可渲染）+ 5 道可复算小题，
// 杜绝「选了图形材料却全是表格文字、没有图」。
const pick = (a) => a[Math.floor(Math.random() * a.length)]
const rnd = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1))
function shuffle(a) { const x = a.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]] } return x }
function mkOpts(correct, wrongs) {
  const set = new Set([String(correct)])
  ;(wrongs || []).forEach((w) => { if (w != null && String(w) !== String(correct)) set.add(String(w)) })
  let guard = 0
  while (set.size < 4 && guard++ < 14) set.add(String(Number(correct) + (guard % 2 ? -1 : 1) * (7 + guard * 9)))
  const arr = [...set].slice(0, 4)
  const ci = arr.indexOf(String(correct))
  if (ci < 0 || arr.length !== 4 || new Set(arr).size !== 4) return null
  const idx = [0, 1, 2, 3]; for (let i = 3; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]] }
  return { opts: idx.map((k) => arr[k]), answer: 'ABCD'[idx.indexOf(ci)] }
}
function Q(stem, correct, wrongs, explain) {
  const o = mkOpts(correct, wrongs)
  if (!o) return null
  return { stem, options: o.opts.map((t, i2) => ({ k: 'ABCD'[i2], t: String(t) })), answer: o.answer, explain }
}
const YR = ['2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026']
function trendData(n) {
  const nYears = Math.min(5, Math.max(3, n + 1))
  const years = YR.slice(YR.length - nYears)
  const incs = shuffle([8, 12, 16, 20, 24, 28, 32, 36, 40]).slice(0, nYears - 1)
  const base = rnd(9, 16) * 10
  const v = [base]
  for (let k = 0; k < nYears - 1; k++) v.push(v[k] + incs[k])
  const unit = pick(['万吨', '亿元', '万辆', '万台'])
  const topic = pick(['粮食产量', '社会消费品零售总额', '新能源汽车销量', '货物运输量'])
  return { years, v, unit, topic }
}
function svgAxes(t) {
  const W = 560, H = 300, L = 48, B = 36, T = 18
  const maxV = Math.max.apply(null, t.v)
  const minV = Math.min.apply(null, t.v)
  const top = maxV + Math.ceil((maxV - minV) / 8) + 5
  const y = (val) => (H - B) - ((val / top) * (H - B - T))
  const xs = (i) => L + ((W - L - 24) / (t.v.length - 1)) * i
  const bw = Math.min(46, ((W - L - 24) / t.v.length) * 0.62)
  const bars = t.v.map((val, i) => {
    const x = L + ((W - L - 24) / t.v.length) * i + ((W - L - 24) / t.v.length - bw) / 2
    const yy = y(val)
    return '<rect x="' + x.toFixed(1) + '" y="' + yy.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (H - B - yy).toFixed(1) + '" fill="#3b82f6" stroke="#1e3a5f" stroke-width="1"/>'
  }).join('')
  const line = t.v.map((val, i) => xs(i).toFixed(1) + ',' + y(val).toFixed(1)).join(' ')
  const dots = t.v.map((val, i) => '<circle cx="' + xs(i).toFixed(1) + '" cy="' + y(val).toFixed(1) + '" r="3.4" fill="#e11d48"/>').join('')
  const xl = t.years.map((yr, i) => '<text x="' + (L + ((W - L - 24) / (t.v.length - 1)) * i).toFixed(1) + '" y="' + (H - B + 18).toFixed(1) + '" font-size="13" text-anchor="middle" fill="#0f172a">' + yr + '</text>').join('')
  const yl = (top > 0 ? Math.max(2, Math.min(6, Math.ceil(top / 60))) : 1)
  let grid = ''
  for (let k = 0; k <= yl; k++) { const val = (top * k) / yl; const yy = y(val); grid += '<line x1="' + L + '" y1="' + yy.toFixed(1) + '" x2="' + (W - 16) + '" y2="' + yy.toFixed(1) + '" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="3 3"/><text x="' + (L - 6) + '" y="' + (yy + 4).toFixed(1) + '" font-size="11" text-anchor="end" fill="#475569">' + Math.round(val) + '</text>' }
  const title = '<text x="' + (W / 2) + '" y="16" font-size="15" font-weight="bold" text-anchor="middle" fill="#0f172a">' + t.topic + '（单位：' + t.unit + '）</text>'
  const axes = '<line x1="' + L + '" y1="' + (H - B) + '" x2="' + (W - 16) + '" y2="' + (H - B) + '" stroke="#334155" stroke-width="1.6"/><line x1="' + L + '" y1="' + T + '" x2="' + L + '" y2="' + (H - B) + '" stroke="#334155" stroke-width="1.6"/>'
  return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">' + title + axes + grid + bars + '<polyline points="' + line + '" fill="none" stroke="#e11d48" stroke-width="2.4"/>' + dots + xl + '</svg>'
}
function svgPie(parts) {
  const W = 420, H = 320, cx = 160, cy = 160, R = 110
  let ang = -Math.PI / 2
  const colors = ['#3b82f6', '#f59e0b', '#10b981', '#e11d48', '#8b5cf6']
  const segs = parts.map((p, i) => {
    const a0 = ang
    const sweep = (p.v / 100) * Math.PI * 2
    ang += sweep
    const x1 = cx + R * Math.cos(a0), y1 = cy + R * Math.sin(a0)
    const x2 = cx + R * Math.cos(ang), y2 = cy + R * Math.sin(ang)
    const large = sweep > Math.PI ? 1 : 0
    return '<path d="M ' + cx + ' ' + cy + ' L ' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' A ' + R + ' ' + R + ' 0 ' + large + ' 1 ' + x2.toFixed(1) + ' ' + y2.toFixed(1) + ' Z" fill="' + colors[i % colors.length] + '" stroke="#fff" stroke-width="1.4"/>'
  }).join('')
  const lx = 268
  const leg = parts.map((p, i) => '<text x="' + lx + '" y="' + (70 + i * 38) + '" font-size="13" fill="#0f172a">' + p.label + '：' + p.v + '%</text><rect x="' + (lx - 18) + '" y="' + (56 + i * 38) + '" width="12" height="12" fill="' + colors[i % colors.length] + '"/>').join('')
  return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg"><text x="' + (W / 2 - 80) + '" y="24" font-size="15" font-weight="bold" fill="#0f172a">某地区三次产业结构占比</text>' + segs + leg + '</svg>'
}
export function genZlChartGroup() {
  for (let tries = 0; tries < 8; tries++) {
    try {
      const kind = pick(['bar', 'line', 'pie'])
      if (kind === 'pie') {
        const shares = shuffle([{ label: '第一产业', v: 15 }, { label: '第二产业', v: 25 }, { label: '第三产业', v: 60 }])
        const svg = svgPie(shares)
        const qs = []
        const _maxV = Math.max.apply(null, shares.map((s) => s.v))
        const _minV = Math.min.apply(null, shares.map((s) => s.v))
        const bigL = shares.find((s) => s.v === _maxV).label
        const small = _minV
        const a = Q('根据饼图所示三次产业结构，占比最大的产业是（　）。', bigL, ['第一产业', '第二产业', '无法判断'], '图例可见第三产业占 60%，为最大。')
        const b = Q('根据饼图所示结构，占比最小的产业其占比约为（　）。', small + '%', ['25%', '60%', '75%'], '最小扇区为第一产业，占 15%。')
        const c = Q('饼图中占比最大的产业比占比最小的约多（　）个百分点。', '45%', ['60%', '35%', '25%'], '60% − 15% = 45%。')
        const d = Q('根据饼图，三次产业合计占比为（　）。', '100%', ['60%', '85%', '120%'], '15% + 25% + 60% = 100%。')
        const e = Q('根据饼图结构判断，以下说法正确的是（　）。', '第三产业占比超过其他两类之和', ['第一产业占比最大', '第二产业占比最小', '三类占比相等'], '60% > 15% + 25% = 40%，故正确。')
        ;[a, b, c, d, e].forEach((x) => { if (x) qs.push(x) })
        if (qs.length === 5) return { kind: 'pie', svg, qs }
        continue
      }
      const t = trendData(4)
      const svg = svgAxes(t)
      const lastI = t.v.length - 1
      const inc = t.v[lastI] - t.v[lastI - 1]
      const pct = Math.round((inc / t.v[lastI - 1]) * 100)
      const yrL = t.years[lastI], yrPrev = t.years[lastI - 1], yr0 = t.years[0]
      const total = t.v.reduce((a, b) => a + b, 0)
      const qs = []
      const a = Q(t.topic + '在 ' + yrL + ' 年比 ' + yrPrev + ' 年增加了约（　）' + t.unit + '。', inc + '', [inc + 5, inc - 3, Math.max(1, inc - 7), inc * 2].map((x) => x + ''), yrL + ' − ' + yrPrev + '：' + t.v[lastI] + ' − ' + t.v[lastI - 1] + ' = ' + inc + '。')
      const b = Q(yrL + ' 年' + t.topic + '同比增速约为（　）。', pct + '%', [pct + 5 + '%', Math.max(1, pct - 8) + '%', (pct * 2) + '%'], '增速 = 增量 / 上年 = ' + inc + ' / ' + t.v[lastI - 1] + ' ≈ ' + pct + '%。')
      const c = Q('图示期间（' + yr0 + '—' + yrL + '）' + t.topic + '合计约（　）' + t.unit + '。', total + '', [total + t.v[0], total - t.v[0], Math.round(total / 2)], '各年相加 = ' + t.v.join(' + ') + ' = ' + total + '。')
      const d = Q('图示期间' + t.topic + '最高的年份是（　）。', yrL, [yr0, t.years[1], t.years[2]], '数值逐年递增，最高为 ' + yrL + '（' + t.v[lastI] + '）。')
      const e = Q('根据图示' + t.topic + '整体变化，以下说法正确的是（　）。', '图示期间' + t.topic + '逐年递增', ['期间先降后升', '各年产量相等', '末年低于首年'], t.v.join(' > ') + '，逐年递增且末年最高。')
      ;[a, b, c, d, e].forEach((x) => { if (x) qs.push(x) })
      if (qs.length === 5) return { kind, svg, qs }
    } catch (e) { /* 换一版数据重试 */ }
  }
  return null
}
export default { genZlChartGroup }
