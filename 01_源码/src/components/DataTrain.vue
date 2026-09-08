<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { genDataQ, CALC_METHOD_LIB, createSharedPaper } from '../utils/dataTrainGen'
import { buildDataTrainExam, EXAM_LAYER_KEYS, applyPaperOptions } from '../utils/dataTrainExam'
import { genLocateChain } from '../utils/dataTrainChain' // v3.8.203 同材料连问
import { DOMAINS, domainOf } from '../data/dataDomains' // v3.8.213 领域字典 60+
import { KNOWLEDGE_CARDS, KB_LAYERS, searchCards, cardForQuiz } from '../utils/dataTrainLib'
import { renderMd } from '../utils/renderMd'
import { REAL_REF, findLockWords, smartLockHighlights } from '../utils/dataTrainTips' // v3.8.200 小技巧层
import { showToast } from '../utils/toast'
import { store, addWrong } from '../store'
import { chatOnce, activeCfg } from '../api'
import { pickGenCfg } from '../utils/fastMode'

const emit = defineEmits(['close', 'send-question'])
const md = (t) => renderMd(t || '')
const view = ref('classic') // classic=真题拆分训练（默认入口） | exam=完整真题卷
const splitReady = ref(false) // v3.8.256：拆分训练改为“先选配置再 AI 出单题”

// ===== 状态 =====
const mode = ref('type') // type | locate | formula | calc
const level = ref(2) // 1 | 2 | 3
const stage = ref('identify') // calc 阶段：identify | apply | practice
const q = ref(null)
const picked = ref('')
const idx = ref(0)
const helpShow = ref(false)
const methodOpen = ref(true)
const aiBusy = ref(false)
const aiText = ref('')
const stats = ref({ ok: 0, bad: 0, total: 0, start: 0 })
const streak = ref(0)
const bestStreak = ref(0)
const score = ref(0)
const elapsed = ref(0)
const runStarted = ref(false)
const resultShow = ref(false)
// ===== 真题式 5 问 × 四层（v3.8.244 核心特色） =====
const exam = ref(null)
const examGroupSize = ref(5)
const examReady = ref(false)
const examQIdx = ref(0)
const examLayerIdx = ref(0)
const examPick = ref('')
const examRun = ref(false)
const examFinished = ref(false)
const examStart = ref(0)
const examQStart = ref(0)
const examElapsed = ref(0)
const examEndAt = ref(0)
const examTotalRemain = ref(0)
const examLayerRemain = ref(15)
const examWarn3 = ref(false)
const LAYER_BUDGET_SEC = 15
const examAiBusy = ref(false)
const examAiText = ref('')
const examEvalBusy = ref(false)
const examEvalText = ref('')
const examLayerStats = ref({
  type: { ok: 0, bad: 0 },
  locate: { ok: 0, bad: 0 },
  formula: { ok: 0, bad: 0 },
  calc: { ok: 0, bad: 0 }
})
const examHist = ref([])
const DT_BEST_KEY = 'xc_dt_best_v1'
// v3.8.256：拆分训练 / 完整真题 持久化成绩与练习记录（二刷、错题入库）
const DT_REC_KEY = 'xc_dt_records_v1'
const records = ref([])
const recShow = ref(false)
const recDetail = ref(null)
const splitRecorded = ref(false)
const runSnap = ref([])
const examPaperMeta = ref([])
const examRecorded = ref(false)
function readDtRecords() { try { return JSON.parse(localStorage.getItem(DT_REC_KEY) || '[]') } catch (e) { return [] } }
function saveDtRecords(list) { try { localStorage.setItem(DT_REC_KEY, JSON.stringify(list)) } catch (e) {} }
function syncRecords() { records.value = readDtRecords() }
function pushDtRecord(rec) {
  if (!rec || !rec.total) return
  rec.id = 'dt' + Date.now() + '_' + Math.floor(Math.random() * 9999)
  records.value = [rec].concat(readDtRecords()).slice(0, 60)
  saveDtRecords(records.value)
}
function splitLayerStats() {
  const o = {}
  TRAIN_MODES.forEach((m) => { o[m.k] = { ok: 0, bad: 0 } })
  ;(runSnap.value || []).forEach((it) => {
    if (!o[it.mode]) return
    if (it.ok) o[it.mode].ok++
    else o[it.mode].bad++
  })
  return o
}
function splitWrongItems() {
  const items = []
  ;(runSnap.value || []).forEach((it) => {
    if (!it || it.ok || !it.q) return
    const qq = it.q
    const opts = (qq.options || []).map((o) => o.k + '. ' + String(o.t).replace(/<[^>]+>/g, '').trim()).join('\n')
    const mdShort = String(qq.materialMd || paper.value.materialMd || '').slice(0, 2200)
    items.push({
      layer: it.mode || '',
      layerName: (MODES.find((m) => m.k === it.mode) || {}).t || '',
      stem: String(qq.q || qq.stem || ''),
      opts,
      answer: qq.answer || '',
      pick: it.pick || '',
      explain: String(qq.explain || '').slice(0, 1400),
      material: mdShort
    })
  })
  return items
}
function recordSplitRun() {
  const st = stats.value
  if (!st.total || splitRecorded.value) return
  splitRecorded.value = true
  const totalSecs = Math.max(0, elapsed.value)
  pushDtRecord({
    kind: 'split',
    ts: Date.now(),
    src: dtSrc.value.src,
    field: dtSrc.value.field,
    custom: dtSrc.value.customField,
    srcLabel: srcLabel.value,
    groupSize: groupSize.value,
    total: st.total,
    ok: st.ok,
    bad: st.bad,
    rate: st.total ? Math.round((st.ok / st.total) * 100) : 0,
    secs: totalSecs,
    layers: splitLayerStats(),
    wrong: splitWrongItems(),
    seed: paperSeed.value,
    mode: mode.value,
    level: level.value,
    stage: stage.value,
    form: dtForm.value,
    timeKind: dtTime.value
  })
}
function readDtBest() { try { return JSON.parse(localStorage.getItem(DT_BEST_KEY) || '{}') } catch (e) { return {} } }
function saveRunBest() {
  const st = stats.value
  if (!st.total) return
  const all = readDtBest()
  const k = mode.value + '_' + level.value
  const cur = all[k]
  const pct = Math.round((st.ok / st.total) * 100)
  if (!cur || st.total > cur.total || (st.total === cur.total && pct >= (cur.pct || 0))) all[k] = { ok: st.ok, total: st.total, pct }
  try { localStorage.setItem(DT_BEST_KEY, JSON.stringify(all)) } catch (e) {}
}
const bestChip = computed(() => { const b = readDtBest()[mode.value + '_' + level.value]; return b && b.total ? b : null })
// v3.8.199：本题/总计时 + 题组 + 数据来源·领域
const qStart = ref(0)
const qTime = ref(0)
const groupSize = ref(0)
const groupDone = ref(false)
const paperSeed = ref(Date.now() % 100000)
const paper = ref(null)
function makePaper() {
  const dom = activeDomain()
  if (!dom) return
  paperSeed.value = Date.now() % 100000
  paper.value = applyPaperOptions(createSharedPaper(paperSeed.value, dom), paperSeed.value, { form: dtForm.value, timeKind: dtTime.value, chart: dtChart.value })
}
function refreshPaper() {
  makePaper()
  reset()
}
const DTS_SRC_KEY = 'xc_dt_src'
const SRC_OPTIONS = ['国家统计局', '北京市统计局', '上海市统计局', '天津市统计局', '重庆市统计局', '广东省统计局', '浙江省统计局', '江苏省统计局', '山东省统计局', '福建省统计局', '湖北省统计局', '湖南省统计局', '河南省统计局', '安徽省统计局', '四川省统计局', '贵州省统计局', '云南省统计局', '陕西省统计局', '辽宁省统计局', '吉林省统计局', '黑龙江省统计局', '河北省统计局', '山西省统计局', '江西省统计局', '广西壮族自治区统计局', '新疆维吾尔自治区统计局', '内蒙古自治区统计局', '西藏自治区统计局', '青海省统计局', '甘肃省统计局', '宁夏回族自治区统计局', '海南省统计局']
const FIELD_HOT = DOMAINS.filter((d) => d.cat === '热').map((d) => d.n)
const FIELD_COLD = DOMAINS.filter((d) => d.cat === '冷').map((d) => d.n)
const dtSrc = ref({ src: '国家统计局', field: '粮食', customField: '' })
try {
  const _s = JSON.parse(localStorage.getItem(DTS_SRC_KEY) || 'null')
  if (_s) dtSrc.value = Object.assign({ src: '国家统计局', field: '粮食', customField: '' }, _s)
  if (!dtSrc.value.src) dtSrc.value.src = '国家统计局'
  if (!dtSrc.value.field) dtSrc.value.field = '粮食'
} catch (e) {}
const DTS_MODE_KEY = 'xc_dt_material_mode'
const srcMode = ref(localStorage.getItem(DTS_MODE_KEY) === 'real' ? 'real' : 'sim')
// v3.8.256：材料排版 / 统计口径可自选，AI 随机需让 饼图/折线/柱线/文字/表格/混合 都有机会出现
const DT_FORM_KEY = 'xc_dt_form_v1'
const DT_TIME_KEY = 'xc_dt_time_v1'
const FORM_OPTIONS = [
  { k: 'auto', t: '🤖 AI 随机' },
  { k: 'text', t: '📝 纯文字' },
  { k: 'table', t: '🧮 纯表格' },
  { k: 'textTable', t: '📑 文字+表格' },
  { k: 'textChart', t: '📊 文字+图表' },
  { k: 'tableChart', t: '📊 表格+图表' },
  { k: 'all', t: '🗂 三者混合' }
]
const TIME_OPTIONS = [
  { k: 'auto', t: '🕒 AI 随机口径' },
  { k: 'annual', t: '📅 年度' },
  { k: 'ytd', t: '🗓 1—N月累计' },
  { k: 'half', t: '⏳ 上半年/下半年' },
  { k: 'quarter', t: '📆 单季度' },
  { k: 'month', t: '🌙 单月' }
]
const dtForm = ref(localStorage.getItem(DT_FORM_KEY) || 'auto')
const dtTime = ref(localStorage.getItem(DT_TIME_KEY) || 'auto')
const dtChart = ref('auto')
function setDtForm(v) {
  dtForm.value = v
  try { localStorage.setItem(DT_FORM_KEY, v) } catch (e) {}
  if (view.value !== 'exam') splitStandby()
  resetExamDraft()
}
function setDtTime(v) {
  dtTime.value = v
  try { localStorage.setItem(DT_TIME_KEY, v) } catch (e) {}
  if (view.value !== 'exam') splitStandby()
  resetExamDraft()
}
function saveDtSrc() { try { localStorage.setItem(DTS_SRC_KEY, JSON.stringify(dtSrc.value)) } catch (e) {} }
function setSrcMode(m) {
  srcMode.value = m
  try { localStorage.setItem(DTS_MODE_KEY, m) } catch (e) {}
  if (m === 'real') {
    showToast('📡 真实模式已开启：联网搜索+AI 整理真实口径资料卡；题目仍用本地模拟数据以保证可判题', 'info')
    setTimeout(() => checkSourceOnline(), 120)
  } else {
    showToast('🧪 已切回本地模拟材料，可即时出题判题', 'info')
  }
}
function setSrc(v) {
  dtSrc.value.src = v
  saveDtSrc()
  if (view.value === 'exam') resetExamDraft()
  else splitStandby()
}
function setField(v) {
  dtSrc.value.field = v
  dtSrc.value.customField = ''
  saveDtSrc()
  if (view.value === 'exam') resetExamDraft()
  else splitStandby()
}
function setCustomField(v) {
  dtSrc.value.customField = v
  saveDtSrc()
  if (view.value === 'exam') resetExamDraft()
  else splitStandby()
}
function setView(v) {
  view.value = v
  if (v === 'exam') {
    examReady.value = false
    exam.value = null
  } else if (!q.value && !splitReady.value) {
    reset()
  }
}
function resetExamDraft() {
  exam.value = null
  examReady.value = false
  examFinished.value = false
  examRun.value = false
  examAiText.value = ''
  examEvalText.value = ''
}
function setExamGroup(n) {
  examGroupSize.value = n
  if (view.value === 'exam') resetExamDraft()
}
const srcLabel = computed(() => { const f = dtSrc.value.customField ? (dtSrc.value.field + '·' + dtSrc.value.customField) : dtSrc.value.field; return dtSrc.value.src + ' · ' + f })
const lockShow = ref(true)
function activeDomain() {
  const custom = String(dtSrc.value.customField || '').trim()
  if (!custom) return domainOf(dtSrc.value.field)
  let unit = '亿元'
  if (/人|户|职工|就业/.test(custom)) unit = '万人'
  else if (/件|快递/.test(custom)) unit = '亿件'
  else if (/产量|销量|车|手机|家电|设备|台/.test(custom)) unit = '万辆'
  else if (/面积|公顷|亩/.test(custom)) unit = '万公顷'
  return { n: custom, cat: '冷', unit, inds: [custom + '·总体规模', custom + '·主要业务量', custom + '·重点领域投入', custom + '·相关指标'] }
}
const srcSearchTerm = computed(() => String(dtSrc.value.src || '') + ' ' + (dtSrc.value.customField || dtSrc.value.field) + ' 统计公报')
const srcSearchHref = computed(() => 'https://cn.bing.com/search?q=' + encodeURIComponent(srcSearchTerm.value))
const realRef = computed(() => {
  const hit = REAL_REF[srcLabel.value]
  if (hit) return '官网口径参考：' + hit + '（题目材料数值仍为训练模拟，勿当作该年报真实数据）'
  return dtSrc.value.customField ? '自定义领域无内置真实口径参考：请点「🌐 官网/必应查」核对真实指标与单位，材料数值仅用于训练。' : '当前为训练模拟材料：仅练习统计阅读/数据定位，不引用所选来源实际公布值；点「🌐 官网/必应查」可查官方年度数据。'
})
const srcCheckShow = ref(false)
const srcCheckBusy = ref(false)
const srcCheckItems = ref([])
const srcCheckAi = ref('')
async function checkSourceOnline() {
  const term = srcSearchTerm.value
  if (!term) return
  srcCheckShow.value = true
  srcCheckBusy.value = true
  srcCheckItems.value = []
  srcCheckAi.value = ''
  const items = []
  try {
    const res = await fetch('https://zh.wikipedia.org/w/api.php?action=query&list=search&srsearch=' + encodeURIComponent('"' + term + '"') + '&format=json&origin=*&srlimit=5')
    const j = await res.json()
    ;((j.query && j.query.search) || []).forEach((s) => items.push({ text: s.title + '：' + String(s.snippet || '').replace(/<[^>]+>/g, '').slice(0, 180), url: 'https://zh.wikipedia.org/wiki/' + encodeURIComponent(s.title) }))
  } catch (e) {}
  if (items.length < 3) {
    try {
      const res = await fetch('https://api.duckduckgo.com/?q=' + encodeURIComponent(term + ' 官方数据') + '&format=json&no_html=1')
      const j = await res.json()
      if (j && j.AbstractText) items.push({ text: j.AbstractText.slice(0, 240), url: j.AbstractURL || '' })
      ;(j.RelatedTopics || []).forEach((t) => {
        if (t && t.Text) items.push({ text: t.Text.slice(0, 240), url: t.FirstURL || '' })
        else if (t && t.Topics) t.Topics.forEach((s) => s && s.Text && items.push({ text: s.Text.slice(0, 240), url: s.FirstURL || '' }))
      })
    } catch (e) {}
  }
  if (!items.length) items.push({ text: '公开检索暂未返回摘要，请用下方官网/必应链接进入官方发布页核对。', url: '' })
  srcCheckItems.value = items.slice(0, 6)
  const c = activeCfg(false)
  if (!c || !c.key) {
    srcCheckAi.value = '未配置文字大模型 Key：只能展示联网摘要，无法让 AI 整理口径。请先到「设置 → 模型」配置 Key。'
  } else {
    try {
      const refText = srcCheckItems.value.map((s) => s.text).join('\n').slice(0, 1600)
      const d = new Date()
      const nowTxt = d.getFullYear() + '年' + (d.getMonth() + 1) + '月'
      const reply = await chatOnce(c, [
        { role: 'system', content: '你是严谨的统计资料核对助手。联网参考为空或不足以证明时，必须明确说“无实时官方数据”，绝不编造统计数字。' },
        { role: 'user', content: '当前时间：' + nowTxt + '。请帮用户核对：' + srcLabel.value + ' 的统计材料口径，优先查找最新年度/季度/月度官方公报。\n\n联网摘要：\n' + (refText || '（无）') + '\n\n请输出：①能确认的事实（注明数据年份/月份、是否官方实时数据）；②如果摘要不足，应去哪个官方入口查；③建议训练时使用哪些“指标名/单位/口径”最贴近真实公报（不改材料数值）。' }
      ], 900)
      srcCheckAi.value = String(reply || '').trim() || 'AI 未返回内容，请重试。'
    } catch (e) {
      srcCheckAi.value = 'AI 核对失败：' + ((e && e.message) || e) + '；上方联网摘要仍可直接参考。'
    }
  }
  srcCheckBusy.value = false
}
// v3.8.202：题组结果统计 + 三锁定判题联动
const hist = ref([])
const chain = ref(null)
const chainIdx = ref(0)
function startChain() {
  if (!paper.value) makePaper()
  const c = genLocateChain(Date.now() % 100000, 5, activeDomain(), paper.value)
  if (!c) { showToast('同材料生成失败，请重试', 'err'); return }
  chain.value = c
  chainIdx.value = 0
  applyChainQ()
}
function applyChainQ() {
  const it = chain.value.qs[chainIdx.value]
  q.value = Object.assign({}, it, { materialMd: chain.value.materialMd, materialSvg: chain.value.materialSvg, _chain: true })
  picked.value = ''
  qStart.value = Date.now()
  qTime.value = 0
  idx.value += 1
}
function chainNext() {
  if (!chain.value) return
  if (chainIdx.value < chain.value.qs.length - 1) { chainIdx.value++; applyChainQ() }
  else { showToast('🎉 本材料连问完成，共 ' + chain.value.qs.length + ' 问', 'success'); chain.value = null }
}
const lockWords = ref({ time: [], ind: [], unit: [] })
function materialHighlights(mdText) {
  if (!lockShow.value || !mdText) return mdText
  const need = { nums: [], words: [] }
  if (view.value === 'exam') {
    const ec = examCurrent.value
    const el = examLayerItem.value
    if (ec && el) {
      const ansOpt = el.options.find((o) => o.k === el.answer)
      ;[ec.stem, el.q, ansOpt && ansOpt.t, el.explain, el.tip].forEach((s) => {
        if (!s) return
        need.nums.push(String(s))
        need.words.push(String(s).replace(/<[^>]+>/g, ' '))
      })
      if (ec.typeLabel) need.words.push(ec.typeLabel)
    }
  } else if (q.value) {
    const qq = q.value
    const ansOpt = (qq.options || []).find((o) => o.k === qq.answer)
    ;[qq.q, qq.explain, ansOpt && ansOpt.t].forEach((s) => {
      if (!s) return
      need.nums.push(String(s))
      need.words.push(String(s).replace(/<[^>]+>/g, ' '))
    })
    if (qq.extra && qq.extra.name) need.words.push(qq.extra.name)
  }
  if (paper.value) {
    const combined = need.nums.concat(need.words).join(' ')
    ;(paper.value.inds || []).forEach((x) => { if (combined.includes(x)) need.words.push(x) })
    ;(paper.value.periodLabels || []).forEach((x) => { if (combined.includes(x)) need.words.push(x) })
    if (combined.includes(String(paper.value.unit || ''))) need.words.push(String(paper.value.unit))
  }
  return smartLockHighlights(mdText, need)
}
const grpStats = computed(() => {
  const total = stats.value.total
  const ok = stats.value.ok
  const secs = Math.max(0, elapsed.value)
  const avg = total ? Math.round(secs / total) : 0
  return { total, ok, bad: total - ok, rate: total ? Math.round((ok / total) * 100) : 0, secs, avg }
})
function setGroup(n) { groupSize.value = n; groupDone.value = false; reset() }
function startRun() {
  if (runStarted.value) return
  runStarted.value = true
  stats.value.start = Date.now()
  elapsed.value = 0
  qStart.value = Date.now()
  qTime.value = 0
  splitRecorded.value = false
  runSnap.value = []
  showToast('⏱ 已开始本组计时，作答后自动统计', 'info')
}
function settleRun() {
  elapsed.value = stats.value.start ? Math.floor((Date.now() - stats.value.start) / 1000) : 0
  runStarted.value = false
  groupDone.value = true
  resultShow.value = true
  recordSplitRun()
  saveRunBest()
}
function closeResult() {
  resultShow.value = false
}
watch(q, (nq) => { qStart.value = Date.now(); qTime.value = 0; if (nq) nq._srcLabel = srcLabel.value })
let timerId = null

