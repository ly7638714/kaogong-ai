<script setup>
// 知识神经网络星系 v4：真 3D 立体神经网络（three.js 按需加载）
// 立体球体星球(学过就发光!) / 相机环绕旋转 / 深空星场星云流星 / 流光数据流 / 星桥环+知识桥
// 点击点亮 / 悬停tooltip / 板块飞入导航 / 键盘 / 搜索脉冲 / 学习印记联动(localStorage)
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { store } from '../store'
import { markLearned, learnedSet } from '../utils/learned'

const props = defineProps({ cards: { type: Array, default: () => [] } })
const emit = defineEmits(['ask'])

const PLATES = [
  { k: '判断推理', e: '🧠' },
  { k: '言语理解', e: '📖' },
  { k: '资料分析', e: '📈' },
  { k: '数量关系', e: '🔢' },
  { k: '常识判断', e: '🌍' },
  { k: '政治理论', e: '🏛️' }
]
const PLATE_COLOR = { 判断推理: '#22d3ee', 言语理解: '#a78bfa', 资料分析: '#34d399', 数量关系: '#fbbf24', 常识判断: '#fb7185', 政治理论: '#f472b6' }

const wrap = ref(null)
const holder = ref(null)
const tipEl = ref(null)
const sel = ref(null)
const hover = ref(null)
const kw = ref('')
const focusPlate = ref('判断推理')
const loading = ref(true)
const ready = ref(false)
const learnedCount = ref(learnedSet().size)

const selected = computed(() => props.cards.find((c) => c.id === sel.value) || null)
const hoverCard = computed(() => props.cards.find((c) => c.id === hover.value) || null)
const matchedCount = computed(() => {
  const q = kw.value.trim()
  if (!q) return -1
  return props.cards.filter((c) => (c.type + (c.tip || '') + (c.source || '')).includes(q)).length
})
const isPanorama = computed(() => focusPlate.value === null)

// ===== three.js 状态（动态按需加载，不拖慢启动） =====
let THREE = null
let OrbitControls = null
let scene = null
let camera = null
let renderer = null
let controls = null
let raf = 0
let clock = null
let hubObjs = {} // plate -> { mesh, halo, ringA, ringB }
let cardObjs = {} // id -> { mesh, halo, plate, src, base, orbit, learned, tw }
let lineSeg = null // 合并实线（hub→卡 + 同老师）
let dashLines = [] // 虚线（星桥环 + 知识桥）
let flowPoints = null // 流光粒子
let flowMeta = [] // { aid, bid }
let starField = null
let nebulaSprites = []
let meteors = []
let learned = new Set(learnedSet())
let lightPulses = [] // 点亮脉冲 { id, t0 }
let camTween = null // 相机飞入 {fromP,toP,fromT,toT,t0,dur}
let raycaster = null
let ndc = null
let downPos = null // 点击防拖拽误触
let W = 2400
let H = 1600
const ENTER = 1.6

// ===== 布局数据 =====
let nodes = [] // {id, plate, hub, tx,ty, r, e, tw, dl, ph, orbit}
let edges = [] // {a, b, w, hub}
let chainEdges = [] // 星桥环
let bridgeEdges = [] // 知识桥

