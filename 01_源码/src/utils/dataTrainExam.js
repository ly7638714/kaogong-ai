// dataTrainExam.js —— v3.8.244 真题式资料分析训练引擎
// 一篇“公报级”材料固定支撑 5 问；每题内部再拆四层：
// 判题型 -> 数据定位 -> 公式选择 -> 计算执行，答案可独立判分并形成能力画像。
import { createSharedPaper } from './dataTrainGen'

const KEYS = ['A', 'B', 'C', 'D']
const r1 = (n) => Math.round(n * 10) / 10
const fmtNum = (n, d = 0) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d })

function hashIdx(n, len) {
  let x = (n ^ (n >>> 16)) * 2654435761 >>> 0
  x = (x ^ (x >>> 13)) * 2246822519 >>> 0
  x = (x ^ (x >>> 16)) >>> 0
  return x % len
}
function shuffle(a, seed) {
  const b = a.slice()
  for (let i = b.length - 1; i > 0; i--) {
    const j = hashIdx(seed + i * 7919, i + 1)
    const t = b[i]; b[i] = b[j]; b[j] = t
  }
  return b
}
function buildLayerOpts(correctList, distList, seed, label = (x) => String(x)) {
  const pool = [label(correctList[0])]
  for (const d of distList || []) {
    const s = label(d)
    if (!pool.includes(s) && pool.length < 4) pool.push(s)
  }
  let n = 1
  while (pool.length < 4) {
    const s = label(correctList[0]) + '·' + (n++)
    if (!pool.includes(s)) pool.push(s)
  }
  const at = hashIdx(seed + 3, 4)
  const correctTxt = label(correctList[0])
  const others = shuffle(pool.filter((x) => x !== correctTxt), seed + 7).slice(0, 3)
  const arr = []
  for (let i = 0; i < 4; i++) arr.push(i === at ? correctTxt : others.shift())
  return {
    options: KEYS.map((k, i) => ({ k, t: arr[i] })),
    answer: KEYS[arr.indexOf(correctTxt)]
  }
}
function layer(q, opts, answer, explain, tip) {
  return { q, options: opts.options, answer: opts.answer, explain, tip }
}
function shareNow(paper, ci = 1, ri = 4) {
  return (paper.vals[ci][ri] / paper.vals[0][ri]) * 100
}
function rateBetween(a, b) {
  return ((b - a) / a) * 100
}
function pickV(seed, arr) { return arr[hashIdx(seed, arr.length)] }
function svgWrap(body, w = 640, h = 340) {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '">' + body + '</svg>'
}
function chartBarSvg(labels, vals) {
  const W = 640, H = 320, pl = 64, pr = 24, pt = 34, pb = 46
  const max = Math.max.apply(null, vals) * 1.15
  const n = vals.length
  const cw = (W - pl - pr) / n
  const bw = Math.min(58, cw * 0.52)
  let s = '<rect width="' + W + '" height="' + H + '" fill="#ffffff"/>'
  for (let i = 0; i <= 4; i++) {
    const y = H - pb - (i / 4) * (H - pt - pb)
    const v = Math.round((max * i) / 4)
    s += '<line x1="' + pl + '" y1="' + y + '" x2="' + (W - pr) + '" y2="' + y + '" stroke="#e2e8f0"/><text x="' + (pl - 8) + '" y="' + (y + 4) + '" font-size="11" text-anchor="end" fill="#64748b">' + v + '</text>'
  }
  for (let i = 0; i < n; i++) {
    const x = pl + cw * i + cw / 2
    const h = Math.max(6, (vals[i] / max) * (H - pt - pb))
    const y = H - pb - h
    s += '<rect x="' + (x - bw / 2) + '" y="' + y + '" width="' + bw + '" height="' + h + '" rx="3" fill="' + (i === n - 1 ? '#dc2626' : '#2563eb') + '"/>'
    s += '<text x="' + x + '" y="' + (y - 6) + '" font-size="11" text-anchor="middle" font-weight="700" fill="#333">' + fmtNum(vals[i]) + '</text>'
    s += '<text x="' + x + '" y="' + (H - pb + 18) + '" font-size="12" text-anchor="middle" fill="#333">' + labels[i] + '</text>'
  }
  return svgWrap(s)
}
function chartLineSvg(labels, vals) {
  const W = 640, H = 320, pl = 58, pr = 44, pt = 32, pb = 46
  const max = Math.max.apply(null, vals) * 1.1
  const n = vals.length
  const cw = (W - pl - pr) / (n - 1 || 1)
  let pts = ''
  let circles = ''
  for (let i = 0; i < n; i++) {
    const x = pl + cw * i
    const y = H - pb - (vals[i] / max) * (H - pt - pb)
    pts += (i ? ' ' : '') + x + ',' + y
    circles += '<circle cx="' + x + '" cy="' + y + '" r="5" fill="#fff" stroke="#2563eb" stroke-width="2.5"/>'
    circles += '<text x="' + x + '" y="' + (y - 9) + '" font-size="11" text-anchor="middle" fill="#333">' + fmtNum(vals[i]) + '</text>'
    circles += '<text x="' + x + '" y="' + (H - pb + 18) + '" font-size="12" text-anchor="middle" fill="#333">' + labels[i] + '</text>'
  }
  let s = '<rect width="' + W + '" height="' + H + '" fill="#ffffff"/>'
  s += '<text x="20" y="18" font-size="13" fill="#333">规模趋势（单位：按材料）</text>'
  for (let i = 0; i <= 4; i++) {
    const y = H - pb - (i / 4) * (H - pt - pb)
    s += '<line x1="' + pl + '" y1="' + y + '" x2="' + (W - pr) + '" y2="' + y + '" stroke="#e2e8f0"/><text x="' + (pl - 8) + '" y="' + (y + 4) + '" font-size="11" text-anchor="end" fill="#64748b">' + Math.round((max * i) / 4) + '</text>'
  }
  s += '<polyline points="' + pts + '" fill="none" stroke="#2563eb" stroke-width="3"/>' + circles
  return svgWrap(s)
}
function chartComboSvg(labels, vals, rates) {
  const W = 640, H = 340, pl = 64, pr = 54, pt = 34, pb = 48
  const max = Math.max.apply(null, vals) * 1.15
  const rMin = Math.min.apply(null, rates), rMax = Math.max.apply(null, rates)
  const rSpan = Math.max(6, rMax - rMin)
  const n = vals.length
  const cw = (W - pl - pr) / n
  const bw = Math.min(54, cw * 0.48)
  let s = '<rect width="' + W + '" height="' + H + '" fill="#ffffff"/>'
  for (let i = 0; i <= 4; i++) {
    const y = H - pb - (i / 4) * (H - pt - pb)
    s += '<line x1="' + pl + '" y1="' + y + '" x2="' + (W - pr) + '" y2="' + y + '" stroke="#e2e8f0"/>'
    s += '<text x="' + (pl - 8) + '" y="' + (y + 4) + '" font-size="10" text-anchor="end" fill="#64748b">' + Math.round((max * i) / 4) + '</text>'
    const rv = Math.round((rMin + (rSpan * i) / 4) * 10) / 10
    s += '<text x="' + (W - pr + 10) + '" y="' + (y + 4) + '" font-size="10" fill="#dc2626">' + rv + '%</text>'
  }
  const line = []
  for (let i = 0; i < n; i++) {
    const x = pl + cw * i + cw / 2
    const h = Math.max(6, (vals[i] / max) * (H - pt - pb))
    const y = H - pb - h
    s += '<rect x="' + (x - bw / 2) + '" y="' + y + '" width="' + bw + '" height="' + h + '" fill="' + (i === n - 1 ? '#dc2626' : '#2563eb') + '" rx="3"/>'
    const ry = H - pb - ((rates[i] - rMin) / rSpan) * (H - pt - pb)
    line.push(x + ',' + ry)
    s += '<circle cx="' + x + '" cy="' + ry + '" r="5" fill="#fff" stroke="#dc2626" stroke-width="2.5"/>'
    s += '<text x="' + x + '" y="' + (ry - 8) + '" font-size="10" text-anchor="middle" fill="#dc2626">' + rates[i] + '%</text>'
    s += '<text x="' + x + '" y="' + (H - pb + 18) + '" font-size="11" text-anchor="middle" fill="#333">' + labels[i] + '</text>'
  }
  s += '<polyline points="' + line.join(' ') + '" fill="none" stroke="#dc2626" stroke-width="2.5"/>'
  return svgWrap(s)
}
function renderRichMaterial(seed, paper) {
  const last = paper.years.length - 1
  const area = paper.area || '某省'
  const main = paper.inds[0]
  const sub = paper.inds[1]
  const sub2 = paper.inds[2]
  const sub3 = paper.inds[3]
  const U = paper.unit
  const V0 = fmtNum(paper.vals[0][0])
  const V3 = fmtNum(paper.vals[0][3])
  const V4 = fmtNum(paper.vals[0][4])
  const R4 = paper.rates[0][last]
  const R3 = paper.rates[0][last - 1]
  const S1 = fmtNum(paper.vals[1][last])
  const S2 = fmtNum(paper.vals[2][last])
  const S3 = fmtNum(paper.vals[3][last])
  const SR1 = paper.rates[1][last]
  const SR2 = paper.rates[2][last]
  const SR3 = paper.rates[3][last]
  const grow5 = Math.round(((paper.vals[0][last] - paper.vals[0][0]) / paper.vals[0][0]) * 1000) / 10
  const titleTpl = pickV(seed, [
    '【材料】' + area + main + '及相关指标运行情况（' + paper.years[0] + '—' + paper.years[last] + '年）',
    '【材料】' + area + main + '与主要分项指标统计',
    '【材料】' + area + main + '运行统计资料（' + paper.years[0] + '—' + paper.years[last] + '年）',
    '【材料】' + area + '主要经济社会指标摘要'
  ])
  const introTpls = [
    '一、总体情况。2024年，' + area + main + '实现' + V4 + U + '，同比增长' + R4 + '%；分项中，' + sub + '为' + S1 + U + '，' + sub2 + '为' + S2 + U + '，' + sub3 + '为' + S3 + U + '。',
    '一、运行综述。统计资料显示，2024年' + area + main + '为' + V4 + U + '，比上年增长' + R4 + '%，其中' + sub + '完成' + S1 + U + '、' + sub2 + '完成' + S2 + U + '、' + sub3 + '完成' + S3 + U + '。',
    '一、指标概况。2024年' + main + '全年实现' + V4 + U + '，同比增速为' + R4 + '%；同期' + sub + '为' + S1 + U + '，' + sub2 + '为' + S2 + U + '，' + sub3 + '为' + S3 + U + '。',
    '一、总量与结构。' + main + '是反映' + area + '相关运行情况的重要指标，2024年为' + V4 + U + '，同比增长' + R4 + '%；其中' + sub + '为' + S1 + U + '、' + sub2 + '为' + S2 + U + '、' + sub3 + '为' + S3 + U + '。'
  ]
  const structTpls = [
    '二、结构变化。分指标看，' + sub + '增速' + SR1 + '%，' + sub2 + '增速' + SR2 + '%，' + sub3 + '增速' + SR3 + '%；' + main + '绝对量较上年净增' + fmtNum(Math.round(paper.vals[0][last] - paper.vals[0][last - 1])) + U + '，与总量增长方向保持一致。',
    '二、分项表现。' + sub + '同比增长' + SR1 + '%，' + sub2 + '同比增长' + SR2 + '%，' + sub3 + '同比增长' + SR3 + '%；主指标' + main + '在2023年' + V3 + U + '的基础上继续走高，2024年达到' + V4 + U + '。',
    '二、内部构成。各分项增速存在差异：' + sub + '为' + SR1 + '%，' + sub2 + '为' + SR2 + '%，' + sub3 + '为' + SR3 + '%；从绝对量看，主指标较上年增加' + fmtNum(Math.round(paper.vals[0][last] - paper.vals[0][last - 1])) + U + '。',
    '二、增速比较。2024年' + main + '同比增速为' + R4 + '%，2023年为' + R3 + '%；' + sub + '、' + sub2 + '、' + sub3 + '增速分别为' + SR1 + '%、' + SR2 + '%、' + SR3 + '%。'
  ]
  const trendTpls = [
    '三、趋势特征。' + paper.years[0] + '年以来，' + main + '整体呈上行趋势，2024年较' + paper.years[0] + '年累计增长' + grow5 + '%；上述数据口径以材料表与趋势图为准。',
    '三、周期观察。从' + paper.years[0] + '—' + paper.years[last] + '年看，' + main + '五年累计增幅约' + grow5 + '%，材料文字、表格与趋势图相互印证。',
    '三、趋势与口径。' + main + '在统计期内保持增长，2024年较' + paper.years[0] + '年增长约' + grow5 + '%，表中增速按可比口径计算。',
    '三、纵向比较。与' + paper.years[0] + '年' + V0 + U + '相比，2024年' + main + '增长约' + grow5 + '%，五年整体处于扩张区间。'
  ]
  const textMd = pickV(seed + 1, introTpls) + '\n\n' + pickV(seed + 2, structTpls) + '\n\n' + pickV(seed + 3, trendTpls)
  const headA = '| 年份 | ' + paper.inds.join(' | ') + ' |'
  const sepA = '| --- | ' + paper.inds.map(() => '---').join(' | ') + ' |'
  const rowsA = paper.years.map((y, ri) => '| ' + y + ' | ' + paper.inds.map((ind, ci) => fmtNum(paper.vals[ci][ri])).join(' | ') + ' |').join('\n')
  const unitRow = '| 单位 | ' + paper.inds.map(() => U).join(' | ') + ' |'
  const tableA = headA + '\n' + sepA + '\n' + rowsA + '\n' + unitRow
  const headB = '| 指标 | ' + paper.years.join(' | ') + ' |'
  const sepB = '| --- | ' + paper.years.map(() => '---').join(' | ') + ' |'
  const rowsB = paper.inds.map((ind, ci) => '| ' + ind + '（' + U + '） | ' + paper.years.map((y, ri) => fmtNum(paper.vals[ci][ri])).join(' | ') + ' |').join('\n')
  const tableB = headB + '\n' + sepB + '\n' + rowsB
  const headC = '| 指标 | 单位 | 2023年 | 2024年 | 2024同比增速 |'
  const sepC = '| --- | --- | --- | --- | --- |'
  const rowsC = paper.inds.map((ind, ci) => '| ' + ind + ' | ' + U + ' | ' + fmtNum(paper.vals[ci][last - 1]) + ' | ' + fmtNum(paper.vals[ci][last]) + ' | ' + paper.rates[ci][last] + '% |').join('\n')
  const tableC = headC + '\n' + sepC + '\n' + rowsC
  const tableNote = '注：①表中数值均为全年累计口径；②增速按可比口径复算；③本材料为训练模拟数据，非官方实际公布值。'
  const tablePick = hashIdx(seed + 5, 3)
  const tableMd = (tablePick === 0 ? tableA : tablePick === 1 ? tableB : tableC) + '\n\n' + tableNote
  const chartPick = hashIdx(seed + 9, 3)
  const labels = paper.years.map((y) => y + '年')
  const svg = chartPick === 0 ? chartBarSvg(labels, paper.vals[0]) : chartPick === 1 ? chartLineSvg(labels, paper.vals[0]) : chartComboSvg(labels, paper.vals[0], paper.rates[0])
  const chartTitle = chartPick === 0 ? '三、年度规模图（柱形）' : chartPick === 1 ? '三、年度规模图（折线）' : '三、年度规模与增速图（柱线组合）'
  const tableTitle = tablePick === 0 ? '二、主要指标表' : tablePick === 1 ? '二、分项统计表（指标横向展开）' : '二、主要指标比较表'
  return {
    materialMd: titleTpl + '\n\n' + textMd + '\n\n' + tableTitle + '\n\n' + tableMd + '\n\n' + chartTitle + '（' + main + '）',
    materialSvg: svg,
    matStyle: 'v' + pickV(seed + 7, [1, 2, 3, 4]),
    tableKind: tablePick,
    chartKind: chartPick
  }
}
const TYPE_META = {
  rate: { name: '增长率', formula: '增长率 = (现期量 − 基期量) ÷ 基期量', locateTip: '先找现期与基期两年' },
  delta: { name: '增长量', formula: '增长量 = 现期量 − 基期量', locateTip: '现期与基期做差' },
  share: { name: '现期比重', formula: '现期比重 = 部分量 ÷ 整体量', locateTip: '先锁定部分与整体' },
  annual: { name: '年均增长率', formula: '年均增长率 = (末年÷首年)^(1/n) − 1', locateTip: '首年与末年，n 年差 n−1' },
  comp: { name: '综合分析', formula: '逐项验证：先排绝对化，再回表验算', locateTip: '逐项回表核对' }
}

