<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { store, saveMyMem, saveWqs, saveNotes, addWrong } from '../store'
import { chatOnce, activeCfg } from '../api'
import { showToast } from '../utils/toast'
import { on as evOn, off as evOff } from '../utils/events'
import { srsReviewedToday, srsMasteredCount } from '../utils/srsStats'
import { useAi } from '../utils/useAi'
import AccumOverview from './AccumOverview.vue' // v3.8.191 顶部概览子组件
import AccumToolbar from './AccumToolbar.vue' // v3.8.191 工具区子组件
import AccumContent from './AccumContent.vue' // v3.8.191 正文学习区
import AccumDialogs from './AccumDialogs.vue' // v3.8.191 详解/记忆库/笔记区
import { CHANGSHI, SHIZHENG, CHENGYU, SHICI, YUFEN_CHENGYU, YUFEN_SHICI, skillMemCS, skillMemZZ } from '../data/memoryPools' // v3.8.188 数据池单源
const { run: aiRun } = useAi()


const myMem = computed(() => store.myMem)
const CATS = ['政治理论', '法律', '科技', '人文历史', '地理国情', '经济', '生活常识']
const SZCATS = ['理论会议', '政策经济', '科技民生', '贵州地方']

// ===== 状态 =====
const cat = ref('常识')
// 批次7·S6：技能矩阵记忆词条接入积累池（常识12条+政治10条）
const cur = ref('')
const curRegion = ref('全部') // 时政地区筛选：全部/国内/贵州
const fCat = ref('全部') // 领域/类型筛选
const kw = ref('') // 搜索
const nowMonth = computed(() => {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
})

// 时政按时间+地区过滤（时政时间范围 szFrom 起、szTo 止或今日）
function shizhengAvailable() {
  const from = store.cfg.szFrom || '2025-10',
    to = store.cfg.szTo || nowMonth.value
  return SHIZHENG.filter((x) => {
    const r = x.region
    const okR = curRegion.value === '全部' || r === curRegion.value
    const d = x.date || ''
    const okD = (!from || d >= from) && (!to || d <= to)
    return okR && okD
  })
}
function pool(c) {
  let list = []
  if (c === '时政') {
    const mine = myMem.value.filter((x) => x.type === '时政').map((x) => ({ t: x.text, date: '', region: '我的', cat: '我的' }))
    list = shizhengAvailable().concat(skillMemZZ).concat(mine)
  } else if (c === '成语') {
    list = CHENGYU.concat(YUFEN_CHENGYU).concat(myMem.value.filter((x) => x.type === '成语').map((x) => ({ t: x.text, cat: '我的' })))
  } else if (c === '实词') {
    list = SHICI.concat(YUFEN_SHICI).concat(myMem.value.filter((x) => x.type === '实词').map((x) => ({ t: x.text, cat: '我的' })))
  } else {
    const mine = myMem.value.filter((x) => x.type === '常识').map((x) => ({ t: x.text, cat: '我的' }))
    list = CHANGSHI.concat(skillMemCS).concat(mine)
  }
  if (fCat.value && fCat.value !== '全部') list = list.filter((x) => x.cat === fCat.value)
  const k = kw.value.trim().toLowerCase()
  if (k) list = list.filter((x) => x.t.toLowerCase().includes(k))
  return list
}
const curDetail = computed(() => pool(cat.value).find((x) => x.t === cur.value) || null)
function pick(c) {
  const p = pool(c)
  if (!p.length) {
    cur.value = '（当前筛选下暂无条目，可调整筛选/搜索）'
    // 体验优化：本地库搜索无结果时，自动弹出联网查词（含 AI 知识卡 + 官网入口），
    // 不再需要用户手动再点一次"📡 联网查"
    const k = kw.value.trim()
    if (k && !lookupShow.value) {
      showToast('本地库暂无「' + k + '」，已自动为你联网查词', 'info')
      onlineLookup(k)
    }
    return
  }
  let arr = p
  if (reviewMode.value) {
    const due = p.filter((x) => {
      const s = srs.value[srsKey(x.t)]
      return !s || s.due <= todayKey()
    })
    if (due.length) arr = due
  }
  const o = arr[Math.floor(Math.random() * arr.length)]
  cur.value = o ? o.t : ''
}
function switchCat(c) {
  cat.value = c
  if (c !== '时政') curRegion.value = '全部'
  if (c !== '时政') fCat.value = '全部'
  pick(c)
}
function setRegion(r) {
  curRegion.value = r
  pick('时政')
}
function setCatFilter(v) {
  fCat.value = v
  pick(cat.value)
}
function searchPick() {
  pick(cat.value)
}
function next() {
  pick(cat.value)
}
function favorite() {
  if (!cur.value) return
  if (store.myMem.some((x) => x.text === cur.value)) {
    showToast('这条已在我的记忆库', 'info')
    return
  }
  store.myMem.push({ type: cat.value, text: cur.value, t: new Date().toLocaleString() })
  saveMyMem()
  showToast('✅ 已加入我的记忆库', 'success')
}

// ===== 积累 UI v2：学习路径引导 + 今日概览 + 学习统计 =====
const guideShow = ref(true)
try { if (localStorage.getItem('xc_acc_guide') === '0') guideShow.value = false } catch (e) {}
const moreShow = ref(false) // 「更多功能」折叠
function closeGuide() {
  guideShow.value = false
  try { localStorage.setItem('xc_acc_guide', '0') } catch (e) {}
}
// 今日学习统计（跨分类，localStorage 按日期存）
const DAILY_KEY = 'xc_acc_daily'
const DAILY_GOAL = 10
function loadDaily() {
  try { return JSON.parse(localStorage.getItem(DAILY_KEY) || '{}') || {} } catch (e) { return {} }
}
const daily = ref(loadDaily())
function saveDaily() {
  try { localStorage.setItem(DAILY_KEY, JSON.stringify(daily.value)) } catch (e) {}
}
const todayReviewed = computed(() => {
  const d = daily.value[todayKey()] || {}
  return { ok: d.ok || 0, no: d.no || 0, total: (d.ok || 0) + (d.no || 0) }
})
const todayGoalPct = computed(() => Math.min(100, Math.round((todayReviewed.value.total / DAILY_GOAL) * 100)))
function catKeyOf(c, t) { return c + '|' + t }
// 指定分类待复习条数（分类切换角标）
function dueOfCat(c) {
  const today = todayKey()
  return pool(c).filter((x) => {
    const s = srs.value[catKeyOf(c, x.t)]
    return !s || s.due <= today
  }).length
}
// 全分类今日待复习（概览大数字）
const dueCountAll = computed(() => ['常识', '时政', '成语', '实词'].reduce((n, c) => n + dueOfCat(c), 0))
// 艾宾浩斯阶段库存（1d/2d/4d/7d/15d/30d 各多少条在排队）
const srsStages = computed(() => {
  const stages = [0, 0, 0, 0, 0, 0]
  Object.values(srs.value).forEach((s) => {
    const lvl = Math.min(Math.max(0, (s.lvl || 0) - 1), 5)
    stages[lvl]++
  })
  return stages
})
// 一键开始学习：有待复习 → 进复习模式；否则随机学新
function startStudy() {
  if (dueCountAll.value > 0) {
    reviewMode.value = true
    pick(cat.value)
    showToast('🔁 进入复习：优先抽今日到期条目（共 ' + dueCountAll.value + ' 条）', 'info')
  } else {
    reviewMode.value = false
    pick(cat.value)
    showToast('🎲 今日无到期，开始学新知识', 'info')
  }
}