function buildData() {
  nodes = []
  edges = []
  chainEdges = []
  bridgeEdges = []
  const cards = props.cards || []
  const byPlate = {}
  PLATES.forEach((p) => { byPlate[p.k] = [] })
  cards.forEach((c) => { (byPlate[c.plate] = byPlate[c.plate] || []).push(c) })
  const CX = W / 2
  const CY = H / 2
  PLATES.forEach((p, i) => {
    const ang = (i / PLATES.length) * Math.PI * 2 - Math.PI / 2
    const hx = CX + Math.cos(ang) * 560
    const hy = CY + Math.sin(ang) * 560
    nodes.push({ id: 'hub:' + p.k, plate: p.k, hub: true, tx: hx, ty: hy, y: 0, r: 52, e: p.e, tw: Math.random() * Math.PI * 2, dl: 0, ph: 0 })
    const list = byPlate[p.k] || []
    list.forEach((c, j) => {
      const a = ang + (Math.random() - 0.5) * 1.2 + (j % 2 === 0 ? 0 : Math.PI / 3.4)
      const rr = 260 + Math.random() * 230
      nodes.push({
        id: c.id, plate: p.k, tx: hx + Math.cos(a) * rr, ty: hy + Math.sin(a) * rr, y: (Math.random() - 0.5) * 140, r: 7.5,
        tw: Math.random() * Math.PI * 2, dl: 0.1 + Math.random() * 0.6, ph: 0,
        orbit: { a0: Math.random() * Math.PI * 2, sp: 0.22 + Math.random() * 0.35, amp: 5 + Math.random() * 9 }
      })
      edges.push({ a: 'hub:' + p.k, b: c.id, hub: true })
    })
  })
  const bySrc = {}
  const cardsArr = props.cards || []
  cardsArr.forEach((c) => { const k = c.source || '综合'; (bySrc[k] = bySrc[k] || []).push(c) })
  Object.values(bySrc).forEach((arr) => {
    if (arr.length < 2) return
    let n = 0
    for (let i = 0; i < arr.length && n < 4; i++)
      for (let j = i + 1; j < arr.length && n < 4; j++)
        if (arr[i].plate === arr[j].plate) { edges.push({ a: arr[i].id, b: arr[j].id, hub: false }); n++ }
  })
  const chain = ['判断推理', '言语理解', '资料分析', '数量关系', '常识判断', '政治理论']
  for (let i = 0; i < chain.length; i++) chainEdges.push({ a: 'hub:' + chain[i], b: 'hub:' + chain[(i + 1) % chain.length] })
  const byTeacher = {}
  cardsArr.forEach((c) => { const k = (c.source || '综合').split('·')[0].trim(); (byTeacher[k] = byTeacher[k] || []).push(c) })
  Object.entries(byTeacher).forEach(([tk, arr]) => {
    const byP = {}
    arr.forEach((c) => { (byP[c.plate] = byP[c.plate] || []).push(c) })
    const ps = Object.keys(byP)
    if (ps.length < 2) return
    let n = 0
    for (let i = 0; i < ps.length && n < 3; i++)
      for (let j = i + 1; j < ps.length && n < 3; j++) {
        bridgeEdges.push({ a: byP[ps[i]][0].id, b: byP[ps[j]][0].id, teacher: tk })
        n++
      }
  })
}

