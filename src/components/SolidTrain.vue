<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import {
  SOLIDS, NETS, SECTIONS, MISSING, viewQuiz, aiQuizPrompt,
  CUBE_NETS, buildFoldRig, applyFoldProgress, validateCubeNet, gridToNet, netSvgFromCells,
  voxelSvg, exposedFaces, fillToCuboid, boundingBox, describeVoxel, buildPolycube, solidViewPath,
  DIR_PRESETS, sliceAllRobust, boundsAll, loopsToSvg, sliceShapeLabel, sliceQuizAll, describeSlice,
  buildCutPlaneMesh, buildSliceFill, applyClipping, planeFromNormalDist,
  COMBO_PRESETS, buildCombo, randComboParts, computeMeshStats, eulerInfo, faceInfoFromHit, edgeInfoFromHit,
  makeFaceTexture, netLayout, netFaceAt, REAL_QUESTIONS, TIP_QA, computeFoldPlan, buildMultiFigures,
  pointSegDist, simplifyStroke, traceStrokePath
} from '../scene/solidTrain'
import { chatOnce, activeCfg } from '../api'
import { parseQuiz } from '../utils/quiz'
import { renderMd } from '../utils/renderMd'
import { showToast } from '../utils/toast'
import { addPoints as petAddPoints } from '../utils/pet'
import { store } from '../store'

const emit = defineEmits(['close', 'send-question'])

// ===== 状态 =====
const el = ref(null)
const solidIdx = ref(0)
const mode = ref('view') // view | custom | net | section | missing | ai
const is2d = ref(false)
const wireframe = ref(false)
const autoRotate = ref(true)
const quiz = ref(null)
// 立体训练生成的题也支持萌宠「读题」
watch(quiz, (qz) => {
  if (!qz) return
  const opts = (qz.opts || []).map((o, i) => String(i === 0 ? 'A' : String.fromCharCode(64 + i + 1)) + '、' + String((o && (o.text || o.t)) || o || '').replace(/<[^>]+>/g, ' ')).join('。')
  store.readCtx = { type: 'solid', title: '立体训练·' + (qz.type || ''), text: (String(qz.title || '').replace(/<[^>]+>/g, ' ').trim() + '。' + (opts ? '选项：' + opts + '。' : '')).slice(0, 1200) }
  store.curQ = { plate: '判断推理', kind: '立体训练', stem: qz.title, options: (qz.opts || []).map((o) => ({ t: (o && (o.text || o.t)) || o })), answer: qz.answer || '' }
})
const picked = ref('')
const aiQuiz = ref(null)
const aiBusy = ref(false)
const params = ref({})

// 自定义体素（x,y,z ∈ 0..2，3×3×3 编辑空间）
const customKeys = ref(new Set())
// 展开图折叠
const netTab = ref('fold') // fold | draw | quiz
const netIdx = ref(0)
const foldProg = ref(0)
const netKeys = ref(new Set())
const netResult = ref(null)
// 自由切割（切面刀）
const cutTab = ref('free') // free | quiz
const cutTarget = ref('solid') // solid | custom（切面对象：当前立体 / 我的自定义立体）
const cutDir = ref('h')
const cutAz = ref(0)
const cutEl = ref(90)
const cutPos = ref(50)
const cutOpen = ref(false)
const cutNormal = ref(new THREE.Vector3(0, 1, 0))
const cutDist = ref(0)
const cutLoops = ref([])
const cutSvg = ref('')
const cutLabel = ref('')
let cutPlane = null, cutFill = null
// 外观个性化
const pickColor = ref('')
const scaleVal = ref(1)
const styleMode = ref('solid') // solid | wire | glass
const rotSpeed = ref(1)
const gridOn = ref(true)
const gridSize = ref(12)
const lightMode = ref('std') // std | soft | vivid
const bgMode = ref('auto') // auto | black | deep | light
// 组合体
const comboParts = ref([])
const explodeVal = ref(0)
// 点击交互
const hitInfo = ref(null)
const hitObj = ref(null) // 高亮中的 mesh
const stats = ref(null)
let gridMesh = null, lightDir = null, lightDir2 = null
// 6×6 体素
const voxLayer = ref(0) // 当前编辑层 0..5
// 展开图涂色绘制
const paintNetIdx = ref(0)
const paintBrush = ref('#e11d2e')
const paintTool = ref('brush') // brush | line | fill | fillFace | erase
const paintFaces = ref([]) // [{fill, strokes:[{color,width,points,closed}], regions:[{color,cells}]}]
const paintSel = ref(0)
const paintFoldRig = ref(null)
const paintCanvasEl = ref(null)
const paintHist = ref([]) // 撤销栈
// AI 真题
const aiHard = ref(true)
const realShow = ref(false)
const aiImg = ref('')
const aiImgZoom = ref(false)
const aiFigures = ref([])
const aiMulti = ref(false)
const aiFigActive = ref(-1)
const aiRefPin = ref(false) // 自定义编辑器里固定显示参照图
// 空间想象训练
const trainDir = ref('')
const trainTarget = ref('')
const trainChecked = ref(false)
const trainPass = ref(false)
// 考点问答
const tipQuery = ref('')
const tipFiltered = ref([])

const solid = computed(() => SOLIDS[solidIdx.value] || SOLIDS[0])
const customCells = computed(() => [...customKeys.value].map(k => k.split(',').map(Number)))
const currentNet = computed(() => CUBE_NETS[netIdx.value] || CUBE_NETS[0])
const hasParams = computed(() => !!(solid.value.params && solid.value.params.length))

const VOXEL_PRESETS = SOLIDS.filter(s => s.cells)
const DRAW_CELLS = []
for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) DRAW_CELLS.push({ k: `${c},${r}` })

// ===== 3D 引擎 =====
let renderer = null, scene = null, camera = null, controls = null, group = null, raf = 0, disposeFn = null
let foldRig = null
const foldRigReady = ref(false)
let foldAnim = 0
let paramTimer = 0

