<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { store, saveWqs, saveCfg, addWrong } from '../store'
import { TEMPLATES, SUB_VARIANTS, DIR_LIB } from './examData'
import { activeCfg, chatOnce, chatStream, supportsVision } from '../api'
import { extractChoices, answerLetter } from '../utils/quiz'
import { showToast } from '../utils/toast'
import { exportPaper } from '../utils/export'
import { renderMd } from '../utils/renderMd'
import { zhentiIndex, zhentiPaper, zhentiToItems, zhentiTypes } from '../data/zhenti'
import { petAnalyzeCurrent } from '../utils/pet'
import { mountCharts } from '../utils/chartMount'
import { usePaperParse } from '../composables/usePaperParse'
import { useExamGen } from '../composables/useExamGen'
import ExamConfig from './ExamConfig.vue'
import ExamAnswer from './ExamAnswer.vue'
import ExamReport from './ExamReport.vue'

const emit = defineEmits(['close'])
const props = defineProps({ initialSrc: { type: String, default: 'ai' }, initialPaper: { type: Object, default: null }, initialLocal: { type: Boolean, default: false } })

// ===== 试卷模板库（基于国考/省考最新考情调研，均可自由编辑）=====
// 2025 起国考新增「政治理论」：副省 135 / 地市·执法 130；判断推理含 图推/定义/类比/逻辑 子板块


const SUBJECTS = ['政治理论', '常识判断', '言语理解', '数量关系', '判断推理', '图形推理', '定义判断', '类比推理', '逻辑判断', '资料分析']

// 题型轮换库：同板块内按序轮换子题型，提升整卷质量与多样性


