// utils/svgFix.js —— SVG 零裁切归一化（图推/几何/统计图通用）
// 背景：AI 生成的 SVG 常缺 viewBox，或元素坐标越出画布；页面用 CSS max-width:100% 缩放时，
//       无 viewBox 的 SVG 不会等比缩放而是直接裁切。本模块：
//       ① 缺 viewBox → 按宽高补 "0 0 W H"
//       ② 扫描子元素（rect/circle/ellipse/line/polyline/polygon/path/text/g 含变换）计算内容紧致包围盒，
//          内容越界时把 viewBox 扩展到内容边界（+6px 内边距），任何元素都不被裁
//       ③ 补 preserveAspectRatio="xMidYMid meet" 与 xmlns
// 纯函数、无 DOM 依赖，浏览器与 Node 测试环境通用。

const PAD = 6

function num(v, dflt) {
  const n = parseFloat(String(v == null ? '' : v).replace(/px$/i, ''))
  return Number.isFinite(n) ? n : dflt
}
function round1(n) {
  return Math.round(n * 10) / 10
}

// 解析标签属性 → { 属性名: 值 }
function parseAttrs(raw) {
  const attrs = {}
  const re = /([a-zA-Z:_][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g
  let m
  while ((m = re.exec(raw))) attrs[m[1]] = m[3] !== undefined ? m[3] : m[4]
  return attrs
}

// 解析 viewBox="minX minY w h"（兼容逗号）
function parseViewBox(v) {
  if (!v) return null
  const parts = String(v).replace(/,/g, ' ').trim().split(/\s+/).map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null
  const [minX, minY, w, h] = parts
  if (w <= 0 || h <= 0) return null
  return { minX, minY, w, h }
}

// 解析 transform="translate(x,y) rotate(deg) scale(sx,sy) matrix(a,b,c,d,e,f)"
function parseTransform(t) {
  if (!t) return []
  const out = []
  const re = /(translate|rotate|scale|matrix|skewX|skewY)\s*\(([^)]*)\)/g
  let m
  while ((m = re.exec(String(t)))) {
    const args = m[2].split(/[\s,]+/).filter(Boolean).map(Number)
    const type = m[1]
    if (type === 'translate' && args.length >= 1) out.push({ type, x: args[0] || 0, y: args[1] || 0 })
    else if (type === 'rotate' && args.length >= 1) out.push({ type, deg: args[0] || 0, cx: args[1] || 0, cy: args[2] || 0 })
    else if (type === 'scale' && args.length >= 1) out.push({ type, sx: args[0] || 1, sy: args.length >= 2 ? args[1] : args[0] })
    else if (type === 'matrix' && args.length >= 6) out.push({ type, a: args[0], b: args[1], c: args[2], d: args[3], e: args[4], f: args[5] })
    else if (type === 'skewX') out.push({ type: 'matrix', a: 1, b: 0, c: Math.tan((args[0] || 0) * Math.PI / 180), d: 1, e: 0, f: 0 })
    else if (type === 'skewY') out.push({ type: 'matrix', a: 1, b: Math.tan((args[0] || 0) * Math.PI / 180), c: 0, d: 1, e: 0, f: 0 })
  }
  return out
}
function applyPoint(transforms, x, y) {
  let px = x, py = y
  for (const t of transforms) {
    if (t.type === 'translate') { px += t.x; py += t.y }
    else if (t.type === 'scale') { px *= t.sx; py *= t.sy }
    else if (t.type === 'rotate') {
      const rad = t.deg * Math.PI / 180
      const dx = px - t.cx, dy = py - t.cy
      px = t.cx + dx * Math.cos(rad) - dy * Math.sin(rad)
      py = t.cy + dx * Math.sin(rad) + dy * Math.cos(rad)
    } else if (t.type === 'matrix') {
      const nx = t.a * px + t.c * py + t.e
      const ny = t.b * px + t.d * py + t.f
      px = nx; py = ny
    }
  }
  return [px, py]
}

// ===== 各元素在本地坐标系的包围盒 =====
function rectBounds(a) {
  const x = num(a.x, 0), y = num(a.y, 0), w = num(a.width, 0), h = num(a.height, 0)
  return { minX: x, minY: y, maxX: x + w, maxY: y + h, sw: num(a['stroke-width'], 0) }
}
function circleBounds(a) {
  const cx = num(a.cx, 0), cy = num(a.cy, 0), r = num(a.r, 0)
  return { minX: cx - r, minY: cy - r, maxX: cx + r, maxY: cy + r, sw: num(a['stroke-width'], 0) }
}
function ellipseBounds(a) {
  const cx = num(a.cx, 0), cy = num(a.cy, 0), rx = num(a.rx, 0), ry = num(a.ry, 0)
  return { minX: cx - rx, minY: cy - ry, maxX: cx + rx, maxY: cy + ry, sw: num(a['stroke-width'], 0) }
}
function lineBounds(a) {
  const x1 = num(a.x1, 0), y1 = num(a.y1, 0), x2 = num(a.x2, 0), y2 = num(a.y2, 0)
  return { minX: Math.min(x1, x2), minY: Math.min(y1, y2), maxX: Math.max(x1, x2), maxY: Math.max(y1, y2), sw: num(a['stroke-width'], 0) }
}
function pointsBounds(v) {
  const tokens = String(v || '').trim().split(/[\s,]+/).filter(Boolean).map(Number)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (let i = 0; i + 1 < tokens.length; i += 2) {
    const x = tokens[i], y = tokens[i + 1]
    if (Number.isFinite(x) && Number.isFinite(y)) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x)
      minY = Math.min(minY, y); maxY = Math.max(maxY, y)
    }
  }
  if (!Number.isFinite(minX)) return null
  return { minX, minY, maxX, maxY, sw: 0 }
}
// path 包围盒：曲线用控制点保守外扩（Bézier 在控制点凸包内，只扩不缩，保证不裁）
function pathBounds(d) {
  const tokens = String(d || '').match(/[MmLlHhVvCcSsQqTtAaZz]|-?[\d.]+(?:e[-+]?\d+)?/gi) || []
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  let cx = 0, cy = 0, startX = 0, startY = 0, cmd = ''
  let i = 0
  const add = (x, y) => {
    if (Number.isFinite(x) && Number.isFinite(y)) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x)
      minY = Math.min(minY, y); maxY = Math.max(maxY, y)
    }
  }
  const nextN = () => { const v = Number(tokens[i]); i++; return Number.isFinite(v) ? v : 0 }
  while (i < tokens.length) {
    const t = tokens[i]
    if (/[a-zA-Z]/.test(t)) { cmd = t; i++; continue }
    const rel = cmd === cmd.toLowerCase()
    const C = cmd.toUpperCase()
    if (C === 'M' || C === 'L') {
      const x = nextN(), y = nextN()
      const px = rel ? cx + x : x, py = rel ? cy + y : y
      add(px, py); cx = px; cy = py
      if (C === 'M') { startX = px; startY = py }
    } else if (C === 'H') {
      const x = nextN(); const px = rel ? cx + x : x
      add(px, cy); cx = px
    } else if (C === 'V') {
      const y = nextN(); const py = rel ? cy + y : y
      add(cx, py); cy = py
    } else if (C === 'C') {
      const x1 = nextN(), y1 = nextN(), x2 = nextN(), y2 = nextN(), x = nextN(), y = nextN()
      const p1 = rel ? [cx + x1, cy + y1] : [x1, y1]
      const p2 = rel ? [cx + x2, cy + y2] : [x2, y2]
      const p = rel ? [cx + x, cy + y] : [x, y]
      add(p1[0], p1[1]); add(p2[0], p2[1]); add(p[0], p[1])
      cx = p[0]; cy = p[1]
    } else if (C === 'S') {
      const x2 = nextN(), y2 = nextN(), x = nextN(), y = nextN()
      const p2 = rel ? [cx + x2, cy + y2] : [x2, y2]
      const p = rel ? [cx + x, cy + y] : [x, y]
      add(p2[0], p2[1]); add(p[0], p[1])
      cx = p[0]; cy = p[1]
    } else if (C === 'Q') {
      const x1 = nextN(), y1 = nextN(), x = nextN(), y = nextN()
      const p1 = rel ? [cx + x1, cy + y1] : [x1, y1]
      const p = rel ? [cx + x, cy + y] : [x, y]
      add(p1[0], p1[1]); add(p[0], p[1]); add(cx, cy)
      cx = p[0]; cy = p[1]
    } else if (C === 'T') {
      const x = nextN(), y = nextN()
      const p = rel ? [cx + x, cy + y] : [x, y]
      add(p[0], p[1]); add(cx, cy)
      cx = p[0]; cy = p[1]
    } else if (C === 'A') {
      const rx = nextN(), ry = nextN(), x = nextN(), y = nextN()
      const p = rel ? [cx + x, cy + y] : [x, y]
      add(cx, cy); add(p[0], p[1])
      add(cx - rx, cy - ry); add(cx + rx, cy + ry)
      add(p[0] - rx, p[1] - ry); add(p[0] + rx, p[1] + ry)
      cx = p[0]; cy = p[1]
    } else if (C === 'Z') {
      cx = startX; cy = startY
    }
  }
  if (!Number.isFinite(minX)) return null
  return { minX, minY, maxX, maxY, sw: 0 }
}
function textBounds(a, content) {
  const x = num(a.x, 0), y = num(a.y, 0)
  const fs = num(a['font-size'], 16)
  const anchor = a['text-anchor'] || 'start'
  let w = 0
  for (const ch of String(content || '')) w += (ch.codePointAt(0) > 0x2e80 ? 1 : 0.55) * fs
  let left = x
  if (anchor === 'middle') left = x - w / 2
  else if (anchor === 'end') left = x - w
  return { minX: left, minY: y - fs * 1.1, maxX: left + w, maxY: y + fs * 0.25, sw: 0 }
}

