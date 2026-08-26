<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { store, saveWqs } from '../store'
import { activeCfg, chatOnce, chatStream, buildTaskSys, buildMaterialPrompt, buildGroupPrompt, supportsVision } from '../api'
import { parseQuiz, extractChoices, answerLetter, parseMaterialQuiz } from '../utils/quiz'
import { showToast } from '../utils/toast'
import { exportPaper } from '../utils/export'
import { renderMd } from '../utils/renderMd'
import { diffCurve } from '../api/professor'

const emit = defineEmits(['close'])
const props = defineProps({ initialSrc: { type: String, default: 'ai' } })

// ===== 试卷模板库（基于国考/省考最新考情调研，均可自由编辑）=====
// 2025 起国考新增「政治理论」：副省 135 / 地市·执法 130；判断推理含 图推/定义/类比/逻辑 子板块
const TEMPLATES = [
  {
    id: 'gk_fj', name: '国考·副省级', total: 135, mins: 120, tag: '2025新大纲',
    note: '政治20+常识15+言语30+数量15+判断35(图推10/定义10/类比5/逻辑10)+资料20',
    modules: [
      { subject: '政治理论', count: 20, refMin: 12 },
      { subject: '常识判断', count: 15, refMin: 8 },
      { subject: '言语理解', count: 30, refMin: 28 },
      { subject: '数量关系', count: 15, refMin: 12 },
      { subject: '图形推理', count: 10, refMin: 9 },
      { subject: '定义判断', count: 10, refMin: 8 },
      { subject: '类比推理', count: 5, refMin: 5 },
      { subject: '逻辑判断', count: 10, refMin: 10 },
      { subject: '资料分析', count: 20, refMin: 25 }
    ]
  },
  {
    id: 'gk_ds', name: '国考·地市级', total: 130, mins: 120, tag: '2025新大纲',
    note: '政治20+常识15+言语30+数量10+判断35+资料20',
    modules: [
      { subject: '政治理论', count: 20, refMin: 12 },
      { subject: '常识判断', count: 15, refMin: 8 },
      { subject: '言语理解', count: 30, refMin: 28 },
      { subject: '数量关系', count: 10, refMin: 10 },
      { subject: '图形推理', count: 10, refMin: 9 },
      { subject: '定义判断', count: 10, refMin: 8 },
      { subject: '类比推理', count: 5, refMin: 5 },
      { subject: '逻辑判断', count: 10, refMin: 10 },
      { subject: '资料分析', count: 20, refMin: 25 }
    ]
  },
  {
    id: 'gk_xz', name: '国考·行政执法', total: 130, mins: 120, tag: '2025新大纲',
    note: '同地市级（政治20+常识15+言语30+数量10+判断35+资料20）',
    modules: [
      { subject: '政治理论', count: 20, refMin: 12 },
      { subject: '常识判断', count: 15, refMin: 8 },
      { subject: '言语理解', count: 30, refMin: 28 },
      { subject: '数量关系', count: 10, refMin: 10 },
      { subject: '图形推理', count: 10, refMin: 9 },
      { subject: '定义判断', count: 10, refMin: 8 },
      { subject: '类比推理', count: 5, refMin: 5 },
      { subject: '逻辑判断', count: 10, refMin: 10 },
      { subject: '资料分析', count: 20, refMin: 25 }
    ]
  },
  {
    id: 'lk_120', name: '省考联考·120题', total: 120, mins: 120, tag: '湖南/福建/宁夏/陕西等',
    note: '常识20+言语40+数量10+判断35+资料15',
    modules: [
      { subject: '常识判断', count: 20, refMin: 10 },
      { subject: '言语理解', count: 40, refMin: 32 },
      { subject: '数量关系', count: 10, refMin: 12 },
      { subject: '图形推理', count: 10, refMin: 9 },
      { subject: '定义判断', count: 10, refMin: 8 },
      { subject: '类比推理', count: 10, refMin: 8 },
      { subject: '逻辑判断', count: 5, refMin: 6 },
      { subject: '资料分析', count: 15, refMin: 22 }
    ]
  },
  {
    id: 'lk_110', name: '省考联考·110题', total: 110, mins: 120, tag: '安徽/海南/广西等',
    note: '常识15+言语35+数量10+判断30+资料20',
    modules: [
      { subject: '常识判断', count: 15, refMin: 8 },
      { subject: '言语理解', count: 35, refMin: 30 },
      { subject: '数量关系', count: 10, refMin: 12 },
      { subject: '图形推理', count: 10, refMin: 9 },
      { subject: '定义判断', count: 10, refMin: 8 },
      { subject: '类比推理', count: 5, refMin: 5 },
      { subject: '逻辑判断', count: 5, refMin: 6 },
      { subject: '资料分析', count: 20, refMin: 25 }
    ]
  },
  {
    id: 'gd_90', name: '广东·90题', total: 90, mins: 90, tag: '2025起100→90',
    note: '常识15+言语20+数量15+判断25+资料15',
    modules: [
      { subject: '常识判断', count: 15, refMin: 10 },
      { subject: '言语理解', count: 20, refMin: 20 },
      { subject: '数量关系', count: 15, refMin: 18 },
      { subject: '图形推理', count: 8, refMin: 9 },
      { subject: '定义判断', count: 6, refMin: 6 },
      { subject: '类比推理', count: 6, refMin: 6 },
      { subject: '逻辑判断', count: 5, refMin: 6 },
      { subject: '资料分析', count: 15, refMin: 17 }
    ]
  },
  {
    id: 'zj_130', name: '浙江·130题', total: 130, mins: 120, tag: '常识20/言语35/判断35/数量20/资料20',
    note: '模块题量每年略有浮动，可自行调整',
    modules: [
      { subject: '常识判断', count: 20, refMin: 10 },
      { subject: '言语理解', count: 35, refMin: 30 },
      { subject: '图形推理', count: 10, refMin: 9 },
      { subject: '定义判断', count: 10, refMin: 8 },
      { subject: '类比推理', count: 5, refMin: 5 },
      { subject: '逻辑判断', count: 10, refMin: 10 },
      { subject: '数量关系', count: 20, refMin: 18 },
      { subject: '资料分析', count: 20, refMin: 28 }
    ]
  },
  {
    id: 'js_135', name: '江苏A/B·135题', total: 135, mins: 120, tag: '2025新增政治理论10题',
    note: '政治10+常识15+言语35+数量15+判断35+资料25',
    modules: [
      { subject: '政治理论', count: 10, refMin: 6 },
      { subject: '常识判断', count: 15, refMin: 8 },
      { subject: '言语理解', count: 35, refMin: 30 },
      { subject: '数量关系', count: 15, refMin: 12 },
      { subject: '图形推理', count: 10, refMin: 9 },
      { subject: '定义判断', count: 10, refMin: 8 },
      { subject: '类比推理', count: 5, refMin: 5 },
      { subject: '逻辑判断', count: 10, refMin: 10 },
      { subject: '资料分析', count: 25, refMin: 30 }
    ]
  },
  {
    id: 'custom', name: '🎨 自定义卷', total: 0, mins: 120, tag: '自由增删板块与题量',
    note: '按你的备考进度自由组卷，板块/题数/参考时限均可改',
    modules: [
      { subject: '常识判断', count: 10, refMin: 6 },
      { subject: '言语理解', count: 10, refMin: 9 },
      { subject: '判断推理', count: 10, refMin: 9 },
      { subject: '数量关系', count: 5, refMin: 5 },
      { subject: '资料分析', count: 10, refMin: 12 }
    ]
  }
]

const SUBJECTS = ['政治理论', '常识判断', '言语理解', '数量关系', '判断推理', '图形推理', '定义判断', '类比推理', '逻辑判断', '资料分析']

// 题型轮换库：同板块内按序轮换子题型，提升整卷质量与多样性
const SUB_VARIANTS = {
  '判断推理': ['削弱型', '加强型', '前提假设型', '结论推出型', '解释型', '评价型', '论证缺陷型', '翻译推理', '真假话', '分析推理'],
  '逻辑判断': ['削弱型', '加强型', '前提假设型', '结论推出型', '解释型', '评价型', '论证缺陷型', '翻译推理', '真假话', '分析推理', '一拖五'],
  '图形推理': ['位置规律', '样式规律', '属性规律', '数量规律', '空间重构', '截面图', '三视图', '立体拼合', '汉字字母'],
  '定义判断': ['选是题', '选非题', '多定义题', '匹配对应题'],
  '类比推理': ['二词型', '三词型', '填空型', '集合关系', '逻辑关系', '对应关系', '语法关系', '语义关系'],
  '言语理解': ['中心理解', '意图判断', '标题填入', '态度观点', '细节判断', '词句理解', '语句填空', '下文推断', '语句排序', '逻辑填空'],
  '资料分析': ['基期/现期', '增长率', '增长量', '比重', '平均数', '倍数'],
  '数量关系': ['工程问题', '行程问题', '排列组合', '概率问题', '利润问题', '容斥问题', '最值问题'],
  '常识判断': ['时政', '法律常识', '科技常识', '人文历史', '地理常识', '经济常识'],
  '政治理论': ['新思想', '党史', '马原哲学', '时政报告', '重要会议']
}

