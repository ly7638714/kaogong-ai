// utils/tutuGen.js —— 本地真题级图推生成器（不依赖 AI、零额度）
// 产出与现有出题管线一致的结构：{ stem(md含svg), options:[{k,t(svg)}], answer, family, form }
// 确定性参数驱动 + 唯一解程序校验；SVG 全部自带 viewBox 并经 normalizeSvg 兜底 → 零裁切。
// 规律族 v1：黑白块数量递增 / 图形数量递增 / 箭头旋转 / 对称轴数量递增 / 九宫格黑白叠加 /
//           汉字笔画数递增 / 旋转链(两组图) / 翻转链(两组图) / 对称性分组 / 汉字笔画分组
import { normalizeSvg } from './svgFix'

// ================= 基础绘图（返回 SVG 片段，坐标已在画布内） =================
const pad = (n) => Math.round(n * 10) / 10

function circ(cx, cy, r, fill = 'none', stroke = '#111', sw = 2) {
  return `<circle cx="${pad(cx)}" cy="${pad(cy)}" r="${pad(r)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`
}
function poly(cx, cy, r, sides, angle = -90, fill = '#eef4ff', stroke = '#111') {
  const pts = []
  for (let i = 0; i < sides; i++) {
    const a = ((angle + (360 / sides) * i) * Math.PI) / 180
    pts.push(`${pad(cx + r * Math.cos(a))},${pad(cy + r * Math.sin(a))}`)
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`
}
function arrow(cx, cy, size, angle = 0, fill = '#111') {
  const pts = [[size / 2, 0], [-size / 2, size * 0.42], [-size / 5, 0], [-size / 2, -size * 0.42]]
  const rad = (angle * Math.PI) / 180
  const rot = (p) => [cx + p[0] * Math.cos(rad) - p[1] * Math.sin(rad), cy + p[0] * Math.sin(rad) + p[1] * Math.cos(rad)]
  const out = pts.map((p) => { const r = rot(p); return `${pad(r[0])},${pad(r[1])}` })
  return `<polygon points="${out.join(' ')}" fill="${fill}"/>`
}
function char(ch, cx, cy, size, fill = '#111') {
  return `<text x="${pad(cx)}" y="${pad(cy)}" font-size="${size}" text-anchor="middle" dominant-baseline="central" font-family="'KaiTi','STKaiti','SimSun',serif" fill="${fill}">${ch}</text>`
}
function rect(x, y, w, h, fill = '#eef4ff', stroke = '#111') {
  return `<rect x="${pad(x)}" y="${pad(y)}" width="${pad(w)}" height="${pad(h)}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`
}
function frame(ox, oy, w, h) {
  return `<rect x="${pad(ox)}" y="${pad(oy)}" width="${pad(w)}" height="${pad(h)}" fill="#fff" stroke="#999" stroke-width="1.5"/>`
}
function cells(cellsArr, ox, oy, grid, cell, black = '#111') {
  let s = ''
  for (let r = 0; r < grid; r++) {
    for (let c = 0; c < grid; c++) {
      const isBlack = cellsArr.some(([br, bc]) => br === r && bc === c)
      s += `<rect x="${pad(ox + c * cell)}" y="${pad(oy + r * cell)}" width="${pad(cell)}" height="${pad(cell)}" fill="${isBlack ? black : '#fff'}" stroke="${isBlack ? black : '#bbb'}" stroke-width="${isBlack ? 0 : 1}"/>`
    }
  }
  return s
}

// ================= 连通黑白块库（按个数取不规则连通形） =================
const POLYOMINO = {
  1: [[[0, 1]]],
  2: [[[0, 1], [1, 1]]],
  3: [[[0, 0], [0, 1], [1, 1]], [[0, 1], [1, 1], [1, 2]]],
  4: [[[0, 0], [1, 0], [1, 1], [2, 1]], [[0, 1], [1, 0], [1, 1], [2, 1]], [[0, 0], [0, 1], [1, 1], [1, 2]]],
  5: [[[0, 1], [1, 0], [1, 1], [2, 1], [2, 2]], [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]]],
  6: [[[0, 0], [1, 0], [2, 0], [2, 1], [1, 1], [0, 1]]],
  7: [[[0, 1], [1, 0], [1, 1], [1, 2], [2, 1], [2, 2], [3, 1]]],
  8: [[[0, 0], [1, 0], [2, 0], [2, 1], [1, 1], [0, 1], [1, 2], [1, 3]]],
  9: [[[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]]],
  10: [[[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [1, 2], [2, 2]]]
}
const HANZI = {
  1: ['一'], 2: ['二', '十', '人', '八', '又'], 3: ['三', '上', '下', '大', '女'],
  4: ['木', '王', '中', '不', '天'], 5: ['四', '白', '田', '目', '由'],
  6: ['米', '耳', '早', '虫', '曲'], 7: ['走', '我', '你', '来', '进'], 8: ['明', '果', '林', '和', '松']
}
const pick = (arr, i) => arr[i % arr.length]

// 把一个图形绘制到 (cx,cy) 的 size 方框内
function drawFig(fig, cx, cy, size) {
  switch (fig.kind) {
    case 'block': {
      const grid = fig.grid || 4
      const cell = size / (grid + 0.35)
      const ox = cx - (cell * grid) / 2
      const oy = cy - (cell * grid) / 2
      return cells(fig.cells, ox, oy, grid, cell) + frame(ox - 2, oy - 2, cell * grid + 4, cell * grid + 4)
    }
    case 'dots': {
      const r = size * 0.15
      const n = fig.n
      const rows = n <= 4 ? 1 : 2
      const cols = rows === 1 ? n : Math.ceil(n / 2)
      const gapX = size / (cols + 0.6)
      const gapY = size / (rows + 1.2)
      let s = ''
      for (let i = 0; i < n; i++) {
        const col = i % cols, row = Math.floor(i / cols)
        const x = cx - ((cols - 1) * gapX) / 2 + col * gapX
        const y = cy - ((rows - 1) * gapY) / 2 + row * gapY
        s += circ(x, y, r, '#111', '#111', 0)
      }
      return s + frame(cx - size / 2, cy - size / 2, size, size)
    }
    case 'arrow':
      return arrow(cx, cy, size * 0.8, fig.angle)
    case 'poly':
      return poly(cx, cy, size * 0.42, fig.sides, fig.angle || -90)
    case 'char':
      return char(fig.ch, cx, cy, size * 0.72)
    case 'flip': {
      let s = char(fig.base, cx, cy, size * 0.62)
      if (fig.mirror === 'h') s = `<g transform="translate(${pad(cx * 2)},0) scale(-1,1)">${char(fig.base, cx, cy, size * 0.62)}</g>`
      if (fig.mirror === 'v') s = `<g transform="translate(0,${pad(cy * 2)}) scale(1,-1)">${char(fig.base, cx, cy, size * 0.62)}</g>`
      return s + frame(cx - size / 2, cy - size / 2, size, size)
    }
    case 'dotmove': {
      // 3×3 网格，黑点在第 p 格（0..8 行优先，向右移动、到行尾换行）
      const g = 3
      const cell = size / 4.4
      const ox = cx - (cell * g) / 2
      const oy = cy - (cell * g) / 2
      const rr = Math.floor(fig.p / g), cc = fig.p % g
      let s2 = ''
      for (let a = 0; a < g; a++) for (let b = 0; b < g; b++) {
        const isDot = a === rr && b === cc
        s2 += `<rect x="${pad(ox + b * cell)}" y="${pad(oy + a * cell)}" width="${pad(cell)}" height="${pad(cell)}" fill="${isDot ? '#111' : '#fff'}" stroke="#999" stroke-width="1"/>`
      }
      return s2
    }
    case 'relpos': {
      // 方块(左) + 圆(右)：相离→相切→相交→内含
      const sq = size * 0.34
      const sx = cx - sq * 0.55
      const sy = cy - sq / 2
      const rr2 = size * 0.16
      let px = cx + sq * 0.75
      if (fig.st === 'tangent') px = sx + sq + rr2
      else if (fig.st === 'cross') px = sx + sq * 0.55
      else if (fig.st === 'inside') px = sx + sq * 0.5
      return rect(sx, sy, sq, sq, '#eef4ff', '#111') + circ(px, cy, rr2, '#111', '#111', 0)
    }
    case 'curve': {
      if (fig.shape === 'circle') return circ(cx, cy, size * 0.34, '#eef4ff', '#111')
      if (fig.shape === 'ellipse') return `<ellipse cx="${pad(cx)}" cy="${pad(cy)}" rx="${pad(size * 0.45)}" ry="${pad(size * 0.28)}" fill="#eef4ff" stroke="#111" stroke-width="2"/>`
      const w = size * 0.45, h = size * 0.22
      return (
        `<path d="M ${pad(cx - w)} ${pad(cy)} Q ${pad(cx - w * 0.5)} ${pad(cy - h)} ${pad(cx)} ${pad(cy)} T ${pad(cx + w)} ${pad(cy)}" fill="none" stroke="#111" stroke-width="3"/>` +
        `<path d="M ${pad(cx - w)} ${pad(cy + h * 1.1)} Q ${pad(cx - w * 0.5)} ${pad(cy + h * 0.1)} ${pad(cx)} ${pad(cy + h * 1.1)} T ${pad(cx + w)} ${pad(cy + h * 1.1)}" fill="none" stroke="#111" stroke-width="3"/>` +
        frame(cx - size / 2, cy - size / 2, size, size)
      )
    }
    case 'hive': {
      // 六边形蜂窝：rows×cols，奇数列错开半格
      const rows = fig.rows || 3, cols = fig.cols || 3
      const R = size / (rows * 1.35 + 0.6)
      const cell = R / Math.sqrt(3)
      const ox = cx - ((cols - 1) * cell * 1.5) / 2
      const oy = cy - ((rows - 1) * R) / 2
      let s3 = ''
      for (let rr = 0; rr < rows; rr++) for (let cc = 0; cc < cols; cc++) {
        const x = ox + cc * cell * 1.5
        const y = oy + rr * R + (cc % 2 === 1 ? R / 2 : 0)
        const isBlack = fig.cells.some(([br, bc]) => br === rr && bc === cc)
        s3 += hexPoly(x, y, cell, isBlack ? '#111' : '#fff', isBlack ? '#111' : '#bbb')
      }
      return s3
    }
    case 'cubenet':
      return cubeBody(fig.u, fig.f, fig.r, cx, cy, size * 1.35)
    case 'shape2': {
      let s = poly(cx, cy, size * 0.4, 4, -45, '#eef4ff')
      if (fig.inner === 'dot') s += circ(cx, cy, size * 0.08, '#111', '#111', 0)
      else if (fig.inner === 'line') s += `<line x1="${pad(cx - size * 0.18)}" y1="${pad(cy)}" x2="${pad(cx + size * 0.18)}" y2="${pad(cy)}" stroke="#111" stroke-width="3"/>`
      else if (fig.inner === 'cross') {
        s += `<line x1="${pad(cx - size * 0.16)}" y1="${pad(cy)}" x2="${pad(cx + size * 0.16)}" y2="${pad(cy)}" stroke="#111" stroke-width="3"/>`
        s += `<line x1="${pad(cx)}" y1="${pad(cy - size * 0.16)}" x2="${pad(cx)}" y2="${pad(cy + size * 0.16)}" stroke="#111" stroke-width="3"/>`
      }
      return s
    }
    default:
      return ''
  }
}

function svgCanvas(w, h, slots) {
  let body = ''
  for (const s of slots) {
    if (s.fig && s.fig !== '?') body += drawFig(s.fig, s.cx, s.cy, s.size)
    else if (s.fig === '?') body += char('？', s.cx, s.cy, 40)
  }
  return normalizeSvg(`<svg width="${w}" height="${h}">${body}</svg>`)
}

// ================= 四种形式的题干布局 =================
function seqSlots(figs) {
  const cs = [52, 151, 250, 349, 448, 547]
  const slots = []
  for (let i = 0; i < 5; i++) slots.push({ fig: figs[i], cx: cs[i], cy: 75, size: 96 })
  slots.push({ fig: '?', cx: cs[5], cy: 78, size: 96 })
  return slots
}
function anaSlots(figs) {
  const cs = [155, 310, 465]
  const slots = []
  for (let i = 0; i < 3; i++) slots.push({ fig: figs[i], cx: cs[i], cy: 82, size: 110 })
  for (let i = 3; i < 6; i++) slots.push({ fig: figs[i], cx: cs[i - 3], cy: 238, size: 110 })
  return slots
}
function matSlots(figs) {
  const cs = [70, 210, 350]
  const slots = []
  for (let i = 0; i < 9; i++) slots.push({ fig: i === 8 ? '?' : figs[i], cx: cs[i % 3], cy: cs[Math.floor(i / 3)], size: 104 })
  return slots
}
function grpSlots(figs) {
  const cs = [52, 151, 250, 349, 448, 547]
  const slots = []
  for (let i = 0; i < 6; i++) slots.push({ fig: figs[i], cx: cs[i], cy: 75, size: 84 })
  return slots
}
function optSvg(fig) {
  const body = fig ? drawFig(fig, 90, 70, 120) : ''
  return normalizeSvg(`<svg width="180" height="140">${body}</svg>`)
}

// ================= 唯一解校验（按规律特征） =================
const countCells = (f) => (f && f.kind === 'block' ? f.cells.length : -1)
const countDots = (f) => (f && f.kind === 'dots' ? f.n : -1)
const strokeOf = (f) => (f && f.kind === 'char' ? f.strokes : -1)
const angleOf = (f) => (f && f.kind === 'arrow' ? (((f.angle % 360) + 360) % 360) : -1)
const sidesOf = (f) => (f && f.kind === 'poly' ? f.sides : -1)
const cellsKey = (f) => (f && f.cells ? f.cells.map(([r, c]) => r * 4 + c).sort((a, b) => a - b).join(',') : '')

// ================= 各规律族 =================
function genBlackSeq(seed) {
  // 起始数可变：1→2→…→6 / 2→3→…→7 / 3→4→…→8，避免千篇一律
  const start = seed % 3 // 0,1,2
  const base = start + 1
  const figs = []
  for (let i = 0; i < 5; i++) figs.push({ kind: 'block', cells: pick(POLYOMINO[base + i], seed + i) })
  const ansN = base + 5
  const ans = { kind: 'block', cells: pick(POLYOMINO[ansN], seed + 9) }
  const opts = [ans,
    { kind: 'block', cells: pick(POLYOMINO[ansN - 1], seed + 2) },
    { kind: 'block', cells: pick(POLYOMINO[ansN + 1], seed + 3) },
    { kind: 'block', cells: pick(POLYOMINO[ansN - 2], seed + 4) }]
  const target = ansN
  return { figs, ans, opts, verify: (f) => countCells(f) === target }
}
function genDotsSeq(_seed) {
  const figs = []
  for (let n = 1; n <= 5; n++) figs.push({ kind: 'dots', n })
  const ans = { kind: 'dots', n: 6 }
  const opts = [ans, { kind: 'dots', n: 5 }, { kind: 'dots', n: 7 }, { kind: 'dots', n: 8 }]
  return { figs, ans, opts, verify: (f) => countDots(f) === 6 }
}
function genArrowSeq(_seed) {
  const figs = []
  for (let i = 0; i < 5; i++) figs.push({ kind: 'arrow', angle: (i * 90) % 360 })
  const ans = { kind: 'arrow', angle: 90 }
  const opts = [ans, { kind: 'arrow', angle: 45 }, { kind: 'arrow', angle: 180 }, { kind: 'arrow', angle: 270 }]
  return { figs, ans, opts, verify: (f) => angleOf(f) === 90 }
}
function genSymSeq(_seed) {
  // 正多边形边数（=对称轴数）递增 3,4,5,6 → ? = 7 条对称轴（正七边形）
  const figs = [{ kind: 'poly', sides: 3 }, { kind: 'poly', sides: 4 }, { kind: 'poly', sides: 5 }, { kind: 'poly', sides: 6 }]
  const ans = { kind: 'poly', sides: 7 }
  const opts = [ans, { kind: 'poly', sides: 6 }, { kind: 'poly', sides: 8 }, { kind: 'poly', sides: 4 }]
  return { figs, ans, opts, verify: (f) => sidesOf(f) === 7 }
}
function genHanziSeq(seed) {
  const figs = [
    { kind: 'char', ch: pick(HANZI[1], seed), strokes: 1 },
    { kind: 'char', ch: pick(HANZI[2], seed + 1), strokes: 2 },
    { kind: 'char', ch: pick(HANZI[3], seed + 2), strokes: 3 },
    { kind: 'char', ch: pick(HANZI[4], seed + 3), strokes: 4 },
    { kind: 'char', ch: pick(HANZI[5], seed + 4), strokes: 5 }
  ]
  const ans = { kind: 'char', ch: pick(HANZI[6], seed + 5), strokes: 6 }
  const opts = [ans, { kind: 'char', ch: pick(HANZI[5], seed + 6), strokes: 5 }, { kind: 'char', ch: pick(HANZI[7], seed + 7), strokes: 7 }, { kind: 'char', ch: pick(HANZI[8], seed + 8), strokes: 8 }]
  return { figs, ans, opts, verify: (f) => strokeOf(f) === 6 }
}
// 九宫格黑白叠加：行内 左⊕中=右（XOR：黑+黑=白、黑+白=黑、白+白=白），2×2 迷你格
// ================= 黑白运算规则库（九宫格·多种运算） =================
const OVERLAY_RULES = {
  xor: (a, b) => (a === 1 ? (b === 1 ? 0 : 1) : b),   // 黑+黑=白、黑+白=黑、白+白=白
  or: (a, b) => (a === 1 || b === 1 ? 1 : 0),          // 黑+黑=黑、黑+白=黑
  and: (a, b) => (a === 1 && b === 1 ? 1 : 0),         // 黑+黑=黑、黑+白=白
  xnor: (a, b) => (a === b ? 1 : 0),                   // 同色=黑、异色=白
  left: (a) => a,                                      // 结果=左图
  right: (_a, b) => b                                  // 结果=右图
}
function genOverlayMatrix(seed) {
  const ruleKeys = Object.keys(OVERLAY_RULES)
  const rule = ruleKeys[seed % ruleKeys.length]
  const op = OVERLAY_RULES[rule]
  const mini = seed % 2 === 0 ? 2 : 3 // 2×2 或 3×3 迷你格
  const n = mini * mini
  const toCells = (pat) => pat.map((v, i) => (v === 1 ? [Math.floor(i / mini), i % mini] : null)).filter(Boolean)
  const rnd = (n2) => ((seed * 7919 + n2 * 104729) % 9973) / 9973
  let rows = null
  for (let t = 0; t < 80; t++) {
    const R = []
    for (let r = 0; r < 3; r++) {
      const A = Array.from({ length: n }, (_, i) => (rnd(r * 13 + t * 7 + seed + i * 3) > 0.5 ? 1 : 0))
      const B = Array.from({ length: n }, (_, i) => (rnd(r * 13 + t * 7 + seed + i * 3 + 29) > 0.5 ? 1 : 0))
      const C = A.map((v, i) => op(v, B[i]))
      R.push([A, B, C])
    }
    const c = R[2][2].reduce((s2, v) => s2 + v, 0)
    if (c >= 1 && c <= n - 1) { rows = R; break }
  }
  if (!rows) return null
  const figs = []
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) figs.push({ kind: 'block', grid: mini, cells: toCells(rows[r][c]) })
  const ans = { kind: 'block', grid: mini, cells: toCells(rows[2][2]) }
  const key = (pat) => pat.map((v, i) => (v === 1 ? i : -1)).filter((i) => i >= 0).join(',')
  const ansKey = key(rows[2][2])
  const pool = []
  for (const k of ruleKeys) {
    if (k === rule) continue
    const pat = rows[2][0].map((v, i) => OVERLAY_RULES[k](v, rows[2][1][i]))
    if (key(pat) !== ansKey) pool.push(pat)
  }
  const flip1 = rows[2][2].slice(); flip1[0] = flip1[0] === 1 ? 0 : 1
  const flip2 = rows[2][2].slice(); flip2[1] = flip2[1] === 1 ? 0 : 1
  for (const fp of [flip1, flip2]) if (pool.length < 3 && key(fp) !== ansKey) pool.push(fp)
  if (pool.length < 3) return null
  const opts = [ans, ...pool.slice(0, 3).map((pat) => ({ kind: 'block', grid: mini, cells: toCells(pat) }))]
  const verify = (f) => cellsKey(f) === cellsKey(ans)
  return { figs, ans, opts, verify, rule }
}