function makeRateQ(seed, paper, main, sub, U) {
  const A = paper.vals[0][3]
  const B = paper.vals[0][4]
  const correct = r1(rateBetween(A, B))
  const dists = [r1(rateBetween(B, A)), r1(rateBetween(B, A + Math.round((B - A) * 0.5))), r1(rateBetween(A, Math.round(B * 1.03)))]
  const opts = buildLayerOpts([correct], dists, seed, (x) => x + '%')
  const stems = [
    '2023年' + paper.area + main + '为' + fmtNum(A) + U + '，2024年为' + fmtNum(B) + U + '，则2024年该' + main + '同比增速约为百分之几？',
    '材料显示，2023年' + paper.area + main + '为' + fmtNum(A) + U + '，2024年为' + fmtNum(B) + U + '。据此判断，2024年' + main + '的同比增速最接近：',
    '若2023年' + paper.area + main + '为' + fmtNum(A) + U + '、2024年为' + fmtNum(B) + U + '，则2024年' + main + '比上年增长约（　）。',
    '已知2023年' + paper.area + main + fmtNum(A) + U + '，2024年' + main + fmtNum(B) + U + '，问2024年' + main + '同比增速约为（　）。'
  ]
  const stem = pickV(seed + 11, stems)
  const typeOpts = buildLayerOpts([TYPE_META.rate.name], ['增长量', '基期量', '间隔增长率'], seed + 1)
  const locateOpts = buildLayerOpts(['2023年数值与2024年数值'], ['2024年数值与2024年增速', '2020年与2024年数值', '2024年增速与2023年增速'], seed + 2)
  const formulaOpts = buildLayerOpts(['$r = \\frac{B-A}{A}$'], ['$r = \\frac{B-A}{B}$', '$r = \\frac{A}{B}$', '$\\Delta = B-A$'], seed + 3)
  const explain = '增速 = (2024年 − 2023年) ÷ 2023年 = (' + fmtNum(B) + '−' + fmtNum(A) + ')÷' + fmtNum(A) + ' ≈ **' + correct + '%**。\n\n口诀：谁作基期谁当分母，“比上年/同比”以上一年为基数。'
  return {
    kind: 'rate',
    stem,
    typeLabel: TYPE_META.rate.name,
    layers: {
      type: layer('【判题型】先不看计算，只判断：这道题考的是哪种题型？', typeOpts, '', '提问词“同比增速/增长百分之几”指向**增长率**。', '看到“增长百分之几”→增长率。'),
      locate: layer('【找数据】要算2024年同比增速，应在材料中读取哪两个数据？', locateOpts, '', '增速 = (现期−基期)÷基期，需要 **2024年现期与2023年基期** 两个数值。', '先锁“现期年+上一年”。'),
      formula: layer('【选公式】以下哪个公式能正确表示本题？', formulaOpts, '', '增长率用 **r=(B−A)/A**，A 是2023年基期量，B 是2024年现期量。', '现期在上、基期在下。'),
      calc: layer(stem, opts, explain, explain, '求增速用“差÷基期”，方向别反。')
    }
  }
}