// ===== 状态 =====
const templateId = ref('gk_ds')
const modules = ref((TEMPLATES.find((t) => t.id === 'gk_ds') || TEMPLATES[0]).modules.map((m) => ({ subject: m.subject, count: m.count, refMin: m.refMin, matType: m.matType || 'auto' })))
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
const mixMode = ref('module')   // module=按模块顺序出卷（贴合真实卷面）；mix=混合打乱
const srcMode = ref(props.initialSrc || 'ai') // ai=AI智能出题 / import=导入材料 / wrong=错题集 / single=单题快练
const singleMode = ref(false) // 单题快练：不启动整卷计时、答后留在本题可再来一题
const singlePlate = ref('逻辑判断') // 单题快练·细分板块（默认逻辑判断）
const singleVariant = ref('不限') // 单题快练子题型（不限=自动轮换）
const singleBatch = ref(1) // 单题快练组量：1/5/10/15/20
const autoNext = ref(false) // 单题快练：答对自动进入下一题
// 仿真答题卡交卷模式（默认开）：先填涂答题卡->交卷->统一看答案与解析；关闭则恢复「答完即时看对错+萌宠错因分析」原体验
const sheetMode = ref(localStorage.getItem('xc_sheet_mode') !== '0')
watch(sheetMode, (v) => { try { localStorage.setItem('xc_sheet_mode', v ? '1' : '0') } catch (e) {} })
const singleDir = ref('auto') // 问法方向：auto=随机 / is=选是 / not=选非 / custom=自定义
const singleLocal = ref(false) // 图推单题：🎲 本地真题生成（零额度、确定性质检）
if (props.initialLocal) singleLocal.value = true // 离线练习：默认本地生成
// 📚 真题快练（批次7·真题库）：28卷3583题（网友回忆版），无官方答案→AI判题；收录不全持续补充
const zhentiIdx = ref(null)
const zhentiSel = ref('')
const zhentiPlates = ref([])
const zhentiLimit = ref(20)
const zhentiLoading = ref(false)
const zhentiSecs = ['常识判断', '言语理解', '数量关系', '判断推理', '资料分析']
watch(srcMode, async (v) => {
  window.__ztLog = (window.__ztLog || []).concat('watch:' + v)
  if (v === 'zhenti') {
    try {
      zhentiLoading.value = true
      const idx = await zhentiIndex()
      zhentiIdx.value = idx
      window.__ztLog = (window.__ztLog || []).concat('loaded:' + (idx.papers?.length || 0))
    } catch (e) {
      window.__ztLog = (window.__ztLog || []).concat('err:' + e.message)
      showToast('真题索引加载失败: ' + e.message, 'error')
    }
    zhentiLoading.value = false
  }
})
function toggleZhentiPlate(p) {
  zhentiPlates.value = zhentiPlates.value.includes(p) ? zhentiPlates.value.filter(x => x !== p) : zhentiPlates.value.concat(p)
}
function startZhenti() {
  if (!zhentiSel.value) { showToast('请先选择一份真题卷', 'info'); return }
  zhentiLoading.value = true
  zhentiPaper(zhentiSel.value).then(async (record) => {
    const ty = await zhentiTypes().catch(() => null)
    const items = zhentiToItems(record, zhentiPlates.value, zhentiLimit.value, ty && ty.papers ? ty.papers[record.id] : null)
    if (!items.length) { showToast('该筛选下无真题，请调整板块', 'info'); return }
    singleMode.value = false
    const paper = makePaper('真题快练 · ' + (record.title || record.id), items)
    papers.value.unshift(paper); savePapers()
    startPaper(paper)
    showToast('📚 真题加载完成（' + items.length + '题）· 真题无官方答案，作答后由AI判题', 'info')
  }).catch((e) => showToast('真题加载失败: ' + e.message, 'error')).finally(() => { zhentiLoading.value = false })
}
const tutuFormat = ref('auto') // 图推出题形式：auto=自动轮换 / 一组图 / 两组图 / 九宫格 / 分组分类
const singleMatType = ref('auto') // 资料分析材料类型：auto=随机轮换 / text=纯文字 / table=表格 / chart=图形 / mixed=综合混合（真题：一篇材料配5题）
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
const onlyPend = ref(false) // 错题组卷：只看未复盘
const byWrongCount = ref(false) // 错题组卷：按错次优先排序
try { const _sp = localStorage.getItem('xc_single_plate'); if (_sp && SUBJECTS.includes(_sp)) singlePlate.value = _sp } catch (e) {}
const wrongSel = ref([]) // 错题组卷板块多选（空=全部）
function toggleWrongSel(p) { const i = wrongSel.value.indexOf(p); if (i >= 0) wrongSel.value.splice(i, 1); else wrongSel.value.push(p) }
const wrongLimit = ref(0) // 错题组卷题量：0=全部
const wrongPlates = computed(() => { const s = new Set(); store.wqs.forEach((q) => { if (q.subject) s.add(q.subject) }); return [...s] })
const aiLayout = ref(false) // 导出前先 AI 智能排版（梳理考点/错因/秒杀规律）
const separateAns = ref(false) // 题答分离：题目在前，答案与解析集中到卷尾（打印重做友好）
// 导入识别后由「预览校对」界面统一决定去向（开始作答 / 存入错题本）
const imgs = ref([])
const textFiles = ref([])
const papers = ref([])
try { papers.value = JSON.parse(localStorage.getItem('xc_papers') || '[]') || [] } catch (e) {}
const results = ref([])
try { results.value = JSON.parse(localStorage.getItem('xc_paper_results') || '[]') || [] } catch (e) {}

