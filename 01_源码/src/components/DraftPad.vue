<template>
  <Teleport to="body">
    <Transition name="draft-panel" appear @after-leave="emit('close')">
      <div v-show="show" ref="ovRef" class="draft-ov" :class="mode" :style="[bgStyle, mode === 'mini' ? miniStyle : posStyle, sizeStyle]">
        <!-- mini：纯收回图标（不画），拖动移动、点按展开、⋯ 菜单切换 -->
        <div v-if="mode === 'mini'" class="draft-mini" @pointerdown="onMiniDown">
          <span class="draft-mini-ic">✏️</span>
          <button class="draft-mini-btn" title="菜单" @pointerdown.stop="miniMenu = !miniMenu">⋯</button>
          <div v-if="miniMenu" class="draft-mini-menu">
            <button class="db-b" title="透明批注：在整张原题上勾画" @click="goMode('overlay')">🖊 原题勾画</button>
            <button class="db-b" title="独立面板（纸垫）" @click="goMode('panel')">📦 面板</button>
            <button class="db-b db-close" title="关闭随手记" @click="close()">✕ 关闭</button>
          </div>
        </div>
        <!-- 原题勾画 / 面板：统一可拖动 + 边界自由缩放的面板 -->
        <template v-else>
          <div class="draft-hd" @pointerdown="onHdDown">
            <span class="dh-grip">⠿</span>
            <span class="dh-t">{{ title || '📝 随手记' }}</span>
            <button class="db-b" :title="mode === 'overlay' ? '切到独立面板' : '切到原题勾画（透明）'" @click="toggleMode()">{{ mode === 'overlay' ? '📦 面板' : '🖊 原题勾画' }}</button>
            <button class="db-b" title="收回为小图标" @click="goMini()">➖</button>
            <button class="db-b db-close" title="关闭随手记" @click="close()">✕</button>
          </div>
          <canvas
ref="cv" class="draft-canvas" :style="{ cursor: tool === 'pan' ? 'grab' : eraser ? 'cell' : 'crosshair' }"
            @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up"></canvas>
          <div class="draft-bar">
            <button class="db-b" :class="{ on: tool === 'pen' && !eraser }" title="钢笔" @click="pickTool('pen')">🖊 钢笔</button>
            <button class="db-b" :class="{ on: eraser }" :title="eraser ? '再次点击切换橡皮大小（小/中/大）' : '橡皮擦除'" @click="toggleEraser()">🧽 {{ eraser ? '橡皮·' + eraserSize : '橡皮' }}</button>
            <button class="db-b" title="清空画布" @click="clear()">🗑 清空</button>
            <button class="db-b" :class="{ on: barMore }" :title="barMore ? '收起更多工具' : '展开更多工具'" @click="barMore = !barMore">{{ barMore ? '▾ 收起' : '⋯ 更多' }}</button>
            <template v-if="barMore">
              <span class="db-sep"></span>
              <button v-for="t in tools" :key="t.k" class="db-b" :class="{ on: tool === t.k && !eraser }" @click="pickTool(t.k)">{{ t.k === 'shape' ? (shapeMode === 'rect' ? '🔷 方' : '⭕ 圆') : t.t }}</button>
              <span class="db-sep"></span>
              <button v-for="col in colors" :key="col" class="db-color" :class="{ on: !eraser && tool !== 'pan' && color === col }" :style="{ background: col }" @click="color = col; eraser = false; tool = 'pen'"></button>
              <input v-model="color" type="color" class="db-colorpick" title="取色器：自由选择任意颜色" @input="eraser = false; tool = 'pen'" />
              <span class="db-sep"></span>
              <button class="db-b" :title="'笔头（真实笔尖 mm）：' + NIBS.join(' / ')" @click="cycleNib()">✒️ {{ nib }}mm</button>
              <button class="db-b" :disabled="!undoStack.length" @click="undo()">↩ 撤销</button>
              <button class="db-b" title="画布复位到中心" @click="resetView()">🏠 复位</button>
              <button class="db-b" title="新建空白草稿页" @click="newPage()">➕ 新页</button>
              <button class="db-b" title="上一页" @click="switchPage(-1)">◀ {{ curPage + 1 }}/{{ pages.length }}</button>
              <button class="db-b" title="下一页" @click="switchPage(1)">▶</button>
              <button class="db-b db-save" @click="saveVersion()">💾 存版</button>
              <button class="db-b" :class="{ on: histShow }" @click="histShow = !histShow">📁 记录 {{ recs.length }}</button>
            </template>
            <template v-if="mode === 'panel' && barMore">
              <span class="db-sep"></span>
              <button class="db-b" :class="{ on: paperBg }" title="空白纸=纯纸底遮住底层；透明=叠加在界面上" @click="paperBg = !paperBg">📄 {{ paperBg ? '纸' : '透' }}</button>
              <span class="db-opa">不透明 {{ opacity }}%</span>
              <input v-model.number="opacity" type="range" class="db-range" min="0" max="100" step="1" @input="saveOpa" @change="saveOpa" />
            </template>
          </div>
          <div v-if="title || lastTimeText" class="draft-hint">{{ title ? title + (lastTimeText ? ' · ' : '') : '' }}{{ lastTimeText ? '上次笔记：' + lastTimeText : '' }}{{ !title && !lastTimeText ? '按住顶部可拖动 · 拖边缘可缩放' : '' }}</div>

          <div v-if="histShow" class="draft-hist">
            <div class="dh-hd">📁 草稿历史 · 第 {{ curPage + 1 }} 页（{{ recs.length }} 条，最多 10 条）</div>
            <div v-if="!recs.length" class="dh-empty">暂无记录，涂画后点「💾 存版」</div>
            <div v-for="r in recs.slice().reverse()" :key="r.t" class="dh-row">
              <img class="dh-thumb" :src="r.url" alt="" />
              <span class="dh-time">{{ fmtTime(r.t) }}</span>
              <button class="db-b" @click="loadRec(r.url)">📂 载入</button>
              <button class="db-b db-del" @click="delRec(r.t)">🗑</button>
            </div>
          </div>

          <!-- 自由缩放：右/下/右下角 拖拽 -->
          <div class="draft-rz rz-e" title="拖拽调整宽度" @pointerdown.stop="onRzDown('e', $event)"></div>
          <div class="draft-rz rz-s" title="拖拽调整高度" @pointerdown.stop="onRzDown('s', $event)"></div>
          <div class="draft-rz rz-se" title="拖拽同时调整宽高" @pointerdown.stop="onRzDown('se', $event)"></div>
        </template>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
