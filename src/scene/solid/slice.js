// ===== 自由切割引擎（"切面刀"）：任意横/斜切面实时计算真实截面（自 solidTrain.js 纯移动，未改动） =====
// 思路：平面与网格三角形求交 → 收集交线段 → 焊接成闭合环路（支持多块非凸截面）
import * as THREE from 'three'
import { keyPt, weldSegments, shuffle } from './three.js'
import { buildPolycube } from './voxel.js'

export const DIR_PRESETS = [
  { k: 'h', n: '水平', normal: [0, 1, 0], tip: '平行底面' },
  { k: 'vx', n: '竖直·左右', normal: [1, 0, 0], tip: '平行左右侧面' },
  { k: 'vz', n: '竖直·前后', normal: [0, 0, 1], tip: '平行前后侧面' },
  { k: 'diag', n: '对角45°', normal: [1, 0, 1], tip: '沿对角面' },
  { k: 'diag2', n: '对角-45°', normal: [1, 0, -1], tip: '另一对角面' },
  { k: 'tilt', n: '斜切45°', normal: [0, 1, 1], tip: '倾斜45度' }
]

export function planeFromNormalDist(normal, dist) {
  const n = normal.clone().normalize()
  return new THREE.Plane(n, -dist)
}

// 沿法向投影包围盒 → 位置滑杆范围
export function projBounds(group, normal) {
  const bb = new THREE.Box3().setFromObject(group)
  const n = normal.clone().normalize()
  const { min, max } = bb
  const corners = []
  for (let i = 0; i < 8; i++) {
    corners.push(new THREE.Vector3(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z))
  }
  const ds = corners.map(c => c.dot(n))
  return { min: Math.min(...ds), max: Math.max(...ds) }
}

// 平面切割组内所有 Mesh：返回闭合环路数组（每个环路为 Vector3 数组）
export function sliceGroupByPlane(group, normal, dist) {
  const plane = planeFromNormalDist(normal, dist)
  const segments = []
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3()
  group.updateMatrixWorld(true)
  group.traverse(o => {
    if (!o.isMesh || !o.geometry) return
    const geo = o.geometry
    const pos = geo.attributes.position
    if (!pos) return
    const idx = geo.index
    const mat = o.matrixWorld
    const triCount = idx ? Math.floor(idx.count / 3) : Math.floor(pos.count / 3)
    for (let t = 0; t < triCount; t++) {
      const i0 = idx ? idx.getX(t * 3) : t * 3
      const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1
      const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2
      tmpA.fromBufferAttribute(pos, i0).applyMatrix4(mat)
      tmpB.fromBufferAttribute(pos, i1).applyMatrix4(mat)
      tmpC.fromBufferAttribute(pos, i2).applyMatrix4(mat)
      const da = plane.distanceToPoint(tmpA)
      const db = plane.distanceToPoint(tmpB)
      const dc = plane.distanceToPoint(tmpC)
      const eps = 1e-6
      // 三点都严格在平面同一侧（都不贴面）→ 无截面
      if ((da > eps && db > eps && dc > eps) || (da < -eps && db < -eps && dc < -eps)) continue
      const verts = [tmpA, tmpB, tmpC]
      const ds = [da, db, dc]
      const pts = []
      for (let e = 0; e < 3; e++) {
        const p1 = verts[e], p2 = verts[(e + 1) % 3]
        const d1 = ds[e], d2 = ds[(e + 1) % 3]
        const o1 = Math.abs(d1) <= eps, o2 = Math.abs(d2) <= eps
        if (o1 && o2) { pts.push(p1.clone()); pts.push(p2.clone()) }
        else if (d1 * d2 < -1e-12) {
          const tt = d1 / (d1 - d2)
          pts.push(p1.clone().lerp(p2, Math.min(1, Math.max(0, tt))))
        } else if (o1) { pts.push(p1.clone()) }
        else if (o2) { pts.push(p2.clone()) }
      }
      const uniq = []
      for (const p of pts) {
        if (!uniq.some(q => q.distanceTo(p) < 1e-5)) uniq.push(p)
      }
      if (uniq.length === 2) segments.push([uniq[0], uniq[1]])
    }
  })
  // 全局去重线段（相邻共面的边会重复出现）
  const segKey = seg => {
    const k1 = keyPt(seg[0]), k2 = keyPt(seg[1])
    return k1 < k2 ? k1 + '|' + k2 : k2 + '|' + k1
  }
  const seen = new Set()
  const uniqueSegs = []
  for (const seg of segments) {
    const k = segKey(seg)
    if (seen.has(k)) continue
    seen.add(k)
    uniqueSegs.push(seg)
  }
  return weldSegments(uniqueSegs)
}

