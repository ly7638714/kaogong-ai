<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { store, saveWqs, saveCfg } from '../store'
import { activeCfg, chatOnce, chatStream, buildTaskSys, buildMaterialPrompt, buildGroupPrompt, supportsVision } from '../api'
import { parseQuiz, extractChoices, answerLetter, parseMaterialQuiz } from '../utils/quiz'
import { showToast } from '../utils/toast'
import { exportPaper } from '../utils/export'
import { renderMd } from '../utils/renderMd'
import { verifyTruthTable } from '../utils/logicVerify'
import { mountCharts } from '../utils/chartMount'
import { diffCurve } from '../api/professor'

const emit = defineEmits(['close'])
const props = defineProps({ initialSrc: { type: String, default: 'ai' }, initialPaper: { type: Object, default: null } })

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
    id: 'custom', name: '🛠 自由组卷（自定义板块）', total: 45, mins: 120, tag: '非真题模板 · 自由编辑板块/题量/时限',
    note: '自由组卷：随意增删板块、改题数与参考时限，或按你的省份/进度自行搭建卷面（不套用任何真题结构）',
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
  '逻辑判断': ['削弱型', '加强型', '前提假设型', '结论推出型', '解释型', '评价型', '论证缺陷型', '翻译推理', '真假话', '分析推理'],
  '图形推理': ['位置规律', '样式规律', '属性规律', '数量规律', '组合规律', '空间重构', '截面图', '三视图', '立体拼合', '汉字字母'],
  '定义判断': ['选是题', '选非题', '多定义题', '匹配对应题'],
  '类比推理': ['二词型', '三词型', '填空型', '集合关系', '逻辑关系', '对应关系', '语法关系', '语义关系'],
  '言语理解': ['中心理解', '意图判断', '标题填入', '态度观点', '细节判断', '词句理解', '语句填空', '下文推断', '语句排序', '逻辑填空'],
  '资料分析': ['基期/现期', '增长率', '增长量', '比重', '平均数', '倍数', '隔年增长', '年均增长', '混合增长率', '拉动增长/贡献率'],
  '数量关系': ['工程问题', '行程问题', '排列组合', '概率问题', '利润问题', '容斥问题', '最值问题'],
  '常识判断': ['时政', '法律常识', '科技常识', '人文历史', '地理常识', '经济常识'],
  '政治理论': ['新思想', '党史', '马原哲学', '时政报告', '重要会议']
}

// ===== 状态 =====
const templateId = ref('gk_ds')
const modules = ref((TEMPLATES.find((t) => t.id === 'gk_ds') || TEMPLATES[0]).modules.map((m) => ({ subject: m.subject, count: m.count, refMin: m.refMin })))
const perQ = ref(60)            // 每题限时（秒），默认 60 秒（≤1分钟）
const aiCap = ref(0)            // 每板块题量：0=全量（按卷面模板/用户设定），>0=抽样上限（快速）
const genConcur = ref(3)        // 出卷并发度：并发出题请求数（视模型 API 限流调整）
const fastGenModel = ref(localStorage.getItem('xc_fast_gen_model') || '') // 出题快模型：填非思考模型名(如 deepseek-chat)，出题/预生成用它提速；留空=跟随文字模型
watch(fastGenModel, (v) => { try { localStorage.setItem('xc_fast_gen_model', String(v || '').trim()) } catch (e) {} })
const useFigGen = ref(localStorage.getItem('xc_use_fig_gen') === '1') // 出题用智谱快模型（复用图形增强配置）
watch(useFigGen, (v) => { try { localStorage.setItem('xc_use_fig_gen', v ? '1' : '0') } catch (e) {} })
// 出题/预生成/解析/质检统一取生成模型：智谱快模型 > 出题快模型名 > 文字模型
function pickGenC() {
  let c = activeCfg(false)
  if (!c || !c.key) return c
  const DEF_URL = { ds: 'https://api.deepseek.com/chat/completions', zhipu: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', sf: 'https://api.siliconflow.cn/v1/chat/completions', openai: 'https://api.openai.com/v1/chat/completions' }
  const withUrl = (o) => { if (!o || o.url) return o; return { ...o, url: DEF_URL[o.prov] || DEF_URL.ds } }
  const fig = store.cfg.fig
  if (useFigGen.value && fig && fig.key) return withUrl({ prov: fig.prov || 'zhipu', key: fig.key, url: fig.url, model: fig.model || 'glm-4.6-flash' })
  const fgm = String(fastGenModel.value || '').trim()
  if (fgm) c = { ...c, model: fgm }
  return withUrl(c)
}
const difficulty = ref('real') // 出题难度：默认真题级；可自由选 curve(智能曲线) / easy / mid / hard
const paperDir = ref('auto') // 组卷问法：auto=AI随机(是/非) / is=选是 / not=选非 / custom=自定义
const paperDirText = ref('')
const paperYtN = ref(5) // 一拖N：每组小题数（国考一拖5 / 江苏一拖2 可调）
const paperYtNGroup = ref(0) // 一拖N 分析推理组数：0=不加入 / 1 / 2
const DIFF_LABEL = { easy: '易', mid: '中', hard: '难', real: '真题级' }
const mixMode = ref('module')   // module=按模块顺序出卷（贴合真实卷面）；mix=混合打乱
const srcMode = ref(props.initialSrc || 'ai') // ai=AI智能出题 / import=导入材料 / wrong=错题集 / single=单题快练
const singleMode = ref(false) // 单题快练：不启动整卷计时、答后留在本题可再来一题
const singlePlate = ref('逻辑判断') // 单题快练·细分板块（默认逻辑判断）
const singleVariant = ref('不限') // 单题快练子题型（不限=自动轮换）
const singleBatch = ref(1) // 单题快练组量：1/5/10/15/20
const autoNext = ref(false) // 单题快练：答对自动进入下一题
const singleDir = ref('auto') // 问法方向：auto=随机 / is=选是 / not=选非 / custom=自定义
const tutuFormat = ref('auto') // 图推出题形式：auto=自动轮换 / 一组图 / 两组图 / 九宫格 / 分组分类
// 六大板块 → 细分板块 层级
const SIX_GROUPS = [
  { key: '判断推理', subs: ['图形推理', '定义判断', '类比推理', '逻辑判断'] },
  { key: '言语理解', subs: ['言语理解'] },
  { key: '数量关系', subs: ['数量关系'] },
  { key: '资料分析', subs: ['资料分析'] },
  { key: '常识判断', subs: ['常识判断'] },
  { key: '政治理论', subs: ['政治理论'] }
]
const singleGroup = ref((SIX_GROUPS.find((g) => g.subs.includes(singlePlate.value)) || SIX_GROUPS[0]).key)
const singlePlates = computed(() => (SIX_GROUPS.find((g) => g.key === singleGroup.value) || SIX_GROUPS[0]).subs)
const singleDirText = ref('')
// 按细分板块预置的问法库（题干自由问法）
const DIR_LIB = {
  '逻辑判断': ['最能削弱', '最能加强', '前提/假设', '不能推出', '最能解释'],
  '图形推理': ['填入问号处', '能由它折叠而成', '不可能是其截面', '符合三视图'],
  '定义判断': ['属于…的是', '不属于…的是'],
  '类比推理': ['逻辑关系最相似', '逻辑关系最不相似'],
  '言语理解': ['这段文字意在', '主旨是', '标题是', '接下来最可能'],
  '资料分析': ['能推出的是', '不能推出的是', '占…的比重约'],
  '数量关系': ['问…是多少', '至少/至多'],
  '常识判断': ['正确的是', '错误的是'],
  '政治理论': ['正确的是', '错误的是']
}
const dirLib = computed(() => DIR_LIB[singlePlate.value] || [])
function setDirText(t) { singleDirText.value = t; singleDir.value = 'custom' }
function onSingleGroup() {
  const subs = singlePlates.value
  if (!subs.includes(singlePlate.value)) { singlePlate.value = subs[0] }
  onSinglePlate()
}
const singleVars = computed(() => {
  const p = singlePlate.value
  if (p === '判断推理') return (SUB_VARIANTS['逻辑判断'] || []).filter((v) => v !== '一拖五') // 单题排除一拖五（组卷才支持）
  return SUB_VARIANTS[p] || []
})
function resolveDir(d) { if (d === 'is' || d === 'not') return d; return Math.random() < 0.5 ? 'is' : 'not' }
function dirHint(subject, dir, dirText) {
  if (dirText) return '\n【问法】本题问法：' + dirText + '（严格按此问法出题）。'
  if (subject === '定义判断' || subject === '图形推理' || subject === '空间重构') return ''
  return dir === 'is'
    ? '\n【问法】本题为选是题：问"下列属于/正确的是/符合的是/能推出的是"（非定义类按本板块惯例使用正向问法）。'
    : '\n【问法】本题为选非题：问"下列不属于/错误的是/不符合的是/不能推出的是"。'
}
const onlyPend = ref(false) // 错题组卷：只看未复盘
const byWrongCount = ref(false) // 错题组卷：按错次优先排序
try { const _sp = localStorage.getItem('xc_single_plate'); if (_sp && SUBJECTS.includes(_sp)) singlePlate.value = _sp } catch (e) {}
const wrongSel = ref([]) // 错题组卷板块多选（空=全部）
function toggleWrongSel(p) { const i = wrongSel.value.indexOf(p); if (i >= 0) wrongSel.value.splice(i, 1); else wrongSel.value.push(p) }
const wrongLimit = ref(0) // 错题组卷题量：0=全部
const wrongPlates = computed(() => { const s = new Set(); store.wqs.forEach((q) => { if (q.subject) s.add(q.subject) }); return [...s] })
const aiLayout = ref(false) // 导出前先 AI 智能排版（梳理考点/错因/秒杀规律）
// 导入识别后由「预览校对」界面统一决定去向（开始作答 / 存入错题本）
const srcTab = ref('template')  // 配置面板子页：template=卷面构成 / import=导入材料 / wrong=错题集
const imgs = ref([])
const textFiles = ref([])
const papers = ref([])
try { papers.value = JSON.parse(localStorage.getItem('xc_papers') || '[]') || [] } catch (e) {}
const results = ref([])
try { results.value = JSON.parse(localStorage.getItem('xc_paper_results') || '[]') || [] } catch (e) {}

const phase = ref('config') // config | extract | doing | result
const extracting = ref(false)
const previewList = ref([]) // 识别结果预览（导入校对）
const previewEdit = ref(-1)
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
const paperMode = ref(localStorage.getItem('xc_paper_mode') !== '0')
const savedWrongFlash = ref(false) // 错题入库成功闪绿反馈
function savePaperMode() { try { localStorage.setItem('xc_paper_mode', paperMode.value ? '1' : '0') } catch (e) {} }
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
const genStatus = ref('') // 当前出题阶段（生成中/质检中/第N次重出），让用户知道在等什么
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
const optHtmls = computed(() => (q.value && q.value.options ? q.value.options.map((o) => renderMd(String(o.t || ''))) : []))
const hasSvgOpts = computed(() => optHtmls.value.some((h) => /<svg/i.test(h)))
const qExplainHtml = computed(() => {
  const a = q.value ? q.value.explain || q.value.analysis || '' : ''
  return a ? renderMd(String(a)) : ''
})
watch([qHtml, qExplainHtml], () => { nextTick(() => { mountCharts(document.querySelector('.sim-q')); mountCharts(document.querySelector('.sim-explain')) }) })
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
    const parts = []
    let imaged = 0
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p)
      // ① 优先提取文本层（精度远高于 OCR）
      try {
        const tc = await page.getTextContent()
        const t = (tc.items || []).map((it) => it.str || '').join(' ').replace(/\s+/g, ' ').trim()
        if (t && t.length > 40) { parts.push('【第' + p + '页】' + t); continue }
      } catch (e) {}
      // ② 无文本层 → 转图 OCR
      const vp = page.getViewport({ scale: 2 })
      const canvas = document.createElement('canvas')
      canvas.width = vp.width
      canvas.height = vp.height
      const ctx = canvas.getContext('2d')
      await page.render({ canvasContext: ctx, viewport: vp }).promise
      imgs.value.push(canvas.toDataURL('image/jpeg', 0.85))
      imaged++
    }
    if (parts.length) {
      textFiles.value.push({ name: f.name, text: parts.join('\n') })
      showToast('✅ 已解析 PDF（文本层优先，' + pdf.numPages + ' 页，识别更准）' + (imaged ? '；' + imaged + ' 页无文本转图片' : ''), 'success')
    } else if (imaged) {
      showToast('✅ 已解析 PDF（无文本层，转为图片识别 ' + imaged + ' 页）', 'success')
    }
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

