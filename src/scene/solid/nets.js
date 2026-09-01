// ===== 展开图题库与折叠引擎（自 solidTrain.js 纯移动，未改动） =====
// 11 种经典立方体展开图（规范化坐标 + 相邻关系）+ 折痕折叠（OpenFold 思路）。
import * as THREE from 'three'
import { center } from './three.js'
import { normalizeCells } from './voxel.js'

// ---------- 展开图题库（经典 SVG 4 选 1） ----------
export const NETS = {
  cube: {
    right: [
      'M20,10 h60 v60 h-60 z M20,10 h60 v20 h-60 z M20,50 h60 v20 h-60 z',
      'M40,10 h20 v20 h20 v20 h-20 v20 h-20 v-20 h-20 v-20 h20 z'
    ],
    wrong: [
      'M20,10 h60 v60 h-60 z M20,10 v60 h20 z M80,10 v60 h20 z',
      'M20,10 h60 v20 h-60 z M40,30 h20 v60 h-20 z',
      'M20,10 h20 v20 h60 v20 h-20 z M40,50 h20 v20 h-20 z'
    ]
  },
  cuboid: {
    right: ['M30,10 h40 v20 h30 v20 h-30 v20 h-40 v-20 h-30 v-20 h30 z'],
    wrong: [
      'M30,10 h40 v20 h30 v20 h-30 v20 h-40 v-20 h-30 v-20 h30 v-20 h40 z',
      'M20,10 h60 v20 h-60 z M20,50 h60 v20 h-60 z M20,30 h20 v20 h-20 z',
      'M30,10 h40 v20 h30 v20 h-30 v20 h-40 v-20 h-30 v-20 h30 z M30,50 h40 v20 h-40 z'
    ]
  },
  cylinder: {
    right: ['M20,10 h60 v40 h-60 z M20,50 a30,30 0 0,0 60,0 z M20,50 h60 v20 h-60 z'],
    wrong: [
      'M20,10 h60 v40 h-60 z M20,50 a30,30 0 0,0 60,0 z M20,70 h60 v20 h-60 z',
      'M10,10 h80 v40 h-80 z M10,50 a40,40 0 0,0 80,0 z M10,50 h80 v20 h-80 z',
      'M20,10 h60 v40 h-60 z M50,50 a30,30 0 0,0 60,0 z'
    ]
  }
}

// ---------- 展开图折叠引擎（移植 OpenFold：折痕折叠 + 枢轴组动画） ----------
// 11 种经典立方体展开图（规范化坐标 + 相邻关系）
export const CUBE_NETS = [
  { n: '一字四连', cells: [[1,0],[0,1],[1,1],[2,1],[3,1],[1,2]], adjacency: [[0,2],[1,2],[2,3],[2,5],[3,4]] },
  { n: '斜上一', cells: [[2,0],[0,1],[1,1],[2,1],[3,1],[1,2]], adjacency: [[0,3],[1,2],[2,3],[2,5],[3,4]] },
  { n: '左上起', cells: [[0,0],[0,1],[1,1],[2,1],[3,1],[1,2]], adjacency: [[0,1],[1,2],[2,3],[2,5],[3,4]] },
  { n: '右上起', cells: [[3,0],[0,1],[1,1],[2,1],[3,1],[1,2]], adjacency: [[0,4],[1,2],[2,3],[2,5],[3,4]] },
  { n: '二四竖连', cells: [[2,0],[0,1],[1,1],[2,1],[1,2],[1,3]], adjacency: [[0,3],[1,2],[2,3],[2,4],[4,5]] },
  { n: '双顶横', cells: [[2,0],[3,0],[0,1],[1,1],[2,1],[1,2]], adjacency: [[0,1],[0,4],[2,3],[3,4],[3,5]] },
  { n: '一竖三横', cells: [[0,0],[1,0],[2,0],[1,1],[1,2],[1,3]], adjacency: [[0,1],[1,2],[1,3],[3,4],[4,5]] },
  { n: '两侧下挂', cells: [[3,0],[0,1],[1,1],[2,1],[3,1],[0,2]], adjacency: [[0,4],[1,2],[1,5],[2,3],[3,4]] },
  { n: '阶梯式', cells: [[0,0],[0,1],[1,1],[2,1],[2,2],[3,2]], adjacency: [[0,1],[1,2],[2,3],[3,4],[4,5]] },
  { n: '长阶梯', cells: [[0,0],[1,0],[2,0],[2,1],[3,1],[4,1]], adjacency: [[0,1],[1,2],[2,3],[3,4],[4,5]] },
  { n: '双L嵌套', cells: [[2,0],[3,0],[1,1],[2,1],[0,2],[1,2]], adjacency: [[0,1],[0,3],[2,3],[2,5],[4,5]] }
]

