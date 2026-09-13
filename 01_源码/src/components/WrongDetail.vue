<script setup>
// R4：错题模块子组件（从 WrongPage.vue 对应模板逐字搬入）
// 父组件通过 ctx 注入全部依赖；模板保持与 WrongPage 完全一致，仅把状态/方法从 ctx 暴露到本组件作用域。
import { toRefs, computed, ref } from 'vue'
import { richMd, snippet } from '../utils/wrongText' // 错题渲染净化
import { downloadMdScreenshot, downloadLiveScreenshot } from '../utils/capture'
import { retrieveCardsV2 } from '../kb/retrieveV2' // R5 关联知识卡（只读 kb）
import { CARDS } from '../kb/cards-index'
import { WRONG_GROUPS, cardMatchesWrongTaxon, isRealSub } from '../utils/wrongTaxonomy'
import { subsForGroup, typesForSub } from '../utils/wrongFilterHierarchy'
import { markLearned } from '../utils/learned'
import { loadSrs, saveSrs, enqueueNew, ymdKey } from '../utils/memorySrs' // R5 二期：一键入记忆
import { showToast } from '../utils/toast' // R5 标记已学
import { absorbState } from '../utils/wrongAbsorb'
import { chatOnce, activeCfg, supportsVision } from '../api'
import { saveWqs } from '../store'
import AiTeach from './AiTeach.vue'
import {
  COACH_OTHER,
  buildCoachFallback,
  buildCoachPayload,
  buildLocalCoachFallback,
  fingerprintCoachContext,
  normalizeCoachState,
  parseCoachPlan
} from '../utils/wrongReasonCoach'

const props = defineProps({ ctx: { type: Object, required: true } })

const {
  aiBusy,
  aiPreview,
  aiPolishBusy,
  boxReasons,
  checkedAllReasons,
  coreAiBusy,
  coreAiText,
  coreCard,
  coreOrigMd,
  cur,
  customReason,
  frm,
  editQShow,
  editQText,
  editQAnswer,
  editQGroup,
  editQSub,
  editQType,
  editGroupOptions,
  editSubOptions,
  editTypeOptions,
  guideText,
  imgView,
  origStem,
  paperView,
  presetBoxOpen,
  presetReasons,
  reasonBoxOpen,
  relatedQs,
  rep,
  reviewGaps,
  show,
  vtAllWrong,
  vtAnswers,
  vtBusy,
  vtCmpBusy,
  vtCmpText,
  vtCount,
  vtDifficulty,
  vtIdx,
  vtLibMax,
  vtMax,
  vtMode,
  vtOpen,
  vtPick,
  vtQ,
  vtQueue,
  vtScore,
  vtShow,
  vtSource
} = toRefs(props.ctx)

