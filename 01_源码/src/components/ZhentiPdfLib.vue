<script setup>
// ZhentiPdfLib.vue —— 本地真题PDF卷库 + 内置阅读器（自建原生宿主·SAF 选文件夹；pdfjs 渲染）
/* global atob, btoa */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { isNativeHost, nativePickFolder } from '../utils/platform'
import { showToast } from '../utils/toast'

defineEmits(['close'])
const props = defineProps({ initialFile: { type: String, default: '' } })
const tree = ref('')
const treeName = ref('')
try { tree.value = localStorage.getItem('xc_pdf_tree') || ''; treeName.value = localStorage.getItem('xc_pdf_tree_name') || '' } catch (e) {}
const path = ref([]) // 目录栈：{name, uri}
const items = ref([])
const msg = ref('')
// 内置真题包模式（随包 zhenti-pdf/index.json；用户无需自己有 PDF）
const srcMode = ref(isNativeHost() ? 'bundle' : 'online')
const groups = ref([])
const gSel = ref(null)
async function readBundledAsset(rel) {
  const clean = String(rel || '').replace(/^\/+/, '')
  if (location.protocol === 'file:' && window.xcnative && window.xcnative.readAssetB64) {
    const b64 = window.xcnative.readAssetB64('zhenti-pdf/' + clean)
    if (!b64 || String(b64).indexOf('ERR:') === 0) throw new Error(String(b64 || '读取失败').slice(4))
    return b64ToU8(b64).buffer
  }
  const res = await fetch('./zhenti-pdf/' + clean, { cache: 'no-cache' })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  return await res.arrayBuffer()
}
async function loadBundle() {
  msg.value = ''
  const urls = [
    './zhenti-pdf/index.json',
    'https://kaogong-ai.pages.dev/zhenti-pdf/index.json',
    'https://cdn.jsdelivr.net/gh/ly7638714/kaogong-ai@main/01_%E6%BA%90%E7%A0%81/public/zhenti-pdf/index.json',
    'https://raw.githubusercontent.com/ly7638714/kaogong-ai/main/01_%E6%BA%90%E7%A0%81/public/zhenti-pdf/index.json',
    'https://gitee.com/KKAALY13/kaogong-ai/raw/main/01_%E6%BA%90%E7%A0%81/public/zhenti-pdf/index.json'
  ]
  try {
    let j = null
    const errs = []
    if (location.protocol === 'file:' && window.xcnative && window.xcnative.readAssetB64) {
      try {
        const buf = await readBundledAsset('index.json')
        j = JSON.parse(new TextDecoder().decode(new Uint8Array(buf)))
      } catch (e) { errs.push((e && e.message) || e) }
    }
    if (!j) {
      for (const u of urls) {
        try {
          const res = await fetch(u, { cache: 'no-cache' })
          if (!res.ok) throw new Error('HTTP ' + res.status)
          j = await res.json(); break
        } catch (e) { errs.push((e && e.message) || e) }
      }
    }
    if (!j) throw new Error(errs.join('；'))
    groups.value = (j && j.groups) || []
    gSel.value = null
    if (!groups.value.length) msg.value = '当前版本未内置真题包（用 _真题PDF入库.ps1 生成后再打包）'
  } catch (e) { groups.value = []; gSel.value = null; msg.value = '未找到真题卷清单：' + (e && e.message || e) }
}
// ===== 在线真题库（多镜像自动切换：本站/Gitee 国内优先，jsDelivr/GitHub 仅兜底）=====
const MIRRORS = [
  { name: '本站(国内)', base: './zhenti-pdf/' },
  { name: 'jsDelivr(国内加速)', base: 'https://cdn.jsdelivr.net/gh/ly7638714/kaogong-ai@main/01_%E6%BA%90%E7%A0%81/public/zhenti-pdf/' },
  { name: 'GitHub raw(备)', base: 'https://raw.githubusercontent.com/ly7638714/kaogong-ai/main/01_%E6%BA%90%E7%A0%81/public/zhenti-pdf/' },
  { name: 'Gitee(国内兜底)', base: 'https://gitee.com/KKAALY13/kaogong-ai/raw/main/01_%E6%BA%90%E7%A0%81/public/zhenti-pdf/' }
]
function onlineMirrorOrder() {
  const list = []
  const seen = {}
  try {
    const order = JSON.parse(localStorage.getItem('xc_pdf_online_order') || 'null')
    if (Array.isArray(order)) for (const n of order) { const m = MIRRORS.find((x) => x.name === n); if (m && !seen[n]) { list.push(m); seen[n] = 1 } }
  } catch (e) {}
  for (const m of MIRRORS) if (!seen[m.name]) list.push(m)
  return list
}
function rememberOnlineOk(name) {
  try {
    const cur = onlineMirrorOrder().map((x) => x.name).filter((n) => n !== name)
    cur.unshift(name)
    localStorage.setItem('xc_pdf_online_order', JSON.stringify(cur))
  } catch (e) {}
}
const ONLINE_GROUPS = [
  { name: '国考2022-2026', files: ["2022年国家公务员考试《行测》真题（副省级).pdf","2022年国家公务员考试《行测》真题（地市级).pdf","2022年国家公务员考试《行测》真题（行政执法).pdf","2023年国家公务员录用考试《行测》副省级-题.pdf","2023年国家公务员录用考试《行测》地市级-题.pdf","2023年国家公务员录用考试《行测》行政执法-题.pdf","2024年国家公务员录用考试《行测》题（副省级）.pdf","2024年国家公务员录用考试《行测》题（地市级）.pdf","2024年国家公务员录用考试《行测》题（行政执法卷）.pdf","2025年国家公务员录用考试《行测》题（副省级）.pdf","2025年国家公务员录用考试《行测》题（地市级）.pdf","2025年国家公务员录用考试《行测》题（行政执法卷）.pdf","2026年国考《行测》（副省级）试卷.pdf","2026年国考《行测》（地市类）试卷.pdf","2026年国考《行测》（行政执法类）试卷.pdf"] },
  { name: '贵州省考2024-2026', files: ["2024年贵州省公务员录用考试《行测》题（网友回忆版）.pdf","2025年贵州省公务员录用考试《行测》题（网友回忆版）.pdf","2026年贵州省公务员录用考试《行测》题（网友回忆版）.pdf"] }
]
const onlineGroups = computed(() => (groups.value.length ? groups.value : ONLINE_GROUPS))
const oG = ref(null)
function fileRel(gname, fname) {
  const f = String(fname || '')
  if (String(gname || '') === '未分类' || !String(gname || '').trim()) return f
  return String(gname) + '/' + f
}
function bufToB64(buf) {
  const u8 = new Uint8Array(buf); let bin = ''; const CH = 0x8000
  for (let i = 0; i < u8.length; i += CH) bin += String.fromCharCode.apply(null, u8.subarray(i, i + CH))
  return btoa(bin)
}
function cacheName(gname, fname) { return (String(gname).indexOf('国考') >= 0 ? 'gk' : 'gz') + '_' + String(fname).replace(/[^0-9A-Za-z\u4e00-\u9fa5._-]/g, '_') }
async function readFromCache(cname, fname) {
  try {
    const b64 = window.xcnative.readCache(cname) || ''
    if (String(b64).indexOf('ERR:') !== 0) { const buf = b64ToU8(b64).buffer; await loadPdfData(fname, buf); return true }
  } catch (e) {}
  return false
}
async function fetchFirstOk(rel) {
  const errs = []
  for (const m of onlineMirrorOrder()) {
    try {
      msg.value = '在线加载中…（' + m.name + '）'
      const res = await fetch(m.base + rel, { cache: 'no-cache' })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      rememberOnlineOk(m.name)
      return await res.arrayBuffer()
    } catch (e) { errs.push(m.name + ':' + (e && e.message || e)) }
  }
  throw new Error(errs.join('；'))
}
async function cacheAllOnline() {
  const total = onlineGroups.value.reduce((a, g) => a + (g.files || []).length, 0)
  let done = 0, ok = 0
  msg.value = '开始缓存全部卷（0/' + total + '）…'
  for (const g of onlineGroups.value) {
    for (const f of g.files || []) {
      const cname = cacheName(g.name, f)
      if (window.xcnative.cacheHas(cname)) { done++; ok++; continue }
      try {
        const rel = fileRel(g.name, f).split('/').map(encodeURIComponent).join('/')
        const buf = await fetchFirstOk(rel)
        msg.value = '缓存中 ' + (done + 1) + '/' + total + '：' + f
        window.xcnative.cacheSave(cname, bufToB64(buf))
        ok++
      } catch (e) { msg.value = '缓存失败于：' + f + '（' + (e && e.message || e) + '），可稍后重试' }
      done++
    }
  }
  msg.value = '✅ 缓存完成：' + ok + '/' + total + ' 份（之后可完全离线阅读；空间约 55MB）'
}
async function openOnline(gname, fname) {
  const cname = cacheName(gname, fname)
  try {
    if (window.xcnative && window.xcnative.cacheHas && window.xcnative.cacheHas(cname)) {
      msg.value = '读取本地缓存…'
      if (await readFromCache(cname, fname)) return
    }
    const rel = fileRel(gname, fname).split('/').map(encodeURIComponent).join('/')
    const buf = await fetchFirstOk(rel)
    await loadPdfData(fname, buf)
    try { window.xcnative.cacheSave(cname, bufToB64(buf)) } catch (e) {} // 打开即缓存，下次离线可用
  } catch (e) { msg.value = '在线加载失败：' + (e && e.message || e) + '\n可先用「缓存全部」或离线包，再重试。' }
}