const MODES = [
  { k: 'type', t: '① 判题型', d: '看提问方式，秒判考点题型（统计阅读）' },
  { k: 'locate', t: '② 找数据', d: '材料定位：时间/指标/单位三锁定（数据定位）' },
  { k: 'formula', t: '③ 公式', d: '3秒应激：识别概念→定方向→选公式（公式选择）' },
  { k: 'calc', t: '④ 速算', d: '选项差距→估算方法→快速选对（计算执行）' },
  { k: 'theory', t: '📚 理论课堂', d: 'LY × 小P 双师知识点库：速算原理/公式/材料阅读/判题型' }
]
const LEVELS = [
  { v: 1, t: '🌱 入门', d: '数字友好、选项差距大' },
  { v: 2, t: '⚡ 进阶', d: '混合方法、中等差距' },
  { v: 3, t: '🔥 实战', d: '真题风格、选项差距小' }
]
const STAGES = [
  { k: 'identify', t: '🔍 方法识别', d: '先练「看到题 → 知道用哪个速算方法」' },
  { k: 'apply', t: '✏️ 方法应用', d: '给方法提示，练套用操作步骤' },
  { k: 'practice', t: '🎯 实战混合', d: '不给提示，直接估算选对' }
]
const LAYER_TIPS = {
  type: '先从提问关键词秒判题型：看到「上年/基期」→ 基期量；「增加多少」→ 增长量；「占…比重」→ 比重；「平均每…增长%」→ 平均数增长率。',
  locate: '结构阅读三步：先看时间 → 再看指标 → 后定单位。文字材料定位「第几段第几句」，表格定位「行年份 × 列指标」，图表定位「柱/折线 + 轴」。',
  formula: '3-5 秒完成「识别概念 → 判断方向 → 确定公式变体」。问百分点→两期比重差；隔一年→间隔；平均每…增长%→平均数增长率。',
  calc: '先看选项差距（二八速判）再选估算方法：|r|≤5% 化除为乘、r≈1/n 用份数、非整增速截位直除、比较用五法则。',
  theory: '先学理论再训练：①判题型→②找数据→③公式→④速算逐层攻克。搜关键词或按层筛选，点卡片展开原理/推导/操作/真题示例/口诀。'
}

