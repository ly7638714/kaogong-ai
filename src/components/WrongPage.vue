<script setup>

import { ref, reactive, computed, watch, onUnmounted, nextTick } from 'vue'
import { store, saveWqs, addWrong, dedupeWrongs } from '../store'
import { showToast } from '../utils/toast'
import { useAi } from '../utils/useAi'
const { run: aiRun } = useAi()
import { safeGet, safeSet, KEYS } from '../utils/storage'
import { exportObsidianMd, copyObsidianWrong, exportAnkiCsv } from '../utils/export'
import { chatOnce, supportsVision } from '../api'
import { extractChoices, answerLetter } from '../utils/quiz'
import { renderMd } from '../utils/renderMd'
import { mountCharts } from '../utils/chartMount' // 统计图(ECharts)：错题详情/重做/卡片等视图渲染后也要挂载
import { cleanTextKeepFigures } from '../utils/wrongText'
import { genTutuQuestion } from '../utils/tutuGen' // 图推缺失图形时的本地确定性重建
const md = (t) => renderMd(t || '')
import { ankiAddNote } from '../utils/ankiConnect'
import { addPoints as petAddPoints, buildWrongAnalysis, petAnalyzeCurrent } from '../utils/pet'
import { GENERIC_REASONS, SUBJ_REASONS } from '../data/wrongReasons'
import { PLATE_LIST, detectSubType } from '../utils/askAssist'
import WrongVault from './WrongVault.vue'
import WrongList from './WrongList.vue'
import WrongDetail from './WrongDetail.vue'
import WrongRedo from './WrongRedo.vue'
import WrongFocus from './WrongFocus.vue'
import WrongCards from './WrongCards.vue'
import WrongReason from './WrongReason.vue'
import WrongTypeStrength from './WrongTypeStrength.vue'

const cur = ref(-1),
  show = ref(false)