const phase = ref('config') // config | extract | doing | result
const qLimit = ref(0) // 导入识别后题量上限（0=不限）
// ===== 仿真考试答题卡：考生信息 + 2B 填涂 =====
const sheetShow = ref(false) // 答题卡视图开关（doing 阶段可切 题目/答题卡）
const examName = ref(''), examRoom = ref(''), examNo = ref('')
try {
  const ei = JSON.parse(localStorage.getItem('xc_exam_info') || '{}')
  examName.value = ei.name || ''
  examRoom.value = ei.room || ''
  examNo.value = ei.no || ''
} catch (e) {}
function saveExamInfo() {
  try { localStorage.setItem('xc_exam_info', JSON.stringify({ name: examName.value, room: examRoom.value, no: examNo.value })) } catch (e) {}
}
const reviewOpen = ref({})
const answeredCount = computed(() => questions.value.filter((qq, i) => marks.value[i] != null && marks.value[i].pick != null).length)
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
// 批次8·一题五步闭环：成绩单一键「变式检验」→ 串联到对话页出变式题（考点相同/素材全新）
function variantToChat(i) {
  const qq = questions.value[i]
  if (!qq || !qq.stem) { showToast('该题无题干，无法出变式', 'info'); return }
  const last = String((marks.value[i] && marks.value[i].pick) || '')
  const ask = '请针对下面这道题出一道【考点题型完全相同、题干素材全新】的变式检验题（输出题干+四个选项+单独一行【正确答案】X，考我之后给解析）：\n' + String(qq.stem).slice(0, 400) + '\n选项：' + (qq.options || []).map(o => o.k + '.' + o.t).join(' ') + (qq.answer ? '\n（原题答案：' + qq.answer + (last && last !== qq.answer ? '，我选了' + last : '') + '）' : '')
  store.tab = 'chat'
  store.pendingAsk = ask
  emit('close')
  showToast('🔁 已把原题带到对话页出变式，答完自动判分', 'info')
}

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
// 注：genTimer / genAbort / genCtrl 已随出题流程收拢进 composables/useExamGen.js
// 板块参考倒计时（仅倒计时，不设正计时）
const modName = ref('')
const modDone = ref(0)
const modTotal = ref(0)
const modRefSec = ref(0)
const modLeft = ref(0)
const startAt = ref(0)
let timers = { q: null, t: null }

const fmt = (s) => {
  const m = Math.floor(Math.max(0, s) / 60)
  const ss = Math.max(0, s) % 60
  return String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0')
}
const q = computed(() => (cur.value >= 0 && questions.value[cur.value] ? questions.value[cur.value] : null))
// 萌宠智能语音：让萌宠「看见」当前题目（读题/答错实时错因分析/对话追问都靠它）
function syncPetCurQ(i) {
  const qq = questions.value[i]
  if (!qq || !qq.stem) return
  const m = marks.value[i]
  store.curQ = {
    plate: qq.subject, subject: qq.subject, kind: qq.kind || qq.variant || '',
    stem: qq.stem, options: qq.options || [], answer: qq.answer || '',
    explain: qq.explain || qq.analysis || '',
    your: m ? m.pick : '', ok: m ? !!m.ok : null
  }
  const opts = (qq.options || []).map((o, k) => String(k === 0 ? 'A' : String.fromCharCode(64 + k + 1)) + '、' + String(o.t || '').replace(/<[^>]+>/g, ' ')).join('。')
  const marked = m != null
  store.readCtx = {
    type: 'quiz',
    title: (qq.subject || '行测') + (qq.kind ? '·' + qq.kind : ''),
    text: ((qq.stem || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() + '。' + opts + (marked && (qq.explain || qq.analysis) ? '。解析：' + String(qq.explain || qq.analysis).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '')).slice(0, 1200)
  }
}
// 注意：q 是对象引用，题目内容异步填充时引用不变，需监听内容快照
watch(
  () => {
    const qq = q.value
    return qq ? String(qq.stem || '') + '||' + (qq.options || []).map((o) => String(o.t || '')).join('|') : ''
  },
  (snap) => {
    if (!q.value || !snap) return
    syncPetCurQ(cur.value)
  },
  { immediate: true }
)

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
function addRow() { modules.value.push({ subject: '常识判断', count: 5, refMin: 5, matType: 'auto' }) }
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
// 1.8 自定义「判断推理」单行 → 出卷时自动展开为 4 子板块，UI 显示换算说明
const judgeSplitHint = computed(() => {
  const j = modules.value.find((m) => m.subject === '判断推理')
  if (!j || (Number(j.count) || 0) <= 0) return ''
  return '🧩 本卷「判断推理」' + j.count + ' 题将在出卷时自动展开为 图推/定义/类比/逻辑 4 子板块均分（余数依次补前项），题型轮换覆盖全类。'
})

// ===== 材料导入（图片/PDF/Word/txt/tex）=====
// 批次6B R3-②b：解析实现已纯移动至 composables/usePaperParse.js
//   onFiles / readImg / readPdf / readText / readDocx / rmImg / rmTxt / norm / shuffle / applyConfig / textToQuestions
const { onFiles, rmImg, rmTxt, norm, applyConfig, textToQuestions } = usePaperParse({ imgs, textFiles, modules, mixMode, pickGenC })

const VISION_SYS = '你是公考行测真题整理专家。请把图片/扫描件中的行测题目逐题、完整地提取出来（题干、选项 A-D、正确答案、解析如有）。要求：①每题独立一个对象；②题干与选项逐字保留，不改写不遗漏（含数字/图表数据/材料原文）；③按内容判断板块归属（判断推理/言语理解/数量关系/资料分析/常识判断/政治理论/图形推理/类比推理/定义判断/逻辑判断）；④材料题/大题按小题拆分；⑤识别不清的题目跳过、绝不编造。严格只输出 JSON 数组，不要多余文字。'
const VISION_PROMPT =
  '[{"no":1,"subject":"判断推理","stem":"题干原文","options":{"A":"...","B":"...","C":"...","D":"..."},"answer":"B","analysis":"解析(若有)"}]'
function makePaper(name, qs) {
  return { id: Date.now() + Math.random(), name, ts: Date.now(), questions: qs }
}
function savePapers() { try { localStorage.setItem('xc_papers', JSON.stringify(papers.value)) } catch (e) {} }
function saveResults() { try { localStorage.setItem('xc_paper_results', JSON.stringify(results.value)) } catch (e) {} }

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
  const limited = qLimit.value > 0 ? all.slice(0, qLimit.value) : all
  previewList.value = limited
  phase.value = 'preview'
  showToast('✅ 识别出 ' + all.length + ' 题' + (qLimit.value > 0 && all.length > qLimit.value ? '，按上限取前 ' + qLimit.value + ' 题' : '') + '，请预览校对后「开始作答」或「存入错题本」', 'success')
  // 识别完成 → 进入预览校对（由预览界面决定「开始作答 / 存入错题本」）
}