const modeStats = ref({ type: { ok: 0, bad: 0 }, locate: { ok: 0, bad: 0 }, formula: { ok: 0, bad: 0 }, calc: { ok: 0, bad: 0 } })
// ===== 理论课堂状态 =====
const kbKw = ref('')
const kbLayer = ref('')
const kbSource = ref('')
const kbOpen = ref(null)
const kbRead = ref({})
const kbStar = ref({})
try {
  const saved = JSON.parse(localStorage.getItem('xc_dt_kb_progress') || '{}')
  kbRead.value = saved.read || {}
  kbStar.value = saved.star || {}
} catch (e) {}
function saveKb() {
  try { localStorage.setItem('xc_dt_kb_progress', JSON.stringify({ read: kbRead.value, star: kbStar.value })) } catch (e) {}
}
function markRead(id) {
  if (!kbRead.value[id]) { kbRead.value[id] = true; saveKb() }
}
function toggleStar(id) {
  kbStar.value[id] = !kbStar.value[id]
  saveKb()
}
const kbList = computed(() => searchCards(kbKw.value, kbLayer.value || undefined, kbSource.value || undefined))
const kbCount = computed(() => KNOWLEDGE_CARDS.length)
const kbLearned = computed(() => Object.keys(kbRead.value).length)
// 当前训练题 → 对应知识卡（答错/答对后「看这张卡」）
const quizCard = computed(() => (q.value && q.value.extra ? cardForQuiz(q.value.extra.name) : null))
function openQuizCard() {
  if (!quizCard.value) return
  mode.value = 'theory'
  kbKw.value = ''
  kbLayer.value = ''
  kbSource.value = ''
  kbOpen.value = quizCard.value.id
  markRead(quizCard.value.id)
}
// AI 展开讲解（按次调用，省 token）
async function aiExplainCard(card) {
  if (aiBusy.value) return
  aiBusy.value = true
  aiText.value = ''
  try {
    const c = activeCfg(false)
    if (!c || !c.key) {
      aiText.value = '尚未配置可用的大模型 Key，可先用知识卡自学。'
      return
    }
    const prompt =
      '你是行测资料分析名师（LY《资料分析一本通》+ 小P老师速算体系）。请把下面这个知识点讲透：\n' +
      '【知识点】' + card.title + '\n【核心原理】' + card.principle +
      (card.derivation ? '\n【推导】' + card.derivation : '') +
      '\n【适用场景】' + card.scene +
      '\n【操作步骤】' + card.steps.map((x, i) => (i + 1) + '. ' + x).join('\n') +
      '\n【口诀】' + card.tip +
      '\n\n要求：1) 用大白话讲清原理；2) 举一个生活中的例子；3) 说明考场怎么用；4) 提示常见错误。控制在350字内，不要寒暄。'
    const reply = await chatOnce(c, [
      { role: 'system', content: '你是行测资料分析名师，讲解生动、可操作、有口诀。' },
      { role: 'user', content: prompt }
    ], 1200)
    aiText.value = String(reply || '').trim() || '（AI 未返回内容，请重试）'
  } catch (e) {
    aiText.value = 'AI 讲解失败：' + (e && e.message) + '。知识卡内容已足够自学。'
  } finally {
    aiBusy.value = false
  }
}
const qName = computed(() => (q.value && q.value.extra && q.value.extra.name) || '')
const rate = computed(() => (stats.value.total ? Math.round((stats.value.ok / stats.value.total) * 100) : 0))
const methodCard = computed(() => (q.value && q.value.extra && CALC_METHOD_LIB[q.value.extra.name]) || null)
const TRAIN_MODES = MODES.filter((m) => m.k !== 'theory')
const layerProgress = computed(() =>
  TRAIN_MODES.map((m) => {
    const ms = modeStats.value[m.k]
    const t = ms.ok + ms.bad
    return { ...m, pct: t ? Math.round((ms.ok / t) * 100) : 0, done: t, ok: ms.ok, bad: ms.bad }
  })
)
const examPapers = computed(() => (exam.value && exam.value.papers) || [])
const examPaper = computed(() => examPapers.value[Math.min(examPapers.value.length - 1, Math.floor(examQIdx.value / 5))] || null)
const examTotal = computed(() => (exam.value && exam.value.total) || 0)
const examIndexes = computed(() => Array.from({ length: examTotal.value }, (_, i) => i))
const examCurrent = computed(() => (examPaper.value && examPaper.value.qs[examQIdx.value % 5]) || null)
const examLayerKey = computed(() => EXAM_LAYER_KEYS[Math.min(EXAM_LAYER_KEYS.length - 1, examLayerIdx.value)].k)
const examLayerTitle = computed(() => EXAM_LAYER_KEYS[Math.min(EXAM_LAYER_KEYS.length - 1, examLayerIdx.value)].t)
const examLayerItem = computed(() => (examCurrent.value && examCurrent.value.layers[examLayerKey.value]) || null)
const examLayerPct = computed(() =>
  EXAM_LAYER_KEYS.map((m) => {
    const s = examLayerStats.value[m.k]
    const t = s.ok + s.bad
    return { ...m, ok: s.ok, bad: s.bad, done: t, pct: t ? Math.round((s.ok / t) * 100) : 0 }
  })
)
function examWrongItems() {
  const items = []
  const papers = examPapers.value || []
  for (let qi = 1; qi <= examTotal.value; qi++) {
    const wrongRows = examHist.value.filter((h) => h.q === qi && !h.ok)
    if (!wrongRows.length) continue
    const pi = Math.floor((qi - 1) / 5)
    const paper = papers[pi]
    const qq = paper && paper.qs[(qi - 1) % 5]
    if (!paper || !qq) continue
    const wrongLayers = wrongRows.map((h) => (EXAM_LAYER_KEYS.find((x) => x.k === h.layer) || {}).t || h.layer)
    const calc = qq.layers && qq.layers.calc
    items.push({
      stem: String(qq.stem || ''),
      opts: (calc && calc.options || []).map((o) => o.k + '. ' + String(o.t).replace(/<[^>]+>/g, '').trim()).join('\n'),
      answer: (calc && calc.answer) || '',
      explain: (calc && calc.explain || '').slice(0, 1400),
      material: String(paper.materialMd || '').slice(0, 2200),
      wrongLayers,
      typeLabel: qq.typeLabel || ''
    })
  }
  return items
}
function recordExamRun() {
  const total = examHist.value.length
  if (!total || examRecorded.value) return
  examRecorded.value = true
  const ok = examHist.value.filter((h) => h.ok).length
  const st = { total, ok, bad: total - ok, rate: total ? Math.round((ok / total) * 100) : 0, secs: examElapsed.value }
  const layers = {}
  EXAM_LAYER_KEYS.forEach((m) => { const s = examLayerStats.value[m.k]; layers[m.k] = { ok: s.ok, bad: s.bad } })
  pushDtRecord({
    kind: 'exam',
    ts: Date.now(),
    src: dtSrc.value.src,
    field: dtSrc.value.field,
    custom: dtSrc.value.customField,
    srcLabel: srcLabel.value,
    groupSize: examGroupSize.value,
    total: st.total,
    ok: st.ok,
    bad: st.bad,
    rate: st.rate,
    secs: st.secs,
    layers,
    wrong: examWrongItems(),
    seed: (examPaperMeta.value[0] && examPaperMeta.value[0].seed) || 0,
    seeds: examPaperMeta.value.map((x) => x.seed),
    doms: examPaperMeta.value.map((x) => x.domName),
    form: dtForm.value,
    timeKind: dtTime.value
  })
}
function fmtRecTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const p = (n) => (n < 10 ? '0' + n : String(n))
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
}
function recTitle(rec) {
  if (!rec) return ''
  const t = rec.kind === 'exam' ? '📝 完整真题' : '🗂 拆分训练'
  const qn = rec.kind === 'exam' ? '·' + rec.groupSize + '题卷' : (rec.groupSize ? '·' + rec.groupSize + '题组' : '·单题')
  return t + qn
}
function recLayerLine(rec) {
  if (!rec || !rec.layers) return ''
  return EXAM_LAYER_KEYS.map((m) => {
    const s = rec.layers[m.k] || { ok: 0, bad: 0 }
    const n = s.ok + s.bad
    return m.t.replace(/[①②③④] /, '') + (n ? s.ok + '/' + n : '—')
  }).join('  ')
}
function showRecords() {
  recShow.value = true
  recDetail.value = null
  syncRecords()
}
function closeRecords() {
  recShow.value = false
  recDetail.value = null
}
function toggleRecDetail(id) {
  recDetail.value = recDetail.value && recDetail.value.id === id ? null : (readDtRecords().find((r) => r.id === id) || null)
}
function delRecord(id) {
  const next = readDtRecords().filter((r) => r.id !== id)
  saveDtRecords(next)
  records.value = next
  if (recDetail.value && recDetail.value.id === id) recDetail.value = null
}
function addRecordWrongs(rec) {
  const items = (rec && rec.wrong) || []
  if (!items.length) {
    showToast('本场没有答错记录，无需加入错题集', 'info')
    return
  }
  let saved = 0
  let rejected = 0
  items.forEach((it) => {
    const layerTxt = (it.wrongLayers && it.wrongLayers.length ? it.wrongLayers : [it.layerName]).filter(Boolean).join('、')
    const qText = [
      it.material ? it.material : '',
      it.stem ? '【题目】' + it.stem : '',
      it.opts ? it.opts : ''
    ].filter(Boolean).join('\n\n')
    if (!qText) return
    const ansMark = '正确答案 ' + (it.answer || '') + (it.pick ? '（本场选' + it.pick + '）' : '')
    const r = addWrong({
      subject: '资料分析',
      subx: '资料分析',
      question: qText,
      answer: ansMark,
      reasons: ['资料速算·' + (rec.kind === 'exam' ? '完整真题' : '拆分训练') + (layerTxt ? '·' + layerTxt : '') + '答错'],
      explain: it.explain || '',
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
  showToast(saved ? '✅ 已存入错题本 ' + saved + ' 题' + (rejected ? '，' + rejected + ' 条未重复入库' : '') : (rejected ? '🚫 ' + rejected + ' 条非完整/重复未入库' : 'ℹ️ 没有可入库错题'), saved ? 'success' : 'info')
}
function addCurrentSplitWrongs() {
  if (!stats.value.total) { showToast('本组还没有作答记录', 'info'); return }
  recordSplitRun()
  const list = readDtRecords()
  if (list.length) addRecordWrongs(list[0])
}
function addCurrentExamWrongs() {
  if (!examHist.value.length) { showToast('本场还没有作答记录', 'info'); return }
  recordExamRun()
  const list = readDtRecords()
  if (list.length) addRecordWrongs(list[0])
}
function redoRecord(rec) {
  if (!rec) return
  dtSrc.value = { src: rec.src || dtSrc.value.src, field: rec.field || dtSrc.value.field, customField: rec.custom || '' }
  saveDtSrc()
  dtForm.value = rec.form || 'auto'
  dtTime.value = rec.timeKind || 'auto'
  try { localStorage.setItem(DT_FORM_KEY, dtForm.value); localStorage.setItem(DT_TIME_KEY, dtTime.value) } catch (e) {}
  recShow.value = false
  recDetail.value = null
  if (rec.kind === 'exam') {
    view.value = 'exam'
    examGroupSize.value = rec.groupSize || 5
    const seeds = Array.isArray(rec.seeds) && rec.seeds.length ? rec.seeds : [rec.seed || Date.now() % 100000]
    const doms = Array.isArray(rec.doms) && rec.doms.length ? rec.doms : []
    const papers = []
    const domNames = []
    for (let i = 0; i < seeds.length; i++) {
      const want = doms[i] || doms[0] || ''
      const d = activeDomain() || domainOf(want || '粮食')
      papers.push(buildDataTrainExam(seeds[i], d, { form: dtForm.value, timeKind: dtTime.value, chart: dtChart.value }))
      domNames.push(want || d.n)
    }
    exam.value = { papers, total: Math.max(5, examGroupSize.value) }
    examPaperMeta.value = seeds.map((s, i) => ({ seed: s, domName: domNames[i] || '' }))
    examQIdx.value = 0
    examLayerIdx.value = 0
    examPick.value = ''
    examRun.value = false
    examFinished.value = false
    examStart.value = 0
    examQStart.value = 0
    examElapsed.value = 0
    examEndAt.value = 0
    examTotalRemain.value = 0
    examLayerRemain.value = LAYER_BUDGET_SEC
    examWarn3.value = false
    examAiText.value = ''
    examAiBusy.value = false
    examEvalText.value = ''
    examEvalBusy.value = false
    examHist.value = []
    examRecorded.value = false
    examLayerStats.value = { type: { ok: 0, bad: 0 }, locate: { ok: 0, bad: 0 }, formula: { ok: 0, bad: 0 }, calc: { ok: 0, bad: 0 } }
    examReady.value = true
    showToast('📝 已恢复该套真题卷，可重新作答（二刷）', 'success')
    return
  }
  splitReady.value = true
  view.value = 'classic'
  mode.value = rec.mode && rec.mode !== 'theory' ? rec.mode : 'type'
  if (rec.level) level.value = rec.level
  if (rec.stage) stage.value = rec.stage
  paperSeed.value = rec.seed || Date.now() % 100000
  makePaper()
  reset()
  showToast('🗂 已恢复原篇章材料，可重新作答（二刷）', 'success')
}
function initExam() {
  const dom = activeDomain() || domainOf('粮食')
  const base = Date.now() % 100000
  const papers = []
  const seeds = []
  const domNames = []
  const need = Math.ceil(Math.max(5, examGroupSize.value) / 5)
  const others = DOMAINS.filter((d) => d.n !== dom.n)
  const usedNames = [dom.n]
  for (let i = 0; i < need; i++) {
    let d = dom
    if (i > 0 && others.length) {
      let idx = (base + i * 137) % others.length
      let guard = 0
      while (usedNames.includes(others[idx].n) && guard < 40) {
        idx = (idx + 7) % others.length
        guard++
      }
      d = others[idx] || dom
      usedNames.push(d.n)
    }
    seeds.push(base + i * 9173)
    domNames.push(d.n || d.inds[0])
    papers.push(buildDataTrainExam(base + i * 9173, d, { form: dtForm.value, timeKind: dtTime.value, chart: dtChart.value }))
  }
  exam.value = { papers, total: Math.max(5, examGroupSize.value) }
  examPaperMeta.value = seeds.map((s, i) => ({ seed: s, domName: domNames[i] }))
  examQIdx.value = 0
  examLayerIdx.value = 0
  examPick.value = ''
  examRun.value = false
  examFinished.value = false
  examStart.value = 0
  examQStart.value = 0
  examElapsed.value = 0
  examEndAt.value = 0
  examTotalRemain.value = 0
  examLayerRemain.value = LAYER_BUDGET_SEC
  examWarn3.value = false
  examAiText.value = ''
  examAiBusy.value = false
  examEvalText.value = ''
  examEvalBusy.value = false
  examHist.value = []
  examRecorded.value = false
  examLayerStats.value = {
    type: { ok: 0, bad: 0 },
    locate: { ok: 0, bad: 0 },
    formula: { ok: 0, bad: 0 },
    calc: { ok: 0, bad: 0 }
  }
  const c = pickGenCfg()
  if (c && c.key && !examAiBusy.value) setTimeout(() => aiOrganizeExam(), 100)
  examReady.value = true
}
function startExamRun() {
  if (!examCurrent.value || examRun.value) return
  examRun.value = true
  examStart.value = Date.now()
  examQStart.value = Date.now()
  examEndAt.value = Date.now() + examTotal.value * 72 * 1000
  examTotalRemain.value = Math.ceil((examEndAt.value - Date.now()) / 1000)
  examLayerRemain.value = LAYER_BUDGET_SEC
  examWarn3.value = false
  showToast('⏱ 真题组已开始，请按四层顺序作答', 'info')
  const c = pickGenCfg()
  if (c && c.key) setTimeout(() => aiOrganizeExam(), 120)
}
function examAnswer(k) {
  if (!examRun.value) { showToast('请先点击「▶ 开始本组作答」', 'info'); return }
  if (examPick.value || !examLayerItem.value) return
  examPick.value = k
  const ok = k === examLayerItem.value.answer
  const sec = examQStart.value ? Math.max(0, Math.round((Date.now() - examQStart.value) / 1000)) : 0
  const st = examLayerStats.value[examLayerKey.value]
  if (ok) st.ok++
  else st.bad++
  examHist.value.push({ q: examQIdx.value + 1, layer: examLayerKey.value, ok, sec })
  if (examLayerKey.value === 'calc') {
    // 第五题最后一层作答后，四层成绩已入账，答题流程由 examNext 统一推进
  }
}
function examLayerTimeout() {
  if (!examRun.value || examPick.value || !examLayerItem.value) return
  const wrong = examLayerItem.value.options.find((o) => o.k !== examLayerItem.value.answer)
  if (wrong) examAnswer(wrong.k)
}
function examNext() {
  if (!examPick.value) return
  if (examLayerIdx.value < EXAM_LAYER_KEYS.length - 1) {
    examLayerIdx.value++
    examPick.value = ''
    examQStart.value = Date.now()
    examLayerRemain.value = LAYER_BUDGET_SEC
    return
  }
  if (examQIdx.value < examTotal.value - 1) {
    if ((examQIdx.value + 1) % 5 === 0) examAiText.value = ''
    examQIdx.value++
    examLayerIdx.value = 0
    examPick.value = ''
    examQStart.value = Date.now()
    examLayerRemain.value = LAYER_BUDGET_SEC
    return
  }
  examRun.value = false
  examFinished.value = true
  examElapsed.value = examStart.value ? Math.floor((Date.now() - examStart.value) / 1000) : 0
  recordExamRun()
  deepEvalExam()
  try {
    const all = JSON.parse(localStorage.getItem('xc_dt_exam_best') || '{}')
    const domK = String((examPaper.value && (examPaper.value.domName || examPaper.value.area)) || '通用')
    const total = examHist.value.length
    const ok = examHist.value.filter((h) => h.ok).length
    const cur = all[domK]
    const pct = total ? Math.round((ok / total) * 100) : 0
    if (!cur || total >= (cur.total || 0)) all[domK] = { total, ok, pct, ts: Date.now() }
    localStorage.setItem('xc_dt_exam_best', JSON.stringify(all))
  } catch (e) {}
}
async function aiOrganizeExam() {
  if (examAiBusy.value) return
  const c = pickGenCfg()
  if (!c || !c.key) {
    examAiText.value = '尚未配置文字大模型 Key：可先用当前“数据可验算材料”训练，或在「设置 → 模型」配置 Key 后让 AI 重写更自然的公报式正文。'
    return
  }
  const paper = examPaper.value
  if (!paper) return
  examAiBusy.value = true
  examAiText.value = ''
  try {
    const brief = String(paper.materialMd || '').slice(0, 2600)
    const reply = await chatOnce(c, [
      { role: 'system', content: '你是统计公报写作助手。只能改写材料口径与语言风格，不能新增或改动任何数字、年份、单位；输出不超过4段，不用寒暄。' },
      { role: 'user', content: '请把下面这份训练材料改写成更像国家统计局公报正文的 Markdown 文本，保留全部数字、年份、单位与材料结构：\n\n' + brief }
    ], 1400)
    examAiText.value = String(reply || '').trim() || 'AI 未返回内容，请重试。'
  } catch (e) {
    examAiText.value = 'AI 整理失败：' + ((e && e.message) || e) + '；当前本地材料仍可继续作答。'
  } finally {
    examAiBusy.value = false
  }
}
function localEvalText() {
  const rows = EXAM_LAYER_KEYS.map((m) => {
    const s = examLayerStats.value[m.k]
    const t = s.ok + s.bad
    return m.t + ' ' + s.ok + '/' + t + '（' + (t ? Math.round((s.ok / t) * 100) : 0) + '%）'
  }).join('\n')
  const worst = examLayerPct.value.slice().sort((a, b) => a.pct - b.pct)[0]
  return '【本场统计】\n' + rows + '\n\n【能力诊断】\n当前最薄弱层：' + (worst ? worst.t : '') + '。\n\n【训练建议】\n1. 先回「理论课堂」重看该层对应的方法卡与口诀。\n2. 下一套优先完成' + (worst ? worst.t : '速算') + '同考点题。\n3. 每层答错后先复述该层口诀，再做变式题巩固。'
}
async function deepEvalExam() {
  examEvalBusy.value = true
  examEvalText.value = ''
  const c = pickGenCfg()
  if (!c || !c.key) {
    examEvalText.value = localEvalText()
    examEvalBusy.value = false
    return
  }
  try {
    const rows = examHist.value.map((h) => '第' + h.q + '题·' + EXAM_LAYER_KEYS.find((x) => x.k === h.layer).t + (h.ok ? '✓' : '✗') + ' ' + h.sec + 's').join('\n')
    const stats = EXAM_LAYER_KEYS.map((m) => {
      const s = examLayerStats.value[m.k]
      return m.t + '：' + s.ok + '/' + (s.ok + s.bad)
    }).join('\n')
    const reply = await chatOnce(c, [
      { role: 'system', content: '你是行测资料分析教练。基于四层作答记录输出结构化深度评估：①总体判断；②四个能力层逐项诊断；③每题薄弱层；④下一阶段训练建议（按优先级）。要求具体、不超过600字。' },
      { role: 'user', content: '本场真题四层成绩：\n' + stats + '\n\n逐层明细：\n' + rows + '\n\n请输出 Markdown 评估报告。' }
    ], 1600)
    examEvalText.value = String(reply || '').trim() || localEvalText()
  } catch (e) {
    examEvalText.value = 'AI 深度评估失败：' + ((e && e.message) || e) + '\n\n' + localEvalText()
  } finally {
    examEvalBusy.value = false
  }
}

function gen() {
  if (mode.value === 'theory') return
  if (!paper.value) makePaper()
  picked.value = ''
  aiText.value = ''
  const seed = Date.now() % 100000 + idx.value * 137
  q.value = genDataQ(mode.value, seed, level.value, mode.value === 'calc' ? stage.value : undefined, activeDomain(), paper.value)
  if (!q.value) {
    showToast('生成失败，请重试', 'err')
    return
  }
  idx.value++
}
function pick(k) {
  if (!q.value || picked.value) return
  if (!runStarted.value) {
    showToast('请先点击「▶ 开始本组计时」再作答', 'info')
    return
  }
  picked.value = k
  qTime.value = Math.max(0, Math.round((Date.now() - qStart.value) / 1000))
  const ok = k === q.value.answer
  runSnap.value.push({ ok, mode: mode.value, q: q.value, pick: k, t: qTime.value })
  if (ok) {
    stats.value.ok++
    streak.value++
    bestStreak.value = Math.max(bestStreak.value, streak.value)
    score.value += 10 + Math.min(streak.value, 10) * 2
    modeStats.value[mode.value].ok++
  } else {
    stats.value.bad++
    streak.value = 0
    modeStats.value[mode.value].bad++
  }
  stats.value.total++
  hist.value.push({ ok, t: qTime.value })
  try { lockWords.value = findLockWords(q.value && (q.value.materialMd || q.value.materialSvg)) } catch (e) {}
  if (groupSize.value > 0 && stats.value.total >= groupSize.value) {
    groupDone.value = true
    elapsed.value = Math.floor((Date.now() - stats.value.start) / 1000)
    runStarted.value = false
    recordSplitRun()
    saveRunBest()
    setTimeout(() => { resultShow.value = true }, 350)
  }
}
function switchMode(m) {
  mode.value = m
  if (m === 'theory') return
  reset()
}
function setLevel(l) {
  level.value = l
  reset()
}
function setStage(st) {
  stage.value = st
  reset()
}
function reset() {
  recordSplitRun() // v3.8.256：已作答但未按“结算”关闭/换组时也自动入历史
  saveRunBest() // v3.8.198 结算上一轮 → 记录该模式·难度历史最佳
  splitRecorded.value = false
  runSnap.value = []
  groupDone.value = false
  runStarted.value = false
  resultShow.value = false
  hist.value = []
  chain.value = null
  stats.value = { ok: 0, bad: 0, total: 0, start: 0 }
  elapsed.value = 0
  streak.value = 0
  idx.value = 0
  if (splitReady.value) gen()
}
function splitStandby() {
  splitReady.value = false
  q.value = null
  picked.value = ''
  reset()
}
function startSplitSession() {
  if (!activeDomain()) return
  makePaper()
  splitReady.value = true
  reset()
  showToast('🤖 已按你的来源/领域/材料排版生成单题，同一篇材料贯穿四层', 'success')
}
function nextQ() {
  if (groupSize.value > 0 && stats.value.total >= groupSize.value) { groupDone.value = true; showToast('🏁 本组已完成，点「🔄 再来一组」或换组量', 'success'); return }
  gen()
}
function sendChat() {
  if (!q.value) return
  const opts = q.value.options.map((o) => o.k + '. ' + o.t).join('\n')
  emit(
    'send-question',
    '【资料分析·四层能力训练】请用名师方法（LY四层能力 + 小P老师速算体系）详细讲解并给出记忆口诀：\n' +
      q.value.q + '\n' + opts + '\n\n正确答案：' + q.value.answer
  )
}

// AI 教练：仅在用户主动点击时调用一次（省 token），针对本题+答题情况做名师讲解
async function aiCoach() {
  if (!q.value || aiBusy.value) return
  aiBusy.value = true
  aiText.value = ''
  try {
    const c = activeCfg(false)
    if (!c || !c.key) {
      aiText.value = '尚未配置可用的大模型 Key，可先用左侧「方法卡 + 口诀」自学。'
      return
    }
    const opts = q.value.options.map((o) => o.k + '. ' + o.t).join('\n')
    const myAns = picked.value ? (picked.value === q.value.answer ? '（做对了）' : '（做错了，选的是 ' + picked.value + '）') : '（还没作答）'
    const prompt =
      '你是行测资料分析名师（LY《资料分析一本通》四层能力 + 小P老师速算体系）。请针对这道训练题做针对性讲解：\n' +
      '【题目】' + q.value.q + '\n【选项】' + opts + '\n【正确答案】' + q.value.answer + '\n【我的答案】' + myAns +
      '\n【当前训练模式】' + qName.value +
      '\n\n要求：1) 一句话点明考点与本题突破口；2) 用「判题型→找数据→选公式→速算」四层框架讲清思路；3) 给出具体操作；4) 结尾给一条记忆口诀。控制在 400 字内，不要寒暄。'
    const reply = await chatOnce(c, [
      { role: 'system', content: '你是行测资料分析名师，讲解简洁、可操作、有口诀。' },
      { role: 'user', content: prompt }
    ], 1200)
    aiText.value = String(reply || '').trim() || '（AI 未返回内容，请重试）'
  } catch (e) {
    aiText.value = 'AI 讲解失败：' + (e && e.message) + '。左侧方法卡与口诀已足够自学，也可稍后重试。'
  } finally {
    aiBusy.value = false
  }
}

// 萌宠「读题」上下文：训练题也支持全局朗读/小助理分析
watch(q, (qq) => {
  if (!qq) return
  const opts = (qq.options || []).map((o) => o.k + '、' + String(o.t).replace(/<[^>]+>/g, ' ')).join('。')
  store.readCtx = {
    type: 'data',
    title: '资料分析·' + ((qq.extra && qq.extra.name) || '') + '训练',
    text: ('题干：' + String(qq.q || '').replace(/<[^>]+>/g, ' ').trim() + '。选项：' + opts + '。').slice(0, 900)
  }
  store.curQ = { plate: '资料分析', kind: '四层能力训练', stem: qq.q, options: qq.options, answer: qq.answer }
})

// 快捷键：Esc 返回 / A-D 作答 / → 下一题
function onKey(e) {
  const t = e.target
  if (t && t.closest && t.closest('input,textarea,[contenteditable]')) return
  if (e.key === 'Escape') emit('close')
  if (view.value === 'exam') {
    const mk = { a: 'A', b: 'B', c: 'C', d: 'D' }[String(e.key).toLowerCase()]
    if (mk && examRun.value && !examPick.value && examLayerItem.value) examAnswer(mk)
    else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && examPick.value) examNext()
    return
  }
  const m = { a: 'A', b: 'B', c: 'C', d: 'D' }[String(e.key).toLowerCase()]
  if (m && !picked.value && q.value) pick(m)
  if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && picked.value) nextQ()
}
onMounted(() => {
  if (view.value === 'exam') {
    examReady.value = false
    exam.value = null
  }
  else if (splitReady.value) gen()
  else q.value = null // v3.8.256：先由用户选定来源/领域/材料后点 AI 出题
  window.addEventListener('keydown', onKey)
  timerId = setInterval(() => {
    if (view.value === 'exam') {
      if (examRun.value && examStart.value) {
        const now = Date.now()
        examElapsed.value = Math.floor((now - examStart.value) / 1000)
        if (examEndAt.value) {
          const totalRem = Math.max(0, Math.ceil((examEndAt.value - now) / 1000))
          examTotalRemain.value = totalRem
          if (totalRem <= 180 && !examWarn3.value) {
            examWarn3.value = true
            showToast('⏰ 本场考试还剩 3 分钟，请抓紧作答', 'info')
          }
          if (totalRem <= 0 && !examFinished.value) {
            examRun.value = false
            examFinished.value = true
            examElapsed.value = examStart.value ? Math.floor((Date.now() - examStart.value) / 1000) : 0
            recordExamRun()
            deepEvalExam()
          }
        }
        const qSec = examQStart.value ? Math.floor((now - examQStart.value) / 1000) : 0
        examLayerRemain.value = Math.max(0, LAYER_BUDGET_SEC - qSec)
        if (examLayerRemain.value === 0 && !examPick.value && examLayerItem.value) examLayerTimeout()
      }
    } else if (runStarted.value && stats.value.start) elapsed.value = Math.floor((Date.now() - stats.value.start) / 1000)
  }, 1000)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  if (timerId) clearInterval(timerId)
})

const HELP_MD = `**LY《资料分析一本通》四层能力 —— 做题前先在脑中过这四层**

资料分析考的不是纯计算，而是四层能力层层递进：统计阅读 → 数据定位 → 公式选择 → 计算执行。

1. **① 统计阅读 · 判题型**：先读懂材料本质是"统计报告"，精确理解统计术语（同比/环比/百分点/增速加快X个百分点/累计与单月/顺逆差/名义与实际）。读不懂术语就找不对数、判错方向。

2. **② 数据定位 · 找数据**：用结构阅读快速锁定数据（文字第几段第几句 / 表格第几行第几列 / 图中哪根柱哪个点），时间、指标、单位三锁定，快准狠。

3. **③ 公式选择 · 应激**：3-5秒内完成"识别统计概念 → 判断计算方向 → 确定公式变体"。问"百分点"→两期比重差；问"百分之几"→比值增长率；问"隔一年"→间隔；问"平均每…增长%"→平均数增长率；相加成整体→混合；相乘成整体→乘积。

4. **④ 计算执行 · 速算**：先看选项差距（二八速判）再选估算方法（化除为乘/份数/百化分/截位/放缩），系统观念、不精算到小数点——公考本质是筛选。

**如何高效训练**：四层逐层过关才算"会做资料分析"。本模块四种模式各对应一层，可随时切换难度（🌱入门 / ⚡进阶 / 🔥实战）。速算模式分三阶段训练：🔍方法识别 → ✏️方法应用 → 🎯实战混合。答错时右侧会展示"判别口诀 + 速算过程 + 操作步骤"，这正是 LY 老师强调的复盘动作：复选公式、查时间/单位/方向/基数陷阱、复盘估算路径。`
onUnmounted(() => {
  if (view.value === 'exam' && examHist.value && examHist.value.length && !examFinished.value) recordExamRun()
  else if (view.value !== 'exam' && stats.value && stats.value.total) recordSplitRun()
  saveRunBest()
}) // v3.8.198 关闭时结算本轮；v3.8.256 同步入历史
</script>
<template>
  <div v-if="view === 'classic'" class="ov show dt-ov" @click.self="emit('close')">
    <div class="pnl dt-pnl">
      <div class="dt-head">
        <button class="pnl-top-b" style="margin-right: 4px" title="返回上一层（也可按 Esc / 浏览器返回）" @click="emit('close')">← 返回</button>
        <span class="dt-title">📊 资料分析 · 真题速算四层拆分训练</span>
        <div class="dt-acts">
          <span class="dt-chip" title="累计积分：答对+10，连击有加成">🏆 {{ score }}</span><span v-if="bestChip" class="dt-chip" :title="'该模式·难度历史最佳'" style="color:#fbbf24">🏅 {{ bestChip.ok }}题 {{ bestChip.pct }}%</span>
          <span class="dt-chip" :class="{ hot: streak >= 3 }" title="连续答对">🔥 ×{{ streak }}<span v-if="bestStreak" class="dt-chip-sub">（最高{{ bestStreak }}）</span></span><span class="dt-chip" title="本轮用时/计时状态">{{ runStarted ? '⏱ 本场 ' + elapsed + 's' : '⏱ 待开始' }}</span><span v-if="groupSize > 0" class="dt-chip" :class="{ hot: groupDone }" title="题组进度">📦 {{ stats.total }}/{{ groupSize }}{{ groupDone ? ' ✅' : '' }}</span>
          <button class="btn btn-gh" @click="helpShow = !helpShow">{{ helpShow ? '收起说明' : '📖 能力说明' }}</button>
          <button class="btn btn-gh" title="查看拆分训练/完整真题的练习与考试记录" @click="showRecords()">📜 练习记录</button>
          <button class="btn btn-pri" title="同一篇材料5问 × 判题/定位/公式/速算" @click="setView('exam')">📝 完整真题卷</button>
          <button class="btn btn-pri" @click="startSplitSession()">🔄 再来一组</button>
          <button class="pc-close" @click="emit('close')">✕</button>
        </div>
      </div>

      <div v-if="!splitReady" class="dt-body dt-guide">
        <div class="dt-guide-in" style="flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:10px">
          <div style="background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:10px;padding:12px 14px">
            <div style="font-weight:800;font-size:15px;color:var(--accent)">🤖 先选配置，再开始单题四层训练</div>
            <div style="font-size:13px;color:var(--text2);line-height:1.8;margin-top:6px">
              每轮只练 <b>1 道题</b>，但会完整展开材料：文字 / 表格 / 图表 / 混合任选，AI 按你选的口径生成同一篇材料。
              从「① 判题型」开始，答完可切换 ②找数据、③公式、④速算，材料保持同一篇，只换当前训练的能力层。
            </div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            <span class="dt-chip">来源：</span>
            <select :value="dtSrc.src" style="font-size:11px;max-width:190px" @change="setSrc($event.target.value)"><option v-for="x in SRC_OPTIONS" :key="x" :value="x">{{ x }}</option></select>
            <span class="dt-chip">领域：</span>
            <select :value="dtSrc.field" style="font-size:11px;max-width:190px" @change="setField($event.target.value)"><optgroup label="🔥 热门领域"><option v-for="x in FIELD_HOT" :key="x" :value="x">{{ x }}</option></optgroup><optgroup label="🧊 冷门 / 专项领域"><option v-for="x in FIELD_COLD" :key="x" :value="x">{{ x }}</option></optgroup></select>
            <input :value="dtSrc.customField" placeholder="自定义领域(回车)" style="width:130px;font-size:11px" @change="setCustomField($event.target.value)" />
            <span class="dt-chip">统计口径：</span>
            <button v-for="x in TIME_OPTIONS" :key="x.k" class="btn" :class="dtTime === x.k ? 'btn-pri' : 'btn-gh'" style="padding:1px 8px;font-size:11px" @click="setDtTime(x.k)">{{ x.t }}</button>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            <span class="dt-chip">材料排版：</span>
            <button v-for="x in FORM_OPTIONS" :key="x.k" class="btn" :class="dtForm === x.k ? 'btn-pri' : 'btn-gh'" style="padding:1px 8px;font-size:11px" @click="setDtForm(x.k)">{{ x.t }}</button>
            <template v-if="dtForm === 'auto' || dtForm === 'textChart' || dtForm === 'tableChart' || dtForm === 'all'">
              <span class="dt-chip">图型：</span>
              <button v-for="ck in [{ k: 'auto', t: '自动平衡' }, { k: 'bar', t: '柱形' }, { k: 'line', t: '折线' }, { k: 'combo', t: '柱线组合' }, { k: 'pie', t: '饼形' }]" :key="ck.k" class="btn" :class="dtChart === ck.k ? 'btn-pri' : 'btn-gh'" style="padding:1px 8px;font-size:11px" @click="dtChart = ck.k">{{ ck.t }}</button>
            </template>
          </div>
          <div style="border:1px dashed var(--glass-border);border-radius:10px;padding:10px 12px;font-size:12px;color:var(--text3);line-height:1.8">
            💡 首次进来建议：先选「热门领域 + 年度 + 三者混合」，完成 10 道以上拆分训练形成四层画像后，再点右上「📝 完整真题卷」做 5/10/15/20 题整卷计时。材料一律为本地模拟可验算数据，联网“真实材料”只作口径核对。
          </div>
          <button class="btn btn-pri" style="padding:9px 18px;font-size:13px;align-self:flex-start" @click="startSplitSession()">🤖 AI 智能出题 · 生成拆分单题</button>
        </div>
      </div>
      <div v-else class="dt-body">
        <!-- 左栏：四层进度 + 方法卡 + 统计（手机端自动折叠成横向卡片） -->
        <div class="dt-side">
          <div class="dt-card">
            <div class="dt-card-t">🧭 LY 四层能力 · 本场进度</div>
            <div v-for="lp in layerProgress" :key="lp.k" class="dt-py-row" :class="{ on: mode === lp.k }" @click="switchMode(lp.k)">
              <div class="dt-py-l"><b>{{ lp.layer || lp.t }}</b><span class="dt-py-cnt">{{ lp.ok }}/{{ lp.done }}</span></div>
              <div class="dt-py-bar"><i :style="{ width: lp.pct + '%' }"></i></div>
            </div>
            <div class="dt-py-tip">{{ LAYER_TIPS[mode] }}</div>
          </div>

          <div v-if="q && q.tip" class="dt-card dt-method">
            <div class="dt-card-t" style="cursor: pointer" @click="methodOpen = !methodOpen">
              💡 本方法口诀 {{ methodOpen ? '▾' : '▸' }}
            </div>
            <template v-if="methodOpen">
              <div class="dt-method-b">{{ q.tip }}</div>
              <div v-if="methodCard" class="dt-method-detail">
                <div class="dt-md-row"><b>考点链接：</b>{{ methodCard.trigger }}</div>
                <div class="dt-md-row"><b>原理：</b>{{ methodCard.concept }}</div>
                <div class="dt-md-row"><b>操作：</b>
                  <ol class="dt-md-steps">
                    <li v-for="(st, i) in methodCard.steps" :key="i">{{ st }}</li>
                  </ol>
                </div>
              </div>
            </template>
          </div>

          <div class="dt-card dt-stats">
            <div class="dt-card-t">📈 本场统计</div>
            <div class="dt-st-row">✅ 答对 <b>{{ stats.ok }}</b></div>
            <div class="dt-st-row">❌ 答错 <b>{{ stats.bad }}</b></div>
            <div class="dt-st-row">🎯 正确率 <b>{{ rate }}%</b></div>
            <div class="dt-st-row">⏱ 用时 <b>{{ runStarted ? elapsed + 's' : '待开始' }}</b></div>
            <div v-if="stats.bad" class="dt-st-tip">💪 错题即学：看右侧解析里的口诀与方法卡，点「下一题」巩固</div>
            <div v-else-if="stats.total" class="dt-st-tip">🎉 全对！试试切到 🔥 实战难度或下一层能力</div>
          </div>

          <div class="dt-card dt-keys">
            <div class="dt-card-t">⌨️ 快捷键</div>
            <div class="dt-keys-b"><b>A-D</b> 作答 · <b>→</b> 下一题 · <b>Esc</b> 返回</div>
          </div>
        </div>

        <!-- 右栏：训练区 -->
        <div class="dt-train">
          <div class="dt-modes">
            <button v-for="m in MODES" :key="m.k" class="btn" :class="mode === m.k ? 'btn-pri' : 'btn-gh'" :title="m.d" @click="switchMode(m.k)">{{ m.t }}</button>
          </div>
          <div class="dt-diff">
            <span class="dt-diff-lb">难度</span>
            <button v-for="l in LEVELS" :key="l.v" class="btn" :class="level === l.v ? 'btn-pri' : 'btn-gh'" :title="l.d" @click="setLevel(l.v)">{{ l.t }}</button>
            <template v-if="mode === 'calc'">
              <span class="dt-diff-sep">│</span>
              <span class="dt-diff-lb">阶段</span>
              <button v-for="st in STAGES" :key="st.k" class="btn" :class="stage === st.k ? 'btn-pri' : 'btn-gh'" :title="st.d" @click="setStage(st.k)">{{ st.t }}</button>
            </template>
          </div>

          <div v-if="helpShow && mode !== 'theory'" class="dt-help" v-html="md(HELP_MD)"></div>

          <!-- 理论课堂：双师知识点库 -->
          <template v-else-if="mode === 'theory'">
            <div class="dt-kb">
              <div class="dt-kb-bar">
                <input v-model="kbKw" class="dt-kb-input" placeholder="🔍 搜索知识点（如：化除为乘、间隔、比重、二八速判…）" />
                <button v-for="l in KB_LAYERS" :key="l.k" class="btn" :class="kbLayer === l.k ? 'btn-pri' : 'btn-gh'" :title="l.d" @click="kbLayer = kbLayer === l.k ? '' : l.k">{{ l.t }}</button>
                <button v-for="src in ['LY', '小P', '双师']" :key="src" class="btn" :class="kbSource === src ? 'btn-pri' : 'btn-gh'" title="按来源筛选" @click="kbSource = kbSource === src ? '' : src">{{ src }}</button>
                <span class="dt-kb-count">共 {{ kbCount }} 个知识点 · 已学 {{ kbLearned }} · 收藏 {{ Object.keys(kbStar).filter((k) => kbStar[k]).length }}</span>
              </div>
              <div class="dt-kb-list">
                <div v-for="card in kbList" :key="card.id" class="dt-kb-item" :class="{ open: kbOpen === card.id, star: kbStar[card.id] }" @click="kbOpen = kbOpen === card.id ? null : card.id; markRead(card.id)">
                  <div class="dt-kb-head">
                    <span class="dt-kb-layer">{{ (KB_LAYERS.find((l) => l.k === card.layer) || {}).t }}</span>
                    <span class="dt-kb-src">{{ card.source }}</span>
                    <b class="dt-kb-title">{{ card.title }}</b>
                    <span class="dt-kb-read">{{ kbRead[card.id] ? '✓' : '' }}</span>
                    <span class="dt-kb-star" title="收藏" @click.stop="toggleStar(card.id)">{{ kbStar[card.id] ? '★' : '☆' }}</span>
                  </div>
                  <div v-if="kbOpen === card.id" class="dt-kb-detail">
                    <div class="dt-kb-row"><b>原理：</b>{{ card.principle }}</div>
                    <div v-if="card.derivation" class="dt-kb-row"><b>推导：</b>{{ card.derivation }}</div>
                    <div class="dt-kb-row"><b>适用场景：</b>{{ card.scene }}</div>
                    <div class="dt-kb-row"><b>操作：</b>
                      <ol class="dt-kb-steps">
                        <li v-for="(st, i) in card.steps" :key="i">{{ st }}</li>
                      </ol>
                    </div>
                    <div v-if="card.example" class="dt-kb-row">
                      <b>真题示例：</b>{{ card.example.q }}
                      <template v-if="card.example.opts">（{{ card.example.opts.join('  ') }}）</template>
                      <span v-if="card.example.answer" class="dt-kb-ans">答案：{{ card.example.answer }}</span>
                      <div class="dt-kb-path">{{ card.example.path }}</div>
                    </div>
                    <div class="dt-kb-row tip"><b>口诀：</b>{{ card.tip }}</div>
                    <div v-if="card.sourceNote" class="dt-kb-note">{{ card.sourceNote }}</div>
                    <div class="dt-kb-acts">
                      <button class="btn btn-gh" :class="{ busy: aiBusy }" :disabled="aiBusy" @click.stop="aiExplainCard(card)">{{ aiBusy ? '⏳ AI 讲解中…' : '🤖 AI 展开讲解' }}</button>
                    </div>
                    <div v-if="aiText" class="dt-ai" v-html="md(aiText)"></div>
                  </div>
                </div>
                <div v-if="!kbList.length" class="dt-kb-empty">没有找到匹配的知识点，换个关键词试试～</div>
              </div>
            </div>
          </template>

      <template v-else-if="q">

  <div class="dt-set" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:4px 0;font-size:11px">
  <span v-if="mode === 'locate' || mode === 'formula'" class="dt-chip" style="cursor:pointer" :title="'三锁定高亮'" @click="lockShow = !lockShow">{{ lockShow ? '🔍 三锁定高亮开' : '🔍 三锁定高亮关' }}</span>
        <button v-if="mode === 'locate'" class="btn btn-gh" style="padding:1px 8px;font-size:11px" title="同一篇文字+表格+统计图材料连续出 5 问" @click="startChain()">🔁 同材料连问(5问·混合)</button>
        <span v-if="chain" class="dt-chip" style="color:#34d399">📋 同材料 {{ chainIdx + 1 }}/{{ chain.qs.length }}</span>
        <button v-if="chain && picked && chainIdx < chain.qs.length - 1" class="btn btn-pri" style="padding:1px 8px;font-size:11px" @click="chainNext()">➡️ 下一问(同材料)</button>
        <span class="dt-chip">组量：</span>
  <button v-for="n in [0, 1, 5, 10, 15, 20]" :key="n" class="btn" :class="groupSize === n ? 'btn-pri' : 'btn-gh'" style="padding:1px 8px;font-size:11px" @click="setGroup(n)">{{ n === 0 ? '🎲 随机' : n + '题' }}</button>
  <button v-if="!runStarted" class="btn btn-pri" style="padding:1px 10px;font-size:11px" @click="startRun()">▶ 开始本组计时</button>
  <button v-else class="btn btn-gh" style="padding:1px 10px;font-size:11px" @click="settleRun()">🏁 结算本轮成绩</button>
  <span class="dt-chip">来源：</span>
  <select :value="dtSrc.src" style="font-size:11px" @change="setSrc($event.target.value)"><option v-for="x in SRC_OPTIONS" :key="x" :value="x">{{ x }}</option></select>
  <span class="dt-chip">领域：</span>
  <select :value="dtSrc.field" style="font-size:11px" @change="setField($event.target.value)"><optgroup label="🔥 热门领域"><option v-for="x in FIELD_HOT" :key="x" :value="x">{{ x }}</option></optgroup><optgroup label="🧊 冷门 / 专项领域"><option v-for="x in FIELD_COLD" :key="x" :value="x">{{ x }}</option></optgroup></select>
  <input :value="dtSrc.customField" placeholder="自定义领域(回车)" style="width:110px;font-size:11px" @change="setCustomField($event.target.value)" />
  <button class="btn" :class="srcMode === 'sim' ? 'btn-pri' : 'btn-gh'" style="padding:1px 8px;font-size:11px" @click="setSrcMode('sim')">🧪 模拟材料</button>
  <button class="btn" :class="srcMode === 'real' ? 'btn-pri' : 'btn-gh'" style="padding:1px 8px;font-size:11px" @click="setSrcMode('real')">📡 真实材料(联网)</button>
  <button class="btn btn-gh" style="padding:1px 8px;font-size:11px" title="同一领域换一篇新模拟材料" @click="refreshPaper()">🎲 换一篇</button>
  <a class="btn btn-gh" :href="srcSearchHref" target="_blank" rel="noopener" style="padding:1px 8px;font-size:11px;text-decoration:none" title="打开官方/必应搜索，核对真实统计公报与单位">🌐 查官网</a>
  <button class="btn btn-gh" :disabled="srcCheckBusy" style="padding:1px 8px;font-size:11px" @click="checkSourceOnline()">{{ srcCheckBusy ? '⏳ 联网中…' : '📡 联网核实' }}</button>
  </div>
  <div style="font-size:11px;color:var(--text3);border:1px dashed var(--glass-border);border-radius:8px;padding:4px 8px;margin:2px 0 6px">当前同一篇材料将贯穿 ①判题型 → ②找数据 → ③公式 → ④速算；切换四层只换题型，不换材料。</div>
  <div v-if="srcMode === 'real'" class="dt-mat-note" style="color:#fbbf24;border:1px solid rgba(251,191,36,.4);border-radius:8px;padding:6px 10px;margin:2px 0 8px">📡 真实材料模式：请查看「联网核实」弹窗中的官方口径/真实资料卡；当前选择题仍为同领域模拟数据，因为联网返回的官方数字尚未开放稳定接口，不能用来自动判题。</div>
  
      <div v-if="groupDone && groupSize > 0" class="dt-grp-sum" style="border:1px solid var(--glass-border);border-radius:12px;padding:10px 12px;margin:4px 0;background:var(--bg2,transparent)">
        <div style="font-weight:700">🏁 本组完成</div>
        <div style="font-size:12px;color:var(--text2);margin-top:4px">共 {{ grpStats.total }} 题 · ✅对 {{ grpStats.ok }} · ❌错 {{ grpStats.bad }} · 正确率 <b>{{ grpStats.rate }}%</b> · 总用时 <b>{{ grpStats.secs }}s</b>（平均每题 {{ grpStats.avg }}s）</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">本题用时：<span v-for="(h,i) in hist" :key="i" :style="{ color: h.ok ? '#34d399' : '#fb7185' }">{{ h.t }}s{{ h.ok ? '✓' : '✗' }} </span></div>
        <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-pri" style="padding:2px 10px;font-size:12px" @click="reset()">🔄 再来一组</button><button class="btn btn-gh" style="padding:2px 10px;font-size:12px" @click="setGroup(0)">🎲 换随机</button></div>
      </div>
      <div v-if="mode === 'locate' && picked && (lockWords.time.length || lockWords.ind.length || lockWords.unit.length)" class="dt-lock-fb" style="border-left:3px solid var(--accent,#22d3ee);background:rgba(34,211,238,.08);border-radius:8px;padding:8px 10px;margin:4px 0;font-size:12px">
        <b>🔍 判题后三锁定复盘</b>：⏱ 时间【<span v-for="(w,i) in lockWords.time" :key="'t'+i">{{ w }} </span>】 📐 指标【<span v-for="(w,i) in lockWords.ind" :key="'i'+i">{{ w }} </span>】 📏 单位【<span v-for="(w,i) in lockWords.unit" :key="'u'+i">{{ w }} </span>】——再看一遍题干要的是哪个，答错常因时间/指标/单位三锁定之一漏锁。
      </div>
            <div class="dt-qcard">
              <div class="dt-qhead">
                <span class="dt-qtag">{{ qName || '训练' }}</span>
                <span class="dt-qmode">{{ MODES.find((m) => m.k === mode).t }}<template v-if="mode === 'calc'"> · {{ STAGES.find((s) => s.k === stage).t }}</template></span>
                <span class="dt-qidx">第 {{ idx }} 题</span>
              </div>
            <div v-if="q.materialMd || q.materialSvg" class="dt-mat-scroll"><div v-if="q.materialMd" class="dt-mat" v-html="md(materialHighlights(q.materialMd))"></div><div v-if="q.materialSvg" class="dt-mat dt-mat-svg" v-html="q.materialSvg"></div></div>
            <div v-if="q.materialMd || q.materialSvg" class="dt-mat-note">{{ q._srcLabel ? '📊 训练领域设定：' + q._srcLabel + ' · ' : '' }}🧪 材料数值为本地模拟，仅练定位/速算；真实官方数值需以「🌐 查官网 / 📡 联网核实」结果为准。</div>
<div v-if="q.materialMd || q.materialSvg" class="dt-mat-note" style="color:var(--text3)">⇄ 手机上左右滑动可查看完整图/表材料</div>
      <div v-if="realRef" class="dt-mat-note" style="border-color:rgba(52,211,153,.45);color:var(--text2)">{{ realRef }}</div>
              <div class="dt-q" v-html="md(q.q)"></div>
            </div>

            <div class="dt-opts" :class="{ wide: mode === 'formula' }">
              <button v-for="o in q.options" :key="o.k" class="dt-opt" :class="{ picked: picked === o.k, right: picked && o.k === q.answer, wrong: picked && o.k === picked && o.k !== q.answer }" :disabled="!!picked || !runStarted" @click="pick(o.k)">
                <span class="dt-k">{{ o.k }}</span><span class="dt-t" v-html="md(o.t)"></span>
              </button>
              <div v-if="!runStarted && !picked" class="dt-mat-note" style="color:var(--text3);margin-top:4px">请先选择组量并点击「▶ 开始本组计时」，作答后再逐题计时。</div>
            </div>

            <div v-if="picked" class="dt-explain">
              <div class="dt-ex-t" :class="picked === q.answer ? 'ok' : 'bad'">
                {{ picked === q.answer ? '✅ 回答正确' : '❌ 答错了，看这里' }}
                <span v-if="picked === q.answer" class="dt-ex-gain">+{{ 10 + Math.min(streak, 10) * 2 }} 分</span>
              </div>
              <div class="dt-ex-b" v-html="md(q.explain)"></div>
              <div class="dt-ex-acts">
                <button class="btn btn-pri" @click="nextQ()">➡️ 下一题</button>
                <button v-if="quizCard" class="btn btn-gh" title="跳转到理论课堂查看这张知识点卡" @click="openQuizCard()">📖 看这张卡</button>
                <button class="btn btn-gh" @click="sendChat()">💬 发到对话深挖</button>
                <button class="btn btn-gh" :class="{ busy: aiBusy }" :disabled="aiBusy" @click="aiCoach()">{{ aiBusy ? '⏳ AI 讲解中…' : '🤖 AI 教练讲解' }}</button>
              </div>
              <div v-if="aiText" class="dt-ai" v-html="md(aiText)"></div>
            </div>
          </template>
          <div v-else class="dt-loading">⏳ 出题中…</div>
        </div>
      </div>
    </div>
      <div v-if="srcCheckShow" class="ov show" style="z-index:460" @click.self="srcCheckShow = false">
        <div class="pnl dt-pnl" style="max-height:86vh">
          <div class="dt-head">
            <span class="dt-title">📡 联网核实 · {{ srcLabel }}</span>
            <button class="pc-close" @click="srcCheckShow = false">✕</button>
          </div>
          <div style="overflow:auto;min-height:0;padding:2px 2px 12px;font-size:13px;line-height:1.8;color:var(--text)">
            <div style="font-size:12px;color:var(--text2);margin-bottom:8px">先自动抓取维基/公开检索摘要；若配置了文字大模型，再让 AI 基于摘要核对「哪些是真实官方口径、哪些仍需去官网确认」。</div>
            <a class="btn btn-gh" :href="srcSearchHref" target="_blank" rel="noopener" style="margin:0 6px 6px 0;padding:3px 10px;font-size:12px;text-decoration:none">🌐 打开必应搜索「{{ srcSearchTerm }}」</a>
            <div v-if="srcCheckBusy" class="sim-loading"><span class="spin"></span> 联网检索 + AI 核对中…</div>
            <template v-else>
              <div style="font-weight:700;margin:6px 0 4px">🔎 联网摘要</div>
              <div v-for="(it,i) in srcCheckItems" :key="i" class="dt-mat-row" style="margin:4px 0;background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:8px;padding:8px 10px">
                <div>{{ it.text || '（无摘要）' }}</div>
                <a v-if="it.url" :href="it.url" target="_blank" rel="noopener" style="font-size:11px;color:var(--accent)">来源 ↗</a>
              </div>
              <div style="font-weight:700;margin:10px 0 4px">🤖 AI 口径核对</div>
              <div class="dt-ai" v-html="md(srcCheckAi || '（暂无 AI 结果）')"></div>
            </template>
          </div>
        </div>
      </div>
      <div v-if="resultShow" class="ov show" style="z-index:462" @click.self="closeResult()">
        <div class="pnl dt-pnl" style="max-height:82vh">
          <div class="dt-head">
            <span class="dt-title">🏁 本组成绩结算</span>
            <button class="pc-close" @click="closeResult()">✕</button>
          </div>
          <div style="overflow:auto;padding:2px 2px 12px">
            <div class="dt-grp-sum" style="border:1px solid var(--glass-border);border-radius:12px;padding:12px;background:var(--bg2,transparent)">
              <div style="font-weight:800;font-size:15px">共 {{ grpStats.total }} 题</div>
              <div style="font-size:13px;color:var(--text2);margin-top:6px;line-height:2">
                ✅ 答对 <b style="color:#34d399">{{ grpStats.ok }}</b> · ❌ 答错 <b style="color:#fb7185">{{ grpStats.bad }}</b> · 正确率 <b>{{ grpStats.rate }}%</b><br/>
                本场计时 <b>{{ grpStats.secs }}s</b> · 平均每题 <b>{{ grpStats.avg }}s</b>
              </div>
              <div v-if="hist.length" style="font-size:12px;color:var(--text3);margin-top:6px">每道题用时：<span v-for="(h,i) in hist" :key="i" :style="{ color: h.ok ? '#34d399' : '#fb7185' }">第{{ i + 1 }}题 {{ h.t }}s{{ h.ok ? '✓' : '✗' }} </span></div>
            </div>
            <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-pri" @click="reset()">🔄 再来一组</button>
              <button class="btn btn-pri" @click="addCurrentSplitWrongs()">📌 本场错题入库</button>
              <button class="btn btn-gh" @click="showRecords()">📜 查看历史记录</button>
              <button class="btn btn-gh" @click="closeResult()">👀 先看本题解析</button>
            </div>
          </div>
        </div>
      </div>
  </div>
  <div v-else class="ov show dt-ov" @click.self="emit('close')">
    <div class="pnl dt-pnl">
      <div class="dt-head">
        <button class="pnl-top-b" style="margin-right:4px" title="返回上一层（Esc）" @click="emit('close')">← 返回</button>
        <span class="dt-title">📊 资料分析 · AI 智能出题 · 完整真题卷</span>
        <div class="dt-acts">
          <button class="btn btn-gh" style="padding:1px 8px;font-size:11px" title="四层拆分训练，同一篇材料共用" @click="setView('classic')">🗂 真题拆分训练</button>
          <button class="btn btn-gh" style="padding:1px 8px;font-size:11px" title="查看练习/考试记录并二刷" @click="showRecords()">📜 练习记录</button>
          <button class="btn btn-gh" style="padding:1px 8px;font-size:11px" @click="emit('close')">✕</button>
        </div>
      </div>

      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:8px;padding:5px 8px;margin-bottom:8px">
        <span class="dt-chip">来源：</span>
        <select :value="dtSrc.src" style="font-size:11px;max-width:170px" @change="setSrc($event.target.value)">
          <option v-for="x in SRC_OPTIONS" :key="x" :value="x">{{ x }}</option>
        </select>
        <span class="dt-chip">领域：</span>
        <select :value="dtSrc.field" style="font-size:11px" @change="setField($event.target.value)">
          <optgroup label="🔥 热门领域"><option v-for="x in FIELD_HOT" :key="x" :value="x">{{ x }}</option></optgroup>
          <optgroup label="🧊 冷门 / 专项领域"><option v-for="x in FIELD_COLD" :key="x" :value="x">{{ x }}</option></optgroup>
        </select>
        <input :value="dtSrc.customField" placeholder="自定义领域" style="width:120px;font-size:11px" @change="setCustomField($event.target.value)" />
        <span class="dt-chip">排版：</span>
        <select :value="dtForm" style="font-size:11px;max-width:150px" @change="setDtForm($event.target.value)">
          <option v-for="x in FORM_OPTIONS" :key="x.k" :value="x.k">{{ x.t.replace('🤖 ', '') }}</option>
        </select>
        <span class="dt-chip">口径：</span>
        <select :value="dtTime" style="font-size:11px;max-width:150px" @change="setDtTime($event.target.value)">
          <option v-for="x in TIME_OPTIONS" :key="x.k" :value="x.k">{{ x.t.replace('🕒 ', '') }}</option>
        </select>
        <span class="dt-chip">题量：</span>
        <button v-for="n in [5, 10, 15, 20]" :key="n" class="btn" :class="examGroupSize === n ? 'btn-pri' : 'btn-gh'" style="padding:1px 8px;font-size:11px" :disabled="examRun" @click="setExamGroup(n)">{{ n }}题/组</button>
        <button v-if="!examReady && !examFinished" class="btn btn-pri" style="padding:2px 10px;font-size:11px" @click="initExam()">🤖 AI 智能出题</button>
        <button v-if="examReady" class="btn btn-gh" style="padding:1px 8px;font-size:11px" title="同一领域换一篇新材料" @click="initExam()">🎲 换一套</button>
        <button v-if="examReady && !examRun && !examFinished" class="btn btn-pri" style="padding:2px 10px;font-size:11px" @click="startExamRun()">▶ 开始本组作答</button>
        <button v-else-if="examRun" class="btn btn-gh" style="padding:1px 8px;font-size:11px">⏱ 本层 {{ examLayerRemain }}s · 考试 {{ examElapsed }}s / 剩 {{ examTotalRemain }}s</button>
      </div>

      <div v-if="!examReady && !examFinished" style="min-height:52vh;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:14px;text-align:center;padding:18px">
        <div style="font-size:20px">🤖 AI 智能出题</div>
        <div style="max-width:620px;font-size:14px;line-height:1.9;color:var(--text2)">
          进入完整真题卷前，请先完成三个选择：材料来源、训练领域、每组题量（5/10/15/20）。确认后点击「🤖 AI 智能出题」，本组题目会自动生成。
        </div>
        <div style="max-width:620px;border:1px dashed var(--glass-border);border-radius:8px;padding:8px 12px;font-size:12px;color:var(--text3)">
          💡 学习建议：先在「🗂 真题拆分训练」把判题型、找数据、选公式、速算分别练熟，再回到这里做完整真题卷，四层闭环更有效。
        </div>
        <button class="btn btn-pri" style="padding:8px 18px;font-size:13px" @click="initExam()">🤖 AI 智能出题</button>
      </div>
      <div v-else-if="exam && !examFinished" class="dt-body">
        <div class="dt-side">
          <div class="dt-card">
            <div class="dt-card-t">🧭 本组 {{ examTotal }} 问 · {{ examPapers.length }} 篇材料</div>
            <div v-for="qi in examIndexes" :key="qi" class="dt-py-row" :class="{ on: qi === examQIdx }">
              <div class="dt-py-l">
                <b>第 {{ qi + 1 }} 题</b>
                <span v-if="examHist.some((h) => h.q === qi + 1 && h.layer === 'calc')" class="dt-chip-sub" :style="{ color: examHist.find((h) => h.q === qi + 1 && h.layer === 'calc').ok ? '#34d399' : '#fb7185' }">
                  {{ examHist.find((h) => h.q === qi + 1 && h.layer === 'calc').ok ? '✓' : '✗' }}
                </span>
                <span v-else-if="qi === examQIdx && examRun" class="dt-chip-sub">●</span>
              </div>
            </div>
          </div>
          <div class="dt-card">
            <div class="dt-card-t">📈 四层能力画像（本场）</div>
            <div v-for="lp in examLayerPct" :key="lp.k" class="dt-py-l" style="margin:6px 0">
              <span>{{ lp.t }} <b>{{ lp.pct }}%</b>（{{ lp.ok }}/{{ lp.done }}）</span>
              <div style="height:6px;border-radius:3px;background:var(--surface);overflow:hidden;margin-top:4px"><div :style="{ width: lp.pct + '%', height: '100%', background: lp.pct >= 80 ? '#34d399' : lp.pct >= 50 ? '#fbbf24' : '#fb7185' }"></div></div>
            </div>
            <div style="font-size:11px;color:var(--text3);margin-top:6px">未开始时不计分；每层答完立即判正误并归因到能力层。</div>
          </div>
        </div>

        <div class="dt-train">
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            <button class="btn btn-gh" style="padding:2px 8px;font-size:11px" :disabled="examAiBusy" @click="aiOrganizeExam()">{{ examAiBusy ? '🤖 AI 整理中…' : '🤖 AI 整理公报正文' }}</button>
            <button class="btn btn-gh" style="padding:2px 8px;font-size:11px" :title="'只高亮当前本题所需的时间/指标/数值'" @click="lockShow = !lockShow">{{ lockShow ? '🔍 当前题数据高亮开' : '🔍 当前题数据高亮关' }}</button>
            <span class="dt-mat-note" style="color:var(--text3)">AI 只改写表达，不改变本地表格数值，保证 5 问仍可自动判题。</span>
          </div>
          <div v-if="examCurrent" class="dt-mat-scroll" style="border:1px solid var(--glass-border);border-radius:8px;padding:8px 10px;background:var(--glass-bg)">
            <div v-if="examAiText" class="dt-mat" v-html="md(materialHighlights(examAiText))"></div>
            <div v-else-if="examPaper && examPaper.materialMd" class="dt-mat" v-html="md(materialHighlights(examPaper.materialMd))"></div>
            <div v-if="examPaper && examPaper.materialSvg" class="dt-mat dt-mat-svg" v-html="examPaper.materialSvg"></div>
            <div class="dt-mat-note">📊 组卷来源：{{ srcLabel }} · 当前第 {{ Math.floor(examQIdx / 5) + 1 }} 篇（{{ examPaper && examPaper.domName }}），同一篇供 5 问连续作答；10/15/20 题会自动混编多领域材料。</div>
          </div>

          <div v-if="examCurrent && examLayerItem" class="dt-card">
            <div class="dt-qmode">第 {{ examQIdx + 1 }} / {{ examTotal }} 题 · {{ examLayerTitle }} · 四层第 {{ examLayerIdx + 1 }} / 4</div>
            <div class="dt-q" style="margin:8px 0 10px" v-html="md(examCurrent.stem)"></div>
            <div class="dt-q" style="font-weight:700;margin:10px 0 8px" v-html="md(examLayerItem.q)"></div>

            <div class="dt-opts" :class="{ wide: examLayerKey === 'formula' }">
              <button
v-for="o in examLayerItem.options" :key="o.k" class="dt-opt"
                :class="{ picked: examPick === o.k, right: examPick && o.k === examLayerItem.answer, wrong: examPick && o.k === examPick && o.k !== examLayerItem.answer }"
                :disabled="!!examPick || !examRun" @click="examAnswer(o.k)">
                {{ o.k }}. <span v-html="md(o.t)"></span>
              </button>
            </div>

            <div v-if="!examRun" class="dt-mat-note" style="color:var(--text3);margin-top:8px">先阅读材料与题干，点击上方「▶ 开始本组作答」后进入四层限时训练。</div>
            <div v-if="examPick && examLayerItem" class="dt-explain" style="margin-top:10px">
              <div style="font-weight:800;margin-bottom:6px">{{ examPick === examLayerItem.answer ? '✅ 这一层答对了' : '❌ 这一层答错（正确答案 ' + examLayerItem.answer + '）' }}</div>
              <div v-html="md(examLayerItem.explain)"></div>
              <div class="dt-mat-note" style="margin-top:6px">{{ examLayerItem.tip }}</div>
              <button class="btn btn-pri" style="margin-top:8px" @click="examNext()">{{ examLayerIdx < 3 ? '下一层 →' : (examQIdx < examTotal - 1 ? '下一题 →' : '📊 查看本场成绩') }}</button>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="exam && examFinished" style="overflow:auto;padding:4px 2px">
        <div class="dt-grp-sum" style="border:1px solid var(--glass-border);border-radius:12px;padding:14px;background:var(--glass-bg)">
          <div style="font-weight:800;font-size:16px">📊 本套真题 · 四层成绩单</div>
          <div style="font-size:13px;color:var(--text2);margin-top:8px;line-height:1.9">
            ✅ 正确 {{ examHist.filter((h) => h.ok).length }} / {{ examHist.length }} · 本场计时 <b>{{ examElapsed }}s</b> · 平均每题 <b>{{ examHist.length ? Math.round(examElapsed / (examHist.length / 4)) : 0 }}s/层</b>
          </div>
          <div style="margin-top:10px;display:grid;gap:8px">
            <div v-for="lp in examLayerPct" :key="lp.k" class="dt-py-l">
              <span>{{ lp.t }}：<b>{{ lp.ok }}/{{ lp.done }}</b>（{{ lp.pct }}%）</span>
              <div style="height:8px;border-radius:4px;background:var(--surface);overflow:hidden"><div :style="{ width: lp.pct + '%', height: '100%', background: lp.pct >= 80 ? '#34d399' : lp.pct >= 50 ? '#fbbf24' : '#fb7185' }"></div></div>
            </div>
          </div>
          <div style="margin-top:14px;border-top:1px solid var(--glass-border);padding-top:10px">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <b style="font-size:14px">🤖 AI 深度评估</b>
              <button v-if="!examEvalBusy" class="btn btn-gh" style="padding:1px 8px;font-size:11px" @click="deepEvalExam()">↻ 重新评估</button>
            </div>
            <div v-if="examEvalBusy" style="color:var(--text3);font-size:12px;margin-top:6px">⏳ AI 正在分析本场四层作答记录…</div>
            <div v-if="examEvalText" class="dt-ai" style="margin-top:8px" v-html="md(examEvalText)"></div>
          </div>
          <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-pri" @click="initExam()">🔄 换一套继续练</button>
            <button class="btn btn-pri" :class="{ busy: false }" @click="addCurrentExamWrongs()">📌 本场错题入库</button>
            <button class="btn btn-gh" @click="showRecords()">📜 查看历史记录</button>
            <button class="btn btn-gh" @click="setView('classic')">🎛 进入单层速练</button>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div v-if="recShow" class="ov show" style="z-index:480" @click.self="closeRecords()">
    <div class="pnl dt-pnl" style="max-width:min(1060px,97vw);max-height:92vh">
      <div class="dt-head">
        <span class="dt-title">📜 资料分析 · 练习/考试记录</span>
        <div class="dt-acts">
          <span v-if="records.length" class="dt-chip">共 {{ records.length }} 条</span>
          <button class="btn btn-gh" style="padding:2px 10px;font-size:12px" @click="closeRecords()">关闭</button>
          <button class="pc-close" @click="closeRecords()">✕</button>
        </div>
      </div>
      <div style="overflow:auto;min-height:0;padding:2px 2px 14px">
        <div v-if="!records.length" style="text-align:center;padding:46px 12px;color:var(--text3);font-size:13px">
          还没有练习记录。先在「拆分训练」完成任意 1 题，或到「完整真题卷」做完一套 5 题以上，成绩会自动存在这里。
        </div>
        <div v-for="rec in records" :key="rec.id" class="dt-mat-row" style="margin:6px 0;background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:10px;padding:9px 12px">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span style="font-weight:800;color:var(--accent)">{{ recTitle(rec) }}</span>
            <span class="dt-chip">{{ fmtRecTime(rec.ts) }}</span>
            <span class="dt-chip" style="color:var(--text2)">{{ rec.srcLabel || rec.src + '·' + rec.field }}</span>
            <span class="dt-chip">{{ rec.rate }}% 正确</span>
            <span class="dt-chip">{{ rec.secs }}s</span>
            <span class="dt-chip" :style="{ color: (rec.wrong || []).length ? '#fb7185' : '#34d399' }">{{ (rec.wrong || []).length ? '错 ' + (rec.wrong || []).length + ' 题' : '✅ 无错题' }}</span>
          </div>
          <div style="font-size:11px;color:var(--text3);margin-top:5px">{{ recLayerLine(rec) }}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:7px">
            <button class="btn btn-pri" style="padding:1px 9px;font-size:11px" @click="redoRecord(rec)">↻ 二刷</button>
            <button class="btn btn-gh" style="padding:1px 9px;font-size:11px" :disabled="!(rec.wrong || []).length" @click="addRecordWrongs(rec)">📌 错题入库</button>
            <button class="btn btn-gh" style="padding:1px 9px;font-size:11px" @click="toggleRecDetail(rec.id)">{{ recDetail && recDetail.id === rec.id ? '▾ 收起明细' : '▸ 查看明细' }}</button>
            <button class="btn btn-gh" style="padding:1px 9px;font-size:11px;color:#fb7185" @click="delRecord(rec.id)">🗑 删除</button>
          </div>
          <div v-if="recDetail && recDetail.id === rec.id" style="margin-top:8px;border-top:1px dashed var(--glass-border);padding-top:8px;font-size:12px;line-height:1.7;color:var(--text2)">
            <div v-if="rec.kind === 'exam'">组卷 {{ rec.groupSize }} 题 · 四层共 {{ rec.total }} 次作答，其中正确 {{ rec.ok }} 次。</div>
            <div v-else>本组 {{ rec.groupSize || 1 }} 题 · 答对 {{ rec.ok }} / {{ rec.total }}，覆盖模式：{{ rec.mode || 'type' }}。</div>
            <div v-if="rec.form || rec.timeKind">材料排版：{{ (FORM_OPTIONS.find((x) => x.k === rec.form) || {}).t || rec.form }} · 口径：{{ (TIME_OPTIONS.find((x) => x.k === rec.timeKind) || {}).t || rec.timeKind }}</div>
            <template v-if="(rec.wrong || []).length">
              <div style="font-weight:700;margin:7px 0 4px;color:#fb7185">❌ 本场答错项</div>
              <div v-for="(w,i) in rec.wrong" :key="i" style="border:1px solid rgba(251,113,133,.3);border-radius:8px;padding:7px 9px;margin:5px 0;background:rgba(251,113,133,.06)">
                <div>{{ w.stem }}</div>
                <div v-if="w.wrongLayers && w.wrongLayers.length" style="margin-top:3px;color:#fb7185;font-size:11px">答错层：{{ w.wrongLayers.join('、') }}</div>
                <div v-else-if="w.layerName" style="margin-top:3px;color:#fb7185;font-size:11px">答错层：{{ w.layerName }}</div>
                <div v-if="w.answer" style="margin-top:2px">正确答案：{{ w.answer }}{{ w.pick ? '（本场选' + w.pick + '）' : '' }}</div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 层级需高于移动端训练抽屉(.chat-tools-bd 322 / .chat-tools-ov 321)与随手记(.draft-fab 420)，
   否则从「🎯训练」抽屉进入后被抽屉与全屏遮罩压住 → 界面被盖住/点不到（资料速算显示不全的根因） */
.dt-ov { z-index: 431; }
.dt-pnl { width: min(1180px, 97vw); max-width: min(1180px, 97vw); max-height: 94vh; display: flex; flex-direction: column; overflow: hidden; overflow-x: hidden; }
/* 长题干/长公式不撑破容器（资料分析常出现超长数字与表格） */
.dt-q, .dt-ex-b, .dt-method-b, .dt-md-row, .dt-kb-row { overflow-wrap: break-word; word-break: break-word; }
.dt-t { overflow-wrap: break-word; word-break: break-word; min-width: 0; }
.dt-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
.dt-title { font-size: 16px; font-weight: 800; color: var(--accent); }
.dt-acts { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.dt-chip { display: inline-flex; align-items: center; gap: 2px; background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 20px; padding: 3px 10px; font-size: 12px; font-weight: 700; color: var(--text); }
.dt-chip.hot { border-color: #fb923c; color: #fb923c; }
.dt-chip-sub { font-size: 10px; color: var(--text3); font-weight: 400; }
.dt-body { display: flex; gap: 14px; flex: 1; min-height: 0; flex-wrap: nowrap; overflow: hidden; }
.dt-side { flex: 0 0 256px; min-width: 220px; min-height: 0; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; }
.dt-train { flex: 1 1 520px; min-width: 320px; min-height: 0; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; padding-right: 2px; }
.dt-card { background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 10px; padding: 10px 12px; }
.dt-card-t { font-size: 12px; font-weight: 700; color: var(--text3); margin-bottom: 8px; }
.dt-py-row { display: block; padding: 6px 9px; border-radius: 8px; background: var(--surface); border: 1px solid transparent; margin-bottom: 6px; cursor: pointer; }
.dt-py-row.on { border-color: var(--accent); }
.dt-py-l { display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; color: var(--text); margin-bottom: 4px; }
.dt-py-row.on .dt-py-l b { color: var(--accent); }
.dt-py-cnt { font-size: 11px; color: var(--text3); }
.dt-py-bar { height: 5px; border-radius: 3px; background: rgba(128, 128, 128, 0.2); overflow: hidden; }
.dt-py-bar i { display: block; height: 100%; border-radius: 3px; background: var(--accent); transition: width 0.3s; }
.dt-py-tip { font-size: 11.5px; color: var(--text3); line-height: 1.65; margin-top: 6px; }
.dt-method-b { font-size: 12.5px; line-height: 1.7; color: var(--text); }
.dt-method-detail { margin-top: 8px; border-top: 1px dashed var(--glass-border); padding-top: 8px; }
.dt-md-row { font-size: 12px; line-height: 1.7; color: var(--text); margin-bottom: 5px; }
.dt-md-row b { color: var(--accent); }
.dt-md-steps { margin: 2px 0 0 18px; padding: 0; }
.dt-md-steps li { margin-bottom: 2px; }
.dt-st-row { display: flex; justify-content: space-between; font-size: 13px; padding: 4px 0; color: var(--text); }
.dt-st-row b { color: var(--accent); }
.dt-st-tip { font-size: 11.5px; color: var(--text3); line-height: 1.6; margin-top: 6px; border-top: 1px dashed var(--glass-border); padding-top: 6px; }
.dt-keys-b { font-size: 12px; color: var(--text3); line-height: 1.7; }
.dt-keys-b b { color: var(--accent); }
.dt-modes { display: flex; gap: 6px; flex-wrap: wrap; }
.dt-diff { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.dt-diff-lb { font-size: 12px; color: var(--text3); }
.dt-diff-sep { color: var(--glass-border); }
.dt-help { background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 10px; padding: 10px 14px; font-size: 13px; line-height: 1.75; color: var(--text); }
.dt-help :deep(h1), .dt-help :deep(h2), .dt-help :deep(h3) { font-size: 14px; margin: 8px 0 6px; color: var(--accent); }
.dt-help :deep(strong) { color: var(--accent); }
.dt-qcard { background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 12px; padding: 12px 14px; }
.dt-qhead { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
.dt-qtag { background: var(--accent); color: #04121a; font-size: 11px; font-weight: 800; padding: 2px 8px; border-radius: 20px; }
.dt-qmode { font-size: 12px; color: var(--text3); }
.dt-qidx { font-size: 12px; color: var(--text3); margin-left: auto; }
.dt-mat { font-size: 13px; line-height: 1.75; color: var(--text); margin-bottom: 8px; }
.dt-mat :deep(table) { border-collapse: collapse; margin: 6px 0; max-width: 100%; }
.dt-mat :deep(th), .dt-mat :deep(td) { border: 1px solid var(--glass-border); padding: 4px 9px; text-align: center; font-size: 12px; }
.dt-mat :deep(th) { background: rgba(34, 211, 238, 0.12); color: var(--accent); }
.dt-mat-svg svg { max-width: 100%; height: auto; border: 1px solid var(--glass-border); border-radius: 8px; background: #fff; }
.dt-mat-note { font-size: 11.5px; color: var(--text3); border: 1px dashed var(--glass-border); border-radius: 8px; padding: 5px 9px; margin-bottom: 8px; background: rgba(251, 191, 36, 0.06); }
.dt-q { font-size: 14px; line-height: 1.8; color: var(--text); }
.dt-q :deep(strong) { color: var(--accent); }
.dt-opts { display: grid; grid-template-columns: 1fr; gap: 7px; }
.dt-opts.wide { grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); }
.dt-opt { display: flex; align-items: center; gap: 8px; padding: 9px 12px; border-radius: 10px; border: 1px solid var(--glass-border); background: var(--glass-bg); color: var(--text); cursor: pointer; font-family: inherit; font-size: 13.5px; transition: all 0.15s; text-align: left; }
.dt-opt:hover:not(:disabled) { border-color: var(--accent); }
.dt-opt.picked.right { border-color: #34d399; background: rgba(52, 211, 153, 0.15); }
.dt-opt.picked.wrong { border-color: #fb7185; background: rgba(251, 113, 133, 0.15); }
.dt-opt:disabled { cursor: default; opacity: 0.9; }
.dt-k { font-weight: 800; color: var(--accent); min-width: 20px; }
.dt-t { flex: 1; }
.dt-explain { background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 12px; padding: 12px 14px; }
.dt-ex-t { font-size: 14px; font-weight: 800; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dt-ex-t.ok { color: #34d399; }
.dt-ex-t.bad { color: #fb7185; }
.dt-ex-gain { font-size: 11px; font-weight: 700; background: rgba(52, 211, 153, 0.15); border: 1px solid #34d399; color: #34d399; border-radius: 20px; padding: 1px 8px; }
.dt-ex-b { font-size: 13.5px; line-height: 1.85; color: var(--text); }
.dt-ex-b :deep(strong) { color: var(--accent); }
.dt-ex-acts { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.dt-ex-acts .busy { opacity: 0.7; }
.dt-ai { margin-top: 10px; border-top: 1px dashed var(--glass-border); padding-top: 10px; font-size: 13px; line-height: 1.8; color: var(--text); background: rgba(34, 211, 238, 0.06); border-radius: 8px; padding: 10px 12px; }
.dt-loading { text-align: center; color: var(--text3); padding: 30px 0; }


/* ===== 理论课堂 ===== */
.dt-kb { display: flex; flex-direction: column; gap: 10px; min-width: 0; max-width: 100%; }
.dt-kb-bar { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; min-width: 0; }
.dt-kb-input { flex: 1 1 220px; min-width: 180px; padding: 8px 12px; border-radius: 10px; border: 1px solid var(--glass-border); background: var(--surface); color: var(--text); font-size: 13px; font-family: inherit; outline: none; }
.dt-kb-input:focus { border-color: var(--accent); }
.dt-kb-count { font-size: 11.5px; color: var(--text3); margin-left: 4px; }
.dt-kb-list { display: flex; flex-direction: column; gap: 8px; }
.dt-kb-item { background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 12px; overflow: hidden; min-width: 0; max-width: 100%; }
.dt-kb-item.open { border-color: var(--accent); }
.dt-kb-item.star { border-left: 3px solid #fbbf24; }
.dt-kb-head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; cursor: pointer; flex-wrap: wrap; }
.dt-kb-head:hover { background: rgba(34, 211, 238, 0.06); }
.dt-kb-layer { background: rgba(34, 211, 238, 0.14); color: var(--accent); font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 20px; white-space: nowrap; }
.dt-kb-src { font-size: 10.5px; font-weight: 700; color: #fb923c; border: 1px solid rgba(251, 146, 60, 0.5); border-radius: 20px; padding: 1px 7px; }
.dt-kb-title { font-size: 13.5px; color: var(--text); flex: 1; }
.dt-kb-read { color: #34d399; font-size: 13px; font-weight: 700; }
.dt-kb-star { color: #fbbf24; font-size: 15px; cursor: pointer; }
.dt-kb-detail { border-top: 1px dashed var(--glass-border); padding: 10px 12px; }
.dt-kb-row { font-size: 13px; line-height: 1.8; color: var(--text); margin-bottom: 8px; overflow-wrap: break-word; word-break: break-word; }
.dt-kb-row b { color: var(--accent); }
.dt-kb-row.tip { background: rgba(251, 191, 36, 0.08); border-radius: 8px; padding: 6px 10px; }
.dt-kb-steps { margin: 2px 0 0 18px; padding: 0; }
.dt-kb-path { margin-top: 4px; font-size: 12.5px; color: var(--text3); background: rgba(34, 211, 238, 0.06); border-radius: 6px; padding: 5px 8px; overflow-wrap: break-word; word-break: break-word; }
.dt-kb-ans { color: #34d399; font-weight: 700; margin-left: 6px; }
.dt-kb-note { font-size: 11.5px; color: var(--text3); margin-bottom: 8px; }
.dt-kb-acts { margin-top: 4px; }
.dt-kb-acts .busy { opacity: 0.7; }
.dt-kb-empty { text-align: center; color: var(--text3); padding: 30px 0; font-size: 13px; }

/* ===== 平板（≤1024px）：左栏收窄 ===== */
@media (max-width: 1024px) {
  .dt-side { flex: 0 0 210px; min-width: 180px; }
  .dt-pnl { max-height: 96vh; }
}

/* ===== 手机（≤760px）：单列自适应，侧栏变横向卡片 ===== */
@media (max-width: 760px) {
  /* 真·全屏：抵消 .ov 的 40px 内边距与 .ov .pnl 的 88vh/圆角底部抽屉样式
     （用 .dt-ov .dt-pnl 提高权重，确保覆盖 ≤640px 的全局底-sheet 规则） */
  .dt-ov { overflow-x: hidden; padding: 0; align-items: stretch; overscroll-behavior: contain; }
  .dt-ov .dt-pnl {
    width: 100%; max-width: 100%;
    height: 100vh; height: 100dvh;
    max-height: 100dvh;
    border-radius: 0; border-bottom: none;
    padding: 10px 10px 12px;
  }
  .dt-body { flex-direction: column; flex-wrap: nowrap; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
  /* 侧栏横滑：每张卡约 3/4 屏宽，露出下一张形成可滑动提示；手机隐藏「快捷键」卡（无键盘） */
  .dt-side { flex: none; width: 100%; min-width: 0; flex-direction: row; flex-wrap: nowrap; overflow-x: auto; overflow-y: hidden; max-height: none; gap: 8px; padding-bottom: 4px; -webkit-overflow-scrolling: touch; }
  .dt-side .dt-card { flex: 0 0 76%; min-width: 0; max-width: 320px; }
  .dt-side .dt-keys { display: none; }
  .dt-train { flex: 1 1 auto; min-width: 0; max-height: none; overflow-y: visible; overflow-x: hidden; }
  .dt-title { font-size: 14px; }
  .dt-head { gap: 6px; margin-bottom: 8px; }
  .dt-chip { font-size: 11px; padding: 3px 8px; }
  .dt-chip-sub { display: none; }
  .dt-opt { font-size: 13px; padding: 11px 10px; min-height: 46px; }
  .dt-q { font-size: 13.5px; }
  .dt-mat :deep(th), .dt-mat :deep(td) { padding: 3px 5px; font-size: 11px; }
  .dt-mat :deep(table) { display: block; overflow-x: auto; }
  .dt-modes .btn, .dt-diff .btn { font-size: 12px; padding: 6px 8px; min-height: 32px; }
  .dt-ex-b { font-size: 13px; }
  .dt-ex-acts .btn { font-size: 12px; min-height: 34px; }
  .dt-kb-bar .btn { font-size: 11.5px; padding: 5px 7px; }
  .dt-kb-head { padding: 8px 10px; }
  .dt-kb-detail { padding: 8px 10px; }
  .dt-kb-input { flex: 1 1 100%; min-width: 0; }
  .dt-qcard { padding: 10px 11px; }
  .dt-explain { padding: 10px 11px; }
}
/* 刘海屏/手势条：底部留安全区，避免「下一题/提交」被系统手势条压住点不到 */
@supports (padding-bottom: env(safe-area-inset-bottom)) {
  @media (max-width: 760px) {
    .dt-ov .dt-pnl { padding-bottom: calc(12px + env(safe-area-inset-bottom)); }
  }
}
/* ===== 极窄屏（≤380px，如 iPhone SE / 小屏安卓）：再降一档，保证一屏内可操作 ===== */
@media (max-width: 380px) {
  .dt-title { font-size: 13px; }
  .dt-acts { gap: 4px; }
  .dt-chip { font-size: 10.5px; padding: 2px 6px; }
  .dt-head .btn { font-size: 11.5px; padding: 5px 7px; }
  .dt-side .dt-card { flex: 0 0 88%; }
  .dt-modes .btn, .dt-diff .btn { font-size: 11.5px; padding: 5px 7px; }
  .dt-opt { font-size: 12.5px; padding: 10px 8px; }
  .dt-q { font-size: 13px; line-height: 1.7; }
  .dt-ex-b { font-size: 12.5px; }
}

/* v3.8.201 图/表材料手机可横滑看全（scoped 内 :deep 强制） */
.dt-mat-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; max-width: 100%; }
.dt-mat-scroll :deep(.dt-mat-svg svg), .dt-mat-scroll :deep(svg), .dt-mat-scroll :deep(table), .dt-mat-scroll img { max-width: none !important; height: auto; }
@media (max-width: 720px){
  .dt-mat-scroll :deep(.dt-mat-svg svg), .dt-mat-scroll :deep(svg) { min-width: 640px !important; }
  .dt-mat-scroll :deep(table), .dt-mat-scroll img { min-width: 600px !important; }
  .dt-mat-scroll { -webkit-overflow-scrolling: touch; }
}
/* v3.8.256：只高亮当前题所需数据（表格/正文内的数值与关键时间/指标） */
.dt-mat-scroll :deep(.dt-lock-red), :deep(.dt-lock-red) { color: #ef4444 !important; font-weight: 800 !important; background: rgba(239,68,68,.12); border-radius: 3px; padding: 0 2px; }
.dt-guide { padding: 4px 2px; }
.dt-guide-in { max-width: 960px; margin: 0 auto; width: 100%; }

</style>
