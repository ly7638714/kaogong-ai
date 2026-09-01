// ===== 立体图推 · 共享 three.js 依赖与底层工具（自 solidTrain.js 纯移动，未改动） =====
// 本模块是依赖汇集点：只 import 'three'，不反向依赖 solid/ 其它模块，避免循环依赖。
// 供 voxel/solids/nets/slice 共享的 THREE 几何构建与坐标工具集中于此。
import * as THREE from 'three'

// ---------- 基础工具（THREE 几何构建，导出供 voxel/solids 复用） ----------
export function box(w, h, d, color) {
  const g = new THREE.BoxGeometry(w, h, d)
  const m = new THREE.MeshPhongMaterial({ color, transparent: true, opacity: 0.92 })
  return new THREE.Mesh(g, m)
}
export function wire(mesh, color = 0x9bd1ff) {
  const e = new THREE.EdgesGeometry(mesh.geometry)
  const l = new THREE.LineSegments(e, new THREE.LineBasicMaterial({ color }))
  mesh.add(l)
  return mesh
}

export function center(group) {
  const bb = new THREE.Box3().setFromObject(group)
  const c = bb.getCenter(new THREE.Vector3())
  group.position.sub(c)
  return group
}

export function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ---------- 笔迹平滑 / 形状识别 / 面纹理（展开图涂色/自由绘制） ----------
export function pointSegDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

export function simplifyStroke(pts, eps = 0.012) {
  if (!pts || pts.length < 3) return (pts || []).map(p => [p[0], p[1]])
  let maxD = 0, idx = 0
  const a = pts[0], b = pts[pts.length - 1]
  for (let i = 1; i < pts.length - 1; i++) {
    const d = pointSegDist(pts[i], a, b)
    if (d > maxD) { maxD = d; idx = i }
  }
  if (maxD > eps) {
    const l = simplifyStroke(pts.slice(0, idx + 1), eps)
    const r = simplifyStroke(pts.slice(idx), eps)
    return l.slice(0, -1).concat(r)
  }
  return [a.slice(), b.slice()]
}

export function traceStrokePath(ctx, pts, closed = false) {
  if (!pts || pts.length < 2) return
  const n = pts.length
  ctx.beginPath()
  if (n === 2) {
    ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[1][0], pts[1][1]); return
  }
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  if (closed) {
    const m0 = mid(pts[0], pts[1])
    ctx.moveTo(m0[0], m0[1])
    for (let i = 1; i <= n; i++) {
      const a = pts[i % n], b = pts[(i + 1) % n]
      const m = mid(a, b)
      ctx.quadraticCurveTo(a[0], a[1], m[0], m[1])
    }
    ctx.closePath()
  } else {
    ctx.moveTo(pts[0][0], pts[0][1])
    const m0 = mid(pts[0], pts[1])
    ctx.lineTo(m0[0], m0[1])
    for (let i = 1; i < n - 1; i++) {
      const m = mid(pts[i], pts[i + 1])
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1])
    }
    ctx.lineTo(pts[n - 1][0], pts[n - 1][1])
  }
}