// R5：按本题考点检索关联方法卡（≤3），可在详情内展开 / 标记已学 / 跳知识库
const kbOpen = ref(false)
const detailTab = ref('question')
const inlineEdit = ref(false)
const translateShow = ref(false)
const translateText = ref('')
const translateAnswer = ref('')
const translateSubject = ref('')
const translateSub = ref('')
const translateType = ref('')
const inlineDraft = ref({ stem: '', options: [], answer: '' })
const taxonEdit = ref(false)
const taxonDraft = ref({ group: '', sub: '', type: '' })
const coachOpen = ref(false)
const coachStep = ref(0)
const coachPlan = ref({ steps: [], mode: '', notice: '', loading: false, error: '', fingerprint: '' })
const coachAnswers = ref({
  reflect: { value: '', custom: '' },
  block: { value: '', custom: '' },
  action: { value: '', custom: '' }
})
const coachWrote = ref('')
const coachBusy = ref(false)
const coachFinal = ref([])
const coachDeep = ref({ pattern: '', note: '', analysis: '' })
const coachFieldGuide = ref({ pattern: { q: [], draft: '' }, note: { q: [], draft: '' }, analysis: { q: [], draft: '' } })
const coachFieldBusy = ref('')
const coachSaved = ref(false)
function selectDetailTab(tab) {
  detailTab.value = tab
  if (tab === 'question') rep.value = false
  if (tab === 'review') rep.value = true
  if (tab === 'practice' && !vtShow.value) startVariant()
  if (tab === 'links') {
    rep.value = true
    kbOpen.value = true
  }
}
function inlineOptionRows() {
  const src = Array.isArray(paperView.value.opts) ? paperView.value.opts : []
  const keys = ['A', 'B', 'C', 'D']
  return keys.map((k, i) => {
    const hit = src.find((o) => String((o && o.k) || '').toUpperCase() === k) || src[i] || {}
    return { k, t: String((hit && (hit.t || hit.text)) || '') }
  })
}
function startInlineEdit() {
  const q = activeWrong()
  if (!q) return
  inlineDraft.value = {
    stem: String(paperView.value.stem || ''),
    options: inlineOptionRows(),
    answer: String(q.answer || q.ans || q.correct || '')
  }
  inlineEdit.value = true
  detailTab.value = 'question'
}
function cancelInlineEdit() {
  inlineEdit.value = false
}
function saveInlineEdit() {
  const q = activeWrong()
  if (!q) return
  const stem = String(inlineDraft.value.stem || '').trim()
  if (!stem) { showToast('题干不能为空，请先修正题干内容', 'info'); return }
  const options = (inlineDraft.value.options || []).map((o, i) => ({ k: String(o.k || String.fromCharCode(65 + i)), t: String(o.t || '').trim() }))
  const optionText = options.filter((o) => o.t).map((o) => o.k + '. ' + o.t).join('\n')
  editQText.value = stem + (optionText ? '\n\n' + optionText : '')
  editQAnswer.value = String(inlineDraft.value.answer || '').trim()
  saveEditQ()
  q.options = options.filter((o) => o.t)
  saveWqs()
  inlineEdit.value = false
  showToast(editQAnswer.value ? '✅ 原题与参考答案已保存' : '✅ 原题已保存；暂无参考答案，请以 AI 解析为准', editQAnswer.value ? 'success' : 'info')
}
function toggleInlineEdit() {
  if (inlineEdit.value) saveInlineEdit()
  else startInlineEdit()
}
const taxonGroupOptions = computed(() => WRONG_GROUPS.map((g) => g.label))
const taxonSubOptions = computed(() => subsForGroup(taxonDraft.value.group))
const taxonTypeOptions = computed(() => typesForSub(taxonDraft.value.sub))
function startTaxonEdit() {
  const q = activeWrong()
  if (!q) return
  taxonDraft.value = { group: wrongGroupOf(q), sub: wrongSubOf(q) || '', type: wrongTypeOf(q) === '未分类' ? '' : wrongTypeOf(q) }
  taxonEdit.value = true
}
function onTaxonGroupChange() {
  taxonDraft.value.sub = ''
  taxonDraft.value.type = ''
}
function onTaxonSubChange() {
  taxonDraft.value.type = ''
}
function saveTaxonEdit() {
  const q = activeWrong()
  const d = taxonDraft.value
  if (!q || !d.group || !d.sub || !d.type) { showToast('请完整选择大板块、细分板块和题型', 'info'); return }
  q.subject = d.sub
  q.plate = d.sub
  q.subx = isRealSub(d.sub) ? d.sub : ''
  q.sub = d.type
  q.variant = d.type
  q.taxonOverride = { group: d.group, sub: d.sub, type: d.type, at: Date.now() }
  q.taxonCorrectedAt = Date.now()
  saveWqs()
  taxonEdit.value = false
  showToast('✅ 已记住你的分类修正：' + d.group + ' · ' + d.sub + ' · ' + d.type, 'success')
}
function openLogicTranslate() {
  const q = cur.value >= 0 ? store.wqs[cur.value] : null
  if (!q) return
  const opts = questionOptionsText(q)
  translateText.value = String(q.question || q.q || q.stem || '') + (opts ? '\n\n' + opts : '')
  translateAnswer.value = q.answer || ''
  translateSubject.value = wrongGroupOf(q)
  translateSub.value = wrongSubOf(q)
  translateType.value = wrongTypeOf(q)
  translateShow.value = true
}
function activeWrong() {
  return cur.value >= 0 ? store.wqs[cur.value] : null
}
function questionOptionsText(q) {
  if (!q) return ''
  if (Array.isArray(q.options) && q.options.length) {
    return q.options.map((o) => String((o && o.k) || '') + '. ' + String((o && (o.t || o)) || '')).join('\n')
  }
  return ''
}
function coachAiReply(q) {
  if (!q || q.msgIdx == null) return ''
  for (let i = q.msgIdx + 1; i < store.msgs.length; i++) {
    if (store.msgs[i] && store.msgs[i].role === 'assistant') {
      const c = store.msgs[i].content
      return String(typeof c === 'string' ? c : (c && c.text) || '').slice(0, 1200)
    }
  }
  return ''
}
function coachContextInput() {
  const q = activeWrong()
  if (!q) return {}
  const type = wrongTypeOf(q)
  const similarReasons = store.wqs
    .filter((x) => x && x !== q && wrongGroupOf(x) === wrongGroupOf(q) && wrongSubOf(x) === wrongSubOf(q) && wrongTypeOf(x) === type)
    .flatMap((x) => Array.isArray(x.reasons) ? x.reasons : [])
    .slice(0, 10)
  return {
    group: wrongGroupOf(q),
    sub: wrongSubOf(q),
    type,
    question: q.question || q.q || q.stem || '',
    options: questionOptionsText(q),
    userAnswer: q.your || q.answerUser || '',
    answer: q.answer || q.ans || q.correct || '',
    analysis: q.explain || q.analysis || '',
    aiReply: coachAiReply(q),
    reasons: Array.isArray(q.reasons) ? q.reasons : [],
    similarReasons,
    hasImage: !!((q.imgs || []).length)
  }
}
function syncCoachState(q, patch = {}) {
  if (!q) return
  const fp = fingerprintCoachContext(coachContextInput())
  const rc = normalizeCoachState(q.reasonCoach || {}, fp)
  q.reasonCoach = { ...rc, ...patch, fingerprint: patch.fingerprint || fp, version: 2 }
  try { saveWqs() } catch (e) {}
}
function setCoachPlan(plan, fingerprint) {
  coachPlan.value = {
    steps: Array.isArray(plan && plan.steps) ? plan.steps : [],
    mode: plan && plan.source === 'ai' ? 'ai' : 'taxonomy',
    notice: String((plan && plan.notice) || ''),
    loading: false,
    error: '',
    fingerprint
  }
}
async function refreshCoachPlan(force = false) {
  const q = activeWrong()
  if (!q || coachPlan.value.loading) return
  const input = coachContextInput()
  const fp = fingerprintCoachContext(input)
  const rc = normalizeCoachState(q.reasonCoach || {}, fp)
  if (!force && rc.steps.length >= 3 && rc.fingerprint === fp) {
    setCoachPlan({ steps: rc.steps, source: rc.mode, notice: rc.notice }, fp)
    return
  }
  const fallback = buildCoachFallback(input)
  setCoachPlan(fallback, fp)
  coachPlan.value.loading = true
  try {
    const c = activeCfg(input.hasImage)
    if (!c || !c.key) {
      coachPlan.value.loading = false
      syncCoachState(q, { steps: fallback.steps, mode: 'taxonomy', source: 'local', notice: fallback.notice, generatedAt: Date.now() })
      return
    }
    const sys = '你是行测错题复盘教练。请只输出严格 JSON，不要 Markdown 围栏。必须返回：{"notice":"一句话提醒","steps":[{"id":"reflect","title":"当时怎么想","prompt":"针对本题的追问","options":[{"label":"具体选项","hint":"短解释"}]},{"id":"block","title":"真正卡在哪一步","prompt":"针对上一阶段继续追问","options":[{"label":"具体选项","hint":"短解释"}]},{"id":"action","title":"下次先做什么","prompt":"给出可执行动作","options":[{"label":"具体选项","hint":"短解释"}]}]}。每步必须 4-6 个短选项，必须结合题干、考生作答、正确答案、解析和相同三级分类的历史错因；不得编造考生没有表达过的心理活动，不得给空泛的“粗心/审题不清”。' 
    const user = '请按以上 JSON 输出动态三步复盘选项。上下文：' + JSON.stringify(input)
    const imgs = (q.imgs || []).slice(0, 2)
    const messages = imgs.length && supportsVision(c)
      ? [{ role: 'user', content: [{ type: 'text', text: sys + '\n' + user }, ...imgs.map((u) => ({ type: 'image_url', image_url: { url: u } }))] }]
      : [{ role: 'user', content: sys + '\n' + user }]
    const reply = await chatOnce(c, messages, 900, 45000)
    const parsed = parseCoachPlan(reply)
    if (parsed && parsed.steps.length >= 3) {
      setCoachPlan(parsed, fp)
      syncCoachState(q, { steps: parsed.steps, mode: 'ai', source: 'ai', notice: parsed.notice, generatedAt: Date.now() })
    } else {
      throw new Error('AI 未返回可用的三步选项')
    }
  } catch (e) {
    coachPlan.value.loading = false
    coachPlan.value.error = String((e && e.message) || e).slice(0, 100)
    coachPlan.value.notice = coachPlan.value.notice || '已保留本地兜底选项，可稍后重新生成。'
  }
}
function openCoach() {
  const q = activeWrong()
  if (!q) return
  const fp = fingerprintCoachContext(coachContextInput())
  const rc = normalizeCoachState(q.reasonCoach || {}, fp)
  coachOpen.value = true
  coachStep.value = 0
  coachAnswers.value = rc.answers || {
    reflect: { value: '', custom: '' },
    block: { value: '', custom: '' },
    action: { value: '', custom: '' }
  }
  coachWrote.value = rc.reflection || ''
  coachFinal.value = Array.isArray(rc.adopted) ? rc.adopted.slice() : []
  coachDeep.value = rc.deep ? { pattern: '', note: '', analysis: '', ...rc.deep } : { pattern: '', note: '', analysis: '' }
  coachFieldGuide.value = { pattern: { q: [], draft: '' }, note: { q: [], draft: '' }, analysis: { q: [], draft: '' } }
  coachSaved.value = false
  guideText.value = ''
  if (rc.steps.length >= 3 && rc.fingerprint === fp) setCoachPlan({ steps: rc.steps, source: rc.mode, notice: rc.notice }, fp)
  else setCoachPlan(buildCoachFallback(coachContextInput()), fp)
  refreshCoachPlan(false)
}
function pickCoachOption(stepId, t) {
  if (!coachAnswers.value[stepId]) coachAnswers.value[stepId] = { value: '', custom: '' }
  coachAnswers.value[stepId].value = t
}
function coachChoice(stepId) {
  const a = coachAnswers.value[stepId] || {}
  return a.value === COACH_OTHER ? String(a.custom || '').trim() : String(a.value || '').trim()
}
function coachNext() {
  const stepId = (coachPlan.value.steps[coachStep.value] || {}).id
  if (!coachChoice(stepId)) { showToast('先选一个最接近你的选项，或写下自己的情况', 'info'); return }
  if (coachStep.value < 2) coachStep.value++
}
async function coachFinish() {
  const q = activeWrong()
  if (!q) return
  const ids = coachPlan.value.steps.map((s) => s.id)
  const values = ids.map(coachChoice)
  if (values.some((v) => !v)) { showToast('三步都完成后才能整理；每步都可以选选项或写“其他”', 'info'); return }
  coachBusy.value = true
  try {
    const payload = buildCoachPayload({
      first: values[0],
      block: values[1],
      next: values[2],
      reflection: coachWrote.value
    })
    syncCoachState(q, {
      steps: coachPlan.value.steps,
      answers: coachAnswers.value,
      reflection: coachWrote.value,
      completed: true,
      mode: coachPlan.value.mode,
      source: coachPlan.value.mode,
      at: Date.now()
    })
    const local = buildLocalCoachFallback(payload)
    applyCoachReview(q, local, { autoSave: true, source: 'local' })
    coachFinal.value = local.reasons
    coachDeep.value = { pattern: local.pattern, note: local.note, analysis: local.analysis }
    coachSaved.value = true
    showToast('✅ 已保存你的三步复盘；可继续使用 AI 一键整理生成草稿', 'success')
  } catch (e) {
    showToast('分步复盘保存失败：' + String((e && e.message) || e).slice(0, 80), 'error')
  } finally {
    coachBusy.value = false
  }
}
function appendDeepField(key, text) {
  const add = String(text || '').trim()
  if (!add) return
  const old = String(frm.value[key] || '').trim()
  if (old.includes(add)) return
  frm.value[key] = old ? old + '\n\n' + add : add
}
function useCoachDraft(field) {
  const draft = coachFieldGuide.value[field] && coachFieldGuide.value[field].draft
  appendDeepField(field, draft)
  showToast('已填入草稿，可继续按自己的话修改', 'success')
}
async function askCoachField(field) {
  const q = cur.value >= 0 ? store.wqs[cur.value] : null
  if (!q || coachFieldBusy.value) return
  const c = activeCfg()
  if (!c || !c.key) { showToast('请先配置文字模型', 'info'); return }
  coachFieldBusy.value = field
  try {
    const labels = { pattern: '可迁移规律', note: '个人复盘笔记', analysis: '解析拆解' }
    const rc = q.reasonCoach || {}
    const sys = '你是行测错题教练。请围绕考生自己写下的分步复盘，帮他继续写“' + labels[field] + '”。不得新增考生没有表达过的错因，不得编造原题信息。只输出 JSON：{"questions":["追问1","追问2"],"draft":"基于考生原话整理的一段草稿"}。'
    const user = '分步复盘：' + JSON.stringify({ answers: rc.answers || {}, reflection: rc.reflection || coachWrote.value, steps: rc.steps || [] }) + '\n当前' + labels[field] + '：' + String(frm.value[field] || '（空）') + '\n请给出两个能让考生自己写出内容的追问，并给一段可编辑草稿。'
    const reply = await chatOnce(c, [{ role: 'system', content: sys }, { role: 'user', content: user }], 500, 45000)
    let obj = null
    try { obj = JSON.parse(String(reply || '').replace(/```json|```/g, '').trim()) } catch (e) { const m = String(reply || '').match(/\{[\s\S]*\}/); if (m) { try { obj = JSON.parse(m[0]) } catch (_) {} } }
    const questions = Array.isArray(obj && obj.questions) ? obj.questions.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 3) : []
    const draft = String((obj && obj.draft) || '').trim()
    coachFieldGuide.value[field] = { q: questions, draft }
    q.reasonCoach = { ...(q.reasonCoach || {}), guide: { ...((q.reasonCoach && q.reasonCoach.guide) || {}), [field]: questions } }
    if (!questions.length && !draft) showToast('AI 暂无可用引导，请稍后重试', 'info')
  } catch (e) {
    showToast('AI 引导失败：' + String((e && e.message) || e).slice(0, 70), 'error')
  } finally {
    coachFieldBusy.value = ''
  }
}
const absorb = computed(() => {
  const q = cur.value >= 0 && store && store.wqs ? store.wqs[cur.value] : null
  return absorbState(q)
})
const kbCards = computed(() => {
  try {
    const q = cur.value >= 0 && store && store.wqs ? store.wqs[cur.value] : null
    if (!q) return []
    const ranked = retrieveCardsV2(String(q.subject || q.plate || ''), String(q.question || q.q || q.stem || ''), 30)
    const rank = new Map(ranked.map((c, i) => [c.id, i]))
    return CARDS
      .filter((c) => cardMatchesWrongTaxon(c, q))
      .sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999))
      .slice(0, 3)
  } catch (e) { return [] }
})
function memorizeRule() {
  const q = cur.value >= 0 && store && store.wqs ? store.wqs[cur.value] : null
  if (!q) return
  const txt = String(q.method || q.note || '').trim()
  if (!txt) { try { showToast('请先填写「秒杀规律」或「笔记」再记', 'info') } catch (e) {} return }
  try {
    const srs = loadSrs()
    const title = txt.replace(/\s+/g, ' ').slice(0, 60)
    enqueueNew(srs, '我的错题', title, ymdKey())
    saveSrs(srs)
    showToast('🧠 已加入记忆复习（今天到期，今日复习中枢可见）', 'success')
  } catch (e) {}
}
function openKbCard(id) {
  if (id) { try { markLearned(id) } catch (e) {} }
  window.dispatchEvent(new CustomEvent('xc-open-kb-card', { detail: id }))
}

