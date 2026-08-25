<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { store, saveCfg, saveWqs, saveMsgs, saveMyMem, saveNotes } from './store'
import { speak, SCENES, getAllVoices, onVoicesReady } from './utils/tts'
import { PLATE_MODE } from './api'
import ChatPage from './components/ChatPage.vue'
import KbPage from './components/KbPage.vue'
import StatsPage from './components/StatsPage.vue'
import WrongPage from './components/WrongPage.vue'
import CockpitPage from './components/CockpitPage.vue'
import FloatPanel from './components/FloatPanel.vue'
import ExamBar from './components/ExamBar.vue'
import CosmosScene from './components/CosmosScene.vue'
import { doExport, exportWrongTxt, exportDataMd, exportWrongMd, parseMarkdownNotes } from './utils/export'
import { showToast } from './utils/toast'
import { startStudyTrack, stopStudyTrack } from './utils/study'
import { webdavUpload, webdavDownload } from './utils/webdav'
import { pickDataFolder, saveAllDataToFolder, getFolderName } from './utils/localData'
import { musicOn, musicVol, musicLoop, musicIndex, musicList, musicStatus, playTrack, toggleMusic, nextTrack, setVolume, setLoop, addMusicUrl, addMusicFile, removeMusic, importNetEase } from './utils/music'
import { pet, petShow, petMuted, bubble, petStats, petStage, petLevel, petHunger, petMood, petPoints, petSpeak, feedPet, patPet, renamePet, setPetMuted, petNextName, petNextXp } from './utils/pet'
const tabs = [
  { k: 'ck', t: '🚀 看板' },
  { k: 'chat', t: '💬 对话' },
  { k: 'kb', t: '📚 知识库' },
  { k: 'ths', t: '🗂️ 积累' },
  { k: 'stat', t: '📊 统计' },
  { k: 'wq', t: '📋 错题' }
]
const initialTab = store.tab && tabs.some((t) => t.k === store.tab) ? store.tab : 'ck'
store.tab = initialTab
const theme = ref(localStorage.getItem('xc_theme') === 'light' ? 'light' : 'dark')
document.body.setAttribute('data-theme', theme.value)
// 视图模式：3D 全景 / 2D 清爽（存设置，可随时开关）
function toggleView() {
  store.cfg.view3d = !store.cfg.view3d
  saveCfg()
}function doTheme() {
  theme.value = theme.value === 'light' ? 'dark' : 'light'
  document.body.setAttribute('data-theme', theme.value)
  localStorage.setItem('xc_theme', theme.value)
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
    features: ['🧠 10 个专项模式（逻辑/言语/图推/资料/数量…）', '🎲 模拟出题 / 📝 整卷模拟 / 📥 真题组卷', '📷 图片题走视觉模型，公式图表都能看'],
    tips: ['① 先在设置配好 API Key 和视觉模型', '② 刷题开「考场限时」练速度', '③ 答完点「📌 存错题」，用「🔁 出变式题」检验是否真懂']
  },
  kb: {
    key: 'kb', icon: '📚', title: '知识速查',
    desc: '名师方法论按板块整理成卡片，考前突击靠它。',
    features: ['📂 2D 速查：按板块分组，点卡片看核心要点', '💬 点「问 AI 讲透」让 AI 展开讲，🎲 出题检验', '🕹️ 可切换 3D 书柜（展示用）'],
    tips: ['① 考前把每张卡片的「秒杀规律」过一遍', '② 不会的方法点「问 AI 讲透」再配例题', '③ 3D 书柜只是展示，备考用 2D 更快']
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
  { k: 'exam', t: '📝 整卷模拟考试', match: ['整卷', '模拟', '考试', 'exam', '组卷'] },
  { k: 'paper', t: '📥 真题组卷', match: ['真题', '导入题', 'paper', '试卷'] },
  { k: 'music', t: '🎵 背景音乐', match: ['音乐', 'music', 'bgm', '歌单'] },
  { k: 'pet', t: '🐾 我的萌宠', match: ['萌宠', '宠物', 'pet'] },
  { k: '3d', t: '◉ 3D 背景开关', match: ['3d', '背景', '全景', '2d'] }
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
  if (f.k === '3d') { toggleView(); return }
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
  { id: 'set-vision', t: '👁️ 视觉模型', d: '图片/截图题的 AI 大脑（图推图形、资料表格、数学公式）。', tips: 'DeepSeek 可用同一个 Key；不配则发图题无法识别。' },
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
function scrollSet(id) {
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
const sysVoices = ref([])
function loadSysVoices() {
  sysVoices.value = getAllVoices()
}
function ttsTestVoice() {
  speak('你好，我是你的行测智能助教。这是本机语音试听。', { scene: store.cfg.ttsScene, rate: store.cfg.ttsRate, pitch: store.cfg.ttsPitch })
}
onVoicesReady(() => { if (setShow.value) loadSysVoices() })

function openSet() {
  setShow.value = true
  loadSysVoices()
  getFolderName().then((n) => { if (n) dirLabel.value = n }).catch(() => {})
  setTimeout(testConn, 100)
}
function saveSet() {
  saveCfg()
  setShow.value = false
  testConn()
}

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
function backupData() {
  const data = { cfg: store.cfg, msgs: store.msgs, wqs: store.wqs, mode: store.mode }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = '行测AI-数据备份.json'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}
function importData(ev) {
  const f = ev.target.files && ev.target.files[0]
  if (!f) return
  const rd = new FileReader()
  rd.onload = () => {
    try {
      const d = JSON.parse(rd.result)
      if (d.cfg) store.cfg = Object.assign(store.cfg, d.cfg)
      if (Array.isArray(d.msgs)) store.msgs = d.msgs.slice(-200)
      if (Array.isArray(d.wqs)) store.wqs = d.wqs
      if (d.mode) store.mode = d.mode
      saveCfg()
      saveMsgs()
      saveWqs()
      showToast('✅ 已导入备份', 'success')
      testConn()
    } catch (e) {
      showToast('❌ 备份文件无效', 'error')
    }
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
// ===== 键盘快捷键 =====
function onKey(e) {
  // Ctrl/Cmd+K 聚焦搜索
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    searchInput.value && searchInput.value.focus()
    return
  }
  // Esc 收起搜索
  if (e.key === 'Escape' && searchDrop.value) {
    searchDrop.value = false
    if (document.activeElement === searchInput.value) searchInput.value.blur()
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
  window.addEventListener('keydown', onKey)
  startStudyTrack()
  try { if (!localStorage.getItem('xc_onboarded')) { startOnboard() } } catch (e) {}
  window.addEventListener('xc-export-kb', () => openExp('kb'))
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('xc-export-kb', () => openExp('kb'))
  stopStudyTrack()
})
</script>
<template>
  <CosmosScene v-if="store.cfg.view3d && store.tab !== 'kb'" />
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


    <!-- 背景音乐浮动控件 -->
    <div class="music-float" :class="{ on: musicOn }" title="背景音乐：点击播放/暂停" @click="toggleMusic()">
      <span class="mf-ic">{{ musicOn ? '🎵' : '🔇' }}</span>
      <span class="mf-name">{{ musicOn && musicList[musicIndex] ? musicList[musicIndex].name : '背景音乐' }}</span>
    </div>
    <!-- 萌宠 -->
    <div class="pet-float" title="我的萌宠：点击互动" @click="openPet()">
      <div v-if="bubble && !petMuted" class="pet-bubble">{{ bubble }}</div>
      <span class="pet-emoji">{{ petStage.emoji }}</span>
      <span class="pet-mood">{{ petMood.emoji }}</span>
    </div>
    <!-- 萌宠面板 -->
    <div v-if="petShow" class="ov show pet-ov" @click.self="petShow = false">
      <div class="pnl pet-pnl">
        <div class="pet-head">
          <span class="pet-big">{{ petStage.emoji }}</span>
          <div class="pet-id">
            <div class="pet-name">{{ pet.name }} <span class="pet-lv">Lv.{{ petLevel }} · {{ petStage.name }}</span></div>
            <div class="pet-moodline">心情：{{ petMood.emoji }} {{ petMood.label }}</div>
          </div>
          <button class="pc-close" @click="petShow = false">✕</button>
        </div>
        <div v-if="bubble && !petMuted" class="pet-talk">{{ bubble }}</div>
        <div class="pet-bar-row">
          <span class="pbl">成长</span>
          <div class="bar"><div class="bar-fill" :style="{ width: Math.min(100, petLevel * 10) + '%' }"></div></div>
          <span class="pet-xp">{{ petPoints }} 积分</span>
        </div>
        <div v-if="petNextName" class="pet-next">距「{{ petNextName.emoji }} {{ petNextName.name }}」还需 {{ Math.max(0, (Number(petNextXp) || 0) - (Number(petPoints) || 0)) }} 积分
          <div class="bar"><div class="bar-fill next" :style="{ width: Math.min(100, (petPoints / petNextXp) * 100) + '%' }"></div></div>
        </div>
        <div class="pet-bar-row">
          <span class="pbl">饱食度</span>
          <div class="bar"><div class="bar-fill food" :style="{ width: petHunger * 10 + '%' }"></div></div>
          <span>{{ petHunger }}/10</span>
        </div>
        <div class="pet-stats">
          <div class="ps-i">💬 提问 <b>{{ petStats.asks }}</b></div>
          <div class="ps-i">✍️ 问答 <b>{{ petStats.answers }}</b></div>
          <div class="ps-i">📋 错题 <b>{{ petStats.wrongs }}</b></div>
          <div class="ps-i">✅ 复盘 <b>{{ petStats.reviewed }}</b></div>
          <div class="ps-i">🔥 打卡 <b>{{ petStats.streak }}</b> 天</div>
        </div>
        <div class="pet-note">喂食需 5 学习积分：每次 AI 回复 +1，错题二刷/三刷 +2。萌宠随时间会饿，饿久了会闹情绪哦。</div>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="petShow = false">关闭</button>
          <button class="btn btn-gh" @click="patPet()">🐾 摸头</button>
          <button class="btn btn-pri" @click="doFeed()">🍖 喂食(-5分)</button>
        </div>
        <div class="pet-rename">
          <input v-model="petNameInput" :placeholder="'给 ' + pet.name + ' 改名…'" style="flex:1" @keydown.enter="doRename()" />
          <button class="btn btn-gh" @click="doRename()">改名</button>
        </div>
      </div>
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


    <!-- 背景音乐浮动控件 -->
    <div class="music-float" :class="{ on: musicOn }" title="背景音乐：点击播放/暂停" @click="toggleMusic()">
      <span class="mf-ic">{{ musicOn ? '🎵' : '🔇' }}</span>
      <span class="mf-name">{{ musicOn && musicList[musicIndex] ? musicList[musicIndex].name : '背景音乐' }}</span>
    </div>
    <!-- 萌宠 -->
    <div class="pet-float" title="我的萌宠：点击互动" @click="openPet()">
      <div v-if="bubble && !petMuted" class="pet-bubble">{{ bubble }}</div>
      <span class="pet-emoji">{{ petStage.emoji }}</span>
      <span class="pet-mood">{{ petMood.emoji }}</span>
    </div>
    <!-- 萌宠面板 -->
    <div v-if="petShow" class="ov show pet-ov" @click.self="petShow = false">
      <div class="pnl pet-pnl">
        <div class="pet-head">
          <span class="pet-big">{{ petStage.emoji }}</span>
          <div class="pet-id">
            <div class="pet-name">{{ pet.name }} <span class="pet-lv">Lv.{{ petLevel }} · {{ petStage.name }}</span></div>
            <div class="pet-moodline">心情：{{ petMood.emoji }} {{ petMood.label }}</div>
          </div>
          <button class="pc-close" @click="petShow = false">✕</button>
        </div>
        <div v-if="bubble && !petMuted" class="pet-talk">{{ bubble }}</div>
        <div class="pet-bar-row">
          <span class="pbl">成长</span>
          <div class="bar"><div class="bar-fill" :style="{ width: Math.min(100, petLevel * 10) + '%' }"></div></div>
          <span class="pet-xp">{{ petPoints }} 积分</span>
        </div>
        <div v-if="petNextName" class="pet-next">距「{{ petNextName.emoji }} {{ petNextName.name }}」还需 {{ Math.max(0, (Number(petNextXp) || 0) - (Number(petPoints) || 0)) }} 积分
          <div class="bar"><div class="bar-fill next" :style="{ width: Math.min(100, (petPoints / petNextXp) * 100) + '%' }"></div></div>
        </div>
        <div class="pet-bar-row">
          <span class="pbl">饱食度</span>
          <div class="bar"><div class="bar-fill food" :style="{ width: petHunger * 10 + '%' }"></div></div>
          <span>{{ petHunger }}/10</span>
        </div>
        <div class="pet-stats">
          <div class="ps-i">💬 提问 <b>{{ petStats.asks }}</b></div>
          <div class="ps-i">✍️ 问答 <b>{{ petStats.answers }}</b></div>
          <div class="ps-i">📋 错题 <b>{{ petStats.wrongs }}</b></div>
          <div class="ps-i">✅ 复盘 <b>{{ petStats.reviewed }}</b></div>
          <div class="ps-i">🔥 打卡 <b>{{ petStats.streak }}</b> 天</div>
        </div>
        <div class="pet-note">喂食需 5 学习积分：每次 AI 回复 +1，错题二刷/三刷 +2。萌宠随时间会饿，饿久了会闹情绪哦。</div>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="petShow = false">关闭</button>
          <button class="btn btn-gh" @click="patPet()">🐾 摸头</button>
          <button class="btn btn-pri" @click="doFeed()">🍖 喂食(-5分)</button>
        </div>
        <div class="pet-rename">
          <input v-model="petNameInput" :placeholder="'给 ' + pet.name + ' 改名…'" style="flex:1" @keydown.enter="doRename()" />
          <button class="btn btn-gh" @click="doRename()">改名</button>
        </div>
      </div>
    </div>


</template>

        <template v-else-if="obStep === 2">
          <h3>② 配置视觉模型（图片/截图题）</h3>
          <div class="ob-body">
            <p>图推图形、资料表格、数学公式需要视觉模型。用 DeepSeek 时可直接用 <b>同一个 Key</b>：</p>
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


    <!-- 背景音乐浮动控件 -->
    <div class="music-float" :class="{ on: musicOn }" title="背景音乐：点击播放/暂停" @click="toggleMusic()">
      <span class="mf-ic">{{ musicOn ? '🎵' : '🔇' }}</span>
      <span class="mf-name">{{ musicOn && musicList[musicIndex] ? musicList[musicIndex].name : '背景音乐' }}</span>
    </div>
    <!-- 萌宠 -->
    <div class="pet-float" title="我的萌宠：点击互动" @click="openPet()">
      <div v-if="bubble && !petMuted" class="pet-bubble">{{ bubble }}</div>
      <span class="pet-emoji">{{ petStage.emoji }}</span>
      <span class="pet-mood">{{ petMood.emoji }}</span>
    </div>
    <!-- 萌宠面板 -->
    <div v-if="petShow" class="ov show pet-ov" @click.self="petShow = false">
      <div class="pnl pet-pnl">
        <div class="pet-head">
          <span class="pet-big">{{ petStage.emoji }}</span>
          <div class="pet-id">
            <div class="pet-name">{{ pet.name }} <span class="pet-lv">Lv.{{ petLevel }} · {{ petStage.name }}</span></div>
            <div class="pet-moodline">心情：{{ petMood.emoji }} {{ petMood.label }}</div>
          </div>
          <button class="pc-close" @click="petShow = false">✕</button>
        </div>
        <div v-if="bubble && !petMuted" class="pet-talk">{{ bubble }}</div>
        <div class="pet-bar-row">
          <span class="pbl">成长</span>
          <div class="bar"><div class="bar-fill" :style="{ width: Math.min(100, petLevel * 10) + '%' }"></div></div>
          <span class="pet-xp">{{ petPoints }} 积分</span>
        </div>
        <div v-if="petNextName" class="pet-next">距「{{ petNextName.emoji }} {{ petNextName.name }}」还需 {{ Math.max(0, (Number(petNextXp) || 0) - (Number(petPoints) || 0)) }} 积分
          <div class="bar"><div class="bar-fill next" :style="{ width: Math.min(100, (petPoints / petNextXp) * 100) + '%' }"></div></div>
        </div>
        <div class="pet-bar-row">
          <span class="pbl">饱食度</span>
          <div class="bar"><div class="bar-fill food" :style="{ width: petHunger * 10 + '%' }"></div></div>
          <span>{{ petHunger }}/10</span>
        </div>
        <div class="pet-stats">
          <div class="ps-i">💬 提问 <b>{{ petStats.asks }}</b></div>
          <div class="ps-i">✍️ 问答 <b>{{ petStats.answers }}</b></div>
          <div class="ps-i">📋 错题 <b>{{ petStats.wrongs }}</b></div>
          <div class="ps-i">✅ 复盘 <b>{{ petStats.reviewed }}</b></div>
          <div class="ps-i">🔥 打卡 <b>{{ petStats.streak }}</b> 天</div>
        </div>
        <div class="pet-note">喂食需 5 学习积分：每次 AI 回复 +1，错题二刷/三刷 +2。萌宠随时间会饿，饿久了会闹情绪哦。</div>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="petShow = false">关闭</button>
          <button class="btn btn-gh" @click="patPet()">🐾 摸头</button>
          <button class="btn btn-pri" @click="doFeed()">🍖 喂食(-5分)</button>
        </div>
        <div class="pet-rename">
          <input v-model="petNameInput" :placeholder="'给 ' + pet.name + ' 改名…'" style="flex:1" @keydown.enter="doRename()" />
          <button class="btn btn-gh" @click="doRename()">改名</button>
        </div>
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


    <!-- 背景音乐浮动控件 -->
    <div class="music-float" :class="{ on: musicOn }" title="背景音乐：点击播放/暂停" @click="toggleMusic()">
      <span class="mf-ic">{{ musicOn ? '🎵' : '🔇' }}</span>
      <span class="mf-name">{{ musicOn && musicList[musicIndex] ? musicList[musicIndex].name : '背景音乐' }}</span>
    </div>
    <!-- 萌宠 -->
    <div class="pet-float" title="我的萌宠：点击互动" @click="openPet()">
      <div v-if="bubble && !petMuted" class="pet-bubble">{{ bubble }}</div>
      <span class="pet-emoji">{{ petStage.emoji }}</span>
      <span class="pet-mood">{{ petMood.emoji }}</span>
    </div>
    <!-- 萌宠面板 -->
    <div v-if="petShow" class="ov show pet-ov" @click.self="petShow = false">
      <div class="pnl pet-pnl">
        <div class="pet-head">
          <span class="pet-big">{{ petStage.emoji }}</span>
          <div class="pet-id">
            <div class="pet-name">{{ pet.name }} <span class="pet-lv">Lv.{{ petLevel }} · {{ petStage.name }}</span></div>
            <div class="pet-moodline">心情：{{ petMood.emoji }} {{ petMood.label }}</div>
          </div>
          <button class="pc-close" @click="petShow = false">✕</button>
        </div>
        <div v-if="bubble && !petMuted" class="pet-talk">{{ bubble }}</div>
        <div class="pet-bar-row">
          <span class="pbl">成长</span>
          <div class="bar"><div class="bar-fill" :style="{ width: Math.min(100, petLevel * 10) + '%' }"></div></div>
          <span class="pet-xp">{{ petPoints }} 积分</span>
        </div>
        <div v-if="petNextName" class="pet-next">距「{{ petNextName.emoji }} {{ petNextName.name }}」还需 {{ Math.max(0, (Number(petNextXp) || 0) - (Number(petPoints) || 0)) }} 积分
          <div class="bar"><div class="bar-fill next" :style="{ width: Math.min(100, (petPoints / petNextXp) * 100) + '%' }"></div></div>
        </div>
        <div class="pet-bar-row">
          <span class="pbl">饱食度</span>
          <div class="bar"><div class="bar-fill food" :style="{ width: petHunger * 10 + '%' }"></div></div>
          <span>{{ petHunger }}/10</span>
        </div>
        <div class="pet-stats">
          <div class="ps-i">💬 提问 <b>{{ petStats.asks }}</b></div>
          <div class="ps-i">✍️ 问答 <b>{{ petStats.answers }}</b></div>
          <div class="ps-i">📋 错题 <b>{{ petStats.wrongs }}</b></div>
          <div class="ps-i">✅ 复盘 <b>{{ petStats.reviewed }}</b></div>
          <div class="ps-i">🔥 打卡 <b>{{ petStats.streak }}</b> 天</div>
        </div>
        <div class="pet-note">喂食需 5 学习积分：每次 AI 回复 +1，错题二刷/三刷 +2。萌宠随时间会饿，饿久了会闹情绪哦。</div>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="petShow = false">关闭</button>
          <button class="btn btn-gh" @click="patPet()">🐾 摸头</button>
          <button class="btn btn-pri" @click="doFeed()">🍖 喂食(-5分)</button>
        </div>
        <div class="pet-rename">
          <input v-model="petNameInput" :placeholder="'给 ' + pet.name + ' 改名…'" style="flex:1" @keydown.enter="doRename()" />
          <button class="btn btn-gh" @click="doRename()">改名</button>
        </div>
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


    <!-- 背景音乐浮动控件 -->
    <div class="music-float" :class="{ on: musicOn }" title="背景音乐：点击播放/暂停" @click="toggleMusic()">
      <span class="mf-ic">{{ musicOn ? '🎵' : '🔇' }}</span>
      <span class="mf-name">{{ musicOn && musicList[musicIndex] ? musicList[musicIndex].name : '背景音乐' }}</span>
    </div>
    <!-- 萌宠 -->
    <div class="pet-float" title="我的萌宠：点击互动" @click="openPet()">
      <div v-if="bubble && !petMuted" class="pet-bubble">{{ bubble }}</div>
      <span class="pet-emoji">{{ petStage.emoji }}</span>
      <span class="pet-mood">{{ petMood.emoji }}</span>
    </div>
    <!-- 萌宠面板 -->
    <div v-if="petShow" class="ov show pet-ov" @click.self="petShow = false">
      <div class="pnl pet-pnl">
        <div class="pet-head">
          <span class="pet-big">{{ petStage.emoji }}</span>
          <div class="pet-id">
            <div class="pet-name">{{ pet.name }} <span class="pet-lv">Lv.{{ petLevel }} · {{ petStage.name }}</span></div>
            <div class="pet-moodline">心情：{{ petMood.emoji }} {{ petMood.label }}</div>
          </div>
          <button class="pc-close" @click="petShow = false">✕</button>
        </div>
        <div v-if="bubble && !petMuted" class="pet-talk">{{ bubble }}</div>
        <div class="pet-bar-row">
          <span class="pbl">成长</span>
          <div class="bar"><div class="bar-fill" :style="{ width: Math.min(100, petLevel * 10) + '%' }"></div></div>
          <span class="pet-xp">{{ petPoints }} 积分</span>
        </div>
        <div v-if="petNextName" class="pet-next">距「{{ petNextName.emoji }} {{ petNextName.name }}」还需 {{ Math.max(0, (Number(petNextXp) || 0) - (Number(petPoints) || 0)) }} 积分
          <div class="bar"><div class="bar-fill next" :style="{ width: Math.min(100, (petPoints / petNextXp) * 100) + '%' }"></div></div>
        </div>
        <div class="pet-bar-row">
          <span class="pbl">饱食度</span>
          <div class="bar"><div class="bar-fill food" :style="{ width: petHunger * 10 + '%' }"></div></div>
          <span>{{ petHunger }}/10</span>
        </div>
        <div class="pet-stats">
          <div class="ps-i">💬 提问 <b>{{ petStats.asks }}</b></div>
          <div class="ps-i">✍️ 问答 <b>{{ petStats.answers }}</b></div>
          <div class="ps-i">📋 错题 <b>{{ petStats.wrongs }}</b></div>
          <div class="ps-i">✅ 复盘 <b>{{ petStats.reviewed }}</b></div>
          <div class="ps-i">🔥 打卡 <b>{{ petStats.streak }}</b> 天</div>
        </div>
        <div class="pet-note">喂食需 5 学习积分：每次 AI 回复 +1，错题二刷/三刷 +2。萌宠随时间会饿，饿久了会闹情绪哦。</div>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="petShow = false">关闭</button>
          <button class="btn btn-gh" @click="patPet()">🐾 摸头</button>
          <button class="btn btn-pri" @click="doFeed()">🍖 喂食(-5分)</button>
        </div>
        <div class="pet-rename">
          <input v-model="petNameInput" :placeholder="'给 ' + pet.name + ' 改名…'" style="flex:1" @keydown.enter="doRename()" />
          <button class="btn btn-gh" @click="doRename()">改名</button>
        </div>
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


    <!-- 背景音乐浮动控件 -->
    <div class="music-float" :class="{ on: musicOn }" title="背景音乐：点击播放/暂停" @click="toggleMusic()">
      <span class="mf-ic">{{ musicOn ? '🎵' : '🔇' }}</span>
      <span class="mf-name">{{ musicOn && musicList[musicIndex] ? musicList[musicIndex].name : '背景音乐' }}</span>
    </div>
    <!-- 萌宠 -->
    <div class="pet-float" title="我的萌宠：点击互动" @click="openPet()">
      <div v-if="bubble && !petMuted" class="pet-bubble">{{ bubble }}</div>
      <span class="pet-emoji">{{ petStage.emoji }}</span>
      <span class="pet-mood">{{ petMood.emoji }}</span>
    </div>
    <!-- 萌宠面板 -->
    <div v-if="petShow" class="ov show pet-ov" @click.self="petShow = false">
      <div class="pnl pet-pnl">
        <div class="pet-head">
          <span class="pet-big">{{ petStage.emoji }}</span>
          <div class="pet-id">
            <div class="pet-name">{{ pet.name }} <span class="pet-lv">Lv.{{ petLevel }} · {{ petStage.name }}</span></div>
            <div class="pet-moodline">心情：{{ petMood.emoji }} {{ petMood.label }}</div>
          </div>
          <button class="pc-close" @click="petShow = false">✕</button>
        </div>
        <div v-if="bubble && !petMuted" class="pet-talk">{{ bubble }}</div>
        <div class="pet-bar-row">
          <span class="pbl">成长</span>
          <div class="bar"><div class="bar-fill" :style="{ width: Math.min(100, petLevel * 10) + '%' }"></div></div>
          <span class="pet-xp">{{ petPoints }} 积分</span>
        </div>
        <div v-if="petNextName" class="pet-next">距「{{ petNextName.emoji }} {{ petNextName.name }}」还需 {{ Math.max(0, (Number(petNextXp) || 0) - (Number(petPoints) || 0)) }} 积分
          <div class="bar"><div class="bar-fill next" :style="{ width: Math.min(100, (petPoints / petNextXp) * 100) + '%' }"></div></div>
        </div>
        <div class="pet-bar-row">
          <span class="pbl">饱食度</span>
          <div class="bar"><div class="bar-fill food" :style="{ width: petHunger * 10 + '%' }"></div></div>
          <span>{{ petHunger }}/10</span>
        </div>
        <div class="pet-stats">
          <div class="ps-i">💬 提问 <b>{{ petStats.asks }}</b></div>
          <div class="ps-i">✍️ 问答 <b>{{ petStats.answers }}</b></div>
          <div class="ps-i">📋 错题 <b>{{ petStats.wrongs }}</b></div>
          <div class="ps-i">✅ 复盘 <b>{{ petStats.reviewed }}</b></div>
          <div class="ps-i">🔥 打卡 <b>{{ petStats.streak }}</b> 天</div>
        </div>
        <div class="pet-note">喂食需 5 学习积分：每次 AI 回复 +1，错题二刷/三刷 +2。萌宠随时间会饿，饿久了会闹情绪哦。</div>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="petShow = false">关闭</button>
          <button class="btn btn-gh" @click="patPet()">🐾 摸头</button>
          <button class="btn btn-pri" @click="doFeed()">🍖 喂食(-5分)</button>
        </div>
        <div class="pet-rename">
          <input v-model="petNameInput" :placeholder="'给 ' + pet.name + ' 改名…'" style="flex:1" @keydown.enter="doRename()" />
          <button class="btn btn-gh" @click="doRename()">改名</button>
        </div>
      </div>
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


    <!-- 背景音乐浮动控件 -->
    <div class="music-float" :class="{ on: musicOn }" title="背景音乐：点击播放/暂停" @click="toggleMusic()">
      <span class="mf-ic">{{ musicOn ? '🎵' : '🔇' }}</span>
      <span class="mf-name">{{ musicOn && musicList[musicIndex] ? musicList[musicIndex].name : '背景音乐' }}</span>
    </div>
    <!-- 萌宠 -->
    <div class="pet-float" title="我的萌宠：点击互动" @click="openPet()">
      <div v-if="bubble && !petMuted" class="pet-bubble">{{ bubble }}</div>
      <span class="pet-emoji">{{ petStage.emoji }}</span>
      <span class="pet-mood">{{ petMood.emoji }}</span>
    </div>
    <!-- 萌宠面板 -->
    <div v-if="petShow" class="ov show pet-ov" @click.self="petShow = false">
      <div class="pnl pet-pnl">
        <div class="pet-head">
          <span class="pet-big">{{ petStage.emoji }}</span>
          <div class="pet-id">
            <div class="pet-name">{{ pet.name }} <span class="pet-lv">Lv.{{ petLevel }} · {{ petStage.name }}</span></div>
            <div class="pet-moodline">心情：{{ petMood.emoji }} {{ petMood.label }}</div>
          </div>
          <button class="pc-close" @click="petShow = false">✕</button>
        </div>
        <div v-if="bubble && !petMuted" class="pet-talk">{{ bubble }}</div>
        <div class="pet-bar-row">
          <span class="pbl">成长</span>
          <div class="bar"><div class="bar-fill" :style="{ width: Math.min(100, petLevel * 10) + '%' }"></div></div>
          <span class="pet-xp">{{ petPoints }} 积分</span>
        </div>
        <div v-if="petNextName" class="pet-next">距「{{ petNextName.emoji }} {{ petNextName.name }}」还需 {{ Math.max(0, (Number(petNextXp) || 0) - (Number(petPoints) || 0)) }} 积分
          <div class="bar"><div class="bar-fill next" :style="{ width: Math.min(100, (petPoints / petNextXp) * 100) + '%' }"></div></div>
        </div>
        <div class="pet-bar-row">
          <span class="pbl">饱食度</span>
          <div class="bar"><div class="bar-fill food" :style="{ width: petHunger * 10 + '%' }"></div></div>
          <span>{{ petHunger }}/10</span>
        </div>
        <div class="pet-stats">
          <div class="ps-i">💬 提问 <b>{{ petStats.asks }}</b></div>
          <div class="ps-i">✍️ 问答 <b>{{ petStats.answers }}</b></div>
          <div class="ps-i">📋 错题 <b>{{ petStats.wrongs }}</b></div>
          <div class="ps-i">✅ 复盘 <b>{{ petStats.reviewed }}</b></div>
          <div class="ps-i">🔥 打卡 <b>{{ petStats.streak }}</b> 天</div>
        </div>
        <div class="pet-note">喂食需 5 学习积分：每次 AI 回复 +1，错题二刷/三刷 +2。萌宠随时间会饿，饿久了会闹情绪哦。</div>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="petShow = false">关闭</button>
          <button class="btn btn-gh" @click="patPet()">🐾 摸头</button>
          <button class="btn btn-pri" @click="doFeed()">🍖 喂食(-5分)</button>
        </div>
        <div class="pet-rename">
          <input v-model="petNameInput" :placeholder="'给 ' + pet.name + ' 改名…'" style="flex:1" @keydown.enter="doRename()" />
          <button class="btn btn-gh" @click="doRename()">改名</button>
        </div>
      </div>
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


    <!-- 背景音乐浮动控件 -->
    <div class="music-float" :class="{ on: musicOn }" title="背景音乐：点击播放/暂停" @click="toggleMusic()">
      <span class="mf-ic">{{ musicOn ? '🎵' : '🔇' }}</span>
      <span class="mf-name">{{ musicOn && musicList[musicIndex] ? musicList[musicIndex].name : '背景音乐' }}</span>
    </div>
    <!-- 萌宠 -->
    <div class="pet-float" title="我的萌宠：点击互动" @click="openPet()">
      <div v-if="bubble && !petMuted" class="pet-bubble">{{ bubble }}</div>
      <span class="pet-emoji">{{ petStage.emoji }}</span>
      <span class="pet-mood">{{ petMood.emoji }}</span>
    </div>
    <!-- 萌宠面板 -->
    <div v-if="petShow" class="ov show pet-ov" @click.self="petShow = false">
      <div class="pnl pet-pnl">
        <div class="pet-head">
          <span class="pet-big">{{ petStage.emoji }}</span>
          <div class="pet-id">
            <div class="pet-name">{{ pet.name }} <span class="pet-lv">Lv.{{ petLevel }} · {{ petStage.name }}</span></div>
            <div class="pet-moodline">心情：{{ petMood.emoji }} {{ petMood.label }}</div>
          </div>
          <button class="pc-close" @click="petShow = false">✕</button>
        </div>
        <div v-if="bubble && !petMuted" class="pet-talk">{{ bubble }}</div>
        <div class="pet-bar-row">
          <span class="pbl">成长</span>
          <div class="bar"><div class="bar-fill" :style="{ width: Math.min(100, petLevel * 10) + '%' }"></div></div>
          <span class="pet-xp">{{ petPoints }} 积分</span>
        </div>
        <div v-if="petNextName" class="pet-next">距「{{ petNextName.emoji }} {{ petNextName.name }}」还需 {{ Math.max(0, (Number(petNextXp) || 0) - (Number(petPoints) || 0)) }} 积分
          <div class="bar"><div class="bar-fill next" :style="{ width: Math.min(100, (petPoints / petNextXp) * 100) + '%' }"></div></div>
        </div>
        <div class="pet-bar-row">
          <span class="pbl">饱食度</span>
          <div class="bar"><div class="bar-fill food" :style="{ width: petHunger * 10 + '%' }"></div></div>
          <span>{{ petHunger }}/10</span>
        </div>
        <div class="pet-stats">
          <div class="ps-i">💬 提问 <b>{{ petStats.asks }}</b></div>
          <div class="ps-i">✍️ 问答 <b>{{ petStats.answers }}</b></div>
          <div class="ps-i">📋 错题 <b>{{ petStats.wrongs }}</b></div>
          <div class="ps-i">✅ 复盘 <b>{{ petStats.reviewed }}</b></div>
          <div class="ps-i">🔥 打卡 <b>{{ petStats.streak }}</b> 天</div>
        </div>
        <div class="pet-note">喂食需 5 学习积分：每次 AI 回复 +1，错题二刷/三刷 +2。萌宠随时间会饿，饿久了会闹情绪哦。</div>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="petShow = false">关闭</button>
          <button class="btn btn-gh" @click="patPet()">🐾 摸头</button>
          <button class="btn btn-pri" @click="doFeed()">🍖 喂食(-5分)</button>
        </div>
        <div class="pet-rename">
          <input v-model="petNameInput" :placeholder="'给 ' + pet.name + ' 改名…'" style="flex:1" @keydown.enter="doRename()" />
          <button class="btn btn-gh" @click="doRename()">改名</button>
        </div>
      </div>
    </div>


</template>

        <template v-else-if="obStep === 2">
          <h3>② 配置视觉模型（图片/截图题）</h3>
          <div class="ob-body">
            <p>图推图形、资料表格、数学公式需要视觉模型。用 DeepSeek 时可直接用 <b>同一个 Key</b>：</p>
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


    <!-- 背景音乐浮动控件 -->
    <div class="music-float" :class="{ on: musicOn }" title="背景音乐：点击播放/暂停" @click="toggleMusic()">
      <span class="mf-ic">{{ musicOn ? '🎵' : '🔇' }}</span>
      <span class="mf-name">{{ musicOn && musicList[musicIndex] ? musicList[musicIndex].name : '背景音乐' }}</span>
    </div>
    <!-- 萌宠 -->
    <div class="pet-float" title="我的萌宠：点击互动" @click="openPet()">
      <div v-if="bubble && !petMuted" class="pet-bubble">{{ bubble }}</div>
      <span class="pet-emoji">{{ petStage.emoji }}</span>
      <span class="pet-mood">{{ petMood.emoji }}</span>
    </div>
    <!-- 萌宠面板 -->
    <div v-if="petShow" class="ov show pet-ov" @click.self="petShow = false">
      <div class="pnl pet-pnl">
        <div class="pet-head">
          <span class="pet-big">{{ petStage.emoji }}</span>
          <div class="pet-id">
            <div class="pet-name">{{ pet.name }} <span class="pet-lv">Lv.{{ petLevel }} · {{ petStage.name }}</span></div>
            <div class="pet-moodline">心情：{{ petMood.emoji }} {{ petMood.label }}</div>
          </div>
          <button class="pc-close" @click="petShow = false">✕</button>
        </div>
        <div v-if="bubble && !petMuted" class="pet-talk">{{ bubble }}</div>
        <div class="pet-bar-row">
          <span class="pbl">成长</span>
          <div class="bar"><div class="bar-fill" :style="{ width: Math.min(100, petLevel * 10) + '%' }"></div></div>
          <span class="pet-xp">{{ petPoints }} 积分</span>
        </div>
        <div v-if="petNextName" class="pet-next">距「{{ petNextName.emoji }} {{ petNextName.name }}」还需 {{ Math.max(0, (Number(petNextXp) || 0) - (Number(petPoints) || 0)) }} 积分
          <div class="bar"><div class="bar-fill next" :style="{ width: Math.min(100, (petPoints / petNextXp) * 100) + '%' }"></div></div>
        </div>
        <div class="pet-bar-row">
          <span class="pbl">饱食度</span>
          <div class="bar"><div class="bar-fill food" :style="{ width: petHunger * 10 + '%' }"></div></div>
          <span>{{ petHunger }}/10</span>
        </div>
        <div class="pet-stats">
          <div class="ps-i">💬 提问 <b>{{ petStats.asks }}</b></div>
          <div class="ps-i">✍️ 问答 <b>{{ petStats.answers }}</b></div>
          <div class="ps-i">📋 错题 <b>{{ petStats.wrongs }}</b></div>
          <div class="ps-i">✅ 复盘 <b>{{ petStats.reviewed }}</b></div>
          <div class="ps-i">🔥 打卡 <b>{{ petStats.streak }}</b> 天</div>
        </div>
        <div class="pet-note">喂食需 5 学习积分：每次 AI 回复 +1，错题二刷/三刷 +2。萌宠随时间会饿，饿久了会闹情绪哦。</div>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="petShow = false">关闭</button>
          <button class="btn btn-gh" @click="patPet()">🐾 摸头</button>
          <button class="btn btn-pri" @click="doFeed()">🍖 喂食(-5分)</button>
        </div>
        <div class="pet-rename">
          <input v-model="petNameInput" :placeholder="'给 ' + pet.name + ' 改名…'" style="flex:1" @keydown.enter="doRename()" />
          <button class="btn btn-gh" @click="doRename()">改名</button>
        </div>
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


    <!-- 背景音乐浮动控件 -->
    <div class="music-float" :class="{ on: musicOn }" title="背景音乐：点击播放/暂停" @click="toggleMusic()">
      <span class="mf-ic">{{ musicOn ? '🎵' : '🔇' }}</span>
      <span class="mf-name">{{ musicOn && musicList[musicIndex] ? musicList[musicIndex].name : '背景音乐' }}</span>
    </div>
    <!-- 萌宠 -->
    <div class="pet-float" title="我的萌宠：点击互动" @click="openPet()">
      <div v-if="bubble && !petMuted" class="pet-bubble">{{ bubble }}</div>
      <span class="pet-emoji">{{ petStage.emoji }}</span>
      <span class="pet-mood">{{ petMood.emoji }}</span>
    </div>
    <!-- 萌宠面板 -->
    <div v-if="petShow" class="ov show pet-ov" @click.self="petShow = false">
      <div class="pnl pet-pnl">
        <div class="pet-head">
          <span class="pet-big">{{ petStage.emoji }}</span>
          <div class="pet-id">
            <div class="pet-name">{{ pet.name }} <span class="pet-lv">Lv.{{ petLevel }} · {{ petStage.name }}</span></div>
            <div class="pet-moodline">心情：{{ petMood.emoji }} {{ petMood.label }}</div>
          </div>
          <button class="pc-close" @click="petShow = false">✕</button>
        </div>
        <div v-if="bubble && !petMuted" class="pet-talk">{{ bubble }}</div>
        <div class="pet-bar-row">
          <span class="pbl">成长</span>
          <div class="bar"><div class="bar-fill" :style="{ width: Math.min(100, petLevel * 10) + '%' }"></div></div>
          <span class="pet-xp">{{ petPoints }} 积分</span>
        </div>
        <div v-if="petNextName" class="pet-next">距「{{ petNextName.emoji }} {{ petNextName.name }}」还需 {{ Math.max(0, (Number(petNextXp) || 0) - (Number(petPoints) || 0)) }} 积分
          <div class="bar"><div class="bar-fill next" :style="{ width: Math.min(100, (petPoints / petNextXp) * 100) + '%' }"></div></div>
        </div>
        <div class="pet-bar-row">
          <span class="pbl">饱食度</span>
          <div class="bar"><div class="bar-fill food" :style="{ width: petHunger * 10 + '%' }"></div></div>
          <span>{{ petHunger }}/10</span>
        </div>
        <div class="pet-stats">
          <div class="ps-i">💬 提问 <b>{{ petStats.asks }}</b></div>
          <div class="ps-i">✍️ 问答 <b>{{ petStats.answers }}</b></div>
          <div class="ps-i">📋 错题 <b>{{ petStats.wrongs }}</b></div>
          <div class="ps-i">✅ 复盘 <b>{{ petStats.reviewed }}</b></div>
          <div class="ps-i">🔥 打卡 <b>{{ petStats.streak }}</b> 天</div>
        </div>
        <div class="pet-note">喂食需 5 学习积分：每次 AI 回复 +1，错题二刷/三刷 +2。萌宠随时间会饿，饿久了会闹情绪哦。</div>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="petShow = false">关闭</button>
          <button class="btn btn-gh" @click="patPet()">🐾 摸头</button>
          <button class="btn btn-pri" @click="doFeed()">🍖 喂食(-5分)</button>
        </div>
        <div class="pet-rename">
          <input v-model="petNameInput" :placeholder="'给 ' + pet.name + ' 改名…'" style="flex:1" @keydown.enter="doRename()" />
          <button class="btn btn-gh" @click="doRename()">改名</button>
        </div>
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


    <!-- 背景音乐浮动控件 -->
    <div class="music-float" :class="{ on: musicOn }" title="背景音乐：点击播放/暂停" @click="toggleMusic()">
      <span class="mf-ic">{{ musicOn ? '🎵' : '🔇' }}</span>
      <span class="mf-name">{{ musicOn && musicList[musicIndex] ? musicList[musicIndex].name : '背景音乐' }}</span>
    </div>
    <!-- 萌宠 -->
    <div class="pet-float" title="我的萌宠：点击互动" @click="openPet()">
      <div v-if="bubble && !petMuted" class="pet-bubble">{{ bubble }}</div>
      <span class="pet-emoji">{{ petStage.emoji }}</span>
      <span class="pet-mood">{{ petMood.emoji }}</span>
    </div>
    <!-- 萌宠面板 -->
    <div v-if="petShow" class="ov show pet-ov" @click.self="petShow = false">
      <div class="pnl pet-pnl">
        <div class="pet-head">
          <span class="pet-big">{{ petStage.emoji }}</span>
          <div class="pet-id">
            <div class="pet-name">{{ pet.name }} <span class="pet-lv">Lv.{{ petLevel }} · {{ petStage.name }}</span></div>
            <div class="pet-moodline">心情：{{ petMood.emoji }} {{ petMood.label }}</div>
          </div>
          <button class="pc-close" @click="petShow = false">✕</button>
        </div>
        <div v-if="bubble && !petMuted" class="pet-talk">{{ bubble }}</div>
        <div class="pet-bar-row">
          <span class="pbl">成长</span>
          <div class="bar"><div class="bar-fill" :style="{ width: Math.min(100, petLevel * 10) + '%' }"></div></div>
          <span class="pet-xp">{{ petPoints }} 积分</span>
        </div>
        <div v-if="petNextName" class="pet-next">距「{{ petNextName.emoji }} {{ petNextName.name }}」还需 {{ Math.max(0, (Number(petNextXp) || 0) - (Number(petPoints) || 0)) }} 积分
          <div class="bar"><div class="bar-fill next" :style="{ width: Math.min(100, (petPoints / petNextXp) * 100) + '%' }"></div></div>
        </div>
        <div class="pet-bar-row">
          <span class="pbl">饱食度</span>
          <div class="bar"><div class="bar-fill food" :style="{ width: petHunger * 10 + '%' }"></div></div>
          <span>{{ petHunger }}/10</span>
        </div>
        <div class="pet-stats">
          <div class="ps-i">💬 提问 <b>{{ petStats.asks }}</b></div>
          <div class="ps-i">✍️ 问答 <b>{{ petStats.answers }}</b></div>
          <div class="ps-i">📋 错题 <b>{{ petStats.wrongs }}</b></div>
          <div class="ps-i">✅ 复盘 <b>{{ petStats.reviewed }}</b></div>
          <div class="ps-i">🔥 打卡 <b>{{ petStats.streak }}</b> 天</div>
        </div>
        <div class="pet-note">喂食需 5 学习积分：每次 AI 回复 +1，错题二刷/三刷 +2。萌宠随时间会饿，饿久了会闹情绪哦。</div>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="petShow = false">关闭</button>
          <button class="btn btn-gh" @click="patPet()">🐾 摸头</button>
          <button class="btn btn-pri" @click="doFeed()">🍖 喂食(-5分)</button>
        </div>
        <div class="pet-rename">
          <input v-model="petNameInput" :placeholder="'给 ' + pet.name + ' 改名…'" style="flex:1" @keydown.enter="doRename()" />
          <button class="btn btn-gh" @click="doRename()">改名</button>
        </div>
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


    <!-- 背景音乐浮动控件 -->
    <div class="music-float" :class="{ on: musicOn }" title="背景音乐：点击播放/暂停" @click="toggleMusic()">
      <span class="mf-ic">{{ musicOn ? '🎵' : '🔇' }}</span>
      <span class="mf-name">{{ musicOn && musicList[musicIndex] ? musicList[musicIndex].name : '背景音乐' }}</span>
    </div>
    <!-- 萌宠 -->
    <div class="pet-float" title="我的萌宠：点击互动" @click="openPet()">
      <div v-if="bubble && !petMuted" class="pet-bubble">{{ bubble }}</div>
      <span class="pet-emoji">{{ petStage.emoji }}</span>
      <span class="pet-mood">{{ petMood.emoji }}</span>
    </div>
    <!-- 萌宠面板 -->
    <div v-if="petShow" class="ov show pet-ov" @click.self="petShow = false">
      <div class="pnl pet-pnl">
        <div class="pet-head">
          <span class="pet-big">{{ petStage.emoji }}</span>
          <div class="pet-id">
            <div class="pet-name">{{ pet.name }} <span class="pet-lv">Lv.{{ petLevel }} · {{ petStage.name }}</span></div>
            <div class="pet-moodline">心情：{{ petMood.emoji }} {{ petMood.label }}</div>
          </div>
          <button class="pc-close" @click="petShow = false">✕</button>
        </div>
        <div v-if="bubble && !petMuted" class="pet-talk">{{ bubble }}</div>
        <div class="pet-bar-row">
          <span class="pbl">成长</span>
          <div class="bar"><div class="bar-fill" :style="{ width: Math.min(100, petLevel * 10) + '%' }"></div></div>
          <span class="pet-xp">{{ petPoints }} 积分</span>
        </div>
        <div v-if="petNextName" class="pet-next">距「{{ petNextName.emoji }} {{ petNextName.name }}」还需 {{ Math.max(0, (Number(petNextXp) || 0) - (Number(petPoints) || 0)) }} 积分
          <div class="bar"><div class="bar-fill next" :style="{ width: Math.min(100, (petPoints / petNextXp) * 100) + '%' }"></div></div>
        </div>
        <div class="pet-bar-row">
          <span class="pbl">饱食度</span>
          <div class="bar"><div class="bar-fill food" :style="{ width: petHunger * 10 + '%' }"></div></div>
          <span>{{ petHunger }}/10</span>
        </div>
        <div class="pet-stats">
          <div class="ps-i">💬 提问 <b>{{ petStats.asks }}</b></div>
          <div class="ps-i">✍️ 问答 <b>{{ petStats.answers }}</b></div>
          <div class="ps-i">📋 错题 <b>{{ petStats.wrongs }}</b></div>
          <div class="ps-i">✅ 复盘 <b>{{ petStats.reviewed }}</b></div>
          <div class="ps-i">🔥 打卡 <b>{{ petStats.streak }}</b> 天</div>
        </div>
        <div class="pet-note">喂食需 5 学习积分：每次 AI 回复 +1，错题二刷/三刷 +2。萌宠随时间会饿，饿久了会闹情绪哦。</div>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="petShow = false">关闭</button>
          <button class="btn btn-gh" @click="patPet()">🐾 摸头</button>
          <button class="btn btn-pri" @click="doFeed()">🍖 喂食(-5分)</button>
        </div>
        <div class="pet-rename">
          <input v-model="petNameInput" :placeholder="'给 ' + pet.name + ' 改名…'" style="flex:1" @keydown.enter="doRename()" />
          <button class="btn btn-gh" @click="doRename()">改名</button>
        </div>
      </div>
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


    <!-- 背景音乐浮动控件 -->
    <div class="music-float" :class="{ on: musicOn }" title="背景音乐：点击播放/暂停" @click="toggleMusic()">
      <span class="mf-ic">{{ musicOn ? '🎵' : '🔇' }}</span>
      <span class="mf-name">{{ musicOn && musicList[musicIndex] ? musicList[musicIndex].name : '背景音乐' }}</span>
    </div>
    <!-- 萌宠 -->
    <div class="pet-float" title="我的萌宠：点击互动" @click="openPet()">
      <div v-if="bubble && !petMuted" class="pet-bubble">{{ bubble }}</div>
      <span class="pet-emoji">{{ petStage.emoji }}</span>
      <span class="pet-mood">{{ petMood.emoji }}</span>
    </div>
    <!-- 萌宠面板 -->
    <div v-if="petShow" class="ov show pet-ov" @click.self="petShow = false">
      <div class="pnl pet-pnl">
        <div class="pet-head">
          <span class="pet-big">{{ petStage.emoji }}</span>
          <div class="pet-id">
            <div class="pet-name">{{ pet.name }} <span class="pet-lv">Lv.{{ petLevel }} · {{ petStage.name }}</span></div>
            <div class="pet-moodline">心情：{{ petMood.emoji }} {{ petMood.label }}</div>
          </div>
          <button class="pc-close" @click="petShow = false">✕</button>
        </div>
        <div v-if="bubble && !petMuted" class="pet-talk">{{ bubble }}</div>
        <div class="pet-bar-row">
          <span class="pbl">成长</span>
          <div class="bar"><div class="bar-fill" :style="{ width: Math.min(100, petLevel * 10) + '%' }"></div></div>
          <span class="pet-xp">{{ petPoints }} 积分</span>
        </div>
        <div v-if="petNextName" class="pet-next">距「{{ petNextName.emoji }} {{ petNextName.name }}」还需 {{ Math.max(0, (Number(petNextXp) || 0) - (Number(petPoints) || 0)) }} 积分
          <div class="bar"><div class="bar-fill next" :style="{ width: Math.min(100, (petPoints / petNextXp) * 100) + '%' }"></div></div>
        </div>
        <div class="pet-bar-row">
          <span class="pbl">饱食度</span>
          <div class="bar"><div class="bar-fill food" :style="{ width: petHunger * 10 + '%' }"></div></div>
          <span>{{ petHunger }}/10</span>
        </div>
        <div class="pet-stats">
          <div class="ps-i">💬 提问 <b>{{ petStats.asks }}</b></div>
          <div class="ps-i">✍️ 问答 <b>{{ petStats.answers }}</b></div>
          <div class="ps-i">📋 错题 <b>{{ petStats.wrongs }}</b></div>
          <div class="ps-i">✅ 复盘 <b>{{ petStats.reviewed }}</b></div>
          <div class="ps-i">🔥 打卡 <b>{{ petStats.streak }}</b> 天</div>
        </div>
        <div class="pet-note">喂食需 5 学习积分：每次 AI 回复 +1，错题二刷/三刷 +2。萌宠随时间会饿，饿久了会闹情绪哦。</div>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="petShow = false">关闭</button>
          <button class="btn btn-gh" @click="patPet()">🐾 摸头</button>
          <button class="btn btn-pri" @click="doFeed()">🍖 喂食(-5分)</button>
        </div>
        <div class="pet-rename">
          <input v-model="petNameInput" :placeholder="'给 ' + pet.name + ' 改名…'" style="flex:1" @keydown.enter="doRename()" />
          <button class="btn btn-gh" @click="doRename()">改名</button>
        </div>
      </div>
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


    <!-- 背景音乐浮动控件 -->
    <div class="music-float" :class="{ on: musicOn }" title="背景音乐：点击播放/暂停" @click="toggleMusic()">
      <span class="mf-ic">{{ musicOn ? '🎵' : '🔇' }}</span>
      <span class="mf-name">{{ musicOn && musicList[musicIndex] ? musicList[musicIndex].name : '背景音乐' }}</span>
    </div>
    <!-- 萌宠 -->
    <div class="pet-float" title="我的萌宠：点击互动" @click="openPet()">
      <div v-if="bubble && !petMuted" class="pet-bubble">{{ bubble }}</div>
      <span class="pet-emoji">{{ petStage.emoji }}</span>
      <span class="pet-mood">{{ petMood.emoji }}</span>
    </div>
    <!-- 萌宠面板 -->
    <div v-if="petShow" class="ov show pet-ov" @click.self="petShow = false">
      <div class="pnl pet-pnl">
        <div class="pet-head">
          <span class="pet-big">{{ petStage.emoji }}</span>
          <div class="pet-id">
            <div class="pet-name">{{ pet.name }} <span class="pet-lv">Lv.{{ petLevel }} · {{ petStage.name }}</span></div>
            <div class="pet-moodline">心情：{{ petMood.emoji }} {{ petMood.label }}</div>
          </div>
          <button class="pc-close" @click="petShow = false">✕</button>
        </div>
        <div v-if="bubble && !petMuted" class="pet-talk">{{ bubble }}</div>
        <div class="pet-bar-row">
          <span class="pbl">成长</span>
          <div class="bar"><div class="bar-fill" :style="{ width: Math.min(100, petLevel * 10) + '%' }"></div></div>
          <span class="pet-xp">{{ petPoints }} 积分</span>
        </div>
        <div v-if="petNextName" class="pet-next">距「{{ petNextName.emoji }} {{ petNextName.name }}」还需 {{ Math.max(0, (Number(petNextXp) || 0) - (Number(petPoints) || 0)) }} 积分
          <div class="bar"><div class="bar-fill next" :style="{ width: Math.min(100, (petPoints / petNextXp) * 100) + '%' }"></div></div>
        </div>
        <div class="pet-bar-row">
          <span class="pbl">饱食度</span>
          <div class="bar"><div class="bar-fill food" :style="{ width: petHunger * 10 + '%' }"></div></div>
          <span>{{ petHunger }}/10</span>
        </div>
        <div class="pet-stats">
          <div class="ps-i">💬 提问 <b>{{ petStats.asks }}</b></div>
          <div class="ps-i">✍️ 问答 <b>{{ petStats.answers }}</b></div>
          <div class="ps-i">📋 错题 <b>{{ petStats.wrongs }}</b></div>
          <div class="ps-i">✅ 复盘 <b>{{ petStats.reviewed }}</b></div>
          <div class="ps-i">🔥 打卡 <b>{{ petStats.streak }}</b> 天</div>
        </div>
        <div class="pet-note">喂食需 5 学习积分：每次 AI 回复 +1，错题二刷/三刷 +2。萌宠随时间会饿，饿久了会闹情绪哦。</div>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="petShow = false">关闭</button>
          <button class="btn btn-gh" @click="patPet()">🐾 摸头</button>
          <button class="btn btn-pri" @click="doFeed()">🍖 喂食(-5分)</button>
        </div>
        <div class="pet-rename">
          <input v-model="petNameInput" :placeholder="'给 ' + pet.name + ' 改名…'" style="flex:1" @keydown.enter="doRename()" />
          <button class="btn btn-gh" @click="doRename()">改名</button>
        </div>
      </div>
    </div>


</template>

        <template v-else-if="obStep === 2">
          <h3>② 配置视觉模型（图片/截图题）</h3>
          <div class="ob-body">
            <p>图推图形、资料表格、数学公式需要视觉模型。用 DeepSeek 时可直接用 <b>同一个 Key</b>：</p>
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


    <!-- 背景音乐浮动控件 -->
    <div class="music-float" :class="{ on: musicOn }" title="背景音乐：点击播放/暂停" @click="toggleMusic()">
      <span class="mf-ic">{{ musicOn ? '🎵' : '🔇' }}</span>
      <span class="mf-name">{{ musicOn && musicList[musicIndex] ? musicList[musicIndex].name : '背景音乐' }}</span>
    </div>
    <!-- 萌宠 -->
    <div class="pet-float" title="我的萌宠：点击互动" @click="openPet()">
      <div v-if="bubble && !petMuted" class="pet-bubble">{{ bubble }}</div>
      <span class="pet-emoji">{{ petStage.emoji }}</span>
      <span class="pet-mood">{{ petMood.emoji }}</span>
    </div>
    <!-- 萌宠面板 -->
    <div v-if="petShow" class="ov show pet-ov" @click.self="petShow = false">
      <div class="pnl pet-pnl">
        <div class="pet-head">
          <span class="pet-big">{{ petStage.emoji }}</span>
          <div class="pet-id">
            <div class="pet-name">{{ pet.name }} <span class="pet-lv">Lv.{{ petLevel }} · {{ petStage.name }}</span></div>
            <div class="pet-moodline">心情：{{ petMood.emoji }} {{ petMood.label }}</div>
          </div>
          <button class="pc-close" @click="petShow = false">✕</button>
        </div>
        <div v-if="bubble && !petMuted" class="pet-talk">{{ bubble }}</div>
        <div class="pet-bar-row">
          <span class="pbl">成长</span>
          <div class="bar"><div class="bar-fill" :style="{ width: Math.min(100, petLevel * 10) + '%' }"></div></div>
          <span class="pet-xp">{{ petPoints }} 积分</span>
        </div>
        <div v-if="petNextName" class="pet-next">距「{{ petNextName.emoji }} {{ petNextName.name }}」还需 {{ Math.max(0, (Number(petNextXp) || 0) - (Number(petPoints) || 0)) }} 积分
          <div class="bar"><div class="bar-fill next" :style="{ width: Math.min(100, (petPoints / petNextXp) * 100) + '%' }"></div></div>
        </div>
        <div class="pet-bar-row">
          <span class="pbl">饱食度</span>
          <div class="bar"><div class="bar-fill food" :style="{ width: petHunger * 10 + '%' }"></div></div>
          <span>{{ petHunger }}/10</span>
        </div>
        <div class="pet-stats">
          <div class="ps-i">💬 提问 <b>{{ petStats.asks }}</b></div>
          <div class="ps-i">✍️ 问答 <b>{{ petStats.answers }}</b></div>
          <div class="ps-i">📋 错题 <b>{{ petStats.wrongs }}</b></div>
          <div class="ps-i">✅ 复盘 <b>{{ petStats.reviewed }}</b></div>
          <div class="ps-i">🔥 打卡 <b>{{ petStats.streak }}</b> 天</div>
        </div>
        <div class="pet-note">喂食需 5 学习积分：每次 AI 回复 +1，错题二刷/三刷 +2。萌宠随时间会饿，饿久了会闹情绪哦。</div>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="petShow = false">关闭</button>
          <button class="btn btn-gh" @click="patPet()">🐾 摸头</button>
          <button class="btn btn-pri" @click="doFeed()">🍖 喂食(-5分)</button>
        </div>
        <div class="pet-rename">
          <input v-model="petNameInput" :placeholder="'给 ' + pet.name + ' 改名…'" style="flex:1" @keydown.enter="doRename()" />
          <button class="btn btn-gh" @click="doRename()">改名</button>
        </div>
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


    <!-- 背景音乐浮动控件 -->
    <div class="music-float" :class="{ on: musicOn }" title="背景音乐：点击播放/暂停" @click="toggleMusic()">
      <span class="mf-ic">{{ musicOn ? '🎵' : '🔇' }}</span>
      <span class="mf-name">{{ musicOn && musicList[musicIndex] ? musicList[musicIndex].name : '背景音乐' }}</span>
    </div>
    <!-- 萌宠 -->
    <div class="pet-float" title="我的萌宠：点击互动" @click="openPet()">
      <div v-if="bubble && !petMuted" class="pet-bubble">{{ bubble }}</div>
      <span class="pet-emoji">{{ petStage.emoji }}</span>
      <span class="pet-mood">{{ petMood.emoji }}</span>
    </div>
    <!-- 萌宠面板 -->
    <div v-if="petShow" class="ov show pet-ov" @click.self="petShow = false">
      <div class="pnl pet-pnl">
        <div class="pet-head">
          <span class="pet-big">{{ petStage.emoji }}</span>
          <div class="pet-id">
            <div class="pet-name">{{ pet.name }} <span class="pet-lv">Lv.{{ petLevel }} · {{ petStage.name }}</span></div>
            <div class="pet-moodline">心情：{{ petMood.emoji }} {{ petMood.label }}</div>
          </div>
          <button class="pc-close" @click="petShow = false">✕</button>
        </div>
        <div v-if="bubble && !petMuted" class="pet-talk">{{ bubble }}</div>
        <div class="pet-bar-row">
          <span class="pbl">成长</span>
          <div class="bar"><div class="bar-fill" :style="{ width: Math.min(100, petLevel * 10) + '%' }"></div></div>
          <span class="pet-xp">{{ petPoints }} 积分</span>
        </div>
        <div v-if="petNextName" class="pet-next">距「{{ petNextName.emoji }} {{ petNextName.name }}」还需 {{ Math.max(0, (Number(petNextXp) || 0) - (Number(petPoints) || 0)) }} 积分
          <div class="bar"><div class="bar-fill next" :style="{ width: Math.min(100, (petPoints / petNextXp) * 100) + '%' }"></div></div>
        </div>
        <div class="pet-bar-row">
          <span class="pbl">饱食度</span>
          <div class="bar"><div class="bar-fill food" :style="{ width: petHunger * 10 + '%' }"></div></div>
          <span>{{ petHunger }}/10</span>
        </div>
        <div class="pet-stats">
          <div class="ps-i">💬 提问 <b>{{ petStats.asks }}</b></div>
          <div class="ps-i">✍️ 问答 <b>{{ petStats.answers }}</b></div>
          <div class="ps-i">📋 错题 <b>{{ petStats.wrongs }}</b></div>
          <div class="ps-i">✅ 复盘 <b>{{ petStats.reviewed }}</b></div>
          <div class="ps-i">🔥 打卡 <b>{{ petStats.streak }}</b> 天</div>
        </div>
        <div class="pet-note">喂食需 5 学习积分：每次 AI 回复 +1，错题二刷/三刷 +2。萌宠随时间会饿，饿久了会闹情绪哦。</div>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="petShow = false">关闭</button>
          <button class="btn btn-gh" @click="patPet()">🐾 摸头</button>
          <button class="btn btn-pri" @click="doFeed()">🍖 喂食(-5分)</button>
        </div>
        <div class="pet-rename">
          <input v-model="petNameInput" :placeholder="'给 ' + pet.name + ' 改名…'" style="flex:1" @keydown.enter="doRename()" />
          <button class="btn btn-gh" @click="doRename()">改名</button>
        </div>
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


    <!-- 背景音乐浮动控件 -->
    <div class="music-float" :class="{ on: musicOn }" title="背景音乐：点击播放/暂停" @click="toggleMusic()">
      <span class="mf-ic">{{ musicOn ? '🎵' : '🔇' }}</span>
      <span class="mf-name">{{ musicOn && musicList[musicIndex] ? musicList[musicIndex].name : '背景音乐' }}</span>
    </div>
    <!-- 萌宠 -->
    <div class="pet-float" title="我的萌宠：点击互动" @click="openPet()">
      <div v-if="bubble && !petMuted" class="pet-bubble">{{ bubble }}</div>
      <span class="pet-emoji">{{ petStage.emoji }}</span>
      <span class="pet-mood">{{ petMood.emoji }}</span>
    </div>
    <!-- 萌宠面板 -->
    <div v-if="petShow" class="ov show pet-ov" @click.self="petShow = false">
      <div class="pnl pet-pnl">
        <div class="pet-head">
          <span class="pet-big">{{ petStage.emoji }}</span>
          <div class="pet-id">
            <div class="pet-name">{{ pet.name }} <span class="pet-lv">Lv.{{ petLevel }} · {{ petStage.name }}</span></div>
            <div class="pet-moodline">心情：{{ petMood.emoji }} {{ petMood.label }}</div>
          </div>
          <button class="pc-close" @click="petShow = false">✕</button>
        </div>
        <div v-if="bubble && !petMuted" class="pet-talk">{{ bubble }}</div>
        <div class="pet-bar-row">
          <span class="pbl">成长</span>
          <div class="bar"><div class="bar-fill" :style="{ width: Math.min(100, petLevel * 10) + '%' }"></div></div>
          <span class="pet-xp">{{ petPoints }} 积分</span>
        </div>
        <div v-if="petNextName" class="pet-next">距「{{ petNextName.emoji }} {{ petNextName.name }}」还需 {{ Math.max(0, (Number(petNextXp) || 0) - (Number(petPoints) || 0)) }} 积分
          <div class="bar"><div class="bar-fill next" :style="{ width: Math.min(100, (petPoints / petNextXp) * 100) + '%' }"></div></div>
        </div>
        <div class="pet-bar-row">
          <span class="pbl">饱食度</span>
          <div class="bar"><div class="bar-fill food" :style="{ width: petHunger * 10 + '%' }"></div></div>
          <span>{{ petHunger }}/10</span>
        </div>
        <div class="pet-stats">
          <div class="ps-i">💬 提问 <b>{{ petStats.asks }}</b></div>
          <div class="ps-i">✍️ 问答 <b>{{ petStats.answers }}</b></div>
          <div class="ps-i">📋 错题 <b>{{ petStats.wrongs }}</b></div>
          <div class="ps-i">✅ 复盘 <b>{{ petStats.reviewed }}</b></div>
          <div class="ps-i">🔥 打卡 <b>{{ petStats.streak }}</b> 天</div>
        </div>
        <div class="pet-note">喂食需 5 学习积分：每次 AI 回复 +1，错题二刷/三刷 +2。萌宠随时间会饿，饿久了会闹情绪哦。</div>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="petShow = false">关闭</button>
          <button class="btn btn-gh" @click="patPet()">🐾 摸头</button>
          <button class="btn btn-pri" @click="doFeed()">🍖 喂食(-5分)</button>
        </div>
        <div class="pet-rename">
          <input v-model="petNameInput" :placeholder="'给 ' + pet.name + ' 改名…'" style="flex:1" @keydown.enter="doRename()" />
          <button class="btn btn-gh" @click="doRename()">改名</button>
        </div>
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


    <!-- 背景音乐浮动控件 -->
    <div class="music-float" :class="{ on: musicOn }" title="背景音乐：点击播放/暂停" @click="toggleMusic()">
      <span class="mf-ic">{{ musicOn ? '🎵' : '🔇' }}</span>
      <span class="mf-name">{{ musicOn && musicList[musicIndex] ? musicList[musicIndex].name : '背景音乐' }}</span>
    </div>
    <!-- 萌宠 -->
    <div class="pet-float" title="我的萌宠：点击互动" @click="openPet()">
      <div v-if="bubble && !petMuted" class="pet-bubble">{{ bubble }}</div>
      <span class="pet-emoji">{{ petStage.emoji }}</span>
      <span class="pet-mood">{{ petMood.emoji }}</span>
    </div>
    <!-- 萌宠面板 -->
    <div v-if="petShow" class="ov show pet-ov" @click.self="petShow = false">
      <div class="pnl pet-pnl">
        <div class="pet-head">
          <span class="pet-big">{{ petStage.emoji }}</span>
          <div class="pet-id">
            <div class="pet-name">{{ pet.name }} <span class="pet-lv">Lv.{{ petLevel }} · {{ petStage.name }}</span></div>
            <div class="pet-moodline">心情：{{ petMood.emoji }} {{ petMood.label }}</div>
          </div>
          <button class="pc-close" @click="petShow = false">✕</button>
        </div>
        <div v-if="bubble && !petMuted" class="pet-talk">{{ bubble }}</div>
        <div class="pet-bar-row">
          <span class="pbl">成长</span>
          <div class="bar"><div class="bar-fill" :style="{ width: Math.min(100, petLevel * 10) + '%' }"></div></div>
          <span class="pet-xp">{{ petPoints }} 积分</span>
        </div>
        <div v-if="petNextName" class="pet-next">距「{{ petNextName.emoji }} {{ petNextName.name }}」还需 {{ Math.max(0, (Number(petNextXp) || 0) - (Number(petPoints) || 0)) }} 积分
          <div class="bar"><div class="bar-fill next" :style="{ width: Math.min(100, (petPoints / petNextXp) * 100) + '%' }"></div></div>
        </div>
        <div class="pet-bar-row">
          <span class="pbl">饱食度</span>
          <div class="bar"><div class="bar-fill food" :style="{ width: petHunger * 10 + '%' }"></div></div>
          <span>{{ petHunger }}/10</span>
        </div>
        <div class="pet-stats">
          <div class="ps-i">💬 提问 <b>{{ petStats.asks }}</b></div>
          <div class="ps-i">✍️ 问答 <b>{{ petStats.answers }}</b></div>
          <div class="ps-i">📋 错题 <b>{{ petStats.wrongs }}</b></div>
          <div class="ps-i">✅ 复盘 <b>{{ petStats.reviewed }}</b></div>
          <div class="ps-i">🔥 打卡 <b>{{ petStats.streak }}</b> 天</div>
        </div>
        <div class="pet-note">喂食需 5 学习积分：每次 AI 回复 +1，错题二刷/三刷 +2。萌宠随时间会饿，饿久了会闹情绪哦。</div>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="petShow = false">关闭</button>
          <button class="btn btn-gh" @click="patPet()">🐾 摸头</button>
          <button class="btn btn-pri" @click="doFeed()">🍖 喂食(-5分)</button>
        </div>
        <div class="pet-rename">
          <input v-model="petNameInput" :placeholder="'给 ' + pet.name + ' 改名…'" style="flex:1" @keydown.enter="doRename()" />
          <button class="btn btn-gh" @click="doRename()">改名</button>
        </div>
      </div>
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
        <button class="btn" style="padding: 4px 12px; font-size: 13px" title="切换 3D 全景 / 2D 清爽视图" @click="toggleView()">
          {{ store.cfg.view3d ? '◉ 3D' : '◒ 2D' }}
        </button>
        <button class="btn" style="padding: 4px 12px; font-size: 13px" @click="openExp('chat')">📤 导出</button>
        <button class="btn" style="padding: 4px 12px; font-size: 13px" @click="openSet()">⚙️ 设置</button>
        <button class="btn" style="padding: 4px 12px; font-size: 13px" @click="doTheme()">
          {{ theme === 'light' ? '🌙' : '☀️' }}
        </button>
      </div>
    </header>
    <ExamBar />
    <nav class="tabs">
      <button v-for="t in tabs" :key="t.k" class="tab" :class="{ on: store.tab === t.k }" @click="store.tab = t.k">
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
    <div class="pg" :class="{ on: store.tab === 'ths' }"><FloatPanel /></div>
    <!-- 设置弹窗 -->
    <div class="ov" :class="{ show: setShow }" @click.self="setShow = false">
      <div class="pnl">
        <h3>⚙️ API 设置（文字/视觉 双模型）</h3>
        <div class="set-nav">
          <button v-for="n in setNav" :key="n.id" class="set-nav-b" @click="scrollSet(n.id)">{{ n.t }}</button>
        </div>
        <button class="btn btn-gh set-tour-btn" @click="openTour()">❓ 设置引导（逐项讲解）</button>
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


        <div id="set-vision" class="sec-t">👁️ 视觉模型（图片/截图题 · 默认 DeepSeek 视觉，可选智谱 GLM-5V）</div>
        <div class="vis-tip">
          📌
          <b>截图/图片题必须配此模型才能看图</b>
          （图推图形、资料表格、数学公式）。启用步骤：①提供商选「DeepSeek（推荐，用同一个 Key）」或「智谱」②粘贴你的 Key
          ③点下方「保存并测试」。若未配置，发图时会提示改用文字描述。
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


        <div id="set-voice" class="sec-t">🗣️ 语音 · 场景音色</div>
        <div class="fld">
          <label>朗读音色</label>
          <select v-model="store.cfg.ttsScene" @change="saveCfg()">
            <option v-for="s in SCENES" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
          <div style="font-size: 11px; color: var(--text3); margin-top: 4px">
            自动匹配最贴近的系统语音；如需更明显的角色感，可配合下方语速/音调。
          </div>
        <div class="sec-t">🎙️ 本机语音（可选 · 覆盖场景音色）</div>
        <div class="fld">
          <select v-model="store.cfg.ttsVoice" @change="saveCfg()">
            <option value="">（跟随上方场景音色）</option>
            <option v-for="v in sysVoices" :key="v.voiceURI || v.name" :value="v.name">{{ v.name }} · {{ v.lang }}</option>
          </select>
          <div style="display: flex; gap: 6px; margin-top: 6px">
            <button class="btn btn-gh" style="font-size: 12px" @click="loadSysVoices()">🔄 刷新语音</button>
            <button class="btn btn-gh" style="font-size: 12px" @click="ttsTestVoice()">▶️ 试听本机语音</button>
          </div>
          <div style="font-size: 11px; color: var(--text3); margin-top: 4px">
            已检测到 {{ sysVoices.length }} 个系统语音。想添加更多本地语音：Windows → 设置 → 时间和语言 → 语音 → 添加语音（如 中文(普通话)）；macOS → 系统设置 → 辅助功能 → 朗读内容 → 系统声音。开源引擎（如 Piper/Edge TTS）生成的语音需配合在线或本地 TTS 服务使用，浏览器无法直接读模型文件。
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
        <div class="fld">
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
        <div class="exp-choices" style="grid-template-columns: 1fr 1fr">
          <button class="btn btn-gh" @click="ttsTest()">▶️ 试听音色</button>
          <button
            class="btn btn-gh"
            @click="speak('感谢收听，我们继续练习吧。', { scene: store.cfg.ttsScene, rate: store.cfg.ttsRate, pitch: store.cfg.ttsPitch })"
          >
            ⏹ 换句试听
          </button>
        </div>
        <div id="set-look" class="sec-t">🎨 外观</div>
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
        <div class="fld">
          <label>主题（顶栏 ☀️/🌙 也可切换）</label>
          <button class="btn btn-gh" @click="doTheme()">{{ theme === 'light' ? '🌙 切到深色' : '☀️ 切到浅色' }}</button>
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
        <div class="sec-t">🐾 我的萌宠</div>
        <div class="fld">
          <label>
            <input v-model="petMuted" type="checkbox" @change="setPetMuted(petMuted)" />
            关闭萌宠气泡（隐藏互动文字）
          </label>
          <div style="font-size: 11px; color: var(--text3); margin-top: 4px">
            萌宠记录你的学习状态：每次 AI 回复 +1 积分、错题二刷/三刷 +2 积分，5 积分喂食一次；成长 🥚→🐣→🐥→🐔→🦉→🐲，随时间会饿、有作息与心情。点击右下角宠物可互动、改名、喂食。
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
              <li>💬 对话 → 刷题（可开「考场限时」或「📝 整卷模拟」），答完点「📌 存错题」；</li>
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
          <button class="btn btn-gh" @click="backupData()">⬇️ 导出备份(JSON)</button>
          <label class="btn btn-gh" style="text-align: center; margin: 0; cursor: pointer">
            ⬆️ 导入备份
            <input type="file" accept=".json" style="display: none" @change="importData" />
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
        <div id="set-about" class="sec-t">📜 关于 · 开发者说明</div>
        <div class="about-box">
          <p class="ab-warn">⚠️ 本项目仅供个人学习使用，切勿商用，违者必究。</p>
          <p><b>隐私与数据</b>：全部数据（对话/错题/知识库/设置）只保存在你自己的浏览器 localStorage，应用无后端服务器、不上传任何数据；API Key 也只存本机。可用「数据管理 → 导出/导入备份、WebDAV 云同步、保存到本地文件夹」迁移。</p>
          <p><b>开发者说明</b>：本项目为个人备考自用工具（Vue3 + Vite + PWA）。技术栈与构建见仓库 README / PROJECT_ROADMAP；`01_源码` 为唯一活跃源码，`scripts/sync-dist.ps1` 一键构建并同步三端（网页/发布包/安卓 web 资源）。欢迎在个人学习范围内二次开发。</p>
          <p><b>使用提示</b>：首次使用请先完成引导（设置 API Key 与视觉模型）；刷题→存错题→二刷复盘→积累记忆→统计→导出，形成闭环提分。</p>
        </div>
        <div class="sec-t">ℹ️ 模型说明</div>
        <div style="font-size: 12px; color: var(--text3); line-height: 1.7">
          文字题（纯文字）走「文字模型」，默认 DeepSeek
          deepseek-v4-flash（便宜、中文好）；带图/公式题走「视觉模型」，默认 DeepSeek
          deepseek-v4-flash-vision-exp（能看图、识别公式符号），也可在设置里换智谱
          GLM-5V。截图提问需配置并勾选视觉模型。
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
        <h3>📤 导出</h3>
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


    <!-- 背景音乐浮动控件 -->
    <div class="music-float" :class="{ on: musicOn }" title="背景音乐：点击播放/暂停" @click="toggleMusic()">
      <span class="mf-ic">{{ musicOn ? '🎵' : '🔇' }}</span>
      <span class="mf-name">{{ musicOn && musicList[musicIndex] ? musicList[musicIndex].name : '背景音乐' }}</span>
    </div>
    <!-- 萌宠 -->
    <div class="pet-float" title="我的萌宠：点击互动" @click="openPet()">
      <div v-if="bubble && !petMuted" class="pet-bubble">{{ bubble }}</div>
      <span class="pet-emoji">{{ petStage.emoji }}</span>
      <span class="pet-mood">{{ petMood.emoji }}</span>
    </div>
    <!-- 萌宠面板 -->
    <div v-if="petShow" class="ov show pet-ov" @click.self="petShow = false">
      <div class="pnl pet-pnl">
        <div class="pet-head">
          <span class="pet-big">{{ petStage.emoji }}</span>
          <div class="pet-id">
            <div class="pet-name">{{ pet.name }} <span class="pet-lv">Lv.{{ petLevel }} · {{ petStage.name }}</span></div>
            <div class="pet-moodline">心情：{{ petMood.emoji }} {{ petMood.label }}</div>
          </div>
          <button class="pc-close" @click="petShow = false">✕</button>
        </div>
        <div v-if="bubble && !petMuted" class="pet-talk">{{ bubble }}</div>
        <div class="pet-bar-row">
          <span class="pbl">成长</span>
          <div class="bar"><div class="bar-fill" :style="{ width: Math.min(100, petLevel * 10) + '%' }"></div></div>
          <span class="pet-xp">{{ petPoints }} 积分</span>
        </div>
        <div v-if="petNextName" class="pet-next">距「{{ petNextName.emoji }} {{ petNextName.name }}」还需 {{ Math.max(0, (Number(petNextXp) || 0) - (Number(petPoints) || 0)) }} 积分
          <div class="bar"><div class="bar-fill next" :style="{ width: Math.min(100, (petPoints / petNextXp) * 100) + '%' }"></div></div>
        </div>
        <div class="pet-bar-row">
          <span class="pbl">饱食度</span>
          <div class="bar"><div class="bar-fill food" :style="{ width: petHunger * 10 + '%' }"></div></div>
          <span>{{ petHunger }}/10</span>
        </div>
        <div class="pet-stats">
          <div class="ps-i">💬 提问 <b>{{ petStats.asks }}</b></div>
          <div class="ps-i">✍️ 问答 <b>{{ petStats.answers }}</b></div>
          <div class="ps-i">📋 错题 <b>{{ petStats.wrongs }}</b></div>
          <div class="ps-i">✅ 复盘 <b>{{ petStats.reviewed }}</b></div>
          <div class="ps-i">🔥 打卡 <b>{{ petStats.streak }}</b> 天</div>
        </div>
        <div class="pet-note">喂食需 5 学习积分：每次 AI 回复 +1，错题二刷/三刷 +2。萌宠随时间会饿，饿久了会闹情绪哦。</div>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="petShow = false">关闭</button>
          <button class="btn btn-gh" @click="patPet()">🐾 摸头</button>
          <button class="btn btn-pri" @click="doFeed()">🍖 喂食(-5分)</button>
        </div>
        <div class="pet-rename">
          <input v-model="petNameInput" :placeholder="'给 ' + pet.name + ' 改名…'" style="flex:1" @keydown.enter="doRename()" />
          <button class="btn btn-gh" @click="doRename()">改名</button>
        </div>
      </div>
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


    <!-- 背景音乐浮动控件 -->
    <div class="music-float" :class="{ on: musicOn }" title="背景音乐：点击播放/暂停" @click="toggleMusic()">
      <span class="mf-ic">{{ musicOn ? '🎵' : '🔇' }}</span>
      <span class="mf-name">{{ musicOn && musicList[musicIndex] ? musicList[musicIndex].name : '背景音乐' }}</span>
    </div>
    <!-- 萌宠 -->
    <div class="pet-float" title="我的萌宠：点击互动" @click="openPet()">
      <div v-if="bubble && !petMuted" class="pet-bubble">{{ bubble }}</div>
      <span class="pet-emoji">{{ petStage.emoji }}</span>
      <span class="pet-mood">{{ petMood.emoji }}</span>
    </div>
    <!-- 萌宠面板 -->
    <div v-if="petShow" class="ov show pet-ov" @click.self="petShow = false">
      <div class="pnl pet-pnl">
        <div class="pet-head">
          <span class="pet-big">{{ petStage.emoji }}</span>
          <div class="pet-id">
            <div class="pet-name">{{ pet.name }} <span class="pet-lv">Lv.{{ petLevel }} · {{ petStage.name }}</span></div>
            <div class="pet-moodline">心情：{{ petMood.emoji }} {{ petMood.label }}</div>
          </div>
          <button class="pc-close" @click="petShow = false">✕</button>
        </div>
        <div v-if="bubble && !petMuted" class="pet-talk">{{ bubble }}</div>
        <div class="pet-bar-row">
          <span class="pbl">成长</span>
          <div class="bar"><div class="bar-fill" :style="{ width: Math.min(100, petLevel * 10) + '%' }"></div></div>
          <span class="pet-xp">{{ petPoints }} 积分</span>
        </div>
        <div v-if="petNextName" class="pet-next">距「{{ petNextName.emoji }} {{ petNextName.name }}」还需 {{ Math.max(0, (Number(petNextXp) || 0) - (Number(petPoints) || 0)) }} 积分
          <div class="bar"><div class="bar-fill next" :style="{ width: Math.min(100, (petPoints / petNextXp) * 100) + '%' }"></div></div>
        </div>
        <div class="pet-bar-row">
          <span class="pbl">饱食度</span>
          <div class="bar"><div class="bar-fill food" :style="{ width: petHunger * 10 + '%' }"></div></div>
          <span>{{ petHunger }}/10</span>
        </div>
        <div class="pet-stats">
          <div class="ps-i">💬 提问 <b>{{ petStats.asks }}</b></div>
          <div class="ps-i">✍️ 问答 <b>{{ petStats.answers }}</b></div>
          <div class="ps-i">📋 错题 <b>{{ petStats.wrongs }}</b></div>
          <div class="ps-i">✅ 复盘 <b>{{ petStats.reviewed }}</b></div>
          <div class="ps-i">🔥 打卡 <b>{{ petStats.streak }}</b> 天</div>
        </div>
        <div class="pet-note">喂食需 5 学习积分：每次 AI 回复 +1，错题二刷/三刷 +2。萌宠随时间会饿，饿久了会闹情绪哦。</div>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="petShow = false">关闭</button>
          <button class="btn btn-gh" @click="patPet()">🐾 摸头</button>
          <button class="btn btn-pri" @click="doFeed()">🍖 喂食(-5分)</button>
        </div>
        <div class="pet-rename">
          <input v-model="petNameInput" :placeholder="'给 ' + pet.name + ' 改名…'" style="flex:1" @keydown.enter="doRename()" />
          <button class="btn btn-gh" @click="doRename()">改名</button>
        </div>
      </div>
    </div>


</template>

        <template v-else-if="obStep === 2">
          <h3>② 配置视觉模型（图片/截图题）</h3>
          <div class="ob-body">
            <p>图推图形、资料表格、数学公式需要视觉模型。用 DeepSeek 时可直接用 <b>同一个 Key</b>：</p>
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


    <!-- 背景音乐浮动控件 -->
    <div class="music-float" :class="{ on: musicOn }" title="背景音乐：点击播放/暂停" @click="toggleMusic()">
      <span class="mf-ic">{{ musicOn ? '🎵' : '🔇' }}</span>
      <span class="mf-name">{{ musicOn && musicList[musicIndex] ? musicList[musicIndex].name : '背景音乐' }}</span>
    </div>
    <!-- 萌宠 -->
    <div class="pet-float" title="我的萌宠：点击互动" @click="openPet()">
      <div v-if="bubble && !petMuted" class="pet-bubble">{{ bubble }}</div>
      <span class="pet-emoji">{{ petStage.emoji }}</span>
      <span class="pet-mood">{{ petMood.emoji }}</span>
    </div>
    <!-- 萌宠面板 -->
    <div v-if="petShow" class="ov show pet-ov" @click.self="petShow = false">
      <div class="pnl pet-pnl">
        <div class="pet-head">
          <span class="pet-big">{{ petStage.emoji }}</span>
          <div class="pet-id">
            <div class="pet-name">{{ pet.name }} <span class="pet-lv">Lv.{{ petLevel }} · {{ petStage.name }}</span></div>
            <div class="pet-moodline">心情：{{ petMood.emoji }} {{ petMood.label }}</div>
          </div>
          <button class="pc-close" @click="petShow = false">✕</button>
        </div>
        <div v-if="bubble && !petMuted" class="pet-talk">{{ bubble }}</div>
        <div class="pet-bar-row">
          <span class="pbl">成长</span>
          <div class="bar"><div class="bar-fill" :style="{ width: Math.min(100, petLevel * 10) + '%' }"></div></div>
          <span class="pet-xp">{{ petPoints }} 积分</span>
        </div>
        <div v-if="petNextName" class="pet-next">距「{{ petNextName.emoji }} {{ petNextName.name }}」还需 {{ Math.max(0, (Number(petNextXp) || 0) - (Number(petPoints) || 0)) }} 积分
          <div class="bar"><div class="bar-fill next" :style="{ width: Math.min(100, (petPoints / petNextXp) * 100) + '%' }"></div></div>
        </div>
        <div class="pet-bar-row">
          <span class="pbl">饱食度</span>
          <div class="bar"><div class="bar-fill food" :style="{ width: petHunger * 10 + '%' }"></div></div>
          <span>{{ petHunger }}/10</span>
        </div>
        <div class="pet-stats">
          <div class="ps-i">💬 提问 <b>{{ petStats.asks }}</b></div>
          <div class="ps-i">✍️ 问答 <b>{{ petStats.answers }}</b></div>
          <div class="ps-i">📋 错题 <b>{{ petStats.wrongs }}</b></div>
          <div class="ps-i">✅ 复盘 <b>{{ petStats.reviewed }}</b></div>
          <div class="ps-i">🔥 打卡 <b>{{ petStats.streak }}</b> 天</div>
        </div>
        <div class="pet-note">喂食需 5 学习积分：每次 AI 回复 +1，错题二刷/三刷 +2。萌宠随时间会饿，饿久了会闹情绪哦。</div>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="petShow = false">关闭</button>
          <button class="btn btn-gh" @click="patPet()">🐾 摸头</button>
          <button class="btn btn-pri" @click="doFeed()">🍖 喂食(-5分)</button>
        </div>
        <div class="pet-rename">
          <input v-model="petNameInput" :placeholder="'给 ' + pet.name + ' 改名…'" style="flex:1" @keydown.enter="doRename()" />
          <button class="btn btn-gh" @click="doRename()">改名</button>
        </div>
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


    <!-- 背景音乐浮动控件 -->
    <div class="music-float" :class="{ on: musicOn }" title="背景音乐：点击播放/暂停" @click="toggleMusic()">
      <span class="mf-ic">{{ musicOn ? '🎵' : '🔇' }}</span>
      <span class="mf-name">{{ musicOn && musicList[musicIndex] ? musicList[musicIndex].name : '背景音乐' }}</span>
    </div>
    <!-- 萌宠 -->
    <div class="pet-float" title="我的萌宠：点击互动" @click="openPet()">
      <div v-if="bubble && !petMuted" class="pet-bubble">{{ bubble }}</div>
      <span class="pet-emoji">{{ petStage.emoji }}</span>
      <span class="pet-mood">{{ petMood.emoji }}</span>
    </div>
    <!-- 萌宠面板 -->
    <div v-if="petShow" class="ov show pet-ov" @click.self="petShow = false">
      <div class="pnl pet-pnl">
        <div class="pet-head">
          <span class="pet-big">{{ petStage.emoji }}</span>
          <div class="pet-id">
            <div class="pet-name">{{ pet.name }} <span class="pet-lv">Lv.{{ petLevel }} · {{ petStage.name }}</span></div>
            <div class="pet-moodline">心情：{{ petMood.emoji }} {{ petMood.label }}</div>
          </div>
          <button class="pc-close" @click="petShow = false">✕</button>
        </div>
        <div v-if="bubble && !petMuted" class="pet-talk">{{ bubble }}</div>
        <div class="pet-bar-row">
          <span class="pbl">成长</span>
          <div class="bar"><div class="bar-fill" :style="{ width: Math.min(100, petLevel * 10) + '%' }"></div></div>
          <span class="pet-xp">{{ petPoints }} 积分</span>
        </div>
        <div v-if="petNextName" class="pet-next">距「{{ petNextName.emoji }} {{ petNextName.name }}」还需 {{ Math.max(0, (Number(petNextXp) || 0) - (Number(petPoints) || 0)) }} 积分
          <div class="bar"><div class="bar-fill next" :style="{ width: Math.min(100, (petPoints / petNextXp) * 100) + '%' }"></div></div>
        </div>
        <div class="pet-bar-row">
          <span class="pbl">饱食度</span>
          <div class="bar"><div class="bar-fill food" :style="{ width: petHunger * 10 + '%' }"></div></div>
          <span>{{ petHunger }}/10</span>
        </div>
        <div class="pet-stats">
          <div class="ps-i">💬 提问 <b>{{ petStats.asks }}</b></div>
          <div class="ps-i">✍️ 问答 <b>{{ petStats.answers }}</b></div>
          <div class="ps-i">📋 错题 <b>{{ petStats.wrongs }}</b></div>
          <div class="ps-i">✅ 复盘 <b>{{ petStats.reviewed }}</b></div>
          <div class="ps-i">🔥 打卡 <b>{{ petStats.streak }}</b> 天</div>
        </div>
        <div class="pet-note">喂食需 5 学习积分：每次 AI 回复 +1，错题二刷/三刷 +2。萌宠随时间会饿，饿久了会闹情绪哦。</div>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="petShow = false">关闭</button>
          <button class="btn btn-gh" @click="patPet()">🐾 摸头</button>
          <button class="btn btn-pri" @click="doFeed()">🍖 喂食(-5分)</button>
        </div>
        <div class="pet-rename">
          <input v-model="petNameInput" :placeholder="'给 ' + pet.name + ' 改名…'" style="flex:1" @keydown.enter="doRename()" />
          <button class="btn btn-gh" @click="doRename()">改名</button>
        </div>
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


    <!-- 背景音乐浮动控件 -->
    <div class="music-float" :class="{ on: musicOn }" title="背景音乐：点击播放/暂停" @click="toggleMusic()">
      <span class="mf-ic">{{ musicOn ? '🎵' : '🔇' }}</span>
      <span class="mf-name">{{ musicOn && musicList[musicIndex] ? musicList[musicIndex].name : '背景音乐' }}</span>
    </div>
    <!-- 萌宠 -->
    <div class="pet-float" title="我的萌宠：点击互动" @click="openPet()">
      <div v-if="bubble && !petMuted" class="pet-bubble">{{ bubble }}</div>
      <span class="pet-emoji">{{ petStage.emoji }}</span>
      <span class="pet-mood">{{ petMood.emoji }}</span>
    </div>
    <!-- 萌宠面板 -->
    <div v-if="petShow" class="ov show pet-ov" @click.self="petShow = false">
      <div class="pnl pet-pnl">
        <div class="pet-head">
          <span class="pet-big">{{ petStage.emoji }}</span>
          <div class="pet-id">
            <div class="pet-name">{{ pet.name }} <span class="pet-lv">Lv.{{ petLevel }} · {{ petStage.name }}</span></div>
            <div class="pet-moodline">心情：{{ petMood.emoji }} {{ petMood.label }}</div>
          </div>
          <button class="pc-close" @click="petShow = false">✕</button>
        </div>
        <div v-if="bubble && !petMuted" class="pet-talk">{{ bubble }}</div>
        <div class="pet-bar-row">
          <span class="pbl">成长</span>
          <div class="bar"><div class="bar-fill" :style="{ width: Math.min(100, petLevel * 10) + '%' }"></div></div>
          <span class="pet-xp">{{ petPoints }} 积分</span>
        </div>
        <div v-if="petNextName" class="pet-next">距「{{ petNextName.emoji }} {{ petNextName.name }}」还需 {{ Math.max(0, (Number(petNextXp) || 0) - (Number(petPoints) || 0)) }} 积分
          <div class="bar"><div class="bar-fill next" :style="{ width: Math.min(100, (petPoints / petNextXp) * 100) + '%' }"></div></div>
        </div>
        <div class="pet-bar-row">
          <span class="pbl">饱食度</span>
          <div class="bar"><div class="bar-fill food" :style="{ width: petHunger * 10 + '%' }"></div></div>
          <span>{{ petHunger }}/10</span>
        </div>
        <div class="pet-stats">
          <div class="ps-i">💬 提问 <b>{{ petStats.asks }}</b></div>
          <div class="ps-i">✍️ 问答 <b>{{ petStats.answers }}</b></div>
          <div class="ps-i">📋 错题 <b>{{ petStats.wrongs }}</b></div>
          <div class="ps-i">✅ 复盘 <b>{{ petStats.reviewed }}</b></div>
          <div class="ps-i">🔥 打卡 <b>{{ petStats.streak }}</b> 天</div>
        </div>
        <div class="pet-note">喂食需 5 学习积分：每次 AI 回复 +1，错题二刷/三刷 +2。萌宠随时间会饿，饿久了会闹情绪哦。</div>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="petShow = false">关闭</button>
          <button class="btn btn-gh" @click="patPet()">🐾 摸头</button>
          <button class="btn btn-pri" @click="doFeed()">🍖 喂食(-5分)</button>
        </div>
        <div class="pet-rename">
          <input v-model="petNameInput" :placeholder="'给 ' + pet.name + ' 改名…'" style="flex:1" @keydown.enter="doRename()" />
          <button class="btn btn-gh" @click="doRename()">改名</button>
        </div>
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


    <!-- 背景音乐浮动控件 -->
    <div class="music-float" :class="{ on: musicOn }" title="背景音乐：点击播放/暂停" @click="toggleMusic()">
      <span class="mf-ic">{{ musicOn ? '🎵' : '🔇' }}</span>
      <span class="mf-name">{{ musicOn && musicList[musicIndex] ? musicList[musicIndex].name : '背景音乐' }}</span>
    </div>
    <!-- 萌宠 -->
    <div class="pet-float" title="我的萌宠：点击互动" @click="openPet()">
      <div v-if="bubble && !petMuted" class="pet-bubble">{{ bubble }}</div>
      <span class="pet-emoji">{{ petStage.emoji }}</span>
      <span class="pet-mood">{{ petMood.emoji }}</span>
    </div>
    <!-- 萌宠面板 -->
    <div v-if="petShow" class="ov show pet-ov" @click.self="petShow = false">
      <div class="pnl pet-pnl">
        <div class="pet-head">
          <span class="pet-big">{{ petStage.emoji }}</span>
          <div class="pet-id">
            <div class="pet-name">{{ pet.name }} <span class="pet-lv">Lv.{{ petLevel }} · {{ petStage.name }}</span></div>
            <div class="pet-moodline">心情：{{ petMood.emoji }} {{ petMood.label }}</div>
          </div>
          <button class="pc-close" @click="petShow = false">✕</button>
        </div>
        <div v-if="bubble && !petMuted" class="pet-talk">{{ bubble }}</div>
        <div class="pet-bar-row">
          <span class="pbl">成长</span>
          <div class="bar"><div class="bar-fill" :style="{ width: Math.min(100, petLevel * 10) + '%' }"></div></div>
          <span class="pet-xp">{{ petPoints }} 积分</span>
        </div>
        <div v-if="petNextName" class="pet-next">距「{{ petNextName.emoji }} {{ petNextName.name }}」还需 {{ Math.max(0, (Number(petNextXp) || 0) - (Number(petPoints) || 0)) }} 积分
          <div class="bar"><div class="bar-fill next" :style="{ width: Math.min(100, (petPoints / petNextXp) * 100) + '%' }"></div></div>
        </div>
        <div class="pet-bar-row">
          <span class="pbl">饱食度</span>
          <div class="bar"><div class="bar-fill food" :style="{ width: petHunger * 10 + '%' }"></div></div>
          <span>{{ petHunger }}/10</span>
        </div>
        <div class="pet-stats">
          <div class="ps-i">💬 提问 <b>{{ petStats.asks }}</b></div>
          <div class="ps-i">✍️ 问答 <b>{{ petStats.answers }}</b></div>
          <div class="ps-i">📋 错题 <b>{{ petStats.wrongs }}</b></div>
          <div class="ps-i">✅ 复盘 <b>{{ petStats.reviewed }}</b></div>
          <div class="ps-i">🔥 打卡 <b>{{ petStats.streak }}</b> 天</div>
        </div>
        <div class="pet-note">喂食需 5 学习积分：每次 AI 回复 +1，错题二刷/三刷 +2。萌宠随时间会饿，饿久了会闹情绪哦。</div>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="petShow = false">关闭</button>
          <button class="btn btn-gh" @click="patPet()">🐾 摸头</button>
          <button class="btn btn-pri" @click="doFeed()">🍖 喂食(-5分)</button>
        </div>
        <div class="pet-rename">
          <input v-model="petNameInput" :placeholder="'给 ' + pet.name + ' 改名…'" style="flex:1" @keydown.enter="doRename()" />
          <button class="btn btn-gh" @click="doRename()">改名</button>
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