export function makeFaceTexture(fill, strokes, size = 256, regions = null) {
  const cv = document.createElement('canvas')
  cv.width = size; cv.height = size
  const ctx = cv.getContext('2d')
  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle = fill || '#334155'
  ctx.fillRect(0, 0, size, size)
  // 封闭区域填色（48×48 网格）
  const GRID = 48
  if (regions) {
    for (const rg of regions) {
      if (!rg || !rg.cells || !rg.cells.length) continue
      ctx.fillStyle = rg.color || '#e11d2e'
      for (const [cx, cy] of rg.cells) {
        ctx.fillRect(cx / GRID * size, cy / GRID * size, size / GRID + 0.6, size / GRID + 0.6)
      }
    }
  }
  // 网格参考线（浅）
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'
  ctx.lineWidth = 1
  for (let i = 1; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo(size * i / 4, 0); ctx.lineTo(size * i / 4, size); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, size * i / 4); ctx.lineTo(size, size * i / 4); ctx.stroke()
  }
  for (const s of strokes || []) {
    if (!s || !s.points || s.points.length < 2) continue
    ctx.strokeStyle = s.color || '#0f172a'
    ctx.lineWidth = (s.width || 3) * (size / 128)
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    traceStrokePath(ctx, s.points.map(p => [p[0] * size, p[1] * size]), !!s.closed)
    ctx.stroke()
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

// ---------- 坐标键（去重 / 焊接） ----------
function ptKey(v) { const f = n => String(Math.round(n * 10000) / 10000); return `${f(v.x)},${f(v.y)},${f(v.z)}` }
function edgeKey(a, b) { const k1 = ptKey(a), k2 = ptKey(b); return k1 < k2 ? k1 + '|' + k2 : k2 + '|' + k1 }

// slice 模块共用：体素切片用 keyPt / simplifyLoop / weldSegments（导出供 slice.js 复用）
export function keyPt(v) {
  const f = n => String(Math.round(n * 10000) / 10000)
  return `${f(v.x)},${f(v.y)},${f(v.z)}`
}
export function simplifyLoop(loop) {
  if (loop.length < 4) return loop
  const minD = 1e-4
  const out = []
  for (const p of loop) {
    if (out.length && out[out.length - 1].distanceTo(p) < minD) continue
    out.push(p)
  }
  if (out.length > 1 && out[0].distanceTo(out[out.length - 1]) < minD) out.pop()
  const n = out.length
  const res = []
  for (let i = 0; i < n; i++) {
    const prev = out[(i - 1 + n) % n]
    const cur = out[i]
    const nxt = out[(i + 1) % n]
    const v1 = cur.clone().sub(prev)
    const v2 = nxt.clone().sub(cur)
    const cross = v1.clone().cross(v2).length()
    const lenProd = v1.length() * v2.length()
    if (lenProd > 1e-9 && cross / lenProd < 1e-3) continue
    res.push(cur)
  }
  return res.length >= 3 ? res : out
}
export function weldSegments(segments) {
  const key = keyPt
  const loops = []
  const used = new Array(segments.length).fill(false)
  for (let s = 0; s < segments.length; s++) {
    if (used[s]) continue
    const loop = [segments[s][0].clone(), segments[s][1].clone()]
    used[s] = true
    let extended = true
    while (extended) {
      extended = false
      const tail = key(loop[loop.length - 1])
      for (let j = 0; j < segments.length; j++) {
        if (used[j]) continue
        const [a, b] = segments[j]
        if (key(a) === tail) { loop.push(b.clone()); used[j] = true; extended = true; break }
        if (key(b) === tail) { loop.push(a.clone()); used[j] = true; extended = true; break }
      }
    }
    const simp = simplifyLoop(loop)
    if (simp.length >= 3) loops.push(simp)
  }
  return loops
}

// ---------- 实时统计：面 / 棱 / 顶点 / 表面积 ----------
export function computeMeshStats(group) {
  let faces = 0, area = 0
  const vset = new Set(), eset = new Set()
  group.updateMatrixWorld(true)
  group.traverse(o => {
    if (!o.isMesh || !o.geometry) return
    const pos = o.geometry.attributes.position
    if (!pos) return
    const idx = o.geometry.index
    const mat = o.matrixWorld
    const n = idx ? idx.count : pos.count
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
    for (let i = 0; i + 2 < n; i += 3) {
      const i0 = idx ? idx.getX(i) : i
      const i1 = idx ? idx.getX(i + 1) : i + 1
      const i2 = idx ? idx.getX(i + 2) : i + 2
      a.fromBufferAttribute(pos, i0).applyMatrix4(mat)
      b.fromBufferAttribute(pos, i1).applyMatrix4(mat)
      c.fromBufferAttribute(pos, i2).applyMatrix4(mat)
      faces++
      vset.add(ptKey(a)); vset.add(ptKey(b)); vset.add(ptKey(c))
      eset.add(edgeKey(a, b)); eset.add(edgeKey(b, c)); eset.add(edgeKey(c, a))
      area += 0.5 * b.clone().sub(a).cross(c.clone().sub(a)).length()
    }
  })
  return { faces, verts: vset.size, edges: eset.size, area }
}

// 欧拉公式校验：V - E + F（单个闭合多面体应为 2）
export function eulerInfo(stats) {
  const vef = (stats.verts || 0) - (stats.edges || 0) + (stats.faces || 0)
  return { vef, ok: Math.abs(vef - 2) < 0.001 }
}

// ---------- 点击交互：面 / 棱 信息提取 ----------
// 命中的三角形 + 共面相邻三角形合并 → 真实面（多边形）
export function faceInfoFromHit(mesh, triIndex) {
  const geo = mesh.geometry
  const pos = geo.attributes.position
  if (!pos) return null
  const idx = geo.index
  const read = i => {
    const p = new THREE.Vector3()
    p.fromBufferAttribute(pos, idx ? idx.getX(i) : i)
    return p.applyMatrix4(mesh.matrixWorld)
  }
  const nTri = idx ? Math.floor(idx.count / 3) : Math.floor(pos.count / 3)
  const triPts = t => {
    const b = t * 3
    return [read(b), read(b + 1), read(b + 2)]
  }
  const triNormal = t => {
    const [a, b, c] = triPts(t)
    return b.clone().sub(a).cross(c.clone().sub(a)).normalize()
  }
  const base = triNormal(triIndex)
  // BFS 合并共面相邻三角形（共享边 + 法向一致）
  const visited = new Set([triIndex])
  const queue = [triIndex]
  const edgeOwner = new Map()
  for (let t = 0; t < nTri; t++) {
    const [a, b, c] = triPts(t)
    for (const [x, y] of [[a, b], [b, c], [c, a]]) edgeOwner.set(edgeKey(x, y), (edgeOwner.get(edgeKey(x, y)) || []).concat(t))
  }
  const hasSharedEdge = (t1, t2) => {
    const [a, b, c] = triPts(t1)
    for (const [x, y] of [[a, b], [b, c], [c, a]]) {
      const owners = edgeOwner.get(edgeKey(x, y)) || []
      if (owners.includes(t2)) return true
    }
    return false
  }
  while (queue.length) {
    const t = queue.shift()
    const nrm = triNormal(t)
    if (nrm.dot(base) < 0.995) continue
    for (let t2 = 0; t2 < nTri; t2++) {
      if (visited.has(t2)) continue
      if (hasSharedEdge(t, t2)) {
        const n2 = triNormal(t2)
        if (n2.dot(base) > 0.995) { visited.add(t2); queue.push(t2) }
      }
    }
  }
  // 收集边界边（只被一个已访问三角形占用的边）→ 环
  const boundary = new Map()
  for (const t of visited) {
    const [a, b, c] = triPts(t)
    for (const [x, y] of [[a, b], [b, c], [c, a]]) {
      const k = edgeKey(x, y)
      boundary.set(k, (boundary.get(k) || 0) + 1)
    }
  }
  const segs = []
  for (const [k, cnt] of boundary) {
    if (cnt !== 1) continue
    const [p1, p2] = k.split('|').map(s => s.split(',').map(Number))
    segs.push([new THREE.Vector3(p1[0], p1[1], p1[2]), new THREE.Vector3(p2[0], p2[1], p2[2])])
  }
  const loops = weldSegments(segs)
  const loop = loops.length ? loops[0] : triPts(triIndex)
  // 面积 = 三角形面积和
  let area = 0
  for (const t of visited) {
    const [a, b, c] = triPts(t)
    area += 0.5 * b.clone().sub(a).cross(c.clone().sub(a)).length()
  }
  return { vertices: loop, count: loop.length, area, normal: base, mesh, triCount: visited.size }
}

// 棱线点击：命中 LineSegments → 最近的一对端点 → 长度
export function edgeInfoFromHit(lineMesh, point) {
  const geo = lineMesh.geometry
  const pos = geo.attributes.position
  if (!pos) return null
  let best = null, bestD = Infinity
  const p = new THREE.Vector3().copy(point)
  for (let i = 0; i + 1 < pos.count; i += 2) {
    const a = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(lineMesh.matrixWorld)
    const b = new THREE.Vector3().fromBufferAttribute(pos, i + 1).applyMatrix4(lineMesh.matrixWorld)
    const mid = a.clone().add(b).multiplyScalar(0.5)
    const d = mid.distanceTo(p)
    if (d < bestD) { bestD = d; best = { a, b, len: a.distanceTo(b) } }
  }
  return best
}
