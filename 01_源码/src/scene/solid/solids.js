// ===== 图形库：基础参数化立体 + 复杂体素组合立体（自 solidTrain.js 纯移动，未改动） =====
import * as THREE from 'three'
import { box, wire, center, shuffle } from './three.js'
import { buildPolycube, solidViewPath, DIR_LABEL } from './voxel.js'

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