function genRotChain(_seed) {
  // 两组图：上排箭头 0/90/180，下排 90/180/? → ?=270
  const figs = [{ kind: 'arrow', angle: 0 }, { kind: 'arrow', angle: 90 }, { kind: 'arrow', angle: 180 }, { kind: 'arrow', angle: 90 }, { kind: 'arrow', angle: 180 }, null]
  const ans = { kind: 'arrow', angle: 270 }
  const opts = [ans, { kind: 'arrow', angle: 180 }, { kind: 'arrow', angle: 90 }, { kind: 'arrow', angle: 0 }]
  return { figs, ans, opts, verify: (f) => angleOf(f) === 270 }
}
function genFlipChain(_seed) {
  // 两组图：上排 [F, 镜像F, F]，下排 [r, 镜像r, ?=r]
  const figs = [
    { kind: 'flip', base: 'F', mirror: 'none' }, { kind: 'flip', base: 'F', mirror: 'h' }, { kind: 'flip', base: 'F', mirror: 'none' },
    { kind: 'flip', base: 'r', mirror: 'none' }, { kind: 'flip', base: 'r', mirror: 'h' }, null
  ]
  const ans = { kind: 'flip', base: 'r', mirror: 'none' }
  const opts = [ans, { kind: 'flip', base: 'r', mirror: 'h' }, { kind: 'flip', base: 'r', mirror: 'v' }, { kind: 'flip', base: 'F', mirror: 'none' }]
  return { figs, ans, opts, verify: (f) => f && f.kind === 'flip' && f.base === 'r' && f.mirror === 'none' }
}
function genGroupSym(_seed) {
  // ①②③ 轴对称（正五边形/正三角形/菱形+横线），④⑤⑥ 非对称（F / 斜箭头 / r）
  const figs = [
    { kind: 'poly', sides: 5 }, { kind: 'poly', sides: 3 }, { kind: 'shape2', inner: 'line' },
    { kind: 'flip', base: 'F', mirror: 'none' }, { kind: 'arrow', angle: 37 }, { kind: 'flip', base: 'r', mirror: 'none' }
  ]
  const opts = ['①②③，④⑤⑥', '①③⑤，②④⑥', '①②④，③⑤⑥', '①⑤⑥，②③④']
  return { figs, opts, ans: 'A', verify: () => true }
}
function genGroupHanzi(seed) {
  // ①③⑤ 为 4 画，②④⑥ 为 5 画
  const four = [pick(HANZI[4], seed), pick(HANZI[4], seed + 1), pick(HANZI[4], seed + 2)]
  const five = [pick(HANZI[5], seed + 3), pick(HANZI[5], seed + 4), pick(HANZI[5], seed + 5)]
  const figs = [
    { kind: 'char', ch: four[0], strokes: 4 }, { kind: 'char', ch: five[0], strokes: 5 }, { kind: 'char', ch: four[1], strokes: 4 },
    { kind: 'char', ch: five[1], strokes: 5 }, { kind: 'char', ch: four[2], strokes: 4 }, { kind: 'char', ch: five[2], strokes: 5 }
  ]
  const opts = ['①③⑤，②④⑥', '①②③，④⑤⑥', '①②④，③⑤⑥', '①⑤⑥，②③④']
  return { figs, opts, ans: 'A', verify: () => true }
}
// 黑点移动（一组图）：黑点沿 3×3 网格每次右移一格，到行尾换行（位置 0..8）
function genPosMove(_seed) {
  const seq = [0, 1, 2, 3, 4] // 黑点位置（行优先）
  const figs = seq.map((p) => ({ kind: 'dotmove', p }))
  const ans = { kind: 'dotmove', p: 5 }
  const opts = [ans, { kind: 'dotmove', p: 3 }, { kind: 'dotmove', p: 6 }, { kind: 'dotmove', p: 8 }]
  return { figs, ans, opts, verify: (f) => f && f.kind === 'dotmove' && f.p === 5 }
}
// 两图形位置关系（一组图）：相离→相切→相交→内含→相离…，问号=相切
function genRelPos(_seed) {
  const states = ['apart', 'tangent', 'cross', 'inside', 'apart']
  const figs = states.map((st) => ({ kind: 'relpos', st }))
  const ans = { kind: 'relpos', st: 'tangent' }
  const opts = [ans, { kind: 'relpos', st: 'apart' }, { kind: 'relpos', st: 'cross' }, { kind: 'relpos', st: 'inside' }]
  return { figs, ans, opts, verify: (f) => f && f.kind === 'relpos' && f.st === 'tangent' }
}
// 九宫格·行同数量：每行小圆个数相同（行1=2、行2=3、行3=4），问号=4
function genMatrixCount(_seed) {
  const rows = [2, 3, 4]
  const figs = []
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) figs.push({ kind: 'dots', n: rows[r] })
  const ans = { kind: 'dots', n: 4 }
  const opts = [ans, { kind: 'dots', n: 3 }, { kind: 'dots', n: 5 }, { kind: 'dots', n: 2 }]
  return { figs, ans, opts, verify: (f) => countDots(f) === 4 }
}
// 分组分类·曲直性：①②③ 全曲线图形，④⑤⑥ 全直线图形
function genGroupCurve(_seed) {
  const figs = [
    { kind: 'curve', shape: 'circle' }, { kind: 'curve', shape: 'ellipse' }, { kind: 'curve', shape: 'wave' },
    { kind: 'poly', sides: 3 }, { kind: 'poly', sides: 4 }, { kind: 'poly', sides: 5 }
  ]
  const opts = ['①②③，④⑤⑥', '①③⑤，②④⑥', '①②④，③⑤⑥', '①⑤⑥，②③④']
  return { figs, opts, ans: 'A', verify: () => true }
}
// 分组分类·字母对称性：①②③ 轴对称字母（A M T），④⑤⑥ 非轴对称（F R G）
function genGroupLetter(_seed) {
  const figs = [
    { kind: 'flip', base: 'A', mirror: 'none' }, { kind: 'flip', base: 'M', mirror: 'none' }, { kind: 'flip', base: 'T', mirror: 'none' },
    { kind: 'flip', base: 'F', mirror: 'none' }, { kind: 'flip', base: 'R', mirror: 'none' }, { kind: 'flip', base: 'G', mirror: 'none' }
  ]
  const opts = ['①②③，④⑤⑥', '①③⑤，②④⑥', '①②④，③⑤⑥', '①⑤⑥，②③④']
  return { figs, opts, ans: 'A', verify: () => true }
}