function init3d() {
  if (!el.value || renderer) return
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(45, el.value.clientWidth / Math.max(1, el.value.clientHeight), 0.1, 100)
  camera.position.set(3, 2.4, 3.6)
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.localClippingEnabled = true
  renderer.setSize(el.value.clientWidth, el.value.clientHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  el.value.appendChild(renderer.domElement)
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 1.2
  controls.maxDistance = 12
  scene.add(new THREE.AmbientLight(0xffffff, 0.85))
  lightDir = new THREE.DirectionalLight(0xffffff, 1.1)
  lightDir.position.set(4, 6, 5)
  scene.add(lightDir)
  lightDir2 = new THREE.DirectionalLight(0x88ccff, 0.4)
  lightDir2.position.set(-4, -2, -4)
  scene.add(lightDir2)
  gridMesh = new THREE.GridHelper(4, 12, 0x2a4a6b, 0x1c3148)
  gridMesh.position.y = -1.4
  scene.add(gridMesh)
  applyLights()
  applyBg()
  // 点击交互：命中表面/棱线 → 细化信息
  renderer.domElement.addEventListener('pointerdown', onStageClick)
  renderer.domElement.addEventListener('pointermove', onStageMove)
  buildStage()
  function loop() {
    raf = requestAnimationFrame(loop)
    if (controls) controls.update()
    if (foldRig && !is2d.value) applyFoldProgress(foldRig, foldProg.value)
    if (group && autoRotate.value && !is2d.value) group.rotation.y += 0.004 * rotSpeed.value
    if (renderer && scene && camera) renderer.render(scene, camera)
  }
  loop()
  disposeFn = () => {
    cancelAnimationFrame(raf)
    cancelAnimationFrame(foldAnim)
    if (renderer && renderer.domElement) { renderer.domElement.removeEventListener('pointerdown', onStageClick); renderer.domElement.removeEventListener('pointermove', onStageMove) }
    if (cutPlane) { scene.remove(cutPlane); cutPlane = null }
    if (cutFill) { scene.remove(cutFill); cutFill = null }
    if (foldRig) { foldRig.dispose(); foldRig = null }
  foldRigReady.value = false
    if (controls) { controls.dispose(); controls = null }
    if (renderer) {
      renderer.dispose()
      if (renderer.domElement && renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement)
      renderer = null
    }
  }
}

function clearGroup() {
  if (!group) return
  scene.remove(group)
  const isFold = foldRig && group === foldRig.root
  if (!isFold) {
    group.traverse(o => {
      if (o.geometry) o.geometry.dispose()
      if (o.material) o.material.dispose()
    })
  }
  group = null
}

function buildStage() {
  if (!scene) return
  clearGroup()
  if (aiFigures.value.length && aiMulti.value) {
    group = buildMultiFigures(aiFigures.value)
  } else if (mode.value === 'custom') {
    const cells = customCells.value
    if (cells.length) group = buildPolycube(cells, 0x22d3ee)
  } else if (mode.value === 'combo') {
    if (comboParts.value.length) group = buildCombo(comboParts.value)
  } else if (mode.value === 'section' && cutTarget.value === 'custom' && customKeys.value.size) {
    const cells = customCells.value
    if (cells.length) group = buildPolycube(cells, 0x22d3ee)
  } else if (mode.value === 'net' && netTab.value !== 'quiz' && foldRig) {
    group = foldRig.root
  } else {
    group = solid.value.build(params.value)
  }
  if (group && wireframe.value && !(foldRig && group === foldRig.root)) {
    group.traverse(o => {
      if (o.isMesh) o.material = new THREE.MeshBasicMaterial({ color: 0x22d3ee, wireframe: true })
    })
  }
  if (group) {
    presentGroup(group)
    scene.add(group)
    refreshStats()
    if (mode.value === 'section' && cutTab.value === 'free' && cutOpen.value) {
      applyClipping(group, planeFromNormalDist(cutNormal.value, cutDist.value))
    }
  }
}

function setFoldRig(rig) {
  if (foldRig) foldRig.dispose()
  foldRig = rig
  foldRigReady.value = !!rig
}
// 进入「展开图」或切到「选图折叠」子页签时，确保折纸骨架已构建。
// 否则 buildStage() 会回退成普通立方体，表现为点「展开图」页签主画布不切换。
function ensureNetRig() {
  if (foldRig) return
  const nt = CUBE_NETS[netIdx.value] || CUBE_NETS[0]
  setFoldRig(buildFoldRig(nt.cells, nt.adjacency))
  foldProg.value = 0
}

// ===== 左侧演示区：截图保存 =====
function downloadDataUrl(dataUrl, name) {
  try {
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
  } catch (e) {}
}
function captureWithBg() {
  const hadBg = !!scene.background
  if (!hadBg) scene.background = new THREE.Color(0x0a1420)
  renderer.render(scene, camera)
  const url = renderer.domElement.toDataURL('image/png')
  if (!hadBg) scene.background = null
  renderer.render(scene, camera)
  return url
}
function shotAny() {
  if (!renderer || !scene || !camera) { showToast('3D 画布尚未就绪', 'error'); return }
  const url = captureWithBg()
  downloadDataUrl(url, '立体图推-任意视角-' + Date.now() + '.png')
  showToast('✅ 已保存当前视角截图（' + (is2d.value ? '2D' : '3D') + '）', 'success')
}
function shotThree() {
  if (!renderer || !scene || !camera || !controls) { showToast('3D 画布尚未就绪', 'error'); return }
  const savePos = camera.position.clone()
  const saveQ = camera.quaternion.clone()
  const saveTarget = controls.target.clone()
  const w = renderer.domElement.width, h = renderer.domElement.height
  const comp = document.createElement('canvas')
  comp.width = w * 3; comp.height = h
  const ctx = comp.getContext('2d')
  const dirs = [['前视图', [0, 0, 5]], ['俯视图', [0, 5, 0.01]], ['左视图', [-5, 0, 0]]]
  const hadBg = !!scene.background
  if (!hadBg) scene.background = new THREE.Color(0x0a1420)
  dirs.forEach(([name, pos], i) => {
    camera.position.set(pos[0], pos[1], pos[2])
    camera.lookAt(0, 0, 0)
    controls.target.set(0, 0, 0)
    controls.update()
    renderer.render(scene, camera)
    ctx.drawImage(renderer.domElement, i * w, 0, w, h)
    ctx.fillStyle = 'rgba(10,20,32,0.75)'
    ctx.fillRect(i * w, 0, w, 30)
    ctx.fillStyle = '#7dd3fc'
    ctx.font = 'bold 15px sans-serif'
    ctx.fillText(name, i * w + 12, 21)
  })
  ctx.strokeStyle = 'rgba(125,211,252,0.5)'
  ctx.lineWidth = 2
  for (let i = 1; i < 3; i++) { ctx.beginPath(); ctx.moveTo(i * w, 0); ctx.lineTo(i * w, h); ctx.stroke() }
  if (!hadBg) scene.background = null
  camera.position.copy(savePos)
  camera.quaternion.copy(saveQ)
  controls.target.copy(saveTarget)
  controls.update()
  renderer.render(scene, camera)
  const url = comp.toDataURL('image/png')
  downloadDataUrl(url, '立体图推-三视图-' + Date.now() + '.png')
  showToast('✅ 已保存三视图截图（前/俯/左）', 'success')
}

// ===== 外观个性化 / 展示 =====
let hlOriginal = null
function presentGroup(g) {
  if (!g || (foldRig && g === foldRig.root)) return
  if (pickColor.value) {
    g.traverse(o => {
      if (o.isMesh) o.material = new THREE.MeshPhongMaterial({ color: pickColor.value, transparent: true, opacity: 0.92, side: THREE.DoubleSide })
    })
  }
  if (styleMode.value === 'wire') {
    g.traverse(o => { if (o.isMesh) o.material = new THREE.MeshBasicMaterial({ color: pickColor.value || 0x22d3ee, wireframe: true }) })
  } else if (styleMode.value === 'glass') {
    g.traverse(o => { if (o.isMesh && o.material) { o.material.transparent = true; o.material.opacity = 0.35 } })
  }
  g.scale.setScalar(scaleVal.value || 1)
}
function applyLights() {
  if (!lightDir || !lightDir2) return
  if (lightMode.value === 'soft') { lightDir.intensity = 0.7; lightDir2.intensity = 0.3 }
  else if (lightMode.value === 'vivid') { lightDir.intensity = 1.6; lightDir2.intensity = 0.6 }
  else { lightDir.intensity = 1.1; lightDir2.intensity = 0.4 }
}
function applyBg() {
  if (!scene) return
  const map = { black: 0x05070d, deep: 0x0a1f33, light: 0xeef4fa }
  if (bgMode.value === 'auto') scene.background = null
  else scene.background = new THREE.Color(map[bgMode.value] || 0x05070d)
}
function applyGrid() {
  if (!gridMesh || !scene) return
  gridMesh.visible = gridOn.value
  if (gridOn.value) {
    const sz = Math.max(4, gridSize.value || 12)
    if (!gridMesh.userData.sz || gridMesh.userData.sz !== sz) {
      scene.remove(gridMesh)
      gridMesh.geometry.dispose()
      gridMesh = new THREE.GridHelper(sz, Math.min(80, sz * 4), 0x2a4a6b, 0x1c3148)
      gridMesh.position.y = -1.4
      gridMesh.userData.sz = sz
      scene.add(gridMesh)
    }
  }
}
const CAM_PRESETS = { front: [0, 0, 5], back: [0, 0, -5], top: [0, 5, 0.01], bottom: [0, -5, 0.01], left: [-5, 0, 0], right: [5, 0, 0], iso: [3.2, 2.6, 3.8] }
function setCameraPreset(k) {
  if (!camera || !controls) return
  const p = CAM_PRESETS[k]
  if (p) { camera.position.set(p[0], p[1], p[2]); controls.target.set(0, 0, 0); controls.update() }
}

// ===== 点击交互：表面 / 棱线 =====
function partNameOf(obj) {
  if (!group) return '立体'
  if (mode.value !== 'combo') return '当前立体'
  let o = obj
  while (o && o.parent && o.parent !== group) o = o.parent
  if (!o) return '立体'
  const k = o.name || ''
  const sol = SOLIDS.find(x => x.k === k)
  return sol ? sol.n : (k || '部件')
}
function highlightMesh(mesh) {
  clearHit()
  hlOriginal = []
  mesh.traverse(o => {
    if (o.isMesh && o.material) {
      hlOriginal.push({ o, m: o.material })
      o.material = new THREE.MeshBasicMaterial({ color: 0xffe082 })
    }
  })
  hitObj.value = mesh
}
function clearHit() {
  if (hlOriginal) { for (const it of hlOriginal) if (it.o && it.o.material) it.o.material = it.m; hlOriginal = null }
  hitObj.value = null
  hitInfo.value = null
}
function onStageClick(e) {
  if (is2d.value || !group || !renderer || !camera || mode.value === 'net') return
  const rect = renderer.domElement.getBoundingClientRect()
  const ndc = new THREE.Vector2(((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1, -((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1)
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(ndc, camera)
  const meshes = [], lines = []
  group.traverse(o => { if (o.isMesh) meshes.push(o); if (o.isLineSegments) lines.push(o) })
  const meshHits = raycaster.intersectObjects(meshes, false)
  // 棱线阈值调小：只有真正点到棱附近才报"棱"，否则优先报"面"
  raycaster.params.Line.threshold = 0.015
  const lineHits = raycaster.intersectObjects(lines, false)
  if (!meshHits.length && !lineHits.length) { clearHit(); return }
  const cands = []
  if (meshHits.length) cands.push({ d: meshHits[0].distance, kind: 'mesh', hit: meshHits[0] })
  if (lineHits.length) cands.push({ d: lineHits[0].distance, kind: 'line', hit: lineHits[0] })
  cands.sort((a, b) => a.d - b.d)
  const top = cands[0]
  if (top.kind === 'mesh') {
    const info = faceInfoFromHit(top.hit.object, top.hit.faceIndex)
    if (!info) return
    highlightMesh(top.hit.object)
    hitInfo.value = {
      type: 'face',
      part: partNameOf(top.hit.object),
      shape: sliceShapeLabel([info.vertices]),
      count: info.count,
      area: info.area.toFixed(2),
      normal: info.normal.toArray().map(v => Number(v.toFixed(2))).join(', '),
      triCount: info.triCount
    }
  } else {
    const info = edgeInfoFromHit(top.hit.object, top.hit.point)
    if (!info) return
    hitInfo.value = { type: 'edge', part: partNameOf(top.hit.object), len: info.len.toFixed(2) }
  }
}
function cutAlongFace() {
  const info = hitInfo.value
  if (!info || info.type !== 'face') { showToast('请先在 3D 画布上点击一个表面', 'error'); return }
  const ns = info.normal.split(',').map(Number)
  if (ns.length !== 3 || ns.every(v => !isFinite(v))) { showToast('无法读取面法向', 'error'); return }
  cutNormal.value = new THREE.Vector3(ns[0], ns[1], ns[2]).normalize()
  cutPos.value = 50
  cutTarget.value = 'solid'
  mode.value = 'section'
  cutTab.value = 'free'
  resetQuiz()
  nextTick(() => { buildStage(); computeCut() })
}

// ===== 实时统计 / 知识卡 / 综合考法 =====
function refreshStats() {
  if (!group) { stats.value = null; return }
  const st = computeMeshStats(group)
  const eu = eulerInfo(st)
  stats.value = { ...st, area: st.area, vef: eu.vef, eulerOk: eu.ok }
}
const cardText = ref('')
function genKnowledgeCard() {
  const st = stats.value
  if (!st) { showToast('请先构建立体', 'error'); return }
  const nm = stageLabel.value
  const eu = st.eulerOk ? '✅ V-E+F = ' + st.vef + '，符合欧拉公式（闭合多面体）' : 'V-E+F = ' + st.vef + '（组合体非单闭合）'
  cardText.value =
    '📚 立体知识卡 · ' + nm + '\n' +
    '· 面（三角面）' + st.faces + ' 个\n' +
    '· 棱（唯一线段）' + st.edges + ' 条\n' +
    '· 顶点（唯一坐标点）' + st.verts + ' 个\n' +
    '· 表面积 ≈ ' + st.area.toFixed(2) + '\n' +
    '· ' + eu + '\n' +
    '💡 口诀：求面数/棱数/顶点数 → 数清楚后用欧拉公式交叉验证；组合体拆开逐个统计再相加。'
}
function genStatsQuiz() {
  resetQuiz()
  const st = stats.value
  if (!st) { showToast('请先构建立体', 'error'); return }
  const items = [
    { q: '该立体共有多少个三角面？', a: st.faces, pool: [st.faces, Math.max(1, Math.round(st.faces * 0.8)), Math.max(2, Math.round(st.faces * 1.2)), st.faces + 4] },
    { q: '该立体外露的唯一顶点有多少个？', a: st.verts, pool: [st.verts, Math.max(1, st.verts - 2), st.verts + 4, Math.max(1, Math.round(st.verts / 2))] },
    { q: '该立体共有多少条棱（唯一线段）？', a: st.edges, pool: [st.edges, Math.max(1, st.edges - 4), Math.max(1, Math.round(st.edges * 0.8)), st.edges + 6] }
  ]
  const item = items[Math.floor(Math.random() * items.length)]
  const wrongs = shuffle(item.pool.filter(v => v !== item.a)).slice(0, 3)
  const all = shuffle([item.a, ...wrongs])
  const opts = all.map((v, i) => ({ k: String.fromCharCode(65 + i), text: String(v), isAns: v === item.a }))
  quiz.value = { type: 'stats', opts, answer: String(item.a), title: item.q, extra: '统计题 · ' + stageLabel.value }
}
function mixedQuiz() {
  if (mode.value === 'combo') { genStatsQuiz(); return }
  const types = ['view', 'net', 'section', 'missing']
  const t = types[Math.floor(Math.random() * types.length)]
  if (t === 'view') genViewQuiz()
  else if (t === 'net') { mode.value = 'net'; netTab.value = 'quiz'; genNetQuiz() }
  else if (t === 'section') { mode.value = 'section'; cutTab.value = 'quiz'; genSectionQuiz() }
  else genMissingQuiz()
}

// ===== 组合体 =====
function applyComboPreset(i) {
  const pre = COMBO_PRESETS[i]
  if (!pre) return
  comboParts.value = JSON.parse(JSON.stringify(pre.parts))
  clearHit(); buildStage()
}
function randCombo() {
  comboParts.value = randComboParts(3 + Math.floor(Math.random() * 2))
  clearHit(); buildStage()
}
const addPartKey = ref('cube')
function addComboPart() {
  const sol = SOLIDS.find(x => x.k === addPartKey.value)
  if (!sol) return
  comboParts.value.push({ kind: 'solid', k: sol.k, color: 0x22d3ee, scale: 0.8, offset: [0, comboParts.value.length * 0.9, 0] })
  clearHit(); buildStage()
}
function removeComboPart(i) { comboParts.value.splice(i, 1); clearHit(); buildStage() }
function moveComboPart(i, d) {
  const j = i + d
  if (j < 0 || j >= comboParts.value.length) return
  const arr = comboParts.value.slice()
  const t = arr[i]; arr[i] = arr[j]; arr[j] = t
  comboParts.value = arr
  clearHit(); buildStage()
}
function exportCombo() {
  const txt = JSON.stringify(comboParts.value)
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(() => showToast('✅ 组合已复制到剪贴板', 'success')).catch(() => showToast('复制失败：' + txt.slice(0, 60), 'info'))
  } else showToast('复制失败：' + txt.slice(0, 60), 'info')
}
function importCombo() {
  if (navigator.clipboard && navigator.clipboard.readText) {
    navigator.clipboard.readText().then(txt => {
      try {
        const arr = JSON.parse(txt)
        if (!Array.isArray(arr) || !arr.length) throw new Error('empty')
        comboParts.value = arr
        clearHit(); buildStage(); showToast('✅ 已导入组合（' + arr.length + ' 部件）', 'success')
      } catch (e) { showToast('剪贴板不是有效的组合数据', 'error') }
    }).catch(() => showToast('无法读取剪贴板', 'error'))
  } else showToast('当前环境不支持读取剪贴板', 'error')
}
function setExplode(v) {
  explodeVal.value = v
  if (!group || !comboParts.value.length) return
  group.children.forEach((child, i) => {
    const p = comboParts.value[i]
    if (!child || !p) return
    const base = child.userData.baseOffset || [0, 0, 0]
    const dir = new THREE.Vector3(base[0], base[1], base[2])
    if (dir.length() < 0.01) dir.set(0, 1, 0)
    dir.normalize()
    child.position.set(base[0] + dir.x * v, base[1] + dir.y * v, base[2] + dir.z * v)
  })
}

// ===== 展开图涂色 / 自由绘制（真题空间重构训练） =====
const PAINT_GRID = 48 // 区域填色网格分辨率

function initPaint() {
  const nt = CUBE_NETS[paintNetIdx.value] || CUBE_NETS[0]
  paintFaces.value = nt.cells.map(() => ({ fill: '#334155', strokes: [], regions: [] }))
  paintSel.value = 0
  paintFoldRig.value = null
  paintHist.value = []
  nextTick(() => renderPaintCanvas())
}
function pickPaintNet(i) {
  paintNetIdx.value = i
  initPaint()
}
function renderPaintCanvas() {
  const cv = paintCanvasEl.value
  if (!cv) return
  const nt = CUBE_NETS[paintNetIdx.value] || CUBE_NETS[0]
  const { cells, cols, rows } = netLayout(nt.cells)
  const size = 400
  cv.width = size; cv.height = size
  const ctx = cv.getContext('2d')
  ctx.clearRect(0, 0, size, size)
  const s = Math.min(size / Math.max(cols, rows), 96)
  const ox = (size - cols * s) / 2, oy = (size - rows * s) / 2
  cells.forEach(([c, r], i) => {
    const x = ox + c * s, y = oy + r * s
    const f = paintFaces.value[i] || { fill: '#334155', strokes: [], regions: [] }
    ctx.fillStyle = f.fill
    ctx.fillRect(x, y, s, s)
    // 封闭区域填色
    for (const rg of f.regions || []) {
      ctx.fillStyle = rg.color
      for (const [cx, cy] of rg.cells) {
        ctx.fillRect(x + cx / PAINT_GRID * s, y + cy / PAINT_GRID * s, s / PAINT_GRID + 0.6, s / PAINT_GRID + 0.6)
      }
    }
    ctx.strokeStyle = paintSel.value === i ? '#ffd166' : 'rgba(255,255,255,0.5)'
    ctx.lineWidth = paintSel.value === i ? 4 : 2
    ctx.strokeRect(x, y, s, s)
    // 序号
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.font = 'bold 16px sans-serif'
    ctx.fillText(String(i + 1), x + 6, y + 20)
    // 平滑笔画（直线/曲线自动识别）
    for (const st of f.strokes || []) {
      if (!st.points || st.points.length < 2) continue
      ctx.strokeStyle = st.color
      ctx.lineWidth = (st.width || 3) * (s / 128)
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      traceStrokePath(ctx, st.points.map(q => [x + q[0] * s, y + q[1] * s]), !!st.closed)
      ctx.stroke()
    }
  })
  // 正在绘制的实时笔迹
  if (paintDrawing && paintStroke && paintStroke.points.length > 1) {
    const f = paintFaces.value[paintSel.value]
    const cc = nt.cells[paintSel.value]
    if (f && cc) {
      const x = ox + cc[0] * s, y = oy + cc[1] * s
      ctx.strokeStyle = paintStroke.color
      ctx.lineWidth = (paintStroke.width || 3) * (s / 128)
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      traceStrokePath(ctx, paintStroke.points.map(q => [x + q[0] * s, y + q[1] * s]), false)
      ctx.stroke()
    }
  }
}
function paintHit(px, py) {
  const nt = CUBE_NETS[paintNetIdx.value] || CUBE_NETS[0]
  const cv = paintCanvasEl.value
  if (!cv) return null
  const rect = cv.getBoundingClientRect()
  const sx = (px - rect.left) / rect.width * cv.width
  const sy = (py - rect.top) / rect.height * cv.height
  const hit = netFaceAt(nt.cells, sx, sy, cv.width)
  return hit
}
let paintDrawing = false, paintStroke = null
function onPaintDown(e) {
  const cv = paintCanvasEl.value
  if (!cv) return
  e.preventDefault()
  const rect = cv.getBoundingClientRect()
  const px = e.clientX, py = e.clientY
  const hit = paintHit(px, py)
  if (!hit) return
  paintSel.value = hit.idx
  const lx = (px - rect.left) / rect.width * cv.width
  const ly = (py - rect.top) / rect.height * cv.height
  const fx = (lx - hit.x) / hit.s, fy = (ly - hit.y) / hit.s
  if (paintTool.value === 'fill') {
    const n = paintFillRegion(paintFaces.value[hit.idx], fx, fy)
    renderPaintCanvas()
    if (n) showToast('🪣 已填色 ' + n + ' 个区域格', 'success')
    else showToast('点击处被笔画/已填色区域挡住，换个位置点', 'info')
    return
  }
  if (paintTool.value === 'fillFace') {
    const f = paintFaces.value[hit.idx]
    paintHist.value.push({ face: hit.idx, kind: 'fillFace', before: f.fill })
    f.fill = paintBrush.value
    renderPaintCanvas()
    return
  }
  if (paintTool.value === 'erase') {
    paintEraseAt(paintFaces.value[hit.idx], hit.idx, fx, fy)
    renderPaintCanvas()
    return
  }
  paintDrawing = true
  paintStroke = { color: paintBrush.value, width: 3, points: [[fx, fy]] }
}
function onPaintMove(e) {
  if (!paintDrawing || !paintStroke || !paintCanvasEl.value) return
  e.preventDefault()
  const cv = paintCanvasEl.value
  const rect = cv.getBoundingClientRect()
  const hit = paintHit(e.clientX, e.clientY)
  if (!hit || hit.idx !== paintSel.value) return
  const lx = (e.clientX - rect.left) / rect.width * cv.width
  const ly = (e.clientY - rect.top) / rect.height * cv.height
  const fx = (lx - hit.x) / hit.s, fy = (ly - hit.y) / hit.s
  const last = paintStroke.points[paintStroke.points.length - 1]
  if (Math.hypot(fx - last[0], fy - last[1]) < 0.004) return
  paintStroke.points.push([fx, fy])
  renderPaintCanvas()
}
function onPaintUp() {
  if (paintDrawing && paintStroke) finalizePaintStroke()
  paintDrawing = false
  paintStroke = null
}
// 松手后：简化 + 自动识别直线/封闭 → 存为一条平滑笔画
function finalizePaintStroke() {
  const face = paintFaces.value[paintSel.value]
  if (!face) return
  const raw = paintStroke.points
  if (raw.length < 2) return
  let pts = simplifyStroke(raw, 0.012)
  const lenAll = Math.hypot(pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1])
  const d01 = Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1])
  const closed = d01 < Math.max(0.03, lenAll * 0.12) // 首尾接近 → 自动闭合
  if (closed) pts[pts.length - 1] = pts[0].slice()
  if (pts.length > 2) {
    const a0 = pts[0], a1 = pts[pts.length - 1]
    const lineLen = Math.hypot(a1[0] - a0[0], a1[1] - a0[1])
    let md = 0
    for (let i = 1; i < pts.length - 1; i++) md = Math.max(md, pointSegDist(pts[i], a0, a1))
    // 按"最大偏移/线长"比例判断：接近直线 → 自动规整为完美直线
    if (md < Math.max(0.012, lineLen * 0.06)) pts = [a0.slice(), a1.slice()]
  }
  if (paintTool.value === 'line') pts = [pts[0].slice(), pts[pts.length - 1].slice()] // 直线工具强制直线
  const st = { color: paintBrush.value, width: 3, points: pts, closed }
  face.strokes.push(st)
  paintHist.value.push({ face: paintSel.value, kind: 'stroke', stroke: st })
  renderPaintCanvas()
}
// 区域填色：以笔画为墙做洪泛填充（48×48 网格），封闭区域自动被填
function paintFillRegion(face, fx, fy) {
  const gx = Math.max(0, Math.min(PAINT_GRID - 1, Math.round(fx * PAINT_GRID)))
  const gy = Math.max(0, Math.min(PAINT_GRID - 1, Math.round(fy * PAINT_GRID)))
  const walls = new Uint8Array(PAINT_GRID * PAINT_GRID)
  const mark = (x, y, v) => { if (x >= 0 && y >= 0 && x < PAINT_GRID && y < PAINT_GRID) walls[y * PAINT_GRID + x] = v }
  const raster = (a, b, w) => {
    let x0 = Math.round(a[0] * PAINT_GRID), y0 = Math.round(a[1] * PAINT_GRID)
    let x1 = Math.round(b[0] * PAINT_GRID), y1 = Math.round(b[1] * PAINT_GRID)
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0)
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1
    let err = dx - dy, x = x0, y = y0
    while (true) {
      for (let ox = -w + 1; ox < w; ox++) for (let oy = -w + 1; oy < w; oy++) mark(x + ox, y + oy, 1)
      if (x === x1 && y === y1) break
      const e2 = 2 * err
      if (e2 > -dy) { err -= dy; x += sx }
      if (e2 < dx) { err += dx; y += sy }
    }
  }
  for (const st of face.strokes || []) {
    if (!st.points || st.points.length < 2) continue
    const w = Math.max(1, Math.round((st.width || 3) / 128 * PAINT_GRID))
    for (let i = 0; i < st.points.length - 1; i++) raster(st.points[i], st.points[i + 1], w)
    if (st.closed) raster(st.points[st.points.length - 1], st.points[0], w)
  }
  for (const rg of face.regions || []) for (const [cx, cy] of rg.cells) mark(cx, cy, 1)
  if (walls[gy * PAINT_GRID + gx]) return 0
  const filled = new Uint8Array(PAINT_GRID * PAINT_GRID)
  const q = [[gx, gy]]
  filled[gy * PAINT_GRID + gx] = 1
  while (q.length) {
    const [cx, cy] = q.pop()
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy
      if (nx < 0 || ny < 0 || nx >= PAINT_GRID || ny >= PAINT_GRID) continue
      if (filled[ny * PAINT_GRID + nx] || walls[ny * PAINT_GRID + nx]) continue
      filled[ny * PAINT_GRID + nx] = 1
      q.push([nx, ny])
    }
  }
  const cells = []
  for (let y = 0; y < PAINT_GRID; y++) for (let x = 0; x < PAINT_GRID; x++) if (filled[y * PAINT_GRID + x]) cells.push([x, y])
  if (!cells.length) return 0
  face.regions.push({ color: paintBrush.value, cells })
  paintHist.value.push({ face: paintSel.value, kind: 'region' })
  return cells.length
}
// 擦除：优先擦最近的笔画，否则清空该面
function paintEraseAt(face, fi, fx, fy) {
  let best = -1, bestD = 0.07
  ;(face.strokes || []).forEach((st, si) => {
    for (const [px, py] of st.points) {
      const d = Math.hypot(px - fx, py - fy)
      if (d < bestD) { bestD = d; best = si }
    }
  })
  if (best >= 0) {
    const [removed] = face.strokes.splice(best, 1)
    paintHist.value.push({ face: fi, kind: 'eraseStroke', idx: best, stroke: removed })
  } else {
    paintHist.value.push({ face: fi, kind: 'eraseAll', strokes: face.strokes.slice(), regions: face.regions.slice() })
    face.strokes = []
    face.regions = []
  }
}
function paintUndo() {
  const h = paintHist.value.pop()
  if (!h) { showToast('没有可撤销的操作', 'info'); return }
  if (h.kind === 'clearAll') {
    paintFaces.value = h.faces.map(f => ({ fill: f.fill, strokes: f.strokes.slice(), regions: f.regions.slice() }))
    renderPaintCanvas()
    return
  }
  const f = paintFaces.value[h.face]
  if (!f) return
  if (h.kind === 'stroke') { const i = f.strokes.indexOf(h.stroke); if (i >= 0) f.strokes.splice(i, 1) }
  else if (h.kind === 'region') f.regions.pop()
  else if (h.kind === 'eraseStroke' && h.idx != null) f.strokes.splice(Math.min(h.idx, f.strokes.length), 0, h.stroke)
  else if (h.kind === 'eraseAll') { f.strokes = h.strokes; f.regions = h.regions }
  else if (h.kind === 'fillFace') f.fill = h.before
  renderPaintCanvas()
}
function paintClearFace() {
  const f = paintFaces.value[paintSel.value]
  if (f) {
    paintHist.value.push({ face: paintSel.value, kind: 'eraseAll', strokes: f.strokes.slice(), regions: f.regions.slice() })
    f.fill = '#334155'; f.strokes = []; f.regions = []
  }
  renderPaintCanvas()
}
function paintClearAll() {
  paintHist.value.push({ kind: 'clearAll', faces: paintFaces.value.map(f => ({ fill: f.fill, strokes: f.strokes.slice(), regions: f.regions.slice() })) })
  paintFaces.value = paintFaces.value.map(() => ({ fill: '#334155', strokes: [], regions: [] }))
  renderPaintCanvas()
}
function paintExport() {
  const cv = paintCanvasEl.value
  if (!cv) return
  downloadDataUrl(cv.toDataURL('image/png'), '展开图涂色-' + Date.now() + '.png')
  showToast('💾 涂色展开图已保存为 PNG', 'success')
}
function paintFold() {
  const nt = CUBE_NETS[paintNetIdx.value] || CUBE_NETS[0]
  const textures = paintFaces.value.map(f => makeFaceTexture(f.fill, f.strokes, 256, f.regions))
  setFoldRig(buildFoldRig(nt.cells, nt.adjacency, 0x94a3b8, textures))
  paintFoldRig.value = true
  foldProg.value = 0
  buildStage()
  nextTick(() => playFold())
}
function paintQuiz() {
  resetQuiz()
  const nt = CUBE_NETS[paintNetIdx.value] || CUBE_NETS[0]
  // 随机挑两个相邻面，问折叠后是否相邻；或挑相对面
  const qs = []
  for (let i = 0; i < nt.cells.length; i++) {
    for (const [a, b] of nt.adjacency) {
      if (a === i) qs.push([a, b])
      if (b === i) qs.push([b, a])
    }
  }
  const faceName = i => '第' + (i + 1) + '面(' + (paintFaces.value[i] ? paintFaces.value[i].fill : '') + ')'
  const isAdj = qs.some(([a, b]) => a === paintSel.value || b === paintSel.value)
  const other = qs.find(([a, b]) => a === paintSel.value || b === paintSel.value)
  const otherFace = other ? (other[0] === paintSel.value ? other[1] : other[0]) : null
  // 用真实相对面判定：computeFoldPlan 的 normals 判断相对
  const plan = computeFoldPlan({ cells: nt.cells, adjacency: nt.adjacency })
  const myNormal = plan.normals[paintSel.value].join(',')
  const oppIdx = plan.normals.findIndex((n, i) => i !== paintSel.value && n.join(',') === myNormal.split(',').map(v => -Number(v)).join(','))
  const opts = []
  const isOpp = oppIdx >= 0
  opts.push({ k: 'A', text: (isAdj ? '相邻' : isOpp ? '相对' : '无法确定'), isAns: true })
  opts.push({ k: 'B', text: (isAdj ? '相对' : isOpp ? '相邻' : '相邻'), isAns: false })
  opts.push({ k: 'C', text: '不共边也不相对', isAns: false })
  const all = shuffle(opts)
  quiz.value = { type: 'paint', opts: all, answer: all.find(o => o.isAns).text, title: '把涂好色的展开图折成正方体，「' + faceName(paintSel.value) + '」与「' + (isAdj && otherFace != null ? faceName(otherFace) : (isOpp ? '它的对面' : '任一其它面')) + '」折叠后是？', extra: '空间重构 · 展开图涂色' }
}

