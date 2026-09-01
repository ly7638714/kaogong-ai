// ===== 体素引擎（小正方体组合，坐标 x 右 / y 上 / z 前）（自 solidTrain.js 纯移动，未改动） =====
import * as THREE from 'three'
import { box, wire, center } from './three.js'

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

export const DIR_LABEL = { front: '正面', top: '俯视', left: '左面' }
export function solidViewPath(solid, dir) {
  if (solid.cells) return voxelSvg(solid.cells, dir).path
  return solid[dir] || solid.front
}

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