// ================= 空间重构·立方体展开图（本地确定性，保证可拼合回立方体） =================
// 面标识：U上 D下 F前 B后 L左 R右
const NET_CANDIDATES = [
  // 十字（4连横 + 上下各1）
  [[0, 1], [1, 0], [1, 1], [1, 2], [1, 3], [2, 1]],
  // 十字竖（4连竖 + 左右各1）
  [[1, 0], [0, 1], [1, 1], [2, 1], [3, 1], [1, 2]],
  // 十字变体（上下错位）
  [[0, 0], [0, 1], [1, 1], [1, 2], [1, 3], [2, 1]],
  [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1], [2, 2]],
  // 阶梯形（S/Z）
  [[0, 0], [1, 0], [1, 1], [1, 2], [2, 1], [2, 2]],
  [[0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 1]],
  [[0, 0], [0, 1], [1, 1], [1, 2], [2, 1], [2, 2]],
  [[0, 1], [1, 1], [1, 2], [1, 3], [2, 1], [2, 2]],
  // 长 S
  [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2], [3, 2]],
  [[0, 1], [1, 0], [1, 1], [1, 2], [2, 2], [2, 3]],
  // 一字拐
  [[0, 0], [0, 1], [1, 1], [2, 1], [3, 1], [3, 2]],
  [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1], [2, 3]]
]
const FACE_DIR = {
  F: { up: 'U', down: 'D', left: 'L', right: 'R' },
  U: { up: 'B', down: 'F', left: 'L', right: 'R' },
  D: { up: 'F', down: 'B', left: 'L', right: 'R' },
  B: { up: 'U', down: 'D', left: 'R', right: 'L' },
  L: { up: 'U', down: 'D', left: 'B', right: 'F' },
  R: { up: 'U', down: 'D', left: 'F', right: 'B' }
}
// BFS 面指派（保守：只有能无冲突指派 6 面的展开图才使用，保证可拼合）
function foldNet(cells) {
  const key = (r, c) => r + ',' + c
  const set = new Set(cells.map(([r, c]) => key(r, c)))
  const ALL = ['U', 'D', 'F', 'B', 'L', 'R']
  // 展开图折叠时，任意一个格子都可作为「前面」；逐个尝试，取第一个能无冲突指派 6 面的
  for (const root of cells) {
    const faceOf = {}
    const coord = {}
    faceOf[key(root[0], root[1])] = 'F'
    coord.F = root
    const q = [root]
    let ok = true
    while (q.length && ok) {
      const [r, c] = q.shift()
      const f = faceOf[key(r, c)]
      const dirs = [[-1, 0, 'up'], [1, 0, 'down'], [0, -1, 'left'], [0, 1, 'right']]
      for (const [dr, dc, d] of dirs) {
        const nr = r + dr, nc = c + dc
        if (!set.has(key(nr, nc))) continue
        const nk = key(nr, nc)
        const nf = FACE_DIR[f][d]
        if (faceOf[nk] !== undefined) {
          if (faceOf[nk] !== nf) { ok = false; break }
          continue
        }
        faceOf[nk] = nf
        coord[nf] = [nr, nc]
        q.push([nr, nc])
      }
    }
    if (ok && Object.keys(faceOf).length === 6 && ALL.every((f) => coord[f])) return { faceOf, coord }
  }
  return null
}
const VALID_NETS = NET_CANDIDATES.map((cells, i) => ({ cells, fold: foldNet(cells), i })).filter((x) => x.fold)
// 旋转无关的面图案（避免朝向歧义，保证唯一解）
const CUBE_PATS = ['dot', 'square', 'tri', 'dia', 'cross', 'ring']
function patSvg(pat, cx, cy, s) {
  switch (pat) {
    case 'dot': return circ(cx, cy, s * 0.15, '#111', '#111', 0)
    case 'square': return `<rect x="${pad(cx - s * 0.17)}" y="${pad(cy - s * 0.17)}" width="${pad(s * 0.34)}" height="${pad(s * 0.34)}" fill="#111"/>`
    case 'tri': return poly(cx, cy, s * 0.3, 3, -90, '#111')
    case 'dia': return poly(cx, cy, s * 0.26, 4, -45, '#111')
    case 'cross': return `<line x1="${pad(cx - s * 0.2)}" y1="${pad(cy)}" x2="${pad(cx + s * 0.2)}" y2="${pad(cy)}" stroke="#111" stroke-width="${pad(s * 0.12)}"/><line x1="${pad(cx)}" y1="${pad(cy - s * 0.2)}" x2="${pad(cx)}" y2="${pad(cy + s * 0.2)}" stroke="#111" stroke-width="${pad(s * 0.12)}"/>`
    case 'ring': return circ(cx, cy, s * 0.2, 'none', '#111', 3)
    default: return ''
  }
}
// 等轴测立方体：顶面 U + 前面 F + 右面 R（三面可见）
function cubeBody(patU, patF, patR, box) {
  const s = box * 0.32
  const cx = box / 2, cy = box / 2
  const top = [[cx, cy - s], [cx + s, cy - s * 0.5], [cx, cy], [cx - s, cy - s * 0.5]]
  const front = [[cx - s, cy - s * 0.5], [cx, cy - s * 0.5], [cx, cy + s], [cx - s, cy + s]]
  const right = [[cx, cy - s * 0.5], [cx + s, cy - s * 0.5], [cx + s, cy + s], [cx, cy + s]]
  const P = (pts) => pts.map((p) => p.join(',')).join(' ')
  let s2 = ''
  s2 += `<polygon points="${P(right)}" fill="#8fc4e8" stroke="#111" stroke-width="2"/>`
  s2 += `<polygon points="${P(front)}" fill="#cfe6f6" stroke="#111" stroke-width="2"/>`
  s2 += `<polygon points="${P(top)}" fill="#eef6ff" stroke="#111" stroke-width="2"/>`
  s2 += patSvg(patR, cx + s * 0.5, cy + s * 0.25, s)
  s2 += patSvg(patF, cx - s * 0.5, cy + s * 0.25, s)
  s2 += patSvg(patU, cx, cy - s * 0.5, s)
  return s2
}
// 展开图（题干）：6 个格子带图案，居中排列
function netSvg(faces, coord, box) {
  // faces: {face: pattern}，coord: {face:[r,c]}
  let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity
  for (const f of ['U', 'D', 'F', 'B', 'L', 'R']) {
    minR = Math.min(minR, coord[f][0]); maxR = Math.max(maxR, coord[f][0])
    minC = Math.min(minC, coord[f][1]); maxC = Math.max(maxC, coord[f][1])
  }
  const rows = maxR - minR + 1, cols = maxC - minC + 1
  const cell = Math.min((box * 0.72) / cols, (box * 0.72) / rows)
  const ox = (box - cell * cols) / 2
  const oy = (box - cell * rows) / 2
  let s2 = ''
  for (const f of ['U', 'D', 'F', 'B', 'L', 'R']) {
    const [r, c] = coord[f]
    const x = ox + (c - minC) * cell
    const y = oy + (r - minR) * cell
    s2 += `<rect x="${pad(x)}" y="${pad(y)}" width="${pad(cell)}" height="${pad(cell)}" fill="#f2f7fc" stroke="#555" stroke-width="1.5"/>`
    s2 += patSvg(faces[f], x + cell / 2, y + cell / 2, cell * 0.9)
  }
  return s2
}
// 空间重构题：题干=展开图，选项=等轴测立方体（正确=折叠后的 U/F/R，干扰=换图案/相对面同现/多错）
function genCubeNet(seed) {
  if (!VALID_NETS.length) return null
  const net = VALID_NETS[seed % VALID_NETS.length]
  // 6 个面随机分配图案（两两不重复）
  const pats = CUBE_PATS.slice()
  const faces = {}
  const used = []
  const rnd = (n) => ((seed * 7919 + n * 104729) % 9973) / 9973
  for (const f of ['U', 'D', 'F', 'B', 'L', 'R']) {
    let pi = Math.floor(rnd(seed + f.charCodeAt(0)) * pats.length)
    while (used.includes(pats[pi])) pi = (pi + 1) % pats.length
    faces[f] = pats[pi]
    used.push(pats[pi])
  }
  const ans = { kind: 'cubenet', faces, coord: net.fold.coord, u: faces.U, f: faces.F, r: faces.R, d: faces.D, b: faces.B, l: faces.L }
  // 干扰项：换 U↔F、把对面 D 放进来、把 B 放进来、全错组合
  const d1 = { ...ans, u: faces.F, f: faces.U } // U/F 互换
  const d2 = { ...ans, f: faces.D, r: faces.L } // 前面换成对面D，右面换L（对面与U同现）
  const d3 = { ...ans, u: faces.B } // 顶面换成背面B
  const opts = [ans, d1, d2, d3]
  const verify = (f) => f && f.kind === 'cubenet' && f.u === faces.U && f.f === faces.F && f.r === faces.R
  return { figs: [ans], ans, opts, verify, stemExtra: true }
}