// ===== 在线真题卷包：蓝奏云国内下载 + 本地 zip 导入；APK 默认已随包内置 =====
const PACK_URL = 'https://lyuan.lanzoue.com/iWMVu470k49a'
const packItems = ref([])
const packMsg = ref('')
const packBusy = ref(false)
async function listPack() {
  try {
    const arr = JSON.parse(window.xcnative.listInternalPack() || '[]')
    packItems.value = (arr || []).filter((it) => !it.dir && /pdf$/i.test(it.name)).sort((a, b) => (a.path < b.path ? -1 : 1))
    if (!packItems.value.length) packMsg.value = '尚未安装真题卷包'
    else packMsg.value = '已安装 ' + packItems.value.length + ' 份，点任意卷开始阅读（已离线，无需网络）'
  } catch (e) { packMsg.value = '读取失败：' + e.message }
}
let zipInput = null
function importZipLocal() {
  if (!zipInput) { zipInput = document.createElement('input'); zipInput.type = 'file'; zipInput.accept = '.zip,application/zip' }
  zipInput.onchange = async () => {
    const f = zipInput.files && zipInput.files[0]
    if (!f) return
    try {
      packBusy.value = true
      packMsg.value = '正在导入并解压：' + f.name + '（50MB 需片刻）…'
      const buf = await f.arrayBuffer()
      window.__xcOnPack = (id, res) => {
        packBusy.value = false
        packMsg.value = String(res).indexOf('ok:') === 0 ? '✅ 已导入 ' + String(res).slice(3) + ' 份' : '导入失败：' + String(res).slice(4)
        listPack()
      }
      window.xcnative.installZhentiPackB64(bufToB64(buf), Math.floor(Math.random() * 90000) + 1000)
    } catch (e) { packBusy.value = false; packMsg.value = '导入失败：' + (e && e.message || e) }
    zipInput.value = ''
  }
  zipInput.click()
}
function openLanzou() {
  try {
    if (window.xcnative && window.xcnative.openUri) window.xcnative.openUri(PACK_URL, 'text/html')
    else window.open(PACK_URL, '_blank', 'noopener')
  } catch (e) { showToast('无法打开蓝奏云：' + (e && e.message || e), 'error') }
}
async function openInternal(path) {
  try {
    msg.value = '加载 PDF…'
    const b64 = window.xcnative.readInternalPack(path) || ''
    if (String(b64).indexOf('ERR:') === 0) { msg.value = String(b64).slice(4); return }
    const buf = b64ToU8(b64).buffer
    await loadPdfData(String(path).split('/').pop(), buf)
  } catch (e) { msg.value = '打开失败：' + (e && e.message || e) }
}
async function loadPdfData(name, dataBuf) {
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
    pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.min.mjs'
    const pdf = await pdfjsLib.getDocument({ data: dataBuf }).promise
    try { if (pdfDoc) pdfDoc.destroy() } catch (e) {}
    pdfDoc = pdf; pages.value = pdf.numPages; page.value = 1; pdfName.value = name; pdfUri.value = ''; scale.value = 1; viewer.value = true; msg.value = ''
    await render()
  } catch (e) { msg.value = '打开失败：' + (e && e.message || e) }
}
async function openBundled(rel) {
  try {
    busy.value = true; msg.value = '加载 PDF…'
    const data = new Uint8Array(await readBundledAsset(rel))
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
    pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.min.mjs'
    const pdf = await pdfjsLib.getDocument({ data: data.buffer }).promise
    try { if (pdfDoc) pdfDoc.destroy() } catch (e) {}
    pdfDoc = pdf; pages.value = pdf.numPages; page.value = 1; pdfName.value = String(rel).split('/').pop(); pdfUri.value = ''; scale.value = 1; viewer.value = true; msg.value = ''
    await render()
  } catch (e) { msg.value = '打开失败：' + (e && e.message || e) } finally { busy.value = false }
}
const viewer = ref(false)
const pdfName = ref('')
const pdfUri = ref('')
const page = ref(1)
const pages = ref(0)
const scale = ref(1)
const busy = ref(false)
const canvasEl = ref(null)
let pdfDoc = null

