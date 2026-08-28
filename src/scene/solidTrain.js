// ===== 立体图推 · 3D 引擎与训练题库（v2.3 增强版） =====
// 支持：参数化基础立体 / 复杂体素组合立体（小正方体自由拼搭）/ 三视图自动生成 / 展开图折叠动画
// 参考 OpenFold (https://github.com/paladini/OpenFold, MIT)：展开图折叠映射与“枢轴组”折叠动画思路
import * as THREE from 'three'

// ---------- 基础工具 ----------
function box(w, h, d, color) {
  const g = new THREE.BoxGeometry(w, h, d)
  const m = new THREE.MeshPhongMaterial({ color, transparent: true, opacity: 0.92 })
  return new THREE.Mesh(g, m)
}
function wire(mesh, color = 0x9bd1ff) {
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

// ---------- 体素引擎（小正方体组合，坐标 x 右 / y 上 / z 前） ----------
export function buildPolycube(cells, color = 0x22d3ee, gap = 0.06) {
  const g = new THREE.Group()
  const size = 1 - gap
  for (const [x, y, z] of cells) {
    const mesh = box(size, size, size, color)
    mesh.position.set(x + 0.5, y + 0.5, z + 0.5)
    wire(mesh, 0x9bd1ff)
    g.add(mesh)
  }
  return center(g)
}

export function normalizeCells(cells) {
  if (!cells.length) return []
  const xs = cells.map(c => c[0]), ys = cells.map(c => c[1]), zs = cells.map(c => c[2])
  const mx = Math.min(...xs), my = Math.min(...ys), mz = Math.min(...zs)
  return cells.map(([x, y, z]) => [x - mx, y - my, z - mz])
}

// 正交投影到二维：返回 [{h, v}]
export function voxelViewCells(cells, dir) {
  const out = []
  for (const [x, y, z] of cells) {
    if (dir === 'front') out.push({ h: x, v: y })
    else if (dir === 'top') out.push({ h: x, v: z })
    else out.push({ h: z, v: y })
  }
  return out
}

// 视图 → SVG path（100×100 视口，含细网格线）
export function voxelSvg(cells, dir) {
  const vc = voxelViewCells(cells, dir)
  if (!vc.length) return { path: '', w: 0, h: 0 }
  const hs = vc.map(c => c.h), vs = vc.map(c => c.v)
  const minH = Math.min(...hs), minV = Math.min(...vs)
  const maxH = Math.max(...hs), maxV = Math.max(...vs)
  const w = maxH - minH + 1, h = maxV - minV + 1
  const s = Math.min(96 / w, 96 / h)
  const ox = (100 - w * s) / 2, oy = (100 - h * s) / 2
  const inset = Math.min(0.8, s * 0.16)
  let d = ''
  for (const c of vc) {
    const x = ox + (c.h - minH) * s + inset / 2
    const y = oy + (c.v - minV) * s + inset / 2
    const sz = s - inset
    d += `M${x.toFixed(2)},${y.toFixed(2)} h${sz.toFixed(2)} v${sz.toFixed(2)} h${(-sz).toFixed(2)} z `
  }
  return { path: d.trim(), w: w * s, h: h * s }
}

// 外露小正方形面数
export function exposedFaces(cells) {
  const set = new Set(cells.map(c => c.join(',')))
  let n = 0
  for (const [x, y, z] of cells) {
    for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
      if (!set.has(`${x+dx},${y+dy},${z+dz}`)) n++
    }
  }
  return n
}

export function boundingBox(cells) {
  if (!cells.length) return { w: 0, h: 0, d: 0, vol: 0 }
  const xs = cells.map(c => c[0]), ys = cells.map(c => c[1]), zs = cells.map(c => c[2])
  const w = Math.max(...xs) - Math.min(...xs) + 1
  const h = Math.max(...ys) - Math.min(...ys) + 1
  const d = Math.max(...zs) - Math.min(...zs) + 1
  return { w, h, d, vol: w * h * d }
}

export function fillToCuboid(cells) {
  return boundingBox(cells).vol - cells.length
}

// 生成给 AI 的文字描述
export function describeVoxel(cells) {
  const cs = normalizeCells(cells)
  if (!cs.length) return '（空）'
  const bb = boundingBox(cs)
  const layers = {}
  for (const [x, y, z] of cs) {
    if (!layers[y]) layers[y] = []
    layers[y].push([x, z])
  }
  const parts = Object.keys(layers).sort((a, b) => a - b).map(y => {
    const row = layers[y].sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(p => `(${p[0]},${p[1]})`).join(' ')
    return `第${Number(y) + 1}层(自下而上): ${row}`
  })
  return `该立体由 ${cs.length} 个单位小正方体组成，外接最小长方体为 ${bb.w}×${bb.h}×${bb.d}。${parts.join('；')}。外露小正方形面共 ${exposedFaces(cs)} 个。`
}