// ===== 空间想象力训练：旋转到目标视角 =====
const TRAIN_DIRS = [
  { k: 'front', t: '正面', cam: [0, 0, 5], label: '从正前方看' },
  { k: 'top', t: '俯视', cam: [0, 5, 0.01], label: '从正上方俯视' },
  { k: 'left', t: '左视', cam: [-5, 0, 0], label: '从左方看' },
  { k: 'right', t: '右视', cam: [5, 0, 0], label: '从右方看' },
  { k: 'iso', t: '等轴', cam: [3.2, 2.6, 3.8], label: '从右前上方看（等轴测）' }
]
function startTrain() {
  const d = TRAIN_DIRS[Math.floor(Math.random() * TRAIN_DIRS.length)]
  trainDir.value = d.k
  trainTarget.value = d.label
  trainChecked.value = false
  trainPass.value = false
  // 先随机转一下当前立体，让用户自己转回去
  if (group) group.rotation.y = Math.random() * Math.PI * 2
  nextTick(() => { if (renderer && camera) setCameraPreset('iso') })
  showToast('🧠 请旋转 3D 立体，让它正好呈现「' + d.label + '」的样子', 'info')
}
function checkTrain() {
  if (!trainDir.value) { showToast('先点「开始训练」', 'error'); return }
  const d = TRAIN_DIRS.find(x => x.k === trainDir.value)
  if (!d || !camera) return
  // 相机位置方向 vs 目标方向夹角
  const target = new THREE.Vector3(d.cam[0], d.cam[1], d.cam[2])
  const camPos = camera.position.clone()
  const angle = camPos.angleTo(target) * 180 / Math.PI
  const pass = angle < 25
  trainChecked.value = true
  trainPass.value = pass
  if (pass) { showToast('🎉 视角正确！空间感很好！', 'success'); petAddPoints(1) }
  else showToast('还差一点：当前相机与目标视角夹角 ' + angle.toFixed(0) + '°，继续旋转', 'error')
}

// ===== 考点问答与技巧 =====
function filterTips() {
  const k = tipQuery.value.trim().toLowerCase()
  tipFiltered.value = k ? TIP_QA.filter(t => (t.q + t.a).toLowerCase().includes(k)) : TIP_QA
}
function askTipAI() {
  const q = tipQuery.value.trim()
  if (!q) { showToast('先输入你的问题', 'error'); return }
  emit('send-question', '【立体图推技巧问答】' + q + '\n请用公考图形推理名师方法，简明回答，并给出记忆口诀。')
  showToast('💬 已发到主对话，等待 AI 回答', 'info')
}