// ===== 3D 场景 =====
function hex(hexStr) { return new THREE.Color(hexStr) }
function makeGlowTexture(color, whiteA) {
  const size = 128
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  const g = cv.getContext('2d')
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grd.addColorStop(0, 'rgba(255,255,255,' + whiteA + ')')
  grd.addColorStop(0.3, color)
  grd.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(cv)
}
function makeHaloTexture(color, opacity) {
  const size = 128
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  const g = cv.getContext('2d')
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grd.addColorStop(0, 'rgba(255,255,255,' + opacity + ')')
  grd.addColorStop(0.4, color)
  grd.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(cv)
}
function pos3(n) {
  return new THREE.Vector3(n.tx, n.y || 0, n.ty)
}
async function boot() {
  const m = await import('three')
  THREE = m
  const oc = await import('three/examples/jsm/controls/OrbitControls.js')
  OrbitControls = oc.OrbitControls
  clock = new THREE.Clock()
  raycaster = new THREE.Raycaster()
  ndc = new THREE.Vector2()
  initScene()
  buildWorld()
  animate()
  loading.value = false
  ready.value = true
  // 入场：先全景俯瞰 0.6s，再镜头飞入判断推理星系
  camTween = makeCamTween(
    new THREE.Vector3(0, 1500, 2400), new THREE.Vector3(1200, 0, 240),
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(1200, 0, 240),
    performance.now() + 600, 1600
  )
}
function initScene() {
  const el = holder.value
  scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2(0x04070f, 0.00013)
  camera = new THREE.PerspectiveCamera(55, el.clientWidth / el.clientHeight, 0.1, 6000)
  camera.position.set(0, 1500, 2400)
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  renderer.setSize(el.clientWidth, el.clientHeight)
  renderer.setClearColor(0x04070f, 1)
  el.appendChild(renderer.domElement)
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 140
  controls.maxDistance = 3200
  controls.target.set(0, 0, 0)
  controls.addEventListener('start', () => { camTween = null })
  // 交互监听
  renderer.domElement.addEventListener('pointerdown', onDown3d)
  renderer.domElement.addEventListener('click', onClick3d)
  renderer.domElement.addEventListener('pointermove', onPointer)
  renderer.domElement.addEventListener('pointerleave', onLeave)
  renderer.domElement.addEventListener('dblclick', onDbl)
  scene.add(new THREE.AmbientLight(0x99aacc, 0.75))
  const dl = new THREE.DirectionalLight(0xffffff, 0.9)
  dl.position.set(300, 600, 800)
  scene.add(dl)
  const pl = new THREE.PointLight(0x66ccff, 1.2, 1600)
  pl.position.set(0, 0, 0)
  scene.add(pl)
  // 星空球壳
  const starGeo = new THREE.BufferGeometry()
  const starN = 4200
  const sp = new Float32Array(starN * 3)
  const sc = new Float32Array(starN * 3)
  for (let i = 0; i < starN; i++) {
    const r = 2200 + Math.random() * 1400
    const th = Math.random() * Math.PI * 2
    const ph = Math.acos(2 * Math.random() - 1)
    sp[i * 3] = r * Math.sin(ph) * Math.cos(th)
    sp[i * 3 + 1] = r * Math.cos(ph)
    sp[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th)
    const b = 0.5 + Math.random() * 0.5
    sc[i * 3] = b; sc[i * 3 + 1] = b; sc[i * 3 + 2] = 1
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3))
  starGeo.setAttribute('color', new THREE.BufferAttribute(sc, 3))
  starField = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 2.4, vertexColors: true, transparent: true, opacity: 0.9, sizeAttenuation: true, depthWrite: false }))
  scene.add(starField)
}
function buildWorld() {
  buildData()
  hubObjs = {}
  cardObjs = {}
  dashLines.forEach((o) => { scene.remove(o.line); o.line.geometry.dispose(); o.line.material.dispose() })
  dashLines = []
  if (lineSeg) { scene.remove(lineSeg); lineSeg.geometry.dispose(); lineSeg.material.dispose(); lineSeg = null }
  if (flowPoints) { scene.remove(flowPoints); flowPoints.geometry.dispose(); flowPoints.material.dispose(); flowPoints = null }
  nebulaSprites.forEach((s) => scene.remove(s))
  nebulaSprites = []
  meteors.forEach((mt) => scene.remove(mt.sprite))
  meteors = []
  const nodeOf = (id) => nodes.find((n) => n.id === id)
  // 星云 + 中枢 + 卡片球
  const cardGeo = new THREE.SphereGeometry(1, 20, 20)
  for (const n of nodes) {
    if (n.hub) {
      const p = pos3(n)
      const mesh = new THREE.Mesh(cardGeo, new THREE.MeshBasicMaterial({ color: hex(PLATE_COLOR[n.plate]) }))
      mesh.position.copy(p)
      mesh.scale.setScalar(52)
      mesh.userData = { plate: n.plate, hub: true }
      scene.add(mesh)
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeHaloTexture(PLATE_COLOR[n.plate], 0.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
      halo.scale.setScalar(340)
      halo.position.copy(p)
      scene.add(halo)
      const ringGeo = new THREE.TorusGeometry(1, 0.014, 8, 56)
      const ringA = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: hex(PLATE_COLOR[n.plate]), transparent: true, opacity: 0.65 }))
      ringA.scale.setScalar(120)
      ringA.position.copy(p)
      ringA.rotation.x = Math.PI / 2.4
      scene.add(ringA)
      const ringB = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 }))
      ringB.scale.setScalar(150)
      ringB.position.copy(p)
      ringB.rotation.x = Math.PI / 1.7
      scene.add(ringB)
      hubObjs[n.plate] = { mesh, halo, ringA, ringB }
      // 星云
      const nb = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlowTexture(PLATE_COLOR[n.plate], 0.16), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
      nb.scale.setScalar(760)
      nb.position.copy(p)
      scene.add(nb)
      nebulaSprites.push(nb)
    } else {
      const p = pos3(n)
      const learnedFlag = learned.has(n.id)
      const mesh = new THREE.Mesh(cardGeo, learnedFlag ? new THREE.MeshBasicMaterial({ color: hex(PLATE_COLOR[n.plate]) }) : new THREE.MeshStandardMaterial({ color: 0x25334a, roughness: 0.55, metalness: 0.25, emissive: 0x0c1626, emissiveIntensity: 0.6 }))
      mesh.position.copy(p)
      mesh.scale.setScalar(learnedFlag ? 7.5 : 6.2)
      mesh.userData = { id: n.id }
      scene.add(mesh)
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeHaloTexture(PLATE_COLOR[n.plate], learnedFlag ? 0.55 : 0.1), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
      halo.scale.setScalar(learnedFlag ? 52 : 26)
      halo.position.copy(p)
      scene.add(halo)
      cardObjs[n.id] = { mesh, halo, plate: n.plate, base: n, learned: learnedFlag, tw: n.tw }
    }
  }
  // 实线合并（hub→卡 板块色 + 同老师灰）
  const linePos = []
  const lineCol = []
  for (const e of edges) {
    const a = nodeOf(e.a)
    const b = nodeOf(e.b)
    if (!a || !b) continue
    const pa = pos3(a)
    const pb = pos3(b)
    linePos.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z)
    if (e.hub) {
      const col = hex(PLATE_COLOR[a.plate])
      lineCol.push(col.r * 0.7, col.g * 0.7, col.b * 0.7, col.r * 0.35, col.g * 0.35, col.b * 0.35)
    } else {
      lineCol.push(0.32, 0.38, 0.5, 0.32, 0.38, 0.5)
    }
  }
  if (linePos.length) {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(lineCol, 3))
    lineSeg = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false }))
    scene.add(lineSeg)
  }
  // 虚线：星桥环（金）+ 知识桥（白）
  function addDash(e, color, opacity) {
    const a = nodeOf(e.a)
    const b = nodeOf(e.b)
    if (!a || !b) return
    const pa = pos3(a)
    const pb = pos3(b)
    const g = new THREE.BufferGeometry().setFromPoints([pa, pb])
    const line = new THREE.Line(g, new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 10, gapSize: 14, depthWrite: false }))
    line.computeLineDistances()
    scene.add(line)
    dashLines.push({ line })
  }
  chainEdges.forEach((e) => addDash(e, 0xf5c56b, 0.55))
  bridgeEdges.forEach((e) => addDash(e, 0xffffff, 0.4))
  // 流光粒子（hub→卡 每条 1 个光点，板块色）
  const flowList = edges.filter((e) => e.hub)
  flowMeta = flowList.map((e) => ({ aid: e.a, bid: e.b }))
  const fg = new THREE.BufferGeometry()
  const fp = new Float32Array(flowMeta.length * 3)
  const fc = new Float32Array(flowMeta.length * 3)
  flowMeta.forEach((f, i) => {
    const a = nodeOf(f.aid)
    const col = hex(PLATE_COLOR[a.plate])
    fc[i * 3] = col.r; fc[i * 3 + 1] = col.g; fc[i * 3 + 2] = col.b
  })
  fg.setAttribute('position', new THREE.BufferAttribute(fp, 3))
  fg.setAttribute('color', new THREE.BufferAttribute(fc, 3))
  flowPoints = new THREE.Points(fg, new THREE.PointsMaterial({ size: 4, vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }))
  scene.add(flowPoints)
  // 流星（3 颗循环划过）
  for (let i = 0; i < 3; i++) {
    const sp2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlowTexture('rgba(255,255,255,1)', 0.9), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
    sp2.scale.setScalar(26)
    scene.add(sp2)
    meteors.push({ sprite: sp2, t: Math.random(), spd: 0.09 + Math.random() * 0.07, from: null, to: null })
  }
  lightPulses = []
}
function makeCamTween(fromP, toP, fromT, toT, t0, dur) {
  return { fromP: fromP.clone(), toP: toP.clone(), fromT: fromT.clone(), toT: toT.clone(), t0, dur }
}
// ===== 学习点亮 =====
function lightUp(id) {
  const o = cardObjs[id]
  if (!o || o.learned) return
  o.learned = true
  learned.add(id)
  o.mesh.material.dispose()
  o.mesh.material = new THREE.MeshBasicMaterial({ color: hex(PLATE_COLOR[o.plate]) })
  o.mesh.scale.setScalar(7.5)
  o.halo.material.opacity = 0.55
  o.halo.scale.setScalar(52)
  lightPulses.push({ id, t0: performance.now() })
  learnedCount.value = learned.size
}
function onLearned(e) {
  const id = e && e.detail
  if (id) lightUp(id)
  else learnedCount.value = learned.size
}
// 光效强度（用户可调）：0=关闭 / 0.5=柔和 / 1=全开；默认 0.6 防白天晃眼
function fx() {
  const v = Number(store.cfg.kgFx)
  return isNaN(v) ? 0.6 : Math.max(0, Math.min(1, v))
}
// ===== 动画循环 =====
function animate() {
  raf = requestAnimationFrame(animate)
  const dt = Math.min(0.05, clock.getDelta())
  const t = clock.elapsedTime
  const f = fx()
  // 入场相位
  for (const n of nodes) {
    if (n.ph < 1) n.ph = Math.min(1, Math.max(0, (t - n.dl) / ENTER))
  }
  const ease = (x) => { const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2) }
  // 卡片球：入场 + 轨道漂移 + 呼吸
  for (const o of Object.values(cardObjs)) {
    const n = o.base
    const e = ease(n.ph)
    const by = n.y * e
    if (n.ph < 1) { o.mesh.position.set(n.tx * e, by, n.ty * e); o.halo.position.copy(o.mesh.position) }
    else {
      const dx = Math.cos(t * n.orbit.sp + n.orbit.a0) * n.orbit.amp
      const dz = Math.sin(t * n.orbit.sp * 0.8 + n.orbit.a0) * n.orbit.amp * 0.8
      o.mesh.position.set(n.tx + dx, n.y, n.ty + dz)
      o.halo.position.copy(o.mesh.position)
    }
    // 点亮脉冲（刚点亮的星球短暂放大扩散）
    let pulseK = 1
    for (const p of lightPulses) {
      if (p.id === n.id) {
        const pt = Math.max(0, 1 - (performance.now() - p.t0) / 900)
        pulseK = 1 + 0.7 * pt
      }
    }
    // 呼吸
    const br = 1 + (o.learned ? 0.08 : 0.04) * Math.sin(t * 1.9 + n.tw)
    o.mesh.scale.setScalar((o.learned ? 7.5 : 6.2) * br * pulseK)
    o.halo.scale.setScalar((o.learned ? 52 : 26) * br * pulseK * (1 + 0.25 * Math.sin(t * 2 + n.tw)))
    o.halo.material.opacity = (o.learned ? 0.5 + 0.14 * Math.sin(t * 2 + n.tw) : 0.09 + 0.04 * Math.sin(t * 1.6 + n.tw)) * f
    // 悬停/选中高亮
    const hl = hover.value === n.id || sel.value === n.id
    if (hl) o.halo.material.opacity = Math.max(o.halo.material.opacity, 0.85 * f)
  }
  // 中枢：呼吸 + 环旋转（亮度随光效系数）
  for (const o of Object.values(hubObjs)) {
    const br = 1 + 0.05 * Math.sin(t * 1.7 + (o.tw || 0))
    o.mesh.scale.setScalar(52 * br)
    o.halo.material.opacity = (0.45 + 0.15 * Math.sin(t * 1.6 + (o.tw || 0))) * f
    o.halo.scale.setScalar(340 * br)
    o.ringA.material.opacity = 0.65 * f
    o.ringB.material.opacity = 0.3 * f
    o.ringA.rotation.z += dt * 0.5
    o.ringA.rotation.x = Math.PI / 2.4 + Math.sin(t * 0.5 + (o.tw || 0)) * 0.2
    o.ringB.rotation.z -= dt * 0.3
  }
  // 点亮脉冲（扩散光环）
  lightPulses = lightPulses.filter((p) => (performance.now() - p.t0) < 900)
  // 流光粒子
  if (flowPoints && flowMeta.length) {
    const pos = flowPoints.geometry.attributes.position
    flowMeta.forEach((f, i) => {
      const ao = hubObjs[f.aid.slice(4)]
      const bo = cardObjs[f.bid]
      if (!ao || !bo) return
      const ft = ((t * 0.28 + i * 0.17) % 1)
      pos.array[i * 3] = ao.mesh.position.x + (bo.mesh.position.x - ao.mesh.position.x) * ft
      pos.array[i * 3 + 1] = ao.mesh.position.y + (bo.mesh.position.y - ao.mesh.position.y) * ft
      pos.array[i * 3 + 2] = ao.mesh.position.z + (bo.mesh.position.z - ao.mesh.position.z) * ft
    })
    pos.needsUpdate = true
  }
  // 流星（光效系数控制透明度）
  for (const mt of meteors) {
    mt.t += mt.spd * dt
    if (mt.t >= 1 || !mt.from) {
      mt.t = 0
      const side = Math.floor(Math.random() * 4)
      const r = 2200
      mt.from = new THREE.Vector3(side === 0 ? -r : side === 1 ? r : (Math.random() - 0.5) * 2 * r, (Math.random() - 0.2) * 1600, side === 2 ? -r : side === 3 ? r : (Math.random() - 0.5) * 2 * r)
      mt.to = new THREE.Vector3((Math.random() - 0.5) * 600, (Math.random() - 0.2) * 300, (Math.random() - 0.5) * 600)
    }
    mt.sprite.position.lerpVectors(mt.from, mt.to, mt.t)
    mt.sprite.material.opacity = (1 - mt.t) * 0.9 * f
  }
  // 星云 / 流光透明度随光效系数
  for (const nb of nebulaSprites) nb.material.opacity = 0.55 * f
  if (flowPoints) flowPoints.material.opacity = 0.9 * f
  // 星场缓慢旋转
  starField.rotation.y += dt * 0.004
  // 相机飞入
  if (camTween) {
    const p = Math.min(1, (performance.now() - camTween.t0) / camTween.dur)
    const ep = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2
    camera.position.lerpVectors(camTween.fromP, camTween.toP, Math.max(0, ep))
    controls.target.lerpVectors(camTween.fromT, camTween.toT, Math.max(0, ep))
    controls.update()
    if (p >= 1) camTween = null
  }
  controls.update()
  renderer.render(scene, camera)
}
// ===== 交互 =====
function flyTo(plateKey) {
  focusPlate.value = plateKey
  const tgt = plateKey === null ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(hubObjs[plateKey].mesh.position.x, 0, hubObjs[plateKey].mesh.position.z)
  camTween = makeCamTween(camera.position, tgt.clone().add(new THREE.Vector3(0, 300, 660)), controls.target, tgt, performance.now(), 1000)
}
function onPointer(e) {
  const el = renderer.domElement
  const rect = el.getBoundingClientRect()
  ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
  ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(ndc, camera)
  const hit = rayPick()
  if (hit && !hit.hub) {
    hover.value = hit.id
    if (tipEl.value) {
      const wr = wrap.value.getBoundingClientRect()
      let lx = e.clientX - wr.left + 14
      let ly = e.clientY - wr.top + 14
      if (lx + 190 > wr.width) lx = e.clientX - wr.left - 200
      if (ly + 70 > wr.height) ly = e.clientY - wr.top - 80
      tipEl.value.style.left = lx + 'px'
      tipEl.value.style.top = ly + 'px'
    }
  } else {
    hover.value = null
  }
}
function onLeave() { hover.value = null }
function rayPick() {
  const cards = Object.values(cardObjs).map((o) => o.mesh)
  const hits = raycaster.intersectObjects(cards, false)
  if (hits.length) return { id: hits[0].object.userData.id }
  const hubs = Object.values(hubObjs).map((o) => o.mesh)
  const hh = raycaster.intersectObjects(hubs, false)
  if (hh.length) return { hub: true, plate: hh[0].object.userData.plate }
  return null
}
function onClick() {
  const hit = rayPick()
  if (!hit) return
  if (hit.hub) {
    if (focusPlate.value !== hit.plate) flyTo(hit.plate)
    return
  }
  sel.value = hit.id
  markLearned(hit.id) // 点开查看 = 学过 → 点亮
  lightUp(hit.id)
}
function onDown3d(e) {
  downPos = { x: e.clientX, y: e.clientY }
}
function onClick3d(e) {
  if (downPos && Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 6) { downPos = null; return } // 拖拽旋转不算点击
  downPos = null
  onClick()
}
function onDbl() {
  if (!sel.value) flyTo(null)
}
function onKey(e) {
  if (!controls) return
  if (e.key === '+' || e.key === '=') { const dir = camera.position.clone().sub(controls.target); dir.setLength(dir.length() / 1.15); camera.position.copy(controls.target).add(dir) }
  else if (e.key === '-') { const dir = camera.position.clone().sub(controls.target); dir.setLength(dir.length() * 1.15); camera.position.copy(controls.target).add(dir) }
  else if (e.key === 'Escape') { if (sel.value) sel.value = null; else if (focusPlate.value) flyTo(null) }
}
function reset() {
  if (focusPlate.value) flyTo(focusPlate.value)
  else camTween = makeCamTween(camera.position, new THREE.Vector3(0, 1500, 2400), controls.target, new THREE.Vector3(0, 0, 0), performance.now(), 900)
}
function onKw() {
  const q = kw.value.trim()
  if (q) {
    const hits = props.cards.filter((c) => (c.type + (c.tip || '')).includes(q))
    hits.slice(0, 14).forEach((h) => { if (cardObjs[h.id]) lightPulses.push({ id: h.id, t0: performance.now() }) })
    if (hits[0]) {
      if (!sel.value) sel.value = hits[0].id
      if (focusPlate.value !== hits[0].plate) flyTo(hits[0].plate)
    }
  }
}
function askSelected() {
  if (!selected.value) return
  markLearned(selected.value.id)
  lightUp(selected.value.id)
  emit('ask', selected.value)
}
function onResize() {
  if (!renderer || !holder.value) return
  const el = holder.value
  camera.aspect = el.clientWidth / el.clientHeight
  camera.updateProjectionMatrix()
  renderer.setSize(el.clientWidth, el.clientHeight)
}