// 折痕折叠：BFS 由父面计算子面 90° 折叠后的朝向
export function computeFoldPlan(net) {
  const cells = net.cells, adjacency = net.adjacency
  const faceById = new Map(cells.map((c, i) => [i, c]))
  const adjList = new Map(cells.map((_, i) => [i, []]))
  for (const [a, b] of adjacency) {
    if (adjList.has(a) && adjList.has(b)) { adjList.get(a).push(b); adjList.get(b).push(a) }
  }
  const sorted = [...cells.keys()].sort((a, b) => cells[a][0] - cells[b][0] || cells[a][1] - cells[b][1])
  const root = sorted[0]
  const qById = new Map([[root, new THREE.Quaternion()]])
  const hinges = []
  const visited = new Set([root])
  const queue = [root]
  while (queue.length) {
    const cur = queue.shift()
    const curQ = qById.get(cur)
    const [cc, cr] = faceById.get(cur)
    for (const nb of adjList.get(cur) || []) {
      if (visited.has(nb)) continue
      visited.add(nb)
      const [nc, nr] = faceById.get(nb)
      const dc = nc - cc, dr = nr - cr
      let axis = new THREE.Vector3(0, 1, 0), angle = 0, pivot = [0, 0, 0], sign = 1, hAxis = 'y'
      if (dc === 1) { axis.set(0, 1, 0); angle = -Math.PI / 2; pivot = [cc + 1, 0, 0]; sign = -1; hAxis = 'y' }
      else if (dc === -1) { axis.set(0, 1, 0); angle = Math.PI / 2; pivot = [cc, 0, 0]; sign = 1; hAxis = 'y' }
      else if (dr === 1) { axis.set(1, 0, 0); angle = Math.PI / 2; pivot = [0, cr + 1, 0]; sign = 1; hAxis = 'x' }
      else if (dr === -1) { axis.set(1, 0, 0); angle = -Math.PI / 2; pivot = [0, cr, 0]; sign = -1; hAxis = 'x' }
      else continue
      const local = new THREE.Quaternion().setFromAxisAngle(axis, angle)
      qById.set(nb, curQ.clone().multiply(local))
      hinges.push({ child: nb, parent: cur, axis: hAxis, pivot, sign })
      queue.push(nb)
    }
  }
  const normals = []
  for (let i = 0; i < cells.length; i++) {
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(qById.get(i) || new THREE.Quaternion()).round()
    normals.push([n.x, n.y, n.z])
  }
  return { root, hinges, normals, connected: visited.size === cells.length }
}

export function validateCubeNet(cells, adjacency) {
  if (!cells.length) return { ok: false, reason: '还没有任何格子，请先画展开图' }
  if (cells.length !== 6) return { ok: false, reason: `立方体展开图必须恰好 6 个正方形面，当前是 ${cells.length} 个` }
  const plan = computeFoldPlan({ cells, adjacency })
  if (!plan.connected) return { ok: false, reason: '展开图不连通：有的面没有与其它面共用边' }
  const keys = plan.normals.map(n => n.join(',')).sort()
  const uniq = new Set(keys)
  if (uniq.size !== 6) return { ok: false, reason: '折叠后不能形成 6 个不同朝向的面，无法围成封闭立方体' }
  return { ok: true, plan }
}

// 用户网格（Set of "c,r"）→ 展开图数据
export function gridToNet(keys) {
  const cells = [...keys].map(k => k.split(',').map(Number))
  const idx = new Map(cells.map((c, i) => [c.join(','), i]))
  const adjacency = []
  for (let i = 0; i < cells.length; i++) {
    const [c, r] = cells[i]
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const j = idx.get(`${c + dc},${r + dr}`)
      if (j !== undefined && j > i) adjacency.push([i, j])
    }
  }
  return { cells, adjacency }
}

// 展开图 → SVG path（100×100 视口）
export function netSvgFromCells(cells, size = 100, pad = 8) {
  if (!cells.length) return { path: '', w: 0, h: 0 }
  const cs = normalizeCells(cells)
  const hs = cs.map(c => c[0]), vs = cs.map(c => c[1])
  const w = Math.max(...hs) + 1, h = Math.max(...vs) + 1
  const s = (size - pad * 2) / Math.max(w, h)
  const ox = (size - w * s) / 2, oy = (size - h * s) / 2
  let d = ''
  for (const [c, r] of cs) {
    const x = ox + c * s + 0.5, y = oy + r * s + 0.5, sz = s - 1
    d += `M${x.toFixed(2)},${y.toFixed(2)} h${sz.toFixed(2)} v${sz.toFixed(2)} h${(-sz).toFixed(2)} z `
  }
  return { path: d.trim(), w, h }
}