// ===== 悬停高亮 =====
let hoverMeshObj = null
function onStageMove(e) {
  if (is2d.value || !group || !renderer || !camera || mode.value === 'net') return
  const rect = renderer.domElement.getBoundingClientRect()
  const ndc = new THREE.Vector2(((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1, -((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1)
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(ndc, camera)
  const meshes = []
  group.traverse(o => { if (o.isMesh) meshes.push(o) })
  const hits = raycaster.intersectObjects(meshes, false)
  const target = hits.length ? hits[0].object : null
  if (target !== hoverMeshObj) {
    if (hoverMeshObj && hoverMeshObj.userData._hoverMat) {
      hoverMeshObj.traverse(o => { if (o.isMesh && o.userData._origMat) o.material = o.userData._origMat })
      hoverMeshObj.userData._hoverMat = null
    }
    if (target) {
      target.userData._hoverMat = true
      target.traverse(o => {
        if (o.isMesh && o.material && !o.userData._origMat) {
          o.userData._origMat = o.material
          o.material = new THREE.MeshBasicMaterial({ color: 0xffd166 })
        }
      })
    }
    hoverMeshObj = target
    renderer.domElement.style.cursor = target ? 'pointer' : 'grab'
  }
}

// 折叠动画
function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2 }
function playFold() {
  cancelAnimationFrame(foldAnim)
  const t0 = performance.now(), dur = 900
  const step = now => {
    const t = Math.min(1, (now - t0) / dur)
    foldProg.value = easeInOut(t)
    if (t < 1) foldAnim = requestAnimationFrame(step)
  }
  foldAnim = requestAnimationFrame(step)
}
function playUnfold() {
  cancelAnimationFrame(foldAnim)
  const t0 = performance.now(), dur = 900
  const step = now => {
    const t = Math.min(1, (now - t0) / dur)
    foldProg.value = 1 - easeInOut(t)
    if (t < 1) foldAnim = requestAnimationFrame(step)
  }
  foldAnim = requestAnimationFrame(step)
}

// ===== 图形切换 / 参数 =====
function initParams(s) {
  const p = {}
  if (s.params) for (const pr of s.params) p[pr.k] = pr.def
  params.value = p
}
initParams(solid.value)

function nextSolid() {
  solidIdx.value = (solidIdx.value + 1) % SOLIDS.length
  resetQuiz()
}
function toggleMode(m) {
  mode.value = m
  resetQuiz()
  if (m === 'custom') {
    if (!customKeys.value.size) applyPreset('stairs')
    else nextTick(() => buildStage())
  } else if (m === 'combo') {
    if (!comboParts.value.length) applyComboPreset(0)
    else nextTick(() => buildStage())
  } else if (m === 'net') {
    nextTick(() => {
      ensureNetRig()
      buildStage()
    })
  } else if (m === 'ai') {
    genAiQuiz()
  } else if (m === 'tip') {
    filterTips()
    nextTick(() => buildStage())
  } else if (m === 'section') {
    nextTick(() => {
      buildStage()
      if (cutTab.value === 'free') computeCut()
      else updateCutPlane()
    })
  } else {
    nextTick(() => buildStage())
    updateCutPlane()
  }
}
function resetQuiz() {
  quiz.value = null
  picked.value = ''
  aiQuiz.value = null
}

// ===== 视图题 =====
function genViewQuiz() {
  resetQuiz()
  const q = viewQuiz(solid.value)
  const opts = q.opts.map((o, i) => ({ k: String.fromCharCode(65 + i), svg: o.d, isAns: o.d === q.answer }))
  quiz.value = { type: 'view', dir: q.dir, opts, answer: q.answer, title: '从「' + q.dir.label + '」看，该立体图形的视图是？' }
}

// ===== 展开图选择题（经典 SVG） =====
function genNetQuiz() {
  resetQuiz()
  if (!NETS[solid.value.k]) {
    showToast('「' + solid.value.n + '」暂无展开图题库，可切到 正方体/长方体/圆柱 练习', 'error')
    return
  }
  const net = NETS[solid.value.k] || NETS.cube
  const tagged = net.right.map(d => ({ d, isAns: true })).concat(net.wrong.map(d => ({ d, isAns: false })))
  const order = shuffle(tagged.slice(0, 4))
  const opts = order.map((o, i) => ({ k: String.fromCharCode(65 + i), svg: o.d, isAns: o.isAns }))
  quiz.value = { type: 'net', opts, answer: order.find(o => o.isAns).d, title: '下面哪个展开图能折成「' + solid.value.n + '」？' }
}

// ===== 切面题 =====
function genSectionQuiz() {
  resetQuiz()
  const pool = SECTIONS.filter(s => s.solid === solid.value.k)
  const item = pool.length ? pool[Math.floor(Math.random() * pool.length)] : SECTIONS[Math.floor(Math.random() * SECTIONS.length)]
  const all = shuffle([item.ok, ...item.wrongs])
  const opts = all.map((t, i) => ({ k: String.fromCharCode(65 + i), text: t, isAns: t === item.ok }))
  quiz.value = { type: 'section', opts, answer: item.ok, title: item.q, extra: item.n }
}

// ===== 补缺题 =====
function genMissingQuiz() {
  resetQuiz()
  const pool = MISSING.filter(m => m.solid === solid.value.k)
  const item = pool.length ? pool[Math.floor(Math.random() * pool.length)] : MISSING[Math.floor(Math.random() * MISSING.length)]
  const all = shuffle([item.ok, ...item.wrongs])
  const opts = all.map((t, i) => ({ k: String.fromCharCode(65 + i), text: t, isAns: t === item.ok }))
  quiz.value = { type: 'missing', opts, answer: item.ok, title: item.q, extra: item.n }
}

function md(t) { return renderMd(t) }
function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function pick(k) {
  if (!quiz.value || picked.value) return
  picked.value = k
  const opt = quiz.value.opts.find(o => o.k === k)
  const ok = opt && opt.isAns
  if (ok) {
    showToast('✅ 回答正确！', 'success')
    petAddPoints(1)
  } else {
    showToast('❌ 选错了，正确答案是 ' + String.fromCharCode(65 + quiz.value.opts.findIndex(o => o.isAns)), 'error')
  }
}

// ===== 自定义体素编辑器（6×6×6） =====
const VOX_N = 6
function layerCells(ly) {
  const out = []
  for (let z = 0; z < VOX_N; z++) for (let x = 0; x < VOX_N; x++) out.push({ k: `${x},${ly},${z}`, x, z })
  return out
}
function toggleVox(k) {
  const s = new Set(customKeys.value)
  if (s.has(k)) s.delete(k); else s.add(k)
  customKeys.value = s
  buildStage()
}
function clearVox() {
  customKeys.value = new Set()
  buildStage()
}
function fillLayer(ly) {
  const s = new Set(customKeys.value)
  for (let z = 0; z < VOX_N; z++) for (let x = 0; x < VOX_N; x++) s.add(`${x},${ly},${z}`)
  customKeys.value = s
  buildStage()
}
function randomVox() {
  const n = 8 + Math.floor(Math.random() * 22)
  const cells = []
  let guard = 0
  while (cells.length < n && guard++ < 300) {
    const x = Math.floor(Math.random() * VOX_N), y = Math.floor(Math.random() * VOX_N), z = Math.floor(Math.random() * VOX_N)
    const k = `${x},${y},${z}`
    if (!cells.includes(k)) cells.push(k)
  }
  if (!cells.some(k => Number(k.split(',')[1]) === 0)) {
    const [x, , z] = cells[0].split(',')
    cells[0] = `${x},0,${z}`
  }
  customKeys.value = new Set(cells)
  buildStage()
}
function mirrorVox(axis) {
  const s = new Set()
  for (const c of customCells.value) {
    const [x, y, z] = c
    if (axis === 'x') s.add(`${VOX_N - 1 - x},${y},${z}`)
    else s.add(`${x},${y},${VOX_N - 1 - z}`)
  }
  customKeys.value = s
  buildStage()
}
function mirrorY() {
  const s = new Set()
  for (const c of customCells.value) s.add(`${c[0]},${VOX_N - 1 - c[1]},${c[2]}`)
  customKeys.value = s
  buildStage()
}
function applyPreset(k) {
  const s = SOLIDS.find(x => x.k === k && x.cells)
  if (!s) return
  customKeys.value = new Set(s.cells.map(c => c.join(',')))
  netResult.value = null
  buildStage()
}
function adjacentEmpty(cells) {
  const set = new Set(cells.map(c => c.join(',')))
  const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]
  for (const [x, y, z] of cells) for (const [dx, dy, dz] of dirs) {
    const nx = x + dx, ny = y + dy, nz = z + dz
    const k = `${nx},${ny},${nz}`
    if (!set.has(k) && nx >= 0 && nx < VOX_N && ny >= 0 && ny < VOX_N && nz >= 0 && nz < VOX_N) return [nx, ny, nz]
  }
  return null
}
function setVoxLayer(ly) { voxLayer.value = Math.max(0, Math.min(VOX_N - 1, ly)) }

// ===== 自定义立体自动出题 =====
function genCustomQuiz() {
  resetQuiz()
  const cells = customCells.value
  if (!cells.length) { showToast('请先摆放至少 1 个小正方体', 'error'); return }
  const type = ['view', 'fill', 'face'][Math.floor(Math.random() * 3)]
  if (type === 'view') genCustomView(cells)
  else if (type === 'fill') genCustomFill(cells)
  else genCustomFace(cells)
}
function genCustomView(cells) {
  const dirs = [{ k: 'front', label: '正面' }, { k: 'top', label: '俯视' }, { k: 'left', label: '左面' }]
  const dir = dirs[Math.floor(Math.random() * 3)]
  const correct = voxelSvg(cells, dir.k).path
  const opts = [{ k: 'A', svg: correct, isAns: true }]
  const pool = []
  for (const s of SOLIDS) for (const d of ['front', 'top', 'left']) {
    const p = s.cells ? voxelSvg(s.cells, d).path : ''
    if (p) pool.push(p)
  }
  if (cells.length > 1) {
    const p = voxelSvg(cells.slice(0, -1), dir.k).path
    if (p && p !== correct) pool.push(p)
  }
  const adj = adjacentEmpty(cells)
  if (adj) {
    const p = voxelSvg([...cells, adj], dir.k).path
    if (p && p !== correct) pool.push(p)
  }
  const uniq = [...new Set(pool)].filter(p => p && p !== correct)
  for (const d of shuffle(uniq).slice(0, 3)) opts.push({ k: String.fromCharCode(65 + opts.length), svg: d, isAns: false })
  quiz.value = { type: 'view', dir, opts: shuffle(opts), answer: correct, title: '从「' + dir.label + '」看这个自定义立体，视图是？' }
}
function genCustomFill(cells) {
  const need = fillToCuboid(cells)
  const okText = need + ' 个'
  const wrongPool = []
  for (const v of [need + 1, need + 2, Math.max(1, need - 1), need + 3, cells.length]) {
    if (v !== need && v > 0 && !wrongPool.includes(v)) wrongPool.push(v)
  }
  const wrongs = shuffle(wrongPool).slice(0, 3).map(v => v + ' 个')
  const all = shuffle([okText, ...wrongs])
  const opts = all.map((t, i) => ({ k: String.fromCharCode(65 + i), text: t, isAns: t === okText }))
  quiz.value = { type: 'fill', opts, answer: okText, title: '把这个自定义立体补成完整的长方体（外接最小长方体），还需要几个小正方体？' }
}
function genCustomFace(cells) {
  const n = exposedFaces(cells)
  const okText = n + ' 个面'
  const wrongPool = []
  for (const v of [n + 2, n + 4, Math.max(1, n - 2), n - 4, n + 6]) {
    if (v !== n && v > 0 && !wrongPool.includes(v)) wrongPool.push(v)
  }
  const wrongs = shuffle(wrongPool).slice(0, 3).map(v => v + ' 个面')
  const all = shuffle([okText, ...wrongs])
  const opts = all.map((t, i) => ({ k: String.fromCharCode(65 + i), text: t, isAns: t === okText }))
  quiz.value = { type: 'face', opts, answer: okText, title: '该自定义立体外露的小正方形面共有多少个？' }
}

// ===== 展开图折叠 =====
function pickNet(i) {
  netIdx.value = i
  const nt = CUBE_NETS[i]
  setFoldRig(buildFoldRig(nt.cells, nt.adjacency))
  foldProg.value = 0
  buildStage()
  nextTick(() => playFold())
}
function setNetTab(t) {
  netTab.value = t
  resetQuiz()
  if (t === 'paint') initPaint()
  nextTick(() => {
    if (t === 'fold') ensureNetRig()
    buildStage()
  })
}
function toggleNet(k) {
  const s = new Set(netKeys.value)
  if (s.has(k)) s.delete(k); else s.add(k)
  netKeys.value = s
  netResult.value = null
}
function loadCrossNet() {
  netKeys.value = new Set(['1,0', '0,1', '1,1', '2,1', '3,1', '1,2'])
  netResult.value = null
}
function checkMyNet() {
  const keys = [...netKeys.value]
  if (keys.length !== 6) {
    netResult.value = { ok: false, reason: '需要恰好 6 个方格（当前 ' + keys.length + ' 个）' }
    return
  }
  const { cells, adjacency } = gridToNet(netKeys.value)
  const v = validateCubeNet(cells, adjacency)
  netResult.value = v
  if (v.ok) {
    setFoldRig(buildFoldRig(cells, adjacency))
    foldProg.value = 0
    buildStage()
    nextTick(() => playFold())
  }
}

// ===== 自由切割（切面刀）=====
function currentCells() {
  if (mode.value === 'custom') return customCells.value
  if (mode.value === 'section' && cutTarget.value === 'custom' && customKeys.value.size) return customCells.value
  if (solid.value.cells) return solid.value.cells
  return null
}
function currentGroup() { return group }
function cutDirLabel() {
  const p = DIR_PRESETS.find(d => d.k === cutDir.value)
  return p ? p.n : '自定义角度'
}
function applyCutDir(k) {
  cutDir.value = k
  const p = DIR_PRESETS.find(d => d.k === k)
  if (p) {
    cutNormal.value = new THREE.Vector3(...p.normal).normalize()
    computeCut()
  }
}
function applyCustomAngles() {
  cutDir.value = 'custom'
  const az = (cutAz.value * Math.PI) / 180
  const el = (cutEl.value * Math.PI) / 180
  const n = new THREE.Vector3(Math.sin(el) * Math.cos(az), Math.cos(el), Math.sin(el) * Math.sin(az))
  if (n.length() > 1e-6) { cutNormal.value = n.normalize(); computeCut() }
}
let cutRaf = 0
function computeCut() {
  // rAF 节流：滑杆连续拖动时每帧最多重算一次，保证流畅
  if (cutRaf) return
  cutRaf = requestAnimationFrame(() => {
    cutRaf = 0
    const g = currentGroup()
    if (!g || !scene) return
    const cells = currentCells()
    const pb = boundsAll(cells, g, cutNormal.value)
    const dist = pb.min + (pb.max - pb.min) * (cutPos.value / 100)
    cutDist.value = dist
    const loops = sliceAllRobust(cells, g, cutNormal.value, dist)
    cutLoops.value = loops
    const svg = loopsToSvg(loops, cutNormal.value)
    cutSvg.value = svg.path
    cutLabel.value = sliceShapeLabel(loops)
    if (cutOpen.value) applyClipping(g, planeFromNormalDist(cutNormal.value, dist))
    updateCutPlane()
  })
}
function updateCutPlane() {
  if (cutPlane) { scene.remove(cutPlane); cutPlane.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose() }); cutPlane = null }
  if (cutFill) { scene.remove(cutFill); cutFill.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose() }); cutFill = null }
  if (mode.value === 'section' && cutTab.value === 'free') {
    const n = cutNormal.value.clone().normalize()
    if (scene) {
      cutPlane = buildCutPlaneMesh(n, cutDist.value)
      scene.add(cutPlane)
      if (cutLoops.value.length) {
        cutFill = buildSliceFill(cutLoops.value, n)
        scene.add(cutFill)
      }
    }
  }
}
function toggleCutOpen() {
  cutOpen.value = !cutOpen.value
  const g = currentGroup()
  if (g) applyClipping(g, cutOpen.value ? planeFromNormalDist(cutNormal.value, cutDist.value) : null)
}
function genSliceQuiz() {
  resetQuiz()
  const g = currentGroup()
  if (!g) { showToast('请先生成立体', 'error'); return }
  const cells = currentCells()
  const q = sliceQuizAll(cells, g, cutNormal.value.clone().normalize(), cutDist.value)
  const opts = q.opts.map(o => ({ k: o.k, svg: o.svg, isAns: o.isAns }))
  quiz.value = { type: 'slice', opts, answer: q.answer, title: '按「' + cutDirLabel() + '」在 ' + Math.round(cutPos.value) + '% 处切割该立体，得到的切面是？', extra: q.label }
}
function explainSliceToChat() {
  const desc = describeSlice(cutLoops.value, cutNormal.value, cutDist.value)
  const label = currentCells() && currentCells().length ? '自定义组合立体' : solid.value.n
  emit('send-question', '请用公考图形推理名师方法，详细讲解这个立体图形的切面问题：\n立体图形：' + label + '\n切割方式：' + desc + '\n请解释切面为什么是「' + cutLabel.value + '」，并总结"切面形状快速判断"的通用口诀。')
}