onMounted(() => {
  window.addEventListener('xc-learned', onLearned)
  window.addEventListener('resize', onResize)
  boot()
})
onUnmounted(() => {
  window.removeEventListener('xc-learned', onLearned)
  window.removeEventListener('resize', onResize)
  if (raf) cancelAnimationFrame(raf)
  if (renderer) {
    const el = renderer.domElement
    el.removeEventListener('pointerdown', onDown3d)
    el.removeEventListener('click', onClick3d)
    el.removeEventListener('pointermove', onPointer)
    el.removeEventListener('pointerleave', onLeave)
    el.removeEventListener('dblclick', onDbl)
    renderer.dispose()
    if (holder.value) holder.value.removeChild(el)
  }
})
watch(() => props.cards.length, () => {
  if (ready.value) {
    learned = new Set(learnedSet())
    learnedCount.value = learned.size
    buildWorld()
  }
})
</script>

<template>
  <div class="kg-wrap">
    <div class="kg-hd">
      <div class="kg-tip">🧠 3D 知识神经网络星系 · 拖拽旋转 / 滚轮缩放 / 点星球查看（学过就发光 ✨）</div>
      <div class="kg-stat">💫 {{ (cards || []).length }} 知识星 · 已点亮 {{ learnedCount }} · {{ PLATES.length }} 星系</div>
    </div>
    <div class="kg-search">
      <input v-model="kw" class="kg-search-in" placeholder="🔍 搜索知识点（如：比重 / 削弱 / 成语）" @input="onKw" />
      <span v-if="kw.trim()" class="kg-search-n">{{ matchedCount >= 0 ? '命中 ' + matchedCount + ' 个' : '' }}<button class="kg-search-x" @click="kw = ''; sel = null">✕</button></span>
    </div>
    <div
      ref="wrap"
      tabindex="0"
      class="kg-canvas-wrap"
      @keydown="onKey"
    >
      <div ref="holder" class="kg-3d">
        <div v-if="loading" class="kg-loading">🚀 正在进入知识宇宙…</div>
      </div>
      <div v-show="hoverCard" ref="tipEl" class="kg-tip-float">
        <b>{{ hoverCard && hoverCard.type }}</b>
        <i v-if="hoverCard && hoverCard.source">🧑‍🏫 {{ hoverCard.source }}</i>
        <span v-if="hoverCard">{{ hoverCard.tip }}</span>
      </div>
      <button class="kg-reset" title="回到当前星系 / 全景" @click="reset()">⌖</button>
      <div class="kg-legend">
        <span v-for="p in PLATES" :key="p.k" class="kg-lg" :class="{ on: focusPlate === p.k }" :title="'进入「' + p.k + '」星系'" @click="flyTo(p.k)">
          <i :style="{ background: PLATE_COLOR[p.k] }"></i>{{ p.k }}
        </span>
        <span class="kg-lg kg-lg-pano" :class="{ on: isPanorama }" title="俯瞰全部星系" @click="flyTo(null)">🌌 全景</span>
      </div>
    </div>
    <div v-if="selected" class="kg-detail">
      <div class="kg-d-hd">
        <span class="kg-d-type">{{ selected.type }}</span>
        <span class="kg-d-src">🧑‍🏫 {{ selected.source }}</span>
        <span v-if="learnedSet().has(selected.id)" class="kg-d-lit">✨ 已点亮</span>
        <button class="kg-d-x" title="关闭" @click="sel = null">✕</button>
      </div>
      <div class="kg-d-tip">💡 {{ selected.tip }}</div>
      <div v-if="selected.signs && selected.signs.length" class="kg-d-sec"><b>🔍 特征</b><div class="kg-d-tags"><span v-for="s in selected.signs" :key="s" class="kg-d-tag">{{ s }}</span></div></div>
      <div v-if="selected.steps && selected.steps.length" class="kg-d-sec"><b>🪜 步骤</b><ol class="kg-d-ol"><li v-for="(s, i) in selected.steps" :key="i">{{ s }}</li></ol></div>
      <div v-if="selected.traps && selected.traps.length" class="kg-d-sec"><b>⚠️ 陷阱</b><div class="kg-d-tags"><span v-for="t in selected.traps" :key="t" class="kg-d-tag danger">{{ t }}</span></div></div>
      <div v-if="selected.example" class="kg-d-ex">
        <div>📝 {{ selected.example.q }}</div>
        <div v-if="selected.example.opts" class="kg-d-opts"><span v-for="o in selected.example.opts" :key="o">{{ o }}</span></div>
        <div class="kg-d-ans">✅ {{ selected.example.answer }} · {{ selected.example.path }}</div>
      </div>
      <div class="kg-d-acts">
        <button class="btn btn-pri" @click="askSelected()">💬 一键问 AI 讲透</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kg-wrap { position: relative; }