const VISION_SYS = '你是公考行测真题整理专家。请把图片/扫描件中的行测题目逐题、完整地提取出来（题干、选项 A-D、正确答案、解析如有）。要求：①每题独立一个对象；②题干与选项逐字保留，不改写不遗漏（含数字/图表数据/材料原文）；③按内容判断板块归属（判断推理/言语理解/数量关系/资料分析/常识判断/政治理论/图形推理/类比推理/定义判断/逻辑判断）；④材料题/大题按小题拆分；⑤识别不清的题目跳过、绝不编造。严格只输出 JSON 数组，不要多余文字。'
const VISION_PROMPT =
  '[{"no":1,"subject":"判断推理","stem":"题干原文","options":{"A":"...","B":"...","C":"...","D":"..."},"answer":"B","analysis":"解析(若有)"}]'
const TEXT_SYS =
  '你是公考行测真题整理专家。把下面的文本/题目逐题整理成 JSON 数组，每题含 no/subject/stem/options/answer/analysis。要求：①题干与选项完整保留（含数字/图表数据/材料原文）；②按内容判断板块归属；③材料题/大题按小题拆分；④识别不清跳过、不编造。严格只输出 JSON 数组。'

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
  const c = pickGenC()
  if (!c || !c.key) return
  try {
    const reply = await chatOnce(c, [{ role: 'system', content: TEXT_SYS }, { role: 'user', content: String(text).slice(0, 8000) }], 3000)
    const m = String(reply || '').match(/\[[\s\S]*\]/)
    return m ? norm(JSON.parse(m[0])) : []
  } catch (e) { return [] }
}
function buildWrongQuestions() {
  let src = store.wqs.slice()
  if (onlyPend.value) src = src.filter((q) => !(q.reviewed || q.digested))
  if (byWrongCount.value) src = src.sort((a, b) => (b.wrongCount || 0) - (a.wrongCount || 0))
  const list = []
  src.forEach((wq) => {
    if (wrongSel.value.length && !wrongSel.value.includes(wq.subject)) return
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
  previewList.value = all
  phase.value = 'preview'
  showToast('✅ 识别出 ' + all.length + ' 题，请预览校对后「开始作答」或「存入错题本」', 'success')
  // 识别完成 → 进入预览校对（由预览界面决定「开始作答 / 存入错题本」）
}

// ===== 出卷与作答 =====
function start() {
  // 单题快练：无条件立刻进入「出题等待界面」；Key 缺失在等待界面内明确提示（出题用的是文字模型，勿用视觉模型前置拦截）
  if (srcMode.value === 'single') { startSingle(); return }
  const c = activeCfg(srcMode.value === 'ai' ? false : true)
  if (!c || !c.key) {
    showToast('请先在设置配置' + (srcMode.value === 'ai' ? '文字' : '视觉/文字') + '模型 API Key', 'error')
    return
  }
  if (srcMode.value === 'import') { doExtract(); return }
  if (srcMode.value === 'wrong') {
    let wqList = buildWrongQuestions()
    if (wrongLimit.value > 0) wqList = wqList.slice(0, wrongLimit.value)
    const qs = applyConfig(wqList)
    if (!qs.length) { showToast('所选板块暂无错题，请先收纳错题', 'info'); return }
    const p = makePaper('错题智能组卷', qs)
    papers.value.unshift(p); savePapers()
    startPaper(p)
    return
  }
  startAi()
}
// AI 智能出题：按卷面构成每个板块生成 min(count, aiCap) 题，预生成（并发2）并展示进度/预计剩余时间
// 组卷规则引擎：判断推理大类自动展开为 4 子板块（避免只出逻辑题），保证题型轮换覆盖全类
function expandModules(list) {
  const out = []
  ;(list || []).forEach((m) => {
    if (m.subject === '判断推理') {
      const subs = ['图形推理', '定义判断', '类比推理', '逻辑判断']
      const n = Math.max(1, m.count || 1)
      const base = Math.floor(n / subs.length), rem = n % subs.length
      const ref = Math.max(3, Math.round((m.refMin || 20) / subs.length))
      subs.forEach((s, i) => { out.push({ subject: s, count: base + (i < rem ? 1 : 0), refMin: ref }) })
    } else out.push({ ...m })
  })
  return out
}
function resolvePaperDir() {
  if (paperDir.value === 'is' || paperDir.value === 'not') return paperDir.value
  if (paperDir.value === 'custom') return 'custom'
  return resolveDir('auto')
}
function startAi() {
  const plan = []
  let total = 0
  const modN = (m) => (aiCap.value > 0 ? Math.max(1, Math.min(m.count || 1, aiCap.value)) : Math.max(1, m.count || 1))
  const exp = expandModules(modules.value)
  exp.forEach((m) => { total += modN(m) })
  let gi = 0
  let gid = 0
  exp.forEach((m) => {
    const n = modN(m)
    const vars = SUB_VARIANTS[m.subject] || []
    if (m.subject === '资料分析') {
      // 真题卷面：一篇材料配 5 题（最后一组可不足），材料形式轮换；组内题型递进
      const groups = []
      for (let i = 0; i < n; i += 5) groups.push(Math.min(5, n - i))
      groups.forEach((gn) => {
        for (let k = 0; k < gn; k++) {
          const d = difficulty.value === 'curve' ? diffCurve(gi, total) : difficulty.value
          const variant = k === gn - 1 ? '综合分析' : (['基期/现期', '增长率', '增长量', '比重', '平均数', '倍数', '隔年增长', '年均增长', '混合增长率', '拉动增长/贡献率'][k % 6])
          plan.push({
            subject: '资料分析', difficulty: d, variant, dir: resolvePaperDir(), dirText: paperDir.value === 'custom' ? paperDirText.value.trim() : '', group: true, groupId: gid, groupN: gn,
            groupLeader: k === 0, matType: ['text', 'table', 'mixed', 'chart'][gid % 4],
            stem: null, options: [], answer: '', explain: '', picked: null, correct: null, timeout: false, err: false
          })
          gi++
        }
        gid++
      })
      return
    }
    // 预分配题型（同板块内轮换，单题题型；一拖N 分析推理单独追加，见末尾）
    const slots = []
    for (let i = 0; i < n; i++) {
      const v = vars.length ? vars[i % vars.length] : ''
      slots.push({ v })
    }
    slots.forEach((s) => {
      const d = difficulty.value === 'curve' ? diffCurve(gi, total) : difficulty.value
      plan.push({ subject: m.subject, difficulty: d, variant: s.v, dir: resolvePaperDir(), dirText: paperDir.value === 'custom' ? paperDirText.value.trim() : '', stem: null, options: [], answer: '', explain: '', picked: null, correct: null, timeout: false, err: false })
      gi++
    })
  })
  // 一拖N 分析推理组：独立于题型轮换（每组 N 小题，属分析推理综合推演）
  const ytGroups = Math.max(0, Math.min(2, paperYtNGroup.value || 0))
  for (let g = 0; g < ytGroups; g++) {
    const gn = Math.max(2, Math.min(5, paperYtN.value || 5))
    for (let k = 0; k < gn; k++) {
      const d = difficulty.value === 'curve' ? diffCurve(gi, total) : difficulty.value
      plan.push({
        subject: '逻辑判断', difficulty: d, variant: '一拖五', group: true, groupId: gid, groupN: gn,
        groupLeader: k === 0,
        stem: null, options: [], answer: '', explain: '', picked: null, correct: null, timeout: false, err: false
      })
      gi++
    }
    gid++
  }
  if (!plan.length) { showToast('请先配置卷面（至少一个板块）', 'info'); return }
  const paper = makePaper('智能模拟卷 · ' + selTmpl.value.name, plan)
  papers.value.unshift(paper); savePapers()
  genAll(paper)
}
// 预生成所有题目：并发 2，进度条 + 预计剩余时间（用户可随时取消）
const readyAsk = ref(false) // 组卷出完，等用户确认开考
let readyPaper = null
function readyStart() {
  readyAsk.value = false
  const p = readyPaper
  readyPaper = null
  if (p) startPaper(p)
}
function readyBack() {
  readyAsk.value = false
  readyPaper = null
  phase.value = 'config'
  questions.value = []
  clearTimers()
}
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
  const CONC = Math.max(1, Math.min(4, genConcur.value || 3))
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
    const firstErr = questions.value.find((q) => q.err && q.stem)
    let reason = firstErr ? String(firstErr.stem).replace(/^[（(]出题失败[：:]\s*/, '').slice(0, 160) : ''
    if (reason.includes('未配置模型')) reason = '未配置文字模型，请到设置填 Key'
    showToast('出题失败：' + (reason || '请检查模型 Key 或网络'), 'error')
    return
  }
  if (singleMode.value) {
    questions.value.forEach((qq) => { if (qq && qq.stem && !qq.err) addToQuizCol(qq) })
    if (questions.value.length === 1) prefetchSingle()
  }
  if (singleMode.value && questions.value.length === 1) {
    // 单题快练：出完直接开考（不打断节奏）
    startPaper(paper)
  } else {
    // 组卷/多题组：等用户点「是」才开考与计时
    readyPaper = paper
    readyAsk.value = true
  }
  showToast('✅ 出卷完成，共 ' + questions.value.length + ' 题' + (genErrCount.value ? '（' + genErrCount.value + ' 题失败已跳过）' : ''), 'success')
}
function saveFastGenModel() { try { localStorage.setItem('xc_fast_gen_model', String(fastGenModel.value || '').trim()) } catch (e) {} }
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
function buildSingleItems() {
  const diff = difficulty.value === 'curve' ? 'mid' : difficulty.value
  const fixedVar = singleVariant.value === '不限' ? '' : singleVariant.value
  const vars = singleVars.value
  const batch = Math.max(1, Math.min(20, singleBatch.value || 1))
  const items = []
  for (let i = 0; i < batch; i++) {
    const v = fixedVar || (vars.length ? vars[i % vars.length] : '')
    const dir = singleDir.value === 'auto' ? resolveDir('auto') : singleDir.value
    const dirText = singleDir.value === 'custom' ? singleDirText.value.trim() : ''
    items.push({ subject: singlePlate.value, difficulty: diff, variant: v, dir, dirText, stem: null, options: [], answer: '', explain: '', picked: null, correct: null, timeout: false, err: false })
  }
  return items
}
function startSingle() {
  try { localStorage.setItem('xc_single_plate', singlePlate.value) } catch (e) {}
  singleMode.value = true
  const items = buildSingleItems()
  const batch = items.length
  const paper = makePaper('单题快练 · ' + singlePlate.value + (batch > 1 ? '（' + batch + ' 题组）' : ''), items)
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
  // 首题后台预生成解析（读题时并行）
  const q0 = questions.value[0]
  if (q0 && q0.stem && !q0.err) maybeEnhance(0)
  if (!singleMode.value || questions.value.length > 1) {
    timers.t = setInterval(() => {
      totalElapsed.value++
      // 组卷：考试倒计时递减到 0 交卷；单题批量：只累计总用时（自由练习，不倒计时交卷）
      if (!singleMode.value) {
        totalLeft.value--
        if (totalLeft.value <= 0) finish()
      }
    }, 1000)
  }
  timers.q = setInterval(() => {
    // 答完当前题：冻结本题计时（不再递减），本题用时已记录
    if (marks.value[cur.value] != null) return
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
  marks.value[i] = { ok: false, pick: '', timeout: true, usedSec: perQ.value }
  showToast('⏰ 本题超时（' + perQ.value + ' 秒），已按答错计', 'error')
  if (singleMode.value) { qLeft.value = perQ.value; qElapsed.value = 0 } else nextQ()
}
// 核心出题：生成第 i 题（含题型轮换），供预生成/单题/重出共用
async function genOne(i) {
  const item = questions.value[i]
  if (!item || item.stem) return
  if (item.fromWrong) return
  if (item.group && !item.groupLeader) return // 占位：由组首生成后统一填充
  const c = pickGenC()
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
      const ask = (isZL
        ? '请为【资料分析】出一篇完整材料 + ' + gn + ' 道题（材料形式：' + matTypeName + '，第' + gn + '题为综合分析题，前 ' + (gn - 1) + ' 题考点递进）。'
        : '请为【逻辑判断】出一套「一拖' + gn + '」题组（1 个共用材料 + ' + gn + ' 道小题，小题可在不违背总题干逻辑的前提下新增附加条件）。') +
        '【本次输出要求（提速，必须遵守）】只输出 材料 + ' + gn + ' 道小题的题干/选项/答案：### 📄 材料 → ### 第1题（题干 + A./B./C./D. 四选项 + 单独一行【正确答案】X）→ ### 第2题…；不要输出解析/考点/秒杀/命题人设计说明（这些稍后按需单独生成）。材料与各题数据必须自洽、可互相验算。'
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
            slot.variant = slot.variant || (isZL ? (k === gn - 1 ? '综合分析' : ['基期/现期', '增长率', '增长量', '比重', '平均数', '倍数', '隔年增长', '年均增长', '混合增长率', '拉动增长/贡献率'][k % 6]) : '分析推理')
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
    const dir = item.dir || resolveDir('auto')
    const dh = dirHint(item.subject, dir, item.dirText)
    const fmtHint = (item.subject === '图形推理' && singleMode.value && tutuFormat.value && tutuFormat.value !== 'auto') ? '本题出题形式固定为【' + tutuFormat.value + '】，请严格按【图形推理】子命题人的「SVG 布局铁律」中该形式的画布尺寸与格子布局出图。' : ''
    const ask = (variant ? '请为【' + item.subject + '】出一道' + variant + '仿真模拟题（本题型：' + variant + '）。' : '请为【' + item.subject + '】出一道仿真模拟题。') + dh +
      '【本次输出要求（提速，必须遵守）】只输出：题干 + 4 个选项（A./B./C./D.）+ 单独一行【正确答案】X' +
      (item.subject === '逻辑判断' && variant === '真假话' ? ' + 末尾【验证数据】JSON' : '') +
      '。不要输出解析/考点/秒杀/难度自评/命题人设计说明（这些稍后由系统单独生成，你这次只出题）。' + fmtHint
    const msgs = [{ role: 'system', content: sys }, { role: 'user', content: ask }]
    let reply
    if (singleMode.value && questions.value.length === 1) {
      // 单题：流式生成，题干边出边显示
      genLive.value = ''
      reply = await chatStream(msgs, c, (d) => { if (d && d.text) genLive.value = liveVisible(d.text) }, null, 150000)
      genLive.value = liveVisible(reply || '')
    } else {
      reply = await chatOnce(c, msgs, 6000)
    }
    const extractVerifyData = (text) => {
      const m = String(text || '').match(/【验证数据】\s*(\{[\s\S]*?\})/)
      if (!m) return null
      try { return JSON.parse(m[1]) } catch (e) { return null }
    }
    // 出题质检：本地校验(4选项) → 真假话程序真值表硬校验 → 严格质检，最多重试 3 次
    let qz = null
    let raw = reply || '' // 最近一次模型输出原文
    let fixHint = '' // 质检未通过原因 → 下一轮定向修正（减少盲目重出、更快成功）
    let ttVerified = false // 真假话已过程序真值表硬校验（比 AI 质检更强，免二次 AI 质检）
    let lastParsed = null // 解析成功的题先记下，作为放宽兜底（避免 AI 质检过严反复“多次重出”）
    const stage = (attempt, label) => { genStatus.value = (attempt > 0 ? '第 ' + (attempt + 1) + ' 次重出 · ' : '') + label }
    for (let attempt = 0; attempt < 3 && !qz; attempt++) {
      stage(attempt, 'AI 生成中…')
      let cur = attempt === 0 ? parseQuiz(raw) : null
      if (!cur || !cur.options || cur.options.length < 4) {
        // 网络/Key 错误直接抛出（外层显示真实原因），不盲目重试；质检不过则带原因定向重出
        try { raw = await chatOnce(c, fixHint ? [{ role: 'system', content: sys }, { role: 'user', content: ask + fixHint }] : msgs, 6000, 90000) } catch (e) { throw e }
        cur = parseQuiz(raw)
      }
      if (!cur || !cur.options || cur.options.length < 4) { fixHint = '。上一版格式不合格：必须输出题干 + 4 个选项（A./B./C./D.）+ 单独一行【正确答案】X，（解析/设计说明本次不需要，稍后单独生成）'; continue }
      lastParsed = cur // 解析成功即记下，供放宽兜底
      if ((variant === '真假话' || String(raw).includes('【验证数据】')) && item.subject === '逻辑判断') {
        stage(attempt, '真值表硬校验中…')
        const vd = extractVerifyData(raw)
        const vt = vd ? verifyTruthTable(vd) : null
        if (!vt || !vt.ok) { fixHint = '。上一版真值表校验未通过（' + (vt ? vt.reason : '缺少【验证数据】JSON') + '）：请重设条件/选项，使 2^n 枚举恰一组满足题设真假数、且恰一个选项对应唯一解，并在输出末尾附【验证数据】JSON'; continue }
        ttVerified = true
      }
      if (store.cfg.strictGen && !ttVerified) {
        stage(attempt, 'AI 质检中…')
        const vq = await verifyQuestion(cur)
        if (!vq) { fixHint = '。上一版未过 AI 质检（题干自洽/唯一解/恰一正确/无逻辑谬误）：请按反馈修正后重出'; continue }
      }
      qz = cur
    }
    if (!qz && lastParsed && variant !== '真假话') qz = lastParsed // 放宽兜底：只要题干+4选项+答案解析成功就收下，避免卡死在“多次重出”
    if (qz && qz.options && qz.options.length >= 4) {
      item.stem = qz.stem
      item.options = qz.options
      item.answer = qz.answer
      item.explain = qz.explain || ''
      item.designer = qz.designer || ''
      item.variant = variant
    } else {
      item.stem = '（本题目 AI 生成多次未通过质检，可点「重出」重试）'
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
  const c = pickGenC()
  if (!c || !c.key) return
  const dir = singleDir.value === 'auto' ? resolveDir('auto') : singleDir.value
  const dirText = singleDir.value === 'custom' ? singleDirText.value.trim() : ''
  const item = { subject: plate, difficulty: diff, variant, dir, dirText, stem: null, options: [], answer: '', explain: '', picked: null, correct: null, timeout: false, err: false }
  try {
    const sys = buildTaskSys('quiz', { plate, difficulty: diff, variant })
    const ask = (variant ? '请为【' + plate + '】出一道' + variant + '仿真模拟题（本题型：' + variant + '）。' : '请为【' + plate + '】出一道仿真模拟题。') + dirHint(plate, dir, dirText)
    const reply = await chatOnce(c, [{ role: 'system', content: sys }, { role: 'user', content: ask }], 6000)
    const qz = parseQuiz(reply)
    if (qz && qz.options && qz.options.length >= 4) prefetchQ.value = { item: { ...item, stem: qz.stem, options: qz.options, answer: qz.answer, explain: qz.explain || '', designer: qz.designer || '' }, plate, difficulty: diff, variant }
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
    if (item && item.stem && !item.err) addToQuizCol(item)
    startPaper(paper)
    prefetchSingle()
    return
  }
  prefetchQ.value = null
  singlePlate.value = curPlate
  singleVariant.value = curVar === '' ? '不限' : curVar
  const items = buildSingleItems()
  const paper = makePaper('单题快练 · ' + curPlate + (items.length > 1 ? '（' + items.length + ' 题组）' : ''), items)
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
  marks.value[i] = { ok: k === qq.answer, pick: k, usedSec: qElapsed.value }
  maybeEnhance(i)
  if (qq.answer && k === qq.answer) { if (autoNext.value && i < questions.value.length - 1) { setTimeout(() => nextQ(), 500); return } } else if (qq.answer) showToast('❌ 选错了，正确答案是 ' + qq.answer, 'error')
}
function selfMark(ok) {
  const i = cur.value
  if (marks.value[i] != null) return
  marks.value[i] = { ok, pick: '', self: true, usedSec: qElapsed.value }
  maybeEnhance(i)
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
  // 后台预生成解析：题目已出时立即开始，用户读题/作答期间解析已备好，答完秒出（答前不显示，不剧透）
  const gIt = questions.value[i]
  if (gIt && gIt.stem && !gIt.err) maybeEnhance(i)
}
function nextQ() {
  if (cur.value < questions.value.length - 1) { go(cur.value + 1) } else finish()
}
function prevQ() { if (cur.value > 0) go(cur.value - 1) }
const finishAsk = ref(false) // 提前交卷确认弹窗
const finishMissing = computed(() => questions.value.map((qq, i) => (marks.value[i] == null ? i + 1 : null)).filter((x) => x != null))
function askFinish() {
  const miss = finishMissing.value
  if (!miss.length) { finish(); return }
  finishAsk.value = true
}
function confirmFinish() { finishAsk.value = false; finish() }
function finish() {
  clearTimers()
  questions.value.forEach((qq, i) => {
    if (marks.value[i] == null) marks.value[i] = { ok: false, pick: '', timeout: false, blank: true }
  })
  if (singleMode.value) questions.value.forEach((qq, i) => updateQuizColResult(qq, !!(marks.value[i] && marks.value[i].ok)))
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
// 出题严格质检：二次验证 题干自洽/唯一解/恰一正确（开启 strictGen 时对每道生成题执行）
async function verifyQuestion(q) {
  const c = pickGenC()
  if (!c || !c.key) return
  try {
    const sys = '你是公考行测出题质检员。检查下面这道题：①题干条件是否自洽、能否推出唯一解；②是否恰好一个正确选项（禁止多选、无正确选项、两选项同真、选项全对）；③选项与题干相关、无逻辑谬误。只回复 JSON：{"ok":true} 或 {"ok":false,"reason":"..."}'
    const user = '题干：' + String(q.stem || '') + '\n选项：' + (q.options || []).map((o) => o.k + '. ' + o.t).join('\n') + '\n答案：' + String(q.answer || '')
    const r = await chatOnce(c, [{ role: 'system', content: sys }, { role: 'user', content: user }], 400)
    const m = String(r || '').match(/"ok"\s*:\s*(true|false)/)
    return m ? m[1] === 'true' : true
  } catch (e) { return true }
}
// ===== AI 深度解析：导入/错题的解析太简单时，走「名师讲解」路径补全（同对话回复逻辑） =====
async function enhanceExplain(q) {
  const c = pickGenC()
  if (!c || !c.key || !q) return
  q.aiEnhancing = true
  q.explain = '' // 流式显示解析：像对话回复一样逐字出现，不等全文
  try {
    const sys = '你是公考行测名师。把下面这道题讲透，按此结构用 Markdown 输出：\n1. 【题型判定】一句话。\n2. 【名师方法论分步】用对应板块名师方法分步讲解（逻辑判断=薛睿五步法+13美丑、言语=郭熙×花生十三×张弓、图形推理=薛睿24诀（特征信号定大类→逐诀验证→末图验证）、数量关系·几何=薛睿24诀图形思维+作辅助线、定义=LY四步破题、类比=LY三步定位、资料=小P四大神器、数量=小P四层金字塔、常识/政治=小黑口诀）。\n3. 【正确项剖析】说明正确项依据/力度/公式，为什么对。\n4. 【干扰项逐项】每个错误选项点名陷阱（偷换/以偏概全/时间单位基数/缺要件等），为什么错。\n5. 【陷阱提示 + ⚡秒杀规律】一句话真正能提速的。\n6. 【📌 高效复盘指引】一句话还原考点结构 + 做对/做错本题最该做的一件事 + 2-3条错因自查 + 巩固动作。语言具体，不空泛。\n7. 【🧠 命题人设计说明】单独一段：本题出题意图 + 3 个干扰项各用哪种陷阱设计（逐项点名）+ 反套路/难度设计点 + 用本板块名师方法一句话快速破题。100-200字。\n【平面图解析画图铁律（图形推理 / 数量几何必守）】① 先点明本题用哪条规律/哪个诀（如"第X诀·点线面数量""第X诀·对称轴"），再讲怎么看出来的；② 凡需要看图才懂的，必须用 ```svg 代码块重绘题干原图，并在原图上直接标注：辅助线 / 箭头 / 高亮框 / 虚线对称轴 / 圈出变化元素（用不同颜色区分），像考生在纸上二次做笔记一样，让规律"一眼可见"；③ SVG 画布尺寸与题干同风格（图推 620x140 / 九宫格 420x420 / 选项 180x140）；立体题（空间重构/截面图/三视图/立体拼合）按等轴测画法重绘（立方体三面亮中暗填色、平行棱平行、遮挡虚线），保持立体感，禁止只写文字不画图。\n【输出铁律】直接从 1.【题型判定】 开始输出正文，严禁任何开场白/客套话/自我描述/复述指令（禁止"好的""收到""明白""作为公考行测名师，我将…"等开头），不要重复用户题干，直接开讲。'
    const user = '【题干】' + String(q.stem || '') + '\n【选项】' + (q.options || []).map((o) => o.k + '. ' + o.t).join('\n') + '\n【正确答案】' + String(q.answer || '')
    const reply = await chatStream([{ role: 'system', content: sys }, { role: 'user', content: user }], c, (d) => {
      // 流式：边生成边写入 q.explain，用户立即看到解析逐字出现（与对话回复一致）
      const t = d && d.text ? String(d.text) : ''
      if (!t) return
      let sc = t
      const tp = sc.search(/题型判定/)
      if (tp > 0) sc = sc.slice(sc.lastIndexOf('\n', tp) + 1)
      q.explain = sc
    }, null, 150000)
    if (reply && reply.length > 20) {
      let explain = String(reply || '')
      // 兜底裁掉模型开场白（"好的/收到/作为名师我将…"等），从第一个【题型判定】所在行开始
      const tpidx = explain.search(/题型判定/)
      if (tpidx > 0) {
        const lineStart = explain.lastIndexOf('\n', tpidx) + 1
        explain = explain.slice(lineStart)
      }
      const dm = String(explain).match(/(?:^|\n)\s*#{0,6}\s*[^\n]*命题人设计说明[^\n]*\n?([\s\S]*)$/)
      if (dm) { q.designer = dm[1].trim(); explain = explain.slice(0, dm.index).trim() }
      q.explain = explain
      q.aiEnhanced = true
    }
  } catch (e) {
    // 解析失败不再静默：明确提示，用户可点「生成名师深度解析」重试
    showToast('解析生成失败：' + ((e && e.message) || '未知错误') + '，可点击重试', 'error')
  }
  q.aiEnhancing = false
}
// 命题人设计说明：解析里没拆到 / 旧题没存时，按需补生成（保证高质量且不丢失）
async function genDesigner(q) {
  const c = pickGenC()
  if (!c || !c.key || !q || q.designer) return
  q.designerLoading = true
  try {
    const sys = '你是公考命题专家。用 100-200 字讲清这道题的设计意图，只输出正文（不要标题）：①出题意图（考什么考点、为什么这么考、对应真题特征）②3 个干扰项各用哪种陷阱设计（逐项点名，如偷换概念/以偏概全/时间口径/因果倒置等）③反套路/难度设计点 ④用本板块名师方法一句话快速破题。语言具体、像真命题人自述。【输出铁律】直接从①开始，严禁"好的/收到/作为命题专家我将…"等开场白。'
    const user = '【题干】' + String(q.stem || '') + '\n【选项】' + (q.options || []).map((o) => o.k + '. ' + o.t).join('\n') + '\n【正确答案】' + String(q.answer || '')
    const reply = await chatOnce(c, [{ role: 'system', content: sys }, { role: 'user', content: user }], 800)
    if (reply && String(reply).trim().length > 20) q.designer = String(reply).trim()
  } catch (e) {}
  q.designerLoading = false
}
function openDesigner() {
  const qq = questions.value[cur.value]
  if (!qq) return
  if (qq.designer) { designerShow.value = true; return }
  if (qq.designerLoading) return
  genDesigner(qq).then(() => { designerShow.value = true })
}
function maybeEnhance(i) {
  const q = questions.value[i]
  if (!q || q.aiEnhanced || q.aiEnhancing) return
  if (String(q.explain || '').replace(/#/g, '').trim().length >= 40) return
  enhanceExplain(q)
}
function saveWrongs() {
  const wrongs = questions.value.filter((qq, i) => marks.value[i] && !marks.value[i].ok)
  if (!wrongs.length) { showToast('👍 当前没有答错的题，无需入库', 'success'); return }
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
  savedWrongFlash.value = true
  setTimeout(() => { savedWrongFlash.value = false }, 1600)
}
// ===== 导入识别结果预览校对 =====
function startPreviewExam() {
  const qs = previewList.value.filter((q) => q.stem)
  if (!qs.length) { showToast('没有可用的题目', 'info'); return }
  const paper = makePaper('导入组卷 ' + new Date().toLocaleDateString(), applyConfig(qs))
  papers.value.unshift(paper); savePapers()
  startPaper(paper)
}
function savePreviewToWrong() {
  const qs = previewList.value.filter((q) => q.stem)
  if (!qs.length) { showToast('没有可用的题目', 'info'); return }
  const before = store.wqs.length
  qs.forEach((q) => {
    const key = String(q.stem || '').slice(0, 40)
    if (!store.wqs.some((w) => String(w.question || '').slice(0, 40) === key)) {
      store.wqs.unshift({
        id: Date.now() + Math.random(), subject: q.subject || '未分类',
        question: q.stem + '\n\n' + (q.options || []).map((o) => o.k + '. ' + o.t).join('\n'),
        answer: '正确答案 ' + (q.answer || ''), reasons: ['导入习题集'],
        time: new Date().toLocaleString(), at: Date.now(), wrongCount: 0, correctStreak: 0, mastery: 0, digested: false
      })
    }
  })
  saveWqs()
  showToast('✅ 已存入错题本 ' + (store.wqs.length - before) + ' 题', 'success')
}
function delPreview(i) { previewList.value.splice(i, 1) }
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
  if (phase.value === 'doing' || phase.value === 'result' || phase.value === 'preview') backToConfig()
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
onMounted(() => {
  if (props.initialPaper && props.initialPaper.questions && props.initialPaper.questions.length) {
    const p = props.initialPaper
    if (!papers.value.some((x) => x.id === p.id)) { papers.value.unshift(p); savePapers() }
    setTimeout(() => startPaper(p), 50)
  }
})
function onSinglePlate() {
  const vs = singleVars.value
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
  <div class="ov show sim-ov" :class="{ 'single-imm': singleMode && phase === 'doing' }" @click.self="cancel()">
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

        <div v-if="srcMode === 'ai'" class="ep-block">
          <div class="ep-block-hd">📐 卷面构成（国考/省考模板，均可自由编辑）</div>
          <div class="ep-note">💡 全真模考：按国考/省考模板题量与时限整卷组题，考点/题型自动轮换，出完直接开考计时。</div>
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
          <div class="ep-param">
            <label>出题快模型（提速）</label>
            <input v-model="fastGenModel" class="pv-edit" style="margin-top: 6px" placeholder="留空=跟随文字模型；填 deepseek-chat 等非思考模型名，出题/预生成用它，比思考模型(v4-flash)快很多（需与文字模型同一服务商/Key）" @change="saveFastGenModel()" />
            <span class="ep-hint">为什么：v4-flash 是思考模型，每次出题先想一大段再作答；deepseek-chat 直接作答。出题用快的、对话/解析用质量高的。</span>
          </div>
          <div class="ep-param">
            <label><input v-model="useFigGen" type="checkbox" /> 🚀 出题用智谱快模型（图形增强里配置的 GLM）</label>
            <span class="ep-hint">出题/预生成/解析/质检都用智谱 GLM（非思考、快）；智谱 Key 在「设置 → 图形增强」里填。此项优先于「出题快模型」。</span>
          </div>
          <div v-if="srcMode === 'ai'" class="ep-param">
            <label>每板块题量</label>
            <select v-model="aiCap" class="tb-sel">
              <option :value="0">全量（严格按卷面模板题量）</option>
              <option :value="3">抽样 3 题/板块（快测）</option>
              <option :value="5">抽样 5 题/板块</option>
              <option :value="10">抽样 10 题/板块</option>
            </select>
            <span class="ep-hint">全量=按所选国考/省考模板题量出题（如国考副省 135 题）；抽样用于快速体验，题量与模板不符</span>
          </div>
          <div v-if="srcMode === 'ai'" class="ep-param">
            <label>出卷并发度</label>
            <select v-model="genConcur" class="tb-sel">
              <option :value="2">2 路并发（稳妥）</option>
              <option :value="3">3 路并发（推荐）</option>
              <option :value="4">4 路并发（最快，需 API 支持）</option>
            </select>
            <span class="ep-hint">并发出题请求数，越高整卷出得越快；若模型 API 频繁报限流/超时，请调低</span>
          </div>
          <div v-if="srcMode !== 'single'" class="ep-param">
            <label>出卷顺序</label>
            <select v-model="mixMode" class="tb-sel">
              <option value="module">按板块顺序（贴近真实卷）</option>
              <option value="mix">混合打乱</option>
            </select>
          </div>
          <div v-if="srcMode === 'ai'" class="ep-param">
            <label>问法（整卷统一）</label>
            <select v-model="paperDir" class="tb-sel">
              <option value="auto">AI 随机（是/非 自由）</option>
              <option value="is">选是题（正确的是/属于/能推出）</option>
              <option value="not">选非题（错误的是/不属于/不能推出）</option>
              <option value="custom">自定义问法</option>
            </select>
            <input v-if="paperDir === 'custom'" v-model="paperDirText" class="pv-edit" style="margin-top: 6px" placeholder="输入整卷统一问法，如：最能削弱上述结论？" />
            <span class="ep-hint">整卷每题按此问法出题；auto=AI 自由随机 是/非；自定义问法全卷统一</span>
          </div>
          <div v-if="srcMode === 'ai'" class="ep-param">
            <label>一拖N 分析推理组（逻辑判断）</label>
            <select v-model="paperYtNGroup" class="tb-sel">
              <option :value="0">不加入（默认）</option>
              <option :value="1">1 组</option>
              <option :value="2">2 组</option>
            </select>
            <label style="margin-top: 6px">每组题数</label>
            <select v-model="paperYtN" class="tb-sel">
              <option :value="2">一拖2（江苏考情）</option>
              <option :value="3">一拖3</option>
              <option :value="4">一拖4</option>
              <option :value="5">一拖5（国考地市/执法）</option>
            </select>
            <span class="ep-hint">一拖N = 1 个共用题干 + N 个分析推理小题（属分析推理综合推演，独立于削弱/加强等题型）；小题可在不违背总题干逻辑的前提下新增附加条件</span>
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
            <span class="ep-hint">已接入「命题专家」规范：考点先行·干扰项错因·唯一解自检</span>
          </div>
          <div class="ep-param">
            <label>
              <input v-model="store.cfg.strictGen" type="checkbox" @change="saveCfg()" />
              出题严格质检（生成后二次验证 唯一解/恰一正确/无逻辑谬误，更稳但略慢）
            </label>
          </div>
        </div>

        <div v-if="srcMode === 'single'" class="ep-block">
          <div class="ep-block-hd">⚡ 单题快练</div>
          <div class="ep-note">💡 专项速刷 · 五层配置：六大板块 → 细分板块 → 题型 → 问法 → 组量，碎片时间快速突破。</div>
          <div class="ep-param">
            <label>① 六大板块</label>
            <select v-model="singleGroup" class="tb-sel" @change="onSingleGroup()">
              <option v-for="g in SIX_GROUPS" :key="g.key" :value="g.key">{{ g.key }}</option>
            </select>
          </div>
          <div class="ep-param">
            <label>② 细分板块</label>
            <select v-model="singlePlate" class="tb-sel" @change="onSinglePlate()">
              <option v-for="s in singlePlates" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
          <div class="ep-param">
            <label>③ 题型</label>
            <select v-model="singleVariant" class="tb-sel">
              <option value="不限">不限（自动轮换）</option>
              <option v-for="v in singleVars" :key="v" :value="v">{{ v }}</option>
            </select>
            <span class="ep-hint">该细分板块下的子题型，由对应「子命题人」精准出题</span>
          </div>
          <div class="ep-param">
            <label>④ 问法</label>
            <select v-model="singleDir" class="tb-sel">
              <option value="auto">AI 自由随机（是/非）</option>
              <option value="is">选是题（正确的是 / 属于 / 能推出）</option>
              <option value="not">选非题（错误的是 / 不属于 / 不能推出）</option>
              <option value="custom">自定义问法</option>
            </select>
            <input v-if="singleDir === 'custom'" v-model="singleDirText" class="pv-edit" style="margin-top: 6px" placeholder="输入自定义问法，如：最能削弱上述结论？" />
            <div v-if="dirLib.length" class="ep-chips" style="margin-top: 6px">
              <button v-for="q in dirLib" :key="q" class="fp-b" @click="setDirText(q)">{{ q }}</button>
            </div>
            <span class="ep-hint">不同板块题干可自由问法（如判断推理：最能削弱 / 最不能 / 前提假设…），点上面快捷问法或自定义</span>
          </div>
          <div class="ep-param">
            <label>⑤ 组量</label>
            <select v-model="singleBatch" class="tb-sel">
              <option :value="1">1 题（单题）</option>
              <option :value="5">5 题一组</option>
              <option :value="10">10 题一组</option>
              <option :value="15">15 题一组</option>
              <option :value="20">20 题一组</option>
            </select>
            <span class="ep-hint">组内逐题作答，做完自动批改，可「再来一组」</span>
          </div>
          <div v-if="singlePlate === '图形推理'" class="ep-param">
            <label>⑥ 出题形式</label>
            <select v-model="tutuFormat" class="tb-sel">
              <option value="auto">不限（自动轮换）</option>
              <option value="一组图">一组图（5图+问号）</option>
              <option value="两组图">两组图（类比式）</option>
              <option value="九宫格">九宫格（3×3）</option>
              <option value="分组分类">分组分类（6图）</option>
            </select>
            <span class="ep-hint">固定某种图推出题形式；「不限」= 一组图/两组图/九宫格/分组分类 自动轮换</span>
          </div>
          <div class="ep-param">
            <label>
              <input v-model="autoNext" type="checkbox" />
              答对自动进入下一题（批量模式连刷更流畅）
            </label>
          </div>
        </div>

        <div v-if="srcMode === 'import'" class="ep-block">
          <div class="ep-block-hd">📂 题目材料（图片 / PDF / Word / txt / tex）</div>
          <div class="ep-src-row" style="margin-top: 0">
            <label class="btn btn-pri" style="cursor: pointer; text-align: center; margin: 0">
              📁 添加题目材料（可多选）
              <input type="file" accept="image/*,.pdf,.docx,.txt,.tex,.md,.markdown" multiple style="display: none" @change="onFiles" />
            </label>
            <button v-if="imgs.length || textFiles.length" class="btn btn-gh" @click="imgs = []; textFiles = []">🧹 清空材料</button>
          </div>
          <div v-if="imgs.length || textFiles.length" class="ep-note" style="color: var(--hud-cyan)">已添加：图片 {{ imgs.length }} 张 · 文本 {{ textFiles.length }} 份</div>
          <div class="ep-param" style="margin-top: 8px">
            <label>识别后题量上限</label>
            <select v-model="qLimit" class="tb-sel">
              <option :value="0">不限（按卷面裁剪）</option>
              <option :value="10">10 题</option>
              <option :value="20">20 题</option>
              <option :value="50">50 题</option>
            </select>
            <span class="ep-hint">AI 识别整理后先按「📐 卷面构成」裁剪，再按此上限取题（整卷出题里可调整卷面）</span>
          </div>
          <div style="font-size: 11px; color: var(--text3); margin-top: 4px">💡 本地试卷数字化：图片/PDF/Word/txt/tex 上传 → AI 统一整理成题 → 按卷面裁剪组卷作答</div>
          <div v-if="imgs.length" class="pp-imgs">
            <div v-for="(im, i) in imgs" :key="'i' + i" class="pp-thumb"><img :src="im" /><button class="pp-x" @click="rmImg(i)">×</button></div>
          </div>
          <div v-if="textFiles.length" class="pp-txts">
            <div v-for="(t, i) in textFiles" :key="'t' + i" class="pp-txt-item"><span>📄 {{ t.name }}（{{ t.text.length }} 字）</span><button class="pp-x" @click="rmTxt(i)">×</button></div>
          </div>
        </div>

        <div v-if="srcMode === 'wrong'" class="ep-block">
          <div class="ep-block-hd">📚 错题集组卷</div>
          <div class="ep-note">💡 错题复盘卷：从<b>应用内错题本</b>组卷（作答后不会重复入库），可只刷未复盘的、先刷错得多的，做完自动判分。</div>
          <div class="ep-note" style="color: var(--hud-cyan)">需要导入本地错题文件（错题截图 / 错题 PDF / 新题）？→ 用「📂 导入材料」→ 识别预览 →「📌 全部存入错题本」→ 再回此处组卷二刷。</div>
          <div class="ep-param">
            <label>板块选择（可多选 / 全选，自由组合）</label>
            <div class="ep-chips">
              <button class="fp-b" :class="{ on: !wrongSel.length }" @click="wrongSel = []">✅ 全部</button>
              <button v-for="p in wrongPlates" :key="p" class="fp-b" :class="{ on: wrongSel.includes(p) }" @click="toggleWrongSel(p)">{{ p }}</button>
            </div>
            <span class="ep-hint">选一个或多个板块自由组合组卷，不选 = 全部板块</span>
          </div>
          <div class="ep-param">
            <label>组卷题量</label>
            <select v-model="wrongLimit" class="tb-sel">
              <option :value="0">全部（按板块裁剪）</option>
              <option :value="5">5 题</option>
              <option :value="10">10 题</option>
              <option :value="20">20 题</option>
              <option :value="30">30 题</option>
            </select>
            <span class="ep-hint">先按卷面板块匹配裁剪，再按此上限取题</span>
          </div>
          <div class="ep-param">
            <label>
              <input v-model="onlyPend" type="checkbox" />
              只看未复盘错题（优先攻克待复盘）
            </label>
          </div>
          <div class="ep-param">
            <label>
              <input v-model="byWrongCount" type="checkbox" />
              按错次优先排序（错得越多越靠前）
            </label>
          </div>
          <div class="ep-note">当前错题本：共 <b>{{ store.wqs.length }}</b> 题 · 已复盘 <b>{{ store.wqs.filter((q) => q.reviewed || q.digested).length }}</b> 题</div>
        </div>

        <div v-if="papers.length" class="ep-block">
          <div class="ep-block-hd ep-fold-hd" @click="toggleFold('papers')">
            <span>🗂️ 历史卷子（{{ papers.length }}）</span><span class="ep-fold-ic">{{ openPapers ? '▾ 收起' : '▸ 展开' }}</span>
          </div>
          <div v-if="openPapers" class="ep-list-scroll">
            <div v-for="(p, i) in papers" :key="p.id" class="ep-paper">
              <button class="ep-paper-btn" @click="openPaper(p)">{{ p.name }} · {{ p.questions.length }} 题 · {{ new Date(p.ts).toLocaleString() }}</button>
              <button class="ep-x" @click="delPaper(i)">×</button>
            </div>
            <div class="ep-note">共 {{ papers.length }} 卷（全部保留，可滚动查看）</div>
          </div>
        </div>

        <div v-if="quizCol.length" class="ep-block">
          <div class="ep-block-hd ep-fold-hd" @click="toggleFold('quizcol')">
            <span>📚 出题集（{{ quizCol.length }}）</span><span class="ep-fold-ic">{{ openQuizCol ? '▾ 收起' : '▸ 展开' }}</span>
          </div>
          <div v-if="openQuizCol">
            <div class="ep-note">单题快练/出题自动收纳，支持二刷：先做题 → 点选项 → 再显示答案与解析</div>
            <div class="ep-list-scroll">
              <div v-for="(c, i) in quizCol" :key="c.id" class="ep-paper">
                <span class="qc-status" :class="c.lastOk === true ? 'ok' : c.lastOk === false ? 'no' : ''">{{ c.lastOk === true ? '✓' : c.lastOk === false ? '✗' : '•' }}</span>
                <button class="ep-paper-btn" @click="startRedo(c)" :title="'【' + c.subject + (c.variant ? '·' + c.variant : '') + '】' + (c.stem || '').slice(0, 80) + '（累计错' + c.wrongCount + '次 · 连对' + c.correctStreak + '）'">{{ c.subject }}{{ c.variant ? '·' + c.variant : '' }} · {{ (c.stem || '').slice(0, 22) }}…</button>
                <button class="ep-x" @click="delQuizCol(i)">×</button>
              </div>
            </div>
            <div class="ep-note">共 {{ quizCol.length }} 题（全部保留，可滚动查看）</div>
            <button class="btn btn-gh" style="margin-top: 6px" @click="clearQuizCol()">🗑 清空出题集</button>
          </div>
        </div>

        <div v-if="results.length" class="ep-block">
          <div class="ep-block-hd ep-fold-hd" @click="toggleFold('results')">
            <span>🏅 考试战绩（{{ results.length }}）</span><span class="ep-fold-ic">{{ openResults ? '▾ 收起' : '▸ 展开' }}</span>
          </div>
          <div v-if="openResults">
            <div class="ep-stats">平均正确率 <b>{{ avgRate }}%</b> · 已完成 <b>{{ results.length }}</b> 卷</div>
            <div class="ep-list-scroll">
              <div v-for="(r, i) in results" :key="i" class="pp-item">
                <div class="pp-info"><div class="pp-name">{{ r.name }}</div><div class="pp-meta">{{ r.n }} 题 · {{ new Date(r.ts).toLocaleString() }}</div></div>
                <span class="pp-score" :class="r.rate >= 80 ? 'ok' : r.rate >= 60 ? 'mid' : 'no'">{{ r.score }}/{{ r.n }} · {{ r.rate }}%</span>
                <span class="pp-meta">⏱ {{ fmt(r.sec) }}</span>
              </div>
            </div>
            <div class="ep-note">共 {{ results.length }} 次（全部保留，可滚动查看）</div>
          </div>
        </div>

        <div class="pnl-btns">
          <button class="btn btn-gh" @click="cancel()">取消</button>
          <button class="btn btn-pri" @click="start()">
            🚀 {{ srcMode === 'single' ? '开始单题快练' : srcMode === 'ai' ? '开始考试（AI 出题）' : srcMode === 'import' ? '识别并组卷' : '错题组卷开始' }}
          </button>
        </div>
      </div>

      <!-- ========== AI 出卷中（进度条 + 预计时间） ========== -->
      <div v-else-if="phase === 'gen'" class="pp-extract">
        <div class="gen-panel">
          <div class="sim-loading"><span class="spin"></span> AI 正在出卷…（并发出题，请稍候）</div>
          <div v-if="singleMode && genLive" class="gen-live">{{ genLive }}</div>
          <div class="gen-cur">{{ genCur }}</div>
          <div v-if="genStatus" class="gen-status">{{ genStatus }}</div>
          <div class="gen-pct"><b>{{ genTotal ? Math.round((genDone / genTotal) * 100) : 0 }}%</b><span>出题进度</span></div>
          <div class="gen-bar"><i :style="{ width: (genTotal ? Math.round((genDone / genTotal) * 100) : 0) + '%' }"></i></div>
          <div class="gen-meta">已完成 <b>{{ genDone }}</b> / {{ genTotal }} 题 · 已用 <b>{{ genSec }}</b> 秒 · 预计还需 <b>约 {{ genEta }} 秒</b>（每题约 {{ genDone ? Math.round(genSec / genDone) : '—' }} 秒）</div>
          <div class="gen-plan">📐 本卷构成：{{ planText }}</div>
          <div class="gen-tip">💡 按真实卷面结构逐板块出题，同板块题型自动轮换；出完后会询问你，点击「开始作答」才进入答题与计时</div>
          <div class="pnl-btns"><button class="btn btn-gh" @click="cancelGen()">⏹ 取消出卷</button></div>
        </div>
      </div>

      <!-- ========== 识别中 ========== -->
      <div v-else-if="phase === 'extract'" class="pp-extract">
        <div class="sim-loading"><span class="spin"></span> AI 正在整理题目…（图片/PDF 每张约 10-30 秒，文本约 5-15 秒）</div>
      </div>

      <!-- ========== 识别结果预览校对（高质量导入关键：先校对再组卷/存错题本） ========== -->
      <div v-else-if="phase === 'preview'" class="pp-extract">
        <div class="pv-hd">🔎 识别结果预览 · 共 {{ previewList.length }} 题（可校对 / 删除，再决定去向）</div>
        <div class="pv-list">
          <div v-for="(q, i) in previewList" :key="i" class="pv-item">
            <div class="pv-top">
              <span class="pv-no">第 {{ i + 1 }} 题</span>
              <select v-model="q.subject" class="tb-sel pv-subj">
                <option v-for="s in SUBJECTS" :key="s" :value="s">{{ s }}</option>
              </select>
              <button class="btn btn-gh pv-x" @click="delPreview(i)">🗑</button>
            </div>
            <textarea v-if="previewEdit === i" v-model="q.stem" rows="3" class="pv-edit" @blur="previewEdit = -1"></textarea>
            <div v-else class="pv-stem" @click="previewEdit = i" title="点击编辑题干">{{ q.stem }}</div>
            <div v-if="q.options && q.options.length" class="pv-opts">
              <span v-for="(o, oi) in q.options" :key="o.k" class="pv-opt"><b>{{ o.k }}.</b> {{ o.t }}</span>
            </div>
            <div class="pv-ans">答案：<b>{{ q.answer || '—' }}</b></div>
          </div>
        </div>
        <div class="pv-actions">
          <button class="btn btn-gh" @click="phase = 'config'">↩ 返回重传</button>
          <button class="btn btn-gh" @click="savePreviewToWrong()">📌 全部存入错题本</button>
          <button class="btn btn-pri" @click="startPreviewExam()">🚀 开始作答（按卷面裁剪组卷）</button>
        </div>
      </div>

      <!-- ========== 作答 ========== -->
      <div v-else-if="phase === 'doing' && q" class="sim-doing" :class="{ paper: paperMode, imm: singleMode }">
        <div class="pp-timer-bar">
          <span class="sim-plate">📐 {{ q.subject }}<template v-if="q.variant"> · {{ q.variant === '一拖五' ? '一拖N 分析推理' : q.variant }}</template></span>
          <span class="sim-prog">第 {{ cur + 1 }} / {{ questions.length }} 题</span>
          <span class="pp-tq" :class="{ warn: qLeft <= 10 }">本题 ⏳ {{ fmt(qLeft) }} · ⏱ {{ fmt(qElapsed) }}<template v-if="marks[cur] && marks[cur].usedSec != null"> · ✅ 已用 {{ marks[cur].usedSec }}s</template></span>
        </div>
        <div v-if="!singleMode" class="pp-timer-bar total">
          <span class="pp-total">📦 板块参考 ⏳ {{ fmt(modLeft) }}<template v-if="modTotal"> · 已完成 {{ modDone }}/{{ modTotal }} 题</template></span>
        </div>
        <div v-if="!singleMode" class="pp-timer-bar total">
          <span class="pp-total">📄 整卷 ⏳ {{ fmt(totalLeft) }} · 总用时 ⏱ {{ fmt(totalElapsed) }}</span>
        </div>
        <div v-else class="pp-timer-bar total">
          <span class="pp-total">⚡ 单题快练 · {{ singlePlate }}<template v-if="questions.length > 1"> · 本组已用 ⏱ {{ fmt(totalElapsed) }}</template></span>
        </div>

        <div v-if="questions.length > 1" class="ep-nav">
          <button
            v-for="(qq, i) in questions"
            :key="i"
            class="ep-nav-btn"
            :class="{ cur: i === cur, ok: marks[i] && marks[i].ok, no: marks[i] && !marks[i].ok }"
            @click="go(i)"
          >{{ i + 1 }}</button>
        </div>

        <div v-if="!q.stem && !q.err" class="sim-loading"><span class="spin"></span> AI 正在出题（{{ q.subject }}）{{ genStatus ? '· ' + genStatus : '…' }}</div>
        <template v-else>
          <div class="draft-btn-row">
            <button class="btn btn-gh" :class="{ on: paperMode }" title="护眼纸张 / 屏幕模式切换" @click="paperMode = !paperMode; savePaperMode()">📄 {{ paperMode ? '纸张' : '屏幕' }}</button>
            <span class="ep-hint" style="font-size: 11px">✏️ 随手记：点屏幕任意位置的悬浮球即可写笔记（设置里可开关）</span>
          </div>
          <div class="sim-q" v-html="qHtml"></div>
          <div v-if="q.err" class="sim-err">
            ⚠️ {{ q.stem }}
            <button class="btn btn-gh" @click="retryGen()">↻ 重出</button>
          </div>
          <div v-else-if="q.options && q.options.length" class="quiz-opts" :class="{ big: singleMode, 'has-svg': hasSvgOpts }">
            <button
              v-for="(o, oi) in q.options"
              :key="o.k"
              class="quiz-opt"
              :class="{ picked: marks[cur] && marks[cur].pick === o.k, right: marks[cur] && o.k === q.answer, wrong: marks[cur] && marks[cur].pick === o.k && o.k !== q.answer }"
              :disabled="marks[cur] != null"
              @click="pick(o.k)"
            >
              <span class="qk">{{ o.k }}</span><span class="qt" v-html="optHtmls[oi]"></span>
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
            {{ marks[cur].ok ? '✅ 回答正确' : (marks[cur].blank ? '⬜ 未作答（已按错计）' : (marks[cur].self ? '❌ 还没掌握，已计错' : '❌ 回答错误，正确答案 ' + q.answer)) }}
          </div>
          <!-- 解析：答完（无论对错）→ 有解析直接显示；没有则显示醒目的「📖 查看解析」按钮，点击生成/打开 -->
          <div v-if="marks[cur] && marks[cur].ok !== undefined && (q.analysis || q.explain || q.aiEnhancing)" class="sim-explain" v-html="qExplainHtml"></div>
          <div v-else-if="marks[cur] && marks[cur].ok !== undefined" class="designer-btn-row">
            <button class="btn btn-pri" :disabled="q.aiEnhancing" @click="enhanceExplain(q)">{{ q.aiEnhancing ? '⏳ 正在生成解析…' : '📖 查看解析' }}</button>
          </div>
          <div v-if="marks[cur] && marks[cur].ok !== undefined && (q.designer || q.explain)" class="designer-btn-row">
            <button class="btn btn-gh" title="看完解析还不懂？看看命题人为什么这么出、每个干扰项用了什么陷阱" :disabled="q.designerLoading" @click="openDesigner()">{{ q.designerLoading ? '🧠 正在生成命题人设计说明…' : '🧠 命题人设计说明（出题意图 · 陷阱设计）' }}</button>
          </div>
          <div class="pnl-btns">
            <button class="btn btn-gh" title="返回出卷配置（保留当前卷子到历史卷子）" @click="backToConfig()">← 返回配置</button>
            <button class="btn btn-gh" @click="cancel()">退出</button>
            <template v-if="singleMode && questions.length === 1">
              <button class="btn btn-gh" :class="{ 'wq-saved': savedWrongFlash }" @click="saveWrongs()">{{ savedWrongFlash ? '✅ 已入库' : '📌 错题入库' }}</button>
              <button class="btn btn-pri btn-next" @click="nextSingle()">🔁 再来一题 ▶</button>
              <span v-if="prefetchQ && prefetchQ.item && prefetchQ.item.stem" class="ep-hint" style="display: inline-block; margin-left: 6px">🔮 下一题已预生成，秒开</span>
              <span v-else class="ep-hint" style="display: inline-block; margin-left: 6px"><span class="spin" style="display:inline-block; width:12px;height:12px"></span> 正在预生成下一题…</span>
            </template>
            <template v-else>
              <button class="btn btn-gh" :class="{ 'wq-saved': savedWrongFlash }" title="把答错的题一键存入错题本" @click="saveWrongs()">{{ savedWrongFlash ? '✅ 已入库' : '📌 错题入库' }}</button>
              <button class="btn btn-gh" title="提前交卷：未答题目会提示并可按错计" @click="askFinish()">📤 交卷</button>
              <button class="btn btn-gh" :disabled="cur === 0" @click="prevQ()">◀ 上一题</button>
              <button v-if="marks[cur] && (marks[cur].ok !== undefined || marks[cur].pick !== '' || marks[cur].reveal)" class="btn btn-pri" @click="nextQ()">
                {{ cur + 1 >= questions.length ? '交卷 📄' : '下一题 ▶' }}
              </button>
            </template>
          </div>
        </template>
      </div>

      <!-- 组卷出完，确认开考 -->
      <div v-if="readyAsk" class="ov show">
        <div class="pnl">
          <h3>📝 组卷已出完毕</h3>
          <p style="line-height:1.8">本卷共 <b style="color:#34d399">{{ questions.length }}</b> 题已就绪<span v-if="genErrCount">（<b style="color:#fb7185">{{ genErrCount }} 题失败已跳过</b>）</span>。<br />是否准备好开始作答？点击「是」后才进入答题与计时。</p>
          <div class="pnl-btns">
            <button class="btn btn-gh" @click="readyBack()">↩ 返回配置</button>
            <button class="btn btn-pri" @click="readyStart()">✅ 是，开始作答</button>
          </div>
        </div>
      </div>

      <!-- 提前交卷确认 -->
      <div v-if="finishAsk" class="ov show" @click.self="finishAsk = false">
        <div class="pnl">
          <h3>📤 确认交卷？</h3>
          <p style="line-height:1.8">还有 <b style="color:#fb7185">{{ finishMissing.length }}</b> 题未作答：<b style="color:#fbbf24">第 {{ finishMissing.join('、') }} 题</b><br />未作答将按答错计分，确定直接交卷吗？</p>
          <div class="pnl-btns">
            <button class="btn btn-gh" @click="finishAsk = false">↩ 继续作答</button>
            <button class="btn btn-pri" @click="confirmFinish()">✅ 直接交卷</button>
          </div>
        </div>
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
            <span class="sr-t">{{ (qq.subject || '') + ' · ' + (qq.stem || '').slice(0, 46) }}</span>
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
          <button v-if="singleMode" class="btn btn-gh" @click="nextSingle()">🔁 再来一组</button>
          <button v-else class="btn btn-gh" @click="replay()">🔁 再来一卷</button>
          <button class="btn btn-gh" :class="{ 'wq-saved': savedWrongFlash }" @click="saveWrongs()">{{ savedWrongFlash ? '✅ 已入库' : '📌 错题入库' }}</button>
          <button class="btn btn-gh" @click="backList()">🏠 卷子列表</button>
          <button class="btn btn-pri" @click="cancel()">完成</button>
        </div>
      </div>

      <!-- ========== 草稿纸已统一为全局「✏️ 随手记」（见设置） ========== -->
      <!-- ========== 命题人设计说明弹窗（Teleport 到 body，避免被 .pnl 层叠上下文困住） ========== -->
      <Teleport to="body">
        <div v-if="designerShow && q && q.designer" class="ov show designer-ov" @click.self="designerShow = false">
          <div class="pnl designer-pnl">
            <div class="pnl-top">
              <button class="pnl-top-b" @click="designerShow = false">← 返回</button>
              <span class="pnl-top-t">🧠 命题人设计说明</span>
            </div>
            <div class="designer-body" v-html="renderMd(q.designer)"></div>
            <div class="pnl-btns"><button class="btn btn-pri" @click="designerShow = false">知道了</button></div>
          </div>
        </div>
      </Teleport>
    </div>
  </div>
</template>
