// dataTrainChain.js —— 资料速算「同材料连问」：同一张表格材料连续出 N 问（v3.8.203）
function hashIdx(n, len) { let h = n >>> 0; return ((h % len) + len) % len }
function shuffle(a, seed) { const arr = a.slice(); let x = seed >>> 0; for (let i = arr.length - 1; i > 0; i--) { x = (x * 9301 + 49297) % 233280; const j = Math.floor((x / 233280) * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t } return arr }
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
  let k = 0; for (let i = 0; i < 4; i++) if (arr[i] === ' ') arr[i] = others[k++]
  return { options: KEYS.map((k2, i) => ({ k: k2, t: String(arr[i]) })), answer: KEYS[at] }
}
function unitOf(idx, groupUnit) {
  return idx && idx.units && idx.units[idx.ind] ? idx.units[idx.ind] : (groupUnit || '万吨')
}

export function buildLocateTableChain(seed, count = 3, dom = null) {
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
  const units = groups.flatMap((gr) => gr.inds.map((ind) => unitOf({ ind, units: gr.units }, dom ? dom.unit : '万吨')))
  const years = [2021, 2022, 2023, 2024]
  const baseVals = shuffle(Array.from({ length: 40 }, (_, i) => 4200 + i * 137), seed + 3).slice(0, 16)
  const rows = years.map((y, ri) => [0, 1, 2, 3].map((ci) => baseVals[ri * 4 + ci]))
  const head1 = '| 年份 | ' + cols.join(' | ') + ' |'
  const sep = '| --- | ' + cols.map(() => '---').join(' | ') + ' |'
  const body = years.map((y, ri) => '| ' + y + ' | ' + rows[ri].join(' | ') + ' |').join('\n')
  const unitRow = '| 单位 | ' + units.join(' | ') + ' |'
  const areaName = dom ? String(dom.n || '该领域') : '综合领域'
  const mat = [head1, sep, body, unitRow, '', dom ? '注：数值为「' + areaName + '」训练模拟数据，仅供定位练习，不引用任何年份真实公布值。' : '注：数值为跨领域训练模拟数据；单位已按各指标实际口径标注，非真实公布值。'].join('\n')
  const qs = []
  const n = Math.min(Math.max(2, Number(count) || 3), 5)
  for (let i = 0; i < n; i++) {
    const ci = (hashIdx(seed + 11, cols.length) + i) % cols.length
    const col = cols[ci]
    const ti = 1 + ((i + 1) % 3)
    const kind = (hashIdx(seed + 40 + i * 7, 3) + i) % 3
    if (kind === 0) {
      const correct = rows[ti][ci]
      const dists = [rows[ti][(ci + 1) % 4], rows[(ti + 1) % 4][ci], rows[(ti + 3) % 4][(ci + 2) % 4]].map((v) => fmt(v))
      const opts = buildOpts(fmt(correct), dists, seed + i)
      qs.push({ q: '求' + years[ti] + '年「' + col + '」的数值，应为多少' + units[ci] + '？', options: opts.options, answer: opts.answer, explain: '【定位】行 = ' + years[ti] + ' 年、列 = ' + col + ' → 交叉格 = ' + fmt(correct) + units[ci] + '。', tip: '先锁「行年份 × 列指标」再读格。' })
    } else if (kind === 1) {
      const prevY = years[ti - 1]
      const pairs = [years[ti] + '年与' + prevY + '年', years[ti] + '年与' + years[Math.max(0, ti - 2)] + '年', prevY + '年与' + years[Math.max(0, ti - 2)] + '年', years[ti + 1] + '年与' + years[ti] + '年']
      const opts = buildOpts(pairs[0], pairs.slice(1), seed + i)
      qs.push({ q: '求' + years[ti] + '年「' + col + '」的同比增速，需要哪两年的数据？', options: opts.options, answer: opts.answer, explain: '求同比增速需 ' + years[ti] + ' 年（现期）与 ' + prevY + ' 年（基期）。', tip: '增速=(现期−基期)÷基期。' })
    } else {
      const vals = years.map((y, ri) => rows[ri][ci])
      const mx = Math.max(...vals)
      const bestY = years[vals.indexOf(mx)]
      const ys = shuffle(years.slice(), seed + i).slice(0, 4)
      const opts = buildOpts(String(bestY), ys.filter((y) => String(y) !== String(bestY)).slice(0, 3), seed + i)
      qs.push({ q: '材料中 2021—2024 年「' + col + '」数值最大的是哪一年？', options: opts.options, answer: opts.answer, explain: '逐年比较 ' + col + '，最大为 ' + bestY + '。', tip: '比较题逐列读完再下结论。' })
    }
  }
  return { materialMd: '【材料】' + (dom ? areaName + '领域' : '综合领域') + '·主要指标表\n\n' + mat, qs, total: qs.length, area: areaName }
}
export function genLocateChain(seed, count = 3, dom = null) {
  if (seed === undefined) seed = Date.now() % 100000
  for (let attempt = 0; attempt < 8; attempt++) {
    const c = buildLocateTableChain(seed + attempt * 977, count, dom)
    if (c && c.qs && c.qs.length >= 2) return c
  }
  return null
}
export default { buildLocateTableChain, genLocateChain }