// ===== 常识 AI 出题交互 =====
const quiz = ref(null) // {q, opts:[], ans, type}
const picked = ref('') // 用户选的选项
const mark = ref(null) // true/false
const quizBusy = ref(false)
const seeExplain = ref('') // 解释/追问文本
const followQ = ref('')
function hasKey() {
  const c = activeCfg(false)
  return !!(c && c.key)
}
async function askQuiz(kind) {
  if (!hasKey()) {
    showToast('请先在设置配置 API Key', 'error')
    return
  }
  quizBusy.value = true
  quiz.value = null
  picked.value = ''
  mark.value = null
  seeExplain.value = ''
  const topic = cur.value || (cat.value === '常识' ? '常识知识点' : '时政知识点')
  let prompt
  if (kind === 'quiz')
    prompt =
      '你是行测常识判断命题专家。请基于下面这条知识点，出1道单选题（真题风格，难度中档）。命题要求：考点明确、题干无歧义、答案唯一；4个选项中3个干扰项各有明确错因（如绝对化/张冠李戴/时间陷阱/偷换概念/以偏概全/概念混淆），选项长度与信息量均衡、正确项位置随机、每个干扰项都要"似对实错"不能一眼排除。严格只输出 JSON，格式：{"问题":"题干","选项":["A. …","B. …","C. …","D. …"],"答案":0,"考点":"本题考点（含考频标注）"}\n知识点：' +
      topic.slice(0, 200)
  else
    prompt =
      '请为下面这条知识点写一段精炼的名师讲解（100-200字），解释生僻点、易错点、怎么记。\n知识点：' +
      topic.slice(0, 200)
  try {
    const c = activeCfg(false)
    const txt = await chatOnce(
      c,
      [
        { role: 'system', content: '你是资深公考老师，只输出用户要求的内容。' },
        { role: 'user', content: prompt }
      ],
      2000
    )
    if (kind === 'quiz') {
      const m = txt.match(/\{[\s\S]*\}/)
      if (!m) {
        throw new Error('AI返回格式异常')
      }
      const j = JSON.parse(m[0])
      quiz.value = { q: j.问题, opts: j.选项 || [], ans: j.答案, 考点: j.考点 || '常识' }
    } else seeExplain.value = txt || '（模型未生成内容，请重试）'
  } catch (e) {
    showToast('生成失败：' + e.message, 'error')
  } finally {
    quizBusy.value = false
  }
}
function choose(i) {
  if (!quiz.value) return
  picked.value = String.fromCharCode(65 + i)
  const right = i === quiz.value.ans
  mark.value = right
  // 答错 → 存错题集
  if (!right) {
    const q = '【常识出题自测】' + quiz.value.q + ' | 知识点源：' + (cur.value || '').slice(0, 60)
    addWrong({
      id: Date.now(),
      subject: '常识判断',
      question: q,
      answer: String.fromCharCode(65 + quiz.value.ans),
      reasons: [right ? '' : '知识点遗忘'],
      time: new Date().toLocaleString()
    })
    saveWqs()
  }
}
async function askFollow() {
  if (!followQ.value.trim()) return
  seeExplain.value = '（追问中…）'
  const t =
    '用户追问：' +
    followQ.value.trim() +
    ' 请结合该知识点精炼作答（100-200字）。\n知识点：' +
    (cur.value || '').slice(0, 150)
  try {
    const c = activeCfg(false)
    seeExplain.value =
      (await chatOnce(
        c,
        [
          { role: 'system', content: '你是考公名师，简明精准作答。' },
          { role: 'user', content: t }
        ],
        600
      )) || '（模型未生成内容，请重试）'
  } catch (e) {
    seeExplain.value = '追问失败：' + e.message
  }
}
// ===== 艾宾浩斯间隔重复（SRS）=====
const srs = ref({})
try {
  srs.value = JSON.parse(localStorage.getItem('xc_srs') || '{}') || {}
} catch (e) {}
const SRS_INT = [1, 2, 4, 7, 15, 30]
const todayKey = () => {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
function addDays(key, n) {
  const d = new Date(key)
  d.setDate(d.getDate() + n)
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
function srsKey(t) {
  return cat.value + '|' + t
}
const reviewMode = ref(false)
const dueList = computed(() => {
  const today = todayKey()
  return pool(cat.value).filter((t) => {
    const s = srs.value[srsKey(t)]
    return !s || s.due <= today
  })
})
const dueCount = computed(() => dueList.value.length)
function remember(ok) {
  const t = cur.value
  if (!t) return
  const k = srsKey(t)
  const s = srs.value[k] || { lvl: 0, due: todayKey() }
  if (ok) {
    s.lvl = Math.min(SRS_INT.length, (s.lvl || 0) + 1)
    // 第 lvl 次记住 → SRS_INT[lvl-1] 天后再复习（lvl=1 首次 = 1 天），与"1/2/4/7/15/30"对齐
    s.due = addDays(todayKey(), SRS_INT[Math.min(Math.max(0, s.lvl - 1), SRS_INT.length - 1)])
  } else {
    s.lvl = 0
    s.due = addDays(todayKey(), 1)
  }
  s.last = todayKey() // 统一存 YYYY-MM-DD，与 accStats.reviewedToday 的 todayKey() 一致
  srs.value[k] = s
  saveSrs()
  // 今日学习统计（概览卡实时更新）
  const dk = todayKey()
  const d = daily.value[dk] || { ok: 0, no: 0 }
  d[ok ? 'ok' : 'no'] = (d[ok ? 'ok' : 'no'] || 0) + 1
  daily.value[dk] = d
  saveDaily()
  showToast(ok ? '✅ 记住了 · ' + s.due + ' 再复习' : '❌ 没记住 · 明天再复习', ok ? 'success' : 'error')
  next()
}
function saveSrs() {
  try {
    localStorage.setItem('xc_srs', JSON.stringify(srs.value))
  } catch (e) {}
}
// ===== 我的导入笔记（Obsidian/Markdown）=====
const noteView = ref(null)
function viewNote(n) {
  noteView.value = n
}
function closeNote() {
  noteView.value = null
}
function copyNote(n) {
  if (!n) return
  const md = '---\ntags: [' + (n.tags || []).join(', ') + ']\nsource: 行测名师AI小助理\n---\n\n# ' + n.title + '\n\n' + String(n.body || '').trim()
  const done = () => showToast('已复制为 Obsidian 格式', 'success')
  const fail = () => showToast('复制失败', 'error')
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(md).then(done).catch(fail)
  } else {
    const ta = document.createElement('textarea')
    ta.value = md
    document.body.appendChild(ta)
    ta.select()
    try {
      document.execCommand('copy')
      done()
    } catch (e) {
      fail()
    }
    ta.remove()
  }
}
function delNote(i) {
  if (!confirm('删除这条导入笔记？')) return
  store.notes.splice(i, 1)
  saveNotes()
  if (noteView.value) noteView.value = null
}

const CY_CATS = ['易混', '高频易错', '高频']
const SC_CATS = ['易混', '高频']
const curCats = computed(() => {
  if (cat.value === '时政') return SZCATS
  if (cat.value === '成语') return CY_CATS
  if (cat.value === '实词') return SC_CATS
  return CATS
})

// ===== 词库来源引导（雨菲800词 + 易混词B5 融合后的可发现性）=====
// 基线池：不套 fCat/kw 过滤，仅用于统计各分类条数，让用户直观看到新增规模
function basePool(c) {
  if (c === '成语') return CHENGYU.concat(YUFEN_CHENGYU).concat(myMem.value.filter((x) => x.type === '成语').map((x) => ({ t: x.text, cat: '我的' })))
  if (c === '实词') return SHICI.concat(YUFEN_SHICI).concat(myMem.value.filter((x) => x.type === '实词').map((x) => ({ t: x.text, cat: '我的' })))
  return pool(c)
}
// 来源统计：让用户直观看到三个词库各自贡献多少条（尤其易混分类）
const srcStats = computed(() => {
  if (!isLex.value) return null
  const all = basePool(cat.value)
  const by = (s) => all.filter((x) => x.src === s).length
  return { 内置: all.filter((x) => !x.src).length, '雨菲800词': by('雨菲800词'), '半月谈': by('半月谈') }
})
const isLex = computed(() => cat.value === '成语' || cat.value === '实词')
const catTotal = computed(() => (isLex.value ? basePool(cat.value).length : 0))
// 搜索框提示随板块变化
const searchPh = computed(() => {
  if (cat.value === '成语') return '🔍 搜索成语…（如：相得益彰、浅尝辄止）回车随机抽一条'
  if (cat.value === '实词') return '🔍 搜索实词…（如：遏制、演化）回车随机抽一条'
  return '🔍 搜索常识/时政关键词…（回车/搜索按钮 随机抽一条匹配）'
})
// 常驻来源说明条（可关闭，关闭状态持久化）
const srcTipOff = ref(false)
try { srcTipOff.value = localStorage.getItem('xc_fp_srctip') === '1' } catch (e) {}
function dismissSrcTip() {
  srcTipOff.value = true
  try { localStorage.setItem('xc_fp_srctip', '1') } catch (e) {}
}
// 词库升级首次引导（一次性；切到成语/实词时才出现）
const lexGuide = ref(false)
try { lexGuide.value = localStorage.getItem('xc_fp_lexguide') !== '1' } catch (e) {}
function closeLexGuide() {
  lexGuide.value = false
  try { localStorage.setItem('xc_fp_lexguide', '1') } catch (e) {}
}
function tryYihun() {
  closeLexGuide()
  cat.value = '成语'
  fCat.value = '易混'
  pick('成语')
  showToast('已切到「易混」：雨菲800词·半月谈 的易混对都在这里，点「📖 详解/辨析」看辨析', 'success')
}
// 词条详情（成语/实词）
const detailShow = ref(false)
const detailItem = ref(null)
const aiDetail = ref('')
function openDetail() {
  const o = pool(cat.value).find((x) => x.t === cur.value)
  if (!o) return
  detailItem.value = o
  detailShow.value = true
  aiDetail.value = ''
}
async function aiExplainDetail() {
  if (!detailItem.value) return
  aiDetail.value = '（AI 生成中…）'
  const out = await aiRun(async (c) => {
    const item = detailItem.value
    const prompt =
      '请为公考逻辑填空常考词「' + item.t + '」生成一份助记卡片：①一句话秒记 ②3个搭配/例句 ③常见陷阱或易混词辨析 ④出现语境（褒贬/正式/书面）。已知：释义 ' + (item.yishi || '') + '；近义 ' + (item.jy || '') + '；反义 ' + (item.fy || '') + '。150-250字。'
    return (await chatOnce(c, [{ role: 'system', content: '你是公考言语理解老师。' }, { role: 'user', content: prompt }], 900)) || '（无返回）'
  }, { onError: (e) => { aiDetail.value = '生成失败：' + e.message } })
  if (out != null) aiDetail.value = out
}
// ===== 我的记忆库管理（独立面板）=====
const memShow = ref(false)
const memKw = ref('')
const memFilter = ref('全部')
const memType = ref('常识')
const memText = ref('')
const memFiltered = computed(() => {
  let list = store.myMem.slice()
  if (memFilter.value !== '全部') list = list.filter((x) => x.type === memFilter.value)
  const k = memKw.value.trim().toLowerCase()
  if (k) list = list.filter((x) => String(x.text || '').toLowerCase().includes(k))
  return list
})
function memAdd() {
  const t = memText.value.trim()
  if (!t) { showToast('请输入内容', 'info'); return }
  store.myMem.unshift({ type: memType.value, text: t, t: new Date().toLocaleString() })
  saveMyMem()
  memText.value = ''
  showToast('✅ 已添加到记忆库', 'success')
}
function memDel(i) {
  const item = memFiltered.value[i]
  const ri = store.myMem.indexOf(item)
  if (ri >= 0) { store.myMem.splice(ri, 1); saveMyMem() }
}
function memClear() {
  if (!confirm('确定清空我的记忆库？')) return
  store.myMem = []
  saveMyMem()
  showToast('已清空记忆库', 'info')
}
// ===== 联网查任意知识点（4板块通用）+ AI 知识卡 =====
const queryTerm = ref('')
const aiCard = ref('')
const aiCardBusy = ref(false)
async function onlineQuery() {
  const t = queryTerm.value.trim()
  if (!t) {
    showToast('请输入要查询的常识/时政/成语/实词', 'info')
    return
  }
  await onlineLookup(t)
}
async function onlineLookup(term) {
  const t = String(term || '').trim()
  if (!t) return
  lookupTerm.value = t
  lookupShow.value = true
  aiCard.value = ''
  aiCardBusy.value = true
  openGmSearch(t)
  const out = await aiRun(async (c) => {
    const kind = cat.value
    let prompt
    if (kind === '成语')
      prompt = '请为成语「' + t + '」生成学习卡：①释义 ②近义/反义 ③例句 ④来源 ⑤逻辑填空用法/语境 ⑥一句话记忆点。100-200字。'
    else if (kind === '实词')
      prompt = '请为实词「' + t + '」生成学习卡：①释义 ②易混词辨析 ③搭配/例句 ④语境 ⑤一句话记忆点。100-200字。'
    else if (kind === '时政')
      prompt = '请为时政/政治理论知识点「' + t + '」生成学习卡：①核心内容 ②提出背景/场合 ③常考表述 ④一句话记忆点。100-200字，只讲确定事实。'
    else prompt = '请为常识知识点「' + t + '」生成学习卡：①核心内容 ②易错点 ③记忆口诀 ④可能考法。100-200字，只讲确定事实。'
    return (await chatOnce(c, [{ role: 'system', content: '你是严谨的公考讲师。' }, { role: 'user', content: prompt }], 800)) || '（无返回）'
  }, { keyHint: '文字模型', onError: (e) => { aiCard.value = 'AI 知识卡生成失败：' + e.message } })
  if (out != null) aiCard.value = out
  aiCardBusy.value = false
}
function saveAiCard() {
  const t = lookupTerm.value
  if (!t) return
  const txt = aiCard.value ? '【AI学习卡】' + t + '\n' + aiCard.value : t
  if (store.myMem.some((x) => x.text === txt)) {
    showToast('已在记忆库中', 'info')
    return
  }
  store.myMem.unshift({ type: cat.value, text: txt, t: new Date().toLocaleString() })
  saveMyMem()
  showToast('✅ 已存入「我的记忆库」', 'success')
  lookupShow.value = false
  if (kw.value.trim() === t) pick(cat.value)
}
// ===== AI 批量扩库（每板块生成10条）=====
const genBusy = ref(false)
async function genBatch() {
  genBusy.value = true
  const out = await aiRun(async (c) => {
    const kind = cat.value
    let spec
    if (kind === '成语')
      spec = '给出10个国考高频成语（含易错），严格输出JSON数组：[{"word":"成语","yisi":"释义","jingyi":"近义","fanyi":"反义","liju":"例句"}]'
    else if (kind === '实词')
      spec = '给出10个国考高频实词辨析，严格输出JSON数组：[{"word":"实词","yisi":"释义","liju":"例句"}]'
    else if (kind === '时政')
      spec = '给出10条2025-2026年重要时政/政治理论要点，严格输出JSON数组：[{"word":"要点标题","yisi":"核心内容"}]'
    else spec = '给出10条公考常识（政治/法律/科技/人文/地理/经济/生活），严格输出JSON数组：[{"word":"常识点","yisi":"内容"}]'
    return await chatOnce(c, [{ role: 'system', content: '你是公考知识库整理助手，严格输出JSON数组。' }, { role: 'user', content: spec }], 2500)
  }, { keyHint: '文字模型' })
  if (out == null) { genBusy.value = false; return }
  try {
    const m = String(out || '').match(/\[[\s\S]*\]/)
    if (!m) throw new Error('AI返回格式异常')
    const arr = JSON.parse(m[0])
    let added = 0
    ;(arr || []).forEach((x) => {
      const w = String(x.word || '').trim()
      if (!w) return
      const full = w + '——' + (x.yisi || x.content || '') + (x.liju ? '（例：' + x.liju + '）' : '')
      if (store.myMem.some((mm) => mm.text === full)) return
      store.myMem.unshift({ type: cat.value, text: full, t: new Date().toLocaleString() })
      added++
    })
    saveMyMem()
    showToast('✅ 已生成并加入 ' + added + ' 条「' + cat.value + '」到记忆库', 'success')
    pick(cat.value)
  } catch (e) {
    showToast('生成失败：' + e.message, 'error')
  } finally {
    genBusy.value = false
  }
}
// 本地搜索无结果 → 联网查词 / 加入记忆库
const lookupShow = ref(false)
const lookupTerm = ref('')
function exportKb() { window.dispatchEvent(new CustomEvent('xc-export-kb')) }
function addToMem(term) {
  const t = String(term || '').trim()
  if (!t) return
  if (store.myMem.some((x) => x.text === t)) {
    showToast('已在记忆库中', 'info')
    return
  }
  store.myMem.unshift({ type: cat.value, text: t, t: new Date().toLocaleString() })
  saveMyMem()
  showToast('✅ 已加入「我的记忆库」，可继续复习', 'success')
  if (lookupShow.value) lookupShow.value = false
  if (kw.value.trim() === t) pick(cat.value)
}
// ===== 多源官网搜索（一键直达各官网搜索页）=====
const SEARCH_SOURCES = [
  { k: 'baike', n: '📖 百度百科', url: (t) => 'https://baike.baidu.com/search?word=' + encodeURIComponent(t) },
  { k: 'wiki', n: '🌐 维基百科', url: (t) => 'https://zh.wikipedia.org/wiki/' + encodeURIComponent(t) },
  { k: 'people', n: '📰 人民网', url: (t) => 'https://search.people.cn/s?keyword=' + encodeURIComponent(t) },
  { k: 'xuexi', n: '🇨🇳 学习强国', url: (t) => 'https://www.xuexi.cn/search.html?keyword=' + encodeURIComponent(t) },
  { k: 'xinhua', n: '🏛️ 新华网', url: (t) => 'https://so.news.cn/#search/0/' + encodeURIComponent(t) + '/1/' },
  { k: 'bing', n: '🔎 必应', url: (t) => 'https://cn.bing.com/search?q=' + encodeURIComponent(t) }
]
// 联网查官媒用法（维基百科检索兜底 + DuckDuckGo + 官方入口直达）
const gmSearch = ref(null)
async function openGmSearch(term) {
  const people = 'https://search.people.cn/s?keyword=' + encodeURIComponent(term)
  const baike = 'https://baike.baidu.com/item/' + encodeURIComponent(term)
  gmSearch.value = { busy: true, items: [], term, people, baike }
  const items = []
  try {
    const res = await fetch(
      'https://zh.wikipedia.org/w/api.php?action=query&list=search&srsearch=' +
        encodeURIComponent('"' + term + '"') +
        '&format=json&origin=*&srlimit=5'
    )
    const j = await res.json()
    ;((j.query && j.query.search) || []).forEach((s) => {
      items.push({
        text: s.title + '：' + String(s.snippet || '').replace(/<[^>]+>/g, '').slice(0, 140),
        url: 'https://zh.wikipedia.org/wiki/' + encodeURIComponent(s.title)
      })
    })
  } catch (e) {}
  if (items.length < 3) {
    try {
      const res = await fetch('https://api.duckduckgo.com/?q=' + encodeURIComponent('"' + term + '" 人民日报') + '&format=json&no_html=1')
      const j = await res.json()
      if (j && j.AbstractText) items.push({ text: j.AbstractText, url: j.AbstractURL || '' })
      ;(j.RelatedTopics || []).forEach((t) => {
        if (t && t.Text) items.push({ text: t.Text, url: t.FirstURL || '' })
        else if (t && t.Topics) t.Topics.forEach((s) => s && s.Text && items.push({ text: s.Text, url: s.FirstURL || '' }))
      })
    } catch (e) {}
  }
  if (!items.length) items.push({ text: '（联网暂未直接检索到，可用下方入口在官方平台内搜索）', url: '' })
  gmSearch.value = { busy: false, items: items.slice(0, 6), term, people, baike }
}
// 联网核实（常识/时政）
const verifyShow = ref(false)
const verifyTab = ref('ai')
const verifyBusy = ref(false)
const verifyAi = ref('')
const verifyWeb = ref([])
async function openVerify() {
  const term = cur.value
  if (!term) return
  verifyShow.value = true
  verifyTab.value = 'ai'
  verifyAi.value = ''
  verifyWeb.value = []
  verifyBusy.value = true
  const webSnippets = []
  try {
    const res = await fetch('https://api.duckduckgo.com/?q=' + encodeURIComponent(term) + '&format=json&no_html=1&skip_disambig=1')
    const j = await res.json()
    if (j && j.AbstractText) webSnippets.push({ text: j.AbstractText, url: j.AbstractURL || '' })
    ;(j.RelatedTopics || []).forEach((t) => {
      if (t && t.Text) webSnippets.push({ text: t.Text, url: t.FirstURL || '' })
      else if (t && t.Topics) t.Topics.forEach((s) => s && s.Text && webSnippets.push({ text: s.Text, url: s.FirstURL || '' }))
    })
    if (!webSnippets.length) webSnippets.push({ text: '（未检索到相关网络结果，AI 将基于自身知识校验）', url: '' })
  } catch (e) {
    webSnippets.push({ text: '（联网失败：' + e.message + '，AI 将基于自身知识校验）', url: '' })
  }
  verifyWeb.value = webSnippets.slice(0, 5)
  const out = await aiRun(async (c) => {
    const refText = webSnippets.map((s) => s.text).join('\n').slice(0, 1200)
    const prompt =
      '请校验下面这条公考常识/时政知识点的准确性，输出：\n【结论】准确 / 需修正 / 无法确认\n【修正后文本】准确规范版本\n【补充】1-2句要点（如有）\n\n待校验：\n' +
      term +
      '\n\n联网参考（可能为空）：\n' +
      refText
    return (await chatOnce(c, [{ role: 'system', content: '你是严谨的公考知识校验助手，只讲确定的事实，不确定就说无法确认。' }, { role: 'user', content: prompt }], 700)) || '（无返回）'
  }, { keyHint: '文字模型', onError: (e) => { verifyAi.value = 'AI 校验失败：' + e.message } })
  if (out != null) verifyAi.value = out
  verifyBusy.value = false
}
function saveVerify() {
  const txt = (verifyTab.value === 'ai' ? verifyAi.value : verifyWeb.value.map((s) => s.text).join('\n')).trim()
  if (!txt) return
  store.myMem.unshift({ type: cat.value, text: '【联网核实】' + cur.value + '\n' + txt, t: new Date().toLocaleString() })
  saveMyMem()
  showToast('✅ 已收藏核实结果到我的记忆库', 'success')
}
// ===== 学习进度统计 =====
const accStats = computed(() => {
  const c4 = (ty) => (['常识', '时政', '成语', '实词'].includes(ty) ? ty : '常识')
  const all = CHANGSHI.map((t) => ({ cat: '常识', t })).concat(SHIZHENG.map((t) => ({ cat: '时政', t }))).concat(CHENGYU.map((t) => ({ cat: '成语', t }))).concat(YUFEN_CHENGYU.map((t) => ({ cat: '成语', t }))).concat(SHICI.map((t) => ({ cat: '实词', t }))).concat(YUFEN_SHICI.map((t) => ({ cat: '实词', t }))).concat(store.myMem.map((x) => ({ cat: c4(x.type), t: x.text }))).concat(skillMemCS).concat(skillMemZZ)
  return { total: all.length, mastered: srsMasteredCount(srs.value, all), reviewedToday: srsReviewedToday(srs.value, todayKey()) }
})
// ===== 常识速测（AI 一次出 5 题组卷）=====
const quizBatch = ref(null) // { qs, marks, cur, done }
const quizBusyB = ref(false)
async function startQuiz() {
  quizBusyB.value = true
  const out = await aiRun(async (c) => {
    const sys =
      '你是公考常识命题老师。请出5道常识/政治单选题，严格只输出JSON数组，不要多余文字：[{"stem":"题干","options":{"A":"..","B":"..","C":"..","D":".."},"answer":"B","analysis":"一句解析"}]'
    return await chatOnce(c, [{ role: 'system', content: sys }, { role: 'user', content: '范围：政治理论、法律、科技、人文历史、地理、经济、时政常识。难度贴合国考常识。' }], 2500)
  }, { keyHint: '文字模型' })
  if (out == null) { quizBusyB.value = false; return }
  try {
    const m = String(out || '').match(/\[[\s\S]*\]/)
    if (!m) throw new Error('AI返回格式异常')
    const arr = JSON.parse(m[0])
    const qs = (arr || [])
      .slice(0, 5)
      .map((q) => {
        const opts = Object.keys(q.options || {}).map((k) => ({ k, t: q.options[k] })).slice(0, 4)
        return { stem: q.stem || '', options: opts, answer: String(q.answer || '').toUpperCase(), analysis: q.analysis || '' }
      })
      .filter((q) => q.stem && q.options.length >= 2)
    if (!qs.length) throw new Error('未解析到题目')
    quizBatch.value = { qs, marks: qs.map(() => null), cur: 0, done: false }
  } catch (e) {
    showToast('速测生成失败：' + e.message, 'error')
  } finally {
    quizBusyB.value = false
  }
}
function qbPick(k) {
  const b = quizBatch.value
  if (!b || b.marks[b.cur] != null) return
  b.marks[b.cur] = { ok: k === b.qs[b.cur].answer, pick: k }
}
function qbNext() {
  const b = quizBatch.value
  if (!b) return
  if (b.cur < b.qs.length - 1) b.cur++
  else b.done = true
}
function qbScore() {
  const b = quizBatch.value
  if (!b) return 0
  return b.qs.filter((q, i) => b.marks[i] && b.marks[i].ok).length
}
function qbSaveWrong() {
  const b = quizBatch.value
  if (!b) return
  const wrongs = b.qs.filter((q, i) => b.marks[i] && !b.marks[i].ok)
  let saved = 0, rejected = 0
  wrongs.forEach((q) => {
    const r = addWrong({
      id: Date.now() + Math.random(),
      subject: '常识判断',
      question: q.stem + '\n\n' + q.options.map((o) => o.k + '. ' + o.t).join('\n'),
      answer: '正确答案 ' + q.answer,
      reasons: ['常识速测失误'],
      time: new Date().toLocaleString(),
      at: Date.now(),
      wrongCount: 1,
      correctStreak: 0,
      mastery: 0,
      digested: false
    }, { silent: true })
    if (r && r.ok) saved++
    else rejected++
  })
  saveWqs()
  if (rejected) showToast('✅ 已存错题 ' + saved + ' 题，' + rejected + ' 条非完整/重复未入库', 'warning')
  else showToast('✅ 已存错题 ' + saved + ' 题', 'success')
}
function onSearchTerm(e) {
  const d = (e && e.detail) || {}
  const type = String(d.type || '').trim()
  if (['常识', '时政', '成语', '实词'].includes(type)) cat.value = type
  if (d.term) { kw.value = String(d.term).trim(); pick(cat.value) }
}
onMounted(() => {
  pick('常识')
  evOn('xc-search-term', onSearchTerm)
})
onUnmounted(() => evOff('xc-search-term', onSearchTerm))

// v3.8.191 6B：聚合顶层状态/方法为 fpctx 供各 Accum 子组件注入
const fpctx = reactive({ ref, computed, onMounted, onUnmounted, store, saveMyMem, saveWqs, saveNotes, addWrong, chatOnce, activeCfg, showToast, evOn, evOff, srsReviewedToday, srsMasteredCount, useAi, AccumOverview, CHANGSHI, SHIZHENG, CHENGYU, SHICI, YUFEN_CHENGYU, YUFEN_SHICI, skillMemCS, skillMemZZ, aiRun, myMem, CATS, SZCATS, cat, cur, curRegion, fCat, kw, nowMonth, shizhengAvailable, pool, curDetail, pick, switchCat, setRegion, setCatFilter, searchPick, next, favorite, guideShow, moreShow, closeGuide, DAILY_KEY, DAILY_GOAL, loadDaily, daily, saveDaily, todayReviewed, todayGoalPct, catKeyOf, dueOfCat, dueCountAll, srsStages, startStudy, quiz, picked, mark, quizBusy, seeExplain, followQ, hasKey, askQuiz, choose, askFollow, srs, SRS_INT, todayKey, addDays, srsKey, reviewMode, dueList, dueCount, remember, saveSrs, noteView, viewNote, closeNote, copyNote, delNote, CY_CATS, SC_CATS, curCats, basePool, srcStats, isLex, catTotal, searchPh, srcTipOff, dismissSrcTip, lexGuide, closeLexGuide, tryYihun, detailShow, detailItem, aiDetail, openDetail, aiExplainDetail, memShow, memKw, memFilter, memType, memText, memFiltered, memAdd, memDel, memClear, queryTerm, aiCard, aiCardBusy, onlineQuery, onlineLookup, saveAiCard, genBusy, genBatch, lookupShow, lookupTerm, exportKb, addToMem, SEARCH_SOURCES, gmSearch, openGmSearch, verifyShow, verifyTab, verifyBusy, verifyAi, verifyWeb, openVerify, saveVerify, accStats, quizBatch, quizBusyB, startQuiz, qbPick, qbNext, qbScore, qbSaveWrong, onSearchTerm })

</script>
<template>
  <div class="page on acc-page">
    <div class="page-inner">
      <div class="acc-head">
        <div class="acc-title-row">
          <span class="acc-title">🗂️ 常识 · 时政积累</span>
          <button class="fp-b gold" @click="memShow = true">📦 记忆库（{{ store.myMem.length }}）</button>
        </div>
        <AccumOverview :guide-show="guideShow" :due-count-all="dueCountAll" :today-reviewed="todayReviewed" :acc-stats="accStats" :today-goal-pct="todayGoalPct" :srs-stages="srsStages" :srs-int="SRS_INT" :daily-goal="DAILY_GOAL" @close-guide="closeGuide()" @start-study="startStudy()" />
      </div>
    <AccumToolbar :ctx="fpctx" />
    <AccumContent :ctx="fpctx" />
    <AccumDialogs :ctx="fpctx" />
    </div>
    </div>
    <!-- 我的导入笔记（Obsidian/Markdown） -->
    <div class="acc-notes">
      <div class="sec-t">
        📝 我的导入笔记
        <span style="font-size: 11px; color: var(--text3)">（Obsidian/Markdown）</span>
      </div>
      <div v-if="!store.notes.length" class="acc-notes-empty">
        还没有导入笔记，去 ⚙️设置 → 数据管理 → 📥 导入笔记(.md)
      </div>
      <div v-for="(n, i) in store.notes" :key="i" class="note-item">
        <div class="note-hd">
          <span class="note-t">{{ n.title }}</span>
          <span class="note-tags"><span v-for="t in (n.tags || [])" :key="t">#{{ t }}</span></span>
        </div>
        <div class="note-prev">{{ String(n.body || '').replace(/\n+/g, ' ').slice(0, 140) }}</div>
        <div class="note-acts">
          <button class="fp-b" @click="viewNote(n)">👁 查看</button>
          <button class="fp-b" @click="copyNote(n)">📋 复制 Obsidian</button>
          <button class="fp-b" @click="delNote(i)">🗑 删除</button>
        </div>
      </div>
    </div>
    <!-- 笔记查看弹窗 -->
    <div v-if="noteView" class="ov show" @click.self="closeNote()">
      <div class="pnl note-pnl">
        <h3>📝 {{ noteView.title }}</h3>
        <div class="note-tags"><span v-for="t in (noteView.tags || [])" :key="t">#{{ t }}</span></div>
        <pre class="note-body">{{ noteView.body }}</pre>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="closeNote()">关闭</button>
          <button class="btn btn-gh" @click="copyNote(noteView)">📋 复制 Obsidian</button>
        </div>
      </div>
    </div>

</template>
<style>
.acc-page {
  padding: 10px 12px;
}
.acc-title-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
/* ===== 积累 UI v2：引导 / 今日概览 / 角标 / 更多折叠 ===== */
.acc-guide {
  background: linear-gradient(135deg, rgba(34, 211, 238, 0.12), rgba(59, 130, 246, 0.12));
  border: 1px solid rgba(34, 211, 238, 0.3);
  border-radius: 14px;
  padding: 9px 12px;
  margin-bottom: 10px;
}
.acc-guide-hd { display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; color: var(--hud-cyan); margin-bottom: 6px; }
.acc-guide-x { background: none; border: none; color: var(--text3); font-size: 11px; cursor: pointer; font-family: inherit; }
.acc-guide-steps { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: center; font-size: 12px; color: var(--text2); margin-bottom: 6px; }
.ags { display: inline-flex; align-items: center; gap: 4px; }
.ags b { display: inline-flex; align-items: center; justify-content: center; min-width: 16px; height: 16px; border-radius: 50%; background: linear-gradient(135deg, #22d3ee, #3b82f6); color: #fff; font-size: 10.5px; padding: 0 4px; }
.acc-guide-steps i { color: var(--text3); font-style: normal; }
.acc-guide-tip { font-size: 11px; color: var(--text2); line-height: 1.6; border-top: 1px dashed var(--glass-border); padding-top: 6px; }
.acc-ov {
  border: 1px solid var(--glass-border);
  border-radius: 14px;
  background: var(--glass-bg);
  padding: 10px 12px;
  margin-bottom: 10px;
}
.acc-ov-main { display: flex; align-items: center; gap: 12px; }
.acc-ov-big {
  flex: 0 0 auto;
  width: 92px;
  height: 74px;
  border-radius: 12px;
  border: 1px solid rgba(34, 211, 238, 0.35);
  background: linear-gradient(135deg, rgba(34, 211, 238, 0.18), rgba(59, 130, 246, 0.18));
  color: var(--text);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  font-family: inherit;
}
.acc-ov-big:active { transform: scale(0.97); }
.aob-n { font-size: 24px; font-weight: 900; color: var(--hud-cyan); line-height: 1; }
.aob-t { font-size: 10.5px; color: var(--text2); }
.aob-go { font-size: 10px; color: var(--text3); }
.acc-ov-cols { flex: 1; display: flex; gap: 4px; }
.aoc { flex: 1; text-align: center; border-left: 1px solid var(--glass-border); }
.aoc:first-child { border-left: none; }
.aoc b { display: block; font-size: 17px; color: var(--text); }
.aoc span { font-size: 10.5px; color: var(--text3); }
.acc-ov-bar { height: 6px; border-radius: 3px; background: rgba(255, 255, 255, 0.06); margin: 8px 0 6px; overflow: hidden; }
.aob-fill { height: 100%; border-radius: 3px; background: linear-gradient(90deg, #22d3ee, #3b82f6); transition: width 0.4s; }
.acc-ov-meta { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 10.5px; color: var(--text3); flex-wrap: wrap; }
.acc-ov-stages { display: inline-flex; align-items: center; gap: 2px; flex-wrap: wrap; }
.acc-ov-stages i { font-style: normal; color: var(--text3); }
.acc-ov-stages b { color: var(--text2); font-weight: 700; margin-right: 2px; }
.acc-ov-stages em { font-style: normal; color: var(--glass-border); }
.aos-tip { opacity: 0.7; margin-left: 4px; }
.fc-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 15px; height: 15px; border-radius: 8px; background: var(--hud-cyan); color: #fff; font-size: 9.5px; font-weight: 800; padding: 0 4px; margin-left: 4px; vertical-align: middle; }
.fp-modebar { display: flex; align-items: center; justify-content: space-between; font-size: 11.5px; color: var(--hud-cyan); background: rgba(34, 211, 238, 0.08); border: 1px solid rgba(34, 211, 238, 0.25); border-radius: 10px; padding: 5px 10px; margin-bottom: 8px; }
.fp-modebar-x { background: none; border: none; color: var(--text3); font-size: 11px; cursor: pointer; font-family: inherit; }
.fp-more { margin-bottom: 8px; }
.fp-more-btn { width: 100%; padding: 5px 10px; border-radius: 10px; border: 1px dashed var(--glass-border); background: transparent; color: var(--text3); font-size: 11.5px; cursor: pointer; font-family: inherit; }
.fp-more-body { margin-top: 6px; border: 1px solid var(--glass-border); border-radius: 12px; padding: 8px 10px; background: var(--glass-bg); }
.fp-foot .fp-b.ok.big, .fp-foot .fp-b.no.big { flex: 1; padding: 10px 12px; font-size: 13px; }
/* 词条详解：易混辨析区块（多组词相互辨析）高亮 */
.id-row.bi { background: rgba(34, 211, 238, 0.08); border: 1px solid rgba(34, 211, 238, 0.3); border-radius: 10px; padding: 8px 10px; margin: 6px 0; }
.id-row.bi b { color: var(--hud-cyan); }
.id-row.bi .bi-body { display: block; margin-top: 4px; line-height: 1.7; }
.acc-head {
  margin-bottom: 10px;
}
.acc-title {
  font-size: 15px;
  font-weight: 800;
  background: var(--grad-primary);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 0 8px rgba(56, 189, 248, 0.35));
}
.acc-sub {
  display: block;
  font-size: 11px;
  color: var(--text3);
  margin-top: 2px;
}
.fp-head {
  display: none;
}
.fp-btn, .fp-dot, .fp-ops, .fp-o {
  display: none;
}
.fp-card {
  width: 100%;
  margin: 0;
  background: transparent;
  border: none;
  box-shadow: none;
  opacity: 1;
}
.fp-o {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text2);
  cursor: pointer;
  font-size: 11px;
  line-height: 1;
}
.fp-o:hover {
  background: var(--accent2);
  color: var(--accent);
}
.fp-cat {
  display: flex;
  gap: 4px;
  padding: 8px 10px 2px;
}
.fp-reg {
  display: flex;
  gap: 4px;
  padding: 4px 10px 2px;
}
.fp-c {
  padding: 3px 10px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: transparent;
  color: var(--text2);
  font-size: 11px;
  cursor: pointer;
}
.fp-c.s {
  padding: 2px 8px;
  font-size: 10.5px;
}
.fp-c.on {
  background: var(--accent2);
  color: var(--accent);
  border-color: rgba(56, 189, 248, 0.3);
}
.fp-body {
  padding: 12px 12px 8px;
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--text);
  min-height: 64px;
}
.fp-body.exp {
  border-top: 1px dashed rgba(255, 255, 255, 0.14);
  color: var(--text2);
  font-size: 12px;
  min-height: 0;
}
.fp-card.sm .fp-body {
  font-size: 12px;
}
.fp-foot {
  display: flex;
  gap: 6px;
  padding: 2px 10px 10px;
}
.fp-b {
  flex: 1;
  padding: 6px 0;
  border: none;
  border-radius: 12px;
  background: var(--accent2);
  color: var(--accent);
  font-size: 11.5px;
  cursor: pointer;
  font-family: inherit;
}
.fp-b.gold {
  background: rgba(251, 191, 36, 0.12);
  color: var(--amber);
}
.fp-b.quiz {
  background: #2f6fb3;
  color: #fff;
}
.fp-b:disabled {
  opacity: 0.5;
}
.fp-b:hover {
  filter: brightness(1.12);
}
/* 答题面板 */
.fp-quiz {
  padding: 10px;
}
.q-hd {
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--text);
  margin-bottom: 8px;
}
.q-kd {
  display: inline-block;
  margin-left: 6px;
  font-size: 10px;
  color: var(--accent);
}
.q-opts {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.q-o {
  padding: 7px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: var(--surface);
  color: var(--text);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.q-o:hover {
  border-color: var(--accent);
}
.q-o.on {
  border-color: var(--accent);
  background: var(--accent2);
}
.q-o.right {
  background: rgba(52, 211, 153, 0.16);
  border-color: var(--green);
  color: var(--green);
}
.q-o.wrong {
  background: rgba(248, 113, 113, 0.16);
  border-color: var(--red);
  color: var(--red);
}
.q-mark {
  margin-top: 8px;
  font-size: 12px;
  font-weight: 700;
}
.q-mark.ok {
  color: var(--green);
}
.q-mark.no {
  color: var(--red);
}
.fp-follow {
  display: flex;
  gap: 6px;
  padding: 0 10px 10px;
}
.fp-follow input {
  flex: 1;
  padding: 6px 9px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: var(--surface);
  color: var(--text);
  font-size: 11.5px;
  font-family: inherit;
  outline: none;
}
/* ===== 词条来源说明条 + 首次引导 + 来源角标（雨菲800词 / 半月谈）===== */
.fp-srctip {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--text2);
  background: rgba(56, 189, 248, 0.08);
  border: 1px solid rgba(56, 189, 248, 0.25);
  border-radius: 8px;
  padding: 7px 10px;
  margin: 8px 0 4px;
}
.fp-srctip .st-x {
  margin-left: auto;
  border: none;
  background: transparent;
  color: var(--text3);
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
}
.st-b { font-weight: 700; }
.st-b.yf { color: #b794f6; }
.st-b.bt { color: #f6ad55; }
/* 来源角标（词条旁 / 详情标题旁） */
.src-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 6px;
  margin-left: 6px;
  vertical-align: middle;
  white-space: nowrap;
}
.src-badge.yf { color: #b794f6; background: rgba(183, 148, 246, 0.16); border: 1px solid rgba(183, 148, 246, 0.4); }
.src-badge.bt { color: #f6ad55; background: rgba(246, 173, 85, 0.16); border: 1px solid rgba(246, 173, 85, 0.4); }
/* 首次引导卡片 */
.fp-lexguide {
  margin: 10px 0 4px;
}
.lg-card {
  background: linear-gradient(135deg, rgba(56,189,248,0.12), rgba(183,148,246,0.12));
  border: 1px solid rgba(56, 189, 248, 0.35);
  border-radius: 12px;
  padding: 14px 16px;
}
.lg-card .lg-h {
  font-size: 14px;
  font-weight: 800;
  color: var(--text);
  margin-bottom: 8px;
}
.lg-card p { font-size: 12px; line-height: 1.6; color: var(--text2); margin: 6px 0; }
.lg-card ul { margin: 6px 0; padding-left: 18px; }
.lg-card li { font-size: 12px; line-height: 1.7; color: var(--text2); }
.lg-card .lg-how { color: var(--text); }
.lg-btns { display: flex; gap: 8px; margin-top: 12px; }
.lg-btns .btn { flex: 1; }
</style>