function hexPoly(cx, cy, r, fill, stroke) {
  const pts = []
  for (let i = 0; i < 6; i++) {
    const a = ((60 * i - 30) * Math.PI) / 180
    pts.push(`${pad(cx + r * Math.cos(a))},${pad(cy + r * Math.sin(a))}`)
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`
}
function genHiveCount(_seed) {
  // 3×3 蜂窝，黑色六边形数量递增 1→5，问号=6（数量递增规律）
  const LIB = {
    1: [[1, 1]],
    2: [[1, 1], [1, 2]],
    3: [[1, 1], [1, 2], [2, 1]],
    4: [[1, 1], [1, 2], [2, 1], [2, 2]],
    5: [[0, 1], [1, 1], [1, 2], [2, 1], [2, 2]],
    6: [[0, 1], [1, 1], [1, 2], [2, 1], [2, 2], [0, 2]],
    7: [[0, 0], [0, 1], [1, 1], [1, 2], [2, 1], [2, 2], [0, 2]],
    8: [[0, 0], [0, 1], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]]
  }
  const figs = []
  for (let n = 1; n <= 5; n++) figs.push({ kind: 'hive', rows: 3, cols: 3, cells: LIB[n] })
  const ans = { kind: 'hive', rows: 3, cols: 3, cells: LIB[6] }
  const opts = [ans, { kind: 'hive', rows: 3, cols: 3, cells: LIB[5] }, { kind: 'hive', rows: 3, cols: 3, cells: LIB[7] }, { kind: 'hive', rows: 3, cols: 3, cells: LIB[8] }]
  return { figs, ans, opts, verify: (f) => f && f.kind === 'hive' && f.cells.length === 6 }
}
// ================= 复合规律：数量递增 + 连续路径（黑块沿路径延伸） =================
function genPathCount(_seed) {
  const path = [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [2, 1]]
  const figs = []
  for (let k = 1; k <= 5; k++) figs.push({ kind: 'block', grid: 3, cells: path.slice(0, k) })
  const ans = { kind: 'block', grid: 3, cells: path }
  const opts = [
    ans,
    { kind: 'block', grid: 3, cells: path.slice(0, 5) },
    { kind: 'block', grid: 3, cells: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [2, 0]] },
    { kind: 'block', grid: 3, cells: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [2, 1], [1, 1]] }
  ]
  const verify = (f) => f && f.kind === 'block' && cellsKey(f) === cellsKey(ans)
  return { figs, ans, opts, verify }
}
// ================= 黑块整体平移（3×3 周期） =================
function genBlockMove(seed) {
  const pair = seed % 2 === 0 ? [[1, 0], [2, 0]] : [[0, 0], [2, 0]]
  const figs = []
  for (let k = 0; k < 5; k++) figs.push({ kind: 'block', grid: 3, cells: pair.map(([r, c]) => [r, (c + k) % 3]) })
  const ans = { kind: 'block', grid: 3, cells: pair.map(([r, c]) => [r, (c + 5) % 3]) }
  const opts = [
    ans,
    { kind: 'block', grid: 3, cells: pair.map(([r, c]) => [r, (c + 4) % 3]) },
    { kind: 'block', grid: 3, cells: pair.map(([r, c]) => [r, (c + 6) % 3]) },
    { kind: 'block', grid: 3, cells: [[1, 0], [2, 2]] }
  ]
  const verify = (f) => f && f.kind === 'block' && cellsKey(f) === cellsKey(ans)
  return { figs, ans, opts, verify }
}

const RULE_DESC = { xor: '黑+黑=白、黑+白=黑、白+白=白', or: '黑+黑=黑、黑+白=黑、白+白=白', and: '黑+黑=黑、黑+白=白、白+白=白', xnor: '同色为黑、异色为白', left: '结果=左侧图形', right: '结果=右侧图形' }
// ================= 组装 =================
export const TUTU_FAMILY_NAMES = {
  blackSeq: '黑白块数量递增', dotsSeq: '图形数量递增', arrowSeq: '箭头旋转', symSeq: '对称轴数量递增',
  hanziSeq: '汉字笔画数递增', posMove: '黑点位置移动', relPos: '两图形位置关系',
  overlay: '九宫格黑白叠加', matrixCount: '九宫格行同数量',
  rotChain: '旋转（两组图）', flipChain: '翻转（两组图）',
  groupSym: '对称性分组', groupHanzi: '汉字笔画分组', groupCurve: '曲直性分组', groupLetter: '字母对称分组'
}
const SEQ_FAMILIES = ['blackSeq', 'dotsSeq', 'arrowSeq', 'symSeq', 'hanziSeq', 'posMove', 'relPos', 'hiveCount', 'pathCount', 'blockMove']
const MATRIX_FAMILIES = ['overlay', 'matrixCount']
const CUBE_FAMILIES = ['cubenet']
const ANALOGY_FAMILIES = ['rotChain', 'flipChain']
const GROUP_FAMILIES = ['groupSym', 'groupHanzi', 'groupCurve', 'groupLetter']

const ASK_SEQ = '从所给的四个选项中，选择最合适的一个填入问号处，使之呈现一定的规律性。'
const ASK_GROUP = '把下面的六个图形分为两类，使每一类图形都有各自的共同特征或规律，分类正确的一项是：'
// 每个规律族一句话规律（答完直接展示，离线可用）
const RULE_TEXT = {
  blackSeq: '规律：每个图形中黑色小方块的个数依次为 1、2、3、4、5，问号处应为 6 个（且连成一片）。',
  dotsSeq: '规律：每个图形中小圆圈的个数依次为 1、2、3、4、5，问号处应为 6 个。',
  arrowSeq: '规律：箭头每次顺时针旋转 90°，问号处箭头应指向正下方。',
  symSeq: '规律：每个正多边形的边数（对称轴数）依次为 3、4、5、6，问号处应为 7 条对称轴的正七边形。',
  hanziSeq: '规律：每个汉字的笔画数依次为 1、2、3、4、5 画，问号处应选 6 画的汉字。',
  overlay: '规律：九宫格每行中，第一个图形与第二个图形按黑白运算规则叠加得到第三个图形，问号处按该规则推出。',
  rotChain: '规律：每组图形都按同一方向每次旋转 90°，问号处应为继续旋转 90° 后的图形。',
  flipChain: '规律：每组第二个图形是第一个图形沿竖直轴左右翻转所得，第三个与第一个相同，问号处应为未翻转的原图形。',
  posMove: '规律：黑色圆点沿 3×3 网格每次向右移动一格，到行尾换行，问号处应在第 6 格。',
  relPos: '规律：圆与方块的相对位置依次为 相离→相切→相交→内含→相离…，问号处应为相切。',
  matrixCount: '规律：九宫格每行小圆个数相同（第1行2个、第2行3个、第3行4个），问号处应为 4 个。',
  groupSym: '规律：①②③均为轴对称图形，④⑤⑥均非轴对称图形。',
  groupHanzi: '规律：①③⑤均为 4 画汉字，②④⑥均为 5 画汉字。',
  groupCurve: '规律：①②③均由曲线构成，④⑤⑥均由直线构成。',
  groupLetter: '规律：①②③均为轴对称字母，④⑤⑥均非轴对称字母。',
  hiveCount: '规律：黑色六边形数量依次为 1、2、3、4、5，问号处应为 6 个。',
  pathCount: '规律：黑色小方块数量依次递增，且始终沿一条连续路径延伸，问号处应为完整的 6 格路径。',
  blockMove: '规律：两个黑色小方块作为一个整体每次向右平移一格（到边界回到起点），问号处应在下一位置。',
  cubenet: '规律：观察展开图中各面的图案与相邻关系，折叠成正方体后，正确项的三个可见面（上面/前面/右面）的图案必须与展开图折叠结果一致（相对面不能同时出现）。'
}

function shuffleIdx(seed) {
  return ((seed % 4) + 4) % 4
}
function buildOpts(gen, seed, isGroup) {
  const letters = ['A', 'B', 'C', 'D']
  const shift = shuffleIdx(seed)
  const options = []
  let answer = ''
  for (let i = 0; i < 4; i++) {
    const srcIdx = (i + shift) % 4
    const k = letters[i]
    if (isGroup) {
      options.push({ k, t: gen.opts[srcIdx] })
      if (srcIdx === 0) answer = k
    } else {
      const fig = gen.opts[srcIdx]
      options.push({ k, t: optSvg(fig), _fig: fig })
      if (fig === gen.ans) answer = k
    }
  }
  return { options, answer }
}

let _seq = 0
function hashIdx(n, len) {
  // murmur 风格雪崩散列：充分打乱相邻种子的低位，避免「乘常数≡1 mod len」导致奇偶/模退化偏斜
  let x = (n ^ (n >>> 16)) * 2654435761 >>> 0
  x = (x ^ (x >>> 13)) * 2246822519 >>> 0
  x = (x ^ (x >>> 16)) >>> 0
  return x % len
}
export function genTutuQuestion(seed) {
  // 默认种子带自增计数，避免同一毫秒内多次调用生成相同题
  if (seed === undefined) seed = (Date.now() % 100000) + (_seq++ * 97) % 997
  for (let attempt = 0; attempt < 8; attempt++) {
    const s = seed + attempt * 131
    const forms = ['seq', 'seq', 'seq', 'matrix', 'analogy', 'group', 'cube']
    const form = forms[hashIdx(s, forms.length)]
    // family 必须用「独立于 form」的散列值：同一个 x 的 x%6 与 x%2/x%4 强相关（x%6==3 时 x 恒为奇数），
    // 否则每种形式只会选中固定奇偶索引的族，导致 overlay/flipChain/groupSym/groupCurve 永远出不来
    const hf = hashIdx(s + 2654435761, 31)
    const family = form === 'seq' ? SEQ_FAMILIES[hf % SEQ_FAMILIES.length]
      : form === 'matrix' ? MATRIX_FAMILIES[hf % MATRIX_FAMILIES.length]
      : form === 'analogy' ? ANALOGY_FAMILIES[hf % ANALOGY_FAMILIES.length]
      : form === 'cube' ? CUBE_FAMILIES[hf % CUBE_FAMILIES.length]
      : GROUP_FAMILIES[hf % GROUP_FAMILIES.length]
    const q = buildQuestion(family, form, s)
    if (q && uniqueOpts(q)) return q
  }
  return null
}

// 37号 门禁：四选项语义文本（剥标签/代码块/空白/大小写）必须两两不同——相同外观/相同标注的选项会破坏唯一单选
function semKey(o) {
  return String(o.t || o || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\s\u3000]+/g, '')
    .toLowerCase()
}
function uniqueOpts(q) {
  const seen = new Set()
  for (const o of (q.options || [])) {
    const key = semKey(o)
    if (!key) continue
    if (seen.has(key)) return false
    seen.add(key)
  }
  return true
}

function buildQuestion(family, form, seed) {
  let gen
  if (family === 'blackSeq') gen = genBlackSeq(seed)
  else if (family === 'dotsSeq') gen = genDotsSeq(seed)
  else if (family === 'arrowSeq') gen = genArrowSeq(seed)
  else if (family === 'symSeq') gen = genSymSeq(seed)
  else if (family === 'hanziSeq') gen = genHanziSeq(seed)
  else if (family === 'overlay') gen = genOverlayMatrix(seed)
  else if (family === 'rotChain') gen = genRotChain(seed)
  else if (family === 'flipChain') gen = genFlipChain(seed)
  else if (family === 'posMove') gen = genPosMove(seed)
  else if (family === 'relPos') gen = genRelPos(seed)
  else if (family === 'matrixCount') gen = genMatrixCount(seed)
  else if (family === 'groupSym') gen = genGroupSym(seed)
  else if (family === 'groupHanzi') gen = genGroupHanzi(seed)
  else if (family === 'groupCurve') gen = genGroupCurve(seed)
  else if (family === 'groupLetter') gen = genGroupLetter(seed)
  else if (family === 'hiveCount') gen = genHiveCount(seed)
  else if (family === 'pathCount') gen = genPathCount(seed)
  else if (family === 'blockMove') gen = genBlockMove(seed)
  else if (family === 'cubenet') gen = genCubeNet(seed)
  else return null
  if (!gen) return null
  if (family === 'cubenet') {
    const stemSvg2 = normalizeSvg(`<svg width="380" height="380">${netSvg(gen.ans.faces, gen.ans.coord, 380)}</svg>`)
    const stem2 = `### 📝 题目\n\n\`\`\`svg\n${stemSvg2}\n\`\`\`\n\n【问法】左边给定的是纸盒的外表面，下面哪一项能由它折叠而成？`
    const o2 = buildOpts(gen, seed, false)
    return { stem: stem2, options: o2.options, answer: o2.answer, explain: RULE_TEXT.cubenet, family, form: 'cube', local: true }
  }
  const isGroup = form === 'group'
  let stemSvg = ''
  if (form === 'seq') stemSvg = svgCanvas(620, 150, seqSlots(gen.figs))
  else if (form === 'matrix') stemSvg = svgCanvas(420, 420, matSlots(gen.figs))
  else if (form === 'analogy') stemSvg = svgCanvas(620, 310, anaSlots(gen.figs))
  else stemSvg = svgCanvas(620, 150, grpSlots(gen.figs))
  const stem = `### 📝 题目\n\n\`\`\`svg\n${stemSvg}\n\`\`\`\n\n【问法】${isGroup ? ASK_GROUP : ASK_SEQ}`
  const o = buildOpts(gen, seed, isGroup)
  // 唯一解校验：仅答案选项符合规律
  if (!isGroup) {
    const ok = o.options.filter((opt) => (gen.verify ? gen.verify(opt._fig) : true))
    if (ok.length !== 1 || ok[0].k !== o.answer) return null
  }
  const explain = (RULE_TEXT[family] || '') + (gen.rule && RULE_DESC[gen.rule] ? '（运算规则：' + RULE_DESC[gen.rule] + '）' : '')
  return { stem, options: o.options, answer: o.answer, explain, family, form, local: true }
}