const props = defineProps({ draftKey: { type: String, default: '' }, title: { type: String, default: '' }, initialMode: { type: String, default: '' } })
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
const barMore = ref(false) // 工具条默认收起：只留 钢笔/橡皮/清空，点「⋯ 更多」展开
const paperBg = ref(false) // 空白纸模式（纯纸底遮底）
const recs = ref([])
const lastTimeText = ref('')
const pages = ref([{ id: 0, t: Date.now() }])
const curPage = ref(0)
// 不透明度 0-100（默认 0=全透明）
const opacity = ref(0)
try { opacity.value = Math.max(0, Math.min(100, Number(localStorage.getItem('xc_draft_opacity') || '0') || 0)) } catch (e) {}
function saveOpa() { try { localStorage.setItem('xc_draft_opacity', String(opacity.value)) } catch (e) {} }
// 批注模式强制全透明（原题清晰可见）；面板模式才用「不透明」滑杆/纸色
const bgStyle = computed(() => {
  if (mode.value === 'overlay' || mode.value === 'mini') return { background: 'transparent' }
  return paperBg.value ? { background: '#f7f1e0' } : { background: 'rgba(0, 0, 0, ' + (opacity.value / 100) + ')' }
})

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
  if (!c) return
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
  if (!cv.value) return
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
  if (mode.value === 'mini') return // mini 涂鸦为临时预览，不落盘，防污染主笔记
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
function pos(e) {
  const r = cv.value.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}