function storeTree(u, n) { tree.value = u; treeName.value = n; try { localStorage.setItem('xc_pdf_tree', u); localStorage.setItem('xc_pdf_tree_name', n) } catch (e) {} }
async function pickRoot() {
  if (!isNativeHost()) { showToast('请用自建原生宿主（当前不支持选择文件夹）', 'info'); return }
  const r = await nativePickFolder()
  if (!r || !r.ok) return
  storeTree(r.treeUri, r.name); path.value = []; await load(r.treeUri)
}
async function load(uri) {
  busy.value = true; msg.value = ''
  try { const res = window.xcnative.listFolder(uri) || '[]'; const arr = JSON.parse(res); items.value = (arr || []).map((it) => ({ name: it.name, uri: it.uri, dir: !!it.dir })) } catch (e) { msg.value = '读取失败：' + e.message }
  busy.value = false
}
function itemTap(it) { if (it.dir) { path.value.push({ name: it.name, uri: it.uri }); load(it.uri) } else if (/pdf$/i.test(it.name)) { openPdf(it.uri, it.name) } else { showToast('仅支持 PDF 文件', 'info') } }
function upOne() { const p = path.value.pop(); if (p) load(p.uri) }
function backToRoot() { path.value = []; if (tree.value) load(tree.value) }
function b64ToU8(b64) {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); const CH = 0x8000
  for (let i = 0; i < bin.length; i += CH) { const sub = bin.substr(i, CH); for (let j = 0; j < sub.length; j++) u8[i + j] = sub.charCodeAt(j) }
  return u8
}
async function openPdf(uri, name) {
  try {
    busy.value = true; msg.value = '加载 PDF…'
    const b64 = window.xcnative.readFileB64(uri) || ''
    if (String(b64).indexOf('ERR:') === 0) { msg.value = String(b64).slice(4); return }
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
    pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.min.mjs'
    const pdf = await pdfjsLib.getDocument({ data: b64ToU8(b64).buffer }).promise
    try { if (pdfDoc) pdfDoc.destroy() } catch (e) {}
    pdfDoc = pdf; pages.value = pdf.numPages; page.value = 1; pdfName.value = name; pdfUri.value = uri; scale.value = 1; viewer.value = true; msg.value = ''
    await render()
  } catch (e) { msg.value = '打开失败：' + (e && e.message || e) } finally { busy.value = false }
}
async function render() {
  if (!pdfDoc || !canvasEl.value) return
  try {
    const p = await pdfDoc.getPage(page.value)
    const vp1 = p.getViewport({ scale: 1 })
    const box = canvasEl.value.parentElement
    const cw = Math.max(220, (box && box.clientWidth) || 900) - 16
    const s = (cw / vp1.width) * scale.value
    const vp = p.getViewport({ scale: s })
    const cv = canvasEl.value; cv.width = vp.width; cv.height = vp.height
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height)
    await p.render({ canvasContext: ctx, viewport: vp }).promise
  } catch (e) { msg.value = '渲染失败：' + (e && e.message || e) }
}
function prevPage() { if (page.value > 1) { page.value--; render() } }
function nextPage() { if (page.value < pages.value) { page.value++; render() } }
function zoomIn() { scale.value = Math.min(3, scale.value + 0.25); render() }
function zoomOut() { scale.value = Math.max(0.5, scale.value - 0.25); render() }
function fitW() { scale.value = 1; render() }
function exitViewer() { try { if (pdfDoc) pdfDoc.destroy() } catch (e) {}; pdfDoc = null; viewer.value = false }
function sysOpen() { if (!pdfUri.value) { showToast('内置真题包请在阅读器内查看（可整卷截图/逐页）', 'info'); return } try { window.xcnative.openUri(pdfUri.value, 'application/pdf') } catch (e) {} }
function sysShare() { try { if (pdfUri.value) window.xcnative.shareUri(pdfUri.value, 'application/pdf', pdfName.value) } catch (e) {} }
onMounted(async () => {
  await loadBundle()
  const target = String(props.initialFile || '').trim()
  if (!target || !groups.value.length) return
  for (const g of groups.value) {
    if ((g.files || []).includes(target)) { await openBundled(fileRel(g.name, target)); return }
  }
})
onUnmounted(() => { try { if (pdfDoc) pdfDoc.destroy() } catch (e) {} })
</script>

