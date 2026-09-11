<script setup>
// R4：错题模块子组件（从 WrongPage.vue 对应模板逐字搬入）
// 父组件通过 ctx 注入全部依赖；模板保持与 WrongPage 完全一致，仅把状态/方法从 ctx 暴露到本组件作用域。
import { toRefs, computed, ref } from 'vue'
import { richMd, snippet } from '../utils/wrongText' // 错题渲染净化
import { downloadMdScreenshot, downloadLiveScreenshot } from '../utils/capture'
import { retrieveCardsV2 } from '../kb/retrieveV2' // R5 关联知识卡（只读 kb）
import { markLearned } from '../utils/learned'
import { loadSrs, saveSrs, enqueueNew, ymdKey } from '../utils/memorySrs' // R5 二期：一键入记忆
import { showToast } from '../utils/toast' // R5 标记已学
import { absorbState } from '../utils/wrongAbsorb'
import { chatOnce, activeCfg } from '../api'
import { COACH_OTHER, buildCoachPayload } from '../utils/wrongReasonCoach'

const props = defineProps({ ctx: { type: Object, required: true } })

const {
  aiBusy,
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
const coachOpen = ref(false)
const coachStep = ref(0)
const coachFirst = ref('')
const coachFirstCustom = ref('')
const coachBlock = ref('')
const coachBlockCustom = ref('')
const coachNextAction = ref('')
const coachNextCustom = ref('')
const coachWrote = ref('')
const coachBusy = ref(false)
const coachFinal = ref([])
const coachDeep = ref({ pattern: '', note: '', analysis: '' })
const coachFieldGuide = ref({ pattern: { q: [], draft: '' }, note: { q: [], draft: '' }, analysis: { q: [], draft: '' } })
const coachFieldBusy = ref('')
const coachSaved = ref(false)
const coachOptions = [
  { t: '只看了局部关键词，没先还原完整意思', d: '一眼抓到熟悉的词就急着选' },
  { t: '分不清结论和论据', d: '知道题干在讲事，但说不清到底要证明什么' },
  { t: '选项方向看反了', d: '支持和削弱、原因和结果、主体和客体混了' },
  { t: '几个选项都觉得对，不会比力度', d: '没有比较直接程度、必要程度和覆盖范围' },
  { t: '其实是知识点没懂', d: '题目读懂了，但对应的规则/公式/方法不会用' }
]
const coachStep2Options = [
  { t: '题干翻译错了', d: '我用自己的话复述时就已经理解偏了' },
  { t: '结论找错了', d: '把背景、现象或论据误当成结论' },
  { t: '论据和结论的连接断了', d: '没看出中间缺了哪一步' },
  { t: '选项说的是另一个主体/范围', d: '被相似词带跑，没有核对主体、时间、范围' },
  { t: '最后排除时凭感觉', d: '两个选项之间没有用统一标准比较' }
]
const coachStep3Options = [
  { t: '先把题干翻译成完整意思，再找结论和论据', d: '先还原意思，不急着看选项' },
  { t: '先圈出结论，再逐一核对选项主体和范围', d: '用固定顺序排除，不靠语感' },
  { t: '先写出判断标准，再比较选项力度', d: '两个选项之间用同一把尺子' },
  { t: '先补对应知识点，再回来做同类题', d: '知识缺口先用例子补上' },
  { t: '把这道题改成一句话规律，隔天复述一次', d: '把经验固定成可迁移动作' }
]
const reasonCoachReady = computed(() => !!(cur.value >= 0 && store.wqs[cur.value] && store.wqs[cur.value].reasonCoach && store.wqs[cur.value].reasonCoach.completed))
function openLogicTranslate() {
  const q = cur.value >= 0 ? store.wqs[cur.value] : null
  if (!q) return
  const text = String(q.question || q.q || q.stem || '') + (q.answer ? '\n\n参考答案：' + q.answer : '')
  window.dispatchEvent(new CustomEvent('xc-open-ai-teach', { detail: { tab: 'logic', text, answer: q.answer || '' } }))
  store.tab = 'kb'
  show.value = false
}
function openCoach() {
  const q = cur.value >= 0 ? store.wqs[cur.value] : null
  const rc = (q && q.reasonCoach) || {}
  coachOpen.value = true
  coachStep.value = 0
  coachFirst.value = rc.first || ''
  coachFirstCustom.value = rc.firstCustom || ''
  coachBlock.value = rc.block || ''
  coachBlockCustom.value = rc.blockCustom || ''
  coachNextAction.value = rc.next || ''
  coachNextCustom.value = rc.nextCustom || ''
  coachWrote.value = rc.reflection || ''
  coachFinal.value = Array.isArray(rc.adopted) ? rc.adopted.slice() : []
  coachDeep.value = rc.deep ? { pattern: '', note: '', analysis: '', ...rc.deep } : { pattern: '', note: '', analysis: '' }
  coachFieldGuide.value = { pattern: { q: [], draft: '' }, note: { q: [], draft: '' }, analysis: { q: [], draft: '' } }
  coachSaved.value = false
}
function pickCoachOption(step, t) {
  if (step === 0) coachFirst.value = t
  else if (step === 1) coachBlock.value = t
  else coachNextAction.value = t
}
function coachChoice(step) {
  if (step === 0) return coachFirst.value === COACH_OTHER ? coachFirstCustom.value.trim() : coachFirst.value
  if (step === 1) return coachBlock.value === COACH_OTHER ? coachBlockCustom.value.trim() : coachBlock.value
  return coachNextAction.value === COACH_OTHER ? coachNextCustom.value.trim() : coachNextAction.value
}
function coachNext() {
  if (coachStep.value === 0) {
    if (!coachChoice(0)) { showToast('先选一个最接近你当时状态的说法，或写下自己的情况', 'info'); return }
    coachStep.value = 1
    return
  }
  if (coachStep.value === 1) {
    if (!coachChoice(1)) { showToast('再选一个最接近你的卡点，或写下自己的卡点', 'info'); return }
    coachStep.value = 2
  }
}
async function coachFinish() {
  const q = cur.value >= 0 ? store.wqs[cur.value] : null
  if (!q) return
  const payload = buildCoachPayload({
    first: coachFirst.value,
    firstCustom: coachFirstCustom.value,
    block: coachBlock.value,
    blockCustom: coachBlockCustom.value,
    next: coachNextAction.value,
    nextCustom: coachNextCustom.value,
    reflection: coachWrote.value
  })
  if (!payload.first || !payload.block || !payload.next) { showToast('三步都完成后才能整理；每步都可以选选项或写“其他”', 'info'); return }
  coachBusy.value = true
  try {
    q.reasonCoach = {
      ...(q.reasonCoach || {}),
      ...payload,
      firstCustom: coachFirstCustom.value.trim(),
      blockCustom: coachBlockCustom.value.trim(),
      nextCustom: coachNextCustom.value.trim(),
      completed: true,
      at: Date.now()
    }
    const local = {
      reasons: [
        '当时状态：' + payload.first,
        payload.block !== payload.first ? '核心卡点：' + payload.block : '',
        '下次动作：' + payload.next
      ].filter(Boolean).slice(0, 3),
      pattern: '下次遇到同类题，先做到：' + payload.next,
      note: payload.reflection || '我容易在“' + payload.block + '”这一环失去稳定判断；下次先写出判断标准，再比较选项。',
      analysis: '这道题的失分链是：' + payload.first + ' → ' + payload.block + '。复盘时先还原当时的判断顺序，再把正确标准固定成下一步动作。'
    }
    applyCoachReview(q, local, { autoSave: true, source: 'local' })
    coachFinal.value = local.reasons
    coachDeep.value = { pattern: local.pattern, note: local.note, analysis: local.analysis }
    coachSaved.value = true
    const c = activeCfg()
    if (c && c.key) {
      await askAiReasons()
      const deep = q.reasonCoach && q.reasonCoach.deep
      if (deep && Object.values(deep).some(Boolean)) coachDeep.value = { ...coachDeep.value, ...deep }
      if (Array.isArray(q.reasonCoach && q.reasonCoach.adopted) && q.reasonCoach.adopted.length) coachFinal.value = q.reasonCoach.adopted.slice()
    } else {
      showToast('✅ 已整理并自动加入错因；配置文字模型后可继续 AI 深挖', 'success')
    }
  } catch (e) {
    showToast('AI 深挖未完成，自己的分步复盘已经保存', 'info')
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
    const user = '分步复盘：' + JSON.stringify({ first: rc.first, block: rc.block, next: rc.next, reflection: rc.reflection }) + '\n当前' + labels[field] + '：' + String(frm.value[field] || '（空）') + '\n请给出两个能让考生自己写出内容的追问，并给一段可编辑草稿。'
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
    return retrieveCardsV2(String(q.subject || q.plate || ''), String(q.question || q.q || q.stem || ''), 3)
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
  aiPolishReason,
  ankiPush,
  applyCoachReview,
  askAiReasons,
  askCoreDeep,
  closeImg,
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
      <div class="pnl">
        <h3>📋 错题详情</h3>
        <template v-if="cur >= 0 && store.wqs[cur]">
          <div class="pnl-sub">
            {{ wrongGroupOf(store.wqs[cur]) }} · {{ wrongSubOf(store.wqs[cur]) || '未分类' }} · {{ wrongTypeOf(store.wqs[cur]) }}
            <span class="wq-goto" @click.self.stop="gotoChat()">↩ 查看原对话</span>
            <span class="wq-goto" @click.self.stop="openEditQ()">✏️ 编辑题目</span>
            <span class="wq-goto" title="打开逻辑题干翻译，把题干和选项翻译成大白话" @click.self.stop="openLogicTranslate()">🧭 去白话翻译题干选项</span>
            <span class="wq-goto" title="带着本题去对话页，让 AI 按考点、骨架、陷阱、修正、变式深挖" @click.self.stop="gotoDeepChat()">💬 带去对话深挖</span>
            <span class="wq-goto" title="进入错题集组卷；本场作答结果会自动写回原错题吸收度" @click.self.stop="gotoWrongExam()">🎲 去 AI 出题练</span>
            <span v-if="store.wqs[cur].archived" class="wq-goto" title="移回错题集继续学习" @click.self.stop="unarchiveWrong(store.wqs[cur])">↩ 移回错题集</span>
            <span v-else class="wq-goto" title="彻底吃透后移出错题集，放入单独收藏夹" @click.self.stop="archiveWrong(store.wqs[cur])">📦 吃透收藏</span>
            <span class="wq-goto" title="以答题界面（可作答+即时判题）重做本题" @click.self.stop="openRedo()">✍️ 答题界面重做</span>
            <span class="wq-goto" title="主动回忆复盘：先默写考点/思路再展开解析（计入二刷统计）" @click.self.stop="openRecall(store.wqs[cur])">🧠 主动回忆</span>
            <span class="wq-goto" @click.self.stop="copyObsidianWrong(store.wqs[cur])">📋 复制 Obsidian</span>
            <span class="wq-goto" @click.self.stop="ankiPush()">🃏 推到 Anki</span>
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
                    <div v-if="missingFig" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;background:rgba(255,180,0,.12);border:1px solid rgba(255,180,0,.5);color:#f5b842;border-radius:8px;padding:8px 10px;margin-bottom:8px;font-size: calc(12.5px * var(--ui-fs-scale, 1))">
            ⚠️ 该题入库时未保存图形（只有占位符）。可本地一键重建（图形/选项/答案，确定性零额度）：
            <button class="btn btn-pri" style="padding:4px 12px" @click="repairFig()">🛠 重建本题</button>
            <button class="btn btn-gh" style="padding:4px 12px" @click="gotoChat()">↩ 回原对话看原图</button>
          </div>
<div class="paper-q">
            <div class="paper-stem" v-html="richMd(paperView.stem)"></div>
            <div v-if="paperView.opts.length" class="paper-opts">
              <div v-for="o in paperView.opts" :key="o.k" class="paper-opt"><b>{{ o.k }}.</b> <span v-html="richMd(String(o.t || ''))"></span></div>
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
                <button type="button" class="btn btn-gh" :disabled="!reasonCoachReady || aiBusy" :title="reasonCoachReady ? '基于你的分步复盘，继续生成错因、规律、个人笔记和解析拆解' : '先完成分步引导，AI 深挖才会解锁'" @click="askAiReasons()">{{ aiBusy ? '⏳ AI 深挖中…' : reasonCoachReady ? '🤖 AI 一键辅助（规律/笔记/解析）' : '🔒 先完成分步引导' }}</button>
                <span class="cr-tip">每一步都能选选项或“其他（自写）”；完成后自动加入错因，再继续 AI 深挖</span>
              </div>
              <div v-if="guideText" class="guide-text">{{ guideText }}</div>
              <div v-if="coachOpen" class="coach-panel">
                <div class="coach-progress">
                  <span :class="{ on: coachStep >= 0 }">1 当时怎么想</span>
                  <span :class="{ on: coachStep >= 1 }">2 卡在哪一步</span>
                  <span :class="{ on: coachStep >= 2 }">3 下次先做什么</span>
                </div>
                <template v-if="coachStep === 0">
                  <div class="coach-q">先别急着看答案。你当时做这道题时，最接近哪种状态？</div>
                  <button v-for="o in coachOptions" :key="o.t" class="coach-opt" :class="{ on: coachFirst === o.t }" @click="pickCoachOption(0, o.t)"><b>{{ o.t }}</b><span>{{ o.d }}</span></button>
                  <button class="coach-opt" :class="{ on: coachFirst === COACH_OTHER }" @click="pickCoachOption(0, COACH_OTHER)"><b>其他（自写）</b><span>选项都不贴合，我用原话写</span></button>
                  <textarea v-if="coachFirst === COACH_OTHER" v-model="coachFirstCustom" rows="2" placeholder="写下你当时真实的想法或状态"></textarea>
                </template>
                <template v-else-if="coachStep === 1">
                  <div class="coach-q">很好。再往下追一层：你觉得自己真正卡在哪一步？</div>
                  <button v-for="o in coachStep2Options" :key="o.t" class="coach-opt" :class="{ on: coachBlock === o.t }" @click="pickCoachOption(1, o.t)"><b>{{ o.t }}</b><span>{{ o.d }}</span></button>
                  <button class="coach-opt" :class="{ on: coachBlock === COACH_OTHER }" @click="pickCoachOption(1, COACH_OTHER)"><b>其他（自写）</b><span>我的卡点不在这些选项里</span></button>
                  <textarea v-if="coachBlock === COACH_OTHER" v-model="coachBlockCustom" rows="2" placeholder="写下你真正卡住的具体一步"></textarea>
                </template>
                <template v-else>
                  <div class="coach-q">最后决定下次动作：遇到同类题，第一步先做什么？</div>
                  <button v-for="o in coachStep3Options" :key="o.t" class="coach-opt" :class="{ on: coachNextAction === o.t }" @click="pickCoachOption(2, o.t)"><b>{{ o.t }}</b><span>{{ o.d }}</span></button>
                  <button class="coach-opt" :class="{ on: coachNextAction === COACH_OTHER }" @click="pickCoachOption(2, COACH_OTHER)"><b>其他（自写）</b><span>我要写自己的下次动作</span></button>
                  <textarea v-if="coachNextAction === COACH_OTHER" v-model="coachNextCustom" rows="2" placeholder="例如：先复述结论，再核对每个选项的主体和范围"></textarea>
                  <textarea v-model="coachWrote" rows="3" placeholder="补充你自己的话（可空）：这次最真实的感受、容易忽略的点或想提醒自己的话"></textarea>
                </template>
                <div class="coach-actions">
                  <button v-if="coachStep < 2" class="btn btn-pri" @click="coachNext()">下一步 →</button>
                  <button v-else class="btn btn-pri" :disabled="coachBusy" @click="coachFinish()">{{ coachBusy ? '⏳ 正在整理并深挖…' : '一键整理 · 自动加入错因 · 继续深挖' }}</button>
                  <button v-if="coachStep > 0 && !coachBusy" class="btn btn-gh" @click="coachStep--">← 上一步</button>
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
</template>
<style scoped>
.absorb-card { margin: 8px 0 10px; padding: 10px 12px; border: 1px solid var(--glass-border); border-radius: 12px; background: var(--glass-bg); }
.absorb-card.ok { border-color: rgba(52, 211, 153, 0.45); }
.absorb-card.warn { border-color: rgba(251, 113, 133, 0.4); }
.absorb-hd { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.absorb-lv { font-size: calc(11px * var(--ui-fs-scale, 1)); font-weight: 800; color: var(--accent); }
.absorb-card.ok .absorb-lv { color: #34d399; }
.absorb-card.warn .absorb-lv { color: #fb7185; }
.absorb-bar { height: 6px; border-radius: 4px; background: rgba(127, 127, 127, 0.18); overflow: hidden; margin: 7px 0; }
.absorb-bar i { display: block; height: 100%; background: linear-gradient(90deg, #fb7185, #fbbf24, #34d399); }
.absorb-steps { display: flex; gap: 5px; flex-wrap: wrap; font-size: calc(11.5px * var(--ui-fs-scale, 1)); color: var(--text3); }
.absorb-steps span { border: 1px solid var(--glass-border); border-radius: 14px; padding: 2px 7px; }
.absorb-steps span.done { color: #34d399; border-color: rgba(52, 211, 153, 0.42); }
.absorb-next { margin-top: 7px; font-size: calc(12px * var(--ui-fs-scale, 1)); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.absorb-next .btn { padding: 3px 10px; font-size: calc(11.5px * var(--ui-fs-scale, 1)); }
.absorb-next.done { color: #34d399; }
.absorb-core { margin-top: 7px; padding-top: 7px; border-top: 1px dashed var(--glass-border); font-size: calc(12.5px * var(--ui-fs-scale, 1)); line-height: 1.7; }
</style>
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
</template>