const {
  addCustomReason,
  applyAiPreview,
  aiPolishReason,
  ankiPush,
  applyCoachReview,
  askAiReasons,
  askCoreDeep,
  closeImg,
  cancelAiPreview,
  copyObsidianWrong,
  del,
  openEditQ,
  onEditGroupChange,
  onEditSubChange,
  saveEditQ,
  downloadImg,
  gotoChat,
  gotoDeepChat,
  gotoWrongExam,
  archiveWrong,
  unarchiveWrong,
  openRecall,
  openRedo,
  wrongGroupOf,
  wrongSubOf,
  wrongTypeOf,
  repairFig,
  openRelated,
  openRename,
  chooseVtDiff,
  chooseVtSource,
  removeReason,
  save,
  startVariant,
  store,
  toggleReason,
  toggleAiPreviewField,
  viewImg,
  vtAddWrong,
  vtChoose,
  vtClose,
  vtDeepCompare,
  vtGo,
  vtNav,
  vtResultOf,
  vtStartDo,
  vtSubmit,
  vtToggleOpen
} = props.ctx

// 错题详情：完整题目 / 完整解析 截图导出
// 图推错题若入库时图形缺失（仅占位符）→ 提示一键本地重建
const missingFig = computed(() => {
  const q = store.wqs && store.wqs[cur.value]
  if (!q) return false
  if (String(q.subject || '') !== '图形推理') return false
  const txt = String(q.question || q.q || q.stem || '')
  return !/<svg|```svg|\[ECHARTS\]|<img|!\[/.test(txt)
})
async function capWrongQuestion() {
  const wq = store.wqs[cur.value]
  if (!wq) return
  // v3.8.170 优先所见即所得：截取详情页真实渲染的题目节点（题干/图形/选项完整、主题一致）
  const live = document.querySelector('.ov.show .paper-q')
  const title = '行测 · 错题原题'
  const sub = (wq.subject || '未分类') + (wq.time ? ' · ' + wq.time : '')
  const name = '错题原题_' + (cur.value + 1)
  if (live) {
    try { const ok = await downloadLiveScreenshot(live, { title, sub, name }); if (ok) return } catch (e) {}
  }
  // 回退：按完整原文渲染导出（材料题组解析不出选项时用 raw 全文）
  const opts = (paperView.value.opts || []).map((o) => o.k + '. ' + o.t).join('\n\n')
  const hasOpts = (paperView.value.opts || []).length
  const srcMd = hasOpts ? (paperView.value.stem || wq.question || '') : String(wq.question || wq.q || wq.stem || '')
  const md = srcMd + (opts ? '\n\n' + opts : '')
  downloadMdScreenshot({ title, sub, md, name })
}
function capWrongExplain() {
  const wq = store.wqs[cur.value]
  if (!wq) return
  const parts = []
  if (wq.your) parts.push('**我的答案：**' + wq.your)
  if (wq.answer) parts.push('**正确答案：**' + wq.answer)
  const ana = wq.explain || wq.analysis || ''
  if (ana) parts.push(ana)
  if (wq.reasons && wq.reasons.length) parts.push('**错因：**' + wq.reasons.join('、'))
  if (wq.method) parts.push('**秒杀：**' + wq.method)
  if (wq.note) parts.push('**笔记/思路：**' + wq.note)
  downloadMdScreenshot({
    title: '行测 · 错题解析',
    sub: (wq.subject || '未分类') + (wq.time ? ' · ' + wq.time : ''),
    md: parts.join('\n\n') || '（本题暂无解析，可在复盘里补充后重新导出）',
    name: '错题解析_' + (cur.value + 1)
  })
}
</script>

<template>
    <div class="ov" :class="{ show }" @click.self="show = false">
      <div class="pnl wq-detail-pnl">
        <h3>📋 错题详情</h3>
        <template v-if="cur >= 0 && store.wqs[cur]">
          <div class="wq-taxon-bar" aria-label="本题分类">
            <span><em>大板块</em><b>{{ wrongGroupOf(store.wqs[cur]) }}</b></span>
            <span><em>细分板块</em><b>{{ wrongSubOf(store.wqs[cur]) || '未分类' }}</b></span>
            <span><em>题型</em><b>{{ wrongTypeOf(store.wqs[cur]) }}</b></span>
            <button type="button" class="wq-taxon-edit" @click="taxonEdit ? (taxonEdit = false) : startTaxonEdit()">{{ taxonEdit ? '收起分类纠错' : '✏️ 纠错分类' }}</button>
          </div>
          <div v-if="taxonEdit" class="wq-taxon-editor">
            <select v-model="taxonDraft.group" @change="onTaxonGroupChange()">
              <option value="">选择大板块</option>
              <option v-for="g in taxonGroupOptions" :key="g" :value="g">{{ g }}</option>
            </select>
            <select v-model="taxonDraft.sub" :disabled="!taxonDraft.group" @change="onTaxonSubChange()">
              <option value="">选择细分板块</option>
              <option v-for="s in taxonSubOptions" :key="s" :value="s">{{ s }}</option>
            </select>
            <select v-model="taxonDraft.type" :disabled="!taxonDraft.sub">
              <option value="">选择题型</option>
              <option v-for="t in taxonTypeOptions" :key="t" :value="t">{{ t }}</option>
            </select>
            <button type="button" class="btn btn-pri" @click="saveTaxonEdit()">💾 保存并记住</button>
          </div>
          <div class="wq-primary-actions">
            <button type="button" class="btn btn-pri" @click.stop="gotoDeepChat()">💬 带去对话深挖</button>
            <button type="button" class="btn btn-gh" @click.stop="openLogicTranslate()">🧭 白话翻译</button>
            <button type="button" class="btn btn-gh" @click.stop="gotoWrongExam()">🎲 AI 出题练</button>
            <details class="wq-more-actions">
              <summary class="btn btn-gh">⋯ 更多操作</summary>
              <div class="wq-more-menu">
                <button type="button" class="wq-goto" @click.stop="gotoChat()">↩ 查看原对话</button>
                <button type="button" class="wq-goto" @click.stop="openEditQ()">✏️ 高级编辑</button>
                <button v-if="store.wqs[cur].archived" type="button" class="wq-goto" @click.stop="unarchiveWrong(store.wqs[cur])">↩ 移回错题集</button>
                <button v-else type="button" class="wq-goto" @click.stop="archiveWrong(store.wqs[cur])">📦 吃透收藏</button>
                <button type="button" class="wq-goto" @click.stop="openRedo()">✍️ 答题界面重做</button>
                <button type="button" class="wq-goto" @click.stop="openRecall(store.wqs[cur])">🧠 主动回忆</button>
                <button type="button" class="wq-goto" @click.stop="copyObsidianWrong(store.wqs[cur])">📋 复制 Obsidian</button>
                <button type="button" class="wq-goto" @click.stop="ankiPush()">🃏 推到 Anki</button>
              </div>
            </details>
          </div>
          <div class="wq-detail-nav" role="tablist" aria-label="错题详情区域">
            <button type="button" role="tab" :aria-selected="detailTab === 'question'" :class="{ on: detailTab === 'question' }" @click="selectDetailTab('question')">📄 原题校对</button>
            <button type="button" role="tab" :aria-selected="detailTab === 'review'" :class="{ on: detailTab === 'review' }" @click="selectDetailTab('review')">✍️ 错因复盘</button>
            <button type="button" role="tab" :aria-selected="detailTab === 'practice'" :class="{ on: detailTab === 'practice' }" @click="selectDetailTab('practice')">🔁 迁移巩固</button>
            <button type="button" role="tab" :aria-selected="detailTab === 'links'" :class="{ on: detailTab === 'links' }" @click="selectDetailTab('links')">🔗 关联记录</button>
          </div>
          <div class="absorb-card" :class="{ ok: absorb.score >= 85, warn: absorb.score < 40 }">
            <div class="absorb-hd">
              <b>🧠 彻底吃透 {{ absorb.score }}%</b>
              <span class="absorb-lv">{{ absorb.level }}</span>
              <span class="cr-tip">六维证据：答案 / 错因 / 考点 / 方法 / 变式 / 复习</span>
            </div>
            <div class="absorb-bar"><i :style="{ width: absorb.score + '%' }"></i></div>
            <div class="absorb-steps">
              <span v-for="s in absorb.steps" :key="s.k" :class="{ done: s.done }">{{ s.done ? '✓' : '○' }} {{ s.label }}</span>
            </div>
            <div v-if="absorb.next" class="absorb-next">
              下一步：<b>{{ absorb.next.tip }}</b>
              <button v-if="['answer','reason','core','method'].includes(absorb.next.k)" class="btn btn-pri" @click="rep = true">去补全</button>
              <button v-else-if="absorb.next.k === 'variant'" class="btn btn-pri" :disabled="vtBusy" @click="startVariant()">做变式</button>
              <button v-else class="btn btn-pri" @click="openRedo()">去二刷</button>
            </div>
            <div v-else class="absorb-next done">这道题的证据链已完整，继续保持间隔复习即可。</div>
            <div v-if="store.wqs[cur].absorb && (store.wqs[cur].absorb.kp || store.wqs[cur].absorb.fix)" class="absorb-core">
              <div v-if="store.wqs[cur].absorb.kp"><b>考点：</b>{{ store.wqs[cur].absorb.kp }}</div>
              <div v-if="store.wqs[cur].absorb.fix"><b>一句话修正：</b>{{ store.wqs[cur].absorb.fix }}</div>
            </div>
          </div>
          <!-- 原题截图 -->
          <div v-if="(store.wqs[cur].imgs || []).length" class="wq-imgs">
            <img
              v-for="(im, j) in store.wqs[cur].imgs"
              :key="j"
              class="wq-img"
              :src="im"
              alt="原题截图"
              @click="viewImg(im)"
            />
          </div>
                    <div v-if="missingFig" class="wq-warning-note">
            ⚠️ 该题入库时未保存图形（只有占位符）。可本地一键重建（图形/选项/答案，确定性零额度）：
            <button class="btn btn-pri" style="padding:4px 12px" @click="repairFig()">🛠 重建本题</button>
            <button class="btn btn-gh" style="padding:4px 12px" @click="gotoChat()">↩ 回原对话看原图</button>
          </div>
          <div class="paper-q">
            <div class="paper-q-hd">
              <span class="paper-q-title">原题信息</span>
              <button type="button" class="wq-inline-edit-btn" :class="{ saving: inlineEdit }" @click="toggleInlineEdit()">{{ inlineEdit ? '💾 保存修改' : '✏️ 编辑' }}</button>
            </div>
            <template v-if="!inlineEdit">
              <div class="paper-stem" v-html="richMd(paperView.stem)"></div>
              <div v-if="paperView.opts.length" class="paper-opts">
                <div v-for="o in paperView.opts" :key="o.k" class="paper-opt"><b>{{ o.k }}.</b> <span v-html="richMd(String(o.t || ''))"></span></div>
              </div>
            </template>
            <div v-else class="wq-inline-editor">
              <label>题干</label>
              <textarea v-model="inlineDraft.stem" rows="7" placeholder="修正识别错误的题干内容"></textarea>
              <label>选项</label>
              <div v-for="o in inlineDraft.options" :key="o.k" class="wq-inline-option">
                <b>{{ o.k }}</b><input v-model="o.t" :placeholder="o.k + ' 选项内容'" />
              </div>
              <label>参考答案</label>
              <input v-model="inlineDraft.answer" placeholder="如：D；若暂无识别结果可先留空" />
              <div v-if="!String(inlineDraft.answer || '').trim()" class="wq-inline-note">当前未识别到参考答案：可先保存原题修正，后续以 AI 解析为准；第二次编辑时再补填正确选项。</div>
              <div class="wq-inline-editor-actions">
                <button type="button" class="btn btn-pri" @click="saveInlineEdit()">💾 保存修改</button>
                <button type="button" class="btn btn-gh" @click="cancelInlineEdit()">取消</button>
              </div>
            </div>
          </div>
          <div class="wq-cap-acts">
            <button class="btn btn-gh" title="把这道题的完整题干与选项导出为高清截图" @click="capWrongQuestion()">📸 题目截图</button>
            <button class="btn btn-gh" title="把这道题的完整解析/答案/错因/秒杀导出为高清截图" @click="capWrongExplain()">📸 解析截图</button>
          </div>

          <div class="rev-head" @click="rep = !rep">
            ✍️ {{ rep ? '收起' : '开始结构化复盘' }}
            <span style="float: right">{{ rep ? '▲' : '▼' }}</span>
          </div>
          <div v-if="rep" class="rev-body">
            <div v-if="reviewGaps.length" class="rev-gap">
              📋 还差 <b>{{ reviewGaps.join(' / ') }}</b> 没填——补全才能彻底吃透这道题
            </div>
            <div class="rev-steps">
              <span :class="{ done: frm.answer.trim() }">1 对答案</span> → <span :class="{ done: (frm.sel || []).length }">2 写错因</span> → <span :class="{ done: frm.note.trim() }">3 理思路</span> → <span :class="{ done: frm.method.trim() }">4 记秒杀</span> → <span :class="{ done: vtShow }">5 做变式</span>
            </div>
            <div class="fld">
              <label>正确答案</label>
              <input v-model="frm.answer" placeholder="如：D / 乙 / 主旨句…" />
            </div>
            <div class="fld">
              <label>错因（可多选 · 已选置顶，候选与历史已收纳）</label>
              <!-- 本题已勾选的错因：置顶显示；预设勾选无删改，自定义/AI 勾选带 ✎✕ -->
              <div v-if="checkedAllReasons.length" class="chips">
                <span
                  v-for="r in checkedAllReasons"
                  :key="'on' + r"
                  class="chip on"
                  :class="{ custom: !presetReasons.includes(r) }"
                  @click="toggleReason(r)"
                >
                  {{ r }}
                  <template v-if="!presetReasons.includes(r)">
                    <i class="chip-act" title="改名（当前题 + 自定义错因池）" @click.stop="openRename(r)">✎</i>
                    <i class="chip-act" title="删除该错因（当前题 + 自定义错因池）" @click.stop="removeReason(r)">✕</i>
                  </template>
                </span>
              </div>
              <div v-else class="cr-empty">还没有勾选错因——从下面收纳盒里选，或用 🧭 引导 / ✨ 规范化 生成</div>
              <!-- 收纳盒①：板块预设候选（默认折叠） -->
              <div v-if="presetReasons.length" class="reason-box">
                <button type="button" class="reason-box-hd" @click="presetBoxOpen = !presetBoxOpen">
                  📦 预设错因（{{ store.wqs[cur].subject || '板块' }} · {{ presetReasons.length }}）{{ presetBoxOpen ? '▾ 收起' : '▸ 展开' }}
                </button>
                <div v-if="presetBoxOpen" class="chips">
                  <span
                    v-for="r in presetReasons"
                    :key="'p' + r"
                    class="chip"
                    :class="{ on: frm.sel.includes(r) }"
                    @click="toggleReason(r)"
                  >{{ r }}</span>
                </div>
              </div>
              <!-- 收纳盒②：我的历史错因（自定义/AI 生成，默认折叠，可删改） -->
              <div v-if="boxReasons.length" class="reason-box">
                <button type="button" class="reason-box-hd" @click="reasonBoxOpen = !reasonBoxOpen">
                  📦 我的历史错因（{{ boxReasons.length }}）{{ reasonBoxOpen ? '▾ 收起' : '▸ 展开' }}
                </button>
                <div v-if="reasonBoxOpen" class="chips">
                  <span
                    v-for="r in boxReasons"
                    :key="'b' + r"
                    class="chip custom"
                    @click="toggleReason(r)"
                  >
                    {{ r }}
                    <i class="chip-act" title="改名（当前题 + 自定义错因池）" @click.stop="openRename(r)">✎</i>
                    <i class="chip-act" title="删除该错因（当前题 + 自定义错因池）" @click.stop="removeReason(r)">✕</i>
                  </span>
                </div>
              </div>
              <!-- AI 引导找错因：帮助用户科学决策、自己发现错因 -->
              <div class="guide-row coach-row">
                <button type="button" class="btn btn-pri" @click="openCoach()">🧭 分步引导复盘</button>
                <button type="button" class="btn btn-gh" :disabled="aiBusy" title="结合题目、作答、解析和已有复盘生成草稿；先预览再采纳" @click="askAiReasons()">{{ aiBusy ? '⏳ AI 整理中…' : '🤖 AI 帮我整理' }}</button>
                <span class="cr-tip">动态三步选项 + AI 草稿预览；未勾选的内容不会写入</span>
              </div>
              <div v-if="aiPreview" class="ai-preview-panel">
                <div class="ai-preview-hd"><b>🤖 AI 整理草稿</b><span>确认后才会写入本题</span></div>
                <div v-if="aiPreview.draft.reasons.length" class="ai-preview-block">
                  <div class="ai-preview-title">错因</div>
                  <label v-for="(r, i) in aiPreview.draft.reasons" :key="i" class="ai-preview-row"><input type="checkbox" :checked="aiPreview.selected.reasons[i]" @change="toggleAiPreviewField('reasons', i)" /> <span>{{ r }}</span></label>
                </div>
                <label v-if="aiPreview.draft.pattern" class="ai-preview-row"><input type="checkbox" :checked="aiPreview.selected.pattern" @change="toggleAiPreviewField('pattern')" /> <span><b>⚡ 可迁移规律：</b>{{ aiPreview.draft.pattern }}</span></label>
                <label v-if="aiPreview.draft.note" class="ai-preview-row"><input type="checkbox" :checked="aiPreview.selected.note" @change="toggleAiPreviewField('note')" /> <span><b>📝 个人笔记：</b>{{ aiPreview.draft.note }}</span></label>
                <label v-if="aiPreview.draft.analysis" class="ai-preview-row"><input type="checkbox" :checked="aiPreview.selected.analysis" @change="toggleAiPreviewField('analysis')" /> <span><b>🧠 解析拆解：</b>{{ aiPreview.draft.analysis }}</span></label>
                <div v-if="(aiPreview.draft.evidence || []).length" class="ai-preview-evidence">依据：{{ aiPreview.draft.evidence.join('；') }}</div>
                <div class="ai-preview-actions">
                  <label class="ai-preview-mode"><input v-model="aiPreview.reasonMode" type="radio" value="merge" /> 合并旧错因</label>
                  <label class="ai-preview-mode"><input v-model="aiPreview.reasonMode" type="radio" value="replace" /> 用新替换旧</label>
                  <button class="btn btn-pri" @click="applyAiPreview()">✅ 采纳勾选内容</button>
                  <button class="btn btn-gh" @click="cancelAiPreview()">取消</button>
                </div>
              </div>
              <div v-if="guideText" class="guide-text">{{ guideText }}</div>
              <div v-if="coachOpen" class="coach-panel">
                <div class="coach-progress">
                  <span v-for="(s, i) in coachPlan.steps" :key="s.id" :class="{ on: coachStep >= i }">{{ i + 1 }} {{ s.title }}</span>
                </div>
                <template v-if="coachPlan.steps[coachStep]">
                  <div class="coach-q">{{ coachPlan.steps[coachStep].prompt }}</div>
                  <div v-if="coachPlan.notice" class="coach-notice">{{ coachPlan.notice }}</div>
                  <button v-for="o in coachPlan.steps[coachStep].options" :key="o.id" class="coach-opt" :class="{ on: coachAnswers[coachPlan.steps[coachStep].id] && coachAnswers[coachPlan.steps[coachStep].id].value === o.label }" @click="pickCoachOption(coachPlan.steps[coachStep].id, o.label)"><b>{{ o.label }}</b><span>{{ o.hint }}</span></button>
                  <button class="coach-opt" :class="{ on: coachAnswers[coachPlan.steps[coachStep].id] && coachAnswers[coachPlan.steps[coachStep].id].value === COACH_OTHER }" @click="pickCoachOption(coachPlan.steps[coachStep].id, COACH_OTHER)"><b>其他（自写）</b><span>选项都不贴合，我用原话写</span></button>
                  <textarea v-if="coachAnswers[coachPlan.steps[coachStep].id] && coachAnswers[coachPlan.steps[coachStep].id].value === COACH_OTHER" v-model="coachAnswers[coachPlan.steps[coachStep].id].custom" rows="2" placeholder="写下你真实的想法、卡点或下一步动作"></textarea>
                  <textarea v-if="coachStep === 2" v-model="coachWrote" rows="3" placeholder="补充你自己的话（可空）：这次最真实的感受、容易忽略的点或想提醒自己的话"></textarea>
                </template>
                <div v-else class="coach-loading">正在准备针对性选项…</div>
                <div v-if="coachPlan.error" class="coach-error">AI 生成失败：{{ coachPlan.error }}</div>
                <div class="coach-actions">
                  <button v-if="coachStep < 2" class="btn btn-pri" :disabled="coachPlan.loading" @click="coachNext()">下一步 →</button>
                  <button v-else class="btn btn-pri" :disabled="coachBusy || coachPlan.loading" @click="coachFinish()">{{ coachBusy ? '⏳ 正在整理…' : '保存这三步复盘' }}</button>
                  <button v-if="coachStep > 0 && !coachBusy" class="btn btn-gh" @click="coachStep--">← 上一步</button>
                  <button class="btn btn-gh" :disabled="coachPlan.loading" @click="refreshCoachPlan(true)">{{ coachPlan.loading ? '⏳ 重新生成中…' : '↻ 重新生成选项' }}</button>
                  <button class="btn btn-gh" @click="coachOpen = false">关闭</button>
                </div>
                <div v-if="coachSaved || coachFinal.length" class="coach-final">
                  <b>{{ coachSaved ? '✅ 已自动加入错因列表，并写入下方复盘区：' : '错因草稿：' }}</b>
                  <span v-for="r in coachFinal" :key="r">{{ r }}</span>
                  <div class="coach-deep-grid">
                    <div class="coach-deep-card">
                      <div class="coach-deep-hd"><b>⚡ 可迁移规律</b><button class="btn btn-gh" :disabled="!!coachFieldBusy" @click="askCoachField('pattern')">{{ coachFieldBusy === 'pattern' ? '⏳ 引导中…' : 'AI 引导我写' }}</button></div>
                      <textarea v-model="frm.method" rows="2" placeholder="下次遇到同类题先做什么"></textarea>
                      <div v-if="coachFieldGuide.pattern.q.length" class="coach-guide-list"><span v-for="q in coachFieldGuide.pattern.q" :key="q">{{ q }}</span><button v-if="coachFieldGuide.pattern.draft" class="btn btn-gh" @click="useCoachDraft('pattern')">采用草稿</button></div>
                    </div>
                    <div class="coach-deep-card">
                      <div class="coach-deep-hd"><b>📝 个人复盘笔记</b><button class="btn btn-gh" :disabled="!!coachFieldBusy" @click="askCoachField('note')">{{ coachFieldBusy === 'note' ? '⏳ 引导中…' : 'AI 引导我写' }}</button></div>
                      <textarea v-model="frm.note" rows="3" placeholder="以第一人称写下这次真正要提醒自己的话"></textarea>
                      <div v-if="coachFieldGuide.note.q.length" class="coach-guide-list"><span v-for="q in coachFieldGuide.note.q" :key="q">{{ q }}</span><button v-if="coachFieldGuide.note.draft" class="btn btn-gh" @click="useCoachDraft('note')">采用草稿</button></div>
                    </div>
                    <div class="coach-deep-card">
                      <div class="coach-deep-hd"><b>🧠 解析拆解</b><button class="btn btn-gh" :disabled="!!coachFieldBusy" @click="askCoachField('analysis')">{{ coachFieldBusy === 'analysis' ? '⏳ 引导中…' : 'AI 引导我写' }}</button></div>
                      <textarea v-model="frm.analysis" rows="3" placeholder="正确答案为什么成立、我错在哪一步、干扰项怎么设"></textarea>
                      <div v-if="coachFieldGuide.analysis.q.length" class="coach-guide-list"><span v-for="q in coachFieldGuide.analysis.q" :key="q">{{ q }}</span><button v-if="coachFieldGuide.analysis.draft" class="btn btn-gh" @click="useCoachDraft('analysis')">采用草稿</button></div>
                    </div>
                  </div>
                </div>
              </div>
              <!-- 自定义错因 + AI 规范化 -->
              <div class="custom-reason">
                <input
                  v-model="customReason"
                  placeholder="用自己的话写下错因，如：我把因果倒置当成了另有他因…"
                  @keydown.enter.prevent="addCustomReason()"
                />
                <button type="button" class="btn btn-gh" @click="addCustomReason()">➕ 添加</button>
                <button type="button" class="btn btn-gh" :disabled="aiPolishBusy" title="把口语化原因改写成专业表述" @click="aiPolishReason()">{{ aiPolishBusy ? '⏳ 规范化中…' : '✨ AI 规范化' }}</button>
              </div>
              <div class="cr-tip">✎/✕ 可改名、删除自定义与 AI 错因；✨ 规范化能把你的口语原因写成专业说法</div>
            </div>
            <div class="fld">
              <label>⚡ 秒杀规律（可迁移的一句话）</label>
              <input v-model="frm.method" placeholder="下次看到这类题先想…" />
            </div>
            <div class="fld">
              <label>📝 个人复盘笔记</label>
              <textarea v-model="frm.note" rows="3" placeholder="记录命题人坑点、同类题联想…"></textarea>
            </div>
            <div class="fld">
              <label>🧠 解析拆解</label>
              <textarea v-model="frm.analysis" rows="3" placeholder="正确答案为什么成立、我错在哪一步、干扰项如何设置…"></textarea>
            </div>
            <div class="pnl-btns">
              <button class="btn btn-pri" @click="save()">💾 保存复盘</button>
              <button class="btn btn-gh" :disabled="vtBusy" @click="startVariant()">{{ vtBusy ? '⏳ 找同类/出变式…' : '🔁 变式训练' }}</button>
            </div>
            <div v-if="relatedQs.length" class="related-box">
              <div class="related-hd">🔗 同类错题（大板块·细分·题型完全一致 {{ relatedQs.length }}）—— 连看吃透</div>
              <div v-for="(rq, ri) in relatedQs" :key="ri" class="related-it" @click="openRelated(rq.i)">
                <span class="related-sub">{{ rq.x.subject }}</span>
                <span class="related-q">{{ snippet((rq.x.question || ''), 60) }}</span>
                <span class="related-w">错 {{ rq.x.wrongCount || 1 }} 次</span>
              </div>
            </div>
          </div>
          <div v-if="!rep && (store.wqs[cur].answer || store.wqs[cur].method || store.wqs[cur].note)" class="rev-view">
            <div class="rv-item">✅ 答案：{{ store.wqs[cur].answer }}</div>
            <div class="rv-item">⚡ 秒杀：{{ store.wqs[cur].method }}</div>
            <div class="rv-item">📝 {{ store.wqs[cur].note }}</div>
            <div v-if="store.wqs[cur].analysis" class="rv-item">🧠 {{ store.wqs[cur].analysis }}</div>
            <div class="pnl-btns">
              <button class="btn btn-gh" @click="rep = true">✍️ 重新复盘</button>
              <button class="btn btn-gh" :disabled="vtBusy" @click="startVariant()">{{ vtBusy ? '⏳ 找同类/出变式…' : '🔁 变式训练' }}</button>
            </div>
          </div>

        <div v-if="cur >= 0 && store.wqs[cur]" style="margin-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <button class="btn btn-gh" style="padding:2px 10px;font-size: calc(12px * var(--ui-fs-scale, 1))" @click="memorizeRule()">🧠 记下这条规律（入记忆复习）</button>
          <span class="cr-tip">把「秒杀 / 笔记」摘要（≤60字）加入今日记忆复习队列</span>
        </div>
        <!-- R5 关联知识卡（按本题考点检索 437 张方法卡，只读 kb） -->
        <div v-if="kbCards.length" class="kb-link" style="margin-top:10px">
          <div class="kb-link-hd" style="cursor:pointer;font-weight:600" @click="kbOpen = !kbOpen">📇 关联知识卡（{{ kbCards.length }}）{{ kbOpen ? '▾ 收起' : '▸ 展开' }} <span class="cr-tip">按本题考点匹配 · 可展开 / 标记已学 / 跳知识库</span></div>
          <div v-if="kbOpen" style="margin-top:6px">
            <div v-for="c in kbCards" :key="c.id" class="kb-link-card" style="border:1px dashed var(--bg3,#334155);border-radius:8px;padding:6px 8px;margin-bottom:6px">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <b style="flex:1;min-width:140px">{{ c.plate }} · {{ c.type }}</b>
                <button class="btn btn-gh" style="padding:1px 8px;font-size: calc(11px * var(--ui-fs-scale, 1))" title="标记为已学（点亮知识图谱）" @click="markLearned(c.id)">✓ 已学</button>
                <button class="btn btn-gh" style="padding:1px 8px;font-size: calc(11px * var(--ui-fs-scale, 1))" @click="openKbCard(c.id)">🔍 知识库打开</button>
              </div>
              <details style="margin-top:4px"><summary style="cursor:pointer;font-size: calc(12px * var(--ui-fs-scale, 1));color:var(--text2)">要点 / 陷阱 / 例题</summary>
                <div style="font-size: calc(12px * var(--ui-fs-scale, 1));margin-top:4px;line-height:1.7">
                  <div v-if="(c.steps || []).length"><b>步骤：</b><span v-for="(s, i) in c.steps" :key="i">{{ s }}；</span></div>
                  <div v-if="(c.traps || []).length"><b>陷阱：</b><span v-for="(s, i) in c.traps" :key="i">{{ s }}；</span></div>
                  <div v-if="c.tip"><b>提示：</b>{{ c.tip }}</div>
                  <div v-if="c.example && c.example.q"><b>例：</b>{{ c.example.q }}</div>
                </div>
              </details>
            </div>
          </div>
        </div>
        <div v-else class="kb-strict-empty">📇 暂无可严格对应的知识卡：已按“大板块 · 细分板块 · 题型”完全一致校验，不作跨板块推荐。</div>
</template>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="show = false">关闭</button>
          <button class="btn btn-gh" @click="del()">🗑 删除</button>
        </div>
      </div>
    </div>
  <div v-if="imgView" class="img-view" @click.self="closeImg()">
    <img :src="imgView" class="iv-img" />
    <div class="iv-bar">
      <button type="button" class="iv-btn" @click.stop.prevent="downloadImg()">💾 保存原图</button>
      <button type="button" class="iv-btn iv-close" @click.stop.prevent="closeImg()">✕ 关闭</button>
    </div>
  </div>
  <div v-if="vtShow" class="ov redo-ov show" style="z-index: 500" @click.self="vtClose()">
    <div class="pnl redo-pnl">
      <h3>🔁 变式训练
        <span v-if="vtMode === 'do'" class="vt-prog">{{ vtIdx + 1 }} / {{ vtQueue.length }}</span>
        <span v-if="vtMode === 'result'" class="vt-prog">得分 {{ vtScore }} / {{ vtQueue.length }}</span>
      </h3>

      <!-- ① 选题量 -->
      <div v-if="vtMode === 'pick'" class="vt-pick">
        <div class="vt-step-l">① 选择题目来源</div>
        <div class="vt-pick-src-row">
          <button class="vt-src-btn" :class="{ on: vtSource === 'lib' }" :disabled="!relatedQs.length" @click="chooseVtSource('lib')">
            <b>📚 错题集同类</b>
            <span>{{ relatedQs.length ? '本错题共有 ' + vtLibMax + ' 道同类可练' : '当前没有同类错题' }}</span>
          </button>
          <button class="vt-src-btn" :class="{ on: vtSource === 'ai' }" @click="chooseVtSource('ai')">
            <b>🤖 AI 变式训练</b>
            <span>保留原题骨架，按难度重新命题</span>
          </button>
        </div>

        <template v-if="vtSource === 'lib'">
          <div class="vt-step-l">② 选择题量（最多 <b>{{ vtLibMax }}</b> 道）</div>
          <div class="vt-pick-opts">
            <button v-for="n in vtLibMax" :key="n" class="btn" :class="vtCount === n ? 'btn-pri' : 'btn-gh'" @click="vtCount = n">{{ n }} 道</button>
          </div>
          <div class="vt-pick-src">📚 直接从你的错题集里复用同类题，答案与解析都来自你已收藏的真实错题。</div>
        </template>
        <template v-else>
          <div class="vt-step-l">② 选择难度</div>
          <div class="vt-diff-row">
            <button v-for="d in [['easy','简单','只换话题'],['mid','中等','换等价表述考真懂'],['hard','困难','骨架复合变形'],['mix','混合','简+中+难']]" :key="d[0]" class="vt-diff-btn" :class="{ on: vtDifficulty === d[0] }" @click="chooseVtDiff(d[0])">
              <b>{{ d[1] }}</b><span>{{ d[2] }}</span>
            </button>
          </div>
          <div class="vt-step-l">③ 选择题量（最多 <b>{{ vtMax }}</b> 道）</div>
          <div class="vt-pick-opts">
            <button v-for="n in vtMax" :key="n" class="btn" :class="vtCount === n ? 'btn-pri' : 'btn-gh'" @click="vtCount = n">{{ n }} 道</button>
          </div>
          <div class="vt-pick-src">🤖 AI 会先提炼原题骨架，再按难度换话题/换表述/复合变形，核心考点保持一致。</div>
        </template>

        <div class="pnl-btns">
          <button class="btn btn-gh" @click="vtClose()">取消</button>
          <button class="btn btn-pri" @click="vtStartDo()">{{ vtSource === 'lib' ? '🚀 用同类错题开始' : '🚀 生成 AI 变式并开始' }}</button>
        </div>
      </div>

      <!-- ② 答题卡作答（可切换题号、可改答案，全部做完提交统一批改） -->
      <div v-else-if="vtMode === 'do'">
        <div v-if="vtBusy" class="vt-busy">🚀 正在用快模型生成同考点变式…</div>
        <template v-else-if="vtQ">
          <div class="vt-card-nav">
            <span
              v-for="(q, i) in vtQueue"
              :key="i"
              class="vt-no"
              :class="{ cur: i === vtIdx, done: vtAnswers[i] }"
              @click="vtGo(i)"
            >{{ i + 1 }}</span>
            <span class="vt-nav-tip">点题号可跳转 · 已答 {{ Object.keys(vtAnswers).length }} / {{ vtQueue.length }}</span>
          </div>
          <div class="redo-subj">{{ vtQ.subject }} · {{ vtQ.source === 'ai' ? 'AI 变式 · ' + (vtQ.difficulty || '') : '错题集同类' }}</div>
          <div class="paper-q">
            <div class="paper-stem" v-html="richMd(vtQ.stem)"></div>
            <div v-if="(vtQ.options || []).length >= 2" class="paper-opts">
              <button
                v-for="o in vtQ.options"
                :key="o.k"
                class="paper-opt"
                :class="{ sel: vtPick === o.k }"
                @click="vtChoose(o.k)"
              >{{ o.k }}. <span v-html="richMd(String(o.t || ''))"></span></button>
            </div>
            <div v-else class="redo-btns">
              <button class="btn btn-pri" :class="{ sel: vtPick === '对' }" @click="vtChoose('对')">✅ 我答对了</button>
              <button class="btn btn-gh" :class="{ sel: vtPick === '错' }" @click="vtChoose('错')">❌ 还是错了</button>
            </div>
          </div>
          <div class="pnl-btns">
            <button class="btn btn-gh" :disabled="vtIdx === 0" @click="vtNav(-1)">← 上一题</button>
            <button class="btn btn-gh" :disabled="vtIdx === vtQueue.length - 1" @click="vtNav(1)">下一题 →</button>
            <button class="btn btn-pri" @click="vtSubmit()">📋 提交答题卡</button>
          </div>
        </template>
      </div>

      <!-- ③ 批改结果 -->
      <div v-else-if="vtMode === 'result'" class="vt-result">
        <div class="vt-score">
          得分 <b>{{ vtScore }}</b> / {{ vtQueue.length }} · 正确率 {{ Math.round((vtScore / vtQueue.length) * 100) }}%
        </div>
        <div class="vt-comment" :class="vtScore === vtQueue.length ? 'all' : vtScore === 0 ? 'none' : 'part'">
          {{ vtScore === vtQueue.length ? '🎉 全部答对，这组题彻底拿下了！' : vtScore === 0 ? '😥 全部答错——先别急，看看下面的横向对比复盘' : '💪 答对 ' + vtScore + ' 道，把答错的题重点巩固' }}
        </div>
        <div v-for="(q, i) in vtQueue" :key="i" class="vt-r-item">
          <div class="vt-r-hd" @click="vtToggleOpen(i)">
            <span class="vt-r-no">{{ i + 1 }}</span>
            <span class="vt-r-badge" :class="vtResultOf(i)">{{ vtResultOf(i) === 'ok' ? '✓' : '✗' }}</span>
            <span class="vt-r-q">{{ snippet((q.stem || ''), 70) }}</span>
            <span class="vt-r-mine">我选 {{ vtAnswers[i] }} · 答案 {{ q.answer }}</span>
          </div>
          <div v-if="vtOpen[i]" class="vt-r-detail">
            <div class="vt-r-ex" v-html="richMd(String((q && q.explain) || ''))"></div>
            <button v-if="vtResultOf(i) === 'no' && q.source === 'ai'" class="btn btn-pri" @click="vtAddWrong(i)">📌 加入错题集</button>
            <span v-else-if="vtResultOf(i) === 'no'" class="cr-tip">错题集同类题已在错题本中</span>
          </div>
        </div>
        <!-- 第 6 步 · 回到原题深度巩固（记骨架，不记答案；分板块针对性核心要点 + AI 结合本题剖析） -->
        <div class="vt-step6" :class="{ hard: vtAllWrong }">
          <div class="vt-step6-t">📌 第 6 步 · 回到原题深度巩固 <span class="cr-tip">记骨架，不记答案</span></div>
          <div class="paper-q">
            <div class="paper-stem" v-html="richMd(coreOrigMd)"></div>
          </div>
          <div v-if="coreCard" class="core-card">
            <div class="core-hd">🧠 {{ coreCard.subject }} · 记忆核心要点（{{ coreCard.tag }}）</div>
            <ul class="core-points">
              <li v-for="(p, i) in coreCard.points" :key="i">{{ p }}</li>
            </ul>
          </div>
          <div class="core-acts">
            <button class="btn btn-pri" :disabled="coreAiBusy" @click="askCoreDeep()">{{ coreAiBusy ? '⏳ AI 剖析中…' : '🧠 AI 深度剖析本题骨架' }}</button>
          </div>
          <div v-if="coreAiText" class="core-ai" v-html="richMd(coreAiText)"></div>
        </div>
        <!-- 全错 → 原题 × 变式 横向比较复盘 -->
        <div v-if="vtAllWrong" class="vt-deep">
          <div class="vt-deep-t">⚠️ 全部做错 = 没掌握这组题的共同套路，建议深度复盘突破瓶颈</div>
          <div class="vt-compare">
            <div class="vt-c-col">
              <div class="vt-c-hd">📄 原题</div>
              <div class="vt-c-q">{{ origStem }}</div>
            </div>
            <div v-for="(q, i) in vtQueue" :key="i" class="vt-c-col">
              <div class="vt-c-hd">🔁 变式{{ i + 1 }}</div>
              <div class="vt-c-q">{{ snippet((q.stem || ''), 240) }}</div>
            </div>
          </div>
          <button class="btn btn-pri" :disabled="vtCmpBusy" @click="vtDeepCompare()">{{ vtCmpBusy ? '⏳ 对比中…' : '🧠 AI 横向比较复盘' }}</button>
          <div v-if="vtCmpText" class="vt-cmp" v-html="richMd(vtCmpText)"></div>
        </div>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="vtClose()">关闭</button>
          <button class="btn btn-pri" @click="vtClose()">✅ 完成训练</button>
        </div>
      </div>
    </div>
  </div>

    <div v-if="editQShow" class="ov show" @click.self="editQShow = false">
      <div class="pnl idiom-pnl">
        <h3>✏️ 编辑错题原文与答案</h3>
        <div class="id-row"><b>分类（大板块 → 细分 → 题型）</b></div>
        <div class="id-row" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:8px">
          <select v-model="editQGroup" class="pv-edit" @change="onEditGroupChange()">
            <option value="">选择大板块</option>
            <option v-for="g in editGroupOptions" :key="g" :value="g">{{ g }}</option>
          </select>
          <select v-model="editQSub" class="pv-edit" :disabled="!editQGroup" @change="onEditSubChange()">
            <option value="">选择细分板块</option>
            <option v-for="s in editSubOptions" :key="s" :value="s">{{ s }}</option>
          </select>
          <select v-model="editQType" class="pv-edit" :disabled="!editQSub && !editQGroup">
            <option value="">选择题型</option>
            <option v-for="t in editTypeOptions" :key="t" :value="t">{{ t }}</option>
          </select>
        </div>
        <div class="id-row"><b>题干 / 选项</b><textarea v-model="editQText" rows="8" class="pv-edit" style="width:100%;min-height:170px;resize:vertical"></textarea></div>
        <div class="id-row"><b>正确答案</b><input v-model="editQAnswer" class="pv-edit" style="width:100%" placeholder="如：正确答案 B，或填 B" /></div>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="editQShow = false">取消</button>
          <button class="btn btn-pri" @click="saveEditQ()">💾 保存题目</button>
        </div>
      </div>
    </div>
    <AiTeach
      v-if="translateShow"
      mode="translation"
      initial-tab="logic"
      :initial-text="translateText"
      :initial-answer="translateAnswer"
      :initial-subject="translateSubject"
      :initial-sub="translateSub"
      :initial-type="translateType"
      @close="translateShow = false"
    />
</template>

<style scoped>
.absorb-card { margin: 8px 0 10px; padding: 10px 12px; border: 1px solid var(--glass-border); border-radius: 12px; background: var(--glass-bg); }
.absorb-card.ok { border-color: var(--state-success-border); }
.absorb-card.warn { border-color: var(--state-danger-border); }
.absorb-hd { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.absorb-lv { font-size: calc(11px * var(--ui-fs-scale, 1)); font-weight: 800; color: var(--accent); }
.absorb-card.ok .absorb-lv { color: var(--state-success-text); }
.absorb-card.warn .absorb-lv { color: var(--state-danger-text); }
.absorb-bar { height: 6px; border-radius: 4px; background: rgba(127, 127, 127, 0.18); overflow: hidden; margin: 7px 0; }
.absorb-bar i { display: block; height: 100%; background: linear-gradient(90deg, var(--state-danger), var(--state-warning), var(--state-success)); }
.absorb-steps { display: flex; gap: 5px; flex-wrap: wrap; font-size: calc(11.5px * var(--ui-fs-scale, 1)); color: var(--text3); }
.absorb-steps span { border: 1px solid var(--glass-border); border-radius: 14px; padding: 2px 7px; }
.absorb-steps span.done { color: var(--state-success-text); border-color: var(--state-success-border); background: var(--state-success-bg); }
.absorb-next { margin-top: 7px; font-size: calc(12px * var(--ui-fs-scale, 1)); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.absorb-next .btn { padding: 3px 10px; font-size: calc(11.5px * var(--ui-fs-scale, 1)); }
.absorb-next.done { color: var(--state-success-text); }
.wq-warning-note { display:flex;gap:8px;flex-wrap:wrap;align-items:center;background:var(--state-warning-bg);border:1px solid var(--state-warning-border);color:var(--state-warning-text);border-radius:8px;padding:8px 10px;margin-bottom:8px;font-size:calc(12.5px * var(--ui-fs-scale, 1)); }
.absorb-core { margin-top: 7px; padding-top: 7px; border-top: 1px dashed var(--glass-border); font-size: calc(12.5px * var(--ui-fs-scale, 1)); line-height: 1.7; }
</style>