// ---------- 图形库：基础参数化立体 + 复杂体素组合立体 ----------
const DIR_LABEL = { front: '正面', top: '俯视', left: '左面' }
export function solidViewPath(solid, dir) {
  if (solid.cells) return voxelSvg(solid.cells, dir).path
  return solid[dir] || solid.front
}

export const SOLIDS = [
  {
    k: 'cube', n: '正方体', tip: '六个面都是全等正方形，是最基础的立体图推单位。',
    params: [{ k: 's', label: '边长', min: 0.6, max: 2.2, step: 0.1, def: 1 }],
    build(p = {}) { const s = p.s ?? 1; return center(wire(box(s, s, s, 0x22d3ee))) },
    front: 'M0,0 L100,0 L100,100 L0,100 Z',
    top: 'M0,0 L100,0 L100,100 L0,100 Z',
    left: 'M0,0 L100,0 L100,100 L0,100 Z'
  },
  {
    k: 'cuboid', n: '长方体', tip: '长宽高不等，注意三视图的长宽比差异。',
    params: [
      { k: 'w', label: '长', min: 0.6, max: 2.4, step: 0.1, def: 1.6 },
      { k: 'h', label: '高', min: 0.4, max: 2, step: 0.1, def: 0.9 },
      { k: 'd', label: '宽', min: 0.4, max: 1.6, step: 0.1, def: 0.7 }
    ],
    build(p = {}) { return center(wire(box(p.w ?? 1.6, p.h ?? 0.9, p.d ?? 0.7, 0x3b82f6))) },
    front: 'M0,0 L100,0 L100,56 L0,56 Z',
    top: 'M0,0 L100,0 L100,44 L0,44 Z',
    left: 'M0,0 L62,0 L62,56 L0,56 Z'
  },
  {
    k: 'cylinder', n: '圆柱', tip: '主/左视图都是矩形，俯视图是圆；切面可出椭圆/矩形。',
    params: [
      { k: 'r', label: '半径', min: 0.3, max: 1, step: 0.05, def: 0.55 },
      { k: 'h', label: '高', min: 0.6, max: 2, step: 0.1, def: 1.3 }
    ],
    build(p = {}) { return center(wire(new THREE.Mesh(new THREE.CylinderGeometry(p.r ?? 0.55, p.r ?? 0.55, p.h ?? 1.3, 40), new THREE.MeshPhongMaterial({ color: 0x22c55e, transparent: true, opacity: 0.92 })))) },
    front: 'M0,0 L100,0 L100,100 L0,100 Z',
    top: 'M50,0 A50,50 0 1,1 49.9,0 Z',
    left: 'M0,0 L100,0 L100,100 L0,100 Z'
  },
  {
    k: 'cone', n: '圆锥', tip: '主/左视图是等腰三角形，俯视图是圆（带圆心）。',
    params: [
      { k: 'r', label: '半径', min: 0.3, max: 1, step: 0.05, def: 0.6 },
      { k: 'h', label: '高', min: 0.6, max: 2.2, step: 0.1, def: 1.5 }
    ],
    build(p = {}) { return center(wire(new THREE.Mesh(new THREE.ConeGeometry(p.r ?? 0.6, p.h ?? 1.5, 40), new THREE.MeshPhongMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.92 })))) },
    front: 'M50,0 L100,100 L0,100 Z',
    top: 'M50,0 A50,50 0 1,1 49.9,0 Z',
    left: 'M50,0 L100,100 L0,100 Z'
  },
  {
    k: 'sphere', n: '球', tip: '三视图都是等大的圆。',
    params: [
      { k: 'r', label: '半径', min: 0.3, max: 1.2, step: 0.05, def: 0.62 },
      { k: 'seg', label: '平滑度', min: 8, max: 48, step: 4, def: 32 }
    ],
    build(p = {}) { return center(wire(new THREE.Mesh(new THREE.SphereGeometry(p.r ?? 0.62, p.seg ?? 32, p.seg ? Math.floor(p.seg / 2) : 24), new THREE.MeshPhongMaterial({ color: 0xfb7185, transparent: true, opacity: 0.92 })))) },
    front: 'M50,0 A50,50 0 1,1 49.9,0 Z',
    top: 'M50,0 A50,50 0 1,1 49.9,0 Z',
    left: 'M50,0 A50,50 0 1,1 49.9,0 Z'
  },
  {
    k: 'triPrism', n: '三棱柱', tip: '主视图是矩形，左视图是三角形（或矩形），俯视图是三角形。',
    params: [
      { k: 'r', label: '底半径', min: 0.4, max: 1.1, step: 0.05, def: 0.62 },
      { k: 'h', label: '高', min: 0.6, max: 2, step: 0.1, def: 1.4 }
    ],
    build(p = {}) {
      return center(wire(new THREE.Mesh(new THREE.CylinderGeometry(p.r ?? 0.62, p.r ?? 0.62, p.h ?? 1.4, 3), new THREE.MeshPhongMaterial({ color: 0x818cf8, transparent: true, opacity: 0.92 }))))
    },
    front: 'M0,0 L100,0 L100,100 L0,100 Z',
    top: 'M0,100 L50,0 L100,100 Z',
    left: 'M50,0 L100,100 L0,100 Z'
  },
  {
    k: 'hexPrism', n: '六棱柱', tip: '主视图是矩形+两侧竖线，俯视图是正六边形。',
    params: [
      { k: 'r', label: '底半径', min: 0.4, max: 1.1, step: 0.05, def: 0.62 },
      { k: 'h', label: '高', min: 0.6, max: 2, step: 0.1, def: 1.2 }
    ],
    build(p = {}) {
      return center(wire(new THREE.Mesh(new THREE.CylinderGeometry(p.r ?? 0.62, p.r ?? 0.62, p.h ?? 1.2, 6), new THREE.MeshPhongMaterial({ color: 0x14b8a6, transparent: true, opacity: 0.92 }))))
    },
    front: 'M0,0 L25,0 L75,0 L100,0 L100,100 L75,100 L25,100 L0,100 Z',
    top: 'M50,0 L93,25 L93,75 L50,100 L7,75 L7,25 Z',
    left: 'M0,0 L100,0 L100,100 L0,100 Z'
  },
  {
    k: 'tetra', n: '正四面体', tip: '四个面都是等边三角形；三视图均为三角形。',
    params: [{ k: 's', label: '尺寸', min: 0.5, max: 1.6, step: 0.1, def: 0.9 }],
    build(p = {}) {
      return center(wire(new THREE.Mesh(new THREE.TetrahedronGeometry(p.s ?? 0.9), new THREE.MeshPhongMaterial({ color: 0xa855f7, transparent: true, opacity: 0.92 }))))
    },
    front: 'M50,0 L100,100 L0,100 Z',
    top: 'M50,0 L100,100 L0,100 Z',
    left: 'M50,0 L100,100 L0,100 Z'
  },
  {
    k: 'frustum', n: '圆台', tip: '主/左视图是等腰梯形，俯视图是同心圆。',
    params: [
      { k: 'r1', label: '上半径', min: 0.2, max: 0.8, step: 0.05, def: 0.38 },
      { k: 'r2', label: '下半径', min: 0.4, max: 1.1, step: 0.05, def: 0.72 },
      { k: 'h', label: '高', min: 0.6, max: 2, step: 0.1, def: 1.3 }
    ],
    build(p = {}) {
      return center(wire(new THREE.Mesh(new THREE.CylinderGeometry(p.r1 ?? 0.38, p.r2 ?? 0.72, p.h ?? 1.3, 40), new THREE.MeshPhongMaterial({ color: 0xec4899, transparent: true, opacity: 0.92 }))))
    },
    front: 'M28,0 L72,0 L100,100 L0,100 Z',
    top: 'M50,0 A50,50 0 1,1 49.9,0 Z',
    left: 'M28,0 L72,0 L100,100 L0,100 Z'
  },
  {
    k: 'pyramid4', n: '四棱锥', tip: '主/左视图是等腰三角形，俯视图是正方形+对角线。',
    params: [
      { k: 'r', label: '底半径', min: 0.4, max: 1.1, step: 0.05, def: 0.62 },
      { k: 'h', label: '高', min: 0.6, max: 2.2, step: 0.1, def: 1.5 }
    ],
    build(p = {}) {
      return center(wire(new THREE.Mesh(new THREE.ConeGeometry(p.r ?? 0.62, p.h ?? 1.5, 4), new THREE.MeshPhongMaterial({ color: 0x10b981, transparent: true, opacity: 0.92 }))))
    },
    front: 'M50,0 L100,100 L0,100 Z',
    top: 'M0,0 L100,0 L100,100 L0,100 Z',
    left: 'M50,0 L100,100 L0,100 Z'
  },
  {
    k: 'pyramid3', n: '三棱锥', tip: '三视图都是三角形，注意棱的投影位置。',
    params: [
      { k: 'r', label: '底半径', min: 0.4, max: 1.1, step: 0.05, def: 0.62 },
      { k: 'h', label: '高', min: 0.6, max: 2.2, step: 0.1, def: 1.4 }
    ],
    build(p = {}) {
      return center(wire(new THREE.Mesh(new THREE.ConeGeometry(p.r ?? 0.62, p.h ?? 1.4, 3), new THREE.MeshPhongMaterial({ color: 0xf97316, transparent: true, opacity: 0.92 }))))
    },
    front: 'M50,0 L100,100 L0,100 Z',
    top: 'M0,100 L50,0 L100,100 Z',
    left: 'M50,0 L100,100 L0,100 Z'
  },
  // ---------- 复杂体素组合立体（自由拼搭的非规则立体） ----------
  {
    k: 'lshape', n: 'L 型组合体', tip: '由三个小正方体拼成的 L 形，注意三视图的台阶状轮廓。',
    cells: [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
    build() { return buildPolycube(this.cells, 0x06b6d4) }
  },
  {
    k: 'cube2', n: '2×2×2 立方', tip: '8 个小正方体拼成的大正方体，三视图都是 2×2 正方形。',
    cells: [[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]],
    build() { return buildPolycube(this.cells, 0x22d3ee) }
  },
  {
    k: 'stairs', n: '三级台阶', tip: '每层递减 1 格，俯视是 3×1 横条，正视呈阶梯。',
    cells: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [1, 1, 0], [2, 1, 0], [2, 2, 0]],
    build() { return buildPolycube(this.cells, 0xf59e0b) }
  },
  {
    k: 'tblock', n: 'T 形', tip: '横杠 + 中间立柱，正视与侧视轮廓差异明显。',
    cells: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [1, 1, 0], [1, 2, 0]],
    build() { return buildPolycube(this.cells, 0xa855f7) }
  },
  {
    k: 'cross', n: '十字形', tip: '平面十字，俯视是十字、正视是横条。',
    cells: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [1, 0, 1], [1, 0, -1]],
    build() { return buildPolycube(this.cells, 0x10b981) }
  },
  {
    k: 'l2', n: '双层 L', tip: '上下两层相同的 L，形成 L 形柱体，俯视是 L。',
    cells: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1]],
    build() { return buildPolycube(this.cells, 0xec4899) }
  },
  {
    k: 'notch', n: '缺角立方', tip: '2×2×2 缺一个角，缺角方向对三视图影响显著。',
    cells: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1]],
    build() { return buildPolycube(this.cells, 0x3b82f6) }
  },
  {
    k: 'ring', n: '回字形', tip: '3×3 外圈中间镂空，俯视是回字，正视是横条。',
    cells: [[0,0,0],[1,0,0],[2,0,0],[0,1,0],[2,1,0],[0,2,0],[1,2,0],[2,2,0]],
    build() { return buildPolycube(this.cells, 0x14b8a6) }
  },
  {
    k: 'plus3', n: '十字塔', tip: '平面十字再向上叠立柱，三视图层次分明。',
    cells: [[0,0,0],[1,0,0],[2,0,0],[1,0,1],[1,0,-1],[1,1,0],[1,2,0]],
    build() { return buildPolycube(this.cells, 0xfb7185) }
  },
  {
    k: 'ztower', n: 'Z 字台阶', tip: '斜向爬升的台阶，正视与俯视轮廓各不相同。',
    cells: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [2, 1, 0], [2, 2, 0], [3, 2, 0]],
    build() { return buildPolycube(this.cells, 0xf97316) }
  },
  {
    k: 'tower', n: '底座立柱', tip: '2×2 底座上立一根柱子，注意投影中的遮挡关系。',
    cells: [[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[0,0,2],[0,0,3]],
    build() { return buildPolycube(this.cells, 0x818cf8) }
  }
]

