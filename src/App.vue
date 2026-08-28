<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { store, saveCfg, saveWqs, saveMsgs, saveMyMem, saveNotes } from './store'
import { speak, stopSpeak, SCENES, getAllVoices, onVoicesReady, TTS_ENGINES, GLM_PRESET_VOICES, EDGE_PRESET_VOICES, OPENAI_PRESET_VOICES, listGmVoices, listEdgeVoices, previewVoice, copyFigKeyToTts, ttsStatus, cloneCosyVoice, cloneZhipuVoice, prepareCloneAudio } from './utils/tts'
import { PLATE_MODE } from './api'
import { FIG_PROVIDERS, fillFigProvPreset, testFigConn } from './api/figEnhance'
import ChatPage from './components/ChatPage.vue'
import KbPage from './components/KbPage.vue'
import StatsPage from './components/StatsPage.vue'
import WrongPage from './components/WrongPage.vue'
import CockpitPage from './components/CockpitPage.vue'
import DraftPad from './components/DraftPad.vue'
import FloatPanel from './components/FloatPanel.vue'
import ExamBar from './components/ExamBar.vue'
import CosmosScene from './components/CosmosScene.vue'
import PetAvatar from './components/PetAvatar.vue'
import Data3DPage from './components/Data3DPage.vue'
import { doExport, exportWrongTxt, exportDataMd, exportWrongMd, parseMarkdownNotes } from './utils/export'
import { showToast } from './utils/toast'
import { getErrorLog, clearErrorLog } from './utils/errorLog'
import { APP_VERSION } from './version'
import { startStudyTrack, stopStudyTrack } from './utils/study'
import { nav, navBack, syncNavFromHistory } from './utils/nav'
import { webdavUpload, webdavDownload } from './utils/webdav'
import { pickDataFolder, saveAllDataToFolder, getFolderName } from './utils/localData'
import { musicOn, musicVol, musicLoop, musicIndex, musicList, musicStatus, playTrack, toggleMusic, prevTrack, nextTrack, setVolume, setLoop, addMusicUrl, addMusicFile, removeMusic, importNetEase, pauseAll } from './utils/music'
import { pet, petShow, petMuted, bubble, petStats, petStage, petLevel, petHunger, petMood, petPoints, petSpeak, feedPet, patPet, renamePet, setPetMuted, petStop, petReadCurrent, petNextSpeed, petAnalyzeCurrent, petChat, petChatBusy, petSpeakReply, petAsk, petAllSkins, petSkin, applyPetSkin, petImg, setPetImg, clearPetImg, petSkinVoiceOf, petBindCloneVoice, petUnbindCloneVoice, petBoundVoices, petGlobalVoice, savePetGlobalVoice, petCustomData, petIsLocked, petAddCustomSkin, petRemoveCustomSkin, petPersistName } from './utils/pet'
const tabs = [
  { k: 'ck', t: '🚀 看板' },
  { k: 'chat', t: '💬 对话' },
  { k: 'kb', t: '📚 知识库' },
  { k: 'ths', t: '🗂️ 积累' },
  { k: 'stat', t: '📊 统计' },
  { k: 'wq', t: '📋 错题' },
  { k: '3d', t: '🌌 3D数据' }
]
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
  const r = e.currentTarget.getBoundingClientRect()
  const ox = startX - r.left, oy = startY - r.top
  let moved = false
  const onMove = (ev) => {
    const x = ev.clientX - ox, y = ev.clientY - oy
    if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 6) moved = true
    gFab.value = { x: Math.max(4, Math.min(window.innerWidth - 56, x)), y: Math.max(4, Math.min(window.innerHeight - 60, y)) }
    try { localStorage.setItem('xc_global_fab', JSON.stringify(gFab.value)) } catch (e) {}
  }
  const onUp = () => {
    window.removeEventListener('pointermove', onMove, true)
    window.removeEventListener('pointerup', onUp, true)
    if (!moved) globalDraft.value = true
  }
  window.addEventListener('pointermove', onMove, true)
  window.addEventListener('pointerup', onUp, true)
}
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
  'dark-red': { name: '暗红夜', theme: 'dark', vars: { bg: '#180a10', card: '#261219', surface: '#351a22', text: '#ffe9ee', text2: '#e0a9b6', text3: '#c0808f', accent: '#f87171', accent2: 'rgba(248,113,113,.16)', red: '#f87171', green: '#4ade80', amber: '#fbbf24' } },
  light:      { name: '米白纸', theme: 'light', vars: { bg: '#eef4fa', card: '#ffffff', surface: '#dbe6f0', text: '#000000', text2: '#1f2937', text3: '#374151', accent: '#0b5a8a', accent2: 'rgba(3,105,161,.1)', red: '#b91c1c', green: '#15803d', amber: '#b45309' } },
  'light-green': { name: '护眼绿白', theme: 'light', vars: { bg: '#e9f3ea', card: '#ffffff', surface: '#d3e8d6', text: '#122014', text2: '#2b4030', text3: '#47604d', accent: '#0e7a3d', accent2: 'rgba(14,122,61,.12)', red: '#b3261e', green: '#0e7a3d', amber: '#92600a' } },
  'light-red':{ name: '红白公务', theme: 'light', vars: { bg: '#f7eef0', card: '#ffffff', surface: '#eed8dc', text: '#1a0b0d', text2: '#3d2328', text3: '#5c3a40', accent: '#b02a2a', accent2: 'rgba(176,42,42,.1)', red: '#b02a2a', green: '#15803d', amber: '#b45309' } },
  cream:      { name: '暖黄纸', theme: 'light', vars: { bg: '#f6f1e3', card: '#fffdf6', surface: '#ece2c8', text: '#201a0c', text2: '#453a20', text3: '#655a3a', accent: '#9a6b1f', accent2: 'rgba(154,107,31,.12)', red: '#b3261e', green: '#2f7d32', amber: '#b45309' } },
  eye:        { name: '护眼柔绿', theme: 'dark', vars: { bg: '#0d1f16', card: '#12291d', surface: '#183326', text: '#e2f5e8', text2: '#a8cbb4', text3: '#83a892', accent: '#4ade80', accent2: 'rgba(74,222,128,.16)', red: '#fb7185', green: '#4ade80', amber: '#fbbf24' } }
}
const themePreset = ref(localStorage.getItem('xc_theme_preset') || 'dark')
function applyThemePreset(k) {
  const p = THEME_PRESETS[k] || THEME_PRESETS.dark
  themePreset.value = k
  try { localStorage.setItem('xc_theme_preset', k) } catch (e) {}
  theme.value = p.theme
  document.body.setAttribute('data-theme', p.theme)
  const el = document.body
  for (const v in p.vars) { try { el.style.setProperty('--' + v, p.vars[v]) } catch (e) {} }
}
applyThemePreset(themePreset.value)
// 3D 学习数据驾驶舱已独立为「🌌 3D数据」页签；背景 3D 可在设置里开关
function doTheme() {
  const isDark = themePreset.value && THEME_PRESETS[themePreset.value] ? THEME_PRESETS[themePreset.value].theme === 'dark' : true
  applyThemePreset(isDark ? 'light' : 'dark')
}
// 多强调色主题
const accent = ref(localStorage.getItem('xc_accent') || 'sea')
document.body.setAttribute('data-accent', accent.value)
document.body.setAttribute('data-eye', store.cfg.eyeMode || 'normal')
document.body.setAttribute('data-hl', store.cfg.hl ? '1' : '0')
document.body.setAttribute('data-tm', store.cfg.themeMode || 'default')
function setAccent(a) {
  accent.value = a
  document.body.setAttribute('data-accent', a)
  localStorage.setItem('xc_accent', a)
}
function setEyeMode(m) {
  store.cfg.eyeMode = m
  document.body.setAttribute('data-eye', m)
  saveCfg()
}
function setHl(v) {
  store.cfg.hl = !!v
  document.body.setAttribute('data-hl', store.cfg.hl ? '1' : '0')
  saveCfg()
}
function setThemeMode(m) {
  store.cfg.themeMode = m
  document.body.setAttribute('data-tm', m)
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
const setShow = ref(false)
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
  try {
    if (fmt === 'md') {
      exportDataMd(expType.value)
    } else {
      await doExport(expType.value, fmt, polish)
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
try {
  const mp = JSON.parse(localStorage.getItem('xc_music_pos') || 'null')
  const pp = JSON.parse(localStorage.getItem('xc_pet_pos') || 'null')
  if (mp && typeof mp.x === 'number') musicPos.value = mp
  if (pp && typeof pp.x === 'number') petPos.value = pp
  const ppp = JSON.parse(localStorage.getItem('xc_pet_panel_pos') || 'null')
  if (ppp && typeof ppp.x === 'number') petPanelPos.value = ppp
} catch (e) {}
// 位置记忆夹回视口（防止窗口变小/分辨率变化后浮窗跑到屏幕外）
function clampFloatPos() {
  const vw = window.innerWidth, vh = window.innerHeight
  const clamp = (pos, w, h) => {
    if (!pos) return pos
    return { x: Math.max(4, Math.min(vw - w - 4, pos.x || 4)), y: Math.max(4, Math.min(vh - h - 4, pos.y || 4)) }
  }
  petPos.value = clamp(petPos.value, 54, 54)
  musicPos.value = clamp(musicPos.value, 54, 54)
  petPanelPos.value = clamp(petPanelPos.value, 358, 520)
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
  if (!p) return {}
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
  x = Math.max(4, Math.min(window.innerWidth - el.offsetWidth - 4, x))
  y = Math.max(4, Math.min(window.innerHeight - el.offsetHeight - 4, y))
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
    localStorage.setItem('xc_music_pos', JSON.stringify(musicPos.value))
    localStorage.setItem('xc_pet_pos', JSON.stringify(petPos.value))
    localStorage.setItem('xc_pet_panel_pos', JSON.stringify(petPanelPos.value))
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
  if (f.k === 'exam') { store.tab = 'chat'; setTimeout(() => window.dispatchEvent(new CustomEvent('xc-open-exam')), 60); return }
  if (f.k === 'paper') { store.tab = 'chat'; setTimeout(() => window.dispatchEvent(new CustomEvent('xc-open-paper')), 60); return }
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
  { id: 'set-api', t: '💬 文字模型', d: '纯文字题的 AI 大脑：选提供商、填 API Key、地址与模型名。', tips: '推荐 DeepSeek（便宜中文好）；点「🔑 如何获取 API Key」看教程；填完点底部「保存并测试」验证。' },
  { id: 'set-vision', t: '👁️ 视觉模型', d: '图片/截图题的 AI 大脑（图推图形、资料表格、数学公式）。', tips: 'DeepSeek 可用同一个 Key（deepseek-v4-flash-vision-exp）；不配则发图题无法识别。' },
  { id: 'set-fig', t: '🖼 图形理解增强（可选）', d: '用独立的开源视觉模型把题目截图复刻成图贴进回复，辅助看懂图推/几何/表格题。', tips: '可选功能，不配置完全不影响现有功能；推荐硅基流动免费额度或 Ollama 本地。' },
  { id: 'set-voice', t: '🗣️ 语音朗读', d: 'AI 讲解的朗读：场景音色、语速、音调、本机语音。', tips: '先「试听」选喜欢的；本机语音列表可覆盖场景音色。' },
  { id: 'set-look', t: '🎨 外观', d: '强调色、护眼模式、高亮、红黑局长风主题、字体大小、3D背景、壁纸。', tips: '白天/黑夜各自独立配色；红黑主题只做红色点缀不动字体主色。' },
  { id: 'set-bg', t: '🖼️ 背景', d: '主界面背景：默认 / 纯色 8 种 / 图片壁纸 + 模糊 + 在线自动轮换。', tips: '图片支持 png/jpg/webp/gif；在线壁纸每 5 分钟换一张，可随时关。' },
  { id: 'set-data', t: '💾 数据', d: '备份/导入/清空、保存到本地文件夹、WebDAV 云同步、导入笔记、时政时间范围。', tips: '数据只存本机；换设备用导出/导入或 WebDAV。' },
  { id: 'set-help', t: '🧭 帮助', d: '六步学习闭环、快捷键、常见问题、新手引导开关。', tips: '考前把快捷键和闭环过一遍；引导可一键全关或重开。' },
  { id: 'set-about', t: '📜 关于', d: '免责声明与开发者说明。', tips: '仅供个人学习使用，切勿商用；隐私与开发者信息见此处。' }
]
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
const setNav = [
  { id: 'set-api', t: 'API' },
  { id: 'set-look', t: '外观' },
  { id: 'set-voice', t: '语音' },
  { id: 'set-bg', t: '背景' },
  { id: 'set-data', t: '数据' },
  { id: 'set-help', t: '帮助' },
  { id: 'set-about', t: '关于' }
]
// ===== 设置分组手风琴：把超长设置面板分成 4 组，点击标题展开/收起 =====
const SEC_GROUP = {
  'set-api': 'model', 'set-vision': 'model', 'set-fig': 'model', 'set-voice': 'model',
  'set-look': 'look', 'set-bg': 'look',
  'set-data': 'fun',
  'set-help': 'help', 'set-about': 'help'
}
const chatFastModel = ref(localStorage.getItem('xc_chat_fast_model') || '')
function saveChatFastModel() { try { localStorage.setItem('xc_chat_fast_model', String(chatFastModel.value || '').trim()) } catch (e) {} }
const setGroup = ref('model')
function toggleSetGroup(k) { setGroup.value = setGroup.value === k ? '' : k }
function scrollSet(id) {
  const g = SEC_GROUP[id]
  if (g) setGroup.value = g
  setTimeout(() => {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, 60)
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
    voiceCloneStat.value = '⏳ 已转码为 WAV（' + pre.seconds + ' 秒' + (pre.sliced ? '，已裁剪' : '') + '），正在上传并克隆（约 10-40 秒）…'
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
    voiceCloneStat.value = '✅ 大模型克隆成功！「' + r.name + '」已绑定给『' + petSkin.value.char + '』并启用（引擎：' + (cloneBackend.value === 'zhipu' ? '智谱 GLM-TTS-Clone' : 'CosyVoice2') + '）。以后切到这个角色就会用这个克隆原声。'
    showToast('🧬 克隆成功：' + r.name + ' → ' + petSkin.value.char, 'success')
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
  if (ok) { applySkin('lixingyun'); showToast('🗑 已删除该自定义角色', 'info') }
  else showToast('该角色不可删除', 'error')
}
function doPetAsk(preset) {
  if (preset) petAskText.value = preset
  const t = String(petAskText.value || '').trim()
  if (!t || petChatBusy.value) return
  petAskText.value = ''
  petAsk(t)
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
// ===== 全部用户数据一键导出 / 导入（跨设备/防丢失） =====
function exportAllData() {
  const all = {}
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith('xc_')) { try { all[k] = localStorage.getItem(k) } catch (e) {} }
  }
  const blob = new Blob([JSON.stringify({ app: 'xingce', v: 2, t: Date.now(), data: all }, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  const d = new Date()
  a.download = '行测助手-全部数据备份-' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + '.json'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
  showToast('✅ 已导出全部数据（含设置/错题/对话/出题集/草稿/宠物等）', 'success')
}
function importAllData(ev) {
  const f = ev.target.files && ev.target.files[0]
  if (!f) return
  const rd = new FileReader()
  rd.onload = () => {
    try {
      const d = JSON.parse(rd.result)
      let items = null
      if (d && d.data && (d.v === 2 || d.app === 'xingce')) items = d.data
      else if (d && typeof d === 'object') items = d // 兼容旧格式（key->value）
      let n = 0
      for (const k in items) {
        if (k.startsWith('xc_')) { try { localStorage.setItem(k, items[k]); n++ } catch (e) {} }
      }
      showToast('✅ 已导入 ' + n + ' 项数据，即将刷新', 'success')
      setTimeout(() => location.reload(), 900)
    } catch (e) { showToast('❌ 备份文件无效', 'error') }
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
    if (!d || !d.app) throw new Error('备份文件格式不对')
    store.cfg = Object.assign(store.cfg, d.cfg || {})
    store.msgs = (d.msgs || []).slice(-200)
    store.wqs = d.wqs || []
    store.myMem = d.myMem || []
    store.notes = d.notes || []
    saveCfg()
    saveMsgs()
    saveWqs()
    saveMyMem()
    saveNotes()
    wdStat.value = '✅ 已恢复备份（' + (d.ts ? new Date(d.ts).toLocaleString() : '') + '）'
    showToast('☁️ 已从 WebDAV 恢复备份', 'success')
  } catch (e) {
    wdStat.value = '❌ ' + e.message
  } finally {
    wdBusy.value = false
  }
}


function resetAll() {
  if (!confirm('确认清空所有本地数据（设置/错题/对话）？此操作不可恢复')) return
  localStorage.clear()
  location.reload()
}
// 提供商预设：切换提供商自动填 url/model（含 DeepSeek 视觉模型，OpenAI 兼容格式）
function fillProv(kind) {
  const ps = {
    ds: { url: 'https://api.deepseek.com/chat/completions', model: 'deepseek-v4-flash' },
    zhipu: { url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-5v-turbo' },
    openai: { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o' },
    qwen: { url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-vl-max' },
    custom: { url: '', model: '' }
  }
  const p = store.cfg[kind].prov,
    pre = ps[p] || ps.custom
  if (kind === 'vision' && p === 'ds') {
    store.cfg[kind].url = 'https://api.deepseek.com/chat/completions'
    store.cfg[kind].model = 'deepseek-v4-flash-vision-exp'
    return
  }
  store.cfg[kind].url = pre.url
  store.cfg[kind].model = pre.model
}
// ===== 图形理解增强（可选·独立模型）=====
const figTestStat = ref('')
function fillFig() {
  const pre = fillFigProvPreset(store.cfg.fig.prov)
  store.cfg.fig.url = pre.url
  store.cfg.fig.model = pre.model
  saveCfg()
}
async function figTest() {
  const c = store.cfg.fig
  if (!c || !c.url || !c.model) { figTestStat.value = '先填 API 地址与模型名称'; return }
  figTestStat.value = '检测中…'
  const r = await testFigConn(c)
  figTestStat.value = r.ok === true ? '✅ 连通正常' : r.ok === false ? '❌ ' + (r.msg || '连接失败') : '未配置'
  if (r.ok === true) showToast('✅ 图形增强模型连通正常', 'success')
  else if (r.ok === false) showToast('❌ 图形增强模型连接失败：' + (r.msg || ''), 'error')
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
  <CosmosScene v-if="store.cfg.view3d && store.tab !== 'kb' && store.tab !== '3d'" :active-tab="store.tab" />
  <div v-if="wallStyle" class="bg-layer" :style="wallStyle"></div>
<div class="app" :class="{ 'is-2d': !store.cfg.view3d, 'has-wall': wallStyle }">
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
      <div style="display: flex; align-items: center; gap: 6px">
        <div class="status-pill">
          <div class="dot" :class="stDot"></div>
          <span>{{ stStat }}</span>
        </div>
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
    </header>
    <ExamBar />
    <nav class="tabs">
      <button v-for="t in tabs" :key="t.k" class="tab" :class="{ on: store.tab === t.k }" @click="goTab(t.k)">
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
    <!-- 设置弹窗 -->
    <div class="ov" :class="{ show: setShow }" @click.self="setShow = false">
      <div class="pnl">
        <div class="pnl-top">
          <button class="pnl-top-b" title="返回上一层（也可按 Esc / 浏览器返回）" @click="setShow = false">← 返回</button>
          <span class="pnl-top-t">⚙️ 设置（API / 朗读 / 外观 / 数据）</span>
        </div>
        <div class="set-nav">
          <button v-for="n in setNav" :key="n.id" class="set-nav-b" @click="scrollSet(n.id)">{{ n.t }}</button>
        </div>
        <button class="btn btn-gh set-tour-btn" @click="openTour()">❓ 设置引导（逐项讲解）</button>
        <button class="set-group-hd" :class="{ on: setGroup === 'model' }" @click="toggleSetGroup('model')"><span>⚙️ 模型与语音（API / 朗读）</span><span class="sg-arrow">{{ setGroup === 'model' ? '▾' : '▸' }}</span></button>
<div v-show="setGroup === 'model'" class="set-group-bd">
<div id="set-api" class="sec-t">💬 文字模型（纯文字题 · 推荐 DeepSeek）</div>
        <div class="fld">
          <label>提供商</label>
          <select v-model="store.cfg.text.prov" @change="fillProv('text')">
            <option value="ds">DeepSeek (纯文本·便宜)</option>
            <option value="zhipu">智谱 GLM-4.6V (视觉)</option>
            <option value="openai">OpenAI GPT-4o (视觉)</option>
            <option value="qwen">通义 Qwen-VL (视觉)</option>
            <option value="custom">自定义 API</option>
          </select>
        </div>
        <div class="fld">
          <label>API Key</label>
          <input v-model="store.cfg.text.key" placeholder="sk-..." type="text" />
        </div>
        <div class="fld">
          <label>API 地址</label>
          <input v-model="store.cfg.text.url" />
        </div>
        <div class="fld">
          <label>模型名称</label>
          <input v-model="store.cfg.text.model" />
        </div>
        <div class="fld">
          <label>🚀 对话快模型（提速，强烈建议）</label>
          <input v-model="chatFastModel" placeholder="留空=跟随文字模型（思考模型较慢）；填 deepseek-chat 等非思考模型名，对话回复不再长时间思考、秒出答案（需与文字模型同一服务商/Key）" @change="saveChatFastModel()" />
          <span class="ep-hint">DeepSeek 思考模型(v4-flash)答一道题常思考 1 分钟以上；填 deepseek-chat 后文字/图推题秒回。图片题若快模型不能识图，会自动用「图形增强」读图后交给快模型作答。</span>
        </div>
        <details class="guide">
          <summary>🔑 如何获取 API Key（点开看详细教程）</summary>
          <div class="guide-body">
            <p>① 到对应平台注册并创建 API Key：</p>
            <ul>
              <li><b>DeepSeek（推荐，便宜中文好）</b>：<a href="https://platform.deepseek.com/" target="_blank" rel="noopener">platform.deepseek.com</a> → 登录 → API Keys → 创建 Key</li>
              <li><b>智谱 GLM</b>：<a href="https://open.bigmodel.cn/" target="_blank" rel="noopener">open.bigmodel.cn</a> → API Keys → 创建（新用户有免费额度）</li>
              <li><b>OpenAI</b>：<a href="https://platform.openai.com/" target="_blank" rel="noopener">platform.openai.com</a> → API keys</li>
              <li><b>通义千问</b>：<a href="https://dashscope.aliyun.com/" target="_blank" rel="noopener">dashscope.aliyun.com</a> → API-KEY 管理</li>
            </ul>
            <p>② 把生成的 Key（形如 sk-…）粘贴到上方「API Key」输入框；</p>
            <p>③ 点本弹窗底部「保存并测试」，顶部状态灯显示 <b>文字✅ 视觉✅</b> 即配置成功。</p>
            <p>💡 Key 只保存在你自己浏览器的 localStorage，本应用无后端，不会上传到任何服务器。</p>
          </div>
        </details>


        <div id="set-vision" class="sec-t">👁️ 视觉模型（图片/截图题 · 默认 DeepSeek 视觉，可选智谱 GLM-5V / 通义 Qwen-VL）</div>
        <div class="vis-tip">
          📌
          <b>截图/图片题必须配此模型才能看图</b>（图推图形、资料表格、数学公式）。启用步骤：①提供商选「DeepSeek（推荐，用同一个 Key，deepseek-v4-flash-vision-exp）」或「智谱 / 通义」②粘贴 Key ③点下方「保存并测试」。若发图仍无法识别，可到「图形增强」配免费视觉模型兜底。
        </div>
        <div class="fld">
          <label>提供商</label>
          <select v-model="store.cfg.vision.prov" @change="fillProv('vision')">
            <option value="ds">DeepSeek (视觉·deepseek-v4-flash-vision-exp·推荐)</option>
            <option value="zhipu">智谱 GLM-5V (视觉·glm-5v-turbo)</option>
            <option value="openai">OpenAI GPT-4o (视觉)</option>
            <option value="qwen">通义 Qwen-VL (视觉)</option>
            <option value="custom">自定义 API</option>
          </select>
        </div>
        <div class="fld">
          <label>API Key</label>
          <input
            v-model="store.cfg.vision.key"
            type="text"
            placeholder="粘贴视觉模型的 Key（DeepSeek 用 DeepSeek Key）"
          />
        </div>
        <div class="fld">
          <label>API 地址</label>
          <input v-model="store.cfg.vision.url" />
        </div>
        <div class="fld">
          <label>模型名称</label>
          <input v-model="store.cfg.vision.model" />
        </div>
        <div class="fld">
          <label>自定义 System Prompt（留空用内置知识库）</label>
          <textarea v-model="store.cfg.sys" rows="3"></textarea>
        </div>
        <div class="fld">
          <label>
            <input v-model="store.cfg.kb" type="checkbox" />
            启用内置知识库增强
          </label>
        </div>
        <div class="fld">
          <label>
            <input v-model="store.cfg.strm" type="checkbox" />
            流式输出
          </label>
        </div>
        <div class="fld">
          <label>
            <input v-model="store.cfg.ttsOn" type="checkbox" />
            🔊 自动朗读 AI 回复
          </label>
        </div>
        <details class="guide">
          <summary>🔑 如何获取 API Key（点开看详细教程）</summary>
          <div class="guide-body">
            <p>① 到对应平台注册并创建 API Key：</p>
            <ul>
              <li><b>DeepSeek（推荐，便宜中文好）</b>：<a href="https://platform.deepseek.com/" target="_blank" rel="noopener">platform.deepseek.com</a> → 登录 → API Keys → 创建 Key</li>
              <li><b>智谱 GLM</b>：<a href="https://open.bigmodel.cn/" target="_blank" rel="noopener">open.bigmodel.cn</a> → API Keys → 创建（新用户有免费额度）</li>
              <li><b>OpenAI</b>：<a href="https://platform.openai.com/" target="_blank" rel="noopener">platform.openai.com</a> → API keys</li>
              <li><b>通义千问</b>：<a href="https://dashscope.aliyun.com/" target="_blank" rel="noopener">dashscope.aliyun.com</a> → API-KEY 管理</li>
            </ul>
            <p>② 把生成的 Key（形如 sk-…）粘贴到上方「API Key」输入框；</p>
            <p>③ 点本弹窗底部「保存并测试」，顶部状态灯显示 <b>文字✅ 视觉✅</b> 即配置成功。</p>
            <p>💡 Key 只保存在你自己浏览器的 localStorage，本应用无后端，不会上传到任何服务器。</p>
          </div>
        </details>


        <div id="set-fig" class="sec-t">🖼 图形理解增强（可选 · 独立开源模型 · 不影响上方文字/视觉模型）</div>
        <div class="vis-tip">
          📌
          <b>可选项</b>：发图问 图形推理 / 数量关系几何 / 资料分析图表 时，用这个
          <b>独立的开源视觉模型</b> 把截图复刻成图贴进回复，帮你"看懂原图"。
          不配置完全不影响现有功能；主问答仍走上方文字/视觉模型，互不干扰。
        </div>
        <div class="fld">
          <label>
            <input v-model="store.cfg.fig.on" type="checkbox" @change="saveCfg()" />
            启用图形理解增强（发图后自动把原图复刻成图附在回复里）
          </label>
        </div>
        <div class="fld">
          <label>提供商（开源模型）</label>
          <select v-model="store.cfg.fig.prov" @change="fillFig()">
            <option v-for="(v, k) in FIG_PROVIDERS" :key="k" :value="k">{{ v.n }}</option>
          </select>
        </div>
        <div class="fld">
          <label>API Key（Ollama 本地可随便填如 ollama；硅基流动/智谱/通义填各自 Key）</label>
          <input v-model="store.cfg.fig.key" placeholder="sk-...（Ollama 本地填 ollama 即可）" type="text" />
        </div>
        <div class="fld">
          <label>API 地址（Ollama: http://localhost:11434/v1 · LM Studio: http://localhost:1234/v1 · Jan: http://localhost:1337/v1）</label>
          <input v-model="store.cfg.fig.url" placeholder="https://…/chat/completions" />
        </div>
        <div class="fld">
          <label>模型名称（开源视觉模型：minicpm-v / llama3.2-vision / qwen2.5-vl…）</label>
          <input v-model="store.cfg.fig.model" placeholder="例如 minicpm-v 或 Qwen/Qwen2.5-VL-7B-Instruct" />
        </div>
        <div class="fld">
          <button class="btn btn-gh" style="font-size: 12px" @click="figTest()">🧪 测试图形增强模型</button>
          <span style="font-size: 12px; color: var(--text3); margin-left: 8px">{{ figTestStat }}</span>
        </div>
        <details class="guide">
          <summary>🔑 免费开源方案怎么选（本地 0 成本 / 免费额度 / 主模型）</summary>
          <div class="guide-body">
            <p><b>🥇 完全免费 · 本地离线（无需任何 Key，装一次永久用）</b></p>
            <p>① <b>Ollama</b>（最简单）：安装 <a href="https://ollama.com/" target="_blank" rel="noopener">ollama.com</a> → 终端执行 <code>ollama pull minicpm-v</code>（中文好，约 5GB）或 <code>ollama pull llama3.2-vision</code> → 保持 Ollama 运行 → 本应用提供商选「Ollama 本地」，地址 http://localhost:11434/v1，模型 minicpm-v，Key 可随便填如 ollama。</p>
            <p>② <b>LM Studio</b>（图形界面，好上手）：安装 <a href="https://lmstudio.ai/" target="_blank" rel="noopener">lmstudio.ai</a> → 搜索下载视觉模型（如 Qwen2.5-VL-7B / minicpm-v）→ 启动本地服务（默认端口 1234）→ 本应用提供商选「LM Studio 本地」即可，不用填 Key。</p>
            <p>③ <b>Jan</b>（另一款图形界面本地推理）：<a href="https://jan.ai/" target="_blank" rel="noopener">jan.ai</a> → 下载视觉模型 → 启动本地服务（默认端口 1337）→ 本应用提供商选「Jan 本地」。</p>
            <p>💡 本地模型首次要下载几个 GB，之后完全离线、免费、隐私最安全；电脑 8G 内存可跑 7B 量化版。</p>
            <p><b>🥈 免费额度 · 注册即送（不花钱，需 Key）</b></p>
            <p>④ <b>硅基流动 SiliconFlow（推荐）</b>：<a href="https://cloud.siliconflow.cn/" target="_blank" rel="noopener">cloud.siliconflow.cn</a> → 注册 → API 密钥 → 创建 → 粘 Key。默认 Qwen2.5-VL（开源视觉模型），免费额度足够日常用。</p>
            <p>⑤ <b>智谱 GLM-4V</b>（glm-4v-flash 有免费额度）：<a href="https://open.bigmodel.cn/" target="_blank" rel="noopener">open.bigmodel.cn</a> → API Keys → 创建。</p>
            <p>⑥ <b>通义千问 Qwen-VL</b>（新用户有免费额度）：<a href="https://dashscope.aliyun.com/" target="_blank" rel="noopener">dashscope.aliyun.com</a> → API-KEY 管理。</p>
            <p>💡 Key 只保存在你自己的浏览器 localStorage，本应用无后端；此模型仅用于"复刻原图"辅助理解，主问答仍走上方文字/视觉模型。</p>
          </div>
        </details>

        <div id="set-voice" class="sec-t">🗣️ 语音 · 真人朗读（音色市场 · 去掉 AI 味）</div>
        <div class="fld" style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap">
          <label style="font-size: 13px; font-weight: 700">自动朗读 AI 回复</label>
          <button class="btn" :class="store.cfg.ttsOn !== false ? 'btn-pri' : 'btn-gh'" @click="toggleTtsSetting()">{{ store.cfg.ttsOn !== false ? '🔊 已开启' : '🔇 已关闭' }}</button>
          <span style="font-size: 11px; color: var(--text3)">开启后 AI 回复完成自动朗读；对话里每条消息也有 🔊 朗读按钮。</span>
        </div>

        <div class="sec-t" style="font-size: 13px">🎛️ 朗读引擎（真人级音色优先）</div>
        <div style="font-size: 11px; color: var(--text3); margin: 2px 0 8px; line-height: 1.6">
          💡 <b>这里的全局音色 = 萌宠音色（同一套）</b>，全局朗读、刷题读题、萌宠讲话都用它。只有当你给某个角色<b>克隆了专属声线（🧬）</b>后，切到该角色才临时用克隆原声，切走即恢复此音色 —— 保证永远一致。
        </div>
        <div style="font-size: 12px; color: var(--pri); margin-bottom: 8px">🎯 当前生效音色：{{ petEffectiveLabel }}</div>
        <div class="tts-engine-grid">
          <button v-for="eng in TTS_ENGINES" :key="eng.id" class="tts-engine-card" :class="{ on: store.cfg.ttsMode === eng.id }" @click="setTtsMode(eng.id)">
            <span class="te-name">{{ eng.name }}</span>
            <span class="te-tag">{{ eng.tag }}</span>
            <span class="te-desc">{{ eng.desc }}</span>
          </button>
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
            <div v-for="v in gmVoiceList" :key="v.id" class="voice-card" :class="{ on: store.cfg.ttsGm.voice === v.id }" @click="pickVoice('glm', v.id)">
              <span class="vc-emoji">{{ v.emoji }}</span>
              <span class="vc-name">{{ v.name }}</span>
              <button class="btn btn-gh" style="font-size: 11px" @click.stop="ttsPreview('glm', v.id)">▶️ 试听</button>
            </div>
          </div>
          <div class="fld" style="display: flex; gap: 6px; align-items: center">
            <button class="btn btn-gh" style="font-size: 12px" @click="loadGmVoices()">🔄 刷新官方音色</button>
            <span style="font-size: 11px; color: var(--text3)">{{ gmVoiceStat }}</span>
          </div>
        </div>

        <!-- ② OpenAI 兼容（CosyVoice2 等）-->
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
              <input ref="voiceFileInput" type="file" accept="audio/*" style="display: none" @change="onVoiceFile($event)" />
              <input v-model="cloneVoiceName" placeholder="音色名（如 李星云声线）" style="flex: 1; min-width: 120px" />
              <button class="btn btn-pri" style="font-size: 12px" :disabled="voiceCloning" @click="doCloneVoice()">{{ voiceCloning ? '⏳ 克隆中…' : '🧬 开始克隆并绑定' }}</button>
            </div>
            <div v-if="voiceCloneStat" style="font-size: 11px; color: var(--text3); margin-top: 6px">{{ voiceCloneStat }}</div>
          </div>
          <div class="voice-market">
            <div v-for="v in OPENAI_PRESET_VOICES" :key="v.id" class="voice-card" :class="{ on: store.cfg.ttsOpenAI.voice === v.id }" @click="pickVoice('openai', v.id)">
              <span class="vc-emoji">{{ v.emoji }}</span>
              <span class="vc-name">{{ v.name }}</span>
              <button class="btn btn-gh" style="font-size: 11px" @click.stop="ttsPreview('openai', v.id)">▶️ 试听</button>
            </div>
          </div>
        </div>

        <!-- ③ Edge 免费神经音色 -->
        <div v-if="store.cfg.ttsMode === 'edge'">
          <div class="sec-t" style="font-size: 13px">🚀 微软 Edge 神经音色（免费 · 无 Key）</div>
          <div class="voice-market">
            <div v-for="v in edgeVoiceList" :key="v.id" class="voice-card" :class="{ on: store.cfg.ttsEdgeVoice === v.id }" @click="pickVoice('edge', v.id)">
              <span class="vc-emoji">{{ v.emoji }}</span>
              <span class="vc-name">{{ v.name }}</span>
              <button class="btn btn-gh" style="font-size: 11px" @click.stop="ttsPreview('edge', v.id)">▶️ 试听</button>
            </div>
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
<button class="set-group-hd" :class="{ on: setGroup === 'look' }" @click="toggleSetGroup('look')"><span>🎨 主题与外观（统一管理：主题 / 强调色 / 护眼 / 壁纸 / 随手记）</span><span class="sg-arrow">{{ setGroup === 'look' ? '▾' : '▸' }}</span></button>
<div v-show="setGroup === 'look'" class="set-group-bd">
<div id="set-look" class="sec-t">🎨 主题与外观</div>
        <div style="font-size: 11px; color: var(--text3); margin-bottom: 8px">主题/文字配色/强调色/护眼/壁纸/随手记/字号 统一在此管理；顶栏 ☀️/🌙 可在「米白纸 / 深空黑」间快速切换白天黑夜。</div>
        <div class="sec-t">🎨 主题预设（iPad 笔记风 · 一键切换）</div>
        <div class="theme-grid">
          <button v-for="(p, k) in THEME_PRESETS" :key="k" class="theme-card" :class="{ on: themePreset === k }" @click="applyThemePreset(k)">
            <span class="th-swatch" :style="{ background: p.vars.bg }"></span>
            <span class="th-name">{{ p.name }}</span>
          </button>
        </div>
        <div style="font-size: 11px; color: var(--text3); margin-top: 4px">红白蓝三款高对比夜间 + 米白/绿白/红白/暖黄/柔绿等白天护眼主题，点选即时生效并记忆；文字对比均按高可读性校准。</div>

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
            <label>
              <input v-model="store.cfg.hl" type="checkbox" @change="setHl(store.cfg.hl)" />
              高亮模式（标题/答案/重点加亮，白天黑夜各自独立配色）
            </label>
          </div>
          <div class="fld">
            <label>
              <input v-model="store.cfg.view3d" type="checkbox" @change="saveCfg()" />
              3D 全景背景（开启后对话/看板等显示 3D 星空，可点顶栏 ◉ 快速切换）
            </label>
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

        <div class="sec-t">📅 备考冲刺</div>
        <div class="fld">
          <label>笔试目标日期（驾驶舱显示倒计时）</label>
          <input v-model="store.cfg.examDate" type="date" @change="saveCfg()" />
          <div style="font-size: 11px; color: var(--text3); margin-top: 4px">
            按 e.g. 2026-11-29 设置国考笔试日，🚀看板会实时倒计时。
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


        </div>
<button class="set-group-hd" :class="{ on: setGroup === 'fun' }" @click="toggleSetGroup('fun')"><span>🎵 趣味·数据·同步（音乐 / 萌宠 / 数据）</span><span class="sg-arrow">{{ setGroup === 'fun' ? '▾' : '▸' }}</span></button>
<div v-show="setGroup === 'fun'" class="set-group-bd">
<div class="sec-t">☁️ WebDAV 云同步</div>
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
          {{ wdStat || '凭据仅保存在本机 localStorage；坚果云示例地址 dav.jianguoyun.com/dav/…' }}
        </div>


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
            上传一段 3-30 秒清晰的参考音频（说话/角色声均可，越清晰越像），大模型会克隆出该音色并<b>自动绑定到『{{ petSkin.char }}』</b>：之后一键切到这个角色，朗读就是克隆原声；切走则恢复「语音」里的全局音色（保持全局一致）。<b>支持 mp3/wav/m4a/aac/ogg 等常见格式（哪怕后缀是 .mp3 实为 m4a 也能识别），超过 30 秒会自动裁前 20 秒、去头尾静音、转成标准 WAV 再克隆</b>。配音版权请自行确保。
          </div>
          <div style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center">
            <select v-model="cloneBackend" style="font-size: 12px; max-width: 190px">
              <option value="zhipu">🧬 智谱 GLM-TTS-Clone（3 秒即可）</option>
              <option value="cosy">🎨 CosyVoice2 · 硅基流动</option>
            </select>
            <button class="btn btn-gh" style="font-size: 12px" @click="$refs.skinVoiceFileInput.click()">{{ voiceFileName || '🎤 选择参考音频' }}</button>
            <input ref="skinVoiceFileInput" type="file" accept="audio/*" style="display: none" @change="onVoiceFile($event)" />
            <input v-model="cloneVoiceName" :placeholder="petSkin.char + '声线'" style="flex: 1; min-width: 110px" />
            <button class="btn btn-pri" style="font-size: 12px" :disabled="voiceCloning" @click="doCloneVoice()">{{ voiceCloning ? '⏳ 克隆中…' : '🧬 开始克隆并绑定' }}</button>
            <div style="width: 100%">
              <input v-model="cloneVoiceText" placeholder="参考音频对应的文字内容（选填，填了克隆更像，如：天地玄黄，宇宙洪荒…）" style="width: 100%; margin-top: 6px" />
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


        <div id="set-bg" class="sec-t">🖼️ 背景（纯色 / 图片壁纸）</div>
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


        <div id="set-data" class="sec-t">💾 数据保存位置（本地文件夹）</div>
        <div class="fld">
          <label>电脑端：选择文件夹后，可一键把全部数据保存进去</label>
          <div class="exp-choices">
            <button class="btn btn-gh" @click="pickDir()">📁 选择保存文件夹</button>
            <button class="btn btn-pri" @click="saveDataDir()">💾 保存全部数据</button>
          </div>
          <div v-if="dirLabel" style="font-size: 11px; color: var(--hud-cyan); margin-top: 4px">已选择文件夹：{{ dirLabel }}</div>
          <div style="font-size: 11px; color: var(--text3); margin-top: 4px">
            保存后会写入：数据备份.json / 错题集.md / 知识库积累.md。手机端或浏览器不支持选文件夹时，用上方「⬇️ 导出备份(JSON)」下载到手机，可自行移动到任意文件夹。所有数据默认存在本机 localStorage，不会上传。
          </div>
        </div>
        <div class="sec-t">💾 数据管理</div>
        <div class="exp-choices">
          <button class="btn btn-pri" @click="exportAllData()">📦 导出全部数据</button>
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
<button class="set-group-hd" :class="{ on: setGroup === 'help' }" @click="toggleSetGroup('help')"><span>❓ 帮助与关于</span><span class="sg-arrow">{{ setGroup === 'help' ? '▾' : '▸' }}</span></button>
<div v-show="setGroup === 'help'" class="set-group-bd">
<div id="set-about" class="sec-t">📜 关于 · 开发者说明</div>
        <div class="about-box">
          <p class="ab-warn">⚠️ 本项目仅供个人学习使用，切勿商用，违者必究。</p>
          <p><b>隐私与数据</b>：全部数据（对话/错题/知识库/设置）只保存在你自己的浏览器 localStorage，应用无后端服务器、不上传任何数据；API Key 也只存本机。可用「数据管理 → 导出/导入备份、WebDAV 云同步、保存到本地文件夹」迁移。</p>
          <p><b>开发者说明</b>：本项目为个人备考自用工具（Vue3 + Vite + PWA）。技术栈与构建见仓库 README / PROJECT_ROADMAP；`01_源码` 为唯一活跃源码，`scripts/sync-dist.ps1` 一键构建并同步三端（网页/发布包/安卓 web 资源）。欢迎在个人学习范围内二次开发。</p>
          <p><b>版本</b>：v{{ APP_VERSION }}（更新历史见仓库 CHANGELOG.md）</p>
          <p><b>使用提示</b>：首次使用请先完成引导（设置 API Key 与视觉模型）；刷题→存错题→二刷复盘→积累记忆→统计→导出，形成闭环提分。</p>
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
      <button v-if="draftFabOn" class="draft-fab gfab" :style="gFabStyle" :title="'📝 随手记：任何界面可写笔记（可拖动，设置里可关闭）'" @pointerdown="onGFabDown">✏️</button>
      <DraftPad v-if="globalDraft" draft-key="global" title="📝 全局随手记" @close="globalDraft = false" />
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
              <button v-for="p in [['ds','DeepSeek'],['zhipu','智谱'],['openai','OpenAI'],['qwen','通义']]" :key="p[0]" class="fp-b" :class="{ on: store.cfg.text.prov === p[0] }" @click="store.cfg.text.prov = p[0]; fillProv('text')">{{ p[1] }}</button>
            </div>
            <a class="ob-link" href="https://platform.deepseek.com/" target="_blank" rel="noopener">🔗 去 DeepSeek 创建 Key（选其它提供商则用对应平台）</a>
            <input v-model="store.cfg.text.key" class="ob-input" placeholder="粘贴 sk-... 开头的 API Key" type="text" @keydown.enter="testConn()" />
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
              <button v-for="p in [['ds','DeepSeek(推荐)'],['zhipu','智谱'],['openai','OpenAI'],['qwen','通义']]" :key="p[0]" class="fp-b" :class="{ on: store.cfg.vision.prov === p[0] }" @click="store.cfg.vision.prov = p[0]; fillProv('vision')">{{ p[1] }}</button>
            </div>
            <input v-model="store.cfg.vision.key" class="ob-input" placeholder="视觉模型 Key（DeepSeek 可填和上面同一个）" type="text" @keydown.enter="testConn()" />
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
            <p>朗读让 AI 讲解"听得见"；考试日期让看板倒计时。</p>
            <div class="ob-row">
              <button class="btn btn-gh" @click="ttsTest()">🔊 试听朗读</button>
              <input v-model="store.cfg.examDate" type="date" class="ob-input" @change="saveCfg()" />
            </div>
            <div class="ob-note">笔试日如 2026-11-29（国考），可在设置里随时改。</div>
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


    <!-- 背景音乐浮动控件（二级：点击播放/暂停 · ▴ 展开控制面板） -->
    <div class="music-float" :class="{ on: musicOn, hide: store.tab === 'chat' }" :style="floatStyle('music')" title="背景音乐" @pointerdown="startFloatDrag($event, 'music')">
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
    <div class="pet-float" :style="floatStyle('pet')" title="我的萌宠：点击互动 · 按住可拖动" @click="floatClick('pet')" @pointerdown="startFloatDrag($event, 'pet')">
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
    <div v-if="petShow" class="pet-panel" :style="petPanelStyle">
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
          <div style="font-size: 11px; color: var(--text3); margin-top: 4px">李星云/薛神为内置锁定角色（形象+克隆原声不可改）；自定义角色可自由设置名字/人设/形象/声线，想加几个加几个（去 设置→萌宠 编辑）。</div>
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
</template>