function makeDeltaQ(seed, paper, main, sub, U) {
  const A = paper.vals[0][3]
  const B = paper.vals[0][4]
  const correct = Math.round(B - A)
  const dists = [Math.round(B - A * 0.9), Math.round(B * 0.9 - A), Math.round(A * ((B - A) / A) * 0.9), Math.round(B - A + 500)]
  const opts = buildLayerOpts([correct], dists, seed, (x) => fmtNum(x) + U)
  const stems = [
    '2023年' + paper.area + main + '为' + fmtNum(A) + U + '，2024年为' + fmtNum(B) + U + '，则2024年该' + main + '较上年增加约多少' + U + '？',
    '2024年' + paper.area + main + '为' + fmtNum(B) + U + '，较2023年' + fmtNum(A) + U + '增加约多少' + U + '？',
    '与2023年相比，2024年' + paper.area + main + '（' + fmtNum(A) + U + '→' + fmtNum(B) + U + '）的绝对增长量约为：',
    '若2024年' + main + '为' + fmtNum(B) + U + '，上年为' + fmtNum(A) + U + '，则当年' + main + '较上年增加（　）' + U + '。'
  ]
  const stem = pickV(seed + 13, stems)
  const typeOpts = buildLayerOpts([TYPE_META.delta.name], ['增长率', '现期量', '间隔增长率'], seed + 1)
  const locateOpts = buildLayerOpts(['2023年与2024年该指标数值'], ['2024年数值与2024年增速', '2020年与2024年数值', '2024年数值与2023年增速'], seed + 2)
  const formulaOpts = buildLayerOpts(['$\\Delta = B-A$'], ['$r = \\frac{B-A}{A}$', '$\\Delta = B \\times r$', '$B = A \\times (1+r)$'], seed + 3)
  const explain = '增长量 = 2024年 − 2023年 = **' + fmtNum(correct) + U + '**。\n\n陷阱：题目问“增加多少”是绝对差量，不是增速百分比。'
  return {
    kind: 'delta',
    stem,
    typeLabel: TYPE_META.delta.name,
    layers: {
      type: layer('【判题型】“较上年增加多少”考的是哪种题型？', typeOpts, '', '“增加多少+单位”是绝对量，指向**增长量**。', '看到“增加/减少了多少”→增长量。'),
      locate: layer('【找数据】求增长量需要材料中哪两项数据？', locateOpts, '', '需要 **2024年现期量 与 2023年基期量**。', '差量必须用相邻两年数值。'),
      formula: layer('【选公式】增长量的公式是？', formulaOpts, '', '增长量 = **现期量 − 基期量**。', '差量不要乘除；先做减法。'),
      calc: layer(stem, opts, explain, explain, '看清楚“比上年”三个字。')
    }
  }
}

