<template>
  <Teleport to="body">
    <div class="draft-ov" :style="bgStyle">
      <canvas ref="cv" class="draft-canvas" :style="{ cursor: tool === 'pan' ? 'grab' : eraser ? 'cell' : 'crosshair' }"
        @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up"></canvas>
      <div class="draft-bar">
        <button class="db-b db-close" @click="close()">✕ 关闭</button>
        <span class="db-sep"></span>
        <button v-for="t in tools" :key="t.k" class="db-b" :class="{ on: tool === t.k && !eraser }" @click="pickTool(t.k)">{{ t.k === 'shape' ? (shapeMode === 'rect' ? '🔷 方' : '⭕ 圆') : t.t }}</button>
        <span class="db-sep"></span>
        <button v-for="col in colors" :key="col" class="db-color" :class="{ on: !eraser && tool !== 'pan' && color === col }" :style="{ background: col }" @click="color = col; eraser = false; tool = 'pen'"></button>
        <input type="color" v-model="color" class="db-colorpick" title="取色器：自由选择任意颜色" @input="eraser = false; tool = 'pen'" />
        <span class="db-sep"></span>
        <button class="db-b" @click="cycleNib()" :title="'笔头（真实笔尖 mm）：' + NIBS.join(' / ')">✒️ {{ nib }}mm</button>
        <button class="db-b" :class="{ on: eraser }" @click="toggleEraser()" :title="eraser ? '再次点击切换橡皮大小（小/中/大）' : '进入橡皮擦除'">🧽 {{ eraser ? '橡皮·' + eraserSize : '橡皮' }}</button>
        <button class="db-b" :disabled="!undoStack.length" @click="undo()">↩ 撤销</button>
        <button class="db-b" @click="resetView()" title="画布复位到中心">🏠 复位</button>
        <button class="db-b" @click="clear()">🗑 清空</button>
        <button class="db-b" @click="newPage()" title="新建空白草稿页">➕ 新页</button>
        <button class="db-b" @click="switchPage(-1)" title="上一页">◀ {{ curPage + 1 }}/{{ pages.length }}</button>
        <button class="db-b" @click="switchPage(1)" title="下一页">▶</button>
        <button class="db-b db-save" @click="saveVersion()">💾 存版</button>
        <button class="db-b" :class="{ on: histShow }" @click="histShow = !histShow">📁 记录 {{ recs.length }}</button>
        <span class="db-sep"></span>
        <button class="db-b" :class="{ on: paperBg }" @click="paperBg = !paperBg" title="空白纸=纯纸底遮住底层；透明=叠加在界面上">📄 {{ paperBg ? '纸' : '透' }}</button>
        <span class="db-opa">不透明 {{ opacity }}%</span>
        <input type="range" class="db-range" min="0" max="100" step="1" v-model.number="opacity" @input="saveOpa" @change="saveOpa" />
      </div>
      <div v-if="title || lastTimeText" class="draft-hint">{{ title ? title + (lastTimeText ? ' · ' : '') : '' }}{{ lastTimeText ? '上次笔记：' + lastTimeText : '' }}{{ !title && !lastTimeText ? '草稿纸 · 关闭后可继续' : '' }}</div>

      <div v-if="histShow" class="draft-hist">
        <div class="dh-hd">📁 草稿历史 · 第 {{ curPage + 1 }} 页（{{ recs.length }} 条，最多 10 条）</div>
        <div v-if="!recs.length" class="dh-empty">暂无记录，涂画后点「💾 存版」</div>
        <div v-for="(r, i) in recs.slice().reverse()" :key="r.t" class="dh-row">
          <img class="dh-thumb" :src="r.url" alt="" />
          <span class="dh-time">{{ fmtTime(r.t) }}</span>
          <button class="db-b" @click="loadRec(r.url)">📂 载入</button>
          <button class="db-b db-del" @click="delRec(r.t)">🗑</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