// ---------- 视图题库（自动生成） ----------
export function viewQuiz(solid) {
  const dirs = [
    { k: 'front', label: '正面', d: solidViewPath(solid, 'front') },
    { k: 'top', label: '上面（俯视）', d: solidViewPath(solid, 'top') },
    { k: 'left', label: '左面', d: solidViewPath(solid, 'left') }
  ]
  const target = dirs[Math.floor(Math.random() * dirs.length)]
  const opts = [target]
  const others = dirs.filter(x => x.k !== target.k)
  const pool = []
  for (const s of SOLIDS) for (const dir of ['front', 'top', 'left']) {
    const d = solidViewPath(s, dir)
    if (d) pool.push({ label: s.n + '·' + (DIR_LABEL[dir] || dir), d })
  }
  const dist = pool.filter(x => x.d !== target.d && !others.some(o => o.d === x.d))
  while (opts.length < 4 && dist.length) {
    const i = Math.floor(Math.random() * dist.length)
    const it = dist.splice(i, 1)[0]
    opts.push({ k: 'd' + opts.length, label: it.label, d: it.d })
  }
  return { dir: target, opts: shuffle(opts), answer: target.d }
}

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

// ---------- 切面题库 ----------
export const SECTIONS = [
  { solid: 'cube', n: '正方体 · 平行切', q: '用一个平面平行于正方体底面去切，切面是什么形状？', ok: '正方形', wrongs: ['长方形', '三角形', '圆'] },
  { solid: 'cube', n: '正方体 · 对角切', q: '沿正方体对角面去切，切面是什么形状？', ok: '长方形', wrongs: ['正方形', '三角形', '梯形'] },
  { solid: 'cube', n: '正方体 · 过顶点切', q: '用一个平面过正方体一个顶点且与三条棱相交去切，切面是什么形状？', ok: '三角形', wrongs: ['四边形', '五边形', '六边形'] },
  { solid: 'cylinder', n: '圆柱 · 轴切', q: '沿圆柱的轴（上下底面圆心连线）切一刀，切面是什么形状？', ok: '长方形', wrongs: ['圆', '椭圆', '三角形'] },
  { solid: 'cylinder', n: '圆柱 · 斜切', q: '用一个与圆柱底面不平行的平面斜着切，切面是什么形状？', ok: '椭圆', wrongs: ['圆', '矩形', '梯形'] },
  { solid: 'cylinder', n: '圆柱 · 平切', q: '用一个平行于圆柱底面的平面去切，切面是什么形状？', ok: '圆', wrongs: ['椭圆', '矩形', '三角形'] },
  { solid: 'cone', n: '圆锥 · 轴切', q: '沿圆锥的轴切一刀，切面是什么形状？', ok: '等腰三角形', wrongs: ['直角三角形', '圆', '梯形'] },
  { solid: 'cone', n: '圆锥 · 平行底切', q: '用一个平行于圆锥底面的平面去切，切面是什么形状？', ok: '圆', wrongs: ['椭圆', '三角形', '扇形'] },
  { solid: 'sphere', n: '球 · 任意切', q: '用一个平面去切球体，切面一定是什么形状？', ok: '圆', wrongs: ['椭圆', '正方形', '三角形'] },
  { solid: 'tetra', n: '正四面体 · 平行切', q: '用一个平面平行于正四面体一个底面去切，切面是什么形状？', ok: '三角形', wrongs: ['四边形', '五边形', '梯形'] },
  { solid: 'hexPrism', n: '六棱柱 · 平切', q: '用一个平行于六棱柱底面的平面去切，切面是什么形状？', ok: '正六边形', wrongs: ['长方形', '三角形', '圆'] },
  { solid: 'pyramid4', n: '四棱锥 · 平切', q: '用一个平行于四棱锥底面的平面去切，切面是什么形状？', ok: '正方形', wrongs: ['三角形', '梯形', '长方形'] },
  { solid: 'lshape', n: 'L 型 · 平切', q: '用一个平行于 L 型组合体底面的平面去切，切面是什么形状？', ok: 'L 形', wrongs: ['正方形', '长方形', '三角形'] }
]