// 扫描 svg 内部，返回内容紧致包围盒（已应用 g 的 transform）
function computeBounds(body) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const addBox = (b, tfs) => {
    if (!b) return
    const pts = [[b.minX, b.minY], [b.maxX, b.minY], [b.minX, b.maxY], [b.maxX, b.maxY]]
    const sw = b.sw || 0
    for (const [x, y] of pts) {
      const [px, py] = applyPoint(tfs, x, y)
      minX = Math.min(minX, px - sw / 2); maxX = Math.max(maxX, px + sw / 2)
      minY = Math.min(minY, py - sw / 2); maxY = Math.max(maxY, py + sw / 2)
    }
  }
  const transforms = [] // 每层 g 的变换函数数组
  const SKIP = { defs: 1, clipPath: 1, mask: 1, pattern: 1, marker: 1 }
  let skipDepth = 0
  const re = /<\/?([a-zA-Z][\w-]*)((?:\s+[^<>]*?)?)(\/?)>/g
  let m
  while ((m = re.exec(body))) {
    const full = m[0], name = m[1], attrsRaw = m[2] || '', selfClose = m[3] === '/'
    if (full.startsWith('</')) {
      if (SKIP[name]) skipDepth = Math.max(0, skipDepth - 1)
      if (name === 'g') transforms.pop()
      continue
    }
    if (SKIP[name]) { skipDepth++; continue }
    if (skipDepth > 0) continue
    const curT = transforms.length ? transforms.flat() : []
    if (name === 'g') {
      if (!selfClose) transforms.push(parseTransform(parseAttrs(attrsRaw).transform))
      continue
    }
    const a = parseAttrs(attrsRaw)
    let b = null
    if (name === 'rect') b = rectBounds(a)
    else if (name === 'circle') b = circleBounds(a)
    else if (name === 'ellipse') b = ellipseBounds(a)
    else if (name === 'line') b = lineBounds(a)
    else if (name === 'polyline' || name === 'polygon') b = pointsBounds(a.points)
    else if (name === 'path') b = pathBounds(a.d)
    else if (name === 'text') {
      const start = re.lastIndex
      const endIdx = body.indexOf('</text>', start)
      const content = endIdx >= 0 ? body.slice(start, endIdx).replace(/<[^>]*>/g, '') : ''
      b = textBounds(a, content)
      if (endIdx >= 0) re.lastIndex = endIdx + '</text>'.length
    }
    addBox(b, curT)
  }
  if (!Number.isFinite(minX)) return null
  return { minX, minY, maxX, maxY }
}