const props = defineProps({ draftKey: { type: String, default: '' }, title: { type: String, default: '' } })
const emit = defineEmits(['close'])
const cv = ref(null)
const colors = ['#111111', '#c0261f', '#1d4ed8', '#15803d', '#b45309', '#6d28d9']
const color = ref('#111111')
const tools = [
  { k: 'pen', t: '🖊 钢笔' },
  { k: 'brush', t: '🖌 毛笔' },
  { k: 'pencil', t: '✏️ 铅笔' },
  { k: 'marker', t: '🖍 马克笔' },
  { k: 'hl', t: '🧯 荧光笔' },
  { k: 'line', t: '📏 直线' },
  { k: 'shape', t: '🔷 形状' },
  { k: 'pan', t: '🖐 平移' }
]
const TOOL_CFG = {
  pen: { mult: 1, alpha: 1, feel: 1.1 },
  brush: { mult: 2.2, alpha: 0.92, feel: 2.4 },
  pencil: { mult: 0.9, alpha: 0.72, feel: 1 },
  marker: { mult: 3.2, alpha: 0.4, feel: 0.5 },
  hl: { mult: 5, alpha: 0.2, feel: 0.3 }
}
const tool = ref('pen')
const NIBS = ['0.1', '0.2', '0.35', '0.5', '0.75', '1.0', '1.5', '2.0']
const NIB_PX = { '0.1': 0.3, '0.2': 0.6, '0.35': 1.2, '0.5': 2, '0.75': 3, '1.0': 4, '1.5': 6, '2.0': 8 }
const nib = ref('0.5')
let lastW = 0 // 线宽平滑过渡（速度笔锋用）
const eraser = ref(false)
const eraserSize = ref(22)
const histShow = ref(false)
const paperBg = ref(false) // 空白纸模式（纯纸底遮底）
const recs = ref([])
const lastTimeText = ref('')
const pages = ref([{ id: 0, t: Date.now() }])
const curPage = ref(0)
// 不透明度 0-100（默认 0=全透明）
const opacity = ref(0)
try { opacity.value = Math.max(0, Math.min(100, Number(localStorage.getItem('xc_draft_opacity') || '0') || 0)) } catch (e) {}
function saveOpa() { try { localStorage.setItem('xc_draft_opacity', String(opacity.value)) } catch (e) {} }
const bgStyle = computed(() => paperBg.value ? { background: '#f7f1e0' } : { background: 'rgba(0, 0, 0, ' + (opacity.value / 100) + ')' })

let ctx = null
let drawing = false
let dirty = false
let last = null
let lastT = 0
let prevMid = null
let raf = 0
let drawIdx = 0
let curPts = []
let undoStack = []
let view = { x: 0, y: 0 } // 画布内容偏移（无限延展）
let panStart = null
const shapeMode = ref('rect') // rect | ellipse
let snapCanvas = null
let lineStart = null

const PAGES_KEY = () => 'draft_' + String(props.draftKey || 'x') + '__pages'
const RECS_KEY = () => 'draft_' + String(props.draftKey || 'x') + '__p_' + curPage.value