// ===== 出卷与作答 =====
function start() {
  // 单题快练：无条件立刻进入「出题等待界面」；Key 缺失在等待界面内明确提示（出题用的是文字模型，勿用视觉模型前置拦截）
  if (srcMode.value === 'single') { startSingle(); return }
  if (srcMode.value === 'zhenti') { startZhenti(); return }
  if (srcMode.value === 'morning') { startMorning(); return }
  if (srcMode.value === 'weekRedo') { startWeekRedo(); return }
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
// 出卷完成 → 组卷/多题组：等用户点「是」才开考与计时（原 genAll 内直接赋值 readyPaper，现由 composable 回调注入）
const onPaperReady = (p) => { readyPaper = p; readyAsk.value = true }

// 批次6B R3-②a：出题主流程已纯移动至 composables/useExamGen.js
//   genOne（出题）/ verifyQuestion（质检）/ retryGen（重试）/ genAll+worker（并发出卷）
//   + 组卷入口 startAi / startSingle / startMorning / startWeekRedo / startRedo / nextSingle / 出题集管理
const {
  cancelGen, ensureGen, retryGen, nextSingle, startRedo,
  startAi, startSingle, startMorning, startWeekRedo, saveQuizCol, updateQuizColResult
} = useExamGen({
  pickGenC, makePaper, savePapers, startPaper, onPaperReady,
  questions, phase, cur, singleMode, singlePlate, singleVariant, singleDir, singleDirText,
  singleLocal, singleBatch, singleMatType, singleVars, difficulty, tutuFormat, modules,
  aiCap, genConcur, paperDir, paperDirText, paperYtNGroup, paperYtN, selTmpl, prefetchQ,
  papers, quizCol, genLive, genStatus, genCur, genDone, genTotal, genErrCount, genSec,
  genEta, genBusy
})
function saveFastGenModel() { try { localStorage.setItem('xc_fast_gen_model', String(fastGenModel.value || '').trim()) } catch (e) {} }
function delQuizCol(i) { quizCol.value.splice(i, 1); saveQuizCol() }
function clearQuizCol() { quizCol.value = []; saveQuizCol(); showToast('已清空出题集', 'info') }
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
    // 板块参考总时限照常递减（不受本题作答停顿影响，保持真实考场节奏感）
    if (modLeft.value > 0) modLeft.value--
    // 答完当前题：冻结本题计时（不再递减），本题用时已记录
    if (marks.value[cur.value] != null) return
    qElapsed.value++
    qLeft.value--
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
  syncPetCurQ(i)
  showToast('⏰ 本题超时（' + perQ.value + ' 秒），已按答错计；萌宠正在帮你复盘——先看看是不是没读懂这道题…', 'error')
  petAnalyzeCurrent({ timeout: true })
  if (singleMode.value) { qLeft.value = perQ.value; qElapsed.value = 0 } else nextQ()
}
// 注：drawZlMaterialSVG / genOne（含质检与本地回退）已纯移动至 composables/useExamGen.js
// 注：ensureGen / prefetchSingle 已纯移动至 composables/useExamGen.js
// 注：nextSingle / retryGen 已纯移动至 composables/useExamGen.js
function pick(k) {
  const i = cur.value
  const qq = questions.value[i]
  if (!qq || qq.err) return
  // 答题卡交卷模式：只填涂不判对错（交卷前可反复改涂，交卷后统一判分 + 显示答案/解析）
  // 即时模式：保留原「答完即时看对错 + 萌宠错因分析 + 答对自动下一题」体验
  marks.value[i] = { pick: k, usedSec: qElapsed.value }
  if (qq.zhenti && !qq.answer) {
    marks.value[i].judging = true
    judgeZhenti(i, k)
    return
  }
  syncPetCurQ(i)
  maybeEnhance(i)
  if (!sheetMode.value) {
    marks.value[i].ok = qq.answer ? k === qq.answer : false
    if (qq.answer && k === qq.answer) { if (autoNext.value && i < questions.value.length - 1) { setTimeout(() => nextQ(), 500); return } } else if (qq.answer) {
      showToast('❌ 选错了，正确答案是 ' + qq.answer + '，萌宠正在分析你的错因…', 'error')
      petAnalyzeCurrent()
    }
  } else if (autoNext.value && i < questions.value.length - 1) { setTimeout(() => nextQ(), 450) }
}
// 📚 真题快练：AI判题（网友回忆版无官方答案）
const zhentiJudgeBusy = {}
async function judgeZhenti(i, k) {
  const qq = questions.value[i]
  if (!qq) return
  if (zhentiJudgeBusy[i]) { setTimeout(() => judgeZhenti(i, k), 1500); return }
  zhentiJudgeBusy[i] = true
  const c = pickGenC()
  if (!c || !c.key) { showToast('真题AI判题需在设置配置文字模型Key', 'error'); zhentiJudgeBusy[i] = false; const m = marks.value[i]; if (m) m.judging = false; return }
  let reply = ''
  try {
    reply = await chatOnce(c, [
      { role: 'system', content: '你是行测阅卷老师。根据题干与选项确定唯一正确答案，只输出一行：正确选项是X（X为A/B/C/D）。不确定时选最符合题意的一项。' },
      { role: 'user', content: qq.stem + '\n' + qq.options.map(o => o.k + '.' + o.t).join('\n') + '\n考生选择了' + k + '。请给出正确选项。' },
    ], 300, 60000)
  } catch (e) {}
  zhentiJudgeBusy[i] = false
  const mk = marks.value[i]
  if (!mk) return
  mk.judging = false
  // 修复：真题无答案时用 AI 判题结果回填答案（此前 reply 被丢弃导致"无答案→AI判题"恒失败）
  const m2 = String(reply || '').match(/正确选项是\s*([A-D])/i)
  if (m2) qq.answer = m2[1].toUpperCase()
  if (qq.answer) {
    mk.ok = k === qq.answer
    showToast(mk.ok ? '✅ 真题判题：回答正确' : '❌ 真题判题：正确答案是 ' + qq.answer, mk.ok ? 'success' : 'error')
    syncPetCurQ(i)
  } else {
    showToast('真题判题失败，可点重试', 'error')
  }
}
// 答题卡 2B 填涂：点格子即填涂（重选覆盖），交卷后不可改
function sheetPick(i, k) {
  if (i < 0 || i >= questions.value.length || phase.value !== 'doing') return
  const qq = questions.value[i]
  if (!qq || qq.err) return
  // 2B 铅笔：交卷前可反复改涂（覆盖上一笔）
  marks.value[i] = { pick: k, usedSec: marks.value[i] && marks.value[i].usedSec != null ? marks.value[i].usedSec : 0 }
  if (cur.value === i) syncPetCurQ(i)
  maybeEnhance(i)
  if (autoNext.value && i < questions.value.length - 1 && sheetShow.value) setTimeout(() => { cur.value = i + 1; qLeft.value = perQ.value; qElapsed.value = 0 }, 350)
}
// 答题卡格子 = 该题真实选项字母（兼容判断对/错、非 ABCD 键；无选项题显示 — 回题目页自评）
function sheetKeys(qq) {
  if (qq && qq.options && qq.options.length) return qq.options.map((o) => o.k).filter(Boolean)
  return []
}
function selfMark(ok) {
  const i = cur.value
  if (marks.value[i] != null) return
  marks.value[i] = { ok, pick: '', self: true, usedSec: qElapsed.value }
  syncPetCurQ(i)
  maybeEnhance(i)
  if (!ok) petAnalyzeCurrent()
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
  syncPetCurQ(i)
  // 后台预生成解析：题目已出时立即开始，用户读题/作答期间解析已备好，答完秒出（答前不显示，不剧透）
  const gIt = questions.value[i]
  if (gIt && gIt.stem && !gIt.err) maybeEnhance(i)
}
function nextQ() {
  if (cur.value < questions.value.length - 1) { go(cur.value + 1) } else askFinish()
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
    const m = marks.value[i]
    if (m == null) marks.value[i] = { ok: false, pick: '', timeout: false, blank: true }
    else if (m.ok === undefined) {
      // 答题卡模式：交卷时统一判分
      m.ok = qq.answer ? m.pick === qq.answer : !!(m.self)
      if (!qq.answer && m.pick === '对') m.ok = true
      if (!qq.answer && m.pick === '错') m.ok = false
    }
  })
  if (singleMode.value) questions.value.forEach((qq, i) => updateQuizColResult(qq, !!(marks.value[i] && marks.value[i].ok)))
  // 答题卡交卷后：萌宠自动分析第一道错题错因（延续原即时模式的错因分析能力）
  if (sheetMode.value) {
    const wi = questions.value.findIndex((qq, i) => marks.value[i] && !marks.value[i].ok)
    if (wi >= 0) setTimeout(() => { syncPetCurQ(wi); petAnalyzeCurrent() }, 400)
  }
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
// 注：verifyQuestion（出题严格质检）已纯移动至 composables/useExamGen.js
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
  let saved = 0, rejected = 0
  wrongs.forEach((qq) => {
    if (qq.fromWrong) return
    const r = addWrong({
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
    }, { silent: true })
    if (r && r.ok) saved++
    else rejected++
  })
  saveWqs()
  if (rejected) showToast('✅ 已存入 ' + saved + ' 题，' + rejected + ' 条非完整/重复未入库', 'warning')
  else showToast('✅ 已存入错题本 ' + saved + ' 题', 'success')
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
  let saved = 0, rejected = 0
  qs.forEach((q) => {
    const r = addWrong({
      id: Date.now() + Math.random(), subject: q.subject || '未分类',
      question: q.stem + '\n\n' + (q.options || []).map((o) => o.k + '. ' + o.t).join('\n'),
      answer: '正确答案 ' + (q.answer || ''), reasons: ['导入习题集'],
      time: new Date().toLocaleString(), at: Date.now(), wrongCount: 0, correctStreak: 0, mastery: 0, digested: false
    }, { silent: true })
    if (r && r.ok) saved++
    else rejected++
  })
  saveWqs()
  if (rejected) showToast('✅ 已存入 ' + saved + ' 题，' + rejected + ' 条非完整/重复未入库', 'warning')
  else showToast('✅ 已存入错题本 ' + saved + ' 题', 'success')
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
  if (phase.value === 'doing') return '📝 作答中 · ' + (curPaper.value ? curPaper.value.name : '模拟卷')
  if (phase.value === 'result') return '📄 成绩单'
  return srcMode.value === 'single' ? '⚡ 单题快练' : srcMode.value === 'morning' ? '🌅 每日晨练包' : srcMode.value === 'weekRedo' ? '📅 每周重做卷' : srcMode.value === 'import' ? '📂 导入组卷' : srcMode.value === 'wrong' ? '📚 错题组卷' : '📝 模拟组卷'
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
// 注：REVEAL_RE / liveVisible（流式隐藏答案）已纯移动至 composables/useExamGen.js
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
    if (!map[s]) map[s] = { subject: s, total: 0, ok: 0, answered: 0 }
    map[s].total++
    if (marks.value[i] && marks.value[i].ok) map[s].ok++
    if (marks.value[i]) map[s].answered++
  })
  return Object.values(map)
})
function doExportPaper(format) {
  if (!curPaper.value || !questions.value.length) { showToast('暂无可导出的卷子', 'info'); return }
  exportPaper(curPaper.value, marks.value, { score: score.value, rate: rate.value, sec: totalElapsed.value, moduleStats: moduleStats.value }, format, aiLayout.value, separateAns.value)
}
// 注：genTimer 的清理已随 useExamGen 内部 onUnmounted 处理
onUnmounted(() => { clearTimers() })