// ===== 状态 =====
const templateId = ref('gk_ds')
const modules = ref((TEMPLATES.find((t) => t.id === 'gk_ds') || TEMPLATES[0]).modules.map((m) => ({ subject: m.subject, count: m.count, refMin: m.refMin })))
const perQ = ref(60)            // 每题限时（秒），默认 60 秒（≤1分钟）
const aiCap = ref(5)            // AI 智能出题：每个板块本次组题上限
const difficulty = ref('curve') // 出题难度：curve=智能曲线(前易后难) / easy / mid / hard / real
const DIFF_LABEL = { easy: '易', mid: '中', hard: '难', real: '真题级' }
const mixMode = ref('module')   // module=按模块顺序出卷（贴合真实卷面）；mix=混合打乱
const srcMode = ref(props.initialSrc || 'ai') // ai=AI智能出题 / import=导入材料 / wrong=错题集 / single=单题快练
const singleMode = ref(false) // 单题快练：不启动整卷计时、答后留在本题可再来一题
const singlePlate = ref('判断推理') // 单题快练板块
const singleVariant = ref('不限') // 单题快练子题型（不限=自动轮换）
try { const _sp = localStorage.getItem('xc_single_plate'); if (_sp && SUBJECTS.includes(_sp)) singlePlate.value = _sp } catch (e) {}
const wrongSrc = ref('app') // 错题集组卷来源：app=应用内错题本 / local=导入本地错题
const aiLayout = ref(false) // 导出前先 AI 智能排版（梳理考点/错因/秒杀规律）
const srcTab = ref('template')  // 配置面板子页：template=卷面构成 / import=导入材料 / wrong=错题集
const imgs = ref([])
const textFiles = ref([])
const papers = ref([])
try { papers.value = JSON.parse(localStorage.getItem('xc_papers') || '[]') || [] } catch (e) {}
const results = ref([])
try { results.value = JSON.parse(localStorage.getItem('xc_paper_results') || '[]') || [] } catch (e) {}

const phase = ref('config') // config | extract | doing | result
const extracting = ref(false)
const curPaper = ref(null)
const questions = ref([])
const cur = ref(-1)
const marks = ref([])
const qLeft = ref(60)
const qElapsed = ref(0)
const totalLeft = ref(0)
const totalElapsed = ref(0)
const genBusy = ref(false)
const genLive = ref('') // 单题流式实时显示
const designerShow = ref(false) // 命题人设计说明弹窗
const prefetchQ = ref(null) // 预生成下一题：{ item, plate, difficulty, variant }
const openPapers = ref(localStorage.getItem('xc_ep_papers') === '1')
const openResults = ref(localStorage.getItem('xc_ep_results') === '1')
const openQuizCol = ref(localStorage.getItem('xc_ep_quizcol') === '1')
const quizCol = ref([])
try { quizCol.value = JSON.parse(localStorage.getItem('xc_quiz_col') || '[]') || [] } catch (e) {}
const genTotal = ref(0)
const genDone = ref(0)
const genErrCount = ref(0)
const genCur = ref('')
const genEta = ref(0)
const genSec = ref(0)
let genTimer = null
let genAbort = false
// 板块参考倒计时（仅倒计时，不设正计时）
const modName = ref('')
const modDone = ref(0)
const modTotal = ref(0)
const modRefSec = ref(0)
const modLeft = ref(0)
const startAt = ref(0)
let timers = { q: null, t: null }
const generating = {}

const fmt = (s) => {
  const m = Math.floor(Math.max(0, s) / 60)
  const ss = Math.max(0, s) % 60
  return String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0')
}
const q = computed(() => (cur.value >= 0 && questions.value[cur.value] ? questions.value[cur.value] : null))
const qHtml = computed(() => (q.value ? renderMd(q.value.stem || '') : ''))
const qExplainHtml = computed(() => {
  const a = q.value ? q.value.explain || q.value.analysis || '' : ''
  return a ? renderMd(String(a)) : ''
})
const score = computed(() => marks.value.filter((m) => m && m.ok).length)
const rate = computed(() => (questions.value.length ? Math.round((score.value / questions.value.length) * 100) : 0))
const avgRate = computed(() => {
  const done = results.value.filter((r) => r.n > 0)
  if (!done.length) return 0
  return Math.round(done.reduce((a, b) => a + b.rate, 0) / done.length)
})
const selTmpl = computed(() => TEMPLATES.find((t) => t.id === templateId.value) || TEMPLATES[0])
const totalQ = computed(() => modules.value.reduce((a, m) => a + Math.max(0, m.count || 0), 0))
const refTotal = computed(() => modules.value.reduce((a, m) => a + Math.max(0, m.refMin || 0), 0))

function useTemplate(t) {
  modules.value = (t.modules || []).map((m) => ({ subject: m.subject, count: m.count, refMin: m.refMin }))
}
function onTemplate() {
  const t = TEMPLATES.find((x) => x.id === templateId.value) || TEMPLATES[0]
  useTemplate(t)
  showToast('已载入「' + t.name + '」卷面构成', 'success')
}
function addRow() { modules.value.push({ subject: '常识判断', count: 5, refMin: 5 }) }
function rmRow(i) { modules.value.splice(i, 1) }
function templateTotal(t) { return (t.modules || []).reduce((a, m) => a + (m.count || 0), 0) }
function moduleRefSec(m) {
  const c = Math.max(1, m.count || 1)
  return Math.max(20, Math.round(((m.refMin || 1) * 60) / c))
}
// 当前模板中判断推理展开数（国考 4 子板块示例）
// 出卷阶段展示卷面构成（板块+题数+参考时限）
const planText = computed(() => {
  return modules.value.map((m) => m.subject + ' ' + m.count + '题(参考' + (m.refMin || 1) + '分)').join(' · ')
})
const tmplJudgeNote = computed(() => {
  const t = selTmpl.value
  const subs = (t.modules || []).filter((m) => ['图形推理', '定义判断', '类比推理', '逻辑判断'].includes(m.subject))
  if (subs.length) return subs.map((m) => m.subject + ' ' + m.count + '题').join(' · ')
  return ''
})