function unionVb(v1, v2) {
  const minX = Math.min(v1.minX, v2.minX)
  const minY = Math.min(v1.minY, v2.minY)
  const maxX = Math.max(v1.minX + v1.w, v2.minX + v2.w)
  const maxY = Math.max(v1.minY + v1.h, v2.minY + v2.h)
  return { minX, minY, w: maxX - minX, h: maxY - minY }
}

// 白图描边安全网：AI 偶尔把图形画成「白底白图/透明无描边」导致整题空白不可见。
// 对任何 fill=白/透明/无 且 stroke 不可见的形状自动补浅灰描边，保证图形永远可见
//（黑白块题里的"白格"也因此能正常显示为带边框的格子）。
function outlineInvisible(raw) {
  return String(raw).replace(/<(rect|circle|ellipse|path|polygon|polyline|line)\b([^>]*?)(\/?)>/gi, (m, tag, attrs, self) => {
    const val = (re) => { const x = re.exec(attrs); return x ? (x[2] !== undefined ? x[2] : x[3]) : '' }
    const fill = val(/fill\s*=\s*("([^"]*)"|'([^']*)')/i)
    const stroke = val(/stroke\s*=\s*("([^"]*)"|'([^']*)')/i)
    const sw = val(/stroke-width\s*=\s*("([^"]*)"|'([^']*)')/i)
    const isWhiteFill = !fill || /^#(fff|ffffff|f8|faf|fef)/i.test(fill) || /white|none|transparent/i.test(fill)
    const hasVisibleStroke = stroke && !/^#(fff|ffffff)/i.test(stroke) && !/white|none|transparent/i.test(stroke) && !/^0(px)?$/.test(sw)
    if (!isWhiteFill || hasVisibleStroke) return m
    let out = '<' + tag + attrs
    if (!/stroke\s*=/.test(attrs)) out += ' stroke="#bbbbbb"'
    if (!/stroke-width\s*=/.test(attrs)) out += ' stroke-width="1.5"'
    return out + (self ? '/>' : '>')
  })
}

