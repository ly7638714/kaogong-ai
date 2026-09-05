<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { store, saveCfg, saveWqs, saveMsgs, saveNotes } from './store'
import { speak, stopSpeak, SCENES, getAllVoices, onVoicesReady, TTS_ENGINES, GLM_PRESET_VOICES, EDGE_PRESET_VOICES, OPENAI_PRESET_VOICES, DASH_MODELS, dashVoicesForModel, listGmVoices, listEdgeVoices, previewVoice, copyFigKeyToTts, ttsStatus, ttsCharsToday, cloneCosyVoice, cloneZhipuVoice, prepareCloneAudio, startRecog, recogActive } from './utils/tts'
import { costStats, clearCost, fmtCost, fmtTime, fmtTok, getPrices, savePrices, COST_FEATURES, COST_KINDS, DEF_PRICES, costLive, getBudget, setBudget } from './utils/costTrack'
import { PLATE_MODE } from './api'
import { PROVIDERS, MODELS, defaultModelOf, mergedModelsOf, providerOf, REGISTRY_VERSION, fastTextOf } from './api/modelRegistry'
import ChatPage from './components/ChatPage.vue'
import KbPage from './components/KbPage.vue'
import StatsPage from './components/StatsPage.vue'
import WrongPage from './components/WrongPage.vue'
import CockpitPage from './components/CockpitPage.vue'
import DraftPad from './components/DraftPad.vue'
import FloatPanel from './components/FloatPanel.vue'
import ExamBar from './components/ExamBar.vue'
import ExamManager from './components/ExamManager.vue'
import PetAvatar from './components/PetAvatar.vue'
import Data3DPage from './components/Data3DPage.vue'
import ReviewHub from './components/ReviewHub.vue' // R 今日复习中枢（全局）
import { doExport, exportWrongTxt, exportDataMd, exportWrongMd, parseMarkdownNotes } from './utils/export'
import { showToast } from './utils/toast'
import { emit as evEmit } from './utils/events'
import { getErrorLog, clearErrorLog } from './utils/errorLog'
import { APP_VERSION } from './version'
import { startStudyTrack, stopStudyTrack } from './utils/study'
import { nav, navBack, syncNavFromHistory } from './utils/nav'
import { webdavUpload, webdavDownload } from './utils/webdav'
import { genLogSize, exportGenLog, clearGenLog } from './utils/quizLog'
import { authState, authInit, authHasUsers, authRegister, authLogin, authLogout, authChangePass, authDeleteUser, authSetEnabled, authResetLocal } from './utils/auth'
import { pickDataFolder, saveAllDataToFolder, getFolderName } from './utils/localData'
import { downloadBackup, shareBackup, restoreAll } from './utils/dataBackup'
import { detectNative, nativeWriteFile, nativeBackupPath, startNativeAutoBackup, stopNativeAutoBackup } from './utils/nativeSave'
import { musicOn, musicVol, musicLoop, musicIndex, musicList, musicStatus, playTrack, toggleMusic, prevTrack, nextTrack, setVolume, setLoop, addMusicUrl, addMusicFile, removeMusic, importNetEase, pauseAll } from './utils/music'
import { pet, petShow, petMuted, bubble, petStats, petStage, petLevel, petHunger, petMood, petPoints, petSpeak, feedPet, patPet, renamePet, setPetMuted, petStop, petReadCurrent, petNextSpeed, petAnalyzeCurrent, petChat, petChatBusy, petSpeakReply, petAsk, petAllSkins, petSkin, applyPetSkin, petImg, setPetImg, clearPetImg, petSkinVoiceOf, petBindCloneVoice, petUnbindCloneVoice, petBoundVoices, petGlobalVoice, savePetGlobalVoice, petCustomData, petIsLocked, petAddCustomSkin, petRemoveCustomSkin, petPersistName, petAskImage, petRenameCloneVoice } from './utils/pet'
const tabs = [
  { k: 'ck', t: '🚀 看板' },
  { k: 'chat', t: '💬 对话' },
  { k: 'kb', t: '📚 知识库' },
  { k: 'ths', t: '🗂️ 积累' },
  { k: 'stat', t: '📊 统计' },
  { k: 'wq', t: '📋 错题' },
  { k: '3d', t: '🌌 3D数据' }
]
// 界面自定义：被隐藏的板块/功能入口不渲染（功能仍在，可从深链/更多菜单进入）
const visibleTabs = computed(() => tabs.filter((t) => !(store.cfg.uiHidden && store.cfg.uiHidden['tab_' + t.k])))
// ===== URL 深链（hash 路由）：#/ck #/chat #/kb #/ths #/stat #/wq，可收藏/分享、浏览器返回键切页 =====
const TAB_KEYS = { ck: 1, chat: 1, kb: 1, ths: 1, stat: 1, wq: 1, '3d': 1 }
function tabFromHash() {
  try {
    const h = String(location.hash || '').replace(/^#\/?/, '')
    return TAB_KEYS[h] ? h : ''
  } catch (e) { return '' }
}
const initialTab = tabFromHash() || (store.tab && tabs.some((t) => t.k === store.tab) ? store.tab : 'ck')
// 全局随手记（任何界面可写，悬浮球可拖动）
const globalDraft = ref(false)
const gFabIntent = ref('') // 本次打开意图：''=沿用记忆 / 'mini'=单击小画板 / 'overlay'=双击全屏原题勾画
const draftFabOn = ref(localStorage.getItem('xc_draft_fab_on') !== '0')
function saveDraftFabOn() { try { localStorage.setItem('xc_draft_fab_on', draftFabOn.value ? '1' : '0') } catch (e) {} }
const gFab = ref(null)
// 悬浮球位置钳制：保证任何窗口/设备（桌面/手机/APK）内都可见，永不超出当前显示窗口
function clampFab(p) {
  const vw = window.innerWidth || document.documentElement.clientWidth || 360
  const vh = window.innerHeight || document.documentElement.clientHeight || 640
  p.x = Math.max(4, Math.min(vw - 56, p.x))
  p.y = Math.max(4, Math.min(vh - 60, p.y))
}
try { const p = JSON.parse(localStorage.getItem('xc_global_fab') || 'null'); if (p && p.x != null) { clampFab(p); gFab.value = p } } catch (e) {}
// 首次打开默认位置：右下角（贴近拇指、避开底部导航/输入栏；inset 定位天然不超窗，任何设备都可见）
const gFabStyle = computed(() => gFab.value ? { left: gFab.value.x + 'px', top: gFab.value.y + 'px' } : { right: '16px', bottom: '88px' })
function reClampFab() {
  if (!gFab.value) return
  clampFab(gFab.value)
  try { localStorage.setItem('xc_global_fab', JSON.stringify(gFab.value)) } catch (e) {}
}
const onOrient = () => setTimeout(reClampFab, 250)
onMounted(() => {
  window.addEventListener('resize', reClampFab)
  window.addEventListener('orientationchange', onOrient)
  setTimeout(reClampFab, 600) // 移动端浏览器顶栏收起/首帧布局后，再钳一次保证可见
})
onUnmounted(() => {
  window.removeEventListener('resize', reClampFab)
  window.removeEventListener('orientationchange', onOrient)
})
function onGFabDown(e) {
  e.preventDefault()
  const startX = e.clientX, startY = e.clientY
  const btn = e.currentTarget
  const r = btn.getBoundingClientRect()
  const ox = startX - r.left, oy = startY - r.top
  let moved = false
  let cur = { x: r.left, y: r.top }
  try { btn.setPointerCapture(e.pointerId) } catch (_) {}
  const apply = () => { btn.style.left = cur.x + 'px'; btn.style.top = cur.y + 'px'; btn.style.right = 'auto'; btn.style.bottom = 'auto' }
  const onMove = (ev) => {
    const x = ev.clientX - ox, y = ev.clientY - oy
    if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 6) moved = true
    // 拖动中直接改 DOM，不触发 Vue 渲染/写 localStorage，保证丝滑
    cur = { x: Math.max(4, Math.min(window.innerWidth - 56, x)), y: Math.max(4, Math.min(window.innerHeight - 60, y)) }
    apply()
  }
  const onUp = () => {
    window.removeEventListener('pointermove', onMove, true)
    window.removeEventListener('pointerup', onUp, true)
    try { btn.releasePointerCapture(e.pointerId) } catch (_) {}
    if (moved) {
      gFab.value = cur
      try { localStorage.setItem('xc_global_fab', JSON.stringify(cur)) } catch (_) {}
    } else {
      // 单击=小画板；双击（300ms 内第二次）= 全屏原题勾画，不挡功能界面
      const now = Date.now()
      if (now - gLastTap < 320) {
        clearTimeout(gTapTimer)
        gLastTap = 0
        gFabIntent.value = 'overlay'
        globalDraft.value = true
      } else {
        gLastTap = now
        clearTimeout(gTapTimer)
        gTapTimer = setTimeout(() => {
          gLastTap = 0
          gFabIntent.value = 'mini'
          globalDraft.value = true
        }, 300)
      }
    }
  }
  window.addEventListener('pointermove', onMove, true)
  window.addEventListener('pointerup', onUp, true)
}
let gLastTap = 0
let gTapTimer = null
store.tab = initialTab

// 页签变更 → 写回 hash（深链可分享/收藏）；hash 变更 → 同步页签（浏览器返回/前进/手改地址）
watch(
  () => store.tab,
  (k) => {
    if (!tabs.some((t) => t.k === k)) return
    try { const want = '#/' + k; if (location.hash !== want) location.hash = want } catch (e) {}
  },
  { immediate: true }
)
function onHashChange() {
  const k = tabFromHash()
  if (k && k !== store.tab) store.tab = k
}
const theme = ref(localStorage.getItem('xc_theme') === 'light' ? 'light' : 'dark')
document.body.setAttribute('data-theme', theme.value)
// ===== 主题预设系统（iPad 笔记风 · 一键切换） =====
const THEME_PRESETS = {
  dark:       { name: '深空黑', theme: 'dark', vars: { bg: '#050b16', card: '#0b1626', surface: '#12202f', text: '#eaf7ff', text2: '#a9c9de', text3: '#83a3bc', accent: '#22d3ee', accent2: 'rgba(34,211,238,.15)', red: '#fb7185', green: '#34d399', amber: '#fbbf24' } },
  'dark-blue':{ name: '深蓝夜', theme: 'dark', vars: { bg: '#060b1a', card: '#0a1428', surface: '#101d38', text: '#e8f1ff', text2: '#a8c4e8', text3: '#7f9cc4', accent: '#60a5fa', accent2: 'rgba(96,165,250,.16)', red: '#fb7185', green: '#34d399', amber: '#fbbf24' } },
  'dark-red': { name: '暗红夜', theme: 'dark', vars: { bg: '#180a10', card: '#261219', surface: '#351a22', text: '#f5f5f7', text2: '#c2c2cc', text3: '#9898a6', accent: '#f87171', accent2: 'rgba(248,113,113,.16)', red: '#f87171', green: '#4ade80', amber: '#fbbf24' } },
  light:      { name: '米白纸', theme: 'light', vars: { bg: '#eef4fa', card: '#ffffff', surface: '#dbe6f0', text: '#000000', text2: '#1f2937', text3: '#374151', accent: '#0b5a8a', accent2: 'rgba(3,105,161,.1)', red: '#b91c1c', green: '#15803d', amber: '#b45309' } },
  'light-green': { name: '护眼绿白', theme: 'light', vars: { bg: '#e9f3ea', card: '#ffffff', surface: '#d3e8d6', text: '#122014', text2: '#2b4030', text3: '#47604d', accent: '#0e7a3d', accent2: 'rgba(14,122,61,.12)', red: '#b3261e', green: '#0e7a3d', amber: '#92600a' } },
  'light-red':{ name: '红白公务', theme: 'light', vars: { bg: '#f7eef0', card: '#ffffff', surface: '#eed8dc', text: '#1c1c22', text2: '#3b3b45', text3: '#5d5d6a', accent: '#b02a2a', accent2: 'rgba(176,42,42,.1)', red: '#b02a2a', green: '#15803d', amber: '#b45309' } },
  'light-blue':{ name: '晴空蓝', theme: 'light', vars: { bg: '#eef4fb', card: '#ffffff', surface: '#dce8f5', text: '#101828', text2: '#334155', text3: '#5b6b82', accent: '#0b6bcb', accent2: 'rgba(11,107,203,.1)', red: '#b91c1c', green: '#15803d', amber: '#b45309' } },
  cream:      { name: '暖黄纸', theme: 'light', vars: { bg: '#f6f1e3', card: '#fffdf6', surface: '#ece2c8', text: '#201a0c', text2: '#453a20', text3: '#655a3a', accent: '#9a6b1f', accent2: 'rgba(154,107,31,.12)', red: '#b3261e', green: '#2f7d32', amber: '#b45309' } },
  eye:        { name: '护眼柔绿', theme: 'dark', vars: { bg: '#0d1f16', card: '#12291d', surface: '#183326', text: '#e2f5e8', text2: '#a8cbb4', text3: '#83a892', accent: '#4ade80', accent2: 'rgba(74,222,128,.16)', red: '#fb7185', green: '#4ade80', amber: '#fbbf24' } },
  'warm-dark':{ name: '暖棕夜', theme: 'dark', vars: { bg: '#1a120c', card: '#251a12', surface: '#30221a', text: '#f6efe6', text2: '#cfc0ae', text3: '#a49582', accent: '#f59e0b', accent2: 'rgba(245,158,11,.14)', red: '#fb7185', green: '#4ade80', amber: '#fbbf24' } }
}
const themePreset = ref(localStorage.getItem('xc_theme_preset') || 'dark')
// ===== 主题切换平滑过渡：切主题瞬间加 theme-anim 类，380ms 后移除（系统减弱动态时 CSS 层禁用） =====
let themeAnimTimer = null
function flashThemeAnim() {
  const b = document.body
  if (!b) return
  b.classList.add('theme-anim')
  clearTimeout(themeAnimTimer)
  themeAnimTimer = setTimeout(() => b.classList.remove('theme-anim'), 380)
}
// ===== --accent-strong：强调色加深 18%（亮色主题关键句可读 / 气泡·能量条·激活底色） =====
function darken(hex, ratio) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim())
  if (!m) return '#333333'
  const n = parseInt(m[1], 16)
  const r = Math.max(0, Math.round(((n >> 16) & 255) * (1 - ratio)))
  const g = Math.max(0, Math.round(((n >> 8) & 255) * (1 - ratio)))
  const b = Math.max(0, Math.round((n & 255) * (1 - ratio)))
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)
}
function syncAccentStrong() {
  try {
    const cur = window.getComputedStyle(document.body).getPropertyValue('--accent').trim()
    if (/^#([0-9a-f]{6})$/i.test(cur)) document.body.style.setProperty('--accent-strong', darken(cur, 0.18))
  } catch (e) { /* 计算失败时回退 CSS var(--accent-strong, var(--accent)) */ }
}
function applyThemePreset(k) {
  flashThemeAnim()
  const p = THEME_PRESETS[k] || THEME_PRESETS.dark
  themePreset.value = k
  try { localStorage.setItem('xc_theme_preset', k) } catch (e) {}
  theme.value = p.theme
  document.body.setAttribute('data-theme', p.theme)
  const el = document.body
  for (const v in p.vars) { try { el.style.setProperty('--' + v, p.vars[v]) } catch (e) {} }
  syncAccentStrong()
}
applyThemePreset(themePreset.value)
// ===== 一键主题包：配色+强调色+护眼+高亮 一次到位（白天/黑夜各自多套，顶栏☀️/🌙配对切换） =====
const THEME_PACKS = [
  { id: 'light', name: '米白纸', theme: 'light', preset: 'light', accent: 'sea', eye: 'normal', tm: 'default', hl: 1 },
  { id: 'light-green', name: '护眼绿白', theme: 'light', preset: 'light-green', accent: 'emerald', eye: 'green', tm: 'default', hl: 1 },
  { id: 'light-red', name: '红白公务', theme: 'light', preset: 'light-red', accent: 'rose', eye: 'normal', tm: 'default', hl: 1 },
  { id: 'light-blue', name: '晴空蓝', theme: 'light', preset: 'light-blue', accent: 'sky', eye: 'normal', tm: 'default', hl: 1 },
  { id: 'cream', name: '暖黄纸', theme: 'light', preset: 'cream', accent: 'orange', eye: 'warm', tm: 'default', hl: 1 },
  { id: 'dark', name: '深空黑', theme: 'dark', preset: 'dark', accent: 'sea', eye: 'normal', tm: 'default', hl: 1 },
  { id: 'dark-blue', name: '深蓝夜', theme: 'dark', preset: 'dark-blue', accent: 'sky', eye: 'normal', tm: 'default', hl: 1 },
  { id: 'dark-red', name: '暗红夜', theme: 'dark', preset: 'dark-red', accent: 'rose', eye: 'normal', tm: 'default', hl: 1 },
  { id: 'warm-dark', name: '暖棕夜', theme: 'dark', preset: 'warm-dark', accent: 'orange', eye: 'warm', tm: 'default', hl: 1 },
  { id: 'eye', name: '护眼柔绿', theme: 'dark', preset: 'eye', accent: 'emerald', eye: 'green', tm: 'default', hl: 1 }
]
// 白天 ↔ 黑夜配对（顶栏 ☀️/🌙 一键切换）
const THEME_PACK_PAIR = { light: 'dark', 'light-green': 'eye', 'light-red': 'dark-red', 'light-blue': 'dark-blue', cream: 'warm-dark', dark: 'light', 'dark-blue': 'light-blue', 'dark-red': 'light-red', 'warm-dark': 'cream', eye: 'light-green' }
const themePack = ref(localStorage.getItem('xc_theme_pack') || 'dark')
function applyThemePack(id) {
  try {
    const p = THEME_PACKS.find((x) => x.id === id) || THEME_PACKS.find((x) => x.theme === (theme.value === 'light' ? 'light' : 'dark')) || THEME_PACKS[4]
    themePack.value = p.id
    try { localStorage.setItem('xc_theme_pack', p.id) } catch (e) {}
    applyThemePreset(p.preset)
    setAccent(p.accent)
    setEyeMode(p.eye)
    setThemeMode(p.tm)
    // 高亮层级由用户在设置里自选（0/1/2），主题包不再强制覆盖，避免「丰富」一刷新/切主题就丢
  } catch (e) { /* 主题应用失败不阻塞启动 */ }
}
// 启动：优先记忆的主题包（老用户无包记录则保持原主题预设行为）；延迟到挂载后应用，避免 setup 早期副作用
const savedPack = localStorage.getItem('xc_theme_pack')
if (savedPack && THEME_PACKS.some((x) => x.id === savedPack)) {
  try { onMounted(() => applyThemePack(savedPack)) } catch (e) { /* 无 onMounted 场景忽略 */ }
}
// 3D 学习数据驾驶舱已独立为「🌌 3D数据」页签；背景 3D 可在设置里开关
function doTheme() {
  // 顶栏 ☀️/🌙：在白天/黑夜「配对主题包」间一键切换（如 护眼绿白 ↔ 护眼柔绿）
  const pair = THEME_PACK_PAIR[themePack.value]
  applyThemePack(pair || (theme.value === 'light' ? 'dark' : 'light'))
}
// 多强调色主题（预设色卡 + 自定义取色）
const accent = ref(localStorage.getItem('xc_accent') || 'sea')
const accentCustom = ref(localStorage.getItem('xc_accent_custom') || '#22d3ee')
if (accent.value === 'custom') applyAccentCustom(accentCustom.value)
document.body.setAttribute('data-accent', accent.value)
document.body.setAttribute('data-eye', store.cfg.eyeMode || 'normal')
document.body.setAttribute('data-hl', String(Math.min(2, Number(store.cfg.hl) || 0)))
document.body.setAttribute('data-tm', store.cfg.themeMode || 'default')
function applyAccentCustom(hex) {
  const h = /^#([0-9a-f]{6})$/i.test(hex) ? hex : '#22d3ee'
  const r = parseInt(h.slice(1, 3), 16)
  const g = parseInt(h.slice(3, 5), 16)
  const b = parseInt(h.slice(5, 7), 16)
  document.body.style.setProperty('--accent', h)
  document.body.style.setProperty('--accent2', 'rgba(' + r + ',' + g + ',' + b + ',0.15)')
  document.body.style.setProperty('--grad-primary', 'linear-gradient(135deg, ' + h + ', ' + h + ')')
  syncAccentStrong()
}
function setAccent(a) {
  accent.value = a
  document.body.setAttribute('data-accent', a)
  document.body.style.removeProperty('--accent')
  document.body.style.removeProperty('--accent2')
  document.body.style.removeProperty('--grad-primary')
  localStorage.setItem('xc_accent', a)
  syncAccentStrong()
}
// 自定义强调色：点色板自选，即时生效并记忆
function setAccentCustom(hex) {
  accent.value = 'custom'
  accentCustom.value = hex
  document.body.setAttribute('data-accent', 'custom')
  applyAccentCustom(hex)
  syncAccentStrong()
  try { localStorage.setItem('xc_accent', 'custom'); localStorage.setItem('xc_accent_custom', hex) } catch (e) {}
}
function setEyeMode(m) {
  store.cfg.eyeMode = m
  document.body.setAttribute('data-eye', m)
  saveCfg()
}
function setHl(v) {
  // 高亮三档：0=无 / 1=精简（默认主题包档） / 2=丰富（更强层次）
  store.cfg.hl = Number(v) || 0
  document.body.setAttribute('data-hl', String(store.cfg.hl))
  saveCfg()
}
function setThemeMode(m) {
  store.cfg.themeMode = m
  document.body.setAttribute('data-tm', m)
  saveCfg()
}
// 知识图谱光效强度：0=关闭(防晃眼/省电) / 0.5=柔和 / 1=全开
function setKgFx(v) {
  store.cfg.kgFx = Number(v) || 0
  saveCfg()
}
// ===== 顶栏全局搜索 =====
const sq = ref('')
const searchDrop = ref(false)
const searchInput = ref(null)
const searchResults = computed(() => {
  const k = String(sq.value || '')
    .trim()
    .toLowerCase()
  if (!k) return { wq: [], msg: [], plate: [] }
  const wq = store.wqs
    .filter((q) => {
      const t = (q.question || '') + ' ' + (q.answer || '') + ' ' + (q.subject || '')
      return t.toLowerCase().includes(k)
    })
    .slice(0, 8)
  const msg = store.msgs
    .filter((m) => {
      const t = String((m.content && m.content.text) || m.content || '')
      return t.toLowerCase().includes(k)
    })
    .slice(0, 5)
  const plate = Object.keys(PLATE_MODE).filter((p) => p.includes(k) || k.includes(p))
  const kb = []
  store.myMem.forEach((m) => { const t = String(m.text || ''); if (t.toLowerCase().includes(k)) kb.push({ type: m.type || '其他', term: t.slice(0, 40) }) })
  store.notes.forEach((n) => { const t = String((n.title || '') + ' ' + (n.body || '')); if (t.toLowerCase().includes(k)) kb.push({ type: '笔记', term: (n.title || '笔记').slice(0, 40) }) })
  const func = FUNCS.filter((f) => f.match.some((m) => k.includes(m) || m.includes(k))).slice(0, 8)
  return { wq, msg, plate, kb: kb.slice(0, 8), func }
})
function goWq(i) {
  const q = store.wqs[i]
  if (q) {
    store.tab = 'wq'
  }
  sq.value = ''
  searchDrop.value = false
}
function goPlate(p) {
  const m = PLATE_MODE[p]
  store.mode = m
  localStorage.setItem('xc_mode', m)
  store.tab = 'chat'
  sq.value = ''
  searchDrop.value = false
}
function focusDrop() {
  searchDrop.value = true
}
function searchBlur() { setTimeout(() => { searchDrop.value = false }, 120) }
const expType = ref('chat')
const expShow = ref(false)
const expBusy = ref(false)
const expTpl = ref('full') // 错题导出模板：full 完整 / stems 只题干 / separate 题答分离
const setShow = ref(false)
const moreShow = ref(false) // 手机端顶栏「⋯」更多菜单
function toggleMore() { moreShow.value = !moreShow.value }
function moreGo(fn) { moreShow.value = false; fn() }
// ===== AI 用量与花费（实时追踪）=====
const costShow = ref(false)
const costStat = computed(() => costStats())
const costToday = computed(() => costStat.value.today)
const costPrices = ref(getPrices())
const costBudget = ref(getBudget())
function costSaveBudget() {
  costBudget.value = setBudget(costBudget.value)
  showToast(costBudget.value > 0 ? ('✅ 今日预算已设为 ¥' + costBudget.value + '，超额将先弹确认') : 'ℹ️ 今日预算已关闭（不限制）', 'success')
}
const costOpen = ref(null)
function costSavePrices() {
  savePrices(costPrices.value)
  showToast('✅ 计价表已保存（后续花费按新单价估算）', 'success')
}
// 进行中调用实时计时（costLive.active 为真时每 1s 刷新）
const costElapsed = ref(0)
let costTimer = null
watch(
  () => costLive.active,
  (a) => {
    if (costTimer) { clearInterval(costTimer); costTimer = null }
    if (a) {
      costElapsed.value = 0
      costTimer = setInterval(() => { costElapsed.value = Math.max(1, Math.round((Date.now() - costLive.beganAt) / 1000)) }, 1000)
    }
  }
)
onUnmounted(() => { if (costTimer) clearInterval(costTimer) })
function costKindLabel(k) { return COST_KINDS[k] || (k ? k : '—') }
function costCostDetail(r) {
  const parts = []
  if (r.inCost != null && (r.inT || 0) > 0) parts.push('输入 ' + r.inT + ' tok × ¥' + (r.inCost / Math.max(1, r.inT) * 1000).toFixed(4) + '/千')
  if (r.outCost != null && (r.outT || 0) > 0) parts.push('输出 ' + r.outT + ' tok × ¥' + (r.outCost / Math.max(1, r.outT) * 1000).toFixed(4) + '/千')
  if (r.fixedCost) parts.push('固定费 ¥' + r.fixedCost)
  return parts.join('；')
}
function costResetPrices() {
  costPrices.value = JSON.parse(JSON.stringify(DEF_PRICES))
  savePrices(costPrices.value)
  showToast('↩️ 已恢复默认计价表', 'success')
}
// ===== 本地账号（登录门）=====
const authLoading = ref(true)
const authMode = ref('login')
const authU = ref('')
const authP = ref('')
const authP2 = ref('')
const authRemember = ref(true)
const authErr = ref('')
const authBusy = ref(false)
const authOldP = ref('')
const authNewP = ref('')
const authDelP = ref('')
function switchAuthMode(m) {
  authMode.value = m
  authErr.value = ''
  authP2.value = ''
}
async function doAuthSubmit() {
  // 本地账号：用户名 + 密码（登录 / 注册）
  authErr.value = ''
  authBusy.value = true
  try {
    if (authMode.value === 'register') {
      if (authP.value !== authP2.value) { authErr.value = '两次输入的密码不一致'; return }
      const r = await authRegister(authU.value, authP.value)
      if (!r.ok) { authErr.value = r.msg; return }
      const l = await authLogin(authU.value, authP.value, authRemember.value)
      if (!l.ok) { authErr.value = l.msg; authMode.value = 'login'; return }
      showToast('✅ 注册并登录成功，欢迎使用行测智能助教！', 'success')
    } else {
      const r = await authLogin(authU.value, authP.value, authRemember.value)
      if (!r.ok) { authErr.value = r.msg; return }
      showToast('✅ 欢迎回来，' + authState.user, 'success')
    }
    authU.value = ''
    authP.value = ''
    authP2.value = ''
  } finally {
    authBusy.value = false
  }
}
function doLogout() {
  authLogout()
  authU.value = ''
  authP.value = ''
  authP2.value = ''
  authErr.value = ''
  showToast('👋 已退出登录（再次使用需登录）', 'info')
}
const authConfirm = ref(null) // 自定义确认弹窗 { msg, fn }
function askConfirm(msg, fn) { authConfirm.value = { msg, fn } }
function authConfirmYes() {
  const c = authConfirm.value
  authConfirm.value = null
  if (c && c.fn) c.fn()
}
function authConfirmNo() { authConfirm.value = null }
function doAuthReset() {
  askConfirm('确定要重置本地账号吗？将清空本机所有注册账号与会话（对话/错题/笔记等学习数据不受影响）。', () => {
    authResetLocal()
    authU.value = ''
    authP.value = ''
    authP2.value = ''
    authErr.value = ''
    authMode.value = 'register'
    showToast('🔄 已重置本地账号，请重新注册', 'info')
  })
}
function toggleAuthGate(v) {
  authSetEnabled(!!v)
  showToast(v ? '🔐 已启用登录门（下次打开需登录）' : '🔓 已关闭登录门（无需登录即可使用）', 'info')
}
async function doChangePass() {
  if (!authState.user) return
  const r = await authChangePass(authState.user, authOldP.value, authNewP.value)
  if (!r.ok) { showToast('❌ ' + r.msg, 'error'); return }
  authOldP.value = ''
  authNewP.value = ''
  showToast('✅ 密码已修改', 'success')
}
function doDeleteUser() {
  if (!authState.user) return
  askConfirm('确定删除本机账号「' + authState.user + '」？将清除该账号记录并退出登录（学习数据保留）。', async () => {
    const r = await authDeleteUser(authState.user, authDelP.value)
    if (!r.ok) { showToast('❌ ' + r.msg, 'error'); return }
    authDelP.value = ''
    showToast('🗑 账号已删除', 'info')
  })
}
function authGateInit() {
  authInit().then(() => {
    if (authHasUsers() && !authState.user) authMode.value = 'login'
    else if (!authHasUsers()) authMode.value = 'register'
    authLoading.value = false
  })
}
const stStat = ref('检测中...')
const stDot = ref('')
const testBusy = ref(false)
async function testConn() {
  if (testBusy.value) return
  testBusy.value = true
  stStat.value = '检测中...'
  stDot.value = ''
  const t = await testOne(store.cfg.text)
  const v = await testOne(store.cfg.vision)
  const ts = t.ok === true ? '文字✅' : t.ok === false ? '文字❌' : '文字未配置'
  const vs = v.ok === true ? '视觉✅' : v.ok === false ? '视觉❌' : '视觉未配置'
  stStat.value = ts + ' ' + vs
  stDot.value = t.ok === false || v.ok === false ? '' : ' ok'
  testBusy.value = false
  return ts + ' ' + vs
}
async function testOne(c) {
  if (!c || !c.key) return { ok: null }
  try {
    const r = await fetch(c.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + c.key },
      body: JSON.stringify({
        model: c.model,
        messages: [{ role: 'user', content: '你好' }],
        max_tokens: 8,
        stream: false
      })
    })
    if (r.ok) return { ok: true }
    const e = await r.json().catch(() => ({}))
    return { ok: false, msg: e.error?.message || r.status }
  } catch (e) {
    return { ok: false, msg: e.message }
  }
}
function openExp(t) {
  expType.value = t
  expShow.value = true
}
async function runExport(fmt, polish) {
  expShow.value = false
  expBusy.value = true
  if (polish) showToast('⏳ AI 正在整理笔记…', 'info')
  const tpl = expTpl.value
  try {
    if (fmt === 'md') {
      exportDataMd(expType.value, tpl)
    } else {
      await doExport(expType.value, fmt, polish, tpl)
    }
  } finally {
    expBusy.value = false
  }
}
// ===== 首次使用引导向导 =====
const onboard = ref(false)
const obStep = ref(0)
function startOnboard() { obStep.value = 0; onboard.value = true }
function skipOnboard() { finishOnboard() }
function finishOnboard() { try { localStorage.setItem('xc_onboarded', '1') } catch (e) {}; onboard.value = false }
function clearResults() { try { localStorage.removeItem('xc_paper_results') } catch (e) {}; showToast('已清除考试战绩', 'success') }