// R3-③：把全部状态/方法聚合成一个 reactive ctx，注入三个子组件
// （ExamConfig / ExamAnswer / ExamReport）。子组件用 toRefs 暴露状态、直接解构暴露方法，
// 模板逐字搬入，避免任何双向绑定错位。
const examCtx = reactive({
  // 状态 ref / 计算属性
  srcMode, sheetMode, templateId, modules, perQ, fastGenModel, useFigGen, aiCap, genConcur, mixMode,
  paperDir, paperDirText, paperYtN, paperYtNGroup, difficulty, singleGroup, singlePlate, singleVariant,
  singleBatch, singleDir, singleDirText, singleLocal, tutuFormat, singleMatType, autoNext, imgs, textFiles,
  qLimit, zhentiSel, zhentiPlates, zhentiLimit, wrongSel, wrongLimit, onlyPend, byWrongCount, papers,
  openPapers, openQuizCol, quizCol, results, openResults, zhentiIdx, selTmpl, tmplJudgeNote, judgeSplitHint,
  totalQ, refTotal, singlePlates, singleVars, dirLib, avgRate, wrongPlates,
  q, cur, questions, qLeft, qElapsed, marks, modLeft, modTotal, modDone, totalLeft, totalElapsed,
  paperMode, sheetShow, answeredCount, genStatus, qHtml, optHtmls, hasSvgOpts, qExplainHtml, score, rate,
  moduleStats, reviewOpen, prefetchQ, savedWrongFlash, aiLayout, separateAns, curPaper, singleMode,
  // 常量
  TEMPLATES, SUBJECTS, SIX_GROUPS, zhentiSecs, store,
  // 方法
  onTemplate, templateTotal, moduleRefSec, rmRow, addRow, saveFastGenModel, saveCfg, onSingleGroup,
  onSinglePlate, setDirText, toggleZhentiPlate, toggleWrongSel, toggleFold, openPaper, delPaper, startRedo,
  delQuizCol, clearQuizCol, onFiles, rmImg, rmTxt, fmt, cancel, start, go, retryGen, pick, selfMark,
  variantToChat, enhanceExplain, openDesigner, backToConfig, saveWrongs, finish, nextSingle, askFinish,
  prevQ, nextQ, doExportPaper, replay, backList, renderMd, savePaperMode, achieveText
})