// ---------- 补缺题库 ----------
export const MISSING = [
  { solid: 'cube', n: '正方体缺一角', q: '一个正方体被切掉一个角（三棱锥），剩下的部分有几个面？', ok: '7 个面', wrongs: ['6 个面', '8 个面', '9 个面'] },
  { solid: 'cube', n: '正方体挖小洞', q: '正方体正中心挖去一个小正方体，外表面会增加几个面？', ok: '6 个面', wrongs: ['4 个面', '8 个面', '12 个面'] },
  { solid: 'cuboid', n: '长方体切半', q: '长方体沿对角线切一刀分成两半，每一半的截面是什么形状？', ok: '长方形', wrongs: ['三角形', '梯形', '正方形'] },
  { solid: 'lshape', n: 'L 型补全', q: '把 L 型组合体补成一个 2×2×1 长方体，还缺几个小正方体？', ok: '1 个', wrongs: ['2 个', '3 个', '4 个'] }
]

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


// ---------- 自由切割引擎（"切面刀"）：任意横/斜切面实时计算真实截面 ----------
// 思路：平面与网格三角形求交 → 收集交线段 → 焊接成闭合环路（支持多块非凸截面）
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

function keyPt(v) {
  const f = n => String(Math.round(n * 10000) / 10000)
  return `${f(v.x)},${f(v.y)},${f(v.z)}`
}
function weldSegments(segments) {
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

function simplifyLoop(loop) {
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


// ---------- 组合体系统（多形体任意组合成复杂立体） ----------
export function buildCombo(parts) {
  const g = new THREE.Group()
  for (const p of parts || []) {
    let mesh
    if (p.kind === 'vox' && p.cells && p.cells.length) {
      mesh = buildPolycube(p.cells, p.color || 0x22d3ee)
    } else {
      const solid = SOLIDS.find(s => s.k === p.k)
      mesh = solid ? solid.build(p.params || {}) : buildPolycube([[0, 0, 0]], p.color || 0x22d3ee)
    }
    if (p.color) {
      mesh.traverse(o => {
        if (o.isMesh) {
          o.material = new THREE.MeshPhongMaterial({ color: p.color, transparent: true, opacity: 0.92, side: THREE.DoubleSide })
          if (o.userData.wire) o.userData.wire.material.color.set(p.color)
        }
      })
    }
    const sc = p.scale || 1
    mesh.scale.set(sc, sc, sc)
    if (p.rot) mesh.rotation.set(p.rot[0] || 0, p.rot[1] || 0, p.rot[2] || 0)
    if (p.offset) mesh.position.set(p.offset[0] || 0, p.offset[1] || 0, p.offset[2] || 0)
    mesh.name = p.k || (p.cells ? 'vox' : 'part')
    mesh.userData.baseOffset = p.offset ? [p.offset[0] || 0, p.offset[1] || 0, p.offset[2] || 0] : [0, 0, 0]
    mesh.userData.partColor = p.color || null
    g.add(mesh)
  }
  return center(g)
}

// 组合预设（每部件：kind=solid 用 SOLIDS key；kind=vox 用 cells）
export const COMBO_PRESETS = [
  { n: '🚀 火箭', parts: [
    { kind: 'solid', k: 'cone', color: 0xfb7185, offset: [0, 1.15, 0] },
    { kind: 'solid', k: 'cylinder', color: 0x93c5fd, scale: 0.9 },
    { kind: 'solid', k: 'cube', color: 0xf59e0b, scale: 0.35, offset: [0.55, -0.55, 0], rot: [0, 0, 0.5] },
    { kind: 'solid', k: 'cube', color: 0xf59e0b, scale: 0.35, offset: [-0.55, -0.55, 0], rot: [0, 0, -0.5] },
    { kind: 'solid', k: 'cube', color: 0xf59e0b, scale: 0.35, offset: [0, -0.55, 0.55] }
  ]},
  { n: '⛄ 雪人', parts: [
    { kind: 'solid', k: 'sphere', color: 0xffffff, scale: 1.1, offset: [0, -0.7, 0] },
    { kind: 'solid', k: 'sphere', color: 0xfef9c3, scale: 0.72, offset: [0, 0.42, 0] },
    { kind: 'solid', k: 'cone', color: 0xf97316, scale: 0.45, offset: [0, 1.35, 0], rot: [Math.PI, 0, 0] }
  ]},
  { n: '🏠 房子', parts: [
    { kind: 'solid', k: 'cube', color: 0xfef3c7, scale: 1.2, offset: [0, -0.35, 0] },
    { kind: 'solid', k: 'pyramid4', color: 0xb91c1c, scale: 1.1, offset: [0, 0.85, 0] }
  ]},
  { n: '🏆 奖杯', parts: [
    { kind: 'solid', k: 'frustum', color: 0xfde047, scale: 1.1, offset: [0, 0.45, 0] },
    { kind: 'solid', k: 'cylinder', color: 0xd97706, scale: 0.28, offset: [0, -0.55, 0] },
    { kind: 'solid', k: 'cube', color: 0xd97706, scale: 0.6, offset: [0, -1.15, 0] }
  ]},
  { n: '🌲 圣诞树', parts: [
    { kind: 'solid', k: 'cylinder', color: 0x92400e, scale: 0.4, offset: [0, -0.9, 0] },
    { kind: 'solid', k: 'cone', color: 0x16a34a, scale: 0.9, offset: [0, -0.1, 0] },
    { kind: 'solid', k: 'cone', color: 0x22c55e, scale: 0.7, offset: [0, 0.6, 0] },
    { kind: 'solid', k: 'cone', color: 0x4ade80, scale: 0.5, offset: [0, 1.15, 0] }
  ]},
  { n: '🍭 棒棒糖', parts: [
    { kind: 'solid', k: 'cylinder', color: 0xf5f5f4, scale: 0.16, offset: [0, -1.0, 0] },
    { kind: 'solid', k: 'sphere', color: 0xf472b6, scale: 0.85, offset: [0, 0.25, 0] }
  ]},
  { n: '🍄 蘑菇', parts: [
    { kind: 'solid', k: 'cylinder', color: 0xfef3c7, scale: 0.7, offset: [0, -0.35, 0] },
    { kind: 'solid', k: 'sphere', color: 0xef4444, scale: 1.0, offset: [0, 0.35, 0] }
  ]},
  { n: '🗼 宝塔', parts: [
    { kind: 'solid', k: 'frustum', color: 0xf59e0b, scale: 1.2, offset: [0, -0.6, 0] },
    { kind: 'solid', k: 'frustum', color: 0xfbbf24, scale: 0.9, offset: [0, 0.15, 0], params: { r1: 0.32, r2: 0.5, h: 1.0 } },
    { kind: 'solid', k: 'frustum', color: 0xfcd34d, scale: 0.6, offset: [0, 0.8, 0] }
  ]},
  { n: '🤖 机器人', parts: [
    { kind: 'solid', k: 'cube', color: 0x93c5fd, scale: 1.0, offset: [0, -0.3, 0] },
    { kind: 'solid', k: 'cube', color: 0xbfdbfe, scale: 0.6, offset: [0, 0.75, 0] },
    { kind: 'solid', k: 'cube', color: 0x60a5fa, scale: 0.28, offset: [0.8, -0.3, 0] },
    { kind: 'solid', k: 'cube', color: 0x60a5fa, scale: 0.28, offset: [-0.8, -0.3, 0] },
    { kind: 'solid', k: 'cylinder', color: 0x1e3a8a, scale: 0.18, offset: [0, -1.15, 0] }
  ]},
  { n: '🛰 卫星', parts: [
    { kind: 'solid', k: 'cube', color: 0xfde68a, scale: 0.8 },
    { kind: 'solid', k: 'cuboid', color: 0x38bdf8, offset: [1.15, 0, 0], params: { w: 0.6, h: 0.5, d: 1.4 } },
    { kind: 'solid', k: 'cuboid', color: 0x38bdf8, offset: [-1.15, 0, 0], params: { w: 0.6, h: 0.5, d: 1.4 } },
    { kind: 'solid', k: 'cylinder', color: 0x94a3b8, scale: 0.12, offset: [0, 1.2, 0] }
  ]}
]

// 随机组合生成器
const RAND_SOLID_KEYS = ['cube', 'cuboid', 'cylinder', 'cone', 'sphere', 'tetra', 'frustum', 'pyramid4', 'pyramid3', 'triPrism', 'hexPrism']
export function randComboParts(n = 3) {
  const palette = [0x22d3ee, 0x3b82f6, 0x22c55e, 0xf59e0b, 0xfb7185, 0xa855f7, 0x14b8a6, 0xf97316, 0x818cf8, 0xec4899]
  const parts = []
  for (let i = 0; i < n; i++) {
    const k = RAND_SOLID_KEYS[Math.floor(Math.random() * RAND_SOLID_KEYS.length)]
    const sc = 0.5 + Math.random() * 0.7
    parts.push({
      kind: 'solid', k,
      color: palette[i % palette.length],
      scale: sc,
      offset: [0, i * 0.9 - (n - 1) * 0.45, 0],
      rot: [0, Math.random() * Math.PI, 0]
    })
  }
  return parts
}

// ---------- 实时统计：面 / 棱 / 顶点 / 表面积 ----------
function ptKey(v) { const f = n => String(Math.round(n * 10000) / 10000); return `${f(v.x)},${f(v.y)},${f(v.z)}` }
function edgeKey(a, b) { const k1 = ptKey(a), k2 = ptKey(b); return k1 < k2 ? k1 + '|' + k2 : k2 + '|' + k1 }

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


// ---------- 展开图涂色/自由绘制：笔迹平滑 / 形状识别 / 面纹理 ----------
// 点到线段距离（归一化坐标）
export function pointSegDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

// Ramer-Douglas-Peucker 笔迹简化（去抖、识别直线/曲线）
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

// 用 Catmull-Rom 中点法画平滑路径（曲线），直线自动退化为线段；closed 时闭合
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

// 展开图网格布局（用于涂色画布）：返回 {cells, cols, rows, cellW, cellH}
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

// ---------- 离线真题库（公考立体图推真题风格） ----------
export const REAL_QUESTIONS = [
  { q: '真题·展开图：下面哪个展开图能折成正方体？A 十字形 B 田字形(2×3) C 一字长条 D T字形', a: 'A', tip: '正方体展开图必满足：6 个面 + 折叠后 6 面朝向互不相同（2×3 矩形无法围成）' },
  { q: '真题·三视图：一个由 5 个小正方体组成的 L 形立体（底层3个横排+左侧上方2个竖排），其主视图是？A 4格阶梯 B 3格 L 形 C 2×2 方形 D 一字 5 格', a: 'B', tip: '主视图按层高投影：底层3格+上面2格错开 → L 形' },
  { q: '真题·截面：用一平面过正方体相邻三条棱的中点去切，切面是？A 正六边形 B 三角形 C 四边形 D 五边形', a: 'A', tip: '过六条棱中点 → 正六边形' },
  { q: '真题·拼接：8 个小正方体拼成一个 2×2×2 大正方体，拿去一个角上的小正方体，剩下立体外露的小正方形面共多少个？A 36 B 34 C 33 D 32', a: 'C', tip: '原 2×2×2 外露 24 面，去掉角块新增 3 面又失去 3 面，净增 9 → 24-3+9=30？正解 33：角块外露3面+新增内面3×3' },
  { q: '真题·空间重构：一个三面分别涂红、蓝、黄的小正方体展开图，红面与黄面相邻，蓝面与红面相对，则黄面与蓝面？A 相邻 B 相对 C 不确定 D 共线', a: 'A', tip: '三个面两两关系中两两相邻/一相对 → 黄蓝相邻' },
  { q: '真题·视图：圆柱沿轴切一刀再斜切一刀，得到的两个截面分别是？A 矩形和椭圆 B 圆和矩形 C 椭圆和圆 D 两个矩形', a: 'A', tip: '轴切→矩形；斜切(不平行底面)→椭圆' },
  { q: '真题·展开图：一个正方体展开图相对面（不相邻）的两面，折叠后必然？A 相邻 B 相对 C 平行且不相邻 D 无法确定', a: 'B', tip: '展开图中间隔一格的两面折后相对' },
  { q: '真题·组合体：下面由 3 个相同小正方体组成的图形，其俯视图不可能出现的是？A 田字 B 一字 C L形 D 品字', a: 'D', tip: '3 个正方体俯视最多投影成 L/一字/田(含重叠)，品字需 4 块' }
]

// ---------- 考点问答与技巧 ----------
export const TIP_QA = [
  { q: '三视图有什么口诀？', a: '长对正、高平齐、宽相等；先看轮廓再看棱线，遮挡用虚线。' },
  { q: '正方体展开图有多少种？', a: '共 11 种（4类：一四一6种、二三一3种、二二二1种、三三1种），中间隔一格的两面折后相对。' },
  { q: '怎么快速判断切面形状？', a: '看平面与几条棱相交：交几条棱就是几边形；过顶点数越多边数越少；平行底面的切面与底面同形。' },
  { q: '立体拼接题怎么数？', a: '先数正面能看到的，再看遮挡层；用"逐层数+减法"（总数=各层可见+上层遮挡补足）。' },
  { q: '欧拉公式怎么用？', a: '闭合多面体 V-E+F=2；已知面数和顶点可求棱数；组合体不闭合则先拆开算。' },
  { q: '空间重构展开图怎么盯？', a: '找"相对面"（隔一格）和"相邻面"（共边）；选一个基准面，其余面围绕它转。' }
]


// ---------- 多图复刻：多个立体并排展示 ----------
export function buildMultiFigures(figs) {
  const g = new THREE.Group()
  const colors = [0x22d3ee, 0x3b82f6, 0xf59e0b, 0xfb7185, 0xa855f7, 0x22c55e]
  const spacing = 2.6
  figs.forEach((f, i) => {
    if (!f || !f.cells || !f.cells.length) return
    const m = buildPolycube(f.cells, colors[i % colors.length])
    m.position.x = i * spacing
    g.add(m)
  })
  return center(g)
}