function makeShareQ(seed, paper, main, sub, U) {
  const whole = paper.vals[0][4]
  const part = paper.vals[1][4]
  const correct = r1(shareNow(paper, 1, 4))
  const dists = [
    r1((part / Math.max(1, whole * 1.08)) * 100),
    r1((part / Math.max(1, whole * 0.92)) * 100),
    r1(((part * 0.88) / whole) * 100)
  ]
  const opts = buildLayerOpts([correct], dists, seed, (x) => x + '%')
  const stems = [
    '2024年' + paper.area + main + '为' + fmtNum(whole) + U + '，其中' + sub + '为' + fmtNum(part) + U + '，则' + sub + '占' + main + '的比重约为多少？',
    '2024年' + main + '为' + fmtNum(whole) + U + '，其中' + sub + fmtNum(part) + U + '，' + sub + '约占' + main + '的：',
    '根据材料，2024年' + paper.area + main + '（' + fmtNum(whole) + U + '）中' + sub + '为' + fmtNum(part) + U + '，' + sub + '占' + main + '的比重最接近：',
    '2024年' + sub + '为' + fmtNum(part) + U + '，同年' + main + '为' + fmtNum(whole) + U + '，则' + sub + '占' + main + '比重约为：'
  ]
  const stem = pickV(seed + 17, stems)
  const typeOpts = buildLayerOpts([TYPE_META.share.name], ['平均数', '倍数', '基期比重'], seed + 1)
  const locateOpts = buildLayerOpts(['2024年' + sub + '与2024年' + main], ['2023年' + sub + '与2023年' + main, '2024年' + main + '与2024年增速', '2023年' + main + '与2024年' + sub], seed + 2)
  const formulaOpts = buildLayerOpts(['$p = \\frac{A}{B}$'], ['$p = \\frac{A}{B} \\times \\frac{1+b}{1+a}$', '$m = \\frac{\\text{总量}}{\\text{个数}}$', '$x = A-B$'], seed + 3)
  const explain = '比重 = ' + sub + '÷' + main + ' = ' + fmtNum(part) + '÷' + fmtNum(whole) + ' ≈ **' + correct + '%**。'
  return {
    kind: 'share',
    stem,
    typeLabel: TYPE_META.share.name,
    layers: {
      type: layer('【判题型】“占…的比重”考的是哪种题型？', typeOpts, '', '提问含“占/比重/占比”→**现期比重**。', '看到“占”字优先想 A÷B。'),
      locate: layer('【找数据】比重题应回材料找哪两个数字？', locateOpts, '', '需要 **2024年部分量（' + sub + '）与整体量（' + main + '）**。', '部分÷整体。'),
      formula: layer('【选公式】现期比重的公式是？', formulaOpts, '', '比重 = **部分量 ÷ 整体量**。', 'A 是部分、B 是整体。'),
      calc: layer(stem, opts, explain, explain, '比重结果写成百分数。')
    }
  }
}