.kg-hd { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
.kg-tip { font-size: 12.5px; color: var(--text2); flex: 1; min-width: 200px; }
.kg-stat { font-size: 11.5px; color: var(--text3); white-space: nowrap; }
.kg-search { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.kg-search-in { flex: 1; padding: 7px 12px; border-radius: 10px; border: 1px solid var(--glass-border); background: var(--glass-bg); color: var(--text); font-size: 13px; }
.kg-search-n { font-size: 12px; color: var(--hud-cyan); }
.kg-search-x { border: 0; background: transparent; color: var(--text3); cursor: pointer; font-size: 13px; margin-left: 4px; }
.kg-canvas-wrap { position: relative; height: 66vh; min-height: 420px; border: 1px solid rgba(80, 200, 255, 0.14); border-radius: 14px; overflow: hidden; outline: none; background: radial-gradient(ellipse at 50% 45%, #0a1428 0%, #04070f 60%, #020409 100%); }
.kg-3d { width: 100%; height: 100%; }
.kg-3d canvas { display: block; }
.kg-loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--text2); font-size: 13px; }
.kg-tip-float { position: absolute; z-index: 5; max-width: 200px; padding: 7px 10px; border-radius: 10px; border: 1px solid rgba(34, 211, 238, 0.35); background: rgba(4, 10, 20, 0.94); color: var(--text); font-size: 11.5px; line-height: 1.5; pointer-events: none; box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5); }
.kg-tip-float b { color: var(--hud-cyan); margin-right: 6px; }
.kg-tip-float i { display: block; font-style: normal; color: var(--text3); font-size: 10.5px; }
.kg-tip-float span { display: block; margin-top: 2px; }
.kg-reset { position: absolute; right: 10px; top: 10px; width: 30px; height: 30px; border-radius: 50%; border: 1px solid var(--glass-border-hi); background: rgba(4, 10, 20, 0.85); color: #fff; font-size: 15px; cursor: pointer; z-index: 2; }
.kg-legend { position: absolute; left: 10px; bottom: 10px; display: flex; gap: 6px; flex-wrap: wrap; z-index: 2; max-width: 82%; }
.kg-lg { display: inline-flex; align-items: center; gap: 4px; font-size: 10.5px; color: var(--text3); background: rgba(4, 10, 20, 0.78); border: 1px solid transparent; border-radius: 999px; padding: 2px 8px; cursor: pointer; transition: all 0.2s; }
.kg-lg:hover { border-color: var(--glass-border-hi); color: var(--text2); }
.kg-lg.on { border-color: var(--hud-cyan); color: #fff; box-shadow: 0 0 10px rgba(34, 211, 238, 0.35); }
.kg-lg i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.kg-lg-pano { border-style: dashed; }
.kg-detail { margin-top: 10px; border: 1px solid rgba(34, 211, 238, 0.35); border-radius: 12px; padding: 10px 12px; background: var(--glass-bg); }
.kg-d-hd { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.kg-d-type { font-size: 13px; font-weight: 800; color: var(--hud-cyan); }
.kg-d-src { flex: 1; font-size: 11.5px; color: var(--text2); }
.kg-d-lit { font-size: 10.5px; color: #ffe9b8; border: 1px solid rgba(245, 197, 107, 0.4); border-radius: 999px; padding: 1px 8px; }
.kg-d-x { border: 0; background: transparent; color: var(--text3); font-size: 14px; cursor: pointer; }
.kg-d-tip { font-size: 12px; color: var(--text); margin: 6px 0; }
.kg-d-sec { margin: 6px 0; font-size: 12.5px; color: var(--text2); }
.kg-d-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 4px; }
.kg-d-tag { font-size: 11px; background: rgba(34, 211, 238, 0.1); color: #7dd3fc; border: 1px solid rgba(34, 211, 238, 0.25); padding: 2px 8px; border-radius: 999px; }
.kg-d-tag.danger { background: rgba(251, 113, 133, 0.1); color: #fda4af; border-color: rgba(251, 113, 133, 0.3); }
.kg-d-ol { margin: 4px 0 0 18px; padding: 0; }
.kg-d-ex { background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 10px; padding: 8px 10px; margin: 8px 0; font-size: 12.5px; }
.kg-d-opts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 5px; }
.kg-d-opts span { font-size: 11.5px; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--glass-border); border-radius: 6px; padding: 2px 8px; }
.kg-d-ans { margin-top: 5px; color: #86efac; font-weight: 700; }
.kg-d-acts { margin-top: 8px; }
/* 手机/窄屏适配（≤900px）：画布降高给下方详情留空间；图例缩小避免遮挡画布 */
@media (max-width: 900px) {
  .kg-canvas-wrap { height: 46vh; min-height: 240px; }
  .kg-hd { gap: 6px; }
  .kg-tip { font-size: 11.5px; }
  .kg-stat { font-size: 10.5px; }
  .kg-legend { left: 6px; bottom: 6px; gap: 4px; max-width: 94%; }
  .kg-lg { font-size: 9.5px; padding: 2px 6px; }
  .kg-reset { width: 28px; height: 28px; font-size: 14px; right: 6px; top: 6px; }
  .kg-tip-float { max-width: 150px; font-size: 11px; }
  .kg-detail { padding: 8px 10px; }
}
</style>