</script>

<template>
  <div class="ov show sim-ov" :class="{ 'single-imm': singleMode && phase === 'doing' }" @click.self="cancel()">
    <div class="pnl sim-pnl ep-pnl">
      <div class="pnl-top">
        <button class="pnl-top-b" title="返回上一层（也可按 Esc / 浏览器返回）" @click="topBack()">← 返回</button>
        <span class="pnl-top-t">{{ topTitle }}</span>
      </div>
      <!-- ========== 配置 ========== -->
            <ExamConfig v-if="phase === 'config'" :ctx="examCtx" />
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
          <div v-for="(item, i) in previewList" :key="i" class="pv-item">
            <div class="pv-top">
              <span class="pv-no">第 {{ i + 1 }} 题</span>
              <select v-model="item.subject" class="tb-sel pv-subj">
                <option v-for="s in SUBJECTS" :key="s" :value="s">{{ s }}</option>
              </select>
              <button class="btn btn-gh pv-x" @click="delPreview(i)">🗑</button>
            </div>
            <textarea v-if="previewEdit === i" v-model="item.stem" rows="3" class="pv-edit" @blur="previewEdit = -1"></textarea>
            <div v-else class="pv-stem" title="点击编辑题干" @click="previewEdit = i">{{ item.stem }}</div>
            <div v-if="item.options && item.options.length" class="pv-opts">
              <span v-for="o in item.options" :key="o.k" class="pv-opt"><b>{{ o.k }}.</b> {{ o.t }}</span>
            </div>
            <div class="pv-ans">答案：<b>{{ item.answer || '—' }}</b></div>
          </div>
        </div>
        <div class="pv-actions">
          <button class="btn btn-gh" @click="phase = 'config'">↩ 返回重传</button>
          <button class="btn btn-gh" @click="savePreviewToWrong()">📌 全部存入错题本</button>
          <button class="btn btn-pri" @click="startPreviewExam()">🚀 开始作答（按卷面裁剪组卷）</button>
        </div>
      </div>

      <!-- ========== 作答 ========== -->
            <ExamAnswer v-else-if="phase === 'doing' && q" :ctx="examCtx" />
      <!-- 作答中题目尚未就绪：显示加载占位，绝不闪现空成绩单 -->
      <div v-else-if="phase === 'doing'" class="pp-extract">
        <div class="sim-loading"><span class="spin"></span> 题目加载中…</div>
      </div>
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
            <ExamReport v-else-if="phase === 'result'" :ctx="examCtx" />