// ===== 各板块首次使用引导 =====
const GUIDES = {
  ck: {
    key: 'ck', icon: '🚀', title: '学习驾驶舱',
    desc: '每天打开先看这里，让学习有方向、有节奏。',
    features: ['🎯 今日任务：自动生成"刷题/复盘/积累"3 件事，打勾打卡', '⏳ 备考倒计时 + 板块练习分布 + 复盘率'],
    tips: ['① 先完成今日任务 3 件事，再自由练习', '② 优先练错题最多的弱板块', '③ 每天坚持打卡，连续天数是你最好的动力']
  },
  chat: {
    key: 'chat', icon: '💬', title: '对话刷题（核心页）',
    desc: '所有提问、讲题、训练都在这里，是主战场。',
    features: ['🧠 10 个专项模式（逻辑/言语/图推/资料/数量…）', '🎲 模拟出题 / 📝 模拟组卷（国考·省考真实卷面·AI/导入/错题三源）', '📷 图片题走视觉模型，公式图表都能看'],
    tips: ['① 先在设置配好 API Key 和视觉模型', '② 刷题开「考场限时」练速度', '③ 答完点「📌 存错题」，用「🔁 出变式题」检验是否真懂']
  },
  kb: {
    key: 'kb', icon: '📚', title: '知识速查',
    desc: '名师方法论按板块整理成卡片，考前突击靠它。',
    features: ['📚 按板块速查：点卡片看核心要点', '💬 点「问 AI 讲透」让 AI 展开讲，🎲 出题检验', '📖 每张卡片含 理论/技巧/例题 与秒杀规律'],
    tips: ['① 考前把每张卡片的「秒杀规律」过一遍', '② 不会的方法点「问 AI 讲透」再配例题', '③ 理论→技巧→例题 按序学，例题先自己做再看解析']
  },
  ths: {
    key: 'ths', icon: '🗂️', title: '常识·时政积累',
    desc: '每天记一点，靠"重复"打败遗忘。',
    features: ['🔁 艾宾浩斯复习：记住了按 1/2/4/7/15/30 天排期', '⭐ 收藏进我的记忆库，✏️ AI 出题自测', '📥 可导入自己的 Obsidian/Markdown 笔记'],
    tips: ['① 每天用「复习」模式刷到期条目，比随机刷记得牢', '② 答错的会自动进错题本', '③ 时政可按 国内/贵州/时间范围 筛选']
  },
  stat: {
    key: 'stat', icon: '📊', title: '学习统计',
    desc: '数据会告诉你：坚持得怎么样、弱在哪。',
    features: ['📈 近 7/14/30 天趋势折线（提问/错题/复盘）', '🎯 板块掌握度雷达图 + 🔥 15 周热力图', '⏱ 今日/累计学习时长'],
    tips: ['① 每周看一次趋势，确认自己在进步', '② 雷达图最凹的就是下一周重点', '③ 热力图越连续，上岸概率越高']
  },
  wq: {
    key: 'wq', icon: '📋', title: '错题本（提分关键）',
    desc: '错题不复习等于白做，这里是第二战场。',
    features: ['✍️ 二刷/三刷：带选项的直接点选作答、自动判对错', '掌握度 + 连续答对 2 次自动「已消化」', '🎴 抽认卡 / 📤 导出 Word·PDF·Obsidian·Anki'],
    tips: ['① 晚上集中复盘当天错题，别攒着', '② 二刷点选项作答，别凭记忆自评', '③ 每周导出打印/推 Anki，考前集中看']
  }
}
const guide = ref(null)
const guidesOff = ref(false)
const guidedSet = ref({})
try { guidesOff.value = localStorage.getItem('xc_guides_off') === '1' } catch (e) {}
try { guidedSet.value = JSON.parse(localStorage.getItem('xc_guided') || '{}') || {} } catch (e) {}
function maybeShowGuide(tab) {
  if (guidesOff.value) return
  const g = GUIDES[tab]
  if (!g || guidedSet.value[tab]) return
  guide.value = g
}
function closeGuide() {
  if (guide.value) {
    guidedSet.value[guide.value.key] = 1
    try { localStorage.setItem('xc_guided', JSON.stringify(guidedSet.value)) } catch (e) {}
  }
  guide.value = null
}
function disableAllGuides() {
  guidesOff.value = true
  try { localStorage.setItem('xc_guides_off', '1') } catch (e) {}
  guide.value = null
  showToast('已关闭所有引导；可在设置里重新开启', 'success')
}
function enableAllGuides() {
  guidesOff.value = false
  guidedSet.value = {}
  try { localStorage.setItem('xc_guides_off', '0') } catch (e) {}
  try { localStorage.removeItem('xc_guided') } catch (e) {}
  showToast('已重新开启全部引导', 'success')
}
watch(
  () => store.tab,
  (t) => maybeShowGuide(t)
)
setTimeout(() => maybeShowGuide(store.tab), 700)



const musicUrl = ref('')
const neteaseUrl = ref('')
const petNameInput = ref('')
// 背景音乐二级控制面板
const musicPanel = ref(false)
const musicPanelPos = ref(null)
const musicFileBtn = ref(null)
const musicPanelStyle = computed(() => {
  if (!musicPanelPos.value) return { left: '14px', top: '118px' }
  return { left: musicPanelPos.value.left + 'px', top: musicPanelPos.value.top + 'px' }
})
function toggleMusicPanel() {
  musicPanel.value = !musicPanel.value
  if (musicPanel.value) {
    try {
      const el = document.querySelector('.music-float')
      if (el) {
        const r = el.getBoundingClientRect()
        musicPanelPos.value = { left: Math.max(8, Math.min(r.left, window.innerWidth - 292)), top: r.bottom + 8 }
      }
    } catch (e) {}
  }
}
function toggleMusicPower() {
  if (musicOn.value) pauseAll()
  else playTrack()
}
function doAddMusicUrl() {
  if (addMusicUrl(musicUrl.value)) { showToast('✅ 已添加自定义曲目', 'success'); musicUrl.value = '' }
  else showToast('请输入有效的音频直链', 'error')
}
function addMusicLocal(ev) {
  const f = ev.target.files && ev.target.files[0]
  if (f) { addMusicFile(f); showToast('✅ 已添加本地音频（仅本次会话）', 'success') }
  ev.target.value = ''
}
async function doNetease() {
  try {
    const n = await importNetEase(neteaseUrl.value)
    showToast('✅ 已导入网易云歌单 ' + n + ' 首', 'success')
    neteaseUrl.value = ''
  } catch (e) {
    showToast('❌ ' + e.message, 'error')
  }
}
function openPet() {
  clampFloatPos()
  petShow.value = true
  petSpeak()
}
function doFeed() {
  if (feedPet()) showToast('🍖 已投喂！', 'success')
  else showToast('积分不足，先去刷题/问答攒积分', 'error')
}
function doRename() {
  if (renamePet(petNameInput.value)) { petNameInput.value = ''; showToast('✅ 改名成功', 'success') }
  else showToast('请输入名字', 'error')
}


// ===== 背景音乐 / 萌宠浮控件：默认置顶 + 支持拖拽（位置记忆到 localStorage）=====
const musicPos = ref(null) // {x, y}
const petPos = ref(null)
// 位置记忆按视口分档存储（手机拖的位置不影响桌面），兼容旧单档 key
const vpBucket = () => vpB()
const readPos = (k) => { try { return JSON.parse(localStorage.getItem(k + '_' + vpBucket()) || localStorage.getItem(k) || 'null') } catch (e) { return null } }
try {
  const mp = readPos('xc_music_pos')
  const pp = readPos('xc_pet_pos')
  if (mp && typeof mp.x === 'number') musicPos.value = mp
  if (pp && typeof pp.x === 'number') petPos.value = pp
  const ppp = readPos('xc_pet_panel_pos')
  if (ppp && typeof ppp.x === 'number') petPanelPos.value = ppp
} catch (e) {}
// 位置记忆夹回视口（防止窗口变小/分辨率变化后浮窗跑到屏幕外）
// 悬浮物安全区：避免落在顶部 HUD 区与底部输入/操作区（纯函数见 utils/floatClamp.js，可单测）
import { floatSafeClamp, vpBucket as vpB, FLOAT_TOP_SAFE } from './utils/floatClamp'
// 动态测量顶部导航真实高度（topbar + exam-bar(HUD) + tabs 三段，取最下沿），
// 让萌宠/音乐球落点避开整个顶部导航区（而非写死的 96px，旧值会压住 .tabs 里的「积累/统计/错题/3D数据」）。
function topNavSafe() {
  try {
    let bottom = 0
    for (const sel of ['.topbar', '.exam-bar', '.tabs']) {
      const el = document.querySelector(sel)
      if (el) {
        const r = el.getBoundingClientRect()
        if (r.bottom > bottom) bottom = r.bottom
      }
    }
    return bottom > 20 ? Math.ceil(bottom) + 12 : FLOAT_TOP_SAFE
  } catch (e) {
    return FLOAT_TOP_SAFE
  }
}
function clampFloatPos() {
  const ts = topNavSafe()
  const vw = window.innerWidth, vh = window.innerHeight
  if (petPos.value) petPos.value = floatSafeClamp(petPos.value.x, petPos.value.y, 54, 54, vw, vh, ts)
  else petPos.value = { x: vw - 54 - 14, y: ts + 12 } // 无保存位置时给一个避开顶部导航的默认落点
  if (musicPos.value) musicPos.value = floatSafeClamp(musicPos.value.x, musicPos.value.y, 54, 54, vw, vh, ts)
  else musicPos.value = { x: 14, y: ts + 12 }
  if (petPanelPos.value) petPanelPos.value = floatSafeClamp(petPanelPos.value.x, petPanelPos.value.y, 358, 520, vw, vh, ts)
}
window.addEventListener('resize', () => clampFloatPos())
const petPanelPos = ref(null) // 助理小窗位置
const petCollapsed = ref(false)
const petRenameToggle = ref(false)
const petPanelStyle = computed(() => {
  const p = petPanelPos.value
  if (!p) return {}
  return { left: p.x + 'px', top: p.y + 'px', right: 'auto' }
})
// 萌宠「正在看」的上下文（当前题/板块/页面）
const petSeeLabel = computed(() => {
  const q = store.curQ
  if (q && (q.plate || q.subject)) return '当前题·' + (q.plate || q.subject)
  if (store.tab === 'wq') return '错题复盘'
  if (store.tab === 'kb') return '知识库'
  if (store.tab === 'stat') return '学习统计'
  if (store.tab === 'chat') return '对话页'
  return '看板'
})
let dragState = null
let dragMoved = false
function floatStyle(key) {
  const p = key === 'music' ? musicPos.value : petPos.value
  if (!p) {
    // 无保存位置时，用顶部导航安全区算出一个不遮挡导航的默认落点（避免退回 CSS top:62px 压住 .tabs）
    const ts = topNavSafe()
    const w = 54
    const x = key === 'music' ? 14 : window.innerWidth - w - 14
    return { left: x + 'px', top: (ts + 12) + 'px', right: 'auto' }
  }
  return { left: p.x + 'px', top: p.y + 'px', right: 'auto' }
}
function startFloatDrag(e, key) {
  if (e.button != null && e.button !== 0) return
  const el = e.currentTarget
  if (!el) return
  e.preventDefault()
  const rect = el.getBoundingClientRect()
  dragState = { key, startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top, el }
  dragMoved = false
  el.classList.add('dragging')
  document.addEventListener('pointermove', onFloatDragMove)
  document.addEventListener('pointerup', onFloatDragUp)
}
function onFloatDragMove(e) {
  if (!dragState) return
  const { key, startX, startY, origX, origY, el } = dragState
  if (!dragMoved && Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) > 6) dragMoved = true
  let x = origX + e.clientX - startX
  let y = origY + e.clientY - startY
  const sp = floatSafeClamp(x, y, el.offsetWidth || 54, el.offsetHeight || 54, window.innerWidth, window.innerHeight, topNavSafe())
  x = sp.x; y = sp.y
  if (key === 'music') musicPos.value = { x, y }
  else if (key === 'pp') petPanelPos.value = { x, y }
  else petPos.value = { x, y }
}
function onFloatDragUp() {
  if (!dragState) return
  const { el } = dragState
  dragState = null
  el.classList.remove('dragging')
  document.removeEventListener('pointermove', onFloatDragMove)
  document.removeEventListener('pointerup', onFloatDragUp)
  try {
    const vp = vpBucket()
    localStorage.setItem('xc_music_pos_' + vp, JSON.stringify(musicPos.value))
    localStorage.setItem('xc_pet_pos_' + vp, JSON.stringify(petPos.value))
    localStorage.setItem('xc_pet_panel_pos_' + vp, JSON.stringify(petPanelPos.value))
  } catch (e) {}
}
function floatClick(key) {
  if (dragMoved) { dragMoved = false; return }
  if (key === 'music') toggleMusic()
  else openPet()
}

// ===== 背景（纯色 / 图片壁纸）=====
const BG_SOLIDS = [
  { k: 'deep', n: '深空蓝', c: '#0a1424' },
  { k: 'ink', n: '墨黑', c: '#000000' },
  { k: 'tealbg', n: '黛青', c: '#12251c' },
  { k: 'slate', n: '雾灰', c: '#1b222c' },
  { k: 'paper', n: '纸米', c: '#f2ead8' },
  { k: 'cloud', n: '云白', c: '#eef2f7' },
  { k: 'mint', n: '浅青', c: '#e7f2ec' },
  { k: 'apricot', n: '暖杏', c: '#f9ece0' }
]
const BG_MAP = Object.fromEntries(BG_SOLIDS.map((s) => [s.k, s.c]))
const wallStyle = computed(() => {
  const c = store.cfg
  if (c.bgMode === 'solid') return { background: BG_MAP[c.bgSolid] || BG_MAP.deep }
  if (c.bgMode === 'image' && c.bgImg) {
    return {
      backgroundImage: 'url(' + c.bgImg + ')',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      filter: 'blur(' + (Number(c.bgBlur) || 0) + 'px) scale(1.1)'
    }
  }
  return null
})
function pickBg(ev) {
  const f = ev.target.files && ev.target.files[0]
  if (!f) return
  if (!f.type.startsWith('image/')) {
    showToast('请选择图片文件', 'error')
    return
  }
  const r = new FileReader()
  r.onload = (e) => {
    store.cfg.bgImg = e.target.result
    store.cfg.bgMode = 'image'
    saveCfg()
    showToast('✅ 壁纸已应用，可在设置调模糊', 'success')
  }
  r.readAsDataURL(f)
  ev.target.value = ''
}


const FUNCS = [
  { k: 'tab_ck', t: '🚀 看板', match: ['看板', '驾驶舱', '首页'] },
  { k: 'tab_chat', t: '💬 对话', match: ['对话', '聊天', 'chat', '提问'] },
  { k: 'tab_kb', t: '📚 知识库', match: ['知识库', '速查', '方法', '书'] },
  { k: 'tab_ths', t: '🗂️ 积累', match: ['积累', '常识', '时政', '成语', '实词'] },
  { k: 'tab_stat', t: '📊 统计', match: ['统计', '趋势', '雷达', '热力'] },
  { k: 'tab_wq', t: '📋 错题本', match: ['错题', '复盘', '二刷', '抽认'] },
  { k: 'set', t: '⚙️ 设置', match: ['设置', 'api', '外观', '背景', '同步', '语音', 'webdav', '护眼'] },
  { k: 'export', t: '📤 导出', match: ['导出', 'word', 'pdf', 'markdown', 'obsidian', 'anki'] },
  { k: 'exam', t: '📝 模拟组卷', match: ['整卷', '模拟', '考试', 'exam', '组卷', '国考', '省考'] },
  { k: 'paper', t: '📥 导入组卷', match: ['真题', '导入题', 'paper', '试卷', '图片识别'] },
  { k: 'music', t: '🎵 背景音乐', match: ['音乐', 'music', 'bgm', '歌单'] },
  { k: 'pet', t: '🐾 我的萌宠', match: ['萌宠', '宠物', 'pet'] },
  { k: '3d', t: '🌌 3D 学习数据驾驶舱', match: ['3d', '数据', '全景', '星球'] }
]
function goFunc(f) {
  sq.value = ''
  searchDrop.value = false
  if (!f) return
  if (f.k.startsWith('tab_')) { store.tab = f.k.slice(4); return }
  if (f.k === 'set') { openSet(); return }
  if (f.k === 'export') { openExp('chat'); return }
  if (f.k === 'exam') { store.tab = 'chat'; evEmit('xc-open-exam'); return }
  if (f.k === 'paper') { store.tab = 'chat'; evEmit('xc-open-paper'); return }
  if (f.k === 'music') { toggleMusic(); return }
  if (f.k === 'pet') { openPet(); return }
  if (f.k === '3d') { store.tab = '3d'; return }
}
function goKb(it) {
  sq.value = ''
  searchDrop.value = false
  store.tab = 'ths'
  setTimeout(() => window.dispatchEvent(new CustomEvent('xc-search-term', { detail: { term: it.term, type: it.type } })), 60)
}


// ===== 数据保存到本地文件夹 =====
const dirLabel = ref('')
const nativeOn = ref(false)
const nativePath = ref('')
const isNative = detectNative()
if (isNative) { try { nativePath.value = nativeBackupPath() } catch (e) {} }
if (isNative) { nativeOn.value = !!startNativeAutoBackup() } // 原生环境默认开启自动写入 Download
async function nativeNow() {
  try {
    await nativeWriteFile('行测AI备份.json', JSON.stringify({ app: 'xingce', v: 2, t: Date.now(), data: (function () { const d = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('xc_')) d[k] = localStorage.getItem(k) } return d })() }))
    showToast('✅ 已原生写入：' + (nativePath.value || 'Download/行测AI备份.json'), 'success')
  } catch (e) { showToast('❌ 原生写入失败：' + ((e && e.message) || e), 'error') }
}
function nativeToggle() {
  if (nativeOn.value) { stopNativeAutoBackup(); nativeOn.value = false; showToast('已停用自动原生备份', 'info') }
  else { nativeOn.value = !!startNativeAutoBackup(); if (nativeOn.value) showToast('✅ 已启用：每 45 秒自动写入 ' + (nativePath.value || 'Download/行测AI备份.json'), 'success') }
}
async function pickDir() {
  try {
    const name = await pickDataFolder()
    dirLabel.value = name
    showToast('✅ 已选择文件夹：' + name, 'success')
  } catch (e) {
    showToast('❌ ' + e.message, 'error')
  }
}
async function saveDataDir() {
  try {
    const name = await saveAllDataToFolder()
    showToast('✅ 已保存全部数据到「' + name + '」', 'success')
  } catch (e) {
    showToast('❌ ' + e.message, 'error')
  }
}
// ===== 在线壁纸自动轮换 =====
let wallTimer = null
function nextWallpaper() {
  const seed = Math.floor(Math.random() * 100000)
  store.cfg.bgImg = 'https://picsum.photos/seed/' + seed + '/1920/1080'
  store.cfg.bgMode = 'image'
  saveCfg()
}
function toggleBgAuto() {
  if (store.cfg.bgAuto) {
    if (!wallTimer) {
      wallTimer = setInterval(() => {
        if (store.cfg.bgAuto) nextWallpaper()
      }, 5 * 60000)
    }
    nextWallpaper()
    showToast('🖼️ 已开启在线壁纸轮换（每 5 分钟）', 'success')
  } else {
    if (wallTimer) {
      clearInterval(wallTimer)
      wallTimer = null
    }
    showToast('已关闭在线壁纸轮换', 'info')
  }
  saveCfg()
}


// ===== 设置引导（逐项讲解）=====
const SET_GUIDE = [
  { id: 'set-api', t: '💬 文本大模型', d: '纯文字题的 AI 大脑：下拉选服务商 + 下拉选模型（新→旧），填 Key 即可。', tips: '推荐 DeepSeek（便宜中文好）；换服务商自动带官方 API 地址与最新模型；卡片内「🧪 测试连通性」一键验证。' },
  { id: 'set-vision', t: '👁️ 视觉大模型', d: '图片/截图题的 AI 大脑（图推图形、资料表格、数学公式）。', tips: 'DeepSeek 可用同一个 Key（deepseek-v4-flash-vision-exp）；不配则发图题无法识别。' },
  { id: 'set-fig', t: '🖼 图像增强大模型（可选）', d: '用独立的开源视觉模型把题目截图复刻成图贴进回复，辅助看懂图推/几何/表格题。', tips: '可选功能，不配置完全不影响现有功能；推荐硅基流动免费额度或 Ollama 本地。' },
  { id: 'set-voice', t: '🗣️ 语音朗读', d: 'AI 讲解的朗读：场景音色、语速、音调、本机语音。', tips: '💰 省钱：默认 Edge 免费神经语音（不花钱）；智谱超拟人收费；系统语音完全免费。重复朗读命中本地缓存不重复合成。' },
  { id: 'set-look', t: '🎨 外观', d: '强调色、护眼模式、高亮、红黑局长风主题、字体大小、壁纸。', tips: '白天/黑夜各自独立配色；红黑主题只做红色点缀不动字体主色。' },
  { id: 'set-bg', t: '🖼️ 背景', d: '主界面背景：默认 / 纯色 8 种 / 图片壁纸 + 模糊 + 在线自动轮换。', tips: '图片支持 png/jpg/webp/gif；在线壁纸每 5 分钟换一张，可随时关。' },
  { id: 'set-data', t: '💾 数据', d: '备份/导入/清空、保存到本地文件夹、WebDAV 云同步、导入笔记、时政时间范围。', tips: '数据只存本机；换设备用导出/导入或 WebDAV。' },
  { id: 'set-account', t: '🔐 账号', d: '本地登录门：注册/登录、修改密码、退出、删除账号、重置本地账号。', tips: '账号仅存本机（无服务器）；忘记密码可「重置本地账号」重新注册；不想每次登录可关闭登录门。' },
  { id: 'set-help', t: '🧭 帮助', d: '六步学习闭环、快捷键、常见问题、新手引导开关。', tips: '考前把快捷键和闭环过一遍；引导可一键全关或重开。' },
  { id: 'set-about', t: '📜 关于', d: '免责声明与开发者说明。', tips: '仅供个人学习使用，切勿商用；隐私与开发者信息见此处。' }
]