// 主入口：把任意 SVG 字符串归一化为「自带 viewBox + preserveAspectRatio + xmlns、内容不越界」的版本
export function normalizeSvg(raw) {
  raw = outlineInvisible(raw) // 白图描边安全网：先让白底白图可见，再算边界
  const svgM = String(raw || '').match(/<svg([\s\S]*?)>([\s\S]*?)<\/svg>/i)
  if (!svgM) return String(raw || '')
  const tag = svgM[1]
  const body = svgM[2]
  const attrs = parseAttrs(tag)
  const W = num(attrs.width, 100)
  const H = num(attrs.height, 100)
  let vb = parseViewBox(attrs.viewBox)
  const content = computeBounds(body)
  if (content) {
    const cw = content.maxX - content.minX
    const ch = content.maxY - content.minY
    if (Number.isFinite(cw) && Number.isFinite(ch) && cw > 0 && ch > 0) {
      const contentVb = { minX: content.minX - PAD, minY: content.minY - PAD, w: cw + PAD * 2, h: ch + PAD * 2 }
      vb = vb ? unionVb(vb, contentVb) : contentVb
    }
  }
  if (!vb) vb = { minX: 0, minY: 0, w: W, h: H }
  // 保留原标签的安全属性，强制覆盖 viewBox/preserveAspectRatio/xmlns
  const keep = ['width', 'height', 'class', 'style', 'role', 'aria-label']
  let open = '<svg'
  for (const k of keep) if (attrs[k] !== undefined) open += ' ' + k + '="' + attrs[k] + '"'
  open += ' xmlns="http://www.w3.org/2000/svg"'
  open += ' viewBox="' + [round1(vb.minX), round1(vb.minY), round1(vb.w), round1(vb.h)].join(' ') + '"'
  open += ' preserveAspectRatio="xMidYMid meet"'
  open += '>'
  return open + body + '</svg>'
}