function makeAnnualQ(seed, paper, main, sub, U) {
  const A = paper.vals[0][0]
  const B = paper.vals[0][4]
  const correct = r1((Math.pow(B / A, 1 / 4) - 1) * 100)
  const totalGrow = r1(rateBetween(A, B))
  const dists = [r1(totalGrow / 4), r1(totalGrow), r1((Math.pow(B / A, 1 / 3) - 1) * 100)]
  const opts = buildLayerOpts([correct], dists, seed, (x) => x + '%')
  const stems = [
    '2020年' + paper.area + main + '为' + fmtNum(A) + U + '，2024年为' + fmtNum(B) + U + '，则2020—2024年该' + main + '年均增速约为百分之几？',
    '材料显示，' + paper.area + main + '由2020年' + fmtNum(A) + U + '增长至2024年' + fmtNum(B) + U + '，五年年均增速约为：',
    '若2020年' + main + '为' + fmtNum(A) + U + '、2024年为' + fmtNum(B) + U + '，则统计期内' + main + '年均增长（　）。',
    '2020年' + main + fmtNum(A) + U + '，2024年' + main + fmtNum(B) + U + '，计算2020—2024年' + main + '年均增速约（　）。'
  ]
  const stem = pickV(seed + 19, stems)
  const typeOpts = buildLayerOpts([TYPE_META.annual.name], ['间隔增长率', '增长率', '增长量'], seed + 1)
  const locateOpts = buildLayerOpts(['2020年与2024年该指标数值'], ['2020—2024年各年增速', '2023年与2024年数值', '2024年数值与增速'], seed + 2)
  const formulaOpts = buildLayerOpts(['$\\bar{r} = (\\frac{B}{A})^{\\frac{1}{4}}-1$'], ['$r = \\frac{B-A}{A}$', '$R = r_1+r_2+r_1 r_2$', '$r = \\frac{B-A}{4}$'], seed + 3)
  const explain = '年均增速 = (2024÷2020)^(1/4) − 1 ≈ **' + correct + '%**；2020—2024共4个间隔，不是5。\n\n陷阱：逐年平均增速不能直接除以4，要先开4次方。'
  return {
    kind: 'annual',
    stem,
    typeLabel: TYPE_META.annual.name,
    layers: {
      type: layer('【判题型】“2020—2024年年均增速”考的是哪种题型？', typeOpts, '', '关键词“年均/平均每年”→**年均增长率**。', '年均增速与普通同比增速不同。'),
      locate: layer('【找数据】求五年年均增速需要材料中哪些数据？', locateOpts, '', '需要 **2020年首年数值 与 2024年末年数值**。', '首末年都要，间隔是4。'),
      formula: layer('【选公式】年均增长率的正确公式是？', formulaOpts, '', 'r̅=(末年÷首年)^(1/4)−1，不要简单除以4。', '先看“n 年差 n−1”。'),
      calc: layer(stem, opts, explain, explain, '五年数据只有4个间隔。')
    }
  }
}