// ===== 材料导入（图片/PDF/Word/txt/tex）=====
function onFiles(ev) {
  const files = Array.from(ev.target.files || [])
  for (const f of files) {
    const n = (f.name || '').toLowerCase()
    if (f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(n)) readImg(f)
    else if (/\.pdf$/i.test(n)) readPdf(f)
    else if (/\.(txt|tex|md|markdown)$/i.test(n)) readText(f)
    else if (/\.docx$/i.test(n)) readDocx(f)
    else showToast('暂不支持 ' + f.name, 'error')
  }
  ev.target.value = ''
}
function readImg(f) {
  const r = new FileReader()
  r.onload = (e) => imgs.value.push(e.target.result)
  r.readAsDataURL(f)
}
async function readPdf(f) {
  try {
    const buf = await f.arrayBuffer()
    const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist')
    GlobalWorkerOptions.workerSrc = './pdf.worker.min.mjs'
    const pdf = await getDocument({ data: buf }).promise
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p)
      const vp = page.getViewport({ scale: 2 })
      const canvas = document.createElement('canvas')
      canvas.width = vp.width
      canvas.height = vp.height
      const ctx = canvas.getContext('2d')
      await page.render({ canvasContext: ctx, viewport: vp }).promise
      imgs.value.push(canvas.toDataURL('image/jpeg', 0.85))
    }
    showToast('✅ 已解析 PDF ' + pdf.numPages + ' 页', 'success')
  } catch (e) {
    showToast('PDF 解析失败：' + e.message, 'error')
  }
}
async function readText(f) {
  textFiles.value.push({ name: f.name, text: await f.text() })
  showToast('✅ 已读取 ' + f.name, 'success')
}
async function readDocx(f) {
  try {
    const buf = await f.arrayBuffer()
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(buf)
    const xml = await zip.file('word/document.xml').async('string')
    const txt = xml
      .replace(/<w:p[^>]*>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    textFiles.value.push({ name: f.name, text: txt })
    showToast('✅ 已读取 Word（' + txt.length + ' 字）', 'success')
  } catch (e) {
    showToast('Word 解析失败：' + e.message, 'error')
  }
}
function rmImg(i) { imgs.value.splice(i, 1) }
function rmTxt(i) { textFiles.value.splice(i, 1) }

const VISION_SYS = '你是公考真题整理助手。把图片中的行测题目逐题提取，严格只输出 JSON 数组，不要多余文字。'
const VISION_PROMPT =
  '[{"no":1,"subject":"判断推理","stem":"题干原文","options":{"A":"...","B":"...","C":"...","D":"..."},"answer":"B","analysis":"解析(若有)"}]'
const TEXT_SYS =
  '你是公考真题整理助手。把下面的题目逐题整理成 JSON 数组，每题含 no/subject/stem/options/answer/analysis，题干与选项完整保留，无法识别的跳过，严格只输出 JSON 数组。'

function norm(qs) {
  return (qs || [])
    .map((x, i) => {
      const optsObj = x.options || {}
      let opts = Array.isArray(x.options)
        ? x.options.map((o, k) => ({ k: 'ABCD'[k] || 'A', t: typeof o === 'string' ? o : (o && o.t) }))
        : Object.keys(optsObj).map((k) => ({ k: k.toUpperCase(), t: optsObj[k] }))
      opts = opts.filter((o) => o.t).slice(0, 4)
      return {
        no: x.no || i + 1,
        subject: x.subject || '未分类',
        stem: x.stem || '',
        options: opts,
        answer: String(x.answer || '').toUpperCase(),
        analysis: x.analysis || ''
      }
    })
    .filter((x) => x.stem)
}
function shuffle(a) {
  const b = a.slice()
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}
function applyConfig(qs) {
  let list = qs.slice()
  const subs = modules.value.filter((m) => ['图形推理', '定义判断', '类比推理', '逻辑判断'].includes(m.subject))
  const hasJudgeSub = subs.length > 0
  const judgeAlias = { 图形推理: '图形推理', 定义判断: '定义判断', 类比推理: '类比推理', 逻辑判断: '逻辑判断', 判断推理: ['图形推理', '定义判断', '类比推理', '逻辑判断'] }
  // 过滤：导入/错题的 subject 需命中卷面构成板块（判断推理子板块视为整体）
  list = list.filter((x) => {
    const s = x.subject || ''
    if (hasJudgeSub) return subs.some((m) => m.subject === s) || ['判断推理'].includes(s)
    return modules.value.some((m) => m.subject === s) || s === '判断推理' && modules.value.some((m) => m.subject === '判断推理')
  })
  // 题量裁剪：每板块最多取卷面题数
  const plan = {}
  modules.value.forEach((m) => { plan[m.subject] = m.count })
  if (hasJudgeSub) {
    subs.forEach((m) => { plan[m.subject] = m.count })
  }
  const picked = {}
  list = list.filter((x) => {
    const s = x.subject === '判断推理' ? (subs[0] && subs[0].subject) || '判断推理' : x.subject
    const cap = plan[s] != null ? plan[s] : 9999
    picked[s] = picked[s] || 0
    if (picked[s] >= cap) return false
    picked[s]++
    return true
  })
  if (mixMode.value === 'mix') list = shuffle(list)
  else {
    const order = modules.value.map((m) => m.subject)
    list.sort((a, b) => order.indexOf(a.subject) - order.indexOf(b.subject))
  }
  return list
}
function makePaper(name, qs) {
  return { id: Date.now() + Math.random(), name, ts: Date.now(), questions: qs }
}
function savePapers() { try { localStorage.setItem('xc_papers', JSON.stringify(papers.value)) } catch (e) {} }
function saveResults() { try { localStorage.setItem('xc_paper_results', JSON.stringify(results.value)) } catch (e) {} }

async function textToQuestions(text) {
  const c = activeCfg(false)
  if (!c || !c.key) return []
  try {
    const reply = await chatOnce(c, [{ role: 'system', content: TEXT_SYS }, { role: 'user', content: String(text).slice(0, 8000) }], 3000)
    const m = String(reply || '').match(/\[[\s\S]*\]/)
    return m ? norm(JSON.parse(m[0])) : []
  } catch (e) { return [] }
}
function buildWrongQuestions() {
  const list = []
  store.wqs.forEach((wq) => {
    const opts = extractChoices(wq.question || '')
    list.push({
      subject: wq.subject || '未分类',
      stem: wq.question || '',
      options: opts,
      answer: answerLetter(wq.answer || ''),
      analysis: [wq.method, wq.note].filter(Boolean).join('\n'),
      fromWrong: true,
      wrongId: wq.id
    })
  })
  return list
}

// 导入本地错题：AI 识别 → 并入应用内错题本（去重）→ 按卷面组卷
async function doExtractWrong() {
  if (!imgs.value.length && !textFiles.value.length) { showToast('请先导入本地错题材料', 'info'); return }
  extracting.value = true
  phase.value = 'extract'
  const all = []
  const c = activeCfg(true)
  try {
    if (imgs.value.length) {
      if (!c || !c.key) showToast('请先配置模型 API Key', 'error')
      else if (!supportsVision(c)) showToast('请配置可识图的视觉模型', 'error')
      else {
        for (const im of imgs.value) {
          const reply = await chatOnce(
            c,
            [
              { role: 'system', content: VISION_SYS },
              { role: 'user', content: [{ type: 'text', text: '请提取这张图片中的行测错题（题干/选项/正确答案/解析），严格按格式输出 JSON 数组：' + VISION_PROMPT }, { type: 'image_url', image_url: { url: im } }] }
            ],
            2500
          )
          const m = String(reply || '').match(/\[[\s\S]*\]/)
          if (m) { try { all.push(...norm(JSON.parse(m[0]))) } catch (e) {} }
        }
      }
    }
    for (const tf of textFiles.value) {
      const qs = await textToQuestions(tf.text)
      all.push(...qs)
    }
  } catch (e) {
    showToast('识别失败：' + e.message, 'error')
  }
  extracting.value = false
  if (!all.length) { showToast('未识别出错题，请重试或换更清晰的材料', 'error'); phase.value = 'config'; return }
  const qs = applyConfig(all.map((x) => ({ ...x, fromWrong: true })))
  if (!qs.length) { showToast('识别出的题目与卷面板块/题量不匹配，请调整卷面构成后重试', 'info'); phase.value = 'config'; return }
  // 并入应用内错题本（按题干前缀去重）
  const before = store.wqs.length
  qs.forEach((x) => {
    const stemKey = String(x.stem || '').slice(0, 40)
    if (store.wqs.some((w) => String(w.question || '').slice(0, 40) === stemKey)) return
    store.wqs.unshift({
      id: Date.now() + Math.random(),
      subject: x.subject || '未分类',
      question: x.stem + '\n\n' + (x.options || []).map((o) => o.k + '. ' + o.t).join('\n'),
      answer: '正确答案 ' + x.answer + (x.analysis ? '\n解析：' + x.analysis : ''),
      reasons: ['本地导入错题'],
      time: new Date().toLocaleString(),
      at: Date.now(),
      wrongCount: 1,
      correctStreak: 0,
      mastery: 0,
      digested: false
    })
  })
  saveWqs()
  const paper = makePaper('本地错题组卷 ' + new Date().toLocaleDateString(), qs)
  papers.value.unshift(paper); savePapers()
  startPaper(paper)
  showToast('✅ 已导入 ' + qs.length + ' 道本地错题并组卷' + (store.wqs.length > before ? '（新增 ' + (store.wqs.length - before) + ' 题入错题本）' : ''), 'success')
}
async function doExtract() {
  if (!imgs.value.length && !textFiles.value.length) {
    showToast('请先导入题目材料（图片/PDF/Word/txt/tex）', 'info')
    return
  }
  extracting.value = true
  phase.value = 'extract'
  const all = []
  const c = activeCfg(true)
  try {
    if (imgs.value.length) {
      if (!c || !c.key) showToast('请先配置模型 API Key', 'error')
      else if (!supportsVision(c)) showToast('请配置可识图的视觉模型', 'error')
      else {
        for (const im of imgs.value) {
          const reply = await chatOnce(
            c,
            [
              { role: 'system', content: VISION_SYS },
              { role: 'user', content: [{ type: 'text', text: '请提取这张图片中的题目，严格按格式输出 JSON 数组：' + VISION_PROMPT }, { type: 'image_url', image_url: { url: im } }] }
            ],
            2500
          )
          const m = String(reply || '').match(/\[[\s\S]*\]/)
          if (m) { try { all.push(...norm(JSON.parse(m[0]))) } catch (e) {} }
        }
      }
    }
    for (const tf of textFiles.value) {
      const qs = await textToQuestions(tf.text)
      all.push(...qs)
    }
  } catch (e) {
    showToast('识别失败：' + e.message, 'error')
  }
  extracting.value = false
  if (!all.length) {
    showToast('未识别出题目，请重试或换更清晰的材料', 'error')
    phase.value = 'config'
    return
  }
  const paper = makePaper('导入组卷 ' + new Date().toLocaleDateString(), applyConfig(all))
  papers.value.unshift(paper)
  savePapers()
  startPaper(paper)
  showToast('✅ 已生成 ' + paper.questions.length + ' 题', 'success')
}

// ===== 出卷与作答 =====
function start() {
  const c = activeCfg(srcMode.value === 'ai' ? false : true)
  if (!c || !c.key) {
    showToast('请先在设置配置' + (srcMode.value === 'ai' ? '文字' : '视觉/文字') + '模型 API Key', 'error')
    return
  }
  if (srcMode.value === 'single') { startSingle(); return }
  if (srcMode.value === 'import') { doExtract(); return }
  if (srcMode.value === 'wrong') {
    if (wrongSrc.value === 'local') {
      if (!imgs.value.length && !textFiles.value.length) { showToast('请先导入本地错题材料（图片/PDF/Word/txt/tex）', 'info'); return }
      doExtractWrong()
      return
    }
    const qs = applyConfig(buildWrongQuestions())
    if (!qs.length) { showToast('所选板块暂无错题，请先收纳错题', 'info'); return }
    const p = makePaper('错题智能组卷', qs)
    papers.value.unshift(p); savePapers()
    startPaper(p)
    return
  }
  startAi()
}
// AI 智能出题：按卷面构成每个板块生成 min(count, aiCap) 题，预生成（并发2）并展示进度/预计剩余时间
function startAi() {
  const plan = []
  let total = 0
  modules.value.forEach((m) => {
    const cap = aiCap.value > 0 ? aiCap.value : 3
    total += Math.max(1, Math.min(m.count || 1, cap))
  })
  let gi = 0
  let gid = 0
  modules.value.forEach((m) => {
    const cap = aiCap.value > 0 ? aiCap.value : 3
    const n = Math.max(1, Math.min(m.count || 1, cap))
    const vars = SUB_VARIANTS[m.subject] || []
    if (m.subject === '资料分析') {
      // 真题卷面：一篇材料配 5 题（最后一组可不足），材料形式轮换；组内题型递进
      const groups = []
      for (let i = 0; i < n; i += 5) groups.push(Math.min(5, n - i))
      groups.forEach((gn) => {
        for (let k = 0; k < gn; k++) {
          const d = difficulty.value === 'curve' ? diffCurve(gi, total) : difficulty.value
          const variant = k === gn - 1 ? '综合分析' : (['基期/现期', '增长率', '增长量', '比重', '平均数', '倍数'][k % 6])
          plan.push({
            subject: '资料分析', difficulty: d, variant, group: true, groupId: gid, groupN: gn,
            groupLeader: k === 0, matType: ['text', 'table', 'mixed', 'chart'][gid % 4],
            stem: null, options: [], answer: '', explain: '', picked: null, correct: null, timeout: false, err: false
          })
          gi++
        }
        gid++
      })
      return
    }
    // 预分配题型（同板块内轮换；一拖五占 5 题一组）
    const slots = []
    for (let i = 0; i < n; i++) {
      const v = vars.length ? vars[i % vars.length] : ''
      if (v === '一拖五' && n - i >= 5) { slots.push({ v, gn: 5 }); i += 4; continue }
      slots.push({ v, gn: 1 })
    }
    slots.forEach((s) => {
      if (s.gn > 1) {
        for (let k = 0; k < s.gn; k++) {
          const d = difficulty.value === 'curve' ? diffCurve(gi, total) : difficulty.value
          plan.push({
            subject: m.subject, difficulty: d, variant: '一拖五', group: true, groupId: gid, groupN: s.gn,
            groupLeader: k === 0,
            stem: null, options: [], answer: '', explain: '', picked: null, correct: null, timeout: false, err: false
          })
          gi++
        }
        gid++
      } else {
        const d = difficulty.value === 'curve' ? diffCurve(gi, total) : difficulty.value
        plan.push({ subject: m.subject, difficulty: d, variant: s.v, stem: null, options: [], answer: '', explain: '', picked: null, correct: null, timeout: false, err: false })
        gi++
      }
    })
  })
  if (!plan.length) { showToast('请先配置卷面（至少一个板块）', 'info'); return }
  const paper = makePaper('智能模拟卷 · ' + selTmpl.value.name, plan)
  papers.value.unshift(paper); savePapers()
  genAll(paper)
}
// 预生成所有题目：并发 2，进度条 + 预计剩余时间（用户可随时取消）
async function genAll(paper) {
  genAbort = false
  questions.value = paper.questions
  phase.value = 'gen'
  genTotal.value = questions.value.length
  genDone.value = 0
  genErrCount.value = 0
  genCur.value = '准备出题…'
  genLive.value = ''
  genEta.value = 0
  genSec.value = 0
  const t0 = Date.now()
  if (genTimer) clearInterval(genTimer)
  genTimer = setInterval(() => { genSec.value = Math.round((Date.now() - t0) / 1000) }, 1000)
  const times = []
  let cursor = 0
  const CONC = 2
  async function worker() {
    while (cursor < questions.value.length && !genAbort) {
      const i = cursor++
      const item = questions.value[i]
      genCur.value = '第 ' + (i + 1) + ' / ' + genTotal.value + ' 题 · ' + item.subject + (item.difficulty ? '（' + (DIFF_LABEL[item.difficulty] || item.difficulty) + '）' : '')
      const st = Date.now()
      await genOne(i)
      const dt = Date.now() - st
      times.push(dt)
      if (times.length > 10) times.shift()
      genDone.value++
      if (item.err) genErrCount.value++
      const avg = times.reduce((a, b) => a + b, 0) / Math.max(1, times.length)
      genEta.value = Math.max(0, Math.round(((questions.value.length - genDone.value) * avg) / 1000))
    }
  }
  await Promise.all([worker(), worker()])
  if (genTimer) { clearInterval(genTimer); genTimer = null }
  if (genAbort) { phase.value = 'config'; showToast('已取消出卷', 'info'); return }
  if (!questions.value.some((q) => !q.err && q.stem)) {
    phase.value = 'config'
    showToast('出题全部失败，请检查模型 Key 或网络后重试', 'error')
    return
  }
  if (singleMode.value) {
    const q0 = questions.value[0]
    if (q0 && q0.stem && !q0.err) addToQuizCol(q0)
    prefetchSingle()
  }
  startPaper(paper)
  showToast('✅ 出卷完成，共 ' + questions.value.length + ' 题' + (genErrCount.value ? '（' + genErrCount.value + ' 题失败已跳过）' : ''), 'success')
}
function saveQuizCol() { try { localStorage.setItem('xc_quiz_col', JSON.stringify(quizCol.value)) } catch (e) {} }
function addToQuizCol(q) {
  const key = String(q.stem || '').slice(0, 40)
  const exist = quizCol.value.find((x) => String(x.stem || '').slice(0, 40) === key)
  if (exist) { exist.lastAt = Date.now(); saveQuizCol(); return }
  quizCol.value.unshift({
    id: Date.now() + Math.random(), ts: Date.now(),
    subject: q.subject, difficulty: q.difficulty, variant: q.variant,
    stem: q.stem, options: q.options || [], answer: q.answer, explain: q.explain || '', designer: q.designer || '',
    wrongCount: 0, correctStreak: 0, lastAt: Date.now(), lastOk: null, history: []
  })
  if (quizCol.value.length > 200) quizCol.value = quizCol.value.slice(0, 200)
  saveQuizCol()
}
// 二刷：直接用出题集里的题（不重新调 AI），先做题后看答案
function startRedo(col) {
  singleMode.value = true
  const item = {
    subject: col.subject, difficulty: col.difficulty, variant: col.variant,
    stem: col.stem, options: (col.options || []).map((o) => ({ ...o })),
    answer: col.answer, explain: col.explain || '', designer: col.designer || '',
    picked: null, correct: null, timeout: false, err: false, fromCol: true
  }
  const paper = makePaper('二刷 · ' + col.subject, [item])
  papers.value.unshift(paper); savePapers()
  startPaper(paper)
}
function delQuizCol(i) { quizCol.value.splice(i, 1); saveQuizCol() }
function clearQuizCol() { quizCol.value = []; saveQuizCol(); showToast('已清空出题集', 'info') }
function updateQuizColResult(q, ok) {
  const key = q && String(q.stem || '').slice(0, 40)
  if (!key) return
  const col = quizCol.value.find((x) => String(x.stem || '').slice(0, 40) === key)
  if (!col) return
  col.lastAt = Date.now(); col.lastOk = ok
  if (ok) { col.correctStreak++; } else { col.wrongCount++; col.correctStreak = 0 }
  col.history = col.history || []
  col.history.push({ t: Date.now(), ok })
  if (col.history.length > 20) col.history = col.history.slice(-20)
  saveQuizCol()
}
function cancelGen() {
  genAbort = true
  if (genTimer) { clearInterval(genTimer); genTimer = null }
  phase.value = 'config'
  questions.value = []
  showToast('已取消出卷', 'info')
}
function startSingle() {
  try { localStorage.setItem('xc_single_plate', singlePlate.value) } catch (e) {}
  singleMode.value = true
  const paper = makePaper('单题快练 · ' + singlePlate.value, [{ subject: singlePlate.value, difficulty: difficulty.value === 'curve' ? 'mid' : difficulty.value, variant: singleVariant.value === '不限' ? '' : singleVariant.value, stem: null, options: [], answer: '', explain: '', picked: null, correct: null, timeout: false, err: false }])
  papers.value.unshift(paper); savePapers()
  genAll(paper) // 先出题再开考，避免做题倒计时提前启动
}
function startPaper(paper) {
  curPaper.value = paper
  questions.value = paper.questions
  cur.value = 0
  marks.value = paper.questions.map(() => null)
  startAt.value = Date.now()
  // 整卷倒计时：按实际题量 × 每题限时（与「每题≤1分钟」的参考时限一致）
  totalLeft.value = paper.questions.length * perQ.value
  totalElapsed.value = 0
  qLeft.value = perQ.value
  qElapsed.value = 0
  phase.value = 'doing'
  clearTimers()
  initModule(0)
  if (!singleMode.value) {
    timers.t = setInterval(() => {
      totalElapsed.value++
      totalLeft.value--
      if (totalLeft.value <= 0) finish()
    }, 1000)
  }
  timers.q = setInterval(() => {
    qElapsed.value++
    qLeft.value--
    if (modLeft.value > 0) modLeft.value--
    if (qLeft.value <= 0) timeoutQ()
  }, 1000)
  // AI 模式：确保当前题已生成（未生成则异步生成）
  ensureGen(0)
}
function clearTimers() {
  if (timers.t) clearInterval(timers.t)
  if (timers.q) clearInterval(timers.q)
  timers = { q: null, t: null }
}
function timeoutQ() {
  const i = cur.value
  if (marks.value[i] != null) return
  marks.value[i] = { ok: false, pick: '', timeout: true }
  showToast('⏰ 本题超时（' + perQ.value + ' 秒），已按答错计', 'error')
  if (singleMode.value) { qLeft.value = perQ.value; qElapsed.value = 0 } else nextQ()
}
// 核心出题：生成第 i 题（含题型轮换），供预生成/单题/重出共用
async function genOne(i) {
  const item = questions.value[i]
  if (!item || item.stem) return
  if (item.fromWrong) return
  if (item.group && !item.groupLeader) return // 占位：由组首生成后统一填充
  const c = activeCfg(false)
  if (!c || !c.key) { item.err = true; item.stem = '（未配置模型，无法出题）'; return }
  // 资料分析「材料+题组」：一次生成整组
  if (item.group) {
    const gn = item.groupN || 5
    const failAll = (msg) => {
      for (let k = 0; k < gn; k++) {
        const slot = questions.value[i + k]
        if (slot) { slot.err = true; slot.stem = msg }
      }
    }
    try {
      const isZL = item.subject === '资料分析'
      const sys = buildGroupPrompt(item.subject, item.variant, item.difficulty || 'mid', gn, item.matType)
      const matTypeName = { text: '纯文字材料', table: '表格材料', mixed: '混合材料', chart: '图形数据材料' }[item.matType] || '混合材料'
      const ask = isZL
        ? '请为【资料分析】出一篇完整材料 + ' + gn + ' 道题（材料形式：' + matTypeName + '，第' + gn + '题为综合分析题，前 ' + (gn - 1) + ' 题考点递进）。'
        : '请为【逻辑判断】出一套「一拖五」题组（1 个共用材料 + ' + gn + ' 道小题）。'
      const reply = await chatOnce(c, [{ role: 'system', content: sys }, { role: 'user', content: ask }], 8000)
      const parsed = parseMaterialQuiz(reply, gn)
      const okN = parsed && parsed.qs.length ? Math.min(gn, parsed.qs.length) : 0
      if (okN >= Math.min(2, gn)) {
        for (let k = 0; k < gn; k++) {
          const slot = questions.value[i + k]
          const q = parsed.qs[k]
          if (slot && q) {
            slot.stem = '【📄 材料】\n' + parsed.material + '\n\n' + q.stem
            slot.options = q.options
            slot.answer = q.answer
            slot.explain = q.explain || ''
            slot.variant = slot.variant || (isZL ? (k === gn - 1 ? '综合分析' : ['基期/现期', '增长率', '增长量', '比重', '平均数', '倍数'][k % 6]) : '分析推理')
          } else if (slot) {
            slot.err = true
            slot.stem = '（本组第 ' + (k + 1) + ' 题解析失败，可点「重出」重试整组）'
          }
        }
      } else failAll('（材料题组生成格式异常，可点「重出」重试整组）')
    } catch (e) {
      failAll('（出题失败：' + e.message + '）')
    }
    return
  }
  const variant = item.variant || ''
  try {
    const sys = buildTaskSys('quiz', { plate: item.subject, difficulty: item.difficulty || 'mid', variant })
    const ask = variant ? '请为【' + item.subject + '】出一道' + variant + '仿真模拟题（本题型：' + variant + '）。' : '请为【' + item.subject + '】出一道仿真模拟题。'
    const msgs = [{ role: 'system', content: sys }, { role: 'user', content: ask }]
    let reply
    if (singleMode.value && questions.value.length === 1) {
      // 单题：流式生成，题干边出边显示
      genLive.value = ''
      reply = await chatStream(msgs, c, (d) => { if (d && d.text) genLive.value = liveVisible(d.text) }, null, 150000)
      genLive.value = liveVisible(reply || '')
    } else {
      reply = await chatOnce(c, msgs, 2400)
    }
    const qz = parseQuiz(reply)
    if (qz) {
      item.stem = qz.stem
      item.options = qz.options
      item.answer = qz.answer
      item.explain = qz.explain || ''
      item.designer = qz.designer || ''
      item.variant = variant
    } else {
      item.stem = '（本题目 AI 生成格式异常，可点「重出」重试）'
      item.err = true
    }
  } catch (e) {
    item.stem = '（出题失败：' + e.message + '）'
    item.err = true
  }
}
async function ensureGen(i) {
  const item = questions.value[i]
  if (!item || item.stem || generating[i]) return
  if (item.fromWrong) return
  generating[i] = true
  genBusy.value = true
  await genOne(i)
  generating[i] = false
  genBusy.value = false
  // 预生成下一题
  if (questions.value[i + 1]) ensureGen(i + 1)
}
async function prefetchSingle() {
  // 后台预生成下一题（同板块/难度/题型），点「再来一题」秒开
  if (!singleMode.value || genAbort) return
  const plate = singlePlate.value
  const diff = difficulty.value === 'curve' ? 'mid' : difficulty.value
  const variant = singleVariant.value === '不限' ? '' : singleVariant.value
  const c = activeCfg(false)
  if (!c || !c.key) return
  const item = { subject: plate, difficulty: diff, variant, stem: null, options: [], answer: '', explain: '', picked: null, correct: null, timeout: false, err: false }
  try {
    const sys = buildTaskSys('quiz', { plate, difficulty: diff, variant })
    const ask = variant ? '请为【' + plate + '】出一道' + variant + '仿真模拟题（本题型：' + variant + '）。' : '请为【' + plate + '】出一道仿真模拟题。'
    const reply = await chatOnce(c, [{ role: 'system', content: sys }, { role: 'user', content: ask }], 2400)
    const qz = parseQuiz(reply)
    if (qz) prefetchQ.value = { item: { ...item, stem: qz.stem, options: qz.options, answer: qz.answer, explain: qz.explain || '', designer: qz.designer || '' }, plate, difficulty: diff, variant }
  } catch (e) { /* 预生成失败静默，下次点再来一题再实时生成 */ }
}
function nextSingle() {
  // 单题快练：优先用预生成的下一题（秒开），否则实时生成
  singleMode.value = true
  const curPlate = singlePlate.value
  const curDiff = difficulty.value === 'curve' ? 'mid' : difficulty.value
  const curVar = singleVariant.value === '不限' ? '' : singleVariant.value
  const pf = prefetchQ.value
  if (pf && pf.item && pf.item.stem && pf.plate === curPlate && pf.difficulty === curDiff && pf.variant === curVar) {
    const item = { ...pf.item, picked: null, correct: null, timeout: false, err: false }
    const paper = makePaper('单题快练 · ' + curPlate, [item])
    papers.value[0] = paper; savePapers()
    prefetchQ.value = null
    startPaper(paper)
    prefetchSingle()
    return
  }
  prefetchQ.value = null
  const paper = makePaper('单题快练 · ' + curPlate, [{ subject: curPlate, difficulty: curDiff, variant: curVar, stem: null, options: [], answer: '', explain: '', picked: null, correct: null, timeout: false, err: false }])
  papers.value[0] = paper; savePapers()
  genAll(paper)
}
function retryGen() {
  const i = cur.value
  const item = questions.value[i]
  if (!item) return
  if (item.group) {
    // 整组重出：定位组首，清空整组
    let lead = i
    for (let k = i; k >= 0; k--) {
      const x = questions.value[k]
      if (x && x.group && x.groupId === item.groupId) lead = k
      else break
    }
    for (let k = lead; k < lead + (item.groupN || 5); k++) {
      const x = questions.value[k]
      if (x) { x.stem = null; x.err = false; x.options = []; x.answer = ''; x.explain = '' }
    }
    ensureGen(lead)
    return
  }
  item.stem = null; item.err = false; item.options = []; item.answer = ''; item.explain = ''
  ensureGen(i)
}
function pick(k) {
  const i = cur.value
  const qq = questions.value[i]
  if (!qq || marks.value[i] != null || qq.err) return
  marks.value[i] = { ok: k === qq.answer, pick: k }
  if (qq.answer && k === qq.answer) { /* 正确 */ } else if (qq.answer) showToast('❌ 选错了，正确答案是 ' + qq.answer, 'error')
}
function selfMark(ok) {
  const i = cur.value
  if (marks.value[i] != null) return
  marks.value[i] = { ok, pick: '', self: true }
}
function initModule(i) {
  const s = questions.value[i] ? questions.value[i].subject : ''
  modName.value = s
  modDone.value = questions.value.slice(0, i).filter((x) => x.subject === s).length
  modTotal.value = questions.value.filter((x) => x.subject === s).length
  const cfg = modules.value.find((m) => m.subject === s)
  modRefSec.value = cfg && cfg.refMin ? cfg.refMin * 60 : Math.max(30, modTotal.value * perQ.value)
  modLeft.value = modRefSec.value
}
function go(i) {
  if (i < 0 || i >= questions.value.length) return
  const s = questions.value[i] ? questions.value[i].subject : ''
  if (s !== modName.value) initModule(i)
  else modDone.value = questions.value.slice(0, i).filter((x) => x.subject === s).length
  cur.value = i
  qLeft.value = perQ.value
  qElapsed.value = 0
  ensureGen(i)
}
function nextQ() {
  if (cur.value < questions.value.length - 1) { go(cur.value + 1) } else finish()
}
function prevQ() { if (cur.value > 0) go(cur.value - 1) }
function finish() {
  clearTimers()
  questions.value.forEach((qq, i) => {
    if (marks.value[i] == null) marks.value[i] = { ok: false, pick: '', timeout: true }
  })
  if (singleMode.value && questions.value[0]) updateQuizColResult(questions.value[0], !!(marks.value[0] && marks.value[0].ok))
  const rec = { ts: Date.now(), name: curPaper.value ? curPaper.value.name : '模拟卷', n: questions.value.length, score: score.value, rate: rate.value, sec: totalElapsed.value }
  results.value.unshift(rec)
  if (results.value.length > 50) results.value = results.value.slice(0, 50)
  saveResults()
  phase.value = 'result'
}
function achieveText() {
  const r = rate.value
  if (r >= 90) return '🏆 巅峰状态！继续保持'
  if (r >= 80) return '🎯 优秀！离满分一步之遥'
  if (r >= 60) return '👍 合格，把错题复盘一遍更稳'
  return '💪 再接再厉，错题都进本子重点刷'
}
function saveWrongs() {
  const wrongs = questions.value.filter((qq, i) => marks.value[i] && !marks.value[i].ok)
  if (!wrongs.length) { showToast('本次没有错题 🎉', 'success'); return }
  wrongs.forEach((qq) => {
    if (qq.fromWrong) return
    store.wqs.unshift({
      id: Date.now() + Math.random(),
      subject: qq.subject || '未分类',
      question: qq.stem + '\n\n' + (qq.options || []).map((o) => o.k + '. ' + o.t).join('\n'),
      answer: '正确答案 ' + qq.answer + (marks.value[questions.value.indexOf(qq)] && marks.value[questions.value.indexOf(qq)].pick ? '（我选了' + marks.value[questions.value.indexOf(qq)].pick + '）' : ''),
      reasons: ['整卷/组卷作答失误'],
      time: new Date().toLocaleString(),
      at: Date.now(),
      wrongCount: 1,
      correctStreak: 0,
      mastery: 0,
      digested: false
    })
  })
  saveWqs()
  showToast('✅ 已存入错题本 ' + wrongs.length + ' 题', 'success')
}
function delPaper(i) { papers.value.splice(i, 1); savePapers() }
function openPaper(p) {
  if (p && p.questions && p.questions.length) { startPaper(p); return }
  showToast('该卷暂无题目', 'info')
}
function replay() {
  phase.value = 'config'
  questions.value = []
  cur.value = -1
  marks.value = []
  singleMode.value = false
  clearTimers()
}
function backList() { phase.value = 'config'; singleMode.value = false; clearTimers() }
function cancel() { clearTimers(); emit('close') }
function backToConfig() { clearTimers(); phase.value = 'config' }
const topTitle = computed(() => {
  if (phase.value === 'gen') return '⏳ AI 出卷中…'
  if (phase.value === 'doing') return '📝 作答中 · ' + (curPaper ? curPaper.name : '模拟卷')
  if (phase.value === 'result') return '📄 成绩单'
  return srcMode.value === 'single' ? '⚡ 单题快练' : srcMode.value === 'import' ? '📂 导入组卷' : srcMode.value === 'wrong' ? '📚 错题组卷' : '📝 模拟组卷'
})
function topBack() {
  if (phase.value === 'doing' || phase.value === 'result') backToConfig()
  else if (phase.value === 'gen') cancelGen()
  else cancel()
}
function toggleFold(k) {
  if (k === 'papers') { openPapers.value = !openPapers.value; try { localStorage.setItem('xc_ep_papers', openPapers.value ? '1' : '0') } catch (e) {} }
  else if (k === 'results') { openResults.value = !openResults.value; try { localStorage.setItem('xc_ep_results', openResults.value ? '1' : '0') } catch (e) {} }
  else { openQuizCol.value = !openQuizCol.value; try { localStorage.setItem('xc_ep_quizcol', openQuizCol.value ? '1' : '0') } catch (e) {} }
}
// 流式实时显示时隐藏答案与解析：只保留到第一个揭示标记之前（题干+选项）
const REVEAL_RE = /【正确答案】|###\s*✅?\s*(答案解析|解析|答案详解)|正确答案\s*[:：]|^答案\s*[:：]/m
function liveVisible(t) {
  const s = String(t || '')
  const i = s.search(REVEAL_RE)
  return i >= 0 ? s.slice(0, i) : s
}
function onSinglePlate() {
  const vs = SUB_VARIANTS[singlePlate.value] || []
  if (singleVariant.value !== '不限' && !vs.includes(singleVariant.value)) singleVariant.value = '不限'
  prefetchQ.value = null
}
// 板块统计（成绩单）
const moduleStats = computed(() => {
  const map = {}
  questions.value.forEach((qq, i) => {
    const s = qq.subject || '未分类'
    if (!map[s]) map[s] = { subject: s, total: 0, ok: 0, sec: 0 }
    map[s].total++
    if (marks.value[i] && marks.value[i].ok) map[s].ok++
    map[s].sec += marks.value[i] ? 1 : 0
  })
  return Object.values(map)
})
function doExportPaper(format) {
  if (!curPaper.value || !questions.value.length) { showToast('暂无可导出的卷子', 'info'); return }
  exportPaper(curPaper.value, marks.value, { score: score.value, rate: rate.value, sec: totalElapsed.value, moduleStats: moduleStats.value }, format, aiLayout.value)
}
onUnmounted(() => { clearTimers(); if (genTimer) clearInterval(genTimer) })

</script>

<template>
  <div class="ov show sim-ov" @click.self="cancel()">
    <div class="pnl sim-pnl ep-pnl">
      <div class="pnl-top">
        <button class="pnl-top-b" title="返回上一层（也可按 Esc / 浏览器返回）" @click="topBack()">← 返回</button>
        <span class="pnl-top-t">{{ topTitle }}</span>
      </div>
      <!-- ========== 配置 ========== -->
      <div v-if="phase === 'config'" class="pp-config">
        <div class="ep-src-row">
          <button class="fp-b" :class="{ on: srcMode === 'single' }" @click="srcMode = 'single'">⚡ 单题快练</button>
          <button class="fp-b" :class="{ on: srcMode === 'ai' }" @click="srcMode = 'ai'">🎲 AI 整卷出题</button>
          <button class="fp-b" :class="{ on: srcMode === 'import' }" @click="srcMode = 'import'">📂 导入材料</button>
          <button class="fp-b" :class="{ on: srcMode === 'wrong' }" @click="srcMode = 'wrong'">📚 错题集组卷</button>
        </div>

        <div class="ep-block">
          <div class="ep-block-hd">📐 卷面构成（国考/省考模板，均可自由编辑）</div>
          <div class="ep-tmpl-row">
            <select v-model="templateId" class="tb-sel" @change="onTemplate()">
              <option v-for="t in TEMPLATES" :key="t.id" :value="t.id">{{ t.name }} · {{ templateTotal(t) }}题 / {{ t.mins }}分钟</option>
            </select>
            <button class="btn btn-gh" @click="onTemplate()">↻ 载入模板</button>
          </div>
          <div v-if="selTmpl.tag" class="ep-note">🏷️ {{ selTmpl.tag }}</div>
          <div v-if="selTmpl.note" class="ep-note">💡 {{ selTmpl.note }}</div>
          <div v-if="tmplJudgeNote" class="ep-note">🧩 判断推理子板块：{{ tmplJudgeNote }}（国考判断推理常为 4 子板块各 10 题）</div>

          <div class="ep-mods">
            <div class="ep-mod-row hd"><span>板块</span><span>题数</span><span>参考时限(分)</span><span class="ep-perq">每题约</span><span></span></div>
            <div v-for="(m, i) in modules" :key="i" class="ep-mod-row">
              <select v-model="m.subject" class="tb-sel">
                <option v-for="s in SUBJECTS" :key="s" :value="s">{{ s }}</option>
              </select>
              <input type="number" min="1" max="80" v-model.number="m.count" class="ep-inp" />
              <input type="number" min="1" max="120" v-model.number="m.refMin" class="ep-inp" />
              <span class="ep-perq">{{ moduleRefSec(m) }}s</span>
              <button class="ep-x" @click="rmRow(i)">×</button>
            </div>
          </div>
          <div class="ep-mod-actions">
            <button class="btn btn-gh" @click="addRow()">➕ 加板块</button>
            <span class="ep-total">合计 <b>{{ totalQ }}</b> 题 · 参考 <b>{{ refTotal }}</b> 分钟<template v-if="selTmpl.mins">（官方 {{ selTmpl.mins }} 分钟）</template></span>
          </div>
        </div>

        <div class="ep-block">
          <div class="ep-block-hd">⚙️ 出卷参数</div>
          <div class="ep-param">
            <label>每题限时</label>
            <select v-model="perQ" class="tb-sel">
              <option :value="30">30 秒</option><option :value="45">45 秒</option>
              <option :value="60">60 秒（推荐，≤1分钟）</option>
              <option :value="75">75 秒</option><option :value="90">90 秒</option>
            </select>
            <span class="ep-hint">整卷倒计时 = 题数 × 每题限时</span>
          </div>
          <div v-if="srcMode === 'ai'" class="ep-param">
            <label>AI 每板块组题</label>
            <select v-model="aiCap" class="tb-sel">
              <option :value="3">3 题（快测）</option><option :value="5">5 题（推荐）</option><option :value="10">10 题</option>
            </select>
            <span class="ep-hint">按真实卷面结构逐板块出题，题量越大出卷越久</span>
          </div>
          <div class="ep-param">
            <label>出卷顺序</label>
            <select v-model="mixMode" class="tb-sel">
              <option value="module">按板块顺序（贴近真实卷）</option>
              <option value="mix">混合打乱</option>
            </select>
          </div>
          <div class="ep-param">
            <label>出题难度</label>
            <select v-model="difficulty" class="tb-sel">
              <option value="curve">智能曲线（前易后难，30%易/50%中/20%难）</option>
              <option value="easy">易（单一考点，直接对应）</option>
              <option value="mid">中（一处拐弯/一个陷阱）</option>
              <option value="hard">难（复合考点+强干扰）</option>
              <option value="real">真题级（反套路·强干扰·陷阱叠加）</option>
            </select>
            <span class="ep-hint">已接入「命题专家」规范：考点先行·干扰项错因·自检清单</span>
          </div>
        </div>

        <div v-if="srcMode === 'single'" class="ep-block">
          <div class="ep-block-hd">⚡ 单题快练（原「模拟出题」）</div>
          <div class="ep-param">
            <label>练习板块</label>
            <select v-model="singlePlate" class="tb-sel" @change="onSinglePlate()">
              <option v-for="s in SUBJECTS" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
          <div class="ep-param">
            <label>子题型</label>
            <select v-model="singleVariant" class="tb-sel">
              <option value="不限">不限（自动轮换）</option>
              <option v-for="v in (SUB_VARIANTS[singlePlate] || [])" :key="v" :value="v">{{ v }}</option>
            </select>
            <span class="ep-hint">指定该板块下的细分题型，由对应「子命题人」精准出题</span>
          </div>
          <div class="ep-note">随机出一道该板块仿真单选，点选作答、即时批改，可「再来一题」刷同类题，错题一键入库。适合碎片时间专项突破。</div>
        </div>

        <div v-if="srcMode === 'import'" class="ep-block">
          <div class="ep-block-hd">📂 题目材料（图片 / PDF / Word / txt / tex）</div>
          <label class="btn btn-pri" style="cursor: pointer; text-align: center">
            📁 添加题目材料（可多选）
            <input type="file" accept="image/*,.pdf,.docx,.txt,.tex,.md,.markdown" multiple style="display: none" @change="onFiles" />
          </label>
          <div style="font-size: 11px; color: var(--text3); margin-top: 4px">PDF 自动转页图、Word 提取正文、txt/tex/md 直接读入，AI 统一整理成题，再按上方卷面构成裁剪组卷</div>
          <div v-if="imgs.length" class="pp-imgs">
            <div v-for="(im, i) in imgs" :key="'i' + i" class="pp-thumb"><img :src="im" /><button class="pp-x" @click="rmImg(i)">×</button></div>
          </div>
          <div v-if="textFiles.length" class="pp-txts">
            <div v-for="(t, i) in textFiles" :key="'t' + i" class="pp-txt-item"><span>📄 {{ t.name }}（{{ t.text.length }} 字）</span><button class="pp-x" @click="rmTxt(i)">×</button></div>
          </div>
        </div>

        <div v-if="srcMode === 'wrong'" class="ep-block">
          <div class="ep-block-hd">📚 错题集组卷</div>
          <div class="ep-src-row" style="margin-top: 0">
            <button class="fp-b" :class="{ on: wrongSrc === 'app' }" @click="wrongSrc = 'app'">📋 应用内错题本</button>
            <button class="fp-b" :class="{ on: wrongSrc === 'local' }" @click="wrongSrc = 'local'">📂 导入本地错题</button>
          </div>
          <template v-if="wrongSrc === 'app'">
            <div class="ep-note">从应用内错题本按上方卷面构成过滤组卷：板块匹配、题量按卷面裁剪、可混合或按板块排序。错题作答后不会重复入库。</div>
          </template>
          <template v-else>
            <label class="btn btn-pri" style="cursor: pointer; text-align: center">
              📁 导入本地错题（图片 / PDF / Word / txt / tex / md，可多选）
              <input type="file" accept="image/*,.pdf,.docx,.txt,.tex,.md,.markdown" multiple style="display: none" @change="onFiles" />
            </label>
            <div style="font-size: 11px; color: var(--text3); margin-top: 4px">AI 识别整理后：自动并入应用内错题本（按题干去重）→ 再按上方卷面构成组卷</div>
            <div v-if="imgs.length" class="pp-imgs">
              <div v-for="(im, i) in imgs" :key="'wi' + i" class="pp-thumb"><img :src="im" /><button class="pp-x" @click="rmImg(i)">×</button></div>
            </div>
            <div v-if="textFiles.length" class="pp-txts">
              <div v-for="(t, i) in textFiles" :key="'wt' + i" class="pp-txt-item"><span>📄 {{ t.name }}（{{ t.text.length }} 字）</span><button class="pp-x" @click="rmTxt(i)">×</button></div>
            </div>
          </template>
        </div>

        <div v-if="papers.length" class="ep-block">
          <div class="ep-block-hd ep-fold-hd" @click="toggleFold('papers')">
            <span>🗂️ 历史卷子（{{ papers.length }}）</span><span class="ep-fold-ic">{{ openPapers ? '▾ 收起' : '▸ 展开' }}</span>
          </div>
          <div v-if="openPapers">
            <div v-for="(p, i) in papers.slice(0, 8)" :key="p.id" class="ep-paper">
              <button class="ep-paper-btn" @click="openPaper(p)">{{ p.name }} · {{ p.questions.length }} 题</button>
              <button class="ep-x" @click="delPaper(i)">×</button>
            </div>
            <div v-if="papers.length > 8" class="ep-note">… 共 {{ papers.length }} 卷（展开后默认显示最近 8 卷）</div>
          </div>
        </div>

        <div v-if="quizCol.length" class="ep-block">
          <div class="ep-block-hd ep-fold-hd" @click="toggleFold('quizcol')">
            <span>📚 出题集（{{ quizCol.length }}）</span><span class="ep-fold-ic">{{ openQuizCol ? '▾ 收起' : '▸ 展开' }}</span>
          </div>
          <div v-if="openQuizCol">
            <div class="ep-note">单题快练/出题自动收纳，支持二刷：先做题 → 点选项 → 再显示答案与解析</div>
            <div v-for="(c, i) in quizCol.slice(0, 12)" :key="c.id" class="ep-paper">
              <span class="qc-status" :class="c.lastOk === true ? 'ok' : c.lastOk === false ? 'no' : ''">{{ c.lastOk === true ? '✓' : c.lastOk === false ? '✗' : '•' }}</span>
              <button class="ep-paper-btn" @click="startRedo(c)" :title="'【' + c.subject + (c.variant ? '·' + c.variant : '') + '】' + c.stem.slice(0, 80) + '（累计错' + c.wrongCount + '次 · 连对' + c.correctStreak + '）'">{{ c.subject }}{{ c.variant ? '·' + c.variant : '' }} · {{ c.stem.slice(0, 22) }}…</button>
              <button class="ep-x" @click="delQuizCol(i)">×</button>
            </div>
            <div v-if="quizCol.length > 12" class="ep-note">… 共 {{ quizCol.length }} 题（默认显示最近 12 题）</div>
            <button class="btn btn-gh" style="margin-top: 6px" @click="clearQuizCol()">🗑 清空出题集</button>
          </div>
        </div>

        <div v-if="results.length" class="ep-block">
          <div class="ep-block-hd ep-fold-hd" @click="toggleFold('results')">
            <span>🏅 考试战绩（{{ results.length }}）</span><span class="ep-fold-ic">{{ openResults ? '▾ 收起' : '▸ 展开' }}</span>
          </div>
          <div v-if="openResults">
            <div class="ep-stats">平均正确率 <b>{{ avgRate }}%</b> · 已完成 <b>{{ results.length }}</b> 卷</div>
            <div v-for="(r, i) in results.slice(0, 8)" :key="i" class="pp-item">
              <div class="pp-info"><div class="pp-name">{{ r.name }}</div><div class="pp-meta">{{ r.n }} 题 · {{ new Date(r.ts).toLocaleString() }}</div></div>
              <span class="pp-score" :class="r.rate >= 80 ? 'ok' : r.rate >= 60 ? 'mid' : 'no'">{{ r.score }}/{{ r.n }} · {{ r.rate }}%</span>
              <span class="pp-meta">⏱ {{ fmt(r.sec) }}</span>
            </div>
            <div v-if="results.length > 8" class="ep-note">… 共 {{ results.length }} 次（展开后默认显示最近 8 次）</div>
          </div>
        </div>

        <div class="pnl-btns">
          <button class="btn btn-gh" @click="cancel()">取消</button>
          <button class="btn btn-pri" @click="start()">
            🚀 {{ srcMode === 'single' ? '开始单题快练' : srcMode === 'ai' ? '开始考试（AI 出题）' : srcMode === 'import' ? '识别并组卷' : (wrongSrc === 'local' ? '识别本地错题并组卷' : '错题组卷开始') }}
          </button>
        </div>
      </div>

      <!-- ========== AI 出卷中（进度条 + 预计时间） ========== -->
      <div v-else-if="phase === 'gen'" class="pp-extract">
        <div class="gen-panel">
          <div class="sim-loading"><span class="spin"></span> AI 正在出卷…（并发出题，请稍候）</div>
          <div v-if="singleMode && genLive" class="gen-live">{{ genLive }}</div>
          <div class="gen-cur">{{ genCur }}</div>
          <div class="gen-bar"><i :style="{ width: (genTotal ? Math.round((genDone / genTotal) * 100) : 0) + '%' }"></i></div>
          <div class="gen-meta">已完成 <b>{{ genDone }}</b> / {{ genTotal }} 题 · 已用 <b>{{ genSec }}</b> 秒 · 预计还需 <b>约 {{ genEta }} 秒</b>（每题约 {{ genDone ? Math.round(genSec / genDone) : '—' }} 秒）</div>
          <div class="gen-plan">📐 本卷构成：{{ planText }}</div>
          <div class="gen-tip">💡 按真实卷面结构逐板块出题，同板块题型自动轮换；出完自动开考（做题计时从开考才开始）</div>
          <div class="pnl-btns"><button class="btn btn-gh" @click="cancelGen()">⏹ 取消出卷</button></div>
        </div>
      </div>

      <!-- ========== 识别中 ========== -->
      <div v-else-if="phase === 'extract'" class="pp-extract">
        <div class="sim-loading"><span class="spin"></span> AI 正在整理题目…（图片/PDF 每张约 10-30 秒，文本约 5-15 秒）</div>
      </div>

      <!-- ========== 作答 ========== -->
      <div v-else-if="phase === 'doing' && q" class="sim-doing">
        <div class="pp-timer-bar">
          <span class="sim-plate">📐 {{ q.subject }}</span>
          <span class="sim-prog">第 {{ cur + 1 }} / {{ questions.length }} 题</span>
          <span class="pp-tq" :class="{ warn: qLeft <= 10 }">本题 ⏳ {{ fmt(qLeft) }} · ⏱ {{ fmt(qElapsed) }}</span>
        </div>
        <div v-if="!singleMode" class="pp-timer-bar total">
          <span class="pp-total">📦 板块参考 ⏳ {{ fmt(modLeft) }}<template v-if="modTotal"> · 已完成 {{ modDone }}/{{ modTotal }} 题</template></span>
        </div>
        <div v-if="!singleMode" class="pp-timer-bar total">
          <span class="pp-total">📄 整卷 ⏳ {{ fmt(totalLeft) }} · 总用时 ⏱ {{ fmt(totalElapsed) }}</span>
        </div>
        <div v-else class="pp-timer-bar total">
          <span class="pp-total">⚡ 单题快练 · {{ singlePlate }}</span>
        </div>

        <div v-if="!singleMode" class="ep-nav">
          <button
            v-for="(qq, i) in questions"
            :key="i"
            class="ep-nav-btn"
            :class="{ cur: i === cur, ok: marks[i] && marks[i].ok, no: marks[i] && !marks[i].ok }"
            @click="go(i)"
          >{{ i + 1 }}</button>
        </div>

        <div v-if="!q.stem && !q.err" class="sim-loading"><span class="spin"></span> AI 正在出题（{{ q.subject }}）…</div>
        <template v-else>
          <div class="sim-q" v-html="qHtml"></div>
          <div v-if="q.err" class="sim-err">
            ⚠️ {{ q.stem }}
            <button class="btn btn-gh" @click="retryGen()">↻ 重出</button>
          </div>
          <div v-else-if="q.options && q.options.length" class="quiz-opts">
            <button
              v-for="o in q.options"
              :key="o.k"
              class="quiz-opt"
              :class="{ picked: marks[cur] && marks[cur].pick === o.k, right: marks[cur] && o.k === q.answer, wrong: marks[cur] && marks[cur].pick === o.k && o.k !== q.answer }"
              :disabled="marks[cur] != null"
              @click="pick(o.k)"
            >
              <span class="qk">{{ o.k }}</span><span class="qt">{{ o.t }}</span>
            </button>
          </div>
          <div v-else-if="!marks[cur]" class="pp-nochoice">
            <button class="btn btn-gh" @click="marks[cur] = { reveal: true }">👁 查看答案</button>
          </div>
          <div v-if="marks[cur] && !marks[cur].ok && marks[cur].pick === '' && marks[cur].reveal" class="pp-nochoice">
            <div class="quiz-result no">正确答案 {{ q.answer }}</div>
            <div class="pp-selftj">
              <button class="btn btn-gh" @click="selfMark(false)">❌ 还没掌握</button>
              <button class="btn btn-pri" @click="selfMark(true)">✅ 这题会了</button>
            </div>
          </div>
          <div v-if="marks[cur] && marks[cur].ok !== undefined && !marks[cur].timeout" class="quiz-result" :class="marks[cur].ok ? 'ok' : 'no'">
            {{ marks[cur].ok ? '✅ 回答正确' : (marks[cur].self ? '❌ 还没掌握，已计错' : '❌ 回答错误，正确答案 ' + q.answer) }}
          </div>
          <div v-if="marks[cur] && marks[cur].ok !== undefined && (q.analysis || q.explain)" class="sim-explain" v-html="qExplainHtml"></div>
          <div v-if="marks[cur] && marks[cur].ok !== undefined && q.designer" class="designer-btn-row">
            <button class="btn btn-gh" title="看完解析还不懂？看看命题人为什么这么出、每个干扰项用了什么陷阱" @click="designerShow = true">🧠 命题人设计说明（出题意图 · 陷阱设计）</button>
          </div>
          <div class="pnl-btns">
            <button class="btn btn-gh" title="返回出卷配置（保留当前卷子到历史卷子）" @click="backToConfig()">← 返回配置</button>
            <button class="btn btn-gh" @click="cancel()">退出</button>
            <template v-if="singleMode">
              <button class="btn btn-gh" @click="saveWrongs()">📌 错题入库</button>
              <button class="btn btn-pri" @click="nextSingle()">🔁 再来一题</button>
              <span v-if="prefetchQ && prefetchQ.item && prefetchQ.item.stem" class="ep-hint" style="display: inline-block; margin-left: 6px">🔮 下一题已预生成，秒开</span>
            </template>
            <template v-else>
              <button class="btn btn-gh" :disabled="cur === 0" @click="prevQ()">◀ 上一题</button>
              <button v-if="marks[cur] && (marks[cur].ok !== undefined || marks[cur].pick !== '' || marks[cur].reveal)" class="btn btn-pri" @click="nextQ()">
                {{ cur + 1 >= questions.length ? '交卷 📄' : '下一题 ▶' }}
              </button>
            </template>
          </div>
        </template>
      </div>

      <!-- ========== 成绩单 ========== -->
      <div v-else class="sim-result">
        <h3>📄 成绩单 · {{ curPaper ? curPaper.name : '模拟卷' }}</h3>
        <div class="sr-score">{{ score }} / {{ questions.length }}</div>
        <div class="sr-rate">{{ rate }}% · {{ achieveText() }}</div>
        <div class="sr-meta">总用时 {{ fmt(totalElapsed) }} · 平均每题 {{ questions.length ? Math.round(totalElapsed / questions.length) : 0 }} 秒</div>
        <div v-if="moduleStats.length" class="ep-mstats">
          <div v-for="ms in moduleStats" :key="ms.subject" class="ep-mstat">
            <span class="ep-ms-name">{{ ms.subject }}</span>
            <span class="ep-ms-bar"><i :style="{ width: (ms.total ? Math.round((ms.ok / ms.total) * 100) : 0) + '%' }"></i></span>
            <span class="ep-ms-num">{{ ms.ok }}/{{ ms.total }}</span>
          </div>
        </div>
        <div class="sr-list">
          <div v-for="(qq, i) in questions" :key="i" class="sr-item">
            <span class="sr-mark" :class="marks[i] && marks[i].ok ? 'ok' : 'no'">{{ marks[i] && marks[i].ok ? '✓' : '✗' }}</span>
            <span class="sr-t">{{ (qq.subject || '') + ' · ' + qq.stem.slice(0, 46) }}</span>
          </div>
        </div>
        <div class="ep-export-row">
          <span class="ep-export-l">📤 导出整卷：</span>
          <button class="btn btn-gh ep-export-b" :class="{ on: aiLayout }" :title="aiLayout ? 'AI 排版已开启：先梳理考点/错因/秒杀规律再导出' : 'AI 排版关闭：原样导出'" @click="aiLayout = !aiLayout">✨ {{ aiLayout ? 'AI排版开' : 'AI排版关' }}</button>
          <button class="btn btn-gh ep-export-b" @click="doExportPaper('docx')">Word</button>
          <button class="btn btn-gh ep-export-b" @click="doExportPaper('pdf')">PDF</button>
          <button class="btn btn-gh ep-export-b" @click="doExportPaper('md')">Markdown</button>
          <button class="btn btn-gh ep-export-b" @click="doExportPaper('tex')">LaTeX</button>
          <button class="btn btn-gh ep-export-b" @click="doExportPaper('typ')">Typst</button>
        </div>
        <div v-if="aiLayout" class="ep-note" style="text-align: center">✨ AI 排版：先让 AI 梳理每题的考点 / 错因 / 秒杀规律并突出错题，再生成排版文档（需文字模型 Key，耗时约 10-20 秒）</div>
        <div class="pnl-btns">
          <button class="btn btn-gh" title="返回出卷配置（卷子已保存在历史卷子）" @click="backToConfig()">← 返回配置</button>
          <button class="btn btn-gh" @click="replay()">🔁 再来一卷</button>
          <button class="btn btn-gh" @click="saveWrongs()">📌 错题入库</button>
          <button class="btn btn-gh" @click="backList()">🏠 卷子列表</button>
          <button class="btn btn-pri" @click="cancel()">完成</button>
        </div>
      </div>

      <!-- ========== 命题人设计说明弹窗（答完+看完解析后才可打开） ========== -->
      <div v-if="designerShow && q && q.designer" class="ov show" @click.self="designerShow = false">
        <div class="pnl designer-pnl">
          <div class="pnl-top">
            <button class="pnl-top-b" @click="designerShow = false">← 返回</button>
            <span class="pnl-top-t">🧠 命题人设计说明</span>
          </div>
          <div class="designer-body" v-html="renderMd(q.designer)"></div>
          <div class="pnl-btns"><button class="btn btn-pri" @click="designerShow = false">知道了</button></div>
        </div>
      </div>
    </div>
  </div>
</template>