function loadRecs() { try { return JSON.parse(localStorage.getItem(RECS_KEY()) || '[]') || [] } catch (e) { return [] } }
function writeRecs(r) { try { localStorage.setItem(RECS_KEY(), JSON.stringify(r)) } catch (e) {} }
function loadPages() {
  try {
    const p = JSON.parse(localStorage.getItem(PAGES_KEY()) || 'null')
    if (p && Array.isArray(p.list) && p.list.length) { pages.value = p.list; curPage.value = Math.min(p.cur || 0, p.list.length - 1); return }
  } catch (e) {}
  // 迁移旧单页记录（draft_<key>）→ 第 0 页
  try { const old = localStorage.getItem('draft_' + String(props.draftKey)); if (old) localStorage.setItem(RECS_KEY(), old) } catch (e) {}
  pages.value = [{ id: Date.now(), t: Date.now() }]
}
function savePages() { try { localStorage.setItem(PAGES_KEY(), JSON.stringify({ cur: curPage.value, list: pages.value })) } catch (e) {} }
function fit() {
  const c = cv.value
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const tmp = document.createElement('canvas')
  tmp.width = c.width; tmp.height = c.height
  if (ctx) { const t = tmp.getContext('2d'); t.drawImage(c, 0, 0) }
  c.width = c.clientWidth * dpr
  c.height = c.clientHeight * dpr
  ctx = c.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  if (tmp.width && tmp.height) ctx.drawImage(tmp, 0, 0, c.clientWidth, c.clientHeight)
}
function drawUrl(url) {
  const img = new Image()
  img.onload = () => { fit(); ctx.clearRect(0, 0, cv.value.clientWidth, cv.value.clientHeight); ctx.drawImage(img, 0, 0, cv.value.clientWidth, cv.value.clientHeight); view = { x: 0, y: 0 } }
  img.onerror = () => {}
  img.src = url
}
function fmtTime(t) {
  const d = new Date(t); const p = (n) => String(n).padStart(2, '0')
  return (d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
}
function refreshMeta() {
  recs.value = loadRecs()
  lastTimeText.value = recs.value.length ? fmtTime(recs.value[recs.value.length - 1].t) : ''
}
// 压缩存储：透明 PNG，最大宽 720px
function toStoreUrl() {
  const src = cv.value
  const scale = Math.min(1, 720 / Math.max(1, src.clientWidth))
  const w = Math.max(1, Math.round(src.clientWidth * scale))
  const h = Math.max(1, Math.round(src.clientHeight * scale))
  const c = document.createElement('canvas'); c.width = w; c.height = h
  c.getContext('2d').drawImage(src, 0, 0, w, h)
  return c.toDataURL('image/png')
}
function saveLatest() {
  if (!ctx || !dirty) return
  try {
    const url = toStoreUrl()
    const r = loadRecs()
    if (r.length) { r[r.length - 1].url = url; r[r.length - 1].t = Date.now() } else r.push({ t: Date.now(), url })
    writeRecs(r); refreshMeta()
  } catch (e) {}
}
function saveVersion() {
  const url = toStoreUrl()
  const r = loadRecs(); const lastr = r[r.length - 1]
  if (lastr && lastr.url === url) { refreshMeta(); return }
  r.push({ t: Date.now(), url }); if (r.length > 10) r.shift()
  writeRecs(r); refreshMeta()
}
function loadRec(url) { drawUrl(url); dirty = true; saveLatest(); histShow.value = false }
function delRec(t) { writeRecs(loadRecs().filter((x) => x.t !== t)); refreshMeta() }
// 多页
function saveCurPage() { try { saveLatest() } catch (e) {} }
function newPage() {
  saveCurPage()
  pages.value.push({ id: Date.now(), t: Date.now() })
  curPage.value = pages.value.length - 1
  fit(); ctx.clearRect(0, 0, cv.value.clientWidth, cv.value.clientHeight); view = { x: 0, y: 0 }; dirty = false
  undoStack = []
  savePages(); refreshMeta()
}
function switchPage(dir) {
  saveCurPage()
  curPage.value = (curPage.value + dir + pages.value.length) % pages.value.length
  const r = loadRecs()
  if (r.length) drawUrl(r[r.length - 1].url)
  else { fit(); ctx.clearRect(0, 0, cv.value.clientWidth, cv.value.clientHeight); view = { x: 0, y: 0 }; dirty = false }
  undoStack = []
  savePages(); refreshMeta()
}
// 平移（无限延展）
function panBy(dx, dy) {
  if (!dx && !dy) return
  const c = cv.value
  const tmp = document.createElement('canvas'); tmp.width = c.width; tmp.height = c.height
  const t = tmp.getContext('2d')
  const s = c.width / Math.max(1, c.clientWidth)
  t.setTransform(s, 0, 0, s, 0, 0)
  t.drawImage(c, 0, 0, c.clientWidth, c.clientHeight)
  ctx.clearRect(0, 0, c.clientWidth, c.clientHeight)
  ctx.drawImage(tmp, dx, dy, c.clientWidth, c.clientHeight)
  view.x += dx; view.y += dy
  dirty = true
}
function resetView() { panBy(-view.x, -view.y) }
function pos(e) { const r = cv.value.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
function cycleNib() { nib.value = NIBS[(NIBS.indexOf(nib.value) + 1) % NIBS.length]; lastW = 0 }
function penW(p, ev) {
  const now = Date.now(); const dt = Math.max(1, now - lastT)
  const sp = Math.hypot(p.x - last.x, p.y - last.y) / dt
  const cfg = TOOL_CFG[tool.value]
  let base = NIB_PX[nib.value] * cfg.mult
  if (sp > 0.4) base = Math.max(base * 0.55, base - (sp - 0.4) * base * 1.6)
  else base = Math.min(base * 1.8, base + (0.4 - sp) * base * 2.6)
  const pr = ev && ev.pressure > 0 ? ev.pressure : 0.5
  base *= 0.55 + pr * 0.9
  const w = Math.max(0.3, Math.min(48, base))
  lastW = lastW ? lastW + (w - lastW) * 0.35 : w
  return lastW
}
let lastPt = null
function schedule() { if (!raf) raf = requestAnimationFrame(flush) }
function flush() {
  raf = 0
  if (tool.value === 'pan' || tool.value === 'line' || tool.value === 'shape') return
  const cfg = TOOL_CFG[tool.value]
  ctx.globalCompositeOperation = eraser.value ? 'destination-out' : 'source-over'
  ctx.globalAlpha = eraser.value ? 1 : cfg.alpha
  ctx.strokeStyle = color.value
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  while (drawIdx < curPts.length) {
    const pt = curPts[drawIdx]
    ctx.lineWidth = eraser.value ? eraserSize.value : pt.w
    if (pt.first) { ctx.beginPath(); ctx.moveTo(pt.x, pt.y); prevMid = null }
    else if (!prevMid) {
      prevMid = { x: (lastPt.x + pt.x) / 2, y: (lastPt.y + pt.y) / 2 }
      ctx.beginPath(); ctx.moveTo(lastPt.x, lastPt.y); ctx.lineTo(prevMid.x, prevMid.y); ctx.stroke()
    } else {
      const mid = { x: (lastPt.x + pt.x) / 2, y: (lastPt.y + pt.y) / 2 }
      ctx.beginPath(); ctx.moveTo(prevMid.x, prevMid.y)
      ctx.quadraticCurveTo(lastPt.x, lastPt.y, mid.x, mid.y)
      ctx.stroke()
      prevMid = mid
    }
    lastPt = pt
    drawIdx++
  }
  if (drawing) schedule()
  else { ctx.globalAlpha = 1; if (dirty) saveLatest() }
}
function down(e) {
  e.preventDefault()
  const p0 = pos(e)
  if (tool.value === 'pan') { panStart = p0; return }
  if (tool.value === 'line' || tool.value === 'shape') {
    try { undoStack.push(toStoreUrl()); if (undoStack.length > 20) undoStack.shift() } catch (err) {}
    drawing = true; dirty = true; lineStart = p0
    snapCanvas = document.createElement('canvas'); snapCanvas.width = cv.value.width; snapCanvas.height = cv.value.height
    snapCanvas.getContext('2d').drawImage(cv.value, 0, 0)
    return
  }
  try { undoStack.push(toStoreUrl()); if (undoStack.length > 20) undoStack.shift() } catch (err) {}
  drawing = true; dirty = true; lastT = Date.now()
  const p = pos(e); last = p; lastPt = p; prevMid = null
  curPts = [{ x: p.x, y: p.y, w: penW(p, e), first: true }]
  drawIdx = 0
  schedule()
}
function move(e) {
  e.preventDefault()
  const p = pos(e)
  if (tool.value === 'pan') {
    if (panStart) { panBy(p.x - panStart.x, p.y - panStart.y); panStart = p }
    return
  }
  if (tool.value === 'line' || tool.value === 'shape') {
    if (!drawing || !lineStart || !snapCanvas) return
    const cw = cv.value.clientWidth, ch = cv.value.clientHeight
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1
    ctx.clearRect(0, 0, cw, ch)
    ctx.drawImage(snapCanvas, 0, 0, cw, ch)
    ctx.strokeStyle = color.value
    ctx.lineCap = 'round'
    ctx.lineWidth = Math.max(1, NIB_PX[nib.value] * 2)
    if (tool.value === 'line') {
      ctx.beginPath(); ctx.moveTo(lineStart.x, lineStart.y); ctx.lineTo(p.x, p.y); ctx.stroke()
    } else {
      const x = Math.min(lineStart.x, p.x), y = Math.min(lineStart.y, p.y)
      const ww = Math.abs(p.x - lineStart.x), hh = Math.abs(p.y - lineStart.y)
      ctx.beginPath()
      if (shapeMode.value === 'rect') ctx.rect(x, y, ww, hh)
      else ctx.ellipse(x + ww / 2, y + hh / 2, Math.max(0.5, ww / 2), Math.max(0.5, hh / 2), 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    return
  }
  if (!drawing) return
  last = p
  curPts.push({ x: p.x, y: p.y, w: penW(p, e), first: false })
  lastT = Date.now()
  schedule()
}
function up() {
  if (tool.value === 'pan') { if (panStart) { panStart = null; saveLatest() } return }
  if (tool.value === 'line' || tool.value === 'shape') {
    if (drawing) { drawing = false; lineStart = null; snapCanvas = null; dirty = true; saveLatest() }
    return
  }
  if (!drawing) return
  drawing = false
  schedule()
}
function pickTool(k) {
  if (k === 'shape') { if (tool.value === 'shape') { shapeMode.value = shapeMode.value === 'rect' ? 'ellipse' : 'rect'; return } }
  tool.value = k; eraser.value = false
}
function toggleEraser() {
  if (eraser.value) { eraserSize.value = eraserSize.value === 10 ? 22 : eraserSize.value === 22 ? 40 : 10; return }
  eraser.value = true; tool.value = 'pen'
}
function undo() {
  if (!undoStack.length) return
  const url = undoStack.pop()
  drawUrl(url)
  dirty = true
  saveLatest()
}
function clear() {
  curPts = []; drawIdx = 0
  fit(); ctx.clearRect(0, 0, cv.value.clientWidth, cv.value.clientHeight); view = { x: 0, y: 0 }
  dirty = true; saveLatest()
}
function onKey(e) {
  if (e.key === 'Escape') close()
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo() }
}
function close() { try { saveLatest() } catch (e) {}; try { savePages() } catch (e) {}; emit('close') }
onMounted(() => {
  fit(); loadPages(); refreshMeta()
  const r = loadRecs()
  // 自动加载最新笔记痕迹（自己的笔记优先显示；若旧版带纸色底可切换「📄 透」或删旧版）
  if (r.length) drawUrl(r[r.length - 1].url)
  window.addEventListener('resize', fit)
  window.addEventListener('keydown', onKey)
})
onUnmounted(() => { try { saveLatest() } catch (e) {}; try { savePages() } catch (e) {}; if (raf) cancelAnimationFrame(raf); window.removeEventListener('resize', fit); window.removeEventListener('keydown', onKey) })
</script>