function makeCompQ(seed, paper, main, sub, U) {
  const A = paper.vals[0][3]
  const B = paper.vals[0][4]
  const trueStmts = [
    '2024年「' + main + '」绝对量高于2023年',
    '2024年「' + main + '」绝对量高于2020年',
    '2024年「' + sub + '」绝对量低于「' + main + '」'
  ]
  const falseStmts = [
    '2024年「' + main + '」绝对量低于2023年',
    '2024年「' + main + '」绝对量低于2020年',
    '2024年「' + sub + '」绝对量高于「' + main + '」',
    '2020—2024年「' + main + '」逐年下降'
  ]
  const ti = hashIdx(seed + 9, trueStmts.length)
  const correctTxt = trueStmts[ti]
  const others = shuffle(falseStmts.filter((x) => x !== correctTxt), seed + 11).slice(0, 3)
  const opts = buildLayerOpts([correctTxt], others, seed + 12)
  const typeOpts = buildLayerOpts([TYPE_META.comp.name], ['现期比重', '增长率', '增长量'], seed + 1)
  const locateOpts = buildLayerOpts(['回表逐项核对数值与趋势'], ['只看题干不看表', '只看最后一列增速', '只比较2024年单年'], seed + 2)
  const formulaOpts = buildLayerOpts(['逐项验证：排绝对→回表验算'], ['只选最大数', '只算一个指标', '按题干直觉直接选'], seed + 3)
  const trueOpt = String(trueStmts[ti]).includes('高于2023') ? '材料中2024年' + main + '为' + fmtNum(B) + U + '，2023年为' + fmtNum(A) + U + '，故“高于2023年”可由表直接推出。' : String(trueStmts[ti]).includes('高于2020') ? '材料中2024年' + main + '为' + fmtNum(B) + U + '，2020年为' + fmtNum(paper.vals[0][0]) + U + '，趋势上升故可由表推出。' : '表格中' + sub + '始终低于' + main + '，比重不可能超过100%。'
  const explain = '【综合分析】正确项：' + trueOpt + '\n\n逐项排除：三个干扰项分别与材料数值方向相反或把分项绝对量夸大，均可直接回表排除。\n\n口诀：综合分析先排绝对化与方向反的选项，再回表验证。'
  const stem = '【综合分析】关于材料中2020—2024年' + paper.area + main + '运行情况，能够推出的是（　）'
  return {
    kind: 'comp',
    stem,
    typeLabel: TYPE_META.comp.name,
    layers: {
      type: layer('【判题型】“能够推出的是”属于哪种题型？', typeOpts, '', '综合判断题通常会逐项核对材料，判断哪些说法能由材料推出。', '看到“能推出/不能推出”→综合分析。'),
      locate: layer('【找数据】综合判断题的作答方式是？', locateOpts, '', '应回材料逐一核对选项中的年份、指标、数值与趋势，不能只凭题干判断。', '定位逐项回表。'),
      formula: layer('【选公式】综合分析最合适的策略是？', formulaOpts, '', '先用“方向反/绝对化/数值超范围”快速排除，再对剩余选项回表验算。', '先排除后验证。'),
      calc: layer(stem, opts, explain, explain, '逐项核对，不能跳题。')
    }
  }
}