function planeBasis(normal) {
  const n = normal.clone().normalize()
  const ref = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
  const u = new THREE.Vector3().crossVectors(n, ref).normalize()
  const v = new THREE.Vector3().crossVectors(n, u).normalize()
  return { u, v, n }
}

// 截面环路 → 2D SVG path（平面内等距投影，形状保真）
export function loopsToSvg(loops, normal) {
  const { u, v } = planeBasis(normal)
  const pts2 = []
  for (const loop of loops) for (const p of loop) pts2.push({ x: p.dot(u), y: p.dot(v) })
  if (!pts2.length) return { path: '', w: 0, h: 0 }
  const xs = pts2.map(p => p.x), ys = pts2.map(p => p.y)
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys)
  if (w < 1e-6 && h < 1e-6) return { path: '', w: 0, h: 0 }
  const s = Math.min(92 / Math.max(w, 1e-6), 92 / Math.max(h, 1e-6))
  const ox = (100 - w * s) / 2, oy = (100 - h * s) / 2
  let d = ''
  for (const loop of loops) {
    if (loop.length < 3) continue
    const pts = loop.map(p => ({ x: p.dot(u), y: p.dot(v) }))
    d += `M${(ox + pts[0].x * s).toFixed(2)},${(oy + pts[0].y * s).toFixed(2)} `
    for (let i = 1; i < pts.length; i++) d += `L${(ox + pts[i].x * s).toFixed(2)},${(oy + pts[i].y * s).toFixed(2)} `
    d += 'Z '
  }
  return { path: d.trim(), w, h }
}

export function sliceShapeLabel(loops) {
  if (!loops.length) return '未切到实体'
  if (loops.length > 1) return loops.length + ' 个独立图形'
  const l = loops[0]
  const n = l.length
  if (n >= 12) {
    const c = new THREE.Vector3()
    for (const p of l) c.add(p)
    c.divideScalar(n)
    const rs = l.map(p => p.distanceTo(c))
    const avg = rs.reduce((s, r) => s + r, 0) / n
    const dev = Math.max(...rs) - Math.min(...rs)
    if (avg > 1e-6 && dev / avg < 0.12) return '圆'
    return '椭圆'
  }
  const names = { 3: '三角形', 4: '四边形', 5: '五边形', 6: '六边形', 7: '七边形', 8: '八边形', 9: '九边形', 10: '十边形', 11: '十一边形' }
  return names[n] || (n + ' 边形')
}

export function describeSlice(loops, normal, dist) {
  const n = normal.clone().normalize()
  const head = `沿法向(${n.x.toFixed(2)},${n.y.toFixed(2)},${n.z.toFixed(2)})、距中心 ${dist.toFixed(2)} 的位置切割`
  if (!loops.length) return head + '：切面为空（平面未穿过实体）'
  if (loops.length === 1) return head + `：切面是 1 个 ${loops[0].length} 边形（${loops[0].length} 个顶点）`
  return head + `：切面由 ${loops.length} 个独立多边形组成（共 ${loops.reduce((s, l) => s + l.length, 0)} 个顶点）`
}

// 3D 切割平面可视化（半透明面 + 边框）
export function buildCutPlaneMesh(normal, dist, size = 2.8, color = 0xff9f43) {
  const { u, v, n } = planeBasis(normal)
  const g = new THREE.Group()
  const geo = new THREE.PlaneGeometry(size, size)
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false }))
  mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.65 })))
  g.add(mesh)
  g.position.copy(n.clone().multiplyScalar(dist))
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, n))
  return g
}

// 切面填充面（剖开后的截面盖板，支持多块）
export function buildSliceFill(loops, normal, color = 0xff9f43) {
  const g = new THREE.Group()
  if (!loops.length) return g
  const { u, v, n } = planeBasis(normal)
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, n))
  for (const loop of loops) {
    if (loop.length < 3) continue
    const pts = loop.map(p => new THREE.Vector2(p.dot(u), p.dot(v)))
    const shp = new THREE.Shape()
    shp.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) shp.lineTo(pts[i].x, pts[i].y)
    shp.closePath()
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shp), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.92, depthWrite: false }))
    mesh.quaternion.copy(q)
    mesh.position.copy(n.clone().multiplyScalar(0.002))
    g.add(mesh)
  }
  return g
}