const rep = ref(false)
const frm = ref({ answer: '', method: '', note: '', sel: [] })
// ===== 卷库：全部历史卷子 + 出题集（查看/重做/导出/删除） =====
const vaultOpen = ref(false)
const qcPapers = ref([])
const qcQuiz = ref([])
function loadVault() {
  qcPapers.value = safeGet(KEYS.PAPERS, [])
  qcQuiz.value = safeGet(KEYS.QUIZ_COL, [])
}
loadVault()
function saveVaultPapers() { safeSet(KEYS.PAPERS, qcPapers.value) }
function saveVaultQuiz() { safeSet(KEYS.QUIZ_COL, qcQuiz.value) }
function redoPaper(p) { store.pendingOpenPaper = p || null }
function redoQuizCol(c) {
  const p = {
    id: Date.now() + Math.random(), name: '二刷 · ' + c.subject, ts: Date.now(),
    questions: [{ subject: c.subject, difficulty: c.difficulty, variant: c.variant, stem: c.stem, options: (c.options || []).map((o) => ({ ...o })), answer: c.answer, explain: c.explain || '', designer: c.designer || '', picked: null, correct: null, timeout: false, err: false }]
  }
  store.pendingOpenPaper = p
}
function downloadText(t, n) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([t], { type: 'text/markdown;charset=utf-8' }))
  a.download = n
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}
function qToMd(q, i) {
  const l = ['## 第' + (i + 1) + '题 · ' + (q.subject || '') + (q.variant ? '（' + q.variant + '）' : ''), '', String(q.stem || ''), '']
  ;(q.options || []).forEach((o) => l.push(o.k + '. ' + o.t))
  l.push('', '**正确答案：' + q.answer + '**', '')
  if (q.explain) l.push('**解析：**' + String(q.explain).replace(/^#{1,6}\s*(✅\s*)?(答案解析|解析|答案详解)[^\n]*/gm, '').trim(), '')
  if (q.designer) l.push('🧠 **命题人设计说明：**' + q.designer, '')
  return l.join('\n')
}
function exportPaperMd(p) {
  const l = ['# ' + (p.name || '模拟卷'), '', '总题数：' + (p.questions || []).length + ' · 导出时间：' + new Date().toLocaleString(), '']
  ;(p.questions || []).forEach((q, i) => l.push(qToMd(q, i)))
  downloadText(l.join('\n'), (p.name || '模拟卷') + '.md')
  showToast('已导出 Markdown', 'success')
}
function exportQuizMd() {
  const l = ['# 出题集（' + qcQuiz.value.length + ' 题）', '']
  qcQuiz.value.forEach((c, i) => l.push(qToMd(c, i)))
  downloadText(l.join('\n'), '出题集.md')
  showToast('已导出出题集 Markdown', 'success')
}
function delVaultPaper(i) { qcPapers.value.splice(i, 1); saveVaultPapers() }
function delVaultQuiz(i) { qcQuiz.value.splice(i, 1); saveVaultQuiz() }
// 注：GENERIC_REASONS / SUBJ_REASONS 已外置至 data/wrongReasons.js（批次6B R4 零风险项）
// 当前错题板块的预设错因
function reasonsFor(subject) {
  return SUBJ_REASONS[subject] || GENERIC_REASONS
}
// 筛选状态
const fSubj = ref(''),
  fGroup = ref(''), // 六大板块分组筛选（判断推理=图推/定义/类比/逻辑 等）
  fRev = ref('all'),
  fReason = ref(''),
  fSub = ref('') // 题型（板块下的具体子类，如 论证推理→加强/削弱）筛选
const ALL_SUBJ = [
  '判断推理', '言语理解', '资料分析', '数量关系', '常识判断', '政治理论',
  '定义判断', '类比推理', '图形推理'
]
// 错题筛选分组：六大板块 → 细分板块（与出题 SIX_GROUPS 同构）
const WRONG_GROUPS = [
  { label: '判断推理', subs: ['图形推理', '定义判断', '类比推理', '逻辑判断'] },
  { label: '言语理解', subs: ['片段阅读', '篇章阅读'] }, // 与 AI出题 ②细分板块 同构（旧数据无细分时归 言语理解 整体）
  { label: '数量关系', subs: ['数量关系'] },
  { label: '资料分析', subs: ['资料分析'] },
  { label: '常识判断', subs: ['常识判断'] },
  { label: '政治理论', subs: ['政治理论'] },
]
watch(fGroup, (v) => {
  const g = WRONG_GROUPS.find((x) => x.label === v)
  if (!g) { fSubj.value = ''; fSub.value = ''; return }
  // 题型强弱分布 chips 点击已自带「板块 + 细分」：若细分仍属于本组（或等于组名），不要覆盖，避免“点了没反应”
  const inside = fSubj.value && (fSubj.value === g.label || (g.subs || []).includes(fSubj.value))
  if (inside) return
  const subs = g.subs.filter((s) => subjList.value.includes(s))
  if (subs.length === 1) { fSubj.value = subs[0]; fSub.value = '' } else { fSubj.value = ''; fSub.value = '' }
})
const subjList = computed(() => {
  // 固定全部板块（含暂未收纳的），确保能查看/筛选各板块错题集
  const s = new Set(ALL_SUBJ)
  store.wqs.forEach((q) => q.subject && s.add(q.subject))
  return [...s]
})
const reasonList = computed(() => {
  const s = new Set()
  store.wqs.forEach((q) => (q.reasons || []).forEach((r) => s.add(r)))
  return [...s].filter(Boolean)
})
const stats = computed(() => {
  const t = store.wqs.length,
    r = store.wqs.filter((q) => q.reviewed).length
  return { t, rev: r, pend: t - r }
})
// 错题→细分板块（六大板块口径，与 AI出题一致）：新记录带 q.subx；旧记录按 subject 归位
//  - 言语理解 组的细分=片段阅读/篇章阅读；历史数据只有 subject=言语理解，无细分信息 → 归 言语理解（整体）
function wrongSubOf(q) {
  if (!q) return ''
  if (q.subx) return q.subx
  const s = String(q.subject || q.plate || '')
  if (s === '言语理解') return '言语理解'
  return s
}
// ===== 题型强弱分布（Request D Part 1）：把错题按板块→题型细分并统计 =====
// ===== 题型强弱分布（Request D Part 1）：把错题按板块→题型细分并统计 =====
// 优先用已存的 q.sub；旧错题无 sub 时实时用 detectSubType 推断（不修改原数据）。
function wrongTypeOf(q) {
  if (q && q.sub) return q.sub
  const plate = (q && (q.subject || q.plate)) || ''
  const text = q ? q.question || q.q || q.stem || '' : ''
  try {
    const r = detectSubType(String(text || ''), plate)
    return r && r.name ? r.name : '未分类'
  } catch (e) {
    return '未分类'
  }
}
// 聚合：plates=[{plate,total,subs:[{name,count,pct,t}]}]；topWeak=全局最薄弱题型 TOP5；maxCount=全题型最大错题数
const typeStats = computed(() => {
  const counts = {} // plate -> sub -> n
  let maxCount = 1
  for (const q of store.wqs) {
    const plate = q.subject || q.plate || '未分类'
    const sub = wrongTypeOf(q)
    if (!counts[plate]) counts[plate] = {}
    counts[plate][sub] = (counts[plate][sub] || 0) + 1
  }
  // 板块顺序：标准 9 大板块在前（按 PLATE_LIST），其余非标准板块（如旧数据别名）按出现顺序补在末尾
  const known = PLATE_LIST.filter((p) => counts[p])
  const extra = Object.keys(counts).filter((p) => !PLATE_LIST.includes(p))
  const plates = known.concat(extra)
  const list = []
  for (const plate of plates) {
    const subs = Object.keys(counts[plate])
      .map((name) => ({ name, count: counts[plate][name] }))
      .sort((a, b) => b.count - a.count)
    const total = subs.reduce((s, x) => s + x.count, 0)
    subs.forEach((s) => {
      if (s.count > maxCount) maxCount = s.count
    })
    list.push({ plate, total, subs })
  }
  const all = []
  list.forEach((p) => p.subs.forEach((s) => all.push({ plate: p.plate, name: s.name, count: s.count })))
  all.sort((a, b) => b.count - a.count)
  const topWeak = all.slice(0, 5)
  list.forEach((p) =>
    p.subs.forEach((s) => {
      s.pct = Math.round((s.count / p.total) * 100)
      s.t = maxCount > 1 ? (s.count - 1) / (maxCount - 1) : 0
    })
  )
  return { plates: list, topWeak, maxCount }
})
// 题型筛选：点题型看板 → 设板块+题型筛选并滚动到列表；再点取消
function setTypeFilter(plate, sub) {
  // 同步板块分组：让顶部三连筛选与看板 chips 状态一致（chips 直接给细分/题型，组由板块反查）
  const g = WRONG_GROUPS.find((x) => x.label === plate || (x.subs || []).includes(plate))
  fGroup.value = g ? g.label : ''
  fSubj.value = plate
  fSub.value = sub
  kw.value = ''
  pageN.value = 1
  setTimeout(() => {
    const el = document.getElementById('wqFilters')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, 60)
}
function clearTypeFilter() {
  fGroup.value = ''
  fSubj.value = ''
  fSub.value = ''
  pageN.value = 1
}
// ===== 列表可定位：关键词搜索 / 排序 / 分页 / 序号 / 跳转 =====
const kw = ref('')
const sortBy = ref('time') // time=最新优先 | wrong=错得多优先 | mastery=掌握低优先
const PAGE = 20
const pageN = ref(1)
const filtered = computed(() => {
  let list = store.wqs.filter((q) => {
    if (fSubj.value && wrongSubOf(q) !== fSubj.value) return false
    if (fRev.value === 'rev' && !q.reviewed) return false
    if (fRev.value === 'pend' && q.reviewed) return false
    if (fReason.value && !(q.reasons || []).includes(fReason.value)) return false
    if (fSub.value && wrongTypeOf(q) !== fSub.value) return false
    const k = kw.value.trim().toLowerCase()
    if (k) {
      const hay = [q.question || q.q || q.stem || '', q.answer || '', q.explain || q.analysis || '', (q.reasons || []).join(' '), q.method || '', q.note || ''].join(' ').toLowerCase()
      if (!hay.includes(k)) return false
    }
    return true
  })
  if (sortBy.value === 'wrong') list = list.slice().sort((a, b) => (b.wrongCount || 1) - (a.wrongCount || 1))
  else if (sortBy.value === 'mastery') list = list.slice().sort((a, b) => masteryOf(a) - masteryOf(b))
  else list = list.slice().sort((a, b) => (b.at || 0) - (a.at || 0))
  return list
})
const shown = computed(() => filtered.value.slice(0, pageN.value * PAGE))
const shownTotal = computed(() => filtered.value.length)
function loadMore() { pageN.value++ }
const jumpN = ref('')
function jumpTo() {
  const n = parseInt(jumpN.value, 10)
  if (!n || n < 1 || n > filtered.value.length) { showToast('请输入 1-' + filtered.value.length + ' 之间的序号', 'info'); return }
  openRaw(store.wqs.indexOf(filtered.value[n - 1]))
  jumpN.value = ''
}
function resetFilters() { fGroup.value = ''; fSubj.value = ''; fRev.value = 'all'; fReason.value = ''; fSub.value = ''; kw.value = ''; sortBy.value = 'time'; pageN.value = 1 }
// 一键去重：完全相同的错题只保留一道
function dedupeNow() {
  const n = dedupeWrongs()
  pageN.value = 1
  if (n > 0) showToast('🧹 已合并完全相同的错题，删除 ' + n + ' 条重复', 'success')
  else showToast('✅ 错题集没有完全相同的重复题', 'info')
}

function openIdx(i) {
  openRaw(store.wqs.indexOf(shown.value[i]))
} // 用 filter 后索引定位原序错题
// ===== 二刷 / 三刷 / 掌握度（支持直接点选项作答）=====
const redo = ref(false)
const redoResult = ref('') // '' | 'ok' | 'no'
const redoT = ref(0)
const redoPick = ref('')
let redoTimer = null
const redoQ = computed(() => (cur.value >= 0 ? store.wqs[cur.value] : null))
const redoChoices = computed(() => {
  const q = redoQ.value
  return q ? extractChoices(q.question || '') : []
})
const redoAnswer = computed(() => {
  const q = redoQ.value
  return q ? answerLetter(q.answer || '') : ''
})
const redoHasChoice = computed(() => redoChoices.value.length >= 2 && !!redoAnswer.value)
const redoHistory = computed(() => (redoQ.value && redoQ.value.redoHistory) || [])
function openRedo() {
  const q = redoQ.value
  if (!q) return
  show.value = false
  redoResult.value = ''
  redoPick.value = ''
  redoT.value = 0
  redo.value = true
  // 二刷/三刷同样支持萌宠「读题」：只读题干+选项，不念解析（避免剧透答案）
  store.curQ = { plate: q.plate || q.subject, subject: q.subject || q.plate, kind: q.kind || q.variant || '', stem: q.q || q.stem || q.text, options: q.options || [], answer: q.answer || q.ans || q.correct || '', explain: q.explain || q.analysis || '', your: q.your || q.answerUser || '', ok: false }
  store.readCtx = { type: 'redo', title: ((q.redoHistory || []).length ? '三刷' : '二刷') + '·' + (q.plate || q.subject || '行测'), text: buildRedoReadable(q) }
  if (redoTimer) clearInterval(redoTimer)
  redoTimer = setInterval(() => {
    redoT.value++
  }, 1000)
}
function closeRedo() {
  redo.value = false
  if (redoTimer) {
    clearInterval(redoTimer)
    redoTimer = null
  }
}
onUnmounted(() => { if (redoTimer) clearInterval(redoTimer) })
function fmtT(s) {
  const m = Math.floor(s / 60)
  const ss = s % 60
  return String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0')
}
function applyRedo(q, correct, sec, picked) {
  q.redoHistory = q.redoHistory || []
  q.redoHistory.push({ at: new Date().toLocaleString(), ok: correct, t: sec, pick: picked || '' })
  if (q.redoHistory.length > 10) q.redoHistory = q.redoHistory.slice(-10)
  q.correctStreak = correct ? (q.correctStreak || 0) + 1 : 0
  q.wrongCount = (q.wrongCount || 1) + (correct ? 0 : 1)
  q.lastRedo = new Date().toLocaleString()
  q.lastRedoAt = Date.now()
  q.redoTime = sec
  q.mastery = Math.min(100, (q.correctStreak || 0) * 50)
  if ((q.correctStreak || 0) >= 2) q.digested = true
  else if (!correct) q.digested = false
  saveWqs()
  petAddPoints(2)
}
function submitRedo(correct, picked) {
  const q = redoQ.value
  if (!q || redoResult.value) return
  redoResult.value = correct ? 'ok' : 'no'
  redoPick.value = picked || ''
  if (redoTimer) {
    clearInterval(redoTimer)
    redoTimer = null
  }
  applyRedo(q, correct, redoT.value, picked || '')
  if (!correct) {
    store.curQ = { ...store.curQ, your: picked || '', ok: false }
    petAnalyzeCurrent({ redo: true })
  }
}
function submitByChoice(k) {
  const q = redoQ.value
  if (!q || redoResult.value) return
  const correct = k === redoAnswer.value
  redoResult.value = correct ? 'ok' : 'no'
  redoPick.value = k
  if (redoTimer) {
    clearInterval(redoTimer)
    redoTimer = null
  }
  applyRedo(q, correct, redoT.value, k)
  if (!correct) {
    store.curQ = { ...store.curQ, your: k, ok: false }
    petAnalyzeCurrent({ redo: true })
  }
}
function masteryOf(q) {
  if (!q) return 0
  return q.digested ? 100 : q.mastery || 0
}
function redoFeedback(q) {
  if (!q) return ''
  const hist = q.redoHistory || []
  if (redoResult.value === 'ok') {
    return hist.slice(0, -1).some((h) => !h.ok) ? '上次二刷还错了，这次已纠正，继续保持！' : ''
  }
  return hist.length > 1 ? '😥 再次答错（第 ' + hist.length + ' 次二刷仍错）' : '首次二刷答错'
}
// ===== 错题抽认卡（闪卡轮播）=====
const cardShow = ref(false)
const cardIdx = ref(0)
const cardFlip = ref(false)
const cardQueue = ref([])
function openCards() {
  cardQueue.value = shown.value.slice()
  cardIdx.value = 0
  cardFlip.value = false
  cardShow.value = true
}
function nextCard() {
  cardFlip.value = false
  if (cardIdx.value < cardQueue.value.length - 1) cardIdx.value++
  else cardShow.value = false
}
function cardMark(ok) {
  const q = cardQueue.value[cardIdx.value]
  if (!q) return
  applyRedo(q, ok, 0, '')
  showToast(ok ? '✅ 记住了' : '❌ 没记住（已计错）', ok ? 'success' : 'error')
  nextCard()
}
// ===== 今日优先 5 题 =====
const focusShow = ref(false)
const focusList = ref([])
function todayFocus() {
  const scored = store.wqs.map((q) => {
    const days = q.lastRedoAt ? Math.min(30, Math.floor((Date.now() - q.lastRedoAt) / 86400000)) : 30
    const score = (q.wrongCount || 1) * 3 + days + (q.digested ? -20 : 0) + (q.reviewed ? 0 : 2)
    return { q, score }
  })
  scored.sort((a, b) => b.score - a.score)
  focusList.value = scored.slice(0, 5).map((s) => s.q)
  focusShow.value = true
}
function focusRedo(q) {
  const i = store.wqs.indexOf(q)
  if (i < 0) return
  focusShow.value = false
  cur.value = i
  openRedo()
}

function openRaw(idx) {
  if (idx < 0) return
  cur.value = idx
  show.value = true
  rep.value = false
  const q = store.wqs[idx] || {}
  frm.value = { answer: q.answer || '', method: q.method || '', note: q.note || '', sel: (q.reasons || []).slice() }
  store.curWrongIdx = idx
  store.curQ = { plate: q.plate || q.subject, subject: q.subject || q.plate, kind: q.kind || q.variant || '', stem: q.q || q.stem || q.text, options: q.options || [], answer: q.answer || q.ans || q.correct || '', explain: q.explain || q.analysis || '', your: q.your || q.answerUser || '', ok: false }
  store.readCtx = { type: 'wrong', title: '错题复盘·' + (q.plate || q.subject || '行测'), text: buildWrongReadable(q) }
}
function buildWrongReadable(q) {
  const opts = (q.options || []).map((o, i) => String(i === 0 ? 'A' : String.fromCharCode(64 + i + 1)) + '、' + String(o.t || '').replace(/<[^>]+>/g, ' ')).join('。')
  return ((q.q || q.stem || q.text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() + '。' + opts + '。' + buildWrongAnalysis(q)).slice(0, 1400)
}
// 二刷/三刷朗读用：只读题干+选项，不含解析
function buildRedoReadable(q) {
  const opts = (q.options || []).map((o, i) => String(i === 0 ? 'A' : String.fromCharCode(64 + i + 1)) + '、' + String(o.t || '').replace(/<[^>]+>/g, ' ')).join('。')
  return ((q.q || q.stem || q.text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() + '。' + (opts ? '选项：' + opts + '。' : '')).slice(0, 1200)
}
function toggleReason(r) {
  const i = frm.value.sel.indexOf(r)
  if (i >= 0) {
    frm.value.sel.splice(i, 1)
  } else {
    frm.value.sel.push(r)
  }
}
function removeReason(r) {
  const i = frm.value.sel.indexOf(r)
  if (i >= 0) frm.value.sel.splice(i, 1)
  const j = userReasons.value.indexOf(r)
  if (j >= 0) { userReasons.value.splice(j, 1); persistReasons() }
  showToast('已删除错因「' + r + '」（本题已移除，其他题若标记过同名字符串不再显示于自定义池）', 'info')
}
// 弹窗（复用 reasonModal）：mode='reasons'（AI 新因替换询问）| mode='rename'（改错因名）
const reasonModal = ref(null)
function renameReason(r) {
  reasonModal.value = { mode: 'rename', r, resolve: (neu) => {
    const v = String(neu || '').trim()
    if (!v || v === r) { reasonModal.value = null; return }
    const i = frm.value.sel.indexOf(r)
    if (i >= 0) frm.value.sel[i] = v
    const j = userReasons.value.indexOf(r)
    if (j >= 0) { userReasons.value[j] = v; persistReasons() }
    reasonModal.value = null
    showToast('已改名：' + r + ' → ' + v, 'success')
  } }
}
const renameInput = ref('')
function openRename(r) { renameInput.value = r; renameReason(r) }
// 用户自定义错因（持久化到 localStorage，跨板块复用）
const userReasons = ref([])
const customReason = ref('')
try {
  const saved = JSON.parse(localStorage.getItem('xc_wq_reasons') || '[]')
  if (Array.isArray(saved)) userReasons.value = saved
} catch (e) {}
function persistReasons() {
  try {
    localStorage.setItem('xc_wq_reasons', JSON.stringify(userReasons.value))
  } catch (e) {}
}
// 当前错题板块可选的错因：预设候选 + 已勾选 + 收纳盒（历史积累）
const reasonBoxOpen = ref(false)
const presetReasons = computed(() => {
  const q = cur.value >= 0 ? store.wqs[cur.value] : null
  return (q ? reasonsFor(q.subject) : GENERIC_REASONS).slice()
})
// 收纳盒：用户自定义池里「非预设且未勾选」的历史错因，默认折叠，可展开删改
const boxReasons = computed(() => userReasons.value.filter((r) => !presetReasons.value.includes(r) && !frm.value.sel.includes(r)))
const presetBoxOpen = ref(false)
// 顶部始终显示：本题已勾选的全部错因（预设勾选无删改；自定义/AI 勾选带 ✎✕）
const checkedAllReasons = computed(() => frm.value.sel.slice())
// ===== AI 引导找错因（科学决策：引导用户自己发现错因，而非直接给答案）=====
const aiGuideBusy = ref(false)
const guideText = ref('')
async function askAiGuide() {
  const q = cur.value >= 0 ? store.wqs[cur.value] : null
  if (!q || aiGuideBusy.value) return
  const ctx = origCtx()
  const myAnswer = String(q.your || q.answerUser || '').trim()
  const rightAns = String(q.answer || q.ans || q.correct || '').trim()
  const analysis = String(q.explain || q.analysis || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 600)
  aiGuideBusy.value = true
  guideText.value = ''
  const out = await aiRun(async (c) => {
    const sys = '你是行测资深讲师。请**引导**考生自己发现错因，而不是直接给结论：围绕"我错在哪一步、我当时是怎么想的、正确的判断标准是什么"提出 2-3 个层层递进的问题，让考生自己回答后自然得出错因。'
    const userContent = `板块：${q.subject || '未分类'}\n题干：${(ctx.text || '').slice(0, 500)}\n我的作答：${myAnswer || '（未记录）'}\n正确答案：${rightAns || '（未知）'}\n正确解析：${analysis || '（无）'}\n\n请只输出引导问题（200 字内），不要给答案，不要说"你可以这样归纳"。`
    return String((await chatOnce(c, [{ role: 'user', content: sys + '\n' + userContent }], 500, 30000)) || '').trim() || '（AI 未返回，请重试）'
  }, { onError: (e) => { guideText.value = 'AI 引导失败：' + (e && e.message) } })
  if (out != null) guideText.value = out
  aiGuideBusy.value = false
}
// ===== AI 规范化自定义错因：把口语化表述改写成专业化、可指导下次避免 =====
const aiPolishBusy = ref(false)
async function aiPolishReason() {
  const raw = customReason.value.trim()
  if (!raw) { showToast('先在输入框写下你的原因，再点「✨ 规范化」', 'info'); return }
  if (aiPolishBusy.value) return
  aiPolishBusy.value = true
  const reply = await aiRun(async (c) => {
    const sys = '你是行测错因整理专家。把考生口语化的错因改写成专业、具体、可指导下次避免的表述（1-2 条），只输出 JSON 数组，如 ["…", "…"]，不要多余文字。'
    return await chatOnce(c, [{ role: 'user', content: sys + '\n\n我的原话：' + raw }], 400, 30000)
  }, { keyHint: '文字模型' })
  if (reply == null) { aiPolishBusy.value = false; return }
  try {
    let arr = null
    try { arr = JSON.parse(String(reply || '').trim()) } catch (e) { const m = String(reply || '').match(/\[[\s\S]*\]/); if (m) { try { arr = JSON.parse(m[0]) } catch (_) {} } }
    const list = Array.isArray(arr) ? arr.map((x) => String(x).trim()).filter(Boolean) : []
    if (!list.length) { showToast('规范化失败：' + String(reply || '').slice(0, 60), 'error'); return }
    list.forEach((v) => {
      if (!frm.value.sel.includes(v)) frm.value.sel.push(v)
      if (!userReasons.value.includes(v)) { userReasons.value.push(v); persistReasons() }
    })
    customReason.value = ''
    showToast('✨ 已规范化并加入错因：' + list.join('；'), 'success')
  } catch (e) {
    showToast('规范化失败：' + (e && e.message), 'error')
  } finally {
    aiPolishBusy.value = false
  }
}
function addCustomReason() {
  const r = customReason.value.trim()
  if (!r) {
    showToast('请输入错因内容', 'info')
    return
  }
  if (!userReasons.value.includes(r)) {
    userReasons.value.push(r)
    persistReasons()
  }
  if (!frm.value.sel.includes(r)) frm.value.sel.push(r)
  customReason.value = ''
}
// ===== 深度复盘增强 =====
// ① 复盘完整性自检：还缺哪些关键项（帮助彻底吃透）
const reviewGaps = computed(() => {
  if (cur.value < 0) return []
  const f = frm.value
  const gaps = []
  if (!String(f.answer || '').trim()) gaps.push('正确答案')
  if (!(f.sel || []).length) gaps.push('错因')
  if (!String(f.method || '').trim()) gaps.push('秒杀规律')
  if (!String(f.note || '').trim()) gaps.push('笔记')
  return gaps
})
// ② 同类错题联动：同板块且共享任一错因的其他错题，一键连看吃透
const relatedQs = computed(() => {
  if (cur.value < 0) return []
  const q = store.wqs[cur.value]
  if (!q || !q.subject) return []
  const mine = (q.reasons || []).filter(Boolean)
  return store.wqs
    .map((x, i) => ({ x, i, share: mine.filter((r) => (x.reasons || []).includes(r)).length }))
    .filter(({ x, i }) => i !== cur.value && x.subject === q.subject)
    .sort((a, b) => b.share - a.share)
    .slice(0, 6)
})
function openRelated(i) {
  openRaw(i)
}
// ③ 变式训练：优先从「当前用户错题集」挑同类题（同板块·共享错因，最多3道）；错题集没有 → AI 按此题出新变式（累计最多3道）
// ===== 变式训练·答题卡模式：选题量(1-3) → 逐题作答(可改) → 提交答题卡统一批改 → 全错时原题×变式横向复盘 =====
const vtShow = ref(false)
const vtBusy = ref(false)
const vtMode = ref('pick') // pick(选题量) | do(答题卡作答) | result(批改)
const vtCount = ref(3)
const vtQueue = ref([])
const vtIdx = ref(0)
const vtPick = ref('')
const vtAnswers = ref({}) // 题号 -> 作答（选项字母；无选项题用 对/错）
const vtScore = ref(0)
const vtOpen = ref({}) // 批改结果里展开的解析题号
const vtQ = computed(() => vtQueue.value[vtIdx.value] || null)
const vtMax = computed(() => Math.min(3, Math.max(1, vtQueue.value.length || 3)))
const vtAllWrong = computed(() => vtMode.value === 'result' && vtQueue.value.length > 0 && vtScore.value === 0)
const origStem = computed(() => {
  const q = cur.value >= 0 ? store.wqs[cur.value] : null
  return q ? String(q.question || q.q || q.stem || '').replace(/<[^>]+>/g, ' ').trim().slice(0, 260) : ''
})
function wrongToVt(wq) {
  const choices = extractChoices(wq.question || '')
  return {
    stem: cleanTextKeepFigures(wq.question || wq.q || wq.stem || ''),
    options: choices,
    answer: (choices.length >= 2 ? answerLetter(wq.answer || '') : String(wq.answer || '').trim().toUpperCase()) || 'A',
    explain: String(wq.explain || wq.analysis || '') + (wq.designer ? '\n🧠 命题意图与陷阱：' + wq.designer : '') + (wq.method ? '\n⚡ 秒杀：' + wq.method : ''),
    source: 'lib', subject: wq.subject || '未分类'
  }
}
function startVariant() {
  const q = cur.value >= 0 ? store.wqs[cur.value] : null
  if (!q || vtBusy.value) return
  const lib = relatedQs.value.slice(0, 3).map((r) => wrongToVt(r.x))
  vtQueue.value = lib
  vtMode.value = 'pick'
  vtCount.value = Math.min(3, Math.max(1, lib.length || 3))
  vtAnswers.value = {}
  vtScore.value = 0
  vtOpen.value = {}
  vtIdx.value = 0
  vtPick.value = ''
  vtShow.value = true
}
function vtStartDo() {
  const n = vtCount.value
  if (vtQueue.value.length) {
    vtQueue.value = vtQueue.value.slice(0, n)
    vtMode.value = 'do'
    vtIdx.value = 0
    vtPick.value = ''
    vtAnswers.value = {}
  } else {
    // 错题集无同类 → AI 按题量生成
    vtBusy.value = true
    vtMode.value = 'do'
    vtQueue.value = []
    vtIdx.value = 0
    vtPick.value = ''
    vtAnswers.value = {}
    generateAiVariants(n)
  }
}
async function generateAiVariants(n) {
  try {
    for (let i = 0; i < n; i++) {
      const item = await vtAskAi()
      if (item) vtQueue.value.push(item)
      else break
    }
    if (!vtQueue.value.length) { vtClose(); return }
    vtIdx.value = 0
    vtPick.value = ''
    showToast('🤖 已生成 ' + vtQueue.value.length + ' 道 AI 变式，开始作答', 'success')
  } finally {
    vtBusy.value = false
  }
}
async function vtAskAi() {
  const q = cur.value >= 0 ? store.wqs[cur.value] : null
  if (!q) return null
  const reply = await aiRun(async (c) => {
    const sys = '你是行测命题老师。请基于原题出一道【考点题型完全相同、题干素材全新】的变式检验题，严格只输出 JSON：{"stem":"题干（含完整 A/B/C/D 四个选项）","answer":"正确选项字母（A-D）","explain":"解题思路 + 考点 + 干扰项陷阱，200 字内"}。注意：JSON 字符串内禁止使用英文双引号，需要强调的词请用中文引号「」或『』，四个选项用换行分隔。'
    const stem = String(q.question || q.q || q.stem || '').replace(/<[^>]+>/g, ' ').slice(0, 700)
    return await chatOnce(c, [{ role: 'user', content: sys + '\n\n【原题】' + stem + '\n【原答案】' + (q.answer || '') }], 900, 30000)
  }, { keyHint: '文字模型' })
  if (reply == null) return null
  let obj = null
  const rawTxt = String(reply || '').replace(/```json|```/g, '').trim()
  try { obj = JSON.parse(rawTxt) } catch (e) {}
  if (!obj) { const m = rawTxt.match(/\{[\s\S]*\}/); if (m) { try { obj = JSON.parse(m[0]) } catch (e) {} } }
  if (!obj) {
    const stem2 = (rawTxt.match(/"stem"\s*:\s*"([\s\S]*?)"\s*,\s*"answer"/) || [])[1]
    const answer = (rawTxt.match(/"answer"\s*:\s*"([^"]*)"/) || [])[1]
    const explain = (rawTxt.match(/"explain"\s*:\s*"([\s\S]*?)"\s*}$/) || [])[1]
    if (stem2 && answer) obj = { stem: stem2.replace(/""/g, '"'), answer, explain: explain || '' }
  }
  if (!obj || String(obj.stem || '').length <= 20) { showToast('变式生成失败：' + String(reply || '').slice(0, 50), 'error'); return null }
  return {
    stem: String(obj.stem).replace(/<[^>]+>/g, ' ').trim(),
    answer: String(obj.answer || '').trim().toUpperCase(),
    explain: String(obj.explain || ''),
    source: 'ai', subject: (q.subject || '未分类'),
    options: extractChoices(String(obj.stem))
  }
}
function vtChoose(k) {
  if (!vtQ.value || vtMode.value !== 'do') return
  vtPick.value = k
  vtAnswers.value[vtIdx.value] = k
}
function vtNav(delta) {
  const ni = vtIdx.value + delta
  if (ni < 0 || ni >= vtQueue.value.length) return
  vtIdx.value = ni
  vtPick.value = vtAnswers.value[ni] || ''
}
function vtGo(i) {
  if (i < 0 || i >= vtQueue.value.length) return
  vtIdx.value = i
  vtPick.value = vtAnswers.value[i] || ''
}
function vtResultOf(i) {
  const q = vtQueue.value[i]
  const a = vtAnswers.value[i]
  if (!q || !a) return 'no'
  if ((q.options || []).length >= 2) return a === q.answer ? 'ok' : 'no'
  return a === '对' ? 'ok' : 'no'
}
function vtSubmit() {
  const unanswered = vtQueue.value.filter((_, i) => !vtAnswers.value[i]).length
  if (unanswered) { showToast('还有 ' + unanswered + ' 题未作答，请全部做完再提交答题卡', 'info'); return }
  vtScore.value = vtQueue.value.reduce((s, _q, i) => s + (vtResultOf(i) === 'ok' ? 1 : 0), 0)
  vtMode.value = 'result'
}
function vtToggleOpen(i) { vtOpen.value[i] = !vtOpen.value[i] }
function vtClose() {
  vtShow.value = false
  vtQueue.value = []
  vtBusy.value = false
  vtAnswers.value = {}
  vtScore.value = 0
  vtOpen.value = {}
  vtMode.value = 'pick'
}
// 答错的 AI 变式 → 一键加入错题集（错题集来源的同类题已在错题本，无需重复）
function vtAddWrong(i) {
  const q = vtQueue.value[i]
  if (!q) return
  if (q.source !== 'ai') { showToast('这是来自错题集的同类题，已在错题本中', 'info'); return }
  const base = cur.value >= 0 ? store.wqs[cur.value] : null
  addWrong({
    id: Date.now(),
    time: new Date().toLocaleString(),
    subject: q.subject || (base && base.subject) || '未分类',
    question: q.stem,
    answer: q.answer,
    explain: q.explain,
    your: vtAnswers.value[i] || '',
    wrongCount: 1,
    reviewed: false,
    imgs: []
  })
  saveWqs()
}
// ===== 第 6 步 · 回到原题深度巩固：分板块「核心骨架」记忆要点（记骨架不记答案） =====
const CORE_TEMPLATES = {
  '逻辑判断': { tag: '推理骨架', points: ['骨架：先锁定「论点 → 论据 → 论证方式」三者，再谈削弱/加强', '力度排序：否定论点 > 拆桥 > 否定论据 > 另有他因；加强 = 建立因果/排除他因', '陷阱：偷换概念 / 过度推断 / 因果倒置 / 诉诸无知', '记忆锚点：先画论证骨架图，再逐项对照力度'] },
  '图形推理': { tag: '特征→规律', points: ['骨架：先看图形特征定大类（位置/样式/属性/数量），再细化规律', '位置=平移/旋转/翻转；样式=叠加/去同存异/黑白运算；属性=对称/曲直/开闭；数量=点线面/笔画/素', '规律必须验证到最后一张图，避免局部化', '记忆锚点：特征词 → 考点映射表'] },
  '定义判断': { tag: '要件匹配', points: ['骨架：圈出定义的关键要件（主体/客体/方式/目的/条件）', '逐项对照要件，全部满足才选，缺一个即排除', '陷阱：「不属于/不符合」反向选；把"未提及"当"不符合"', '记忆锚点：要件清单对照法'] },
  '类比推理': { tag: '词间关系', points: ['骨架：先定一级关系（语义/逻辑/语法/对应），再二级辨析（程度/褒贬/主体/场所）', '语义=近义/反义/象征；逻辑=因果/并列/包含/交叉；对应=功能/材料/场所/来源', '陷阱：二级关系没辨析、词性不对应', '记忆锚点：一关系二辨析'] },
  '言语理解': { tag: '行文脉络/语义关系', points: ['逻辑填空：先看逻辑关系词（转折/递进/并列/解释）再选词，注意成语/实词固定搭配与积累', '片段阅读：先划行文脉络（背景/问题/对策/结论）找主旨句，警惕程度超越/偷换主体/无中生有', '陷阱：凭语感先入为主、同义替换没抓住主体与范围', '记忆锚点：逻辑填空记语义关系+搭配，片段阅读记脉络+主旨句'] },
  '资料分析': { tag: '考点→公式→速算', points: ['骨架：提问词定考点（基期/增长量/增长率/比重/平均/倍数）→ 锁定时间指标单位 → 套公式', '公式骨架：基期=B/(1+r)；增量=B×r/(1+r)；比重=A/B；平均=总量/个数', '速算：|r|≤5% 化除为乘、r≈1/n 份数、截位直除', '陷阱：时间/单位/基数/方向四类', '记忆锚点：先判题型再找数，先看选项差距再速算'] },
  '数量关系': { tag: '题型→秒杀', points: ['骨架：读题先识别题型（工程/行程/经济/排列组合/浓度/容斥）', '秒杀优先：整除/倍数/赋值/代入排除，凑整思维', '方程：设未知数列等量关系，鸡兔同笼假设法', '记忆锚点：15秒识别不了就跳过，先做必拿题'] },
  '常识判断': { tag: '领域+易错', points: ['骨架：定位领域（政治/法律/科技/人文/地理/经济/时政）', '法律=主体/时间/程度核对；时政=高频规范表述', '陷阱：张冠李戴 / 绝对化 / 时间错位', '记忆锚点：四要素核对（对象/时间/数量/程度）'] },
  '政治理论': { tag: '规范表述', points: ['骨架：识别时政语境与高频规范表述', '注意固定提法与官方表述，不凭字面推', '记忆锚点：语境提示词+固定搭配'] }
}
const coreCard = computed(() => {
  const q = cur.value >= 0 ? store.wqs[cur.value] : null
  if (!q) return null
  const tpl = CORE_TEMPLATES[q.subject || ''] || { tag: '核心骨架', points: ['骨架：按「题型 → 结构/公式 → 陷阱」拆解本题', '结合解析提炼一句话记忆锚点', '把同板块错题放一起横向对比巩固'] }
  return { subject: q.subject || '未分类', tag: tpl.tag, points: tpl.points }
})
const coreOrigMd = computed(() => {
  const q = cur.value >= 0 ? store.wqs[cur.value] : null
  return q ? String(q.question || q.q || q.stem || '') : ''
})
const coreAiBusy = ref(false)
const coreAiText = ref('')
async function askCoreDeep() {
  const q = cur.value >= 0 ? store.wqs[cur.value] : null
  if (!q || coreAiBusy.value) return
  const tpl = CORE_TEMPLATES[q.subject || ''] || CORE_TEMPLATES['常识判断']
  coreAiBusy.value = true
  coreAiText.value = ''
  const out = await aiRun(async (c) => {
    const sys = '你是行测名师。请针对这道题做「骨架式深度巩固」——帮用户记住题目的骨架与核心知识点（不是记答案）。输出：1)【考点】一句话点明；2)【骨架/结构】分步拆解；3)【' + (q.subject || '该板块') + '记忆核心要点】2-3 条结合本题的针对性要点；4)【一句话记忆锚点】。'
    const stem = String(q.question || q.q || q.stem || '').replace(/<[^>]+>/g, ' ').slice(0, 600)
    return String((await chatOnce(c, [{ role: 'user', content: sys + '\n\n【题目】' + stem + '\n\n板块要点参考：' + tpl.points.join('；') }], 700, 30000)) || '').trim() || '（AI 未返回，请重试）'
  }, { onError: (e) => { coreAiText.value = 'AI 剖析失败：' + (e && e.message) } })
  if (out != null) coreAiText.value = out
  coreAiBusy.value = false
}
// 全错 → AI 深度横向比较复盘（原题 × 各变式）
const vtCmpBusy = ref(false)
const vtCmpText = ref('')
async function vtDeepCompare() {
  const base = cur.value >= 0 ? store.wqs[cur.value] : null
  if (!base || vtCmpBusy.value) return
  vtCmpBusy.value = true
  vtCmpText.value = ''
  const out = await aiRun(async (c) => {
    const orig = String(base.question || '').replace(/<[^>]+>/g, ' ').slice(0, 420)
    const vars = vtQueue.value.map((q, i) => '变式' + (i + 1) + '：' + String(q.stem).slice(0, 300)).join('\n')
    const sys = '你是行测名师。用户原题和变式题全部做错，请做「横向比较复盘」帮其突破瓶颈：1) 一句话点出这组题共同的考点与命题套路；2) 用对比方式指出原题与每道变式的共同点与差异点（改了什么参数/换了什么素材/陷阱如何迁移）；3) 给出一条能贯穿所有题的「核心突破口」口诀。'
    return String((await chatOnce(c, [{ role: 'user', content: sys + '\n\n【原题】' + orig + '\n\n' + vars }], 700, 30000)) || '').trim() || '（AI 未返回，请重试）'
  }, { onError: (e) => { vtCmpText.value = '对比失败：' + (e && e.message) } })
  if (out != null) vtCmpText.value = out
  vtCmpBusy.value = false
}
// 卷面化：题干与选项拆分（错题详情像卷子一样展示：题干问法 + 每选项独占一行）
function splitPaper(text) {
  // 复盘题干分区：保留 svg 围栏与表格换行（cleanTextKeepFigures），只按行首选项标记切分题干/选项
  const t = cleanTextKeepFigures(text)
  const opts = extractChoices(t)
  const lineRe = /^\s*[*_`]*\s*([A-D])[.、．:：]/
  const lines = t.split('\n')
  let first = -1
  for (let i = 0; i < lines.length; i++) { if (lineRe.test(lines[i])) { first = i; break } }
  let stem = ''
  if (first > 0) stem = lines.slice(0, first).join('\n')
  else if (first === 0) { const mm = t.match(/([A-D])[.、．:：]/); stem = mm ? t.slice(0, mm.index) : '' }
  else stem = t
  stem = String(stem || '').replace(/^#{1,6}\s*(✅\s*)?(题目|📝|题干)[^\n]*\n?/i, '').trim()
  return { stem: stem || t, opts }
}
const paperView = computed(() => {
  const q = cur.value >= 0 ? store.wqs[cur.value] : null
  if (!q) return { stem: '', opts: [] }
  return splitPaper(q.question || q.q || q.stem || '')
})
function save() {
  if (cur.value < 0) return
  const q = store.wqs[cur.value]
  q.answer = frm.value.answer.trim()
  q.method = frm.value.method.trim()
  q.note = frm.value.note.trim()
  q.reasons = frm.value.sel
  q.reviewed = !!(q.answer || q.method || q.note)
  q.reviewedAt = Date.now()
  saveWqs()
  if (q.reviewed) petAddPoints(5) // 批次8·萌宠成长绑定：完成复盘+5成长值
  showToast('✅ 已保存复盘' + (q.reviewed ? '（萌宠 +5 成长）' : ''), 'success')
}
function del() {
  if (cur.value < 0) return
  if (!confirm('确定删除这道错题？')) return
  store.wqs.splice(cur.value, 1)
  saveWqs()
  cur.value = -1
  show.value = false
  showToast('已删除错题', 'info')
}
async function ankiPush() {
  const q = store.wqs[cur.value]
  if (!q) return
  try {
    const front = (q.question || '').slice(0, 1000)
    const back = ['答案：' + (q.answer || '未填'), q.designer ? '命题意图：' + q.designer : '', q.method ? '秒杀：' + q.method : '', q.note ? '笔记：' + q.note : ''].filter(Boolean).join('\n')
    const id = await ankiAddNote(front, back, q.subject)
    showToast('✅ 已推到 Anki 卡组「行测AI」（id ' + id + '）', 'success')
  } catch (e) {
    showToast('❌ ' + e.message + '（需 Anki 打开并安装 AnkiConnect 插件）', 'error')
  }
}

defineEmits(['export', 'txt', 'exportMd'])
// 原题截图放大预览
const imgView = ref(null)
function viewImg(src) {
  imgView.value = src
}
function closeImg() {
  imgView.value = null
}
function downloadImg() {
  const src = imgView.value
  if (!src) return
  const a = document.createElement('a')
  a.href = src
  a.download = '错题原图_' + Date.now() + '.png'
  document.body.appendChild(a)
  a.click()
  a.remove()
  showToast('已保存原图', 'success')
}
// 查看原对话：切到对话页并定位该消息
function gotoChat() {
  const q = store.wqs[cur.value]
  store.tab = 'chat'
  show.value = false
  if (q && q.msgIdx != null) {
    window.dispatchEvent(new CustomEvent('xc-goto-msg', { detail: q.msgIdx }))
  }
}
// 让小助手引导归纳错因
const aiBusy = ref(false)
function origCtx() {
  const q = store.wqs[cur.value]
  if (!q) return null
  // 优先用原对话消息（含原始图片 dataURL）；无原消息时回退存错题的图
  const m = q.msgIdx != null && store.msgs[q.msgIdx] ? store.msgs[q.msgIdx] : null
  const c = (m && m.content) || {}
  const imgs = (c && c.imgs) || []
  const text = typeof c === 'string' ? c : (c && c.text) || q.question || ''
  return { text, imgs: imgs.length ? imgs.slice() : (q.imgs || []), hasMsg: !!m }
}
async function askAiReasons() {
  const q = store.wqs[cur.value]
  if (!q) return
  if (aiBusy.value) return
  const ctx = origCtx()
  const rawImgs = ctx.imgs || []
  // 先用 useAi 取配置（未配 Key 时返回 null 并 toast）；busy 在此之后再置位，避免与 aiRun 的 busy 互斥
  const c = await aiRun(async (cc) => cc, { cfgKey: rawImgs.length > 0 })
  if (c == null) return
  aiBusy.value = true
  const withImg = rawImgs.length > 0 && supportsVision(c)
  try {
    // 找对应 AI 回答作上下文
    let aiReply = ''
    if (q.msgIdx != null) {
      for (let i = q.msgIdx + 1; i < store.msgs.length; i++) {
        if (store.msgs[i].role === 'assistant') {
          const c2 = store.msgs[i].content
          aiReply = typeof c2 === 'string' ? c2 : (c2 && c2.text) || ''
          break
        }
      }
    }
    const sys = `你是行测资深讲师，帮助考生复盘错题、归纳成因。你要结合题干、我的作答、正确答案与解析，**具体指出我错在哪一步**，拒绝泛泛而谈（不要只写"审题不清/方法不对/粗心"这类空话，要说清"你把哪个关键词误读成什么""你在第几步把哪个数据/方向用反了"）。`
    const myAnswer = String(q.your || q.answerUser || '').trim()
    const rightAns = String(q.answer || q.ans || q.correct || '').trim()
    const analysis = String(q.explain || q.analysis || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 700)
    const userContent = `我在复盘一道错题，请你帮我引导归纳错误原因，并**按以下 JSON 输出**（严格只输出 JSON，不要多余文字）：
{
  "answer": "如果题干能看出正确答案就填（如 D、主旨句等），看不出填空字符串",
  "reasons": ["错因1", "错因2"],  // 结合我的作答与正确答案，最多3条，每条具体到"错在哪一步/哪个点"，能直接指导我下次避免
  "method": "一句话秒杀/下次看到这类题先想什么",
  "note": "简要的解析与下次提醒"
}
板块：${q.subject || '未分类'}
我的提问：${ctx.text || ''}
我的作答（我选/填的）：${myAnswer || '（未记录）'}
正确答案：${rightAns || '（未知）'}
正确解析：${analysis || '（无）'}
AI 当时的解答：${aiReply || '（无）'}`
    let messages
    if (withImg) {
      messages = [{
        role: 'user',
        content: [{ type: 'text', text: sys + '\n' + userContent }, ...ctx.imgs.map((u) => ({ type: 'image_url', image_url: { url: u } }))]
      }]
    } else {
      messages = [{ role: 'user', content: (sys + '\n' + userContent) + (rawImgs.length ? '\n（提示：我未提供原图，请基于题干文字判断，并提醒我如需更精准可重新存错题）' : '') }]
    }
    const reply = await chatOnce(c, messages, 900, 45000)
    // 解析结构化结果：先整体 parse，失败则抠出第一个 {...} JSON 对象
    let obj = null
    if (reply) {
      function tryParse(s) {
        try {
          return JSON.parse(s.trim())
        } catch (e) {
          return null
        }
      }
      obj = tryParse(reply.replace(/```json|```/g, ''))
      if (!obj) {
        const m = reply.match(/\{[\s\S]*\}/)
        if (m) obj = tryParse(m[0])
      }
      if (!obj) {
        // 最后兜底：逐字段从文本提取
        obj = parseByField(reply)
      }
    }
    if (obj) {
      applyAiReasons(obj, () => fillAnswerMethodNote(obj))
      showToast('已智能填入：答案/错因/秒杀/笔记' + (reasonModal.value ? '（错因待你确认）' : ''), 'success')
    } else if (reply) {
      frm.value.note = (frm.value.note ? frm.value.note + '\n\n' : '') + '🤖 小助手引导（可编辑）：\n' + reply
      showToast('已写入复盘笔记', 'success')
    } else {
      showToast('AI 暂无返回，请重试', 'info')
    }
  } catch (e) {
    showToast('调用失败：' + e.message, 'error')
  } finally {
    aiBusy.value = false
  }
}
// 智能分字段回填
// 应用 AI 返回的 reasons：若当前题已有旧错因且有新错因，先弹窗询问用户「替换 / 合并 / 取消」
function applyAiReasons(o, fillOthers) {
  const newReasons = Array.isArray(o.reasons)
    ? o.reasons.map((r) => String(r || '').trim()).filter(Boolean).slice(0, 3)
    : []
  const oldReasons = frm.value.sel.slice()
  const commit = (selArr) => {
    frm.value.sel = selArr
    newReasons.forEach((r) => {
      if (!userReasons.value.includes(r)) { userReasons.value.push(r); persistReasons() }
    })
  }
  if (oldReasons.length && newReasons.length) {
    reasonModal.value = {
      mode: 'reasons', old: oldReasons, neu: newReasons,
      resolve: (mode) => {
        if (mode === 'replace') commit(newReasons.slice())
        else if (mode === 'merge') commit([...oldReasons, ...newReasons.filter((r) => !oldReasons.includes(r))])
        // cancel → 不改错因
        reasonModal.value = null
      }
    }
  } else if (newReasons.length) {
    commit([...oldReasons, ...newReasons.filter((r) => !oldReasons.includes(r))])
  }
  if (fillOthers) fillOthers()
}
// 只回填 answer/method/note（错因走 applyAiReasons 的询问流程）
function fillAnswerMethodNote(o) {
  if (o.answer && !frm.value.answer) frm.value.answer = String(o.answer)
  if (o.method && !frm.value.method) frm.value.method = String(o.method)
  if (o.note) frm.value.note = (frm.value.note ? frm.value.note + '\n\n' : '') + String(o.note)
}
// 文本兜底解析：从 AI 自由文本里尽量抠出 answer/reasons/method/note
function parseByField(txt) {
  const out = { answer: '', reasons: [], method: '', note: '' }
  const lines = String(txt || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  for (const line of lines) {
    if (/^答案[:：]/.test(line)) out.answer = line.replace(/^答案[:：]/, '').trim()
    else if (/^秒杀|^方法|^下次提醒[:：]/.test(line)) out.method = line.replace(/^(秒杀|方法|下次提醒)[:：]/, '').trim()
    else if (/^错因[:：]/.test(line)) {
      const seg = line.replace(/^错因[:：]/, '')
      seg.split(/[、,，;；]/).forEach((x) => x.trim() && out.reasons.push(x.trim()))
    } else if (/^note[:：]|^笔记[:：]/.test(line)) out.note += line + '\n'
  }
  return out.answer || out.reasons.length || out.method || out.note ? out : null
}


// R4：把全部状态/方法/常量聚合成一个 reactive ctx，注入 7 个子组件
// 子组件用 toRefs(props.ctx) 暴露状态、直接解构暴露方法/常量，模板逐字搬入，避免双向绑定错位。
// 图推错题入库时图形缺失 → 本地确定性重建（零额度）：保留复盘信息，替换题目/选项/答案
function repairFig() {
  const q = store.wqs[cur.value]
  if (!q) { showToast('未找到该错题', 'error'); return }
  const lq = genTutuQuestion(Math.floor(Math.random() * 90000) + 1)
  if (!lq || !lq.stem || !(lq.options || []).length) { showToast('本地重建失败，请稍后重试', 'error'); return }
  const before = String(q.question || q.q || q.stem || '')
  q.question = String(lq.stem || '') + '\n\n' + (lq.options || []).map((o) => (o && o.k ? o.k + '. ' : '') + String((o && o.t) || '')).join('\n')
  q.answer = '正确答案 ' + String(lq.answer || '') + (q.answer ? '（原记录：' + q.answer + '）' : '')
  q.explain = q.explain || lq.explain || ''
  q.subx = q.subx || '图形推理'
  q.vx = q.vx || String(lq.variant || '') || ''
  q.fixedFig = (q.fixedFig || 0) + 1
  saveWqs()
  showToast('✅ 已用本地确定性题库重建本题（图形/选项/答案）', 'success')
  return before !== q.question
}

// v3.8.159：错题各视图（详情/答题重做/变式/抽认卡/今日优先）内含统计图时，渲染完成后挂载 ECharts
watch([show, cur, rep, redo, cardShow, cardIdx, focusShow, vtShow, vtMode, vtIdx, pageN],
  () => { nextTick(() => { try { mountCharts(document.querySelector('.page.on')) } catch (e) {} }) },
  { flush: 'post' })

const wrongCtx = reactive({
  PAGE, addCustomReason, aiBusy, aiGuideBusy, aiPolishBusy, aiPolishReason,
  ankiPush, askAiGuide, askAiReasons, askCoreDeep, boxReasons, cardFlip,
  cardIdx, cardMark, cardQueue, cardShow, checkedAllReasons, clearTypeFilter,
  closeImg, closeRedo, copyObsidianWrong, coreAiBusy, coreAiText, coreCard, coreOrigMd,
  cur, customReason, dedupeNow, del, delVaultPaper, delVaultQuiz,
  downloadImg, exportPaperMd, exportQuizMd, fReason, fRev, fSub, fSubj, fGroup,
  fmtT, focusList, focusRedo, focusShow, frm, gotoChat,
  guideText, imgView, jumpN, jumpTo, kw, loadMore,
  masteryOf, md, openCards, openIdx, openRedo, openRelated,
  openRename, origStem, pageN, paperView, presetBoxOpen, presetReasons,
  qcPapers, qcQuiz, reasonBoxOpen, reasonList, reasonModal, redo,
  redoAnswer, redoChoices, redoFeedback, redoHasChoice, redoHistory, redoPaper,
  redoPick, redoQ, redoQuizCol, redoResult, redoT, relatedQs,
  removeReason, renameInput, rep, resetFilters, repairFig, reviewGaps, save,
  setTypeFilter, show, shown, shownTotal, sortBy, startVariant, stats,
  store, subjList, WRONG_GROUPS, submitByChoice, submitRedo, todayFocus, toggleReason,
  typeStats, vaultOpen, viewImg, vtAddWrong, vtAllWrong, vtAnswers, vtBusy,
  vtChoose, vtClose, vtCmpBusy, vtCmpText, vtCount, vtDeepCompare,
  vtGo, vtIdx, vtMax, vtMode, vtNav, vtOpen,
  vtPick, vtQ, vtQueue, vtResultOf, vtScore, vtShow,
  vtStartDo, vtSubmit, vtToggleOpen, wrongSubOf, wrongTypeOf
})
</script>

<template>
  <div class="page on">
    <div class="page-inner">
      <div style="display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap">
        <button class="btn btn-pri" @click="$emit('export')">📤 导出(Word/PDF/AI)</button>
        <button class="btn btn-gh" @click="$emit('exportMd')">⬇️ 导出 Markdown</button>
        <button class="btn btn-gh" @click="exportObsidianMd()">🗃️ Obsidian(.md)</button>
        <button class="btn btn-gh" @click="exportAnkiCsv()">🃏 Anki/CSV</button>
        <button class="btn btn-gh" @click="$emit('txt')">TXT</button>
      </div>
      <WrongTypeStrength :ctx="wrongCtx" />
      <WrongVault :ctx="wrongCtx" />
      <WrongList :ctx="wrongCtx" />
    </div>
    <WrongDetail :ctx="wrongCtx" />
    <WrongRedo :ctx="wrongCtx" />
    <WrongFocus :ctx="wrongCtx" />
    <WrongCards :ctx="wrongCtx" />
    <WrongReason :ctx="wrongCtx" />
  </div>
</template>