// ===== 体素工具：导出/导入/镜像Y =====
function copyVox() {
  const txt = customCells.value.map(c => c.join(',')).join(';')
  const done = () => showToast('✅ 已复制坐标到剪贴板（可粘贴分享/导入）', 'success')
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(done).catch(() => showToast('复制失败，坐标：' + txt, 'info'))
  } else {
    showToast('复制失败，坐标：' + txt, 'info')
  }
}
function pasteVox() {
  const apply = txt => {
    const cells = txt.split(/[;\n]/).map(s => s.trim().split(',')).map(a => a.map(Number)).filter(c => c.length === 3 && c.every(n => Number.isFinite(n) && n >= 0 && n <= 2))
    if (!cells.length) { showToast('剪贴板中没有有效的坐标数据', 'error'); return }
    customKeys.value = new Set(cells.map(c => c.join(',')))
    buildStage()
    showToast('✅ 已导入 ' + cells.length + ' 个小正方体', 'success')
  }
  if (navigator.clipboard && navigator.clipboard.readText) {
    navigator.clipboard.readText().then(apply).catch(() => showToast('无法读取剪贴板（请粘贴文本后重试）', 'error'))
  } else {
    showToast('当前环境不支持读取剪贴板', 'error')
  }
}
function setCutTab(t) {
  cutTab.value = t
  resetQuiz()
  nextTick(() => { if (t === 'free') { computeCut() } else { updateCutPlane() } })
}

// ===== AI 出题 =====
const aiLabel = computed(() => mode.value === 'custom' || mode.value === 'combo' || (mode.value === 'section' && cutTarget.value === 'custom' && customKeys.value.size) ? (mode.value === 'combo' ? '组合立体' : '自定义组合立体') : solid.value.n)
const stageLabel = computed(() => {
  if (mode.value === 'custom') return '🎨 自定义立体'
  if (mode.value === 'combo') return '🧩 组合体（' + comboParts.value.length + ' 部件）'
  if (mode.value === 'section' && cutTarget.value === 'custom' && customKeys.value.size) return '🎨 我的自定义立体'
  return solid.value.n
})
const PALETTE = ['#22d3ee', '#3b82f6', '#22c55e', '#f59e0b', '#fb7185', '#a855f7', '#14b8a6', '#f97316', '#818cf8', '#ec4899', '#fef3c7', '#ffffff']
function partLabel(pt) {
  if (pt.kind === 'vox') return '体素组合'
  const sol = SOLIDS.find(x => x.k === pt.k)
  return sol ? sol.n : (pt.k || '部件')
}
function setCutTarget(t) {
  if (cutTarget.value === t) return
  cutTarget.value = t
  resetQuiz()
  buildStage()
  if (cutTab.value === 'free') computeCut()
}
async function genAiQuiz() {
  const c = activeCfg(false)
  if (!c || !c.key) {
    showToast('请先配置文字模型 API Key 才能 AI 出题', 'error')
    return
  }
  aiBusy.value = true
  aiQuiz.value = null
  try {
    let prompt
    if (mode.value === 'combo') {
      const desc = '该组合体由 ' + comboParts.value.length + ' 个部件组成：' + comboParts.value.map((p, i) => (i + 1) + '.' + partLabel(p) + (p.scale ? ' 缩放' + p.scale.toFixed(1) + 'x' : '')).join('；')
      const st = stats.value
      const stat = st ? '；统计：三角面 ' + st.faces + ' 个、棱 ' + st.edges + ' 条、顶点 ' + st.verts + ' 个、V-E+F=' + st.vef : ''
      prompt = aiQuizPrompt({ n: '组合立体', tip: '由多个基本立体组合而成，请基于部件构成出题' }, desc + stat)
    } else if (mode.value === 'custom') {
      const cells = customCells.value
      if (!cells.length) { showToast('请先摆放至少 1 个小正方体', 'error'); aiBusy.value = false; return }
      prompt = aiQuizPrompt({ n: '自定义组合立体', tip: '由多个单位小正方体自由拼搭而成，请根据结构描述出题' }, describeVoxel(cells))
    } else {
      prompt = aiQuizPrompt(solid.value)
    }
    if (aiHard.value) {
      prompt = '请按【国考/省考真题难度】命题，题干与选项接近真题风格（可用真实真题改编），难度要够：\n' + prompt
    }
    const reply = await chatOnce(c, [{ role: 'system', content: '你是资深公考图形推理命题老师，只输出规定格式。' }, { role: 'user', content: prompt }], 2200)
    const q = parseQuiz(reply || '')
    if (q) {
      q.picked = ''
      aiQuiz.value = q
    } else {
      aiQuiz.value = { raw: reply || '（无返回）' }
    }
  } catch (e) {
    showToast('AI 出题失败：' + e.message, 'error')
  } finally {
    aiBusy.value = false
  }
}
function pickAi(k) {
  if (!aiQuiz.value || aiQuiz.value.picked) return
  aiQuiz.value.picked = k
  aiQuiz.value.correct = k === aiQuiz.value.answer
  if (aiQuiz.value.correct) showToast('✅ 回答正确！', 'success')
  else showToast('❌ 选错了，正确答案是 ' + aiQuiz.value.answer, 'error')
}
function sendToChat(q) {
  emit('send-question', q)
}
function pickAiFigure(i) {
  const f = aiFigures.value[i]
  if (!f) return
  aiFigActive.value = i
  aiMulti.value = false
  customKeys.value = new Set(f.cells.map(cc => cc.join(',')))
  mode.value = 'custom'
  resetQuiz()
  nextTick(() => buildStage())
}
function showAllFigures() {
  aiFigActive.value = -1
  aiMulti.value = true
  if (mode.value === 'custom') { nextTick(() => buildStage()) }
  else { mode.value = 'custom'; resetQuiz(); nextTick(() => buildStage()) }
}
function startTrace() {
  if (!aiImg.value) { showToast('请先上传/粘贴真题图片', 'error'); return }
  aiRefPin.value = true
  mode.value = 'custom'
  resetQuiz()
  nextTick(() => buildStage())
  showToast('🎯 照着左侧原图，在编辑器里逐层点击小方块即可 100% 精确复刻', 'info')
}
function onAiImgFile(ev) {
  const f = ev.target.files && ev.target.files[0]
  if (!f || !f.type.startsWith('image/')) return
  const r = new FileReader()
  r.onload = e => { aiImg.value = e.target.result; showToast('✅ 已载入真题题目图片', 'success') }
  r.readAsDataURL(f)
  ev.target.value = ''
}
function pasteAiImg() {
  if (navigator.clipboard && navigator.clipboard.read) {
    navigator.clipboard.read().then(items => {
      for (const it of items) {
        const imgType = (it.types || []).find(t => t.startsWith('image/'))
        if (imgType) {
          it.getType(imgType).then(blob => {
            const r = new FileReader()
            r.onload = e => { aiImg.value = e.target.result; showToast('✅ 已粘贴题目图片', 'success') }
            r.readAsDataURL(blob)
          })
          return
        }
      }
      showToast('剪贴板里没有图片，请用上传', 'error')
    }).catch(() => showToast('无法读取剪贴板图片，请用上传', 'error'))
  } else showToast('当前环境不支持粘贴图片，请用上传', 'error')
}
function downloadAiImg() {
  if (!aiImg.value) { showToast('还没有题目图片', 'error'); return }
  downloadDataUrl(aiImg.value, '立体图推-真题题目-' + Date.now() + '.png')
  showToast('✅ 题目图片已保存到本地', 'success')
}
async function aiRecreate() {
  if (!aiImg.value) { showToast('请先上传/粘贴真题题目图片', 'error'); return }
  const vc = activeCfg(true) || {}
  const tc = activeCfg(false) || {}
  const c = (vc && vc.key) ? vc : tc
  if (!c || !c.key) { showToast('请先配置视觉/文字模型 API Key', 'error'); return }
  aiBusy.value = true
  try {
    // 1) 先放大图片：很多视觉模型对低分辨率截图识别差，2 倍放大到画布再发送
    const big = await upscaleDataUrl(aiImg.value, 2, 1600)
    const content = [
      { type: 'text', text: '请识别图片中的立体图形（由单位小正方体拼成；可能有多张图，例如 A/B/C/D 选项）。\n先数清每个立体的行、列、层数，再从最底层开始逐层输出。只输出一个 JSON：\n{"figures":[{"label":"A","size":3,"layers":["XXX","X..","..."],"desc":"一句话描述"}]}\n每层是一个字符串数组：X=有方块，.=空；数组第 1 个元素=该层最前面一排，有几个元素=该层有几排；层数从底层到顶层依次排列；size=每层行列数。不要输出 JSON 以外的任何内容。' },
      { type: 'image_url', image_url: { url: big } }
    ]
    const reply = await chatOnce(c, [{ role: 'system', content: '你是公考立体图形推理专家，擅长把题目图片中的每个立体逐层拆成网格并输出严格 JSON。' }, { role: 'user', content }], 2000)
    const data = extractFigureJson(String(reply || ''))
    let figs = []
    if (data && Array.isArray(data.figures)) figs = data.figures
    else if (data && Array.isArray(data.cells)) figs = [{ label: 'A', cells: data.cells, desc: data.desc || '' }]
    else if (Array.isArray(data)) figs = data
    const valid = figs.map((f, i) => {
      let cells = []
      if (Array.isArray(f.layers) && f.layers.length) {
        const size = Math.min(6, Math.max(2, Number(f.size) || 3))
        f.layers.forEach((lay, y) => {
          if (y >= 6) return
          const rows = String(lay).split(/[,\n;]/).map(t => t.trim()).filter(Boolean)
          rows.forEach((row, z) => {
            if (z >= size) return
            for (let x = 0; x < size && x < row.length; x++) {
              if ('Xx1#■●█▣'.includes(row[x])) cells.push([x, y, z])
            }
          })
        })
      } else if (Array.isArray(f.cells)) {
        cells = f.cells.map(cc => [Math.round(Number(cc[0]) || 0), Math.round(Number(cc[1]) || 0), Math.round(Number(cc[2]) || 0)]).filter(cc => cc.length === 3)
      }
      return { label: f.label || String.fromCharCode(65 + i), cells, desc: f.desc || '' }
    }).filter(f => f.cells.length > 0 && f.cells.length <= 216)
    if (valid.length) {
      aiFigures.value = valid
      aiFigActive.value = -1
      aiMulti.value = valid.length > 1
      customKeys.value = new Set(valid[0].cells.map(cc => cc.join(',')))
      mode.value = 'custom'
      resetQuiz()
      nextTick(() => buildStage())
      showToast('🤖 已复刻 ' + valid.length + ' 个立体（左侧并排展示，可点选项进入编辑）', 'success')
    } else {
      showToast('🤖 AI 未能识别出立体结构，可点「🎯 手动描摹」照着原图 100% 精确复刻', 'error')
    }
  } catch (e) {
    showToast('识别失败：' + e.message + '，可点「🎯 手动描摹」精确复刻', 'error')
  } finally {
    aiBusy.value = false
  }
}