// 3D 折纸骨架：每个折痕一个“枢轴组”，旋转枢轴组即绕折痕折叠（OpenFold 思路）
export function buildFoldRig(cells, adjacency, color = 0x3b82f6, faceTextures = null) {
  const plan = computeFoldPlan({ cells, adjacency })
  const faceById = new Map(cells.map((c, i) => [i, c]))
  const root = new THREE.Group()
  const faceGroups = new Map()
  const hinges = []
  const mkMesh = faceId => {
    const g = new THREE.PlaneGeometry(0.96, 0.96)
    const tex = faceTextures && faceTextures[faceId]
    const m = tex
      ? new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })
      : new THREE.MeshPhongMaterial({ color, transparent: true, opacity: 0.94, side: THREE.DoubleSide })
    const mesh = new THREE.Mesh(g, m)
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: 0x9bd1ff })))
    return mesh
  }
  const origin = id => { const [c, r] = faceById.get(id); return [c + 0.5, r + 0.5, 0] }
  const rootFace = plan.root
  const [rx, ry] = origin(rootFace)
  root.position.set(rx, ry, 0)
  root.add(mkMesh(rootFace))
  faceGroups.set(rootFace, root)
  for (const h of plan.hinges) {
    const parent = faceGroups.get(h.parent)
    if (!parent) continue
    const [px, py] = origin(h.parent)
    const pivot = new THREE.Group()
    pivot.position.set(h.pivot[0] - px, h.pivot[1] - py, 0)
    parent.add(pivot)
    const child = new THREE.Group()
    const [cx, cy] = origin(h.child)
    child.position.set(cx - h.pivot[0], cy - h.pivot[1], 0)
    pivot.add(child)
    child.add(mkMesh(h.child))
    faceGroups.set(h.child, child)
    hinges.push({ pivot, axis: h.axis, sign: h.sign })
  }
  const group = new THREE.Group()
  group.add(root)
  center(group)
  group.scale.setScalar(1.15)
  return {
    root: group, hinges, normals: plan.normals, connected: plan.connected,
    dispose() {
      group.traverse(o => {
        if (o.geometry) o.geometry.dispose()
        if (o.material) o.material.dispose()
      })
    }
  }
}

// 折叠进度 [0,1] → 每个折痕枢轴组旋转角度
export function applyFoldProgress(rig, t) {
  if (!rig) return
  const p = Math.min(1, Math.max(0, t))
  for (const h of rig.hinges) {
    const angle = (h.sign * 90 * p * Math.PI) / 180
    if (h.axis === 'x') h.pivot.rotation.x = angle
    else h.pivot.rotation.y = angle
  }
}

// ---------- AI 出题 ----------
export function aiQuizPrompt(solid, extraDesc) {
  return (
    '你现在是公考立体图形推理命题老师。请围绕【' + solid.n + '】出一道图形推理选择题，要求：\n' +
    '1. 题型任选：三视图（正面/左面/俯视）、展开图、切面、补缺、空间重构；\n' +
    '2. 题干用文字清晰描述这个立体图形及其特征（' + solid.tip + '）；\n' +
    (extraDesc ? '3. 该立体是用户自定义拼搭的立体，具体结构如下：' + extraDesc + '\n' : '') +
    '3. 给出 4 个选项（A/B/C/D），其中 1 个正确、3 个典型干扰；\n' +
    '4. 选项区结束后单独一行输出【正确答案】X（X 只能是 A/B/C/D 之一）。\n\n' +
    '输出格式：\n### 📝 题目\n（题干）\nA. … B. … C. … D. …\n【正确答案】X\n### ✅ 答案解析\n（为什么对/为什么错）\n### 🎯 考点\n### ⚡ 秒杀规律\n（一句话）'
  )
}

// ---------- 展开图网格布局（用于涂色画布）：返回 {cells, cols, rows, cellW, cellH} ----------
export function netLayout(cells) {
  const cs = normalizeCells(cells)
  const hs = cs.map(c => c[0]), vs = cs.map(c => c[1])
  const cols = Math.max(...hs) + 1, rows = Math.max(...vs) + 1
  return { cells: cs, cols, rows }
}

// 命中展开图画布 → 面索引
export function netFaceAt(cells, px, py, size) {
  const { cells: cs, cols, rows } = netLayout(cells)
  const s = Math.min(size / Math.max(cols, rows), 90)
  const ox = (size - cols * s) / 2, oy = (size - rows * s) / 2
  for (let i = 0; i < cs.length; i++) {
    const [c, r] = cs[i]
    const x = ox + c * s, y = oy + r * s
    if (px >= x && px <= x + s && py >= y && py <= y + s) return { idx: i, x, y, s }
  }
  return null
}

// 展开图 → 画布 SVG/路径（涂色编辑器里显示面序号底色）
export function netFacesSvg(cells) {
  const { cells: cs, cols, rows } = netLayout(cells)
  const size = 100
  const s = Math.min(size / Math.max(cols, rows), 92)
  const ox = (size - cols * s) / 2, oy = (size - rows * s) / 2
  const faces = cs.map(([c, r]) => ({
    x: ox + c * s, y: oy + r * s, w: s, h: s
  }))
  return { faces, size }
}