// 剖开：给组内所有材质加/减裁剪平面
export function applyClipping(group, plane) {
  if (!group) return
  const planes = plane ? [plane] : null
  group.traverse(o => {
    if (!o.material) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    for (const m of mats) {
      m.clippingPlanes = planes
      m.clipShadows = true
      m.needsUpdate = true
    }
  })
}

// 从当前立体生成切面干扰项池（同体其他方位/位置 + 基础图形切面）
export function sliceSvgPool(group, normal, _dist) {
  const pool = []
  const push = svg => { if (svg && !pool.includes(svg)) pool.push(svg) }
  const dirs = [normal, ...DIR_PRESETS.map(d => new THREE.Vector3(...d.normal))]
  for (let di = 0; di < dirs.length; di++) {
    const n = dirs[di].clone().normalize()
    const pb = projBounds(group, n)
    for (const f of [0.25, 0.5, 0.75]) {
      const d = pb.min + (pb.max - pb.min) * f
      const loops = sliceGroupByPlane(group, n, d)
      push(loopsToSvg(loops, n).path)
    }
  }
  // 其他基础立体的典型切面
  const prims = [
    [[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]], // 立方
    [[0,0,0],[1,0,0],[2,0,0],[0,0,1],[1,0,1],[2,0,1]],                 // 长方体
    [[0,0,0],[1,0,0],[0,1,0],[0,0,1]]                                   // 三棱锥
  ]
  for (const cells of prims) {
    const g = buildPolycube(cells, 0x22d3ee)
    for (const dn of [[0,1,0],[1,0,0],[0,0,1]]) {
      const n = new THREE.Vector3(...dn)
      const pb = projBounds(g, n)
      const loops = sliceGroupByPlane(g, n, pb.min + (pb.max - pb.min) * 0.5)
      push(loopsToSvg(loops, n).path)
    }
  }
  return pool
}

// 切面出题：正确 = 当前切面，干扰 = 池中随机 3 个
export function sliceQuiz(group, normal, dist) {
  const loops = sliceGroupByPlane(group, normal, dist)
  const correct = loopsToSvg(loops, normal).path
  const pool = sliceSvgPool(group, normal, dist).filter(p => p !== correct)
  const opts = [{ k: 'A', svg: correct, isAns: true }]
  for (const p of shuffle(pool).slice(0, 3)) {
    opts.push({ k: String.fromCharCode(65 + opts.length), svg: p, isAns: false })
  }
  return { opts: shuffle(opts), answer: correct, label: sliceShapeLabel(loops), loops: loops.length }
}

// 稳健切片：若切割平面恰好贴着网格面（如体素整数高度）导致空结果，则微偏移重试
export function robustSlice(group, normal, dist, range) {
  let loops = sliceGroupByPlane(group, normal, dist)
  if (!loops.length && range && range.max - range.min > 1e-4) {
    const eps = (range.max - range.min) * 0.002
    if (dist - eps >= range.min) loops = sliceGroupByPlane(group, normal, dist - eps)
    if (!loops.length && dist + eps <= range.max) loops = sliceGroupByPlane(group, normal, dist + eps)
  }
  return loops
}

// ---------- 体素解析切片（逻辑实体无间隙，精确截面） ----------
export function cellProjBounds(cells, normal) {
  const n = normal.clone().normalize()
  const pts = []
  for (const [x, y, z] of cells) {
    for (let i = 0; i < 8; i++) {
      pts.push(new THREE.Vector3(x + (i & 1 ? 1 : 0), y + (i & 2 ? 1 : 0), z + (i & 4 ? 1 : 0)).dot(n))
    }
  }
  return { min: Math.min(...pts), max: Math.max(...pts) }
}