// 容错解析：去掉 markdown 围栏后取 JSON，失败则尝试直接解析数组
function extractFigureJson(raw) {
  let s = String(raw || '').replace(/```(?:json)?/gi, '').trim()
  const m = s.match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) } catch (e) {} }
  try {
    const arrM = s.match(/\[\s*\{[\s\S]*\}\s*\]/)
    if (arrM) return JSON.parse(arrM[0])
  } catch (e) {}
  return null
}

// 图片放大到画布再导出（提高视觉模型识别率）
function upscaleDataUrl(dataUrl, scale, maxSide) {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      try {
        let w = img.width, h = img.height
        const k = Math.min(scale, maxSide / Math.max(w, h))
        w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k))
        const cv = document.createElement('canvas')
        cv.width = w; cv.height = h
        const ctx = cv.getContext('2d')
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        resolve(cv.toDataURL('image/jpeg', 0.92))
      } catch (e) { resolve(dataUrl) }
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

async function searchRealQuestions() {
  const c = activeCfg(false)
  if (!c || !c.key) {
    realShow.value = true
    showToast('未配置 AI，展示内置真题库（含解析）', 'info')
    return
  }
  aiBusy.value = true
  try {
    const reply = await chatOnce(c, [{ role: 'system', content: '你是公考图形推理真题专家。' }, { role: 'user', content: '请回忆并输出 3 道真实的国考/省考「立体图形推理」真题（展开图/三视图/截面/空间重构/立体拼接），每题给出题干、4 个选项和【正确答案】，并标注是哪一类题型。如记不清原文，请按真题风格严谨改编并注明。' }], 2400)
    aiQuiz.value = { stem: '📡 联网搜到的真题（AI 回忆/整理）\n\n' + (reply || '（无返回）'), options: [], picked: '', answer: '' }
  } catch (e) {
    realShow.value = true
    showToast('联网失败，展示内置真题库', 'error')
  } finally {
    aiBusy.value = false
  }
}

// ===== 生命周期 / 监听 =====
onMounted(async () => {
  await nextTick()
  init3d()
})
// 2D→3D 切回时，画布 div 被 v-if 重建，需把渲染器画布重新挂回去，否则 3D 区域空白
watch(is2d, (v) => {
  nextTick(() => {
    if (!v && renderer && el.value && renderer.domElement.parentNode !== el.value) {
      el.value.appendChild(renderer.domElement)
    }
  })
})
onUnmounted(() => { if (disposeFn) disposeFn() })
watch(solidIdx, () => {
  initParams(solid.value)
  resetQuiz()
  if (el.value && renderer) buildStage()
})
watch(wireframe, () => { if (renderer) buildStage() })
watch(params, () => {
  if (mode.value !== 'view' || !renderer) return
  clearTimeout(paramTimer)
  paramTimer = setTimeout(() => buildStage(), 30)
}, { deep: true })
watch([pickColor, scaleVal, styleMode, lightMode, bgMode, gridOn, gridSize], () => {
  if (!renderer) return
  applyLights(); applyBg(); applyGrid()
  if (group && !(foldRig && group === foldRig.root) && !is2d.value) { presentGroup(group); refreshStats() }
})
watch(explodeVal, v => setExplode(v))

function view2dPath(dir) {
  if (mode.value === 'custom') {
    const cs = customCells.value
    return cs.length ? voxelSvg(cs, dir).path : ''
  }
  if (mode.value === 'net' && netTab.value === 'draw') {
    const keys = [...netKeys.value]
    return keys.length ? netSvgFromCells(gridToNet(new Set(keys)).cells).path : ''
  }
  if (mode.value === 'net' && netTab.value !== 'quiz' && foldRig) {
    return netSvgFromCells(currentNet.value.cells).path
  }
  return solidViewPath(solid.value, dir)
}
const stageTip = computed(() => {
  if (mode.value === 'custom') {
    const cs = customCells.value
    if (!cs.length) return '💡 在右侧编辑器点击格子摆放小正方体，自由拼搭非规则立体，可拖拽 3D 旋转查看'
    const bb = boundingBox(cs)
    return `💡 自定义立体：${cs.length} 块 · 外露 ${exposedFaces(cs)} 面 · 外接 ${bb.w}×${bb.h}×${bb.d} · 拖拽旋转查看`
  }
  if (mode.value === 'net' && netTab.value !== 'quiz' && foldRig) {
    return '💡 展开图折纸演示：蓝色面沿折痕依次折叠围成正方体，拖拽旋转查看'
  }
  return '💡 ' + solid.value.tip
})
const foldProgPct = computed({
  get: () => Math.round(foldProg.value * 100),
  set: v => { foldProg.value = v / 100 }
})
</script>

<template>
  <div class="ov show solid-ov" @click.self="emit('close')">
    <div class="pnl solid-pnl">
      <div class="solid-head">
        <button class="pnl-top-b" style="margin-right: 4px" title="返回上一层（也可按 Esc / 浏览器返回）" @click="emit('close')">← 返回</button>
        <span class="solid-title">🧊 立体图推训练</span>
        <div class="solid-acts">
          <button class="btn btn-gh" @click="is2d = !is2d">{{ is2d ? '◉ 3D 立体' : '◫ 2D 平面' }}</button>
          <button class="btn btn-gh" @click="wireframe = !wireframe">{{ wireframe ? '▣ 实体' : '☐ 线框' }}</button>
          <button class="btn btn-gh" @click="autoRotate = !autoRotate">{{ autoRotate ? '⏸ 停转' : '▶ 自转' }}</button>
          <button v-if="mode !== 'custom' && !(mode === 'section' && cutTarget === 'custom' && customKeys.size)" class="btn btn-gh" @click="nextSolid()">🎲 换图形</button>
          <button class="pc-close" @click="emit('close')">✕</button>
        </div>
      </div>

      <div class="solid-body">
        <!-- 左：3D 画布 / 2D 视图 -->
        <div class="solid-stage">
          <div v-if="!is2d" ref="el" class="solid-canvas"></div>
          <div v-else class="solid-2d">
            <template v-if="mode === 'section' && cutTab === 'free' && cutSvg">
              <div class="s2d-hint">2D 切面视图 · 「{{ cutDirLabel() }}」{{ cutPos }}% 处的真实截面</div>
              <svg viewBox="0 0 100 100" class="s2d-big"><path :d="cutSvg" fill="rgba(255,159,67,0.35)" stroke="#ff9f43" stroke-width="2" /></svg>
              <div class="cut-label">切面形状：<b>{{ cutLabel }}</b></div>
            </template>
            <template v-else>
              <div class="s2d-hint">2D 三视图同屏 · 对照 3D 立体观察投影规律</div>
              <div class="s2d-grid">
                <div v-for="d in [{k:'front',t:'正面'},{k:'top',t:'俯视'},{k:'left',t:'左面'}]" :key="d.k" class="s2d-cell">
                  <span class="s2d-t">{{ d.t }}</span>
                  <svg viewBox="0 0 100 100" class="s2d-svg"><path :d="view2dPath(d.k)" fill="rgba(34,211,238,0.25)" stroke="#22d3ee" stroke-width="2" /></svg>
                </div>
              </div>
            </template>
          </div>
          <div class="shot-bar">
            <button class="btn btn-gh" @click="shotAny()">📸 保存当前视角</button>
            <button class="btn btn-gh" @click="shotThree()">🗂 三视图截图</button>
            <span class="shot-tip">自动保存为 PNG</span>
          </div>
          <div class="solid-tip">{{ stageTip }}</div>
        </div>

        <!-- 右：训练区 -->
        <div class="solid-train">
          <div class="st-modes">
            <button class="btn" :class="mode === 'view' ? 'btn-pri' : 'btn-gh'" @click="toggleMode('view')">👁 视图</button>
            <button class="btn" :class="mode === 'custom' ? 'btn-pri' : 'btn-gh'" @click="toggleMode('custom')">🎨 自定义</button>
            <button class="btn" :class="mode === 'combo' ? 'btn-pri' : 'btn-gh'" @click="toggleMode('combo')">🧩 组合</button>
            <button class="btn" :class="mode === 'net' ? 'btn-pri' : 'btn-gh'" @click="toggleMode('net')">📄 展开图</button>
            <button class="btn" :class="mode === 'section' ? 'btn-pri' : 'btn-gh'" @click="toggleMode('section')">🔪 切面</button>
            <button class="btn" :class="mode === 'missing' ? 'btn-pri' : 'btn-gh'" @click="toggleMode('missing')">🧩 补缺</button>
            <button class="btn" :class="mode === 'ai' ? 'btn-pri' : 'btn-gh'" @click="toggleMode('ai')">🤖 AI 出题</button>
            <button class="btn" :class="mode === 'tip' ? 'btn-pri' : 'btn-gh'" @click="toggleMode('tip')">📚 考点技巧</button>
          </div>

          <div class="st-meta">
            当前图形：<b>{{ stageLabel }}</b>
            <select v-if="mode !== 'custom' && mode !== 'combo' && !(mode === 'section' && cutTarget === 'custom' && customKeys.size)" v-model.number="solidIdx" class="solid-pick" title="快速选择立体">
              <option v-for="(s, i) in SOLIDS" :key="s.k" :value="i">{{ s.n }}</option>
            </select>
            <button v-if="mode !== 'custom' && mode !== 'combo' && !(mode === 'section' && cutTarget === 'custom' && customKeys.size)" class="btn btn-gh" @click="nextSolid()">🎲 随机</button>
          </div>

          <!-- 参数滑杆（仅视图模式且图形支持） -->
          <div v-if="mode === 'view' && hasParams" class="param-sliders">
            <div v-for="pr in solid.params" :key="pr.k" class="param-row">
              <span>{{ pr.label }}</span>
              <input v-model.number="params[pr.k]" type="range" :min="pr.min" :max="pr.max" :step="pr.step" />
              <b>{{ Number(params[pr.k]).toFixed(pr.step < 0.1 ? 2 : 1) }}</b>
            </div>
          </div>

          <!-- 视图题 -->
          <template v-if="mode === 'view'">
            <div class="prs-panel">
              <details class="prs" open>
                <summary>🎛 个性化外观 · 点击立体表面/棱线看细节</summary>
                <div class="prs-body">
                  <div class="prs-row"><span class="prs-l">🎨 颜色</span>
                    <input v-model="pickColor" type="color" class="prs-color" />
                    <button v-for="c in PALETTE" :key="c" class="sw" :style="{ background: c }" @click="pickColor = c"></button>
                    <button class="btn btn-gh prs-chip" @click="pickColor = ''">默认</button>
                  </div>
                  <div class="prs-row"><span class="prs-l">📐 大小</span><input v-model.number="scaleVal" type="range" min="0.4" max="2.2" step="0.05" /><b>{{ Number(scaleVal).toFixed(2) }}x</b></div>
                  <div class="prs-row"><span class="prs-l">🕶 样式</span>
                    <button class="btn btn-gh prs-chip" :class="{ on: styleMode === 'solid' }" @click="styleMode = 'solid'">实体</button>
                    <button class="btn btn-gh prs-chip" :class="{ on: styleMode === 'wire' }" @click="styleMode = 'wire'">线框</button>
                    <button class="btn btn-gh prs-chip" :class="{ on: styleMode === 'glass' }" @click="styleMode = 'glass'">半透明</button>
                  </div>
                  <div class="prs-row"><span class="prs-l">🔄 自转</span><input v-model.number="rotSpeed" type="range" min="0" max="5" step="0.2" /><b>{{ Number(rotSpeed).toFixed(1) }}x</b></div>
                  <div class="prs-row"><span class="prs-l">🧭 视角</span>
                    <button v-for="(v, k) in CAM_PRESETS" :key="k" class="btn btn-gh prs-chip" @click="setCameraPreset(k)">{{ ({ front: '前', back: '后', top: '俯', bottom: '仰', left: '左', right: '右', iso: '等轴' })[k] }}</button>
                  </div>
                  <div class="prs-row"><span class="prs-l">🔲 网格</span>
                    <button class="btn btn-gh prs-chip" :class="{ on: gridOn }" @click="gridOn = !gridOn">{{ gridOn ? '开' : '关' }}</button>
                    <input v-model.number="gridSize" type="range" min="4" max="24" step="2" :disabled="!gridOn" style="flex:1" />
                  </div>
                  <div class="prs-row"><span class="prs-l">💡 光照</span>
                    <button class="btn btn-gh prs-chip" :class="{ on: lightMode === 'std' }" @click="lightMode = 'std'">标准</button>
                    <button class="btn btn-gh prs-chip" :class="{ on: lightMode === 'soft' }" @click="lightMode = 'soft'">柔和</button>
                    <button class="btn btn-gh prs-chip" :class="{ on: lightMode === 'vivid' }" @click="lightMode = 'vivid'">鲜明</button>
                  </div>
                  <div class="prs-row"><span class="prs-l">🌌 背景</span>
                    <button v-for="(b, k) in { auto: '自动', black: '深黑', deep: '星空', light: '浅色' }" :key="k" class="btn btn-gh prs-chip" :class="{ on: bgMode === k }" @click="bgMode = k">{{ b }}</button>
                  </div>
                  <div class="prs-row">
                    <button class="btn btn-gh" @click="genKnowledgeCard()">📚 知识卡</button>
                    <button class="btn btn-gh" @click="genStatsQuiz()">🎯 统计题</button>
                    <button class="btn btn-gh" @click="mixedQuiz()">🎲 综合考法</button>
                    <button class="btn btn-gh" @click="clearHit()">🧹 清除选中</button>
                  </div>
                  <div class="prs-row">
                    <span class="prs-l">🧠 空间训练</span>
                    <button class="btn btn-gh" @click="startTrain()">🎯 开始：转到{{ trainDir ? TRAIN_DIRS.find(d => d.k === trainDir).label : '目标视角' }}</button>
                    <button class="btn btn-gh" @click="checkTrain()">✅ 我好了，检查</button>
                    <b v-if="trainChecked" :style="{ color: trainPass ? '#34d399' : '#fb7185' }">{{ trainPass ? '🎉 视角正确！' : '再转一下' }}</b>
                  </div>
                  <div v-if="stats" class="st-stats">面 {{ stats.faces }} · 棱 {{ stats.edges }} · 顶点 {{ stats.verts }} · 面积 {{ Number(stats.area).toFixed(1) }} · 欧拉 V-E+F={{ stats.vef }} {{ stats.eulerOk ? '✅' : '' }}</div>
                  <div v-if="cardText" class="st-card">{{ cardText }}</div>
                  <div v-if="hitInfo" class="hit-info">
                    <template v-if="hitInfo.type === 'face'">🎯 「{{ hitInfo.part }}」表面：{{ hitInfo.shape }}（{{ hitInfo.count }} 顶点）· 面积 {{ hitInfo.area }} · 法向 ({{ hitInfo.normal }})</template>
                    <template v-else>📏 「{{ hitInfo.part }}」棱线：长度 {{ hitInfo.len }}</template>
                    <button v-if="hitInfo.type === 'face'" class="btn btn-gh" @click="cutAlongFace()">✂️ 沿此面切割</button>
                  </div>
                </div>
              </details>
            </div>
            <div class="st-title">{{ quiz ? quiz.title : '点击下方按钮开始视图训练' }}</div>
            <button v-if="!quiz" class="btn btn-pri" @click="genViewQuiz()">🎲 随机出视图题</button>
            <div v-if="quiz" class="st-opts">
              <button v-for="o in quiz.opts" :key="o.k" class="st-opt" :class="{ picked: picked === o.k, right: picked && o.isAns, wrong: picked && picked === o.k && !o.isAns }" :disabled="!!picked" @click="pick(o.k)">
                <span class="st-k">{{ o.k }}</span>
                <svg viewBox="0 0 100 100" class="st-svg"><path :d="o.svg" fill="rgba(34,211,238,0.25)" stroke="#22d3ee" stroke-width="2" /></svg>
              </button>
            </div>
            <button v-if="picked" class="btn btn-gh" @click="genViewQuiz()">▶ 下一题</button>
          </template>

          <!-- 自定义体素 -->
          <template v-else-if="mode === 'custom'">
            <div class="vox-editor">
              <div class="st-title">🧱 自由拼搭：6×6×6 空间逐层编辑（点击格子摆放 / 移除）</div>
              <div class="vox-layers">
                <div class="vox-layer-tabs">
                  <button v-for="ly in 6" :key="ly - 1" class="btn btn-gh vox-chip" :class="{ on: voxLayer === ly - 1 }" @click="setVoxLayer(ly - 1)">{{ ly === 1 ? '底层' : (ly === 6 ? '顶层' : '第' + ly + '层') }}</button>
                </div>
                <div class="vox-grid big">
                  <button v-for="cell in layerCells(voxLayer)" :key="cell.k" class="vox-cell" :class="{ on: customKeys.has(cell.k) }" :title="'(' + cell.x + ',' + voxLayer + ',' + cell.z + ')'" @click="toggleVox(cell.k)"></button>
                </div>
                <div v-if="aiRefPin && aiImg" class="ai-ref-pin">
                  <img :src="aiImg" class="ai-ref-img" alt="参照原图" />
                  <div class="ai-ref-info">
                    <div class="ai-ref-tag">🎯 参照原图 · 当前第 {{ voxLayer + 1 }} 层</div>
                    <div class="ai-ref-tip">照着原图逐层点击小方块即可 100% 精确复刻（不依赖 AI 识别）</div>
                    <button class="btn btn-gh" @click="aiRefPin = false">✖ 关闭参照</button>
                  </div>
                </div>
              </div>
              <div class="vox-tools">
                <button class="btn btn-gh" @click="fillLayer(0)">⬛ 填满底层</button>
                <button class="btn btn-gh" @click="randomVox()">🎲 随机</button>
                <button class="btn btn-gh" @click="mirrorVox('x')">🪞 镜像X</button>
                <button class="btn btn-gh" @click="mirrorVox('z')">🪞 镜像Z</button>
                <button class="btn btn-gh" @click="mirrorY()">🪞 镜像Y</button>
                <button class="btn btn-gh" @click="clearVox()">🗑 清空</button>
                <button class="btn btn-gh" @click="copyVox()">📋 导出</button>
                <button class="btn btn-gh" @click="pasteVox()">📥 导入</button>
              </div>
              <div class="vox-presets">
                <button v-for="p in VOXEL_PRESETS" :key="p.k" class="btn btn-gh vox-chip" @click="applyPreset(p.k)">{{ p.n }}</button>
              </div>
              <div class="vox-stats">共 {{ customCells.length }} 块 · 外露 {{ customCells.length ? exposedFaces(customCells) : 0 }} 面 · 外接 {{ customCells.length ? boundingBox(customCells).w + '×' + boundingBox(customCells).h + '×' + boundingBox(customCells).d : '—' }}</div>
            </div>
            <div class="st-acts">
              <button class="btn btn-pri" @click="genCustomQuiz()">🎲 用我的图形出题</button>
              <button class="btn btn-gh" @click="genAiQuiz()">🤖 AI 深挖讲解</button>
            </div>
            <div v-if="quiz" class="st-sub">📌 {{ quiz.type === 'view' ? '视图题' : (quiz.type === 'fill' ? '补缺题' : '面数题') }}</div>
            <div v-if="quiz" class="st-title">{{ quiz.title }}</div>
            <div v-if="quiz" class="st-opts" :class="{ txt: quiz.type !== 'view' }">
              <button v-for="o in quiz.opts" :key="o.k" class="st-opt" :class="{ picked: picked === o.k, right: picked && o.isAns, wrong: picked && picked === o.k && !o.isAns }" :disabled="!!picked" @click="pick(o.k)">
                <span class="st-k">{{ o.k }}</span>
                <svg v-if="quiz.type === 'view'" viewBox="0 0 100 100" class="st-svg"><path :d="o.svg" fill="rgba(34,211,238,0.25)" stroke="#22d3ee" stroke-width="2" /></svg>
                <span v-else class="st-t">{{ o.text }}</span>
              </button>
            </div>
            <button v-if="picked" class="btn btn-gh" @click="genCustomQuiz()">▶ 下一题</button>
          </template>

          <!-- 组合体 -->
          <template v-else-if="mode === 'combo'">
            <div class="st-title">🧩 组合体：把多个立体任意叠加成复杂图形（点 3D 表面/棱线看细节）</div>
            <div class="combo-presets">
              <button v-for="(pre, i) in COMBO_PRESETS" :key="i" class="btn btn-gh vox-chip" @click="applyComboPreset(i)">{{ pre.n }}</button>
              <button class="btn btn-gh vox-chip" @click="randCombo()">🎲 随机组合</button>
            </div>
            <div class="combo-ctrl">
              <div class="prs-row"><span class="prs-l">➕ 加部件</span>
                <select v-model="addPartKey" class="solid-pick">
                  <option v-for="sol in SOLIDS" :key="sol.k" :value="sol.k">{{ sol.n }}</option>
                </select>
                <button class="btn btn-gh" @click="addComboPart()">添加</button>
              </div>
              <div class="prs-row"><span class="prs-l">💥 爆炸</span><input v-model.number="explodeVal" type="range" min="0" max="3" step="0.1" /><b>{{ Number(explodeVal).toFixed(1) }}</b></div>
              <div class="prs-row">
                <button class="btn btn-gh" @click="exportCombo()">📋 导出</button>
                <button class="btn btn-gh" @click="importCombo()">📥 导入</button>
                <button class="btn btn-gh" @click="clearHit()">🧹 清除选中</button>
              </div>
            </div>
            <div class="combo-list">
              <div v-for="(pt, i) in comboParts" :key="i" class="combo-it">
                <span class="combo-idx">{{ i + 1 }}</span>
                <span class="combo-name">{{ partLabel(pt) }}</span>
                <input type="color" :value="pt.color || '#22d3ee'" class="combo-color" @input="pt.color = $event.target.value; buildStage()" />
                <button class="btn btn-gh" @click="moveComboPart(i, -1)">↑</button>
                <button class="btn btn-gh" @click="moveComboPart(i, 1)">↓</button>
                <button class="btn btn-gh" @click="removeComboPart(i)">🗑</button>
              </div>
            </div>
            <div v-if="stats" class="st-stats">面 {{ stats.faces }} · 棱 {{ stats.edges }} · 顶点 {{ stats.verts }} · 面积 {{ Number(stats.area).toFixed(1) }} · 欧拉 V-E+F={{ stats.vef }} {{ stats.eulerOk ? '✅' : '' }}</div>
            <div v-if="hitInfo" class="hit-info">
              <template v-if="hitInfo.type === 'face'">🎯 「{{ hitInfo.part }}」表面：{{ hitInfo.shape }}（{{ hitInfo.count }} 顶点）· 面积 {{ hitInfo.area }} · 法向 ({{ hitInfo.normal }})</template>
              <template v-else>📏 「{{ hitInfo.part }}」棱线：长度 {{ hitInfo.len }}</template>
            </div>
            <div class="st-acts">
              <button class="btn btn-pri" @click="genStatsQuiz()">🎯 统计题</button>
              <button class="btn btn-gh" @click="genKnowledgeCard()">📚 知识卡</button>
              <button class="btn btn-gh" @click="genAiQuiz()">🤖 AI 讲解</button>
            </div>
            <div v-if="quiz" class="st-sub">📌 {{ quiz.extra }}</div>
            <div v-if="quiz" class="st-title">{{ quiz.title }}</div>
            <div v-if="quiz" class="st-opts txt">
              <button v-for="o in quiz.opts" :key="o.k" class="st-opt" :class="{ picked: picked === o.k, right: picked && o.isAns, wrong: picked && picked === o.k && !o.isAns }" :disabled="!!picked" @click="pick(o.k)">
                <span class="st-k">{{ o.k }}</span><span class="st-t">{{ o.text }}</span>
              </button>
            </div>
            <button v-if="picked" class="btn btn-gh" @click="genStatsQuiz()">▶ 下一题</button>
            <div v-if="cardText" class="st-card">{{ cardText }}</div>
          </template>

          <!-- 展开图 -->
          <template v-else-if="mode === 'net'">
            <div class="st-modes sub">
              <button class="btn" :class="netTab === 'fold' ? 'btn-pri' : 'btn-gh'" @click="setNetTab('fold')">📦 选图折叠</button>
              <button class="btn" :class="netTab === 'draw' ? 'btn-pri' : 'btn-gh'" @click="setNetTab('draw')">✏️ 我画展开图</button>
              <button class="btn" :class="netTab === 'quiz' ? 'btn-pri' : 'btn-gh'" @click="setNetTab('quiz')">📄 选择题</button>
              <button class="btn" :class="netTab === 'paint' ? 'btn-pri' : 'btn-gh'" @click="setNetTab('paint')">🎨 涂色绘制</button>
            </div>

            <template v-if="netTab === 'fold'">
              <div class="st-title">选择一种经典立方体展开图，观察它如何沿折痕折成正方体</div>
              <div class="net-chips">
                <button v-for="(nt, i) in CUBE_NETS" :key="i" class="net-chip" :class="{ on: netIdx === i }" @click="pickNet(i)">
                  <svg viewBox="0 0 100 100" class="net-chip-svg"><path :d="netSvgFromCells(nt.cells).path" fill="rgba(59,130,246,0.25)" stroke="#3b82f6" stroke-width="2" /></svg>
                  <span>{{ nt.n }}</span>
                </button>
              </div>
            </template>

            <template v-else-if="netTab === 'draw'">
              <div class="st-title">在 4×4 网格中画出 6 个方格，组成你认为能折成正方体的展开图</div>
              <div class="draw-grid">
                <button v-for="c in DRAW_CELLS" :key="c.k" class="draw-cell" :class="{ on: netKeys.has(c.k) }" @click="toggleNet(c.k)"></button>
              </div>
              <div class="fold-btns">
                <button class="btn btn-pri" @click="checkMyNet()">🔍 折叠检验</button>
                <button class="btn btn-gh" @click="loadCrossNet()">✝ 经典十字</button>
                <button class="btn btn-gh" @click="netKeys = new Set(); netResult = null">🗑 清空</button>
              </div>
              <div v-if="netResult" class="net-result" :class="netResult.ok ? 'ok' : 'bad'">
                <span>{{ netResult.ok ? '✅ 恭喜，这是立方体展开图！' : '❌ ' + netResult.reason }}</span>
                <button v-if="netResult.ok" class="btn btn-pri" @click="playFold()">▶ 看它折叠</button>
              </div>
              <div class="fold-hint">💡 只有 6 个面、且折叠后 6 个面朝向互不相同的展开图才能围成正方体。</div>
            </template>

            <template v-else-if="netTab === 'paint'">
              <div class="st-title">🎨 真题空间重构：给展开图每个面涂色 / 自由绘制，再折成正方体</div>
              <div class="net-chips">
                <button v-for="(nt, i) in CUBE_NETS" :key="i" class="net-chip" :class="{ on: paintNetIdx === i }" @click="pickPaintNet(i)">
                  <svg viewBox="0 0 100 100" class="net-chip-svg"><path :d="netSvgFromCells(nt.cells).path" fill="rgba(59,130,246,0.25)" stroke="#3b82f6" stroke-width="2" /></svg>
                  <span>{{ nt.n }}</span>
                </button>
              </div>
              <div class="paint-tools">
                <input v-model="paintBrush" type="color" class="prs-color" />
                <button class="btn btn-gh prs-chip" :class="{ on: paintTool === 'brush' }" @click="paintTool = 'brush'">✏️ 画笔</button>
                <button class="btn btn-gh prs-chip" :class="{ on: paintTool === 'line' }" @click="paintTool = 'line'">📏 直线</button>
                <button class="btn btn-gh prs-chip" :class="{ on: paintTool === 'fill' }" @click="paintTool = 'fill'">🪣 区域填色</button>
                <button class="btn btn-gh prs-chip" :class="{ on: paintTool === 'fillFace' }" @click="paintTool = 'fillFace'">🟦 整面</button>
                <button class="btn btn-gh prs-chip" :class="{ on: paintTool === 'erase' }" @click="paintTool = 'erase'">🧽 擦除</button>
                <button class="btn btn-gh prs-chip" @click="paintUndo()">↩️ 撤销</button>
                <button class="btn btn-gh prs-chip" @click="paintClearFace()">清空此面</button>
                <button class="btn btn-gh prs-chip" @click="paintClearAll()">全部清空</button>
                <button class="btn btn-gh prs-chip" @click="paintExport()">💾 存图</button>
              </div>
              <div class="paint-stage">
                <canvas ref="paintCanvasEl" class="paint-canvas" @pointerdown="onPaintDown" @pointermove="onPaintMove" @pointerup="onPaintUp" @pointerleave="onPaintUp" @pointercancel="onPaintUp"></canvas>
              </div>
              <div class="paint-hint">💡 点选一个面（黄框=当前面）。✏️画笔自动把抖动手绘识别成平滑直线/曲线；画一个封闭圈后选「🪣 区域填色」点圈内即可填色；再点「📦 折叠成正方体」看图案随展开图折起来。</div>
              <div class="fold-btns">
                <button class="btn btn-pri" @click="paintFold()">📦 折叠成正方体</button>
                <button class="btn btn-gh" @click="paintQuiz()">🎯 就涂色出重构题</button>
                <button class="btn btn-gh" @click="playFold()">▶ 重播折叠</button>
              </div>
              <div v-if="quiz" class="st-sub">📌 {{ quiz.extra }}</div>
              <div v-if="quiz" class="st-title">{{ quiz.title }}</div>
              <div v-if="quiz" class="st-opts txt">
                <button v-for="o in quiz.opts" :key="o.k" class="st-opt" :class="{ picked: picked === o.k, right: picked && o.isAns, wrong: picked && picked === o.k && !o.isAns }" :disabled="!!picked" @click="pick(o.k)">
                  <span class="st-k">{{ o.k }}</span><span class="st-t">{{ o.text }}</span>
                </button>
              </div>
              <button v-if="picked" class="btn btn-gh" @click="paintQuiz()">▶ 下一题</button>
            </template>

            <template v-else>
              <div class="st-title">{{ quiz ? quiz.title : '点击下方按钮开始展开图选择题训练' }}</div>
              <button v-if="!quiz" class="btn btn-pri" @click="genNetQuiz()">🎲 随机出展开图题</button>
              <div v-if="quiz" class="st-opts">
                <button v-for="o in quiz.opts" :key="o.k" class="st-opt" :class="{ picked: picked === o.k, right: picked && o.isAns, wrong: picked && picked === o.k && !o.isAns }" :disabled="!!picked" @click="pick(o.k)">
                  <span class="st-k">{{ o.k }}</span>
                  <svg viewBox="0 0 100 100" class="st-svg"><path :d="o.svg" fill="rgba(59,130,246,0.25)" stroke="#3b82f6" stroke-width="2" /></svg>
                </button>
              </div>
              <button v-if="picked" class="btn btn-gh" @click="genNetQuiz()">▶ 下一题</button>
            </template>

            <!-- 折叠控制条：独立 v-if，不打断上面的 v-if/v-else-if 链 -->
            <div v-if="foldRigReady && (netTab === 'fold' || (netTab === 'draw' && netResult && netResult.ok) || (netTab === 'paint' && paintFoldRig))" class="fold-ctl">
              <div class="fold-btns">
                <button class="btn btn-pri" @click="playFold()">▶ 折叠</button>
                <button class="btn btn-gh" @click="playUnfold()">⏪ 展开</button>
              </div>
              <div class="fold-slider">
                <span>折叠进度</span>
                <input v-model.number="foldProgPct" type="range" min="0" max="100" />
                <b>{{ Math.round(foldProg * 100) }}%</b>
              </div>
              <div class="fold-hint">💡 拖拽 3D 旋转查看；面沿折痕依次折起，最终围成正方体。</div>
            </div>
          </template>

          <!-- 切面：自由切割刀 + 经典切面题 -->
          <template v-else-if="mode === 'section'">
            <div class="st-modes sub">
              <button class="btn" :class="cutTab === 'free' ? 'btn-pri' : 'btn-gh'" @click="setCutTab('free')">🔪 自由切割</button>
              <button class="btn" :class="cutTab === 'quiz' ? 'btn-pri' : 'btn-gh'" @click="setCutTab('quiz')">📝 经典切面题</button>
            </div>

            <template v-if="cutTab === 'free'">
              <div class="st-title">✂️ 拿起"切面刀"：选择切割方向与位置，实时查看真实切面</div>
              <div v-if="customKeys.size" class="cut-targets">
                <button class="btn btn-gh cut-chip" :class="{ on: cutTarget === 'solid' }" @click="setCutTarget('solid')">🧊 当前立体 · {{ solid.n }}</button>
                <button class="btn btn-gh cut-chip" :class="{ on: cutTarget === 'custom' }" @click="setCutTarget('custom')">🎨 我的自定义立体 · {{ customKeys.size }}块</button>
              </div>
              <div class="cut-dirs">
                <button v-for="d in DIR_PRESETS" :key="d.k" class="btn btn-gh cut-chip" :class="{ on: cutDir === d.k }" :title="d.tip" @click="applyCutDir(d.k)">{{ d.n }}</button>
                <button class="btn btn-gh cut-chip" :class="{ on: cutDir === 'custom' }" @click="cutDir = 'custom'">🎛 自定义</button>
              </div>
              <div v-if="cutDir === 'custom'" class="cut-custom">
                <div class="param-row"><span>方位角</span><input v-model.number="cutAz" type="range" min="0" max="360" step="1" @input="applyCustomAngles()" /><b>{{ cutAz }}°</b></div>
                <div class="param-row"><span>仰角</span><input v-model.number="cutEl" type="range" min="0" max="180" step="1" @input="applyCustomAngles()" /><b>{{ cutEl }}°</b></div>
              </div>
              <div class="param-row"><span>位置</span><input v-model.number="cutPos" type="range" min="0" max="100" step="1" @input="computeCut()" /><b>{{ cutPos }}%</b></div>
              <div class="fold-btns">
                <button class="btn" :class="cutOpen ? 'btn-pri' : 'btn-gh'" @click="toggleCutOpen()">{{ cutOpen ? '🔍 复原实体' : '🔪 剖开查看' }}</button>
                <button class="btn btn-pri" @click="genSliceQuiz()">🎲 就这个切面出题</button>
                <button class="btn btn-gh" @click="explainSliceToChat()">💬 发到对话讲解</button>
              </div>
              <div class="cut-result">
                <div class="cut-svg-box">
                  <svg viewBox="0 0 100 100" class="cut-svg"><path :d="cutSvg" fill="rgba(255,159,67,0.35)" stroke="#ff9f43" stroke-width="2" /></svg>
                </div>
                <div class="cut-info">
                  <div class="cut-label">切面形状：<b>{{ cutLabel }}</b></div>
                  <div class="cut-detail">方向：{{ cutDirLabel() }} · 位置：{{ cutPos }}% · 独立图形：{{ cutLoops.length }}</div>
                </div>
              </div>
              <div v-if="quiz" class="st-sub">📌 切面选择题</div>
              <div v-if="quiz" class="st-title">{{ quiz.title }}</div>
              <div v-if="quiz" class="st-opts">
                <button v-for="o in quiz.opts" :key="o.k" class="st-opt" :class="{ picked: picked === o.k, right: picked && o.isAns, wrong: picked && picked === o.k && !o.isAns }" :disabled="!!picked" @click="pick(o.k)">
                  <span class="st-k">{{ o.k }}</span>
                  <svg viewBox="0 0 100 100" class="st-svg"><path :d="o.svg" fill="rgba(255,159,67,0.35)" stroke="#ff9f43" stroke-width="2" /></svg>
                </button>
              </div>
              <button v-if="picked" class="btn btn-gh" @click="genSliceQuiz()">▶ 下一题</button>
            </template>

            <template v-else>
              <div class="st-title">{{ quiz ? quiz.title : '点击下方按钮开始经典切面训练' }}</div>
              <div v-if="quiz && quiz.extra" class="st-sub">📌 {{ quiz.extra }}</div>
              <button v-if="!quiz" class="btn btn-pri" @click="genSectionQuiz()">🎲 随机出切面题</button>
              <div v-if="quiz" class="st-opts txt">
                <button v-for="o in quiz.opts" :key="o.k" class="st-opt" :class="{ picked: picked === o.k, right: picked && o.isAns, wrong: picked && picked === o.k && !o.isAns }" :disabled="!!picked" @click="pick(o.k)">
                  <span class="st-k">{{ o.k }}</span><span class="st-t">{{ o.text }}</span>
                </button>
              </div>
              <button v-if="picked" class="btn btn-gh" @click="genSectionQuiz()">▶ 下一题</button>
            </template>
          </template>

          <!-- 补缺题 -->
          <template v-else-if="mode === 'missing'">
            <div class="st-title">{{ quiz ? quiz.title : '点击下方按钮开始补缺训练' }}</div>
            <div v-if="quiz && quiz.extra" class="st-sub">📌 {{ quiz.extra }}</div>
            <button v-if="!quiz" class="btn btn-pri" @click="genMissingQuiz()">🎲 随机出补缺题</button>
            <div v-if="quiz" class="st-opts txt">
              <button v-for="o in quiz.opts" :key="o.k" class="st-opt" :class="{ picked: picked === o.k, right: picked && o.isAns, wrong: picked && picked === o.k && !o.isAns }" :disabled="!!picked" @click="pick(o.k)">
                <span class="st-k">{{ o.k }}</span><span class="st-t">{{ o.text }}</span>
              </button>
            </div>
            <button v-if="picked" class="btn btn-gh" @click="genMissingQuiz()">▶ 下一题</button>
          </template>

          <!-- 考点问答与技巧 -->
          <template v-else-if="mode === 'tip'">
            <div class="st-title">📚 立体图推 · 考点问答与技巧总结</div>
            <div class="tip-search">
              <input v-model="tipQuery" placeholder="搜索考点：如 展开图 / 切面 / 欧拉 / 三视图…" class="tip-in" @input="filterTips()" />
              <button class="btn btn-pri" @click="askTipAI()">🤖 问 AI</button>
            </div>
            <div class="tip-list">
              <details v-for="(t, i) in tipFiltered" :key="i" class="tip-it">
                <summary>{{ t.q }}</summary>
                <div class="tip-a">{{ t.a }}</div>
              </details>
              <div v-if="!tipFiltered.length" class="tip-empty">没有匹配的考点，换个关键词或点「问 AI」</div>
            </div>
            <div class="tip-note">💡 输入问题点「问 AI」会把问题发到主对话，由 AI 名师作答并给口诀。</div>
          </template>

          <!-- AI 出题 -->
          <template v-else>
            <div class="st-title">🤖 AI 根据「{{ aiLabel }}」出 4 选 1 题（含解析/考点/秒杀规律）</div>
            <div class="prs-row" style="margin:4px 0">
              <label class="ai-hard-lb"><input v-model="aiHard" type="checkbox" /> 🎯 真题难度（接近国考/省考）</label>
              <button class="btn btn-gh" @click="searchRealQuestions()">📡 联网搜真题</button>
              <button class="btn btn-gh" @click="realShow = !realShow">{{ realShow ? '隐藏' : '📚 真题题库' }}</button>
            </div>
            <div class="ai-img-sec">
              <div class="prs-row">
                <label class="btn btn-gh ai-upload">📤 上传真题截图<input type="file" accept="image/*" style="display:none" @change="onAiImgFile" /></label>
                <button class="btn btn-gh" @click="pasteAiImg()">📋 粘贴图片</button>
                <button v-if="aiImg" class="btn btn-gh" @click="downloadAiImg()">💾 保存题目原图</button>
                <button v-if="aiImg" class="btn btn-pri" :disabled="aiBusy" @click="aiRecreate()">{{ aiBusy ? '⏳ 识别中…' : '🤖 AI 识别并复刻 3D' }}</button>
                <button v-if="aiImg" class="btn btn-pri" @click="startTrace()">🎯 手动描摹（100% 精确）</button>
              </div>
              <div v-if="aiImg" class="ai-img-box">
                <img :src="aiImg" class="ai-img" :class="{ zoom: aiImgZoom }" alt="真题题目" @click="aiImgZoom = !aiImgZoom" />
                <span class="ai-img-tip">🖱 点击图片放大/还原 · 💾 可保存到本地</span>
              </div>
              <div v-if="aiFigures.length" class="ai-figs">
                <div class="ai-figs-t">🤖 已识别 {{ aiFigures.length }} 个立体：</div>
                <div class="ai-fig-chips">
                  <button v-for="(f, i) in aiFigures" :key="i" class="btn btn-gh ai-fig-chip" :class="{ on: aiFigActive === i }" @click="pickAiFigure(i)">
                    {{ f.label }} · {{ f.cells.length }}块{{ f.desc ? ' · ' + f.desc.slice(0, 12) : '' }}
                  </button>
                  <button v-if="aiFigures.length > 1" class="btn btn-gh ai-fig-chip" @click="showAllFigures()">🔙 并排显示全部</button>
                </div>
                <div class="ai-figs-tip">💡 左侧 3D 区已并排展示；点某个选项 → 进入自定义编辑器可继续出题/切面/涂色</div>
              </div>
              <div v-else class="ai-img-empty">💡 上传/粘贴历年真题的立体图推题目截图 → AI 识别 → 自动在左侧 3D 区复刻原图，帮你理解题意</div>
            </div>
            <div v-if="realShow" class="real-list">
              <div v-for="(rq, i) in REAL_QUESTIONS" :key="i" class="real-it">
                <div class="real-q">{{ rq.q }}</div>
                <div class="real-a">✅ {{ rq.a }} · {{ rq.tip }}</div>
              </div>
            </div>
            <button class="btn btn-pri" :disabled="aiBusy" @click="genAiQuiz()">{{ aiBusy ? '⏳ 生成中…' : '🎲 AI 出题' }}</button>
            <div v-if="aiQuiz && aiQuiz.raw && !aiQuiz.stem" class="st-raw">{{ aiQuiz.raw }}</div>
            <div v-if="aiQuiz && aiQuiz.stem" class="aiq">
              <div class="aiq-stem" v-html="md(aiQuiz.stem)"></div>
              <div class="aiq-opts">
                <button v-for="o in aiQuiz.options" :key="o.k" class="st-opt txt" :class="{ picked: aiQuiz.picked === o.k, right: aiQuiz.picked && o.k === aiQuiz.answer, wrong: aiQuiz.picked && o.k === aiQuiz.picked && o.k !== aiQuiz.answer }" :disabled="!!aiQuiz.picked" @click="pickAi(o.k)">
                  <span class="st-k">{{ o.k }}</span><span class="st-t">{{ o.t }}</span>
                </button>
              </div>
              <div v-if="aiQuiz.picked" class="aiq-explain" v-html="md(aiQuiz.explain || '')"></div>
              <div class="aiq-acts">
                <button v-if="aiQuiz.picked" class="btn btn-gh" @click="genAiQuiz()">🎲 再出一题</button>
                <button class="btn btn-gh" @click="sendToChat('请用名师方法详细讲解这道立体图形题：\n' + aiQuiz.stem + '\n' + (aiQuiz.options || []).map(o => o.k + '. ' + o.t).join('\n'))">💬 发到对话深挖</button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