<template>
  <div class="zpv-mask" @click.self="$emit('close')">
    <div class="zpv-panel">
      <div class="zpv-top">
        <button class="zpv-btn" @click="$emit('close')">← 返回</button>
        <span class="zpv-title">📄 真题PDF卷库<span v-if="treeName" class="zpv-f">（{{ treeName }}）</span></span>
        <button class="zpv-btn" @click="pickRoot()">📂 换文件夹</button>
      </div>

      <div class="zpv-modes">
        <button class="zpv-mode" :class="{ on: srcMode === 'online' }" @click="srcMode = 'online'; oG = null">🌐 在线真题库</button>
        <button class="zpv-mode" :class="{ on: srcMode === 'pack' }" @click="srcMode = 'pack'; listPack()">📥 真题卷包</button>
        <button class="zpv-mode" :class="{ on: srcMode === 'bundle' }" @click="srcMode = 'bundle'; loadBundle()">📦 内置真题包</button>
        <button class="zpv-mode" :class="{ on: srcMode === 'folder' }" @click="srcMode = 'folder'">📂 外部文件夹</button>
      </div>

      <!-- 在线真题库：分组 → 卷 → 流式阅读 -->
      <template v-if="srcMode === 'online' && !viewer">
        <div class="zpv-bread">
          <button class="zpv-link" @click="oG = null">全部组</button>
          <template v-if="oG"><span class="zpv-sep">/</span><span class="zpv-name">{{ oG.name }}</span></template>
          <span class="zpv-tip">🌐 云端直读 · 打开即缓存</span>
        </div>
        <div class="zpv-list">
          <div style="padding:2px 0 8px"><button class="zpv-btn pri" @click="cacheAllOnline()">⏬ 缓存全部（一次搞定，之后离线可读）</button></div>
          <template v-if="!oG">
            <button v-for="(g, gi) in onlineGroups" :key="gi" class="zpv-it" @click="oG = g">
              <span class="zpv-ic">📁</span><span class="zpv-name">{{ g.name }}</span><span class="zpv-tip">{{ (g.files || []).length }} 卷</span>
            </button>
          </template>
          <template v-else>
            <button v-for="(f, fi) in oG.files" :key="fi" class="zpv-it" @click="openOnline(oG.name, f)">
              <span class="zpv-ic">📄</span><span class="zpv-name">{{ f }}</span>
            </button>
          </template>
        </div>
      </template>

      <!-- 在线真题卷包：下载→列表→阅读 -->
      <template v-if="srcMode === 'pack' && !viewer">
        <div class="zpv-bread"><span class="zpv-tip">APK 已随包内置 28 卷；网页/旧版可选蓝奏云下载后导入</span></div>
        <div class="zpv-list">
          <div v-if="packMsg" class="zpv-msg">{{ packMsg }}</div>
          <div v-if="!packItems.length && !packBusy" class="zpv-empty">
            <p>真题卷包含：国考 2017-2026 + 贵州 2024-2026，共 28 卷，约 39MB。<br/>APK 已内置，无需下载；网页或旧版可从蓝奏云取 zip 后导入。</p>
            <button class="zpv-btn pri" @click="openLanzou()">☁️ 蓝奏云下载卷包</button>
            <button class="zpv-btn" @click="importZipLocal()">📂 选择 zip 导入</button>
          </div>
          <button v-for="(f, i) in packItems" :key="i" class="zpv-it" @click="openInternal(f.path)">
            <span class="zpv-ic">📄</span><span class="zpv-name">{{ f.path }}</span>
          </button>
        </div>
      </template>

      <!-- 内置真题包：组 → 卷 → 阅读 -->
      <template v-if="srcMode === 'bundle' && !viewer">
        <div class="zpv-bread">
          <button class="zpv-link" @click="gSel = null">全部组</button>
          <template v-if="gSel"><span class="zpv-sep">/</span><span class="zpv-name">{{ gSel.name }}</span></template>
          <span class="zpv-tip">{{ groups.length ? '分组' : '' }}</span>
        </div>
        <div class="zpv-list">
          <div v-if="msg" class="zpv-msg">{{ msg }}</div>
          <template v-if="!gSel">
            <button v-for="(g, gi) in groups" :key="gi" class="zpv-it" @click="gSel = g">
              <span class="zpv-ic">📁</span><span class="zpv-name">{{ g.name }}</span><span class="zpv-tip">{{ (g.files || []).length }} 卷</span>
            </button>
          </template>
          <template v-else>
              <button v-for="(f, fi) in gSel.files" :key="fi" class="zpv-it" @click="openBundled(fileRel(gSel.name, f))">
              <span class="zpv-ic">📄</span><span class="zpv-name">{{ f.split('/').pop() }}</span>
            </button>
          </template>
        </div>
      </template>

      <!-- 未选文件夹 -->
      <template v-if="srcMode === 'folder' && !tree">
      <div class="zpv-empty">
        <p>选择存放“历年真题 PDF”的文件夹（夸克下载到手机也可），App 将按目录列出国考 / 各省真题卷。</p>
        <button class="zpv-btn pri" @click="pickRoot()">📂 选择真题文件夹</button>
      </div>
      </template>
      <div v-if="!tree" class="zpv-empty">
        <p>选择存放“历年真题 PDF”的文件夹（夸克下载到手机也可），App 将按目录列出国考 / 各省真题卷。</p>
        <button class="zpv-btn pri" @click="pickRoot()">📂 选择真题文件夹</button>
      </div>

      <!-- 文件列表（外部文件夹） -->
      <template v-if="srcMode === 'folder' && tree && !viewer">
        <div class="zpv-bread">
          <button class="zpv-link" @click="backToRoot()">根目录</button>
          <template v-for="(p, i) in path" :key="i">
            <span class="zpv-sep">/</span>
            <button class="zpv-link" @click="upOne()">{{ p.name }}</button>
          </template>
          <span class="zpv-tip">{{ busy ? '加载中…' : (items.length ? items.length + ' 项' : '') }}</span>
        </div>
        <div class="zpv-list">
          <div v-if="msg" class="zpv-msg">{{ msg }}</div>
          <button v-for="(it, i) in items" :key="i" class="zpv-it" @click="itemTap(it)">
            <span class="zpv-ic">{{ it.dir ? '📁' : '📄' }}</span>
            <span class="zpv-name">{{ it.name }}</span>
          </button>
          <div v-if="!items.length && !msg && !busy" class="zpv-empty">该文件夹内没有内容（需含 PDF）</div>
        </div>
      </template>

      <!-- 内置 PDF 阅读器 -->
      <template v-else>
        <div class="zpv-vbar">
          <button class="zpv-btn" @click="exitViewer()">⬅ 文件列表</button>
          <span class="zpv-name">{{ pdfName }}</span>
          <button v-if="pdfUri" class="zpv-btn" @click="sysOpen()">其它APP打开</button>
          <button v-if="pdfUri" class="zpv-btn" @click="sysShare()">分享</button>
        </div>
        <div class="zpv-page"><canvas ref="canvasEl"></canvas><div v-if="msg" class="zpv-msg">{{ msg }}</div></div>
        <div class="zpv-ctrl">
          <button class="zpv-btn" :disabled="page <= 1" @click="prevPage()">‹ 上一页</button>
          <span class="zpv-pg">第 {{ page }} / {{ pages }} 页</span>
          <button class="zpv-btn" :disabled="page >= pages" @click="nextPage()">下一页 ›</button>
          <span class="zpv-gap"></span>
          <button class="zpv-btn" @click="zoomOut()">−</button>
          <button class="zpv-btn" :title="'缩放：' + Math.round(scale * 100) + '%'" @click="fitW()">适应宽 {{ Math.round(scale * 100) }}%</button>
          <button class="zpv-btn" @click="zoomIn()">+</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.zpv-mask { position: fixed; inset: 0; z-index: 980; background: rgba(2, 8, 18, 0.72); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; padding: 10px; }