<!-- ========== 草稿纸已统一为全局「✏️ 随手记」（见设置） ========== -->
      <!-- ========== 仿真考试答题卡（2B 铅笔填涂，交卷后统一查看答案） ========== -->
      <Teleport to="body">
        <div v-if="sheetShow && phase === 'doing' && sheetMode" class="ov show exam-sheet-ov" @click.self="sheetShow = false">
          <div class="pnl exam-sheet-pnl">
            <div class="es-head">
              <div class="es-title">📋 行测模拟考试 · 答题卡</div>
              <div class="es-remind">请用 2B 铅笔将所选答案涂满，交卷后统一查看答案与解析</div>
              <div class="es-info">
                <label>姓名 <input v-model="examName" placeholder="填写姓名" @change="saveExamInfo()" /></label>
                <label>考场号 <input v-model="examRoom" placeholder="考场号" @change="saveExamInfo()" /></label>
                <label>准考证号 <input v-model="examNo" placeholder="准考证号" @change="saveExamInfo()" /></label>
              </div>
            </div>
            <div class="es-grid">
              <div v-for="(qq, i) in questions" :key="i" class="es-row" :class="{ cur: i === cur }" @click="go(i)">
                <span class="es-no">{{ i + 1 }}</span>
                <button
                  v-for="c in sheetKeys(qq)"
                  :key="c"
                  class="es-cell"
                  :class="{ filled: marks[i] && marks[i].pick === c }"
                  @click.stop="sheetPick(i, c)"
                >{{ c }}</button>
                <span v-if="!sheetKeys(qq).length" class="es-cell es-none" title="本题无选项，请回题目页自评">—</span>
                <span class="es-st" :class="{ ok: marks[i] && marks[i].pick }">{{ marks[i] && marks[i].pick ? '已涂 ' + marks[i].pick : '未涂' }}</span>
              </div>
            </div>
            <div class="pnl-btns">
              <button class="btn btn-gh" @click="sheetShow = false">← 回题目</button>
              <span class="es-count">已涂 {{ answeredCount }} / {{ questions.length }}</span>
              <button class="btn btn-pri" @click="sheetShow = false; askFinish()">📤 交卷</button>
            </div>
          </div>
        </div>
      </Teleport>

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