// 逻辑小正方体集合 → 平面截面环路（以逻辑包围盒中心对齐 3D 显示）
export function sliceSolidCells(cells, normal, dist) {
  if (!cells.length) return []
  const n = normal.clone().normalize()
  const plane = new THREE.Plane(n, -dist)
  const EDGES = [[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]]
  const segments = []
  for (const [x, y, z] of cells) {
    const corners = []
    for (let i = 0; i < 8; i++) corners.push(new THREE.Vector3(x + (i & 1 ? 1 : 0), y + (i & 2 ? 1 : 0), z + (i & 4 ? 1 : 0)))
    const pts = []
    for (const [a, b] of EDGES) {
      const p1 = corners[a], p2 = corners[b]
      const d1 = plane.distanceToPoint(p1), d2 = plane.distanceToPoint(p2)
      const o1 = Math.abs(d1) <= 1e-6, o2 = Math.abs(d2) <= 1e-6
      if (o1 && o2) { pts.push(p1.clone()); pts.push(p2.clone()) }
      else if (d1 * d2 < -1e-12) pts.push(p1.clone().lerp(p2, Math.min(1, Math.max(0, d1 / (d1 - d2)))))
      else if (o1) pts.push(p1.clone())
      else if (o2) pts.push(p2.clone())
    }
    const uniq = []
    for (const p of pts) if (!uniq.some(q => q.distanceTo(p) < 1e-5)) uniq.push(p)
    if (uniq.length >= 3) {
      // 按平面内角度排序，形成正确的凸截面多边形
      const ref = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
      const u = new THREE.Vector3().crossVectors(n, ref).normalize()
      const v = new THREE.Vector3().crossVectors(n, u).normalize()
      const c = new THREE.Vector3()
      for (const p of uniq) c.add(p)
      c.divideScalar(uniq.length)
      const ordered = uniq.map(p => ({ p, a: Math.atan2(p.dot(v) - c.dot(v), p.dot(u) - c.dot(u)) })).sort((a, b) => a.a - b.a)
      for (let i = 0; i < ordered.length; i++) segments.push([ordered[i].p, ordered[(i + 1) % ordered.length].p])
    }
  }
  // 边界提取：相邻小正方体共面的截面边会出现两次，属于内部边，整条移除；
  // 只保留出现 1 次的边（实体融合后的真实截面轮廓）
  const countMap = new Map()
  for (const seg of segments) {
    const k1 = keyPt(seg[0]), k2 = keyPt(seg[1])
    const k = k1 < k2 ? k1 + '|' + k2 : k2 + '|' + k1
    countMap.set(k, (countMap.get(k) || 0) + 1)
  }
  const uniqueSegs = segments.filter(seg => {
    const k1 = keyPt(seg[0]), k2 = keyPt(seg[1])
    const k = k1 < k2 ? k1 + '|' + k2 : k2 + '|' + k1
    return countMap.get(k) === 1
  })
  const loops = weldSegments(uniqueSegs)
  // 按逻辑包围盒中心对齐 3D 显示坐标
  const xs = cells.map(c => c[0]), ys = cells.map(c => c[1]), zs = cells.map(c => c[2])
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2 + 0.5
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2 + 0.5
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2 + 0.5
  return loops.map(loop => loop.map(p => p.sub(new THREE.Vector3(cx, cy, cz))))
}

// 统一入口：cells 存在用体素解析切片，否则用网格三角形切片
export function sliceAll(cells, group, normal, dist) {
  return cells && cells.length ? sliceSolidCells(cells, normal, dist) : sliceGroupByPlane(group, normal, dist)
}
export function boundsAll(cells, group, normal) {
  return cells && cells.length ? cellProjBounds(cells, normal) : projBounds(group, normal)
}

// 稳健统一切片：平面恰好贴面/贴边时微偏移重试（如体素整层分界高度）
export function sliceAllRobust(cells, group, normal, dist) {
  let loops = sliceAll(cells, group, normal, dist)
  if (!loops.length) {
    const pb = boundsAll(cells, group, normal)
    const span = pb.max - pb.min
    if (span > 1e-4) {
      const eps = span * 0.01
      if (dist - eps >= pb.min) loops = sliceAll(cells, group, normal, dist - eps)
      if (!loops.length && dist + eps <= pb.max) loops = sliceAll(cells, group, normal, dist + eps)
    }
  }
  return loops
}

// 统一切片干扰项池 + 出题
export function sliceQuizAll(cells, group, normal, dist) {
  const loops = sliceAllRobust(cells, group, normal, dist)
  const correct = loopsToSvg(loops, normal).path
  const pool = []
  const push = svg => { if (svg && !pool.includes(svg)) pool.push(svg) }
  const dirs = [normal, ...DIR_PRESETS.map(d => new THREE.Vector3(...d.normal))]
  for (const dn of dirs) {
    const n = dn.clone().normalize()
    const pb = boundsAll(cells, group, n)
    for (const f of [0.25, 0.5, 0.75]) {
      const d = pb.min + (pb.max - pb.min) * f
      const lps = sliceAllRobust(cells, group, n, d)
      const svg = loopsToSvg(lps, n).path
      if (svg && svg !== correct) push(svg)
    }
  }
  const opts = [{ k: 'A', svg: correct, isAns: true }]
  for (const p of shuffle(pool).slice(0, 3)) opts.push({ k: String.fromCharCode(65 + opts.length), svg: p, isAns: false })
  return { opts: shuffle(opts), answer: correct, label: sliceShapeLabel(loops), loopCount: loops.length }
}