function restoreLatest() {
  const r = loadRecs()
  if (r.length) drawUrl(r[r.length - 1].url)
}
function cycleNib() { nib.value = NIBS[(NIBS.indexOf(nib.value) + 1) % NIBS.length]; lastW = 0 }
function penW(p, ev) {
  const now = Date.now(); const dt = Math.max(1, now - lastT)
  const sp = Math.hypot(p.x - last.x, p.y - last.y) / dt
  const cfg = TOOL_CFG[tool.value]
  let base = NIB_PX[nib.value] * cfg.mult
  const isPen = ev && ev.pointerType === 'pen'
  // 笔（Apple Pencil/手写笔）：压力主导，速度不再参与，动态范围更大（iPad 手感）
  if (isPen) {
    const pr = ev && ev.pressure > 0 ? Math.max(0, Math.min(1, ev.pressure)) : 0.5
    base *= 0.28 + pr * 1.4
  } else {
    if (sp > 0.4) base = Math.max(base * 0.55, base - (sp - 0.4) * base * 1.6)
    else base = Math.min(base * 1.8, base + (0.4 - sp) * base * 2.6)
    const pr = ev && ev.pressure > 0 ? Math.max(0, Math.min(1, ev.pressure)) : 0.5
    base *= 0.55 + pr * 0.9
  }
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
    try { undoStack.push(toStoreUrl()); if (undoStack.length > 20) undoStack.shift() } catch (e) {}
    drawing = true; dirty = true; lineStart = p0
    snapCanvas = document.createElement('canvas'); snapCanvas.width = cv.value.width; snapCanvas.height = cv.value.height
    snapCanvas.getContext('2d').drawImage(cv.value, 0, 0)
    return
  }
  try { undoStack.push(toStoreUrl()); if (undoStack.length > 20) undoStack.shift() } catch (e) {}
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
// 面板开合：close 先走收起动画，Transition 结束后再真正卸载
const show = ref(true)
function close() { try { saveLatest() } catch (e) {}; try { savePages() } catch (e) {}; show.value = false }
// 三态：overlay=全屏透明批注（原题勾画，默认）；panel=独立小面板；mini=圆形 ✏️ 小图标（同原悬浮球）
const savedMode = localStorage.getItem('xc_draft_mode')
const mode = ref(props.initialMode || (savedMode === 'panel' || savedMode === 'mini' ? savedMode : 'overlay'))
const prevMode = ref('panel') // 进入 mini 前的完整模式，点按 mini 返回
const saveMode = () => { try { localStorage.setItem('xc_draft_mode', mode.value) } catch (e) {} }
function toggleMode() {
  mode.value = mode.value === 'overlay' ? 'panel' : 'overlay'
  prevMode.value = mode.value
  saveMode()
  requestAnimationFrame(() => { try { fit() } catch (e) {} })
}
function goMini() {
  if (mode.value === 'overlay' || mode.value === 'panel') prevMode.value = mode.value
  mode.value = 'mini'
  saveMode()
}
function goMode(m) {
  mode.value = m
  if (m !== 'mini') prevMode.value = m
  saveMode()
  if (m === 'panel' || m === 'overlay') requestAnimationFrame(() => { try { fit() } catch (e) {}; try { restoreLatest() } catch (e) {} })
}
const miniMenu = ref(false)
// 迷你圆形图标位置（独立记忆，默认右下角同原悬浮球）
const miniPos = ref(null)
try { const p = JSON.parse(localStorage.getItem('xc_draft_mini_pos') || 'null'); if (p && p.x != null) miniPos.value = p } catch (e) {}
const miniStyle = computed(() => miniPos.value ? { left: miniPos.value.x + 'px', top: miniPos.value.y + 'px', right: 'auto', bottom: 'auto' } : {})
// 自由缩放：size = 实际像素尺寸（原题勾画/面板通用），拖边缘自由缩放，不再用固定档位
const ovRef = ref(null)
const _vw = window.innerWidth || 1280
const _vh = window.innerHeight || 800
const size = ref({ w: Math.min(900, _vw - 24), h: Math.min(760, _vh - 100) })
try { const s = JSON.parse(localStorage.getItem('xc_draft_size') || 'null'); if (s && s.w > 200 && s.h > 160) size.value = s } catch (e) {}
const sizeStyle = computed(() => mode.value === 'mini' ? {} : { width: size.value.w + 'px', height: size.value.h + 'px' })
let rzRaf = 0
function rafFit() { if (rzRaf) return; rzRaf = requestAnimationFrame(() => { rzRaf = 0; try { fit() } catch (e) {} }) }
function onRzDown(dir, e) {
  e.preventDefault(); e.stopPropagation()
  const startW = size.value.w, startH = size.value.h
  const sx = e.clientX, sy = e.clientY
  const onMove = (ev) => {
    const vw = window.innerWidth, vh = window.innerHeight
    let w = (dir === 'e' || dir === 'se') ? startW + (ev.clientX - sx) : startW
    let h = (dir === 's' || dir === 'se') ? startH + (ev.clientY - sy) : startH
    w = Math.max(280, Math.min(vw - 24, w))
    h = Math.max(200, Math.min(vh - 48, h))
    size.value = { w: Math.round(w), h: Math.round(h) }
    try { localStorage.setItem('xc_draft_size', JSON.stringify(size.value)) } catch (_) {}
    rafFit()
  }
  const onUp = () => { window.removeEventListener('pointermove', onMove, true); window.removeEventListener('pointerup', onUp, true) }
  window.addEventListener('pointermove', onMove, true)
  window.addEventListener('pointerup', onUp, true)
}
// 面板位置（可拖动；默认右下角，窗口缩放时钳制在视口内）
const pPos = ref(null)
const posStyle = computed(() => (mode.value === 'mini' || !pPos.value) ? {} : { left: pPos.value.x + 'px', top: pPos.value.y + 'px', right: 'auto', bottom: 'auto' })
function clampPanel() {
  const vw = window.innerWidth, vh = window.innerHeight
  const el = document.querySelector('.draft-ov')
  const w = (el && el.offsetWidth) || (mode.value === 'mini' ? 56 : 420)
  const h = (el && el.offsetHeight) || (mode.value === 'mini' ? 56 : 480)
  if (mode.value === 'mini') {
    if (!miniPos.value) return
    miniPos.value = { x: Math.max(4, Math.min(vw - w - 4, miniPos.value.x)), y: Math.max(4, Math.min(vh - h - 4, miniPos.value.y)) }
    return
  }
  if (!pPos.value) return
  pPos.value = { x: Math.max(4, Math.min(vw - w - 4, pPos.value.x)), y: Math.max(4, Math.min(vh - h - 4, pPos.value.y)) }
}
function onMiniDown(e) {
  if (e.target.closest('.draft-mini-btn') || e.target.closest('.draft-mini-menu')) return
  e.preventDefault()
  e.stopPropagation()
  const el = e.currentTarget.closest('.draft-ov')
  const r = el.getBoundingClientRect()
  const sx = e.clientX, sy = e.clientY
  const ox = sx - r.left, oy = sy - r.top
  let moved = false
  let cur = { x: r.left, y: r.top }
  const apply = () => { el.style.left = cur.x + 'px'; el.style.top = cur.y + 'px'; el.style.right = 'auto'; el.style.bottom = 'auto' }
  const onMove = (ev) => {
    if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) moved = true
    cur = { x: Math.max(4, Math.min(window.innerWidth - 56, ev.clientX - ox)), y: Math.max(4, Math.min(window.innerHeight - 56, ev.clientY - oy)) }
    apply()
  }
  const onUp = () => {
    window.removeEventListener('pointermove', onMove, true)
    window.removeEventListener('pointerup', onUp, true)
    if (moved) {
      miniPos.value = cur
      try { localStorage.setItem('xc_draft_mini_pos', JSON.stringify(cur)) } catch (_) {}
    } else {
      goMode(prevMode.value)
    }
  }
  window.addEventListener('pointermove', onMove, true)
  window.addEventListener('pointerup', onUp, true)
}
function onHdDown(e) {
  if (e.target.closest('button')) return
  e.preventDefault()
  const el = e.currentTarget.closest('.draft-ov')
  const r = el.getBoundingClientRect()
  const sx = e.clientX, sy = e.clientY
  const ox = sx - r.left, oy = sy - r.top
  const onMove = (ev) => {
    pPos.value = { x: ev.clientX - ox, y: ev.clientY - oy }
    clampPanel()
  }
  const onUp = () => {
    window.removeEventListener('pointermove', onMove, true)
    window.removeEventListener('pointerup', onUp, true)
  }
  window.addEventListener('pointermove', onMove, true)
  window.addEventListener('pointerup', onUp, true)
}
onMounted(() => {
  fit(); loadPages(); refreshMeta()
  const r = loadRecs()
  // 自动加载最新笔记痕迹（自己的笔记优先显示；若旧版带纸色底可切换「📄 透」或删旧版）
  if (r.length) drawUrl(r[r.length - 1].url)
  window.addEventListener('resize', fit)
  window.addEventListener('resize', clampPanel)
  window.addEventListener('keydown', onKey)
})
onUnmounted(() => { try { saveLatest() } catch (e) {}; try { savePages() } catch (e) {}; if (raf) cancelAnimationFrame(raf); window.removeEventListener('resize', fit); window.removeEventListener('resize', clampPanel); window.removeEventListener('keydown', onKey) })
</script>