// ===== 设置面板顶部状态总览（一键看清哪些没配）=====
const stCfg = computed(() => {
  const textOk = !!(store.cfg.text && store.cfg.text.key && store.cfg.text.model)
  const visionOk = !!(store.cfg.vision && store.cfg.vision.key && store.cfg.vision.model)
  const f = store.cfg.fig || {}
  const figOk = !!f.on && !!f.url && !!f.model && (!!f.key || ['ollama', 'lmstudio', 'jan'].includes(f.prov))
  const r = store.cfg.rd || {}
  const rdOk = !!r.on && !!r.url && !!r.model && !!r.key
  const ttsMode = store.cfg.ttsMode || 'glm'
  const eng = TTS_ENGINES.find((e) => e.id === ttsMode)
  const ttsLabel = (eng && eng.name.split('（')[0].split('·')[0].trim()) || ttsMode
  const dataLoc = dirLabel.value || (store.cfg.dataDir ? store.cfg.dataDir : '本机')
  return { textOk, visionOk, figOk, rdOk, ttsLabel, dataLoc }
})
const tourShow = ref(false)
const tourI = ref(0)
const tourFold = ref(false)
function openTour() {
  tourShow.value = true
  tourI.value = 0
  tourFold.value = false
  scrollSet(SET_GUIDE[0].id)
}
function tourNext() {
  if (tourI.value < SET_GUIDE.length - 1) { tourI.value++; scrollSet(SET_GUIDE[tourI.value].id) }
  else tourShow.value = false
}
function tourPrev() {
  if (tourI.value > 0) { tourI.value--; scrollSet(SET_GUIDE[tourI.value].id) }
}
// ===== 设置快速导航 =====
// ===== 设置快速导航（按 6 大分组，点击自动展开并定位）=====
const SET_GROUP_META = [
  { id: 'ai', t: '🧠 模型' },
  { id: 'voice', t: '🗣️ 语音' },
  { id: 'look', t: '🎨 外观' },
  { id: 'data', t: '💾 数据' },
  { id: 'account', t: '🔐 账号' },
  { id: 'fun', t: '🎵 趣味' },
  { id: 'ui', t: '🧩 界面自定义' },
  { id: 'help', t: '❓ 帮助' }
]
const setNav = SET_GROUP_META
// ===== 设置分组手风琴：把超长设置面板分成 4 组，点击标题展开/收起 =====
// ===== 设置分组手风琴：把设置面板分成 6 组，点击标题展开/收起 =====
const SEC_GROUP = {
  'set-api': 'ai', 'set-vision': 'ai', 'set-fig': 'ai',
  'set-voice': 'voice',
  'set-look': 'look', 'set-bg': 'look',
  'set-data': 'data',
  'set-account': 'account',
  'set-ui': 'ui',
  'set-help': 'help', 'set-about': 'help'
}
const chatFastModel = ref(localStorage.getItem('xc_chat_fast_model') || '')
function saveChatFastModel() { try { localStorage.setItem('xc_chat_fast_model', String(chatFastModel.value || '').trim()) } catch (e) {} }
// ===== 对话快模型下拉（v3.8.87）：按文字模型所选服务商给出「非思考/极速」候选 =====
const fastCustomMode = ref(false)
const fastCustomName = ref('')
function fastTextOptions() {
  const prov = (store.cfg.text && store.cfg.text.prov) || 'ds'
  return fastTextOf(prov)
}
// 当前保存的快模型值不在该服务商候选内（自定义/历史值）→ 下拉里补一项保留
function fastHasCurrentCustom() {
  const cur = String(chatFastModel.value || '').trim()
  return !!cur && !fastTextOptions().some((f) => f.id === cur)
}
function applyFastCustom() {
  const v = String(fastCustomName.value || '').trim()
  if (!v) { showToast('请输入快模型名', 'warn'); return }
  chatFastModel.value = v
  fastCustomName.value = ''
  fastCustomMode.value = false
  saveChatFastModel()
}
const setGroup = ref('ai')
function toggleSetGroup(k) { setGroup.value = setGroup.value === k ? '' : k }
function scrollSet(id) {
  const g = SEC_GROUP[id] || id
  if (g && SET_GROUP_META.some((m) => m.id === g)) setGroup.value = g
  setTimeout(() => {
    const el = document.getElementById(id) || document.querySelector('.set-group-bd .sec-t')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, 60)
}
// ===== 界面自定义（Request D Part 2）：主界面板块/功能入口显隐开关（仅隐藏，不删除功能）=====
// uiHidden 存于 store.cfg.uiHidden（已加入 D() 默认 {}，旧用户自动迁移）；true=隐藏
const uiEntries = [
  { id: 'tab_ck', label: '🚀 看板', desc: '首页驾驶舱（备考概览 / 考试倒计时）' },
  { id: 'tab_chat', label: '💬 对话', desc: 'AI 刷题对话页' },
  { id: 'tab_kb', label: '📚 知识库', desc: '方法速查库' },
  { id: 'tab_ths', label: '🗂️ 积累', desc: '常识 / 时政 / 成语积累' },
  { id: 'tab_stat', label: '📊 统计', desc: '学习数据统计图' },
  { id: 'tab_wq', label: '📋 错题', desc: '错题复盘本' },
  { id: 'tab_3d', label: '🌌 3D数据', desc: '3D 学习数据驾驶舱' },
  { id: 'pet', label: '🐾 萌宠', desc: '常驻主页的宠物球与对话小窗' },
  { id: 'music', label: '🎵 背景音乐', desc: '看板页角的背景音乐球' }
]
function uiHiddenOf(id) {
  return !!(store.cfg.uiHidden && store.cfg.uiHidden[id])
}
function toggleUi(id) {
  if (!store.cfg.uiHidden) store.cfg.uiHidden = {}
  const willHide = !uiHiddenOf(id)
  store.cfg.uiHidden[id] = willHide
  // 隐藏的是当前所在 tab → 切到仍可见的首个 tab，避免空屏
  if (willHide && id.indexOf('tab_') === 0 && store.tab === id.slice(4)) {
    const firstVis = visibleTabs.value[0]
    if (firstVis) store.tab = firstVis.k
  }
  saveCfg()
  showToast(willHide ? '👻 已隐藏「' + (uiEntries.find((e) => e.id === id) || {}).label + '」（功能仍在）' : '👀 已显示「' + (uiEntries.find((e) => e.id === id) || {}).label + '」', 'info')
}
function resetUi() {
  store.cfg.uiHidden = {}
  saveCfg()
  showToast('✅ 已恢复全部界面入口', 'success')
}
const sysVoices = ref([])
function loadSysVoices() {
  sysVoices.value = getAllVoices()
}
function ttsTestVoice() {
  speak('你好，我是你的行测智能助教。这是本机语音试听。', { scene: store.cfg.ttsScene, rate: store.cfg.ttsRate, pitch: store.cfg.ttsPitch })
}
onVoicesReady(() => { if (setShow.value) loadSysVoices() })

// ===== 真人朗读引擎（音色市场）=====
const gmVoiceList = ref(GLM_PRESET_VOICES)
const gmVoiceStat = ref('')
const edgeVoiceList = ref(EDGE_PRESET_VOICES)
const edgeVoiceStat = ref('')
function setTtsMode(id) {
  store.cfg.ttsMode = id
  saveCfg()
  savePetGlobalVoice()
  if (id === 'glm') loadGmVoices()
  if (id === 'edge') loadEdgeVoices()
  showToast('已切换朗读引擎：' + (TTS_ENGINES.find((e) => e.id === id) || {}).name || '', 'info')
}
function pickVoice(engine, voiceId) {
  if (engine === 'glm') store.cfg.ttsGm.voice = voiceId
  else if (engine === 'openai') store.cfg.ttsOpenAI.voice = voiceId
  else store.cfg.ttsEdgeVoice = voiceId
  saveCfg()
  savePetGlobalVoice()
}
// ===== 音色市场管理：隐藏/重命名/恢复已有音色 =====
function vcNames(engine) {
  const vc = store.cfg.voiceCustom || {}
  return (vc.names && vc.names[engine]) || {}
}
function vcHidden(engine) {
  const vc = store.cfg.voiceCustom || {}
  return ((vc.hidden && vc.hidden[engine]) || [])
}
function voiceList(engine, base) {
  const hidden = vcHidden(engine)
  const names = vcNames(engine)
  return (base || []).filter((v) => !hidden.includes(v.id)).map((v) => ({ ...v, name: names[v.id] || v.name }))
}
function hiddenVoicesList(engine, base) {
  const hidden = vcHidden(engine)
  const names = vcNames(engine)
  return (base || []).filter((v) => hidden.includes(v.id)).map((v) => ({ ...v, name: names[v.id] || v.name }))
}
function hideVoice(engine, id) {
  if (!store.cfg.voiceCustom) store.cfg.voiceCustom = {}
  if (!store.cfg.voiceCustom.hidden) store.cfg.voiceCustom.hidden = {}
  if (!store.cfg.voiceCustom.hidden[engine]) store.cfg.voiceCustom.hidden[engine] = []
  if (!store.cfg.voiceCustom.hidden[engine].includes(id)) store.cfg.voiceCustom.hidden[engine].push(id)
  saveCfg()
  voiceUndo.value = { engine, id }
  showToast('👻 已隐藏该音色（可撤销）', 'info')
}
function unhideVoice(engine, id) {
  const vc = store.cfg.voiceCustom || {}
  if (vc.hidden && vc.hidden[engine]) vc.hidden[engine] = vc.hidden[engine].filter((x) => x !== id)
  saveCfg()
}
// ===== 百炼自定义音色（自然语言 voice_design）预设管理 =====
const dashCustomName = ref('')
function saveDashCustomVoice() {
  const desc = String(store.cfg.ttsDash.voiceCustom || '').trim()
  if (!desc) { showToast('请先填写自定义音色描述', 'info'); return }
  if (store.cfg.ttsDash.model && !store.cfg.ttsDash.model.includes('instruct')) {
    showToast('⚠️ 自定义音色仅 qwen3-tts-instruct-flash 等 instruct 模型支持，请先把模型改成 instruct 系列', 'error')
    return
  }
  if (!store.cfg.ttsDash.customVoices) store.cfg.ttsDash.customVoices = []
  const name = (dashCustomName.value || '').trim() || ('音色' + (store.cfg.ttsDash.customVoices.length + 1))
  store.cfg.ttsDash.customVoices.push({ id: 'dc' + Date.now(), name, desc })
  dashCustomName.value = ''
  saveCfg()
  showToast('💾 已保存自定义音色预设「' + name + '」', 'success')
}
function applyDashCustom(c) {
  store.cfg.ttsDash.voiceCustom = c.desc
  saveCfg(); savePetGlobalVoice()
}
function rmDashCustomVoice(i) {
  if (!store.cfg.ttsDash.customVoices) return
  const c = store.cfg.ttsDash.customVoices[i]
  store.cfg.ttsDash.customVoices.splice(i, 1)
  if (store.cfg.ttsDash.voiceCustom === (c && c.desc)) store.cfg.ttsDash.voiceCustom = ''
  saveCfg()
}
// 百炼模型下拉：判断当前是否为"自定义"（不在官方列表内）
const dashModelIsCustom = computed(() => !DASH_MODELS.some((m) => m.id === (store.cfg.ttsDash && store.cfg.ttsDash.model)))
function onDashModelChange(e) {
  const v = e.target.value
  if (v === '__custom__') {
    if (!dashModelIsCustom.value) store.cfg.ttsDash.model = ''
  } else {
    store.cfg.ttsDash.model = v
  }
  saveCfg(); savePetGlobalVoice()
}
// 把当前选中的百炼音色（含自定义音色）绑定给指定萌宠，实现"多角色音色"持久化
function bindDashToSkin(id) {
  if (petIsLocked(id)) { showToast('🔒 该角色声音已内置锁定，不可更改', 'error'); return }
  const d = store.cfg.ttsDash || {}
  const desc = d.voiceCustom ? ('（自定义：' + d.voiceCustom + '）') : ''
  petBindCloneVoice(id, { engine: 'dash', voice: d.voice || 'Cherry', voiceCustom: d.voiceCustom || '', name: '百炼·' + (d.voice || '默认') + desc })
  if (store.cfg.ttsMode !== 'dash') store.cfg.ttsMode = 'dash'
  saveCfg()
  const sk = petAllSkins.value.find((x) => x.id === id)
  showToast('🔗 已把百炼音色绑定给『' + ((sk && sk.char) || id) + '』', 'success')
}
// 内联改名（不用 window.prompt，避免被应用内/环境拦截）
const voiceRename = ref(null) // { engine, id, name }
const voiceUndo = ref(null) // { engine, id } 上一步隐藏，可撤销
function startRename(engine, id) {
  const base = engine === 'glm' ? gmVoiceList.value : engine === 'openai' ? OPENAI_PRESET_VOICES : edgeVoiceList.value
  const v = (base || []).find((x) => x.id === id)
  voiceRename.value = { engine, id, name: vcNames(engine)[id] || (v && v.name) || '' }
}
function confirmRename() {
  const r = voiceRename.value
  if (!r) return
  if (!store.cfg.voiceCustom) store.cfg.voiceCustom = {}
  if (!store.cfg.voiceCustom.names) store.cfg.voiceCustom.names = {}
  if (!store.cfg.voiceCustom.names[r.engine]) store.cfg.voiceCustom.names[r.engine] = {}
  const n = String(r.name || '').trim()
  if (n) store.cfg.voiceCustom.names[r.engine][r.id] = n
  else delete store.cfg.voiceCustom.names[r.engine][r.id]
  saveCfg()
  showToast('✏️ 已' + (n ? '重命名为：' + n : '恢复默认名称'), 'success')
  voiceRename.value = null
}
function cancelRename() { voiceRename.value = null }
function undoHideVoice() {
  const u = voiceUndo.value
  if (!u) return
  const vc = store.cfg.voiceCustom || {}
  if (vc.hidden && vc.hidden[u.engine]) vc.hidden[u.engine] = vc.hidden[u.engine].filter((x) => x !== u.id)
  saveCfg()
  voiceUndo.value = null
  showToast('↩️ 已撤销隐藏', 'success')
}
async function ttsPreview(engine, voiceId) {
  await previewVoice(engine, voiceId)
}
// 当前生效音色（全局音色 = 萌宠音色；克隆角色临时用克隆原声）
const globalVoiceLabel = computed(() => {
  const g = petGlobalVoice()
  if (!g || !g.voice) return ''
  if (g.engine === 'glm') { const v = GLM_PRESET_VOICES.find((x) => x.id === g.voice); return '智谱 · ' + (v ? v.name : g.voice) }
  if (g.engine === 'openai') { const v = OPENAI_PRESET_VOICES.find((x) => x.id === g.voice); return 'CosyVoice2 · ' + (v ? v.name : g.voice) }
  if (g.engine === 'edge') { const v = EDGE_PRESET_VOICES.find((x) => x.id === g.voice); return 'Edge · ' + (v ? v.name : g.voice) }
  return '系统语音'
})
const petEffectiveLabel = computed(() => {
  const bv = petSkinVoiceOf(petSkin.value.id)
  if (bv && bv.cloned) return '当前角色「' + petSkin.value.char + '」用克隆原声「' + (bv.name || bv.voice) + '」🧬（切走恢复全局）'
  return '所有角色与全局朗读共用：' + globalVoiceLabel.value
})
// 所有克隆音色清单（内置锁定 + 自定义可删），供「我的克隆音色」展示
function petCloneVoiceList() {
  const out = []
  for (const sk of petAllSkins.value) {
    const v = petSkinVoiceOf(sk.id)
    if (v && v.cloned && v.voice) {
      const userBound = !!(store.cfg.skinVoices && store.cfg.skinVoices[sk.id])
      out.push({ skinId: sk.id, char: sk.char, name: v.name || '克隆音色', engine: v.engine, voice: v.voice, locked: petIsLocked(sk.id) && !userBound, userBound })
    }
  }
  return out
}
async function loadGmVoices() {
  gmVoiceStat.value = '正在拉取官方音色…'
  const list = await listGmVoices()
  if (list && list.length) {
    gmVoiceList.value = list
    gmVoiceStat.value = '已加载 ' + list.length + ' 个官方音色（含你克隆的音色）'
  } else {
    gmVoiceList.value = GLM_PRESET_VOICES
    gmVoiceStat.value = '暂未获取到官方音色（需先填智谱 Key），当前展示内置常用音色'
  }
}
async function loadEdgeVoices() {
  edgeVoiceStat.value = '正在拉取官方音色…'
  const list = await listEdgeVoices()
  if (list && list.length) {
    edgeVoiceList.value = list
    edgeVoiceStat.value = '已加载 ' + list.length + ' 个中文 Neural 音色'
  } else {
    edgeVoiceList.value = EDGE_PRESET_VOICES
    edgeVoiceStat.value = '官方音色拉取失败，当前展示内置音色'
  }
}
const voiceFileName = ref('')
const cloneVoiceName = ref('')
const cloneVoiceText = ref('') // 可选：参考音频对应的文字内容，填了克隆更像
const voiceCloning = ref(false)
const voiceCloneStat = ref('')
// 克隆后端：zhipu=智谱 GLM-TTS-Clone（3 秒参考音频·原声级）/ cosy=硅基流动 CosyVoice2
const cloneBackend = ref('zhipu')
let voiceFileObj = null
function onVoiceFile(ev) {
  const f = ev.target.files && ev.target.files[0]
  if (!f) return
  voiceFileObj = f
  voiceFileName.value = f.name
  voiceCloneStat.value = ''
}
// 克隆成功后将声线绑定到当前角色（一键换装即用克隆原声），并立刻启用
async function doCloneVoice() {
  if (!voiceFileObj) { showToast('请先选择参考音频', 'info'); return }
  if (petIsLocked(petSkin.value.id)) { showToast('🔒 该角色声音已内置锁定，不可更改/重新克隆', 'error'); return }
  voiceCloning.value = true
  voiceCloneStat.value = '⏳ 正在预处理音频（转码/去静音/裁剪 ≤20 秒）…'
  try {
    // 1) 预处理：任意格式（mp3/wav/m4a/aac/ogg…）→ 单声道 24kHz 标准 WAV，去头尾静音、裁剪到 ≤20 秒
    const pre = await prepareCloneAudio(voiceFileObj, { maxSeconds: 20 })
    if (!pre || pre.error) {
      voiceCloneStat.value = '❌ 音频预处理失败：' + (pre && pre.error || '无法解码该文件')
      showToast('❌ 音频无法解码：' + (pre && pre.error || '请换一个有效的 mp3/wav 文件'), 'error')
      return
    }
    voiceCloneStat.value = '⏳ 已转码为 WAV（' + pre.seconds + ' 秒' + (pre.sliced ? '，已裁剪' : '') + '），正在上传音频 + 识别参考文字 + 克隆（约 10-40 秒）…'
    const name = cloneVoiceName.value.trim() || (petSkin.value.char + '声线')
    const r = cloneBackend.value === 'zhipu'
      ? await cloneZhipuVoice(pre.file, { name, text: cloneVoiceText.value.trim() })
      : await cloneCosyVoice(pre.file, {
          key: store.cfg.ttsOpenAI.key,
          url: store.cfg.ttsOpenAI.url,
          model: store.cfg.ttsOpenAI.model,
          name
        })
    if (!r.ok) { voiceCloneStat.value = '❌ ' + r.msg; showToast('克隆失败：' + r.msg, 'error'); return }
    const engine = cloneBackend.value === 'zhipu' ? 'glm' : 'openai'
    const model = cloneBackend.value === 'cosy' ? store.cfg.ttsOpenAI.model : ''
    // 绑定到当前角色 + 立即启用
    petBindCloneVoice(petSkin.value.id, { engine, voice: r.voice, name: r.name, model })
    if (engine === 'glm') { if (!store.cfg.ttsGm) store.cfg.ttsGm = {}; store.cfg.ttsGm.voice = r.voice }
    else { store.cfg.ttsOpenAI.voice = r.voice; if (model) store.cfg.ttsOpenAI.model = model }
    store.cfg.ttsMode = engine
    saveCfg()
    voiceCloneStat.value = '✅ 大模型克隆成功！「' + r.name + '」已绑定给『' + petSkin.value.char + '』并启用（引擎：' + (cloneBackend.value === 'zhipu' ? '智谱 GLM-TTS-Clone' : 'CosyVoice2') + '）。可继续上传新音频重新克隆/换声。'
    showToast('🧬 克隆成功：' + r.name + ' → ' + petSkin.value.char, 'success')
    // 允许重复上传重新克隆：清空已选文件
    voiceFileObj = null
    voiceFileName.value = ''
  } catch (e) {
    voiceCloneStat.value = '❌ ' + e.message
  } finally {
    voiceCloning.value = false
  }
}
// 试听某个角色已绑定的克隆声线
async function ttsPreviewBound(skinId) {
  const bv = petSkinVoiceOf(skinId)
  if (!bv || !bv.voice) { showToast('该角色还没有克隆声线', 'info'); return }
  const r = bv.engine === 'glm' ? await previewVoice('glm', bv.voice) : await previewVoice('openai', bv.voice)
  return r
}
function doUnbindSkinVoice(skinId) {
  const ok = petUnbindCloneVoice(skinId)
  const sk = petAllSkins.value.find((x) => x.id === skinId)
  if (ok === null) { showToast('🔒 该角色声音已内置锁定，不可更改', 'error'); return }
  showToast('🗑 已解除「' + ((sk && sk.char) || skinId) + '」的克隆声线', 'info')
}
const cloneRename = ref(null) // { skinId, name }
function doRenameCloneVoice(skinId) {
  const bv = store.cfg.skinVoices && store.cfg.skinVoices[skinId]
  if (!bv || !bv.voice) { showToast('🔒 内置克隆音色不可重命名', 'error'); return }
  cloneRename.value = { skinId, name: bv.name || '' }
}
function confirmCloneRename() {
  const r = cloneRename.value
  if (!r) return
  if (petRenameCloneVoice(r.skinId, r.name)) { saveCfg(); showToast('✏️ 已重命名克隆音色' + (String(r.name).trim() ? '：' + String(r.name).trim() : '（恢复角色名）'), 'success') }
  cloneRename.value = null
}
function copyFigKey() {
  copyFigKeyToTts()
  saveCfg()
}
const petAskText = ref('')
const skinShow = ref(false)
function onPetImgFile(ev) {
  const f = ev.target.files && ev.target.files[0]
  ev.target.value = ''
  if (!f) return
  if (!/^image\//.test(f.type)) { showToast('请选择图片文件', 'error'); return }
  const rd = new FileReader()
  rd.onload = () => {
    // 压缩到 256px 头像尺寸，避免撑爆 localStorage
    const img = new Image()
    img.onload = () => {
      const size = 256
      const canvas = document.createElement('canvas')
      const scale = Math.min(1, size / Math.max(img.width, img.height))
      canvas.width = Math.max(1, Math.round(img.width * scale))
      canvas.height = Math.max(1, Math.round(img.height * scale))
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
      const ok = setPetImg(dataUrl)
      if (ok) showToast('✅ 已为「' + petSkin.value.char + '」换上你上传的形象', 'success')
      else showToast('🔒 该角色形象已锁定，不可更改', 'error')
    }
    img.onerror = () => showToast('图片读取失败', 'error')
    img.src = rd.result
  }
  rd.readAsDataURL(f)
}
function doClearPetImg() {
  const ok = clearPetImg()
  if (ok) showToast('🗑 已恢复默认形象', 'info')
  else showToast('🔒 该角色形象已锁定，不可更改', 'error')
}
function applySkin(id) {
  applyPetSkin(id)
  const sk = petAllSkins.value.find((s) => s.id === id)
  showToast('🎭 已切换角色：' + (sk ? sk.char : id), 'success')
}
// 自定义角色字段读写（名字/人设），支持 自定义2/3/4…
function cusField(key) {
  const d = petCustomData(petSkin.value.id)
  return d ? String(d[key] || '') : ''
}
function setCusField(key, val) {
  const d = petCustomData(petSkin.value.id)
  if (!d) return
  d[key] = val
  if (key === 'name') petPersistName(val)
  saveCfg()
}
function doAddCustom() {
  const e = petAddCustomSkin()
  applyPetSkin(e.id)
  showToast('➕ 已新增「' + e.name + '」，可自定义名字/人设/形象/声线', 'success')
}
function doRemoveCustom(id) {
  const ok = petRemoveCustomSkin(id)
  if (ok) { applySkin(petAllSkins.value[0].id); showToast('🗑 已删除该自定义角色', 'info') }
  else showToast('该角色不可删除', 'error')
}
function doPetAsk(preset) {
  if (preset) petAskText.value = preset
  const t = String(petAskText.value || '').trim()
  if (!t || petChatBusy.value) return
  petAskText.value = ''
  petAsk(t)
}
// 萌宠发图：压缩后走视觉模型 / 图形增强读图
function onPetImgChat(ev) {
  const f = ev.target.files && ev.target.files[0]
  ev.target.value = ''
  if (!f) return
  if (!/^image\//.test(f.type)) { showToast('请选择图片文件', 'error'); return }
  const rd = new FileReader()
  rd.onload = () => { petAskImage(rd.result, petAskText.value.trim()) }
  rd.onerror = () => showToast('图片读取失败', 'error')
  rd.readAsDataURL(f)
}
// 萌宠语音输入（语音转文字，识别结果填入输入框）
function petMic() {
  if (recogActive()) { startRecog(() => {}); showToast('🎤 已停止', 'info'); return }
  const ok = startRecog((txt) => { petAskText.value = txt })
  if (!ok) showToast('当前浏览器不支持语音输入', 'info')
  else showToast('🎤 正在听…（再点一次停止）', 'info')
}

function openSet() {
  setShow.value = true
  loadSysVoices()
  loadGmVoices()
  loadEdgeVoices()
  getFolderName().then((n) => { if (n) dirLabel.value = n }).catch(() => {})
  setTimeout(testConn, 100)
}
function saveSet() {
  saveCfg()
  setShow.value = false
  testConn()
}

// ===== 错误日志（P3 全局异常捕获的本地查看入口）=====
const errLogShow = ref(false)
const errLogList = ref(getErrorLog())
const errLogText = computed(() => errLogList.value.length
  ? errLogList.value.map((e) => `[${e.t}] ${e.type}${e.comp ? '(' + e.comp + ')' : ''} ${e.msg}`).join('\n')
  : '暂无错误记录')
function refreshErrLog() { errLogList.value = getErrorLog() }
const quizLogCount = computed(() => genLogSize())
function exportQuizLog() {
  const json = exportGenLog()
  if (!json || json === '[]') { showToast('暂无出题历史数据', 'info'); return }
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = '行测AI出题历史_' + new Date().toISOString().slice(0, 10) + '.json'
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 800)
  showToast('✅ 已导出出题历史（' + quizLogCount.value + ' 条，可作训练数据）', 'success')
}
function clearQuizLog() {
  askConfirm('确定清空全部出题历史数据吗？清空后 AI 的「历史质检学习」将从空开始重新积累。', () => {
    clearGenLog()
    showToast('🧹 已清空出题历史', 'info')
  })
}
function clearErrLog() { clearErrorLog(); errLogList.value = []; showToast('✅ 已清空错误日志', 'success') }

// ===== 外观 & 数据管理（设置页增强）=====
const fs = ref(store.cfg.fontSize || 14.5)
function applyFs() {
  document.documentElement.style.setProperty('--chat-fs', fs.value + 'px')
  document.body.style.fontSize = fs.value + 'px'
}
applyFs()
function setFs() {
  store.cfg.fontSize = fs.value
  saveCfg()
  applyFs()
}
// ===== 全局字体族选择 =====
const FONT_FAMILIES = [
  { id: 'default', name: '默认（微软雅黑）', stack: "'Microsoft YaHei','PingFang SC',sans-serif" },
  { id: 'song', name: '宋体（书本感）', stack: "'SimSun','宋体',serif" },
  { id: 'hei', name: '黑体（稳重）', stack: "'SimHei','黑体',sans-serif" },
  { id: 'kai', name: '楷体（手写感）', stack: "'KaiTi','楷体',serif" },
  { id: 'fang', name: '仿宋（公文感）', stack: "'FangSong','仿宋',serif" },
  { id: 'yuan', name: '幼圆（圆润）', stack: "'YouYuan','幼圆',sans-serif" }
]
const fontFam = ref(store.cfg.fontFamily || 'default')
function applyFontFamily() {
  const f = FONT_FAMILIES.find((x) => x.id === fontFam.value) || FONT_FAMILIES[0]
  document.body.style.fontFamily = f.stack
  document.body.style.setProperty('--font-family', f.stack)
}
applyFontFamily()
function setFontFamily() {
  store.cfg.fontFamily = fontFam.value
  saveCfg()
  applyFontFamily()
}
// ===== 全部用户数据一键导出 / 导入（跨设备/防丢失） =====
async function shareData() {
  try {
    const ok = await shareBackup()
    if (ok) { showToast('✅ 已调起系统保存/分享（请选择存放位置或发送给文件管理）', 'success') }
    else { downloadBackup(); showToast('✅ 已下载备份 JSON（手机可在下载目录找到并移动/发送）', 'success') }
  } catch (e) { showToast('分享失败：' + ((e && e.message) || e), 'error') }
}
function exportAllData() {
  try {
    downloadBackup()
    showToast('✅ 已导出全部数据（含设置；API Key/密码已打码，导入后自动保留本机现有密钥）', 'success')
  } catch (e) {
    showToast('导出失败：' + ((e && e.message) || e), 'error')
  }
}
function importAllData(ev) {
  const f = ev.target.files && ev.target.files[0]
  if (!f) return
  const rd = new FileReader()
  rd.onload = () => {
    try {
      const d = JSON.parse(rd.result)
      const n = restoreAll(d)
      showToast('✅ 已导入 ' + n + ' 项数据，即将刷新', 'success')
      setTimeout(() => location.reload(), 900)
    } catch (e) { showToast('❌ 备份文件无效：' + ((e && e.message) || e), 'error') }
  }
  rd.readAsText(f)
  ev.target.value = ''
}
function importNotes(ev) {
  const f = ev.target.files && ev.target.files[0]
  if (!f) return
  const rd = new FileReader()
  rd.onload = () => {
    try {
      const notes = parseMarkdownNotes(rd.result, f.name)
      if (!notes.length) {
        showToast('未解析到笔记内容', 'error')
        return
      }
      store.notes = notes.concat(store.notes)
      saveNotes()
      showToast('✅ 已导入 ' + notes.length + ' 条笔记（' + f.name + '）', 'success')
    } catch (e) {
      showToast('导入失败：' + e.message, 'error')
    }
  }
  rd.readAsText(f)
  ev.target.value = ''
}


function clearWrong() {
  if (!store.wqs.length) {
    showToast('没有错题', 'info')
    return
  }
  if (!confirm('确定清空全部错题？')) return
  store.wqs = []
  saveWqs()
  showToast('已清空错题', 'success')
}
function clearChat() {
  if (!store.msgs.length) {
    showToast('没有对话', 'info')
    return
  }
  if (!confirm('确定清空全部对话记录？')) return
  store.msgs = []
  saveMsgs()
  showToast('已清空对话', 'success')
}
function toggleTtsSetting() {
  store.cfg.ttsOn = store.cfg.ttsOn === false
  saveCfg()
  if (store.cfg.ttsOn === false) stopSpeak()
  showToast(store.cfg.ttsOn ? '🔊 自动朗读已开启' : '🔇 自动朗读已关闭', 'info')
}
function ttsTest() {
  speak('你好，我是你的行测智能助教。接下来这道题，我来帮你讲透。', {
    scene: store.cfg.ttsScene,
    rate: store.cfg.ttsRate,
    pitch: store.cfg.ttsPitch
  })
}
// ===== WebDAV 云同步 =====
const wdTpl = (kind) => {
  const w = (store.cfg.webdav = store.cfg.webdav || {})
  const user = String(w.user || '').trim()
  if (kind === 'jianguo') {
    w.url = 'https://dav.jianguoyun.com/dav/行测AI备份.json'
    wdStat.value = '已填入坚果云地址。请填 用户名（邮箱）与官网「安全选项」生成的应用密码，然后点 ⬆️ 上传。'
    showToast('☁️ 已填入坚果云模板；密码请用官网“应用密码”', 'info')
  } else if (kind === 'nextcloud') {
    w.url = 'https://你的主机/remote.php/dav/files/' + (user || '你的用户名') + '/行测AI备份.json'
    wdStat.value = '请把地址里的“你的主机”“你的用户名”改成你的真实值（保持 /行测AI备份.json 结尾）。'
    showToast('🏠 已填入 Nextcloud 模板，请把主机与用户名替换成真实的', 'info')
  } else {
    w.url = ''
    wdStat.value = '自定义：完整地址形如 https://dav.jianguoyun.com/dav/行测AI备份.json（以 .json 结尾）'
    showToast('✍️ 请输入完整 WebDAV 文件地址（.json 结尾）', 'info')
  }
  saveCfg()
}

const wdBusy = ref(false)
const wdStat = ref('')
async function wdUp() {
  wdBusy.value = true
  wdStat.value = '上传中…'
  try {
    const ts = await webdavUpload()
    wdStat.value = '✅ 已上传（' + new Date(ts).toLocaleString() + '）'
    showToast('☁️ 已上传备份到 WebDAV', 'success')
  } catch (e) {
    wdStat.value = '❌ ' + e.message
  } finally {
    wdBusy.value = false
  }
}
async function wdDown() {
  wdBusy.value = true
  wdStat.value = '下载中…'
  try {
    const d = await webdavDownload()
    if (!d || (!d.data && !d.app)) throw new Error('备份文件格式不对')
    const n = restoreAll(d)
    wdStat.value = '✅ 已恢复 ' + n + ' 项数据（' + (d.ts ? new Date(d.ts).toLocaleString() : '') + '），即将刷新'
    showToast('☁️ 已从 WebDAV 恢复备份（' + n + ' 项）', 'success')
    setTimeout(() => location.reload(), 900)
  } catch (e) {
    wdStat.value = '❌ ' + ((e && e.message) || e)
  } finally {
    wdBusy.value = false
  }
}
function resetAll() {
  if (!confirm('确认清空所有本地数据（设置/错题/对话）？此操作不可恢复')) return
  localStorage.clear()
  location.reload()
}
// ============================================================
// 模型配置 · 注册表驱动（v3.8.84）
// 三类（text 文本 / vision 视觉 / fig 图像增强）共用一套逻辑：
// 服务商下拉 + 模型下拉（新→旧）+ Key/URL + 每类独立「测试连通」按钮
// 数据源：src/api/modelRegistry.js（内置清单 v+用户 customModels）
// ============================================================
const CATS = ['text', 'vision', 'fig']
const CAT_LABEL = { text: '文本', vision: '视觉', fig: '图形增强', rd: '语音阅读' }
// rd（语音阅读·讲稿改写）复用 文本(text) 的服务商与模型清单
const listCat = (cat) => (cat === 'rd' ? 'text' : cat)
// 每类测试按钮状态：busy / stat / code(''|'ok'|'bad'|'warn')
const catUi = { text: { busy: false, stat: '', code: '' }, vision: { busy: false, stat: '', code: '' }, fig: { busy: false, stat: '', code: '' }, rd: { busy: false, stat: '', code: '' } }
// 每类「手动添加自定义模型」输入框
const customInput = { text: '', vision: '', fig: '', rd: '' }
const catCfg = (cat) => store.cfg[cat]
const catProviders = (cat) => PROVIDERS[listCat(cat)] || {}
// 当前 provider 的模型下拉项 = 内置(新→旧) + 用户自增；当前值不在清单时额外保留一项防丢
function catModels(cat) {
  const c = catCfg(cat)
  if (!c) return []
  const list = mergedModelsOf(c.prov, listCat(cat), store.cfg.customModels)
  const cur = c.model
  if (cur && !list.some((m) => m.id === cur)) list.unshift({ id: cur, label: '当前模型（不在预设清单）：' + cur, src: 'cur' })
  return list
}
// 当前 provider 下「用户自增」模型（渲染可删 chips）
function catUserModels(cat) {
  const cm = (store.cfg.customModels || {})[listCat(cat)]
  return (cm && cm[catCfg(cat).prov]) || []
}
// 切换服务商：自动填内置 API 地址；模型不在新清单 → 自动切到该商最新模型；custom 完全由用户手填
function onCatProv(cat) {
  const c = catCfg(cat)
  if (!c) return
  if (c.prov !== 'custom') {
    const p = providerOf(c.prov, listCat(cat))
    if (p.url) c.url = p.url
    const known = mergedModelsOf(c.prov, listCat(cat), store.cfg.customModels)
    if (!c.model || !known.some((m) => m.id === c.model)) {
      const d = defaultModelOf(c.prov, listCat(cat))
      if (d) c.model = d
    }
  }
  saveCfg()
}
// 添加用户自增模型（新上市/内部网关模型兜底，任何服务商下都可用）
function addCustomModel(cat) {
  const id = String(customInput[cat] || '').trim()
  if (!id) { showToast('请输入模型名称后再添加', 'warn'); return }
  if (!store.cfg.customModels) store.cfg.customModels = {}
  const lc = listCat(cat)
  store.cfg.customModels[lc] = store.cfg.customModels[lc] || {}
  const prov = catCfg(cat).prov
  store.cfg.customModels[lc][prov] = store.cfg.customModels[lc][prov] || []
  const arr = store.cfg.customModels[lc][prov]
  if (arr.some((m) => m.id === id)) { showToast('该模型已在列表里', 'warn'); return }
  arr.push({ id, label: id + '（自增）', pub: '', note: '用户自增' })
  customInput[cat] = ''
  saveCfg()
}
function rmCustomModel(cat, id) {
  const cm = (store.cfg.customModels || {})[listCat(cat)]
  const arr = cm && cm[catCfg(cat).prov]
  if (!arr) return
  const i = arr.findIndex((m) => m.id === id)
  if (i >= 0) arr.splice(i, 1)
  saveCfg()
}
// 注册表兜底说明
function registryInfo() {
  let n = 0
  CATS.forEach((cat) => { n += Object.keys(MODELS[cat] || {}).length })
  return '📦 模型清单 v' + REGISTRY_VERSION + '（内置 ' + n + ' 个服务商模型表）· 新模型可在下方「➕ 手动添加」'
}
// 每类独立「测试连通性」：真实发起一次极小请求验证 Key/URL/模型名是否可用
async function testCat(cat) {
  const st = catUi[cat]
  if (st.busy) return
  const c = catCfg(cat)
  const localNoKey = cat === 'fig' && ['ollama', 'lmstudio', 'jan'].includes(c && c.prov)
  if (!c || !c.url || !c.model) { st.stat = '请先选服务商并填 API 地址与模型'; st.code = 'warn'; return }
  if (!c.key && !localNoKey) { st.stat = '未填 API Key（本地模型除外）'; st.code = 'warn'; return }
  st.busy = true
  st.stat = '检测中…'
  st.code = ''
  const t0 = Date.now()
  const r = await testOne(c)
  const ms = Date.now() - t0
  st.busy = false
  if (r.ok === true) {
    st.stat = '✅ 连通正常 · ' + ms + 'ms'
    st.code = 'ok'
    showToast('✅ ' + CAT_LABEL[cat] + '模型连通正常（' + ms + 'ms）', 'success')
  } else if (r.ok === false) {
    st.stat = '❌ ' + String(r.msg || '连接失败').slice(0, 90)
    st.code = 'bad'
    showToast('❌ ' + CAT_LABEL[cat] + '模型连接失败：' + String(r.msg || '').slice(0, 120), 'error')
  } else {
    st.stat = '⚠️ 未配置'
    st.code = 'warn'
  }
}
// ===== 键盘快捷键 =====
function onPopState() {
  const ids = syncNavFromHistory()
  if (ids.length) window.dispatchEvent(new CustomEvent('app:nav-back', { detail: ids }))
}
function goTab(k) {
  // 若有打开的浮层/面板：先关掉栈顶（回到当前层级）再切页
  if (nav.stack.length) {
    const e = navBack()
    if (e) window.dispatchEvent(new CustomEvent('app:nav-back', { detail: [e.id] }))
  }
  store.tab = k
}
function onKey(e) {
  // Ctrl/Cmd+K 聚焦搜索
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    searchInput.value && searchInput.value.focus()
    return
  }
  // Esc：先关浮层/面板（返回上一层），再收起搜索
  if (e.key === 'Escape') {
    if (nav.stack.length) { const e2 = navBack(); if (e2) window.dispatchEvent(new CustomEvent('app:nav-back', { detail: [e2.id] })); return }
    if (searchDrop.value) { searchDrop.value = false; if (document.activeElement === searchInput.value) searchInput.value.blur() }
  }
  // Ctrl/Cmd+1..5 切换页签
  if ((e.ctrlKey || e.metaKey) && /^[1-6]$/.test(e.key)) {
    const idx = Number(e.key) - 1
    if (tabs[idx]) {
      e.preventDefault()
      store.tab = tabs[idx].k
    }
  }
}
onMounted(() => {
  authGateInit()
  clampFloatPos()
  window.addEventListener('keydown', onKey)
  startStudyTrack()
  try { if (!localStorage.getItem('xc_onboarded')) { startOnboard() } } catch (e) {}
  window.addEventListener('xc-export-kb', () => openExp('kb'))
  window.addEventListener('popstate', onPopState)
  window.addEventListener('hashchange', onHashChange)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('xc-export-kb', () => openExp('kb'))
  window.removeEventListener('popstate', onPopState)
  window.removeEventListener('hashchange', onHashChange)
  stopStudyTrack()
})
</script>
<template>
  <!-- 本地登录门：登录后才可使用（设置里可关闭） -->
  <div v-if="authLoading" class="auth-gate">
    <div class="auth-card auth-loading"><div class="auth-spin"></div><div>正在载入本地账号…</div></div>
  </div>
  <div v-else-if="authState.enabled && !authState.ok" class="auth-gate">
    <div class="auth-card">
      <div class="auth-brand">🧠 行测<span>智能助教</span></div>
      <div class="auth-sub">本地账号 · 用户名 + 密码 · 登录后才可使用</div>
      <div class="auth-tabs">
        <button :class="{ on: authMode === 'login' }" @click="switchAuthMode('login')">🔓 登录</button>
        <button :class="{ on: authMode === 'register' }" @click="switchAuthMode('register')">📝 注册</button>
      </div>
      <div class="auth-body">
        <template v-if="authMode === 'login'">
          <input v-model="authU" placeholder="用户名（2-20位 中英文/数字/下划线）" autocomplete="username" @keyup.enter="doAuthSubmit" />
          <input v-model="authP" type="password" placeholder="密码（至少 4 位）" autocomplete="current-password" @keyup.enter="doAuthSubmit" />
          <label class="auth-remember"><input v-model="authRemember" type="checkbox" /> 记住我（7 天内免登录）</label>
          <div v-if="authErr" class="auth-err">{{ authErr }}</div>
          <button class="btn btn-pri auth-submit" :disabled="authBusy" @click="doAuthSubmit">{{ authBusy ? '请稍候…' : '🔓 登录' }}</button>
        </template>
        <template v-else>
          <input v-model="authU" placeholder="用户名（2-20位 中英文/数字/下划线）" autocomplete="username" />
          <input v-model="authP" type="password" placeholder="密码（至少 4 位）" autocomplete="new-password" />
          <input v-model="authP2" type="password" placeholder="确认密码" autocomplete="new-password" @keyup.enter="doAuthSubmit" />
          <div v-if="authErr" class="auth-err">{{ authErr }}</div>
          <button class="btn btn-pri auth-submit" :disabled="authBusy" @click="doAuthSubmit">{{ authBusy ? '请稍候…' : '📝 注册并登录' }}</button>
        </template>
      </div>
      <details class="auth-help">
        <summary>ℹ️ 什么是「本地账号」？</summary>
        <div>账号仅保存在本机浏览器（localStorage），无服务器、不上传任何数据，用于防止他人随意使用你的备考数据。用户名 + 密码登录，勾「记住我」7 天内免登录。清除站点数据或换浏览器会丢失账号（对话/错题/笔记等学习数据不受影响），重新注册即可。忘记密码可点下方「重置本地账号」。</div>
      </details>
      <button class="auth-reset" @click="doAuthReset">🔄 忘记密码？重置本地账号（清空本机账号记录）</button>
      <div class="auth-foot">💬 六大板块 · 名师方法论 · AI 出题/答疑/朗读 · 三端同步</div>
    </div>
  </div>
  <!-- 自定义确认弹窗（账号重置/删除等，替代原生 confirm，PWA/webview 更稳） -->
  <div v-if="authConfirm" class="auth-confirm-ov" @click.self="authConfirmNo()">
    <div class="auth-confirm-box">
      <div class="auth-confirm-title">⚠️ 请确认</div>
      <div class="auth-confirm-msg">{{ authConfirm.msg }}</div>
      <div class="auth-confirm-btns">
        <button class="btn btn-gh" style="font-size: 13px" @click="authConfirmNo()">取消</button>
        <button class="btn btn-pri" style="font-size: 13px" @click="authConfirmYes()">✅ 确认</button>
      </div>
    </div>
  </div>
  <div v-if="wallStyle" class="bg-layer" :style="wallStyle"></div>
<div class="app is-2d" :class="{ 'has-wall': wallStyle }">
    <header class="topbar">
      <div class="brand">
        <span class="brand-logo">🧠</span>
        <div class="brand-txt">
          <div class="brand-name">
            行测
            <b>智能助教</b>
          </div>
          <div class="brand-sub">六大板块 · 名师方法论</div>
        </div>
      </div>
      <div class="srch">
        <input
          ref="searchInput"
          v-model="sq"
          placeholder="🔍 搜错题 / 对话 / 板块…"
          class="srch-in"
          @focus="focusDrop()"
          @blur="searchBlur()"
        />
        <div v-if="searchDrop && sq.trim()" class="srch-drop">
          <template v-if="searchResults.plate.length">
            <div class="sd-sec">板块</div>
            <div v-for="p in searchResults.plate" :key="p" class="sd-it" @mousedown.prevent="goPlate(p)">
              🏛️ {{ p }}
            </div>
</template>
          <template v-if="searchResults.func.length">
            <div class="sd-sec">⚡ 功能</div>
            <div v-for="f in searchResults.func" :key="f.k" class="sd-it" @mousedown.prevent="goFunc(f)">{{ f.t }}</div>
          </template>
          <template v-if="searchResults.kb.length">
            <div class="sd-sec">📚 知识库积累</div>
            <div v-for="(it, i) in searchResults.kb" :key="'kb' + i" class="sd-it" @mousedown.prevent="goKb(it)">{{ it.type }} · {{ it.term }}</div>
          </template>
          <template v-if="searchResults.wq.length">
            <div class="sd-sec">错题</div>
            <div
              v-for="q in searchResults.wq"
              :key="q.id"
              class="sd-it"
              @mousedown.prevent="goWq(store.wqs.indexOf(q))"
            >
              📋 {{ q.subject || '' }} · {{ String(q.question).slice(0, 36) }}
            </div>
</template>
          <template v-if="searchResults.msg.length">
            <div class="sd-sec">对话</div>
            <div
              v-for="(m, i) in searchResults.msg"
              :key="i"
              class="sd-it"
              @mousedown.prevent="store.tab = 'chat'; sq = ''; searchDrop = false"
            >
              💬 {{ String((m.content && m.content.text) || m.content || '').slice(0, 36) }}
            </div>
</template>
          <div
            v-if="!searchResults.plate.length && !searchResults.wq.length && !searchResults.msg.length"
            class="sd-empty"
          >
            无匹配结果
          </div>
        </div>
      </div>
      <div class="top-acts">
        <div class="status-pill">
          <div class="dot" :class="stDot"></div>
          <span>{{ stStat }}</span>
        </div>
        <button class="cost-pill" :class="{ warn: costToday > 0, live: costLive.active }" :title="costLive.active ? '🔴 正在调用 AI（' + (COST_FEATURES[costLive.feature] || costLive.feature) + ' · ' + (costLive.model || '') + '），完成自动记账' : '💰 AI 用量与花费（实时追踪）：点开查看明细、计价表、清空记录'" @click="costShow = true">
          💰 {{ fmtCost(costToday) }}<span v-if="costLive.active" class="cost-pill-live"></span>
        </button>
        <button class="btn" style="padding: 4px 12px; font-size: 13px" title="3D 学习数据驾驶舱：查看各板块学习数据的交互式 3D 场景" @click="store.tab = '3d'">
          🌌 3D数据
        </button>
        <button v-if="nav.stack.length" class="btn" style="padding: 4px 12px; font-size: 13px; color: var(--hud-cyan)" title="返回上一层（也可按键盘 Esc / 浏览器返回）" @click="onPopState(); navBack()">← {{ nav.stack[nav.stack.length - 1].label }}</button>
        <button class="btn" style="padding: 4px 12px; font-size: 13px" @click="openExp('chat')">📤 导出</button>
        <button class="btn" style="padding: 4px 12px; font-size: 13px" @click="openSet()">⚙️ 设置</button>
        <button class="btn" style="padding: 4px 12px; font-size: 13px" @click="doTheme()">
          {{ theme === 'light' ? '🌙' : '☀️' }}
        </button>
      </div>
      <!-- 手机端「⋯」更多菜单 -->
      <div class="top-more">
        <button class="btn top-more-btn" :class="{ on: moreShow }" title="更多" @click.stop="toggleMore()">⋯</button>
        <div v-if="moreShow" class="top-more-menu" @click.self="moreShow = false">
          <div class="top-mm-srch">
            <input v-model="sq" placeholder="🔍 搜错题 / 对话 / 板块…" class="srch-in" @focus="focusDrop()" @blur="searchBlur()" />
            <div v-if="searchDrop && sq.trim()" class="top-mm-res">
              <div v-for="p in searchResults.plate" :key="'p' + p" class="top-mm-it" @mousedown.prevent="moreGo(() => goPlate(p))">🏛️ {{ p }}</div>
              <div v-for="f in searchResults.func" :key="'f' + f.k" class="top-mm-it" @mousedown.prevent="moreGo(() => goFunc(f))">{{ f.t }}</div>
              <div v-if="!searchResults.plate.length && !searchResults.func.length" class="sd-empty">无匹配结果</div>
            </div>
          </div>
          <div class="top-mm-row"><span class="status-pill"><span class="dot" :class="stDot"></span><span>{{ stStat }}</span></span></div>
          <button class="top-mm-it" @click="moreGo(() => costShow = true)">💰 用量与花费 {{ fmtCost(costToday) }}</button>
          <button class="top-mm-it" @click="moreGo(() => store.tab = '3d')">🌌 3D数据</button>
          <button class="top-mm-it" @click="moreGo(() => openExp('chat'))">📤 导出</button>
          <button class="top-mm-it" @click="moreGo(() => openSet())">⚙️ 设置</button>
          <button class="top-mm-it" @click="moreGo(() => doTheme())">{{ theme === 'light' ? '🌙 深色' : '☀️ 浅色' }}</button>
        </div>
      </div>
    </header>
    <ExamBar />
    <nav class="tabs">
      <button v-for="t in visibleTabs" :key="t.k" class="tab" :class="{ on: store.tab === t.k }" @click="goTab(t.k)">
        {{ t.t }}
      </button>
    </nav>
    <div class="pg" :class="{ on: store.tab === 'chat' }"><ChatPage @export-review="openExp('review')" /></div>
    <div class="pg" :class="{ on: store.tab === 'kb' }"><KbPage /></div>
    <div class="pg" :class="{ on: store.tab === 'stat' }"><StatsPage /></div>
    <div class="pg" :class="{ on: store.tab === 'wq' }">
      <WrongPage @export="openExp('wrong')" @txt="exportWrongTxt()" @export-md="exportWrongMd()" />
    </div>
    <div class="pg" :class="{ on: store.tab === 'ck' }"><CockpitPage /></div>
    <div class="pg" :class="{ on: store.tab === '3d' }"><Data3DPage /></div>
          <div class="pg" :class="{ on: store.tab === 'ths' }"><FloatPanel /></div>
    <ReviewHub />
    <!-- 设置弹窗 -->
    <div class="ov set-ov" :class="{ show: setShow }" @click.self="setShow = false">
      <div class="pnl">
        <div class="pnl-top">
          <button class="pnl-top-b" title="返回上一层（也可按 Esc / 浏览器返回）" @click="setShow = false">← 返回</button>
          <span class="pnl-top-t">⚙️ 设置（模型 / 语音 / 外观 / 数据 / 趣味 / 帮助）</span>
        </div>
<div class="set-status">
  <span class="set-st" :class="stCfg.textOk ? 'ok' : ''" :title="'文字模型：' + (stCfg.textOk ? '已配置 ' + (store.cfg.text.model || '') : '未配置（纯文字题无法作答）')">💬 文字 {{ stCfg.textOk ? '✅' : '未配' }}</span>
  <span class="set-st" :class="stCfg.visionOk ? 'ok' : ''" :title="'视觉模型：' + (stCfg.visionOk ? '已配置 ' + (store.cfg.vision.model || '') : '未配置（发图/截图题无法识别）')">👁️ 视觉 {{ stCfg.visionOk ? '✅' : '未配' }}</span>
  <span class="set-st" :class="stCfg.figOk ? 'ok' : ''" :title="'图形增强：' + (stCfg.figOk ? '已启用 ' + (store.cfg.fig.model || '') : '未启用（可选·不影响主问答）')">🖼 图增 {{ stCfg.figOk ? '✅' : '未配' }}</span>
  <span class="set-st" :class="stCfg.rdOk ? 'ok' : ''" :title="'语音阅读讲稿：' + (stCfg.rdOk ? '已启用 ' + (store.cfg.rd.model || '') : '未启用（朗读直接读原文）')">🎙️ 语音阅读 {{ stCfg.rdOk ? '✅' : '关' }}</span>
  <span class="set-st" :title="'朗读引擎：' + stCfg.ttsLabel">🗣️ {{ stCfg.ttsLabel }}</span>
  <span class="set-st" :title="'当前萌宠角色：' + petSkin.char">🐾 {{ petSkin.char }}</span>
  <span class="set-st" :title="'数据位置：' + stCfg.dataLoc">💾 {{ stCfg.dataLoc }}</span>
  <button class="btn btn-gh set-tour-btn" @click="openTour()">❓ 设置引导</button>
</div>
        <div class="set-nav">
          <button v-for="n in setNav" :key="n.id" class="set-nav-b" @click="scrollSet(n.id)">{{ n.t }}</button>
        </div>

<button class="set-group-hd" :class="{ on: setGroup === 'ai' }" @click="toggleSetGroup('ai')"><span class="sg-t">🧠 模型与 AI</span><span class="sg-desc">文本 / 视觉 / 图像增强 三类模型调度</span><span class="sg-arrow">{{ setGroup === 'ai' ? '▾' : '▸' }}</span></button>
<div v-show="setGroup === 'ai'" class="set-group-bd">
        <div class="mk-bar">{{ registryInfo() }}</div>

        <!-- ════════════ ① 文本大模型 ════════════ -->
        <div id="set-api" class="mk-card">
          <div class="mk-hd">
            <div class="mk-tt">
              <span class="mk-title">💬 文本大模型</span>
              <span class="mk-desc">纯文字题（常识 / 言语 / 数量 / 资料 / 判断）的 AI 大脑；推荐 DeepSeek，便宜且中文好。</span>
            </div>
            <span class="mk-chip" :class="stCfg.textOk ? 'ok' : ''" :title="'当前：' + (store.cfg.text.prov || '') + ' / ' + (store.cfg.text.model || '')">{{ stCfg.textOk ? '✅ 已配置' : '⛔ 未配置' }}</span>
          </div>
          <div class="fld-row">
            <div class="fld">
              <label>服务商（自动填好 API 地址）</label>
              <select v-model="store.cfg.text.prov" @change="onCatProv('text')">
                <option v-for="(p, pk) in catProviders('text')" :key="pk" :value="pk">{{ p.label }}</option>
              </select>
            </div>
            <div class="fld mk-model">
              <label>模型（按发布时间 新→旧 排序）</label>
              <select v-model="store.cfg.text.model" @change="saveCfg()">
                <option v-for="m in catModels('text')" :key="m.id" :value="m.id">{{ m.label }}{{ m.pub ? ' · 发布 ' + m.pub : '' }}{{ m.tag && String(m.tag).indexOf('free') >= 0 ? ' · 免费' : '' }}{{ m.note ? ' · ' + m.note : '' }}</option>
              </select>
              <span class="ep-hint">换服务商若原模型不在其清单内，会自动切到该服务商最新模型。</span>
            </div>
          </div>
          <div class="fld-row">
            <div class="fld">
              <label>API Key（仅存本地）</label>
              <input v-model="store.cfg.text.key" placeholder="sk-…（不填则文本问答不可用）" type="password" @change="saveCfg()" />
            </div>
            <div class="fld">
              <label>API 地址（一般无需改）</label>
              <input v-model="store.cfg.text.url" @change="saveCfg()" />
            </div>
          </div>
          <div class="fld">
            <label>🚀 对话快模型（非思考/极速档 · 提速，强烈建议）</label>
            <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap">
              <select style="flex: 1 1 300px; min-width: 0" :value="chatFastModel" @change="chatFastModel = $event.target.value; saveChatFastModel()">
                <option value="">（留空）跟随文字模型 · 可深度思考但较慢</option>
                <option v-for="f in fastTextOptions()" :key="f.id" :value="f.id">{{ f.label }}{{ f.pub ? ' · 发布 ' + f.pub : '' }}{{ f.note ? ' · ' + f.note : '' }}</option>
                <option v-if="fastHasCurrentCustom()" :value="chatFastModel">✏️ 自定义：{{ chatFastModel }}</option>
              </select>
              <button class="btn btn-gh" style="font-size: 12px" @click="fastCustomMode = !fastCustomMode; if (fastCustomMode) fastCustomName = fastHasCurrentCustom() ? chatFastModel : ''">{{ fastCustomMode ? '✕ 收起' : '✏️ 自定义' }}</button>
            </div>
            <input v-if="fastCustomMode" v-model="fastCustomName" class="mk-cust-in" style="margin-top: 6px" placeholder="输入同服务商的其它快模型名（需与文字模型同一服务商/Key 才能秒回）" @keyup.enter="applyFastCustom()" />
            <span class="ep-hint">候选已按上方「文字模型」服务商自动给出（新→旧）；快速模式会用「同服务商+同 Key」的该模型，对话/图推题秒出答案。图片题若该快模型不能识图，会自动用主视觉或「图像增强」兜底。DeepSeek-V4 / Gemini 等思考模型较慢时建议选一个非思考档；留空=完全跟随文字模型。</span>
          </div>
          <div class="mk-act">
            <button class="btn btn-gh" :class="{ busy: catUi.text.busy }" :disabled="catUi.text.busy" @click="testCat('text')">{{ catUi.text.busy ? '⏳ 检测中…' : '🧪 测试连通性' }}</button>
            <span class="mk-stat" :class="catUi.text.code">{{ catUi.text.stat || '用所选 Key+模型 发一条最小请求，实时校验能否正常调用' }}</span>
          </div>
          <div class="mk-cust">
            <input v-model="customInput.text" class="mk-cust-in" placeholder="➕ 模型清单里没有的新模型？直接输入模型名添加" @keyup.enter="addCustomModel('text')" />
            <button class="btn btn-gh" @click="addCustomModel('text')">添加</button>
          </div>
          <div v-if="catUserModels('text').length" class="mk-cust-list">
            <span v-for="m in catUserModels('text')" :key="m.id" class="mk-cust-chip">📌 {{ m.id }}<i title="移出自定义" @click="rmCustomModel('text', m.id)">✕</i></span>
          </div>
        </div>

        <!-- ════════════ ② 视觉大模型 ════════════ -->
        <div id="set-vision" class="mk-card">
          <div class="mk-hd">
            <div class="mk-tt">
              <span class="mk-title">👁️ 视觉大模型</span>
              <span class="mk-desc">图片 / 截图题（图推图形、资料表格、数学公式）必须配此模型才能看图；DeepSeek 可直接复用同一个 Key。</span>
            </div>
            <span class="mk-chip" :class="stCfg.visionOk ? 'ok' : ''" :title="'当前：' + (store.cfg.vision.prov || '') + ' / ' + (store.cfg.vision.model || '')">{{ stCfg.visionOk ? '✅ 已配置' : '⛔ 未配置' }}</span>
          </div>
          <div class="vis-tip">
            📌 <b>截图 / 图片题必须配此模型才能看图</b>。选好服务商与模型、粘贴 Key 后点下方「🧪 测试连通性」验证。若主视觉模型不识别，可再到「图像增强大模型」配免费模型兜底读图。
          </div>
          <div class="fld-row">
            <div class="fld">
              <label>服务商（视觉模型）</label>
              <select v-model="store.cfg.vision.prov" @change="onCatProv('vision')">
                <option v-for="(p, pk) in catProviders('vision')" :key="pk" :value="pk">{{ p.label }}</option>
              </select>
            </div>
            <div class="fld mk-model">
              <label>模型（按发布时间 新→旧 排序）</label>
              <select v-model="store.cfg.vision.model" @change="saveCfg()">
                <option v-for="m in catModels('vision')" :key="m.id" :value="m.id">{{ m.label }}{{ m.pub ? ' · 发布 ' + m.pub : '' }}{{ m.tag && String(m.tag).indexOf('free') >= 0 ? ' · 免费' : '' }}{{ m.note ? ' · ' + m.note : '' }}</option>
              </select>
              <span class="ep-hint">DeepSeek 用「同一个 DeepSeek Key」，模型自动带 deepseek-v4-flash-vision-exp。</span>
            </div>
          </div>
          <div class="fld-row">
            <div class="fld">
              <label>API Key（仅存本地）</label>
              <input v-model="store.cfg.vision.key" placeholder="sk-…（DeepSeek 可直接用文字模型的 Key）" type="password" @change="saveCfg()" />
            </div>
            <div class="fld">
              <label>API 地址（一般无需改）</label>
              <input v-model="store.cfg.vision.url" @change="saveCfg()" />
            </div>
          </div>
          <div class="mk-act">
            <button class="btn btn-gh" :class="{ busy: catUi.vision.busy }" :disabled="catUi.vision.busy" @click="testCat('vision')">{{ catUi.vision.busy ? '⏳ 检测中…' : '🧪 测试连通性' }}</button>
            <span class="mk-stat" :class="catUi.vision.code">{{ catUi.vision.stat || '用所选视觉 Key+模型 发一条最小请求，实时校验能否正常调用' }}</span>
          </div>
          <div class="mk-cust">
            <input v-model="customInput.vision" class="mk-cust-in" placeholder="➕ 模型清单里没有的新视觉模型？直接输入模型名添加" @keyup.enter="addCustomModel('vision')" />
            <button class="btn btn-gh" @click="addCustomModel('vision')">添加</button>
          </div>
          <div v-if="catUserModels('vision').length" class="mk-cust-list">
            <span v-for="m in catUserModels('vision')" :key="m.id" class="mk-cust-chip">📌 {{ m.id }}<i title="移出自定义" @click="rmCustomModel('vision', m.id)">✕</i></span>
          </div>
        </div>

        <!-- ════════════ ③-1 语音阅读 · 讲稿改写（可选）════════════ -->
        <div id="set-rd" class="mk-card">
          <div class="mk-hd">
            <div class="mk-tt">
              <span class="mk-title">🎙️ 语音阅读大模型 <i class="mk-opt">可选</i></span>
              <span class="mk-desc">朗读前先用它把题干/解析/理论卡改写成「口语化讲稿」再交给 TTS 朗读，听题更自然；不配置则照旧直接朗读原文。</span>
            </div>
            <span class="mk-chip" :class="stCfg.rdOk ? 'ok' : ''" :title="'语音阅读讲稿：' + (stCfg.rdOk ? '已启用 ' + (store.cfg.rd.model || '') : '未启用（直接朗读原文）')">{{ stCfg.rdOk ? '✅ 已启用' : '⛔ 默认关闭' }}</span>
          </div>
          <label class="fig-on">
            <input v-model="store.cfg.rd.on" type="checkbox" @change="saveCfg()" />
            启用「朗读讲稿」：读题 / 朗读解析 / 萌宠读当前内容 时先让该模型把文字改写为口语讲稿
          </label>
          <div class="fld-row">
            <div class="fld">
              <label>服务商（与文字模型同一套清单）</label>
              <select v-model="store.cfg.rd.prov" @change="onCatProv('rd')">
                <option v-for="(p, pk) in catProviders('rd')" :key="pk" :value="pk">{{ p.label }}</option>
              </select>
            </div>
            <div class="fld mk-model">
              <label>模型（新→旧；选便宜快的文本模型即可）</label>
              <select v-model="store.cfg.rd.model" @change="saveCfg()">
                <option v-for="m in catModels('rd')" :key="m.id" :value="m.id">{{ m.label }}{{ m.pub ? ' · 发布 ' + m.pub : '' }}{{ m.tag && String(m.tag).indexOf('free') >= 0 ? ' · 免费' : '' }}{{ m.note ? ' · ' + m.note : '' }}</option>
              </select>
              <span class="ep-hint">讲稿改写对模型要求不高，选该服务商便宜的模型即可省额度（如 DeepSeek-V4-Flash）。</span>
            </div>
          </div>
          <div class="fld-row">
            <div class="fld">
              <label>API Key（独立于文字模型，可另配）</label>
              <input v-model="store.cfg.rd.key" placeholder="sk-…（语音阅读专用 Key）" type="password" @change="saveCfg()" />
            </div>
            <div class="fld">
              <label>API 地址（已按服务商自动填好，一般无需改）</label>
              <input v-model="store.cfg.rd.url" @change="saveCfg()" />
            </div>
          </div>
          <div class="mk-act">
            <button class="btn btn-gh" :class="{ busy: catUi.rd.busy }" :disabled="catUi.rd.busy" @click="testCat('rd')">{{ catUi.rd.busy ? '⏳ 检测中…' : '🧪 测试连通性' }}</button>
            <span class="mk-stat" :class="catUi.rd.code">{{ catUi.rd.stat || '用所选 Key+模型 发一条最小请求，校验能否用于讲稿改写' }}</span>
          </div>
          <div class="micro-tip" style="font-size: 11.5px; margin: 2px 0 0; line-height: 1.7">
            💡 <b>小白提示</b>：开启后，朗读前会先用这个模型把干巴巴的题干/解析改写成"说话稿"（加语气、断句更顺），听感更像真人在讲题；它只是一个"改写器"，真人声音仍由上面的「朗读引擎」决定。想省钱就选该服务商<b>免费或最便宜的快模型</b>（如 DeepSeek-V4-Flash），与你的文字模型共用 Key 也行。
          </div>
          <div class="mk-cust">
            <input v-model="customInput.rd" class="mk-cust-in" placeholder="➕ 模型清单里没有的新模型？直接输入模型名添加" @keyup.enter="addCustomModel('rd')" />
            <button class="btn btn-gh" @click="addCustomModel('rd')">添加</button>
          </div>
          <div v-if="catUserModels('rd').length" class="mk-cust-list">
            <span v-for="m in catUserModels('rd')" :key="m.id" class="mk-cust-chip">📌 {{ m.id }}<i title="移出自定义" @click="rmCustomModel('rd', m.id)">✕</i></span>
          </div>
        </div>

        <!-- ════════════ ③ 图像增强大模型（可选） ════════════ -->
        <div id="set-fig" class="mk-card">
          <div class="mk-hd">
            <div class="mk-tt">
              <span class="mk-title">🖼 图像增强大模型 <i class="mk-opt">可选</i></span>
              <span class="mk-desc">可选增强：用独立开源 / 免费视觉模型把题目截图复刻成图贴进回复，辅助看懂图推 / 几何 / 表格题；不配置不影响主问答。</span>
            </div>
            <span class="mk-chip" :class="stCfg.figOk ? 'ok' : ''" :title="'当前：' + (store.cfg.fig.prov || '') + ' / ' + (store.cfg.fig.model || '')">{{ stCfg.figOk ? '✅ 已启用' : '⛔ 未启用' }}</span>
          </div>
          <label class="fig-on">
            <input v-model="store.cfg.fig.on" type="checkbox" @change="saveCfg()" />
            启用图形理解增强（发图后自动把原图复刻成图附在回复里）
          </label>
          <div class="fld-row">
            <div class="fld">
              <label>服务商（开源 / 本地 / 免费额度）</label>
              <select v-model="store.cfg.fig.prov" @change="onCatProv('fig')">
                <option v-for="(p, pk) in catProviders('fig')" :key="pk" :value="pk">{{ p.label }}</option>
              </select>
            </div>
            <div class="fld mk-model">
              <label>模型（新→旧排序；本地需先 ollama pull）</label>
              <select v-model="store.cfg.fig.model" @change="saveCfg()">
                <option v-for="m in catModels('fig')" :key="m.id" :value="m.id">{{ m.label }}{{ m.pub ? ' · 发布 ' + m.pub : '' }}{{ m.tag && String(m.tag).indexOf('free') >= 0 ? ' · 免费' : '' }}{{ m.note ? ' · ' + m.note : '' }}</option>
              </select>
              <span class="ep-hint">Ollama / LM Studio / Jan 本地模型无需 Key，填任意占位即可（如 ollama）。</span>
            </div>
          </div>
          <div class="fld-row">
            <div class="fld">
              <label>API Key（本地模型可随便填）</label>
              <input v-model="store.cfg.fig.key" placeholder="sk-… / ollama" type="password" @change="saveCfg()" />
            </div>
            <div class="fld">
              <label>API 地址（本地：Ollama 11434 / LM Studio 1234 / Jan 1337）</label>
              <input v-model="store.cfg.fig.url" placeholder="https://…/chat/completions" @change="saveCfg()" />
            </div>
          </div>
          <div class="mk-act">
            <button class="btn btn-gh" :class="{ busy: catUi.fig.busy }" :disabled="catUi.fig.busy" @click="testCat('fig')">{{ catUi.fig.busy ? '⏳ 检测中…' : '🧪 测试连通性' }}</button>
            <span class="mk-stat" :class="catUi.fig.code">{{ catUi.fig.stat || '用所选开源视觉模型 发一条最小请求，实时校验能否正常调用' }}</span>
          </div>
          <div class="mk-cust">
            <input v-model="customInput.fig" class="mk-cust-in" placeholder="➕ 本地刚拉下来的模型名？输入后即可在下拉里选" @keyup.enter="addCustomModel('fig')" />
            <button class="btn btn-gh" @click="addCustomModel('fig')">添加</button>
          </div>
          <div v-if="catUserModels('fig').length" class="mk-cust-list">
            <span v-for="m in catUserModels('fig')" :key="m.id" class="mk-cust-chip">📌 {{ m.id }}<i title="移出自定义" @click="rmCustomModel('fig', m.id)">✕</i></span>
          </div>
          <details class="guide">
            <summary>🔑 图像增强 · 免费 / 本地方案怎么选</summary>
            <div class="guide-body">
              <p><b>🥇 完全免费 · 本地离线（无需任何 Key）</b>：① <b>Ollama</b>：安装 ollama.com → 终端执行 <code>ollama pull minicpm-v</code>（中文好，约 5GB）或 <code>ollama pull llama3.2-vision</code> → 服务商选「Ollama 本地」，模型自动可选，Key 随便填如 ollama；② <b>LM Studio</b>：lmstudio.ai → 下载 Qwen2.5-VL-7B → 启动本地服务（默认 1234）；③ <b>Jan</b>：jan.ai → 下载视觉模型（默认 1337）。</p>
              <p><b>🥈 免费额度 · 注册即送</b>：④ <b>硅基流动 SiliconFlow</b>：cloud.siliconflow.cn → 注册 → API 密钥，默认 Qwen2.5-VL 免费额度够日常；⑤ <b>智谱 GLM-4V Flash</b>：open.bigmodel.cn（glm-4v-flash 有免费额度）；⑥ <b>通义 Qwen-VL</b>：bailian.console.aliyun.com（阿里云百炼控制台）· API 兼容地址 dashscope.aliyuncs.com/compatible-mode/v1。</p>
              <p>💡 Key 只存本地浏览器；此模型仅用于“复刻原图”辅助理解，主问答仍走上方 文字/视觉 模型。</p>
            </div>
          </details>
        </div>

        <!-- ════════════ 通用（三类共用的回复选项） ════════════ -->
        <div class="fld" style="margin-top: 6px">
          <label>🧠 自定义 System Prompt（留空用内置知识库人设）</label>
          <textarea v-model="store.cfg.sys" rows="2"></textarea>
        </div>
        <div class="fld-row" style="margin-bottom: 4px">
          <div class="fld" style="display: flex; gap: 14px; align-items: center; flex-wrap: wrap">
            <label style="display: flex; gap: 6px; align-items: center"><input v-model="store.cfg.kb" type="checkbox" /> 启用内置知识库增强</label>
            <label style="display: flex; gap: 6px; align-items: center"><input v-model="store.cfg.strm" type="checkbox" /> 流式输出</label>
          </div>
        </div>
        <details class="guide">
          <summary>🔑 各家 API Key 去哪领（点开看官网入口）</summary>
          <div class="guide-body">
            <ul style="line-height: 1.9">
              <li><b>DeepSeek</b>：platform.deepseek.com → API Keys → 创建（便宜、中文好）</li>
              <li><b>智谱 GLM</b>：open.bigmodel.cn → API Keys（新用户送免费额度）</li>
              <li><b>OpenAI</b>：platform.openai.com → API keys</li>
              <li><b>通义千问 Qwen</b>：bailian.console.aliyun.com（百炼控制台）→ API-KEY 管理；OpenAI 兼容调用地址 https://dashscope.aliyuncs.com/compatible-mode/v1</li>
              <li><b>豆包 Doubao（火山引擎）</b>：console.volcengine.com/ark → API Key</li>
              <li><b>月之暗面 Kimi</b>：platform.moonshot.cn → API Key</li>
              <li><b>阶跃星辰 Step</b>：platform.stepfun.com → API Key</li>
              <li><b>Google Gemini</b>：aistudio.google.com/apikey → 免费额度（官方 OpenAI 兼容端点）</li>
              <li><b>OpenRouter（聚合）</b>：openrouter.ai/keys → 一个 Key 可调 Claude / Gemini / DeepSeek 等</li>
              <li><b>硅基流动 SiliconFlow（开源模型免费额度）</b>：cloud.siliconflow.cn → API 密钥</li>
            </ul>
            <p>② 把生成的 Key（形如 sk-…）粘到对应分类的「API Key」框；③ 点该分类「🧪 测试连通性」，显示 ✅ 即配置成功。</p>
            <p>💡 Key 只保存在你自己浏览器的 localStorage，本应用无后端，不会上传到任何服务器。Claude / Gemini 等任何兼容 OpenAI 协议的接口都可用（服务商已内置常用模型，或点「➕ 手动添加」）。</p>
          </div>
        </details>

</div>
<button class="set-group-hd" :class="{ on: setGroup === 'voice' }" @click="toggleSetGroup('voice')"><span class="sg-t">🗣️ 语音朗读</span><span class="sg-desc">引擎 / 音色市场 / 本机语音</span><span class="sg-arrow">{{ setGroup === 'voice' ? '▾' : '▸' }}</span></button>
<div v-show="setGroup === 'voice'" class="set-group-bd">
        <div id="set-voice" class="sec-t">🗣️ 语音 · 真人朗读（音色市场 · 去掉 AI 味）</div>
        <div class="sec-desc">真人级朗读统一管理：引擎 / 音色市场 / 克隆原声 / 本机语音；全局音色 = 萌宠音色。</div>
        <div class="fld" style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap">
          <label style="font-size: 13px; font-weight: 700">自动朗读 AI 回复</label>
          <button class="btn" :class="store.cfg.ttsOn !== false ? 'btn-pri' : 'btn-gh'" @click="toggleTtsSetting()">{{ store.cfg.ttsOn !== false ? '🔊 已开启' : '🔇 已关闭' }}</button>
          <span style="font-size: 11px; color: var(--text3)">开启后 AI 回复完成自动朗读；对话里每条消息也有 🔊 朗读按钮。</span>
        </div>

        <div class="sec-t" style="font-size: 13px">🎛️ 朗读引擎（真人级音色优先）</div>
        <div style="font-size: 11px; color: var(--text3); margin: 2px 0 8px; line-height: 1.6">
          💡 <b>这里的全局音色 = 萌宠音色（同一套）</b>，全局朗读、刷题读题、萌宠讲话都用它。只有当你给某个角色<b>克隆了专属声线（🧬）</b>后，切到该角色才临时用克隆原声，切走即恢复此音色 —— 保证永远一致。
        </div>
        <div style="font-size: 12px; color: var(--pri); margin-bottom: 4px">🎯 当前生效音色：{{ petEffectiveLabel }}</div>
        <div style="font-size: 11px; color: var(--text3); margin-bottom: 8px">每个音色卡都有 <b>✏️ 改名</b> / <b>👻 隐藏</b>（隐藏后可在各列表下方「已隐藏」一键恢复）；克隆音色在下方「🧬 我的克隆音色」管理（可重命名/删除/保留）。</div>
        <button v-if="voiceUndo" class="btn btn-gh" style="font-size: 11px; margin-bottom: 8px" @click="undoHideVoice()">↩️ 撤销上一步隐藏（{{ voiceUndo.id }}）</button>
        <div class="fld" style="border: 1px solid var(--line, rgba(128,128,128,.3)); border-radius: 10px; padding: 10px; margin-bottom: 8px">
          <label style="font-weight: 700">🧬 我的克隆音色（自定义名称 · 可删除/保留）</label>
          <div v-if="petCloneVoiceList().length" style="margin-top: 6px">
            <div v-for="cv in petCloneVoiceList()" :key="cv.skinId" style="display: flex; align-items: center; gap: 6px; margin-top: 4px; font-size: 12px">
              <span>{{ cv.char }} · <b>{{ cv.name }}</b> <span style="color: var(--text3)">({{ cv.engine === 'glm' ? '智谱' : 'CosyVoice2' }})</span></span>
              <button class="btn btn-gh" style="font-size: 11px" @click="ttsPreviewBound(cv.skinId)">▶️ 试听</button>
              <button v-if="cv.locked" class="btn btn-gh" style="font-size: 11px" disabled title="内置锁定，不可删除/改名">🔒 内置</button>
              <template v-else-if="cloneRename && cloneRename.skinId === cv.skinId">
                <input v-model="cloneRename.name" style="width: 110px; font-size: 11px; padding: 1px 3px" @keydown.enter.stop="confirmCloneRename()" />
                <button class="btn btn-pri" style="font-size: 11px" @click="confirmCloneRename()">✓</button>
                <button class="btn btn-gh" style="font-size: 11px" @click="cloneRename = null">✖</button>
              </template>
              <template v-else>
                <button class="btn btn-gh" style="font-size: 11px" title="重命名" @click="doRenameCloneVoice(cv.skinId)">✏️</button>
                <button class="btn btn-gh" style="font-size: 11px" @click="doUnbindSkinVoice(cv.skinId)">🗑 删除</button>
              </template>
            </div>
          </div>
          <div v-else style="font-size: 11px; color: var(--text3); margin-top: 6px">暂无克隆音色；在「设置 → 萌宠 → 克隆『角色』原声」上传 3-30 秒参考音频即可生成并自动命名。</div>
        </div>
        <div class="tts-engine-grid">
          <button v-for="eng in TTS_ENGINES" :key="eng.id" class="tts-engine-card" :class="{ on: store.cfg.ttsMode === eng.id }" @click="setTtsMode(eng.id)">
            <span class="te-name">{{ eng.name }}<span v-if="eng.free" class="te-free">免费</span></span>
            <span class="te-tag">{{ eng.tag }}</span>
            <span class="te-desc">{{ eng.desc }}</span>
          </button>
        </div>
        <div class="mk-tip" style="border: 1px solid var(--glass-border); background: var(--glass-bg); border-radius: 10px; padding: 10px 12px; margin: 8px 0">
          <b style="font-size: 12.5px">📖 选哪个朗读引擎？（小白必读）</b>
          <ul style="margin: 6px 0 0; padding-left: 18px; font-size: 11.5px; line-height: 1.85; color: var(--text2)">
            <li>🆓 <b>完全免费、不想折腾 Key</b>：直接选「Edge 免费神经」或「系统语音」，开箱即用、0 成本，适合先体验。</li>
            <li>🌟 <b>想要最像真人的效果（推荐）</b>：选「智谱 GLM-TTS」或「阿里百炼 Qwen3-TTS」，它们是语音大模型，有情绪有语气、几乎听不出机器味；按字数计费（读几万字才几分钱），<b>新人都有免费额度</b>。</li>
            <li>🎨 <b>想克隆你自己的声音 / 用 CosyVoice2</b>：选「OpenAI 兼容」，自备 Key 与服务地址。</li>
            <li>🐾 <b>让萌宠用专属声线</b>：去「趣味与陪伴 → 萌宠」给角色克隆/绑定音色即可，切到该角色自动换声。</li>
            <li>💰 <b>怕超支</b>：开启下方「省钱护栏」，真人引擎每天有免费朗读额度，用完后自动退回免费 Edge，怎么读都不花冤枉钱。</li>
          </ul>
        </div>

        <!-- 💰 真人朗读·省钱护栏（语音系统重构 v3.8.90） -->
        <div style="border: 1px dashed rgba(52, 211, 153, 0.4); background: rgba(52, 211, 153, 0.05); border-radius: 10px; padding: 10px 12px; margin: 10px 0 4px">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap">
            <b style="font-size: 13px; color: #34d399">💰 省钱护栏 · 真人朗读不超支</b>
            <label style="display: flex; align-items: center; gap: 6px; font-size: 12px">
              <input v-model="store.cfg.ttsGuard" type="checkbox" @change="saveCfg()" />
              启用
            </label>
            <span style="font-size: 11.5px; color: var(--text3); flex: 1; min-width: 220px; line-height: 1.6">
              真人引擎（智谱 GLM / CosyVoice）每日免费朗读 {{ (Number(store.cfg.ttsDayCap) || 20000) >= 10000 ? (Number(store.cfg.ttsDayCap) / 10000) + ' 万' : store.cfg.ttsDayCap }} 字，
              用完后<b>自动退回免费 Edge</b> 继续读，绝不乱扣费；Edge / 系统语音永久免费、永不被拦。
            </span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 8px">
            <span style="font-size: 12px; color: var(--text2)">📊 今日真人朗读已用：<b style="color: var(--accent)">{{ ttsCharsToday() }}</b> 字</span>
            <label style="font-size: 12px; color: var(--text3); display: flex; align-items: center; gap: 4px">
              每日额度
              <input v-model.number="store.cfg.ttsDayCap" type="number" min="1000" step="1000" style="width: 84px; padding: 4px 6px; border-radius: 8px; border: 1px solid var(--glass-border); background: var(--surface); color: var(--text); font-size: 12px" @change="saveCfg()" />
              字
            </label>
            <span style="font-size: 11.5px; color: var(--text3)">真人朗读成本约 ¥2 / 百万字量级（智谱/CosyVoice 类），日常几万字仅几分钱；额度用完自动退回免费 Edge，怎么用都不超支。</span>
          </div>
        </div>

        <!-- ① 智谱 GLM-TTS（超拟人）-->
        <div v-if="store.cfg.ttsMode === 'glm'">
          <div class="sec-t" style="font-size: 13px">🎙️ 音色市场（智谱超拟人 · 真人级）</div>
          <div class="fld">
            <label>智谱 API Key（可一键复制图形增强里的智谱 Key）</label>
            <div style="display: flex; gap: 6px">
              <input v-model="store.cfg.ttsGm.key" type="password" placeholder="粘贴智谱 API Key" style="flex: 1" @change="saveCfg()" />
              <button class="btn btn-gh" style="font-size: 12px; white-space: nowrap" @click="copyFigKey()">📋 复制图形增强 Key</button>
            </div>
            <div style="font-size: 11px; color: var(--text3); margin-top: 4px">
              Key 为空时自动复用「图形增强」里已填的智谱 Key；没有 Key 可去 <a href="https://open.bigmodel.cn/" target="_blank" rel="noopener">open.bigmodel.cn</a> 免费注册领取额度。
            </div>
          </div>
          <div class="voice-market">
            <div v-for="v in voiceList('glm', gmVoiceList)" :key="v.id" class="voice-card" :class="{ on: store.cfg.ttsGm.voice === v.id }" @click="pickVoice('glm', v.id)">
              <span class="vc-emoji">{{ v.emoji }}</span>
              <span class="vc-name">{{ v.name }}</span>
              <button class="btn btn-gh" style="font-size: 11px" @click.stop="ttsPreview('glm', v.id)">▶️ 试听</button>
              <template v-if="voiceRename && voiceRename.engine === 'glm' && voiceRename.id === v.id">
                <input v-model="voiceRename.name" style="width: 96px; font-size: 11px; padding: 1px 3px" @click.stop @keydown.enter.stop="confirmRename()" />
                <button class="btn btn-pri" style="font-size: 10px; padding: 1px 4px" @click.stop="confirmRename()">✓</button>
                <button class="btn btn-gh" style="font-size: 10px; padding: 1px 4px" @click.stop="cancelRename()">✖</button>
              </template>
              <button v-else class="btn btn-gh" style="font-size: 10px; padding: 1px 4px" title="重命名" @click.stop="startRename('glm', v.id)">✏️</button>
              <button class="btn btn-gh" style="font-size: 10px; padding: 1px 4px" title="隐藏" @click.stop="hideVoice('glm', v.id)">👻</button>
            </div>
          </div>
          <div v-if="hiddenVoicesList('glm', gmVoiceList).length" class="fld" style="margin-top: 4px">
            <span style="font-size: 11px; color: var(--text3)">👻 已隐藏：</span>
            <span v-for="hv in hiddenVoicesList('glm', gmVoiceList)" :key="hv.id" style="font-size: 11px; margin-right: 8px">{{ hv.name }} <a style="cursor: pointer; color: var(--pri)" @click="unhideVoice('glm', hv.id)">恢复</a></span>
          </div>
          <div class="fld" style="display: flex; gap: 6px; align-items: center">
            <button class="btn btn-gh" style="font-size: 12px" @click="loadGmVoices()">🔄 刷新官方音色</button>
            <span style="font-size: 11px; color: var(--text3)">{{ gmVoiceStat }}</span>
          </div>
        </div>

        <!-- ② OpenAI 兼容（CosyVoice2 等）-->
        <div v-if="store.cfg.ttsMode === 'dash'">
          <div class="sec-t" style="font-size: 13px">🍊 阿里百炼 Qwen3-TTS（廉价真人 · 实测可用）</div>
          <div class="fld">
            <label>通义 DashScope API Key（留空自动复用图形增强/视觉里的通义 Key）</label>
            <input v-model="store.cfg.ttsDash.key" type="password" placeholder="sk-…（与千问/图形增强同一个 Key）" @change="saveCfg()" />
            <div style="font-size: 11px; color: var(--text3); margin-top: 4px">
              官方价 <b>¥0.8/万字符</b>（≈0.08 元/千字），中文自然、支持指令式语气；Key 可在 <a href="https://bailian.console.aliyun.com" target="_blank" rel="noopener">bailian.console.aliyun.com</a> 领取。模型/端点已于 2026-09-02 真实 Key 实测通过。
            </div>
          </div>
          <div class="fld-row">
            <div class="fld">
              <label>模型（按发布时间 最新→旧 排序）</label>
              <select :value="dashModelIsCustom ? '__custom__' : store.cfg.ttsDash.model" @change="onDashModelChange($event)">
                <option v-for="m in DASH_MODELS" :key="m.id" :value="m.id">{{ m.id }} · {{ m.pub }}（{{ m.note }}）</option>
                <option value="__custom__">（自定义其他模型名…）</option>
              </select>
              <input v-if="dashModelIsCustom" v-model="store.cfg.ttsDash.model" placeholder="例如 qwen3-tts-instruct-flash" style="margin-top: 6px" @change="saveCfg(); savePetGlobalVoice()" />
            </div>
            <div class="fld">
              <label>预设音色（共 {{ dashVoicesForModel(store.cfg.ttsDash.model).length }} 个，按模型自动筛选）</label>
              <select v-model="store.cfg.ttsDash.voice" @change="saveCfg(); savePetGlobalVoice()">
                <option v-for="v in dashVoicesForModel(store.cfg.ttsDash.model)" :key="v.id" :value="v.id">{{ v.emoji || '🎙️' }} {{ v.name }}</option>
              </select>
            </div>
          </div>
          <div class="mk-sec" style="border-left: 3px solid #ff8a3d; padding: 6px 8px; margin: 6px 0; background: rgba(255,138,61,0.06)">
            <div class="sec-t" style="font-size: 12.5px; color: #ff7a1a">🎨 自定义音色（自然语言 · instruct 模型实测可用）</div>
            <div style="font-size: 11px; color: var(--text3); margin: 2px 0 5px">用一句话描述你想要的声线，例如「温柔知性的女生，语速稍慢，带一点笑意」。开启后优先于上方预设音色，可保存多个随时切换。</div>
            <div class="fld-row">
              <input v-model="store.cfg.ttsDash.voiceCustom" style="flex: 1" placeholder="例如：磁性低沉的老年男声，像讲古的先生" @input="saveCfg()" />
              <input v-model="dashCustomName" style="width: 96px" placeholder="预设名" />
              <button class="btn btn-pri" style="font-size: 12px" @click="saveDashCustomVoice()">💾 存为预设</button>
            </div>
            <div v-if="store.cfg.ttsDash.customVoices && store.cfg.ttsDash.customVoices.length" class="voice-market" style="margin-top: 6px">
              <div v-for="(c, i) in store.cfg.ttsDash.customVoices" :key="c.id" class="voice-card" :class="{ on: store.cfg.ttsDash.voiceCustom === c.desc }" @click="applyDashCustom(c)">
                <span style="font-size: 11px">🎨 {{ c.name }}</span>
                <span style="font-size: 10px; color: var(--text3); display: block; margin-top: 2px">{{ c.desc }}</span>
                <span class="vc-x" @click.stop="rmDashCustomVoice(i)">✕</span>
              </div>
            </div>
            <div v-if="store.cfg.ttsDash.voiceCustom" style="font-size: 11px; color: #0a8f3c; margin-top: 4px">✅ 当前使用自定义音色：「{{ store.cfg.ttsDash.voiceCustom }}」</div>
          </div>
          <div class="fld">
            <label>接口地址（默认即可）</label>
            <input v-model="store.cfg.ttsDash.url" placeholder="https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation" @change="saveCfg()" />
          </div>
          <div class="mk-act">
            <button class="btn btn-gh" style="font-size: 12px" @click="previewVoice('dash', store.cfg.ttsDash.voice)">🧪 试听当前音色</button>
            <span style="font-size: 11.5px; color: var(--text3)">额度/预算护栏同样适用（每日真人朗读额度用完后自动退回免费 Edge）。</span>
          </div>
        </div>

        <div v-if="store.cfg.ttsMode === 'openai'">
          <div class="sec-t" style="font-size: 13px">🎨 OpenAI 兼容引擎（CosyVoice2 真人级）</div>
          <div class="fld">
            <label>API Key</label>
            <input v-model="store.cfg.ttsOpenAI.key" type="password" placeholder="粘贴 OpenAI 兼容 TTS 的 Key" @change="saveCfg()" />
            <div style="font-size: 11px; color: var(--text3); margin-top: 4px">
              支持任意 OpenAI 兼容 /v1/audio/speech 接口。推荐硅基流动（CosyVoice2 中文最自然）：<a href="https://cloud.siliconflow.cn/" target="_blank" rel="noopener">cloud.siliconflow.cn</a> 创建 Key。
            </div>
          </div>
          <div class="fld">
            <label>接口地址（含 /v1 或 /audio/speech）</label>
            <input v-model="store.cfg.ttsOpenAI.url" placeholder="https://api.siliconflow.cn/v1" @change="saveCfg()" />
          </div>
          <div class="fld">
            <label>模型</label>
            <input v-model="store.cfg.ttsOpenAI.model" placeholder="FunAudioLLM/CosyVoice2-0.5B" @change="saveCfg()" />
          </div>
          <div class="fld">
            <label>音色 ID（默认 default；克隆音色可填 模型:音色名）</label>
            <input v-model="store.cfg.ttsOpenAI.voice" placeholder="default" @change="saveCfg(); savePetGlobalVoice()" />
          </div>
          <div class="fld" style="border: 1px solid var(--line, rgba(128,128,128,.3)); border-radius: 10px; padding: 10px">
            <label>🧬 音色克隆（大模型克隆原声 · 自动绑定到『{{ petSkin.char }}』）</label>
            <div style="font-size: 11px; color: var(--text3); margin: 4px 0">
              上传一段 3-30 秒清晰的参考音频（mp3/wav/m4a/ogg 均可，哪怕后缀是 .mp3 实为 m4a 也能自动转码），大模型克隆后自动绑定给当前角色「{{ petSkin.char }}」，切到它就朗读克隆原声；超长音频会自动裁前 20 秒。也可在「设置 → 萌宠」里克隆。配音相关版权请自行确保。
            </div>
            <div style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center">
              <select v-model="cloneBackend" style="font-size: 12px; max-width: 190px">
                <option value="zhipu">🧬 智谱 GLM-TTS-Clone（3 秒即可）</option>
                <option value="cosy">🎨 CosyVoice2 · 硅基流动</option>
              </select>
              <button class="btn btn-gh" style="font-size: 12px" @click="$refs.voiceFileInput.click()">{{ voiceFileName || '🎤 选择参考音频' }}</button>
              <input ref="voiceFileInput" type="file" accept="audio/*,video/*,.mp4,.mov,.mkv,.webm,.m4a" style="display: none" @change="onVoiceFile($event)" />
              <input v-model="cloneVoiceName" placeholder="音色名（如 李星云声线）" style="flex: 1; min-width: 120px" />
              <button class="btn btn-pri" style="font-size: 12px" :disabled="voiceCloning" @click="doCloneVoice()">{{ voiceCloning ? '⏳ 克隆中…' : '🧬 开始克隆并绑定' }}</button>
            </div>
            <div v-if="voiceCloneStat" style="font-size: 11px; color: var(--text3); margin-top: 6px">{{ voiceCloneStat }}</div>
          </div>
          <div class="voice-market">
            <div v-for="v in voiceList('openai', OPENAI_PRESET_VOICES)" :key="v.id" class="voice-card" :class="{ on: store.cfg.ttsOpenAI.voice === v.id }" @click="pickVoice('openai', v.id)">
              <span class="vc-emoji">{{ v.emoji }}</span>
              <span class="vc-name">{{ v.name }}</span>
              <button class="btn btn-gh" style="font-size: 11px" @click.stop="ttsPreview('openai', v.id)">▶️ 试听</button>
              <template v-if="voiceRename && voiceRename.engine === 'openai' && voiceRename.id === v.id">
                <input v-model="voiceRename.name" style="width: 96px; font-size: 11px; padding: 1px 3px" @click.stop @keydown.enter.stop="confirmRename()" />
                <button class="btn btn-pri" style="font-size: 10px; padding: 1px 4px" @click.stop="confirmRename()">✓</button>
                <button class="btn btn-gh" style="font-size: 10px; padding: 1px 4px" @click.stop="cancelRename()">✖</button>
              </template>
              <button v-else class="btn btn-gh" style="font-size: 10px; padding: 1px 4px" title="重命名" @click.stop="startRename('openai', v.id)">✏️</button>
              <button class="btn btn-gh" style="font-size: 10px; padding: 1px 4px" title="隐藏" @click.stop="hideVoice('openai', v.id)">👻</button>
            </div>
          </div>
          <div v-if="hiddenVoicesList('openai', OPENAI_PRESET_VOICES).length" class="fld" style="margin-top: 4px">
            <span style="font-size: 11px; color: var(--text3)">👻 已隐藏：</span>
            <span v-for="hv in hiddenVoicesList('openai', OPENAI_PRESET_VOICES)" :key="hv.id" style="font-size: 11px; margin-right: 8px">{{ hv.name }} <a style="cursor: pointer; color: var(--pri)" @click="unhideVoice('openai', hv.id)">恢复</a></span>
          </div>
        </div>

        <!-- ③ Edge 免费神经音色 -->
        <div v-if="store.cfg.ttsMode === 'edge'">
          <div class="sec-t" style="font-size: 13px">🚀 微软 Edge 神经音色（免费 · 无 Key）</div>
          <div class="voice-market">
            <div v-for="v in voiceList('edge', edgeVoiceList)" :key="v.id" class="voice-card" :class="{ on: store.cfg.ttsEdgeVoice === v.id }" @click="pickVoice('edge', v.id)">
              <span class="vc-emoji">{{ v.emoji }}</span>
              <span class="vc-name">{{ v.name }}</span>
              <button class="btn btn-gh" style="font-size: 11px" @click.stop="ttsPreview('edge', v.id)">▶️ 试听</button>
              <template v-if="voiceRename && voiceRename.engine === 'edge' && voiceRename.id === v.id">
                <input v-model="voiceRename.name" style="width: 96px; font-size: 11px; padding: 1px 3px" @click.stop @keydown.enter.stop="confirmRename()" />
                <button class="btn btn-pri" style="font-size: 10px; padding: 1px 4px" @click.stop="confirmRename()">✓</button>
                <button class="btn btn-gh" style="font-size: 10px; padding: 1px 4px" @click.stop="cancelRename()">✖</button>
              </template>
              <button v-else class="btn btn-gh" style="font-size: 10px; padding: 1px 4px" title="重命名" @click.stop="startRename('edge', v.id)">✏️</button>
              <button class="btn btn-gh" style="font-size: 10px; padding: 1px 4px" title="隐藏" @click.stop="hideVoice('edge', v.id)">👻</button>
            </div>
          </div>
          <div v-if="hiddenVoicesList('edge', edgeVoiceList).length" class="fld" style="margin-top: 4px">
            <span style="font-size: 11px; color: var(--text3)">👻 已隐藏：</span>
            <span v-for="hv in hiddenVoicesList('edge', edgeVoiceList)" :key="hv.id" style="font-size: 11px; margin-right: 8px">{{ hv.name }} <a style="cursor: pointer; color: var(--pri)" @click="unhideVoice('edge', hv.id)">恢复</a></span>
          </div>
          <div class="fld" style="display: flex; gap: 6px; align-items: center">
            <button class="btn btn-gh" style="font-size: 12px" @click="loadEdgeVoices()">🔄 刷新官方音色</button>
            <span style="font-size: 11px; color: var(--text3)">{{ edgeVoiceStat }}</span>
          </div>
          <div style="font-size: 11px; color: var(--text3)">⚠️ 微软服务器在部分网络（尤其国内）会被拦截，试听失败时请改用智谱 / OpenAI 兼容引擎。</div>
        </div>

        <!-- ④ 系统语音（兜底）-->
        <div v-if="store.cfg.ttsMode === 'sys'">
          <div class="sec-t" style="font-size: 13px">🧠 系统语音（本机兜底）</div>
          <div class="fld">
            <label>朗读音色</label>
            <select v-model="store.cfg.ttsScene" @change="saveCfg(); savePetGlobalVoice()">
              <option v-for="s in SCENES" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
            <div style="font-size: 11px; color: var(--text3); margin-top: 4px">按场景自动匹配最贴近的系统语音；可再选下方本机语音覆盖。</div>
          </div>
          <div class="sec-t" style="font-size: 13px">🎙️ 本机语音（可选 · 覆盖场景）</div>
          <div class="fld">
            <select v-model="store.cfg.ttsVoice" @change="saveCfg(); savePetGlobalVoice()">
              <option value="">（跟随上方场景音色）</option>
              <option v-for="v in sysVoices" :key="v.voiceURI || v.name" :value="v.name">{{ v.name }} · {{ v.lang }}</option>
            </select>
            <div style="display: flex; gap: 6px; margin-top: 6px">
              <button class="btn btn-gh" style="font-size: 12px" @click="loadSysVoices()">🔄 刷新语音</button>
              <button class="btn btn-gh" style="font-size: 12px" @click="ttsTestVoice()">▶️ 试听本机语音</button>
            </div>
            <div style="font-size: 11px; color: var(--text3); margin-top: 4px">
              已检测到 {{ sysVoices.length }} 个系统语音。想添加更多本地语音：Windows → 设置 → 时间和语言 → 语音 → 添加语音（如 中文(普通话)）。
            </div>
          </div>
        </div>

        <div class="fld">
          <label>语速：{{ (store.cfg.ttsRate * 100).toFixed(0) }}%</label>
          <input
            v-model.number="store.cfg.ttsRate"
            type="range"
            min="0.5"
            max="1.5"
            step="0.05"
            style="width: 100%"
            @change="saveCfg()"
          />
        </div>
        <div v-if="store.cfg.ttsMode === 'sys'" class="fld">
          <label>角色代入感（音调）：{{ store.cfg.ttsPitch == null ? '默认' : store.cfg.ttsPitch.toFixed(2) }}</label>
          <input
            v-model.number="store.cfg.ttsPitch"
            type="range"
            min="0.5"
            max="1.6"
            step="0.05"
            style="width: 100%"
            @change="saveCfg()"
          />
          <button
            class="btn btn-gh"
            style="margin-top: 6px; font-size: 12px"
            @click="store.cfg.ttsPitch = null; saveCfg()"
          >
            重置音调
          </button>
        </div>
        <div v-if="ttsStatus.msg" class="fld" style="font-size: 12px; color: var(--text3)">
          <span :class="ttsStatus.state === 'error' ? 'tts-err' : ttsStatus.state === 'speaking' ? 'tts-run' : ''">{{ ttsStatus.msg }}</span>
        </div>
        <div class="exp-choices" style="grid-template-columns: 1fr 1fr">
          <button class="btn btn-gh" @click="ttsTest()">▶️ 试听当前音色</button>
          <button
            class="btn btn-gh"
            @click="speak('感谢收听，我们继续练习吧。', { scene: store.cfg.ttsScene, rate: store.cfg.ttsRate, pitch: store.cfg.ttsPitch })"
          >
            ⏹ 换句试听
          </button>
        </div>
</div>
<button class="set-group-hd" :class="{ on: setGroup === 'look' }" @click="toggleSetGroup('look')"><span class="sg-t">🎨 外观与主题</span><span class="sg-desc">主题 / 背景 / 随手记 / 冲刺 / 导出偏好</span><span class="sg-arrow">{{ setGroup === 'look' ? '▾' : '▸' }}</span></button>
<div v-show="setGroup === 'look'" class="set-group-bd">
<div id="set-look" class="sec-t">🎨 主题与外观</div>
        <div class="sec-desc">主题、强调色、护眼、字体、壁纸、随手记、备考冲刺、导出偏好统一管理。</div>
        <div style="font-size: 11px; color: var(--text3); margin-bottom: 8px">主题/文字配色/强调色/护眼/壁纸/随手记/字号 统一在此管理；顶栏 ☀️/🌙 可在「米白纸 / 深空黑」间快速切换白天黑夜。</div>
        <div class="sec-t">🎨 一键主题包（配色+强调色+护眼+高亮 一次到位）</div>
        <div class="tp-grp-t">☀️ 白天主题</div>
        <div class="theme-grid">
          <button v-for="p in THEME_PACKS.filter((x) => x.theme === 'light')" :key="p.id" class="theme-card" :class="{ on: themePack === p.id }" @click="applyThemePack(p.id)">
            <span class="th-swatch" :style="{ background: THEME_PRESETS[p.preset].vars.bg }"></span>
            <span class="th-name">{{ p.name }}</span>
          </button>
        </div>
        <div class="tp-grp-t">🌙 黑夜主题</div>
        <div class="theme-grid">
          <button v-for="p in THEME_PACKS.filter((x) => x.theme === 'dark')" :key="p.id" class="theme-card" :class="{ on: themePack === p.id }" @click="applyThemePack(p.id)">
            <span class="th-swatch" :style="{ background: THEME_PRESETS[p.preset].vars.bg }"></span>
            <span class="th-name">{{ p.name }}</span>
          </button>
        </div>
        <div style="font-size: 11px; color: var(--text3); margin-top: 4px">每套主题包已配好「底色+强调色+护眼+高亮」，一键应用；顶栏 ☀️/🌙 在白天/黑夜配对主题间切换。下方为进阶自定义。</div>

        <div class="fld">
          <label>强调色（更多参考色）</label>
          <div class="sw-row">
            <span class="sw sw-sea" :class="{ on: accent === 'sea' }" title="静海蓝" @click="setAccent('sea')"></span>
            <span class="sw sw-sky" :class="{ on: accent === 'sky' }" title="天蓝" @click="setAccent('sky')"></span>
            <span class="sw sw-emerald" :class="{ on: accent === 'emerald' }" title="翡翠绿" @click="setAccent('emerald')"></span>
            <span class="sw sw-teal" :class="{ on: accent === 'teal' }" title="青碧" @click="setAccent('teal')"></span>
            <span class="sw sw-lime" :class="{ on: accent === 'lime' }" title="青柠" @click="setAccent('lime')"></span>
            <span class="sw sw-amber" :class="{ on: accent === 'amber' }" title="琥珀金" @click="setAccent('amber')"></span>
            <span class="sw sw-orange" :class="{ on: accent === 'orange' }" title="活力橙" @click="setAccent('orange')"></span>
            <span class="sw sw-rose" :class="{ on: accent === 'rose' }" title="玫瑰红" @click="setAccent('rose')"></span>
            <span class="sw sw-pink" :class="{ on: accent === 'pink' }" title="樱花粉" @click="setAccent('pink')"></span>
            <span class="sw sw-violet" :class="{ on: accent === 'violet' }" title="紫罗兰" @click="setAccent('violet')"></span>
            <span class="sw sw-indigo" :class="{ on: accent === 'indigo' }" title="靛蓝" @click="setAccent('indigo')"></span>
            <span class="sw sw-custom" :class="{ on: accent === 'custom' }" :style="accent === 'custom' ? { background: accentCustom } : {}" title="自定义（自选任意色）" @click="setAccent('custom')"></span>
            <input type="color" :value="accentCustom" style="width: 24px; height: 24px; border: 1px solid var(--glass-border); border-radius: 50%; background: transparent; cursor: pointer; padding: 0; margin-left: 4px" title="点此自选强调色" @input="setAccentCustom($event.target.value)" />
          </div>


          <div class="fld" style="margin-top: 10px">
            <label>护眼模式（白天/黑夜各自生效）</label>
          <div class="fld" style="margin-top: 8px">
            <label>主题系列</label>
            <select v-model="store.cfg.themeMode" @change="setThemeMode(store.cfg.themeMode)">
              <option value="default">默认（跟随主题）</option>
              <option value="redblack">红黑·局长风（红点缀·不改变字体主色）</option>
            </select>
          </div>
            <select v-model="store.cfg.eyeMode" @change="setEyeMode(store.cfg.eyeMode)">
              <option value="normal">标准</option>
              <option value="green">护眼绿（柔和绿底·减蓝光）</option>
              <option value="warm">暖黄纸张（护眼暖色）</option>
            </select>
          </div>
        <div class="fld">
          <label>知识图谱光效（白天晃眼可调低或关闭）</label>
          <select :value="Number(store.cfg.kgFx) || 0" @change="setKgFx($event.target.value)">
            <option :value="0">关闭（最护眼 · 省电）</option>
            <option :value="0.5">柔和（推荐白天）</option>
            <option :value="1">全开（晚上炫丽）</option>
          </select>
        </div>
        <div class="fld">
          <label>高亮层级（标题/答案/重点的强调程度，白天黑夜各自独立配色）</label>
            <select :value="Number(store.cfg.hl) || 0" @change="setHl($event.target.value)">
              <option :value="0">无（最素净）</option>
              <option :value="1">精简（关键处着色，推荐）</option>
              <option :value="2">丰富（多层次强调，更醒目）</option>
            </select>
          </div>
        <div class="sec-t">📝 随手记 / 草稿纸</div>
        <div class="fld">
          <label>
            <input v-model="draftFabOn" type="checkbox" @change="saveDraftFabOn()" />
            显示「✏️ 随手记」悬浮球（任何界面可写笔记，可拖动）
          </label>
        </div>
        <details class="guide" open>
          <summary>📌 如何使用随手记 / 草稿纸？</summary>
          <div class="guide-body">
            <ul>
              <li><b>打开</b>：点任意界面的「✏️」悬浮球，弹出全透明手写板（能看清底层文字），✕ / Esc 关闭后自动保存。</li>
              <li><b>拖动</b>：按住悬浮球可拖到屏幕任意位置，位置自动记忆；点一下（未拖动）即打开。</li>
              <li><b>画笔</b>：🖊钢笔 / 🖌毛笔 / ✏️铅笔 / 🖍马克笔 / 🧯荧光笔，6 色，笔头 0.35~2.0mm（点「✒️笔头」循环切换）。</li>
              <li><b>擦除/撤销</b>：🧽橡皮（再点切换小/中/大）；↩撤销最近 20 步（Ctrl/Cmd+Z）；🗑清空。</li>
              <li><b>保存/历史</b>：💾存版 保留新版本；📁记录 可查看全部版本（含时间）、📂载入、🗑删除。</li>
              <li><b>数据安全</b>：草稿存在本机；「数据管理 → 📦导出全部数据」可备份到任意设备，崩溃/换设备后用「📦导入全部数据」恢复。</li>
            </ul>
          </div>
        </details>


        </div>
        <div class="fld">
          <label>字体（全局，含聊天/看板/知识库）</label>
          <select v-model="fontFam" @change="setFontFamily()">
            <option v-for="f in FONT_FAMILIES" :key="f.id" :value="f.id">{{ f.name }}</option>
          </select>
        </div>
        <div class="fld">
          <label>聊天字号</label>
          <div class="fs-ctl">
            <button
              class="btn btn-gh"
              @click="fs = Math.max(12, fs - 1); setFs()"
            >
              A−
            </button>
            <span class="fs-val">{{ fs }}px</span>
            <button
              class="btn btn-gh"
              @click="fs = Math.min(20, fs + 1); setFs()"
            >
              A+
            </button>
            <button
              class="btn btn-gh"
              @click="fs = 14.5; setFs()"
            >
              重置
            </button>
          </div>
        </div>

        <div class="sec-t">📅 备考冲刺（多考试倒计时）</div>
        <div class="fld">
          <label>我的考试（国考 / 省考 / 事业单位…各自独立倒计时）</label>
          <button class="btn btn-pri" style="width: 100%" @click="store.uiCtx.examMgr = true">
            📋 考试管理（{{ (store.cfg.exams || []).length }} 个 · 当前：{{ (store.cfg.exams || []).find(e => e.id === store.cfg.activeExamId)?.name || '—' }}）
          </button>
          <div style="font-size: 11px; color: var(--text3); margin-top: 4px">
            支持添加省考、事业单位等自定义考试，分别设置笔试日期与独立倒计时；可编辑、删除、设为当前。国考为内置考试不可删除。
          </div>
        </div>
        <div class="sec-t">📤 导出偏好</div>
        <div class="fld">
          <label>
            <input v-model="store.cfg.obsidian" type="checkbox" @change="saveCfg()" />
            Obsidian 兼容导出（frontmatter + 标签 + callout 折叠块）
          </label>
          <div style="font-size: 11px; color: var(--text3); margin-top: 4px">
            导出的 .md 可直接放入 Obsidian 库；PDF 采用 A4 精排版式，可导入 GoodNotes / Notability 等 iPad 笔记 App 标注。
          </div>
        </div>


        <div id="set-bg" class="sec-t">🖼️ 背景（纯色 / 图片壁纸）</div>
        <div class="sec-desc">主界面背景：默认 / 纯色 8 种 / 图片壁纸 + 模糊 / 在线自动轮换。</div>
        <div class="fld">
          <label>背景类型</label>
          <select v-model="store.cfg.bgMode" @change="saveCfg()">
            <option value="default">默认（跟随主题）</option>
            <option value="solid">纯色背景</option>
            <option value="image">图片壁纸</option>
          </select>
        </div>
        <div class="fld" style="margin-top: 8px">
          <label>
            <input v-model="store.cfg.bgAuto" type="checkbox" @change="toggleBgAuto()" />
            🌐 在线壁纸自动轮换（每 5 分钟换一张，需联网）
          </label>
          <div class="exp-choices" style="margin-top: 6px">
            <button class="btn btn-gh" @click="nextWallpaper()">🎲 换一张在线壁纸</button>
          </div>
</div>
</div>
<button class="set-group-hd" :class="{ on: setGroup === 'data' }" @click="toggleSetGroup('data')"><span class="sg-t">💾 数据与同步</span><span class="sg-desc">保存位置 / 数据管理 / WebDAV / 时政</span><span class="sg-arrow">{{ setGroup === 'data' ? '▾' : '▸' }}</span></button>
<div v-show="setGroup === 'data'" class="set-group-bd">
        <div id="set-data" class="sec-t">💾 数据保存位置（本地文件夹）</div>
        <div class="sec-desc">数据保存位置与迁移：本地文件夹 / 导出导入备份 / WebDAV 云同步 / 时政范围。</div>
        <div class="fld">
          <label>电脑端（桌面 Chrome/Edge）：选择文件夹后，可一键/自动把全部数据保存进去；手机端浏览器无“选文件夹写权限”，请用下方「📱 手机端保存/分享备份」或 WebDAV</label>
          <div class="exp-choices">
            <button class="btn btn-gh" @click="pickDir()">📁 选择保存文件夹</button>
            <button class="btn btn-pri" @click="saveDataDir()">💾 保存全部数据</button><button class="btn btn-pri" @click="saveDataDir()">💾 保存全部数据</button>
          <template v-if="isNative">
            <div style="font-size: 11px; color: var(--hud-cyan); margin-top: 6px">📱 检测到原生安卓(HBuilderX)：全量备份可自动写入 <b>{{ nativePath || '手机 Download/行测AI备份.json' }}</b></div>
            <div class="exp-choices">
              <button class="btn btn-pri" @click="nativeNow()">📱 立即原生备份</button>
              <button class="btn btn-gh" @click="nativeToggle()">{{ nativeOn ? '⏸ 停用自动原生备份' : '▶ 启用自动原生备份(45s)' }}</button>
            </div>
          </template>
          </div>
          <div v-if="dirLabel" style="font-size: 11px; color: var(--hud-cyan); margin-top: 4px">已选择文件夹：{{ dirLabel }}</div>
          <div style="font-size: 11px; color: var(--text3); margin-top: 4px">
            保存后会写入：数据备份.json / 错题集.md / 知识库积累.md。手机端或浏览器不支持选文件夹时，用上方「⬇️ 导出备份(JSON)」下载到手机，可自行移动到任意文件夹。所有数据默认存在本机 localStorage，不会上传。
            <br/>✅ 选成功后即开启<b>自动备份</b>：每约 45 秒把全部数据（设置/对话/错题/知识库等）+ 附带文件静默写入该文件夹，无需每次手动保存。若系统选择框一点开就被取消（报 user aborted/安全拦截），请改用上方的「📦导出全部数据」或 WebDAV 云同步。
          </div>
        </div>
        <div class="sec-t">💾 数据管理</div>
        <div class="exp-choices">
          <button class="btn btn-pri" @click="exportAllData()">📦 导出全部数据</button>
          <button class="btn btn-pri" @click="shareData()">📱 手机端保存/分享备份</button>
          <label class="btn btn-gh" style="text-align: center; margin: 0; cursor: pointer">
            📦 导入全部数据
            <input type="file" accept=".json,application/json" style="display: none" @change="importAllData" />
          </label>
          <label class="btn btn-gh" style="text-align: center; margin: 0; cursor: pointer">
            📥 导入笔记(.md)
            <input type="file" accept=".md,.markdown,text/markdown" style="display: none" @change="importNotes" />
          </label>

        </div>
        <div class="exp-choices">
          <button class="btn btn-gh" @click="clearResults()">🧹 清考试战绩</button>
          <button class="btn btn-gh" @click="startOnboard()">🎓 重新引导</button>
        </div>
        <div class="exp-choices">
          <button class="btn btn-gh" @click="clearWrong()">🧹 清空错题</button>
          <button class="btn btn-gh" @click="clearChat()">🧹 清空对话</button>
          <button class="btn btn-gh" style="color: var(--red)" @click="resetAll()">⚠️ 重置全部</button>
        </div>
        <div class="sec-t">🧪 出题历史数据（AI 质检学习）</div>
        <div class="sec-desc">每次 AI 出题（单题/材料题组）的 板块/题型/尝试次数/质检失败原因/是否成功 都会记录在本地，统计后自动注入出题提示词，让 AI「越出越好」；数据可导出供后续训练。</div>
        <div class="exp-choices">
          <button class="btn btn-gh" @click="exportQuizLog()">📤 导出出题历史(JSON)</button>
          <button class="btn btn-gh" @click="clearQuizLog()">🧹 清空出题历史</button>
          <span style="font-size:11px;color:var(--text3);align-self:center">已记录 {{ quizLogCount }} 条</span>
        </div>
<div class="sec-t">☁️ WebDAV 云同步</div>
        <div class="sec-desc" style="margin-top:4px">三步完成云备份：①选一个模板自动生成「地址」→ ②填「用户名」和「密码/应用密码」→ ③点 ⬆️ 上传备份。备份内容=整包全部数据（设置/对话/错题/知识库/战绩…），换设备后同一账号 ⬇️ 下载即恢复。</div>
        <div class="exp-choices" style="margin:4px 0 8px">
          <button class="btn btn-gh" @click="wdTpl('jianguo')">🌰 坚果云模板</button>
          <button class="btn btn-gh" @click="wdTpl('nextcloud')">🏠 Nextcloud/自建模板</button>
          <button class="btn btn-gh" @click="wdTpl('plain')">✍️ 自己填完整地址</button>
        </div>
        <div class="fld">
          <label>WebDAV 地址（上传/下载的备份文件完整 URL）</label>
          <input v-model="store.cfg.webdav.url" placeholder="https://dav.jianguoyun.com/dav/行测AI备份.json" @change="saveCfg()" />
        </div>
        <div class="fld">
          <label>用户名</label>
          <input v-model="store.cfg.webdav.user" autocomplete="off" @change="saveCfg()" />
        </div>
        <div class="fld">
          <label>密码 / 应用密码（坚果云请在「安全选项」生成应用密码）</label>
          <input v-model="store.cfg.webdav.pass" type="password" autocomplete="new-password" @change="saveCfg()" />
        </div>
        <div class="exp-choices">
          <button class="btn btn-pri" :disabled="wdBusy" @click="wdUp()">⬆️ 上传备份</button>
          <button class="btn btn-gh" :disabled="wdBusy" @click="wdDown()">⬇️ 下载备份</button>
        </div>
        <div style="font-size: 11px; color: var(--text3); margin-bottom: 8px">
          {{ wdStat || '提示：坚果云先在官网「安全选项」生成应用密码（不是登录密码）；地址会自动填好，一般无需手改。自定义地址以 .json 结尾（同一 URL 覆盖旧备份）。' }}
        </div>


        <div class="sec-t">📰 时政时间范围</div>
        <div class="set-note">📦 我的记忆库（常识/时政/成语/实词/笔记）已移至「🗂️ 积累」页管理，点击右侧宠物下方「📦 记忆库」即可查看/添加/删除/导出。</div>
        <div class="fld">
          <label>起始月份（默认 2025-10 起）</label>
          <input v-model="store.cfg.szFrom" type="month" @change="saveCfg()" />
        </div>
        <div class="fld">
          <label>截止月份（留空 = 动态到今天）</label>
          <input v-model="store.cfg.szTo" type="month" @change="saveCfg()" />
          <div style="font-size: 11px; color: var(--text3); margin-top: 4px">
            悬浮窗时政只推送该时间范围内的国内/贵州事件。
          </div>
        </div>
</div>
<button class="set-group-hd" :class="{ on: setGroup === 'fun' }" @click="toggleSetGroup('fun')"><span class="sg-t">🎵 趣味与陪伴</span><span class="sg-desc">萌宠 / 背景音乐 / 曲目</span><span class="sg-arrow">{{ setGroup === 'fun' ? '▾' : '▸' }}</span></button>
<div v-show="setGroup === 'fun'" class="set-group-bd">
        <div class="sec-t">🎵 学习背景音乐</div>
        <div class="fld">
          <label>播放控制</label>
          <div class="exp-choices">
            <button class="btn btn-pri" @click="toggleMusic()">{{ musicOn ? '⏸ 暂停' : '▶ 播放' }}</button>
            <button class="btn btn-gh" @click="nextTrack()">⏭ 下一首</button>
            <label class="btn btn-gh" style="margin: 0; cursor: pointer; text-align: center">
              📁 本地音频
              <input type="file" accept="audio/*" style="display: none" @change="addMusicLocal" />
            </label>
          </div>
          <label style="display: flex; align-items: center; gap: 6px; margin-top: 6px">
            <input v-model="musicLoop" type="checkbox" @change="setLoop(musicLoop)" /> 单曲循环
          </label>
          <div class="fld" style="margin-top: 6px">
            <label>音量：{{ Math.round(musicVol * 100) }}%</label>
            <input v-model.number="musicVol" type="range" min="0" max="1" step="0.05" style="width: 100%" @change="setVolume(musicVol)" />
          </div>
          <div v-if="musicStatus" style="font-size: 11px; color: var(--text3); margin-top: 4px">{{ musicStatus }}</div>
        </div>
        <div class="sec-t">🎧 曲目列表（内置开源免费）</div>
        <div class="music-list">
          <div v-for="(m, i) in musicList" :key="i" class="music-item" :class="{ on: musicOn && musicIndex === i }">
            <button class="fp-b" @click="musicIndex === i && musicOn ? toggleMusic() : playTrack(i)">{{ musicOn && musicIndex === i ? '⏸' : '▶' }}</button>
            <span class="music-name">{{ m.name }}</span>
            <span v-if="m.builtin" class="music-tag">开源</span>
            <span v-else-if="m.from" class="music-tag">网易云</span>
            <span v-else class="music-tag">自定义</span>
            <button v-if="!m.builtin" class="pp-x" @click="removeMusic(i)">×</button>
          </div>
        </div>
        <div class="fld">
          <label>自定义曲目（MP3/OGG/任意音频直链）</label>
          <div class="mem-row">
            <input v-model="musicUrl" placeholder="https://…/song.mp3" style="flex: 1" @keydown.enter="doAddMusicUrl()" />
            <button class="btn btn-gh" @click="doAddMusicUrl()">➕ 添加</button>
          </div>
          <label>网易云歌单分享链接</label>
          <div class="mem-row">
            <input v-model="neteaseUrl" placeholder="https://music.163.com/#/playlist?id=… 或 song?id=…" style="flex: 1" @keydown.enter="doNetease()" />
            <button class="btn btn-gh" @click="doNetease()">📥 导入</button>
          </div>
          <div style="font-size: 11px; color: var(--text3); margin-top: 4px">
            内置为「安静钢琴/轻音乐」学习曲（Kevin MacLeod · CC-BY 免费授权）；自定义支持任意直链与本地音频（本地音频仅本次会话播放）。网易云支持歌单(playlist?id=…)与单曲(song?id=…)链接，导入会自动尝试公共解析服务；受版权/接口限制失败时会给出引导（可用第三方工具获取直链后加为自定义曲目）。
          </div>
        </div>
        <div class="sec-t">🐾 萌宠 · 角色与语音（形象 / 名字 / 声线 / 人设）</div>
        <div class="fld">
          <label style="font-weight: 700">角色皮肤（🔒 = 内置锁定不可改；🧬 = 克隆原声）<span v-if="petBoundVoices().length" style="color: var(--pri); margin-left: 4px">🧬 {{ petBoundVoices().length }} 个自定义角色已绑定克隆原声</span></label>
          <div class="skin-grid" style="grid-template-columns: repeat(4, 1fr); margin-top: 8px">
            <button v-for="s in petAllSkins" :key="s.id" class="skin-card" :class="{ on: petSkin.id === s.id }" @click="applySkin(s.id)">
              <PetAvatar :size="40" :skin-id="s.id" class="skin-av" />
            <span class="skin-name">{{ s.char }}<span v-if="petSkinVoiceOf(s.id).cloned" style="margin-left: 2px" title="克隆原声">🧬</span><span v-if="petIsLocked(s.id)" style="margin-left: 2px" title="形象与声音已内置锁定，不可更改">🔒</span></span>
              <span v-if="s.custom && s.id !== 'custom'" class="skin-desc" style="display:flex; gap:4px; justify-content:center">
                <span style="cursor:pointer" @click.stop="applySkin(s.id)">✏️</span>
                <span style="cursor:pointer" title="删除该自定义角色" @click.stop="doRemoveCustom(s.id)">🗑</span>
              </span>
            </button>
            <button class="skin-card skin-add" @click="doAddCustom()">
              <span class="skin-name" style="font-size: 22px">➕</span>
              <span class="skin-name">新增自定义</span>
            </button>
          </div>
          <div style="font-size: 11px; color: var(--text3); margin-top: 6px">
            当前角色：<b>{{ petSkin.name }}</b>（{{ petSkin.desc }}）；
            <span v-if="petIsLocked(petSkin.id)">🔒 形象与声音<b>内置锁定</b>（{{ petSkinVoiceOf(petSkin.id).name }}），不可更改。</span>
            <span v-else-if="petSkinVoiceOf(petSkin.id).cloned">已启用克隆原声「<b>{{ petSkinVoiceOf(petSkin.id).name }}</b>」🧬</span>
            <span v-else>声音跟随「🗣️ 语音」里的<b>全局音色</b>（想给 TA 专属原声，用下方「🎤 克隆角色原声」）</span>
          </div>
        </div>
        <div v-if="!petIsLocked(petSkin.id)" class="fld" style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center">
          <button class="btn btn-pri" style="font-size: 12px" @click="$refs.setPetImgInput.click()">📷 上传形象</button>
          <button v-if="petImg" class="btn btn-gh" style="font-size: 12px" @click="doClearPetImg()">🗑 恢复默认</button>
          <span v-if="petImg" style="font-size: 11px; color: var(--text3)">已使用自定义形象（当前角色）</span>
          <input ref="setPetImgInput" type="file" accept="image/*" style="display: none" @change="onPetImgFile($event)" />
        </div>
        <div v-else class="fld" style="font-size: 11px; color: var(--text3)">🔒 该角色为内置角色，形象已固定，不可上传/更改（李星云=Q 版侠客、薛神=内置真人图片）。</div>

        <!-- 自定义人物：名字 + 人设（自定义角色显示） -->
        <div v-if="petSkin.custom" class="fld" style="border: 1px solid var(--line, rgba(128,128,128,.3)); border-radius: 10px; padding: 10px">
          <label style="font-weight: 700">🧑 {{ petSkin.name }} 设定</label>
          <div style="font-size: 11px; color: var(--text3); margin: 4px 0">自定义角色的名字、人设、形象、声线完全由你决定（声线用下方「🎤 克隆角色原声」，形象用上方「📷 上传形象」）。</div>
          <label style="margin-top: 6px">名字</label>
          <input :value="cusField('name')" placeholder="自定义人物" style="width: 100%" @input="setCusField('name', $event.target.value)" />
          <label style="margin-top: 6px">人设 / 性格（萌宠对话按此扮演）</label>
          <textarea :value="cusField('persona')" rows="3" placeholder="例：你是温柔耐心的学霸学姐，说话轻声细语，总用鼓励的方式讲解行测题。" style="width: 100%" @input="setCusField('persona', $event.target.value)"></textarea>
        </div>

        <!-- 角色原声克隆：大模型克隆（3-30 秒参考音频即可还原音色） -->
        <div v-if="!petIsLocked(petSkin.id)" class="fld" style="border: 1px solid var(--line, rgba(128,128,128,.3)); border-radius: 10px; padding: 10px">
          <label style="font-weight: 700">🎤 克隆『{{ petSkin.char }}』原声（大模型音色克隆 · 原声级）</label>
          <div style="font-size: 11px; color: var(--text3); margin: 4px 0">
            上传一段 3-30 秒清晰的参考音频（说话/角色声均可，越清晰越像），大模型会克隆出该音色并<b>自动绑定到『{{ petSkin.char }}』</b>：之后一键切到这个角色，朗读就是克隆原声；切走则恢复「语音」里的全局音色（保持全局一致）。<b>支持 mp3/wav/m4a/aac/ogg 以及 mp4/mov 等视频文件（自动提取其中的声音），哪怕后缀是 .mp3 实为 m4a 也能识别；超过 30 秒会自动裁前 20 秒、去头尾静音、转成标准 WAV 再克隆</b>。配音版权请自行确保。
          </div>
          <div style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center">
            <select v-model="cloneBackend" style="font-size: 12px; max-width: 190px">
              <option value="zhipu">🧬 智谱 GLM-TTS-Clone（3 秒即可）</option>
              <option value="cosy">🎨 CosyVoice2 · 硅基流动</option>
            </select>
            <button class="btn btn-gh" style="font-size: 12px" @click="$refs.skinVoiceFileInput.click()">{{ voiceFileName || '🎤 选择参考音频' }}</button>
            <input ref="skinVoiceFileInput" type="file" accept="audio/*,video/*,.mp4,.mov,.mkv,.webm,.m4a" style="display: none" @change="onVoiceFile($event)" />
            <input v-model="cloneVoiceName" :placeholder="petSkin.char + '声线'" style="flex: 1; min-width: 110px" />
            <button class="btn btn-pri" style="font-size: 12px" :disabled="voiceCloning" @click="doCloneVoice()">{{ voiceCloning ? '⏳ 克隆中…' : '🧬 开始克隆并绑定' }}</button>
            <div style="width: 100%">
              <input v-model="cloneVoiceText" placeholder="参考音频对应的文字内容（选填；留空会自动语音识别生成，填了克隆更像）" style="width: 100%; margin-top: 6px" />
            </div>
          </div>
          <div style="font-size: 11px; color: var(--text3); margin-top: 4px">
            需要对应 Key：智谱克隆用「图形增强/语音-智谱」Key；CosyVoice2 用「语音-OpenAI 兼容」Key（硅基流动）。未填时克隆会给出提示。
          </div>
          <div v-if="voiceCloneStat" style="font-size: 11px; margin-top: 6px; color: var(--text3)">{{ voiceCloneStat }}</div>
          <div v-if="petBoundVoices().length" style="margin-top: 8px">
            <div style="font-size: 11px; color: var(--text3)">🧬 已绑定的克隆原声：</div>
            <div v-for="bv in petBoundVoices()" :key="bv.skinId" style="display: flex; align-items: center; gap: 6px; margin-top: 4px; font-size: 12px">
              <span>{{ bv.char }} · {{ bv.name || bv.voice }}</span>
              <button class="btn btn-gh" style="font-size: 11px" @click="ttsPreviewBound(bv.skinId)">▶️ 试听</button>
              <button class="btn btn-gh" style="font-size: 11px" @click="doUnbindSkinVoice(bv.skinId)">🗑 解除</button>
            </div>
          </div>
          <div v-if="store.cfg.ttsMode === 'dash' && !petIsLocked(petSkin.id)" style="margin-top: 8px; border-top: 1px dashed var(--line, rgba(128,128,128,.35)); padding-top: 8px">
            <div style="font-size: 11px; color: var(--text3)">🍊 当前引擎为「阿里百炼」，可把现在选中的百炼音色（含自定义）绑定给『{{ petSkin.char }}』，做成 TA 的专属声线：</div>
            <div style="display: flex; gap: 6px; align-items: center; margin-top: 6px; flex-wrap: wrap">
              <span style="font-size: 12px">当前：<b>{{ store.cfg.ttsDash.voice || '默认' }}</b><span v-if="store.cfg.ttsDash.voiceCustom">（自定义：{{ store.cfg.ttsDash.voiceCustom }}）</span></span>
              <button class="btn btn-pri" style="font-size: 11px" @click="bindDashToSkin(petSkin.id)">🔗 绑给『{{ petSkin.char }}』</button>
              <button v-if="petSkinVoiceOf(petSkin.id).engine === 'dash'" class="btn btn-gh" style="font-size: 11px" @click="doUnbindSkinVoice(petSkin.id)">🗑 解除</button>
            </div>
          </div>
        </div>
        <div v-else class="fld" style="font-size: 11px; color: var(--text3)">🔒 该角色声音为内置克隆原声（{{ petSkinVoiceOf(petSkin.id).name }}），已锁定不可更改/重新克隆。想添加可自由定制的角色？点上方「➕ 新增自定义」。</div>

        <div class="fld">
          <label style="display: flex; align-items: center; gap: 6px">
            <input v-model="store.cfg.petVoice" type="checkbox" @change="saveCfg()" />
            萌宠语音朗读（真人音色 / 克隆原声）
          </label>
          <label style="display: flex; align-items: center; gap: 6px; margin-top: 4px">
            <input v-model="petSpeakReply" type="checkbox" />
            萌宠回复自动朗读（对话/错因分析后读给你听）
          </label>
          <label style="display: flex; align-items: center; gap: 6px; margin-top: 4px">
            <input v-model="petMuted" type="checkbox" @change="setPetMuted(petMuted)" />
            关闭萌宠气泡（隐藏互动文字）
          </label>
          <div style="font-size: 11px; color: var(--text3); margin-top: 6px">
            萌宠记录学习状态：每次 AI 回复 +1 积分、错题二刷/三刷 +2，5 积分喂食；成长 🥚→🐣→🐥→🐔→🦉→🐲。右下角萌宠可互动、改名、喂食、拖拽小窗。
          </div>
        </div>


</div>
<button class="set-group-hd" :class="{ on: setGroup === 'ui' }" @click="toggleSetGroup('ui')"><span class="sg-t">🧩 界面自定义</span><span class="sg-desc">隐藏/显示主页板块与功能入口（DIY 布局）</span><span class="sg-arrow">{{ setGroup === 'ui' ? '▾' : '▸' }}</span></button>
<div v-show="setGroup === 'ui'" class="set-group-bd">
  <div id="set-ui" class="sec-t">🧩 界面自定义（DIY 你的主页）</div>
  <div class="sec-desc">按需求自主隐藏或显示主界面的板块与细分功能入口（如萌宠、背景音乐），让界面更清爽。仅隐藏入口、<b>不删除任何功能</b>——隐藏后仍可从「更多菜单 / 链接」进入。</div>
  <div class="ui-list">
    <div v-for="e in uiEntries" :key="e.id" class="ui-row">
      <div class="ui-meta">
        <div class="ui-label">{{ e.label }}</div>
        <div class="ui-desc">{{ e.desc }}</div>
      </div>
      <label class="switch">
        <input type="checkbox" :checked="!uiHiddenOf(e.id)" @change="toggleUi(e.id)" />
        <span class="slider"></span>
      </label>
    </div>
  </div>
  <button class="btn btn-gh" style="margin-top: 10px" @click="resetUi()">↺ 恢复全部入口</button>
  <div style="font-size: 11px; color: var(--text3); margin-top: 8px">
    提示：隐藏某个板块后，它从底部导航消失；需要时可点上方「恢复全部入口」一键还原。
  </div>
</div>
<button class="set-group-hd" :class="{ on: setGroup === 'account' }" @click="toggleSetGroup('account')"><span class="sg-t">🔐 账号与安全</span><span class="sg-desc">本地登录门 / 修改密码 / 退出 / 删除账号</span><span class="sg-arrow">{{ setGroup === 'account' ? '▾' : '▸' }}</span></button>
<div v-show="setGroup === 'account'" class="set-group-bd">
  <div id="set-account" class="sec-t">🔐 本地账号（登录门）</div>
  <div class="sec-desc">注册/登录后才可使用本项目；账号仅存本机 localStorage，不上传任何数据。</div>
  <div class="fld">
    <label>登录门开关</label>
    <label style="font-weight: 400"><input type="checkbox" :checked="authState.enabled" @change="toggleAuthGate($event.target.checked)" /> 启用登录门（开启后需登录才能使用）</label>
  </div>
  <div v-if="authState.ok" class="fld">
    <label>当前用户</label>
    <div class="auth-cur">👤 {{ authState.user }}</div>
  </div>
  <div v-if="authState.ok" class="fld">
    <label>修改密码</label>
    <div style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center">
      <input v-model="authOldP" type="password" placeholder="原密码" style="width: 120px" />
      <input v-model="authNewP" type="password" placeholder="新密码(≥4位)" style="width: 140px" @keyup.enter="doChangePass" />
      <button class="btn btn-gh" style="font-size: 12px" @click="doChangePass">✏️ 修改</button>
    </div>
  </div>
  <div v-if="authState.ok" class="fld">
    <label>退出 / 删除本机账号</label>
    <div style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center">
      <button class="btn btn-gh" style="font-size: 12px" @click="doLogout">🚪 退出登录</button>
      <input v-model="authDelP" type="password" placeholder="输入密码删除账号" style="width: 160px" @keyup.enter="doDeleteUser" />
      <button class="btn btn-gh" style="font-size: 12px; color: var(--red)" @click="doDeleteUser">🗑 删除账号</button>
    </div>
  </div>
  <div class="fld" style="border-top: 1px dashed rgba(148,163,184,.2); padding-top: 10px; margin-top: 4px">
    <label>🔐 登录方式</label>
    <div style="font-size: 12px; color: var(--text2); line-height: 1.7">本地账号：<b>用户名 + 密码</b>（仅存本机浏览器，无服务器、不上传、无第三方服务）。勾「记住我」7 天内免登录；忘记密码可「重置本地账号」重新注册。</div>
  </div>
  <div class="fld">
    <button class="btn btn-gh" style="font-size: 12px" @click="doAuthReset">🔄 重置本地账号（清空本机账号记录）</button>
  </div>
  <div style="font-size: 11px; color: var(--text3); margin-top: 4px">说明：本登录为「本地保护门」（无后端），防止他人随意使用；清除站点数据或换浏览器会丢失账号。删除账号 / 重置账号不影响对话、错题、笔记等学习数据。</div>
</div>
<button class="set-group-hd" :class="{ on: setGroup === 'help' }" @click="toggleSetGroup('help')"><span class="sg-t">❓ 帮助与关于</span><span class="sg-desc">新手引导 / 使用帮助 / 关于 / 日志</span><span class="sg-arrow">{{ setGroup === 'help' ? '▾' : '▸' }}</span></button>
<div v-show="setGroup === 'help'" class="set-group-bd">
        <div class="sec-t">🧭 新手引导</div>
        <div v-if="store.cfg.bgMode === 'solid'" class="fld">
          <label>预设纯色</label>
          <div class="sw-row">
            <span
              v-for="s in BG_SOLIDS"
              :key="s.k"
              class="sw bgsw"
              :class="{ on: store.cfg.bgSolid === s.k }"
              :style="{ background: s.c }"
              :title="s.n"
              @click="store.cfg.bgSolid = s.k; saveCfg()"
            ></span>
          </div>
        </div>
        <div v-if="store.cfg.bgMode === 'image'" class="fld">
          <label>壁纸图片（png / jpg / webp / gif，可多格式）</label>
          <div class="exp-choices">
            <label class="btn btn-gh" style="margin: 0; cursor: pointer; text-align: center">
              📁 选择图片
              <input type="file" accept="image/*" style="display: none" @change="pickBg" />
            </label>
            <button class="btn btn-gh" @click="store.cfg.bgImg = ''; store.cfg.bgMode = 'default'; saveCfg()">🗑 清除壁纸</button>
          </div>
          <label style="margin-top: 6px">模糊程度：{{ store.cfg.bgBlur }}px</label>
          <input v-model.number="store.cfg.bgBlur" type="range" min="0" max="30" step="1" style="width: 100%" @change="saveCfg()" />
          <div style="font-size: 11px; color: var(--text3); margin-top: 4px">模糊越大越"磨砂"，越大越护眼不刺眼；白天/黑夜均可使用同一壁纸。</div>
        </div>
        <div class="fld">
          <label>
            <input v-model="guidesOff" type="checkbox" @change="guidesOff ? disableAllGuides() : enableAllGuides()" />
            一键关闭所有引导（板块首次进入不再弹提示）
          </label>
          <div style="display: flex; gap: 6px; margin-top: 6px">
            <button class="btn btn-gh" style="font-size: 12px" @click="enableAllGuides()">🔄 重开全部引导</button>
          </div>
          <div style="font-size: 11px; color: var(--text3); margin-top: 4px">
            引导 = 每个板块第一次进入时弹出的"功能说明 + 使用技巧"，可单独跳过或一键全关。
          </div>
        </div>


        <div id="set-help" class="sec-t">🧭 使用帮助</div>
        <div class="sec-desc">六步学习闭环、快捷键、常见问题、新手引导开关。</div>
        <details class="guide">
          <summary>📈 六步学习闭环（建议每天按这个顺序用）</summary>
          <div class="guide-body">
            <ol>
              <li>🚀 看板 → 看「今日任务」：刷 5 道最弱板块题、复盘/二刷 N 道错题、积累 2 条常识；</li>
              <li>💬 对话 → 刷题（可开「考场限时」或「📝 模拟组卷」），答完点「📌 存错题」；</li>
              <li>📋 错题 → 晚上「✍️ 二刷/三刷」直接点选项作答，连续答对 2 次自动「已消化」；</li>
              <li>🗂️ 积累 → 常识/时政用「🔁 复习」按艾宾浩斯记忆，答错自动入库；</li>
              <li>📊 统计 → 看趋势折线/雷达图/热力图，了解坚持与短板；</li>
              <li>📤 导出 → 每周 AI 整理导出 Word/PDF 或 Obsidian .md，考前打印复习。</li>
            </ol>
          </div>
        </details>
        <details class="guide">
          <summary>⌨️ 快捷键</summary>
          <div class="guide-body">
            <ul>
              <li><b>Ctrl/Cmd + K</b>：聚焦全局搜索</li>
              <li><b>Ctrl/Cmd + 1~6</b>：切换 看板/对话/知识库/积累/统计/错题</li>
              <li><b>Enter</b>：发送消息；<b>Shift+Enter</b>：换行</li>
              <li><b>Esc</b>：收起搜索</li>
            </ul>
          </div>
        </details>
        <details class="guide">
          <summary>❓ 常见问题</summary>
          <div class="guide-body">
            <ul>
              <li><b>发消息没反应？</b> 先在「API 设置」填 Key 并「保存并测试」，状态灯出现 ✅。</li>
              <li><b>发图/截图题看不到？</b> 必须配置「视觉模型」并选可识图模型（DeepSeek vision / 智谱 GLM-5V）。</li>
              <li><b>想换设备接着用？</b> 数据存 localStorage；用「数据管理→导出备份 JSON」→ 新设备「导入备份」，或用「WebDAV 云同步」。</li>
              <li><b>想导入自己的笔记？</b> 「数据管理→📥 导入笔记(.md)」，支持 Obsidian 格式（frontmatter 标签 + 标题分节）。</li>
              <li><b>想在 iPad/Anki 里复习？</b> 错题页导出 PDF（A4）给 GoodNotes，或「🃏 推到 Anki」（需 AnkiConnect）。</li>
            </ul>
          </div>
        </details>


<div id="set-about" class="sec-t">📜 关于 · 开发者说明</div>
        <div class="sec-desc">免责声明、隐私说明、版本信息与开发者说明。</div>
        <div class="about-box">
          <p class="ab-warn">⚠️ 本项目仅供个人学习使用，切勿商用，违者必究。</p>
          <p><b>隐私与数据</b>：全部数据（对话 / 错题 / 知识库 / 设置 / 萌宠）只保存在你自己的浏览器 localStorage，应用无后端服务器、不上传任何数据；API Key 也只存本机。迁移可用「数据与同步 → 导出/导入备份、WebDAV 云同步、保存到本地文件夹」。</p>
          <p><b>版本</b>：v{{ APP_VERSION }}（更新历史见仓库 CHANGELOG.md）</p>
          <p><b>使用提示</b>：首次使用请先完成「设置引导」（重点：文字模型 + 视觉模型 + 语音试听）；日常按「看板→对话刷题→错题二刷→积累复习→统计→导出」闭环提分。</p>
          <details class="guide">
            <summary>🔧 开发者说明（模块地图 / 配置键 / 存储键 / 构建流程）</summary>
            <div class="guide-body">
              <p><b>技术栈</b>：Vue3（Composition API）+ Vite + PWA。`01_源码` 为唯一活跃源码；`scripts/sync-dist.ps1` 一键构建并同步三端（网页 / 发布包 / 安卓 web 资源）。</p>
              <p><b>模块地图</b>：<code>src/App.vue</code> 设置面板与全局壳；<code>src/store.js</code> 全局状态（cfg/对话/错题/记忆/笔记）；<code>src/api/*</code> 各厂商 AI 适配（chat/vision/figEnhance）；<code>src/utils/tts*.js</code> 四引擎朗读与音色克隆；<code>src/utils/pet.js</code> 萌宠角色系统；<code>src/utils/music.js</code> 背景音乐；<code>src/kb.js</code> 知识库与名师方法论提示词；<code>src/components/*</code> 各板块页面。</p>
              <p><b>设置面板结构（本次重构）</b>：6 大分组 = 🧠 模型与 AI / 🗣️ 语音朗读 / 🎨 外观与主题 / 💾 数据与同步 / 🎵 趣味与陪伴 / ❓ 帮助与关于。每组一个手风琴标题（`set-group-hd`）+ 内容容器（`set-group-bd`）；顶部 `set-status` 状态总览；导航 `setNav` 按组跳转（`scrollSet` 自动展开所属组）。新增设置项时：①在对应组内添加区块（`sec-t` + 内容 + 可选 `sec-desc`）②在 <code>store.cfg</code> 增加字段 ③必要时加入 <code>SEC_GROUP</code> / <code>SET_GUIDE</code>。</p>
              <p><b>关键配置键（store.cfg）</b>：<code>text/vision</code>=文字/视觉模型（prov/key/url/model）；<code>fig</code>=图形增强；<code>ttsMode/ttsGm/ttsOpenAI/ttsEdgeVoice/ttsRate/ttsOn</code>=朗读；<code>petSkin/skinVoices/skinImgs/customSkins</code>=萌宠；<code>musicOn/musicVol/musicList</code>=音乐；<code>szFrom/szTo</code>=时政范围；<code>dataDir</code>=本地文件夹。</p>
              <p><b>关键存储键（localStorage）</b>：<code>xc_cfg</code>=设置；<code>xc_msgs</code>=对话；<code>xc_wqs</code>=错题；<code>xc_my_mem</code>=记忆库；<code>xc_notes</code>=笔记；<code>xc_pet</code>=萌宠养成；<code>xc_chat_fast_model</code>=对话快模型。</p>
              <p><b>质量流程</b>：改动后跑 <code>npm run lint</code>（零告警）→ <code>npm test</code> → <code>npm run build</code> → <code>scripts/sync-dist.ps1</code> 三端同步；完整文档见仓库 <code>01_源码/开发说明.md</code>。</p>
            </div>
          </details>
        </div>
        <div class="sec-t">ℹ️ 模型说明</div>
        <div style="font-size: 12px; color: var(--text3); line-height: 1.7">
          文字题（纯文字）走「文字模型」，默认 DeepSeek
          deepseek-v4-flash（便宜、中文好）；带图/公式题走「视觉模型」，默认 DeepSeek
          deepseek-v4-flash-vision-exp（能看图、识别公式符号），也可在设置里换智谱
          GLM-5V。截图提问需配置并勾选视觉模型。
        </div>
        <div class="sec-t">🛠 最近错误日志（本地调试）</div>
        <div style="font-size: 12px; color: var(--text3); line-height: 1.7">
          运行出错会自动记录到本机（最多保留最近 50 条，仅用于排查，不影响任何数据）。
          <div style="margin-top: 6px">
            <button class="btn btn-gh" @click="refreshErrLog(); errLogShow = !errLogShow">{{ errLogShow ? '隐藏日志' : '查看日志' }}（{{ errLogList.length }}）</button>
            <button class="btn btn-gh" @click="clearErrLog()">清空</button>
          </div>
        </div>
        <pre v-if="errLogShow" class="err-log">{{ errLogText }}</pre>
</div>
<div class="pnl-btns">
          <button class="btn btn-gh" @click="setShow = false">取消</button>
          <button class="btn btn-pri" :disabled="testBusy" @click="saveSet()">{{ testBusy ? '检测中…' : '保存并测试' }}</button>
        </div>
      </div>
    </div>
        <!-- 用量与花费面板（实时 · 全维度明细） -->
    <div class="ov" :class="{ show: costShow }" @click.self="costShow = false">
      <div class="pnl cost-pnl">
        <div class="pnl-top">
          <button class="pnl-top-b" title="关闭" @click="costShow = false">← 返回</button>
          <span class="pnl-top-t">💰 AI 用量与花费（实时追踪 · 越详细越好）</span>
        </div>
        <div v-if="costLive.active" class="cost-live">
          <span class="cl-dot"></span>正在调用
          <b>{{ COST_FEATURES[costLive.feature] || costLive.feature }}</b>
          <span v-if="costLive.kind" class="cl-kind">{{ COST_KINDS[costLive.kind] || costLive.kind }}</span>
          <span class="cl-model">{{ costLive.model || costLive.provider || '' }}</span>
          <span class="cl-sec">已 {{ costElapsed }}s</span>（完成即记账）
        </div>
        <div class="cost-sum">
          <div class="cost-sum-it"><span>今日</span><b>{{ fmtCost(costStat.today) }}</b><i>{{ costStat.todayN }} 次</i></div>
          <div class="cost-sum-it"><span>本周</span><b>{{ fmtCost(costStat.week) }}</b><i>{{ costStat.weekN }} 次</i></div>
          <div class="cost-sum-it"><span>本月</span><b>{{ fmtCost(costStat.month) }}</b><i>{{ costStat.monthN }} 次</i></div>
          <div class="cost-sum-it"><span>累计</span><b>{{ fmtCost(costStat.total) }}</b><i>{{ costStat.totalN }} 次</i></div>
        </div>
        <div class="cost-tok">
          <span>🧮 累计 token：输入 <b>{{ fmtTok(costStat.totalInT) }}</b> + 输出 <b>{{ fmtTok(costStat.totalOutT) }}</b><template v-if="costStat.totalReasonT"> + 思考 <b>{{ fmtTok(costStat.totalReasonT) }}</b></template> = <b>{{ fmtTok(costStat.totalT) }}</b></span>
        </div>
        <div class="cost-budget" style="display:flex;align-items:center;gap:8px;margin:6px 2px 8px;flex-wrap:wrap">
          <span style="font-size:12.5px">🛑 今日预算：</span>
          <input v-model.number="costBudget" type="number" step="0.5" min="0" placeholder="0=不限制" style="width:96px;padding:5px 8px;border-radius:6px;border:1px solid var(--glass-border);background:var(--surface);color:var(--text);font-size:12.5px" title="今日 AI 花费超过该金额（元）后，每次调用先弹确认才继续；0 表示不限制" />
          <span style="font-size:11.5px;color:var(--text3)">元/日 · 今日已用 <b style="color:var(--accent)">{{ fmtCost(costStat.today) }}</b><template v-if="costBudget > 0 && costStat.today >= costBudget"> · <b style="color:#fb7185">已超预算，后续调用需确认</b></template></span>
          <button class="btn btn-pri" style="font-size:12px" @click="costSaveBudget()">💾 保存预算</button>
        </div>
        <div style="font-size: 11px; color: var(--text3); line-height: 1.6; margin: 6px 2px 8px">
          📌 每次调用 <b>实时记一笔</b>：功能 / 模型 / 图文类型 / 输入·输出·思考 token（接口有 usage 用精确值并标「精确」，否则按文本估算）/ 耗时 / 费用明细。金额按下方计价表估算，仅供心里有底，以服务商账单为准；<b>本地免费服务（Ollama/LM Studio/Jan）计 ¥0</b>。
        </div>
        <div class="cost-cols">
          <div class="cost-col">
            <div class="sec-t" style="font-size: 13px">📊 按功能</div>
            <div v-for="(v, k) in costStat.byFeat" :key="k" class="cost-row"><span>{{ COST_FEATURES[k] || k }}</span><b>{{ fmtCost(v) }}</b></div>
            <div v-if="!Object.keys(costStat.byFeat).length" class="cost-empty">暂无记录</div>
          </div>
          <div class="cost-col">
            <div class="sec-t" style="font-size: 13px">🤖 按模型</div>
            <div v-for="(v, k) in costStat.byModel" :key="k" class="cost-row"><span>{{ k }}</span><b>{{ fmtCost(v) }}</b></div>
            <div v-if="!Object.keys(costStat.byModel).length" class="cost-empty">暂无记录</div>
          </div>
          <div class="cost-col">
            <div class="sec-t" style="font-size: 13px">🖼 按类型</div>
            <div v-for="(v, k) in costStat.byKind" :key="k" class="cost-row"><span>{{ COST_KINDS[k] || k }}</span><b>{{ fmtCost(v) }}</b></div>
            <div v-if="!Object.keys(costStat.byKind).length" class="cost-empty">暂无记录</div>
          </div>
          <div class="cost-col">
            <div class="sec-t" style="font-size: 13px">🏢 按提供商</div>
            <div v-for="(v, k) in costStat.byProv" :key="k" class="cost-row"><span>{{ k }}</span><b>{{ fmtCost(v) }}</b></div>
            <div v-if="!Object.keys(costStat.byProv).length" class="cost-empty">暂无记录</div>
          </div>
        </div>
        <div class="sec-t" style="font-size: 13px">🧾 最近记录（{{ costStat.list.length }}）<span style="font-weight:400;color:var(--text3);font-size:11px">点某条可展开费用明细</span></div>
        <div class="cost-list">
          <div v-for="(r, i) in costStat.list" :key="i" class="cost-it" :class="{ open: costOpen === i }" @click="costOpen = costOpen === i ? null : i">
            <span class="ci-time" :title="fmtTime(r.t)">{{ fmtTime(r.t) }}</span>
            <span class="ci-kind" :title="costKindLabel(r.kind)">{{ r.kind === 'img' ? '🖼' : r.kind === 'audio' ? '🔊' : '📝' }}</span>
            <span class="ci-feat">{{ COST_FEATURES[r.feature] || r.feature }}</span>
            <span class="ci-model" :title="'提供商：' + (r.provider || '?')">{{ r.model || r.provider || '?' }}</span>
            <span class="ci-tk" :title="'输入 ' + r.inT + ' / 输出 ' + r.outT + (r.reasonT ? ' / 思考 ' + r.reasonT : '') + ' tok'">
              {{ fmtTok(r.inT) }}/{{ fmtTok(r.outT) }}{{ r.reasonT ? '+' + fmtTok(r.reasonT) : '' }} tok{{ r.exact ? '·精确' : '·估' }}
            </span>
            <span v-if="r.sec" class="ci-sec">{{ r.sec }}s</span>
            <b class="ci-cost" :title="costCostDetail(r)">{{ fmtCost(r.cost) }}</b>
          </div>
          <div v-if="!costStat.list.length" class="cost-empty">还没有 AI 调用记录，去问答/刷题/朗读试试（实时动态记）</div>
        </div>
        <div v-if="costOpen != null && costStat.list[costOpen]" class="cost-detail">
          <div><b>时间：</b>{{ fmtTime(costStat.list[costOpen].t) }}</div>
          <div><b>功能：</b>{{ COST_FEATURES[costStat.list[costOpen].feature] || costStat.list[costOpen].feature }}（{{ costKindLabel(costStat.list[costOpen].kind) }}）</div>
          <div><b>模型：</b>{{ costStat.list[costOpen].model || '?' }}<span v-if="costStat.list[costOpen].provider">（{{ costStat.list[costOpen].provider }}）</span></div>
          <div><b>Token：</b>输入 {{ costStat.list[costOpen].inT }} / 输出 {{ costStat.list[costOpen].outT }}<template v-if="costStat.list[costOpen].reasonT"> / 思考 {{ costStat.list[costOpen].reasonT }}</template>（{{ costStat.list[costOpen].exact ? '接口精确' : '文本估算' }}）</div>
          <div v-if="costStat.list[costOpen].sec"><b>耗时：</b>{{ costStat.list[costOpen].sec }} 秒</div>
          <div><b>费用明细：</b>{{ costCostDetail(costStat.list[costOpen]) || '—' }} = <b>{{ fmtCost(costStat.list[costOpen].cost) }}</b></div>
          <div v-if="costStat.list[costOpen].note"><b>备注：</b>{{ costStat.list[costOpen].note }}</div>
        </div>
        <details class="guide" style="margin-top: 10px">
          <summary>⚙️ 计价表（2026-09 联网核验真实公开价：DeepSeek V4 峰谷 / 智谱 GLM-5·4.7 系列 / 通义 Qwen3 系列 / OpenAI GPT-5 系列 / Kimi K3·K2.6 / Gemini 3.x / 豆包 Seed-1.6-Flash / 朗读单价，均按官方价目页核验；美元模型按 ¥7 折算。单位：输入框=元/千 token = 官方价(元/百万)÷1000。若你账单价不同请直接改；表里没列出的模型按「default」兜底）</summary>
          <div class="guide-body">
            <template v-for="(pr, mk) in costPrices" :key="mk"><div v-if="mk !== 'ttsPrices'" class="cost-price-row">
              <span class="cp-name">{{ mk === 'ttsPer1k' ? '朗读(元/千字)' : mk === 'cloneFee' ? '克隆(元/次)' : mk }}</span>
              <input v-if="mk === 'ttsPer1k' || mk === 'cloneFee'" v-model.number="costPrices[mk]" type="number" step="0.001" min="0" style="width: 90px" />
              <template v-else>
                <input v-model.number="costPrices[mk].in" type="number" step="0.001" min="0" style="width: 70px" title="输入价(元/千token = 官方元/百万 ÷ 1000)" />
                <input v-model.number="costPrices[mk].out" type="number" step="0.001" min="0" style="width: 70px" title="输出价(元/千token = 官方元/百万 ÷ 1000)" />
              </template>
              <span class="cp-note">{{ pr.note || pr }}</span>
            </div></template>
            <div style="display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap">
              <button class="btn btn-pri" style="font-size: 12px" @click="costSavePrices()">💾 保存计价表</button>
              <button class="btn btn-gh" style="font-size: 12px" @click="costResetPrices()">↩️ 恢复默认</button>
              <button class="btn btn-gh" style="font-size: 12px; color: var(--red)" @click="clearCost('today'); costShow = true">🧹 清今日</button>
              <button class="btn btn-gh" style="font-size: 12px; color: var(--red)" @click="clearCost('week'); costShow = true">🧹 清本周</button>
              <button class="btn btn-gh" style="font-size: 12px; color: var(--red)" @click="clearCost('month'); costShow = true">🧹 清本月</button>
              <button class="btn btn-gh" style="font-size: 12px; color: var(--red)" @click="clearCost('all')">🗑 清全部</button>
            </div>
          </div>
        </details>
        <div class="pnl-btns"><button class="btn btn-gh" @click="costShow = false">关闭</button></div>
      </div>
    </div>
        <!-- 导出弹窗 -->
    <div class="ov" :class="{ show: expShow }" @click.self="expShow = false">
      <div class="pnl">
        <div class="pnl-top">
          <button class="pnl-top-b" title="返回上一层" @click="expShow = false">← 返回</button>
          <span class="pnl-top-t">📤 导出</span>
        </div>
        <div class="fld">
          <label>内容：{{ { chat: '💬 对话记录', wrong: '📋 错题集', review: '📖 单题复盘', kb: '📚 知识库积累' }[expType] }}</label>
        </div>
        <div v-if="expType === 'wrong'" class="sec-t">📐 错题打印模板（决定答案/解析是否随题导出）</div>
        <div v-if="expType === 'wrong'" style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0">
          <button class="btn btn-gh" :class="{ on: expTpl === 'full' }" @click="expTpl = 'full'">完整（含答案/错因）</button>
          <button class="btn btn-gh" :class="{ on: expTpl === 'stems' }" title="只导出题干，不含任何答案与解析，适合纯重做自测" @click="expTpl = 'stems'">只题干</button>
          <button class="btn btn-gh" :class="{ on: expTpl === 'separate' }" title="题干在前，答案与解析集中到末尾（打印重做友好）" @click="expTpl = 'separate'">题答分离</button>
        </div>
        <div class="sec-t">✨ 让 AI 整理后导出（推荐：梳理考点/错因/秒杀规律）</div>
        <div class="exp-choices">
          <button class="btn btn-pri" @click="runExport('docx', true)">AI整理 → Word</button>
          <button class="btn btn-gh" @click="runExport('pdf', true)">AI整理 → PDF</button>
        </div>
        <div class="sec-t">📄 直接导出（原样）</div>
        <div class="exp-choices">
          <button class="btn btn-gh" @click="runExport('docx', false)">直接 → Word</button>
          <button class="btn btn-gh" @click="runExport('pdf', false)">直接 → PDF</button>
          <button class="btn btn-gh" @click="runExport('md', false)">直接 → Markdown</button>
        </div>
        <div class="pnl-btns"><button class="btn btn-gh" @click="expShow = false">取消</button></div>
      </div>
    </div>
    <div id="toast" ref="toastEl" class="toast"></div>
    <!-- 全局随手记：任何界面可写的悬浮手写板（做题界面自动隐藏，由做题草稿球接管） -->
    <Teleport to="body">
      <button v-if="draftFabOn && !globalDraft" class="draft-fab gfab" :style="gFabStyle" :title="'✏️ 随手记：单击=小画板 · 双击=全屏勾画原题（可拖动，设置里可关闭）'" @pointerdown="onGFabDown">✏️</button>
      <DraftPad v-if="globalDraft" :initial-mode="gFabIntent" draft-key="global" title="📝 全局随手记" @close="globalDraft = false; gFabIntent = ''" />
    </Teleport>
  </div>
    <!-- 首次使用引导向导 -->
    <div v-if="onboard" class="ov show ob-ov" @click.self="skipOnboard()">
      <div class="pnl ob-pnl">
        <template v-if="obStep === 0">
          <h3>🎓 欢迎使用 行测 AI 智能助教</h3>
          <div class="ob-flow">
            <p>这是一个把名师讲义蒸馏成 AI 方法的备考工具，核心闭环：</p>
            <div class="ob-flow-line">🚀 看板看任务 → 💬 对话刷题 → 📋 错题复盘 → 🗂️ 积累记忆 → 📊 统计看进步 → 📤 导出打印</div>
            <p>下面用 <b>4 步</b> 完成基础设置（约 2 分钟）。任何一步都可点「跳过」。</p>
          </div>
          <div class="pnl-btns">
            <button class="btn btn-gh" @click="skipOnboard()">跳过引导</button>
            <button class="btn btn-pri" @click="obStep = 1">开始设置 ▶</button>
          </div>
</template>

        <template v-else-if="obStep === 1">
          <h3>① 配置文字模型（纯文字题）</h3>
          <div class="ob-body">
            <p>推荐 <b>DeepSeek</b>（便宜、中文好）。去平台创建 Key 后粘贴到下面：</p>
            <div class="ob-prov">
              <button v-for="p in [['ds','DeepSeek'],['zhipu','智谱'],['openai','OpenAI'],['qwen','通义']]" :key="p[0]" class="fp-b" :class="{ on: store.cfg.text.prov === p[0] }" @click="store.cfg.text.prov = p[0]; onCatProv('text')">{{ p[1] }}</button>
            </div>
            <a class="ob-link" href="https://platform.deepseek.com/" target="_blank" rel="noopener">🔗 去 DeepSeek 创建 Key（选其它提供商则用对应平台）</a>
            <input v-model="store.cfg.text.key" class="ob-input" placeholder="粘贴 sk-... 开头的 API Key" type="password" @keydown.enter="testConn()" />
            <div class="ob-note">Key 只存在本机浏览器，不会上传。填好后点「测试」。</div>
            <div class="pnl-btns">
              <button class="btn btn-gh" @click="obStep = 2">跳过 ▶</button>
              <button class="btn btn-gh" :disabled="testBusy" @click="testConn()">🧪 测试连接</button>
              <button class="btn btn-pri" @click="saveSet(); obStep = 2">保存并下一步 ▶</button>
            </div>
          </div>
</template>

        <template v-else-if="obStep === 2">
          <h3>② 配置视觉模型（图片/截图题）</h3>
          <div class="ob-body">
            <p>图推图形、资料表格、数学公式需要视觉模型。用 DeepSeek 时可直接用 <b>同一个 Key</b>（deepseek-v4-flash-vision-exp）：</p>
            <div class="ob-prov">
              <button v-for="p in [['ds','DeepSeek(推荐)'],['zhipu','智谱'],['openai','OpenAI'],['qwen','通义']]" :key="p[0]" class="fp-b" :class="{ on: store.cfg.vision.prov === p[0] }" @click="store.cfg.vision.prov = p[0]; onCatProv('vision')">{{ p[1] }}</button>
            </div>
            <input v-model="store.cfg.vision.key" class="ob-input" placeholder="视觉模型 Key（DeepSeek 可填和上面同一个）" type="password" @keydown.enter="testConn()" />
            <div class="ob-note">不配视觉模型也能用文字提问，只是发图/截图题无法识别。</div>
            <div class="pnl-btns">
              <button class="btn btn-gh" @click="obStep = 3">跳过 ▶</button>
              <button class="btn btn-gh" :disabled="testBusy" @click="testConn()">🧪 测试连接</button>
              <button class="btn btn-pri" @click="saveSet(); obStep = 3">保存并下一步 ▶</button>
            </div>
          </div>
</template>

        <template v-else-if="obStep === 3">
          <h3>③ 语音 & 考试日期（可选）</h3>
          <div class="ob-body">
            <p>朗读让 AI 讲解"听得见"；设置笔试日期后，🚀看板与顶栏会显示实时倒计时。</p>
            <div class="ob-row">
              <button class="btn btn-gh" @click="ttsTest()">🔊 试听朗读</button>
              <button class="btn btn-pri" @click="store.uiCtx.examMgr = true">📅 设置考试日期（国考 / 省考…）</button>
            </div>
            <div class="ob-note">可添加省考、事业单位等多个考试，各自独立倒计时；在 设置 → 考试管理 随时增删改。</div>
            <div class="pnl-btns">
              <button class="btn btn-gh" @click="obStep = 4">跳过 ▶</button>
              <button class="btn btn-pri" @click="obStep = 4">下一步 ▶</button>
            </div>
          </div>
</template>

        <template v-else>
          <h3>🎉 设置完成！</h3>
          <div class="ob-body">
            <p>现在可以开始了：</p>
            <ul>
              <li>💬 对话页提问一道题试试（可先「🎲 模拟出题」）；</li>
              <li>📥 可导入你的真题/笔记：设置 → 数据管理 → 导入笔记(.md)；</li>
              <li>☁️ 想多端同步：设置 → WebDAV 云同步。</li>
            </ul>
            <div class="ob-note">以后想再看本引导：设置 → 数据管理 → 🎓 重新引导。</div>
            <div class="pnl-btns">
              <button class="btn btn-pri" @click="finishOnboard()">✅ 开始学习</button>
            </div>
          </div>
</template>
      </div>
    </div>


    <!-- 板块首次使用引导 -->
    <div v-if="guide" class="ov show tabguide-ov" @click.self="closeGuide()">
      <div class="pnl tabguide-pnl">
        <div class="tg-head">
          <span class="tg-icon">{{ guide.icon }}</span>
          <span class="tg-title">{{ guide.title }}</span>
        </div>
        <div class="tg-desc">{{ guide.desc }}</div>
        <div class="tg-sec">✨ 这里能做什么</div>
        <ul class="tg-list">
          <li v-for="(f, i) in guide.features" :key="'f' + i">{{ f }}</li>
        </ul>
        <div class="tg-sec">💡 怎么用效果更好</div>
        <ul class="tg-list tips">
          <li v-for="(t, i) in guide.tips" :key="'t' + i">{{ t }}</li>
        </ul>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="disableAllGuides()">🔕 关闭所有引导</button>
          <button class="btn btn-gh" @click="closeGuide()">⏭ 跳过</button>
          <button class="btn btn-pri" @click="closeGuide()">✅ 知道了，开始用</button>
        </div>
      </div>
    </div>


    <!-- 背景音乐浮动控件（只在「看板」界面显示，其余界面隐藏避免干扰） -->
    <div v-if="store.tab === 'ck' && !uiHiddenOf('music')" class="music-float" :class="{ on: musicOn }" :style="floatStyle('music')" title="背景音乐（仅看板界面显示）" @pointerdown="startFloatDrag($event, 'music')">
      <span class="mf-ic" @click.stop="floatClick('music')">{{ musicOn ? '🎵' : '🔇' }}</span>
      <span class="mf-name" @click.stop="floatClick('music')">{{ musicOn && musicList[musicIndex] ? musicList[musicIndex].name : '背景音乐' }}</span>
      <button class="mf-more" :class="{ open: musicPanel }" :title="musicPanel ? '收起控制面板' : '展开控制面板（上/下一曲·暂停播放·关闭打开）'" @click.stop="toggleMusicPanel()" @pointerdown.stop>{{ musicPanel ? '▾' : '▴' }}</button>
    </div>
    <!-- 背景音乐二级控制面板 -->
    <Transition name="hud">
      <div v-if="musicPanel" class="music-panel" :style="musicPanelStyle">
        <div class="mp-head">
          <span class="mp-title">🎵 背景音乐</span>
          <span class="mp-status">{{ musicStatus || (musicOn ? '播放中 · ' + (musicList[musicIndex] ? musicList[musicIndex].name : '') : '已暂停') }}</span>
          <button class="pc-close" @click="musicPanel = false">✕</button>
        </div>
        <div class="mp-ctrl">
          <button class="mp-btn" title="上一曲" @click="prevTrack()">⏮</button>
          <button class="mp-btn mp-big" :title="musicOn ? '暂停播放' : '播放'" @click="toggleMusic()">{{ musicOn ? '⏸' : '▶' }}</button>
          <button class="mp-btn" title="下一曲" @click="nextTrack()">⏭</button>
          <button class="mp-btn" :class="{ on: musicLoop }" title="循环播放" @click="setLoop(!musicLoop)">🔁</button>
          <button class="mp-btn" :class="{ off: !musicOn }" :title="musicOn ? '关闭音乐' : '打开音乐'" @click="toggleMusicPower()">{{ musicOn ? '🔊' : '🔇' }}</button>
        </div>
        <div class="mp-vol">
          <span>🔉</span>
          <input type="range" min="0" max="1" step="0.05" :value="musicVol" @input="setVolume(Number($event.target.value))" />
          <span class="mp-vol-n">{{ Math.round(musicVol * 100) }}%</span>
        </div>
        <div class="music-list">
          <div v-for="(m, i) in musicList" :key="m.url" class="music-item" :class="{ on: musicOn && musicIndex === i }" @click="musicIndex === i && musicOn ? toggleMusic() : playTrack(i)">
            <span class="music-name">{{ m.name }}</span>
            <span v-if="m.builtin" class="music-tag">内置</span>
            <span v-else-if="m.from" class="music-tag">{{ m.from }}</span>
            <span v-else class="music-tag">自定义</span>
            <button v-if="!m.builtin" class="pp-x" title="移除" @click.stop="removeMusic(i)">×</button>
          </div>
        </div>
        <div class="mp-add">
          <input v-model="musicUrl" placeholder="粘贴音频直链（mp3）" @keydown.enter="doAddMusicUrl()" />
          <button class="btn btn-gh" title="添加直链" @click="doAddMusicUrl()">➕</button>
          <button class="btn btn-gh" title="添加本地音频" @click="musicFileBtn && musicFileBtn.click()">📁</button>
          <input ref="musicFileBtn" type="file" accept="audio/*" style="display:none" @change="addMusicLocal" />
        </div>
      </div>
    </Transition>
    <!-- 萌宠 -->
    <div v-if="!uiHiddenOf('pet')" class="pet-float" :style="floatStyle('pet')" title="我的萌宠：点击互动 · 按住可拖动" @click="floatClick('pet')" @pointerdown="startFloatDrag($event, 'pet')">
      <div v-if="bubble && !petMuted" class="pet-bubble">{{ bubble }}</div>
      <PetAvatar :size="40" class="pet-emoji-av" />
      <span class="pet-mood">{{ petMood.emoji }}</span>
      <div class="pet-act" @click.stop @pointerdown.stop>
        <button class="pa-btn" title="朗读当前页面内容（题干/错题等）" @click="petReadCurrent()">🔊</button>
        <button class="pa-btn" :title="'朗读倍速：' + Math.round((store.cfg.ttsRate || 1) * 100) + '%（点击切换）'" @click="petNextSpeed()">⏱</button>
        <button class="pa-btn" title="停止朗读" @click="petStop()">⏹</button>
      </div>
    </div>
        <!-- 萌宠智能助理面板（可拖拽小窗 · 不遮题） -->
    <div v-if="petShow && !uiHiddenOf('pet')" class="pet-panel" :style="petPanelStyle">
      <div class="pp-head" title="按住可拖动到题目旁边" @pointerdown="startFloatDrag($event, 'pp')">
        <PetAvatar :size="46" />
        <div class="pet-id">
          <div class="pet-name">{{ pet.name }} <span class="pet-lv">Lv.{{ petLevel }} · {{ petStage.name }}</span></div>
          <div class="pet-moodline">{{ petMood.emoji }} {{ petMood.label }} · 饱食 {{ petHunger }}/10 · {{ petPoints }}分</div>
        </div>
        <button class="pc-close" :title="petCollapsed ? '展开' : '折叠'" @pointerdown.stop @click="petCollapsed = !petCollapsed">{{ petCollapsed ? '▢' : '▁' }}</button>
        <button class="pc-close" title="关闭" @pointerdown.stop @click="petShow = false">✕</button>
      </div>
      <div v-if="!petCollapsed" class="pp-body">
        <div class="pp-ctx">
          <span class="pp-ctx-chip pp-see">👀 {{ petSeeLabel }}</span>
          <span class="pp-ctx-chip">💬 {{ petStats.asks }}问</span>
          <span class="pp-ctx-chip">📋 {{ petStats.wrongs }}错</span>
          <span class="pp-ctx-chip">🔥 {{ petStats.streak }}天</span>
        </div>
        <div class="pp-acts">
          <button class="btn btn-gh pp-act" @click="petReadCurrent()">🔊 读题</button>
          <button class="btn btn-gh pp-act" @click="petAnalyzeCurrent()">🧠 错因</button>
          <button class="btn btn-gh pp-act" @click="petNextSpeed()">⏱ {{ Math.round((store.cfg.ttsRate || 1) * 100) }}%</button>
          <button class="btn btn-gh pp-act" @click="doPetAsk('给我安排今天的高效学习计划')">📋 计划</button>
          <button class="btn btn-gh pp-act" @click="doPetAsk('根据我的学习数据，告诉我目前强弱项和下一步建议')">📊 概况</button>
          <button class="btn btn-gh pp-act" @click="skinShow = !skinShow">🎭 {{ skinShow ? '收起' : '换装' }}</button>
        </div>
        <div v-if="skinShow" class="pp-skins">
          <div class="pv-title">🎭 角色皮肤（🔒 内置锁定 · 🧬 克隆原声 · ➕ 新增自定义）</div>
          <div class="skin-grid">
            <button v-for="s in petAllSkins" :key="s.id" class="skin-card" :class="{ on: petSkin.id === s.id }" @click="applySkin(s.id)">
              <PetAvatar :size="40" :skin-id="s.id" class="skin-av" />
              <span class="skin-name">{{ s.char }}<span v-if="petSkinVoiceOf(s.id).cloned" style="margin-left: 2px" title="克隆原声">🧬</span><span v-if="petIsLocked(s.id)" style="margin-left: 2px" title="内置锁定">🔒</span></span>
              <span class="skin-desc">{{ s.desc }}</span>
              <span v-if="s.custom && s.id !== 'custom'" style="display:flex; gap:4px; justify-content:center; margin-top:2px">
                <span style="cursor:pointer" title="删除" @click.stop="doRemoveCustom(s.id)">🗑</span>
              </span>
            </button>
            <button class="skin-card skin-add" @click="doAddCustom()">
              <span class="skin-name" style="font-size: 20px">➕</span>
              <span class="skin-name">新增自定义</span>
            </button>
          </div>
          <div style="font-size: 11px; color: var(--text3); margin-top: 4px">薛神/章若楠/李星云/姬如雪为内置锁定角色（形象+克隆原声不可改）；自定义角色可自由设置名字/人设/形象/声线，想加几个加几个（去 设置→萌宠 编辑）。</div>
        </div>
        <div v-if="bubble && !petMuted" class="pet-talk pp-talk">{{ bubble }}</div>
        <div class="pc-list pp-list">
          <div v-for="(m, i) in petChat" :key="i" class="pc-msg" :class="m.role">
            <span class="pc-who"><PetAvatar v-if="m.role === 'pet'" :size="22" /><span v-else>🙂</span></span>
            <span class="pc-txt">{{ m.text }}</span>
          </div>
          <div v-if="petChatBusy" class="pc-msg pet"><span class="pc-who"><PetAvatar :size="22" /></span><span class="pc-txt">正在思考…</span></div>
        </div>
        <div class="pc-input-row pp-input">
          <input v-model="petAskText" placeholder="问萌宠：这道题怎么解？掉什么坑？今天学什么？" style="flex: 1" @keydown.enter="doPetAsk()" />
          <button class="btn btn-gh" style="font-size: 12px" title="发送图片（视觉模型识别）" @click="$refs.petImgChatInput.click()">📷</button>
          <input ref="petImgChatInput" type="file" accept="image/*" style="display: none" @change="onPetImgChat($event)" />
          <button class="btn btn-gh" style="font-size: 12px" title="语音输入（说问题转文字）" @click="petMic()">🎤</button>
          <button class="btn btn-pri" style="font-size: 12px; white-space: nowrap" :disabled="petChatBusy" @click="doPetAsk()">发送</button>
          <button class="btn btn-gh" style="font-size: 12px" :title="petSpeakReply ? '回复将用真人音色朗读' : '回复已静音'" @click="petSpeakReply = !petSpeakReply">{{ petSpeakReply ? '🔊' : '🔇' }}</button>
        </div>
        <div class="pp-foot">
          <button class="btn btn-gh" style="font-size: 11px" @click="patPet()">🐾 摸头</button>
          <button class="btn btn-gh" style="font-size: 11px" @click="doFeed()">🍖 喂食</button>
          <button class="btn btn-gh" style="font-size: 11px" @click="petRenameToggle = !petRenameToggle">✏️ 改名</button>
          <button class="btn btn-gh" style="font-size: 11px" @click="petCollapsed = true">▁ 收起</button>
        </div>
        <div v-if="petRenameToggle" class="pet-rename pp-rename">
          <input v-model="petNameInput" :placeholder="'给 ' + pet.name + ' 改名…'" style="flex:1" @keydown.enter="doRename()" />
          <button class="btn btn-gh" @click="doRename()">确定</button>
        </div>
      </div>
    </div>

<!-- 设置引导浮窗 -->
    <div v-if="tourShow" class="tour-float">
      <template v-if="!tourFold">
        <div class="tour-hd">
          <span class="tour-t">{{ SET_GUIDE[tourI].t }}</span>
          <span class="tour-prog">{{ tourI + 1 }}/{{ SET_GUIDE.length }}</span>
        </div>
        <div class="tour-d">{{ SET_GUIDE[tourI].d }}</div>
        <div class="tour-tips">💡 {{ SET_GUIDE[tourI].tips }}</div>
        <div class="tour-btns">
          <button class="btn btn-gh" @click="tourShow = false">关闭</button>
          <button class="btn btn-gh" @click="tourFold = true">▾ 收起</button>
          <button class="btn btn-gh" :disabled="tourI === 0" @click="tourPrev()">◀ 上一条</button>
          <button class="btn btn-pri" @click="tourNext()">{{ tourI < SET_GUIDE.length - 1 ? '下一条 ▶' : '完成 ✅' }}</button>
        </div>
      </template>
      <div v-else class="tour-fold">
        <span>❓ 设置引导（{{ tourI + 1 }}/{{ SET_GUIDE.length }}：{{ SET_GUIDE[tourI].t }}）</span>
        <button class="btn btn-gh" @click="tourFold = false">▴ 展开</button>
        <button class="btn btn-gh" @click="tourShow = false">✕ 关闭</button>
      </div>
    </div>

    <!-- 多考试倒计时管理弹窗（v3.8.69） -->
    <ExamManager />
</template>