export function buildDataTrainExam(seed = Date.now() % 100000, dom = null) {
  if (seed === undefined) seed = Date.now() % 100000
  const paper = createSharedPaper(seed, dom)
  const material = renderRichMaterial(seed + 55, paper)
  const main = paper.inds[0]
  const sub = paper.inds[1]
  const U = paper.unit
  const makers = [
    makeRateQ(seed + 101, paper, main, sub, U),
    makeDeltaQ(seed + 207, paper, main, sub, U),
    makeShareQ(seed + 331, paper, main, sub, U),
    makeAnnualQ(seed + 457, paper, main, sub, U),
    makeCompQ(seed + 613, paper, main, sub, U)
  ]
  const seen = new Set()
  const qs = makers.filter((q) => {
    if (!q || seen.has(q.kind)) return false
    seen.add(q.kind)
    const keys = Object.keys(q.layers)
    return keys.length === 4 && keys.every((k) => {
      const l = q.layers[k]
      return l && l.options && l.options.length === 4 && l.answer && new Set(l.options.map((o) => o.t)).size === 4
    })
  })
  return {
    paperSeed: seed,
    area: paper.area,
    domName: (dom && dom.n) || main,
    inds: paper.inds.slice(),
    unit: U,
    materialMd: material.materialMd,
    materialSvg: material.materialSvg,
    matStyle: material.matStyle,
    tableKind: material.tableKind,
    chartKind: material.chartKind,
    qs
  }
}

export const EXAM_LAYER_KEYS = [
  { k: 'type', t: '① 判题型', d: '看提问关键词判断考点' },
  { k: 'locate', t: '② 找数据', d: '锁定时间/指标/单位' },
  { k: 'formula', t: '③ 选公式', d: '识别概念并选正确公式' },
  { k: 'calc', t: '④ 速算', d: '回算并选出最终答案' }
]
export default { buildDataTrainExam, EXAM_LAYER_KEYS }