.zpv-panel { width: min(1000px, 98vw); height: 94vh; background: #0d1a2a; border: 1px solid rgba(80, 200, 255, 0.25); border-radius: 18px; display: flex; flex-direction: column; overflow: hidden; color: #eaf7ff; }
.zpv-top { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid rgba(80, 200, 255, 0.16); }
.zpv-title { flex: 1; font-weight: 700; font-size: calc(15px * var(--ui-fs-scale, 1)); }
.zpv-f { font-size: calc(12px * var(--ui-fs-scale, 1)); color: var(--text3); font-weight: 400; }
.zpv-btn { border: 1px solid rgba(80, 200, 255, 0.3); background: rgba(255, 255, 255, 0.06); color: #dbeafe; border-radius: 10px; padding: 7px 12px; font-size: calc(12.5px * var(--ui-fs-scale, 1)); cursor: pointer; flex-shrink: 0; }
.zpv-btn.pri { background: linear-gradient(135deg, #22d3ee, #2f6fb3); color: #04121f; font-weight: 700; }
.zpv-btn:disabled { opacity: 0.4; }
.zpv-modes { display: flex; gap: 8px; padding: 8px 14px 0; }
.zpv-mode { border: 1px solid rgba(80,200,255,.3); background: rgba(255,255,255,.05); color:#dbeafe; border-radius: 999px; padding: 6px 14px; font-size: calc(12.5px * var(--ui-fs-scale, 1)); cursor:pointer; }
.zpv-mode.on { background: linear-gradient(135deg,#22d3ee,#2f6fb3); color:#04121f; font-weight:700; }
.zpv-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: #a9c9de; text-align: center; padding: 30px; font-size: calc(14px * var(--ui-fs-scale, 1)); }
.zpv-bread { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; padding: 8px 14px; font-size: calc(12.5px * var(--ui-fs-scale, 1)); border-bottom: 1px solid rgba(255, 255, 255, 0.06); }
.zpv-link { background: none; border: none; color: var(--accent); cursor: pointer; padding: 2px 2px; font-size: calc(12.5px * var(--ui-fs-scale, 1)); }
.zpv-sep { color: var(--text3); }
.zpv-tip { margin-left: auto; color: var(--text3); }
.zpv-list { flex: 1; overflow-y: auto; padding: 10px; }
.zpv-it { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; background: rgba(255, 255, 255, 0.04); border: 1px solid transparent; border-radius: 12px; padding: 11px 12px; margin-bottom: 6px; color: #dbeafe; font-size: calc(14px * var(--ui-fs-scale, 1)); cursor: pointer; }
.zpv-it:hover { border-color: rgba(80, 200, 255, 0.35); background: rgba(80, 200, 255, 0.08); }
.zpv-ic { font-size: calc(18px * var(--ui-fs-scale, 1)); }
.zpv-name { flex: 1; word-break: break-all; }
.zpv-msg { color: #fbbf24; font-size: calc(13px * var(--ui-fs-scale, 1)); padding: 6px 2px; }
.zpv-vbar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
.zpv-page { flex: 1; overflow: auto; background: #202a38; display: flex; flex-direction: column; align-items: center; padding: 10px; }
.zpv-page canvas { box-shadow: 0 8px 30px rgba(0,0,0,0.5); max-width: 100%; }
.zpv-ctrl { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 12px; border-top: 1px solid rgba(255, 255, 255, 0.08); }
.zpv-pg { font-size: calc(13px * var(--ui-fs-scale, 1)); color: var(--hud-cyan); min-width: 86px; text-align: center; }
.zpv-gap { flex: 1; }
</style>
