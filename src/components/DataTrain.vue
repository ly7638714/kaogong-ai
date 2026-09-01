<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { genDataQ, CALC_METHOD_LIB } from '../utils/dataTrainGen'
import { KNOWLEDGE_CARDS, KB_LAYERS, searchCards, cardForQuiz } from '../utils/dataTrainLib'
import { renderMd } from '../utils/renderMd'
import { showToast } from '../utils/toast'
import { store } from '../store'
import { chatOnce, activeCfg } from '../api'

const emit = defineEmits(['close', 'send-question'])
const md = (t) => renderMd(t || '')

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
const stats = ref({ ok: 0, bad: 0, total: 0, start: Date.now() })
const streak = ref(0)
const bestStreak = ref(0)
const score = ref(0)
const elapsed = ref(0)
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

function gen() {
  if (mode.value === 'theory') return
  picked.value = ''
  aiText.value = ''
  const seed = Date.now() % 100000 + idx.value * 137
  q.value = genDataQ(mode.value, seed, level.value, mode.value === 'calc' ? stage.value : undefined)
  if (!q.value) {
    showToast('生成失败，请重试', 'err')
    return
  }
  idx.value++
}
function pick(k) {
  if (!q.value || picked.value) return
  picked.value = k
  const ok = k === q.value.answer
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
  stats.value = { ok: 0, bad: 0, total: 0, start: Date.now() }
  elapsed.value = 0
  streak.value = 0
  idx.value = 0
  gen()
}
function nextQ() {
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
  const m = { a: 'A', b: 'B', c: 'C', d: 'D' }[String(e.key).toLowerCase()]
  if (m && !picked.value && q.value) pick(m)
  if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && picked.value) nextQ()
}
onMounted(() => {
  gen()
  window.addEventListener('keydown', onKey)
  timerId = setInterval(() => {
    elapsed.value = Math.floor((Date.now() - stats.value.start) / 1000)
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
</script>
<template>
  <div class="ov show dt-ov" @click.self="emit('close')">
    <div class="pnl dt-pnl">
      <div class="dt-head">
        <button class="pnl-top-b" style="margin-right: 4px" title="返回上一层（也可按 Esc / 浏览器返回）" @click="emit('close')">← 返回</button>
        <span class="dt-title">📊 资料分析 · 四层能力训练</span>
        <div class="dt-acts">
          <span class="dt-chip" title="累计积分：答对+10，连击有加成">🏆 {{ score }}</span>
          <span class="dt-chip" :class="{ hot: streak >= 3 }" title="连续答对">🔥 ×{{ streak }}<span v-if="bestStreak" class="dt-chip-sub">（最高{{ bestStreak }}）</span></span>
          <button class="btn btn-gh" @click="helpShow = !helpShow">{{ helpShow ? '收起说明' : '📖 能力说明' }}</button>
          <button class="btn btn-pri" @click="reset()">🔄 再来一组</button>
          <button class="pc-close" @click="emit('close')">✕</button>
        </div>
      </div>

      <div class="dt-body">
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
            <div class="dt-st-row">⏱ 用时 <b>{{ elapsed }}s</b></div>
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
            <div class="dt-qcard">
              <div class="dt-qhead">
                <span class="dt-qtag">{{ qName || '训练' }}</span>
                <span class="dt-qmode">{{ MODES.find((m) => m.k === mode).t }}<template v-if="mode === 'calc'"> · {{ STAGES.find((s) => s.k === stage).t }}</template></span>
                <span class="dt-qidx">第 {{ idx }} 题</span>
              </div>
            <div v-if="q.materialMd" class="dt-mat" v-html="md(q.materialMd)"></div>
            <div v-if="q.materialSvg" class="dt-mat dt-mat-svg" v-html="q.materialSvg"></div>
            <div v-if="q.materialMd || q.materialSvg" class="dt-mat-note">📌 本材料为训练用模拟数据（非真实统计），仅用于方法练习</div>
              <div class="dt-q" v-html="md(q.q)"></div>
            </div>

            <div class="dt-opts" :class="{ wide: mode === 'formula' }">
              <button v-for="o in q.options" :key="o.k" class="dt-opt" :class="{ picked: picked === o.k, right: picked && o.k === q.answer, wrong: picked && o.k === picked && o.k !== q.answer }" :disabled="!!picked" @click="pick(o.k)">
                <span class="dt-k">{{ o.k }}</span><span class="dt-t" v-html="md(o.t)"></span>
              </button>
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
  </div>
</template>

<style scoped>
.dt-ov { z-index: 91; }
.dt-pnl { width: min(1180px, 97vw); max-width: min(1180px, 97vw); max-height: 94vh; display: flex; flex-direction: column; overflow: hidden; }
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
  .dt-ov { overflow-x: hidden; padding: 0; align-items: stretch; }
  .dt-pnl { width: 100%; max-width: 100%; max-height: 100vh; max-height: 100dvh; height: 100vh; height: 100dvh; border-radius: 0; }
  .dt-body { flex-direction: column; flex-wrap: nowrap; overflow-y: auto; -webkit-overflow-scrolling: touch; }
  .dt-side { flex: none; width: 100%; min-width: 0; flex-direction: row; flex-wrap: nowrap; overflow-x: auto; max-height: none; gap: 8px; padding-bottom: 4px; -webkit-overflow-scrolling: touch; }
  .dt-side .dt-card { flex: 0 0 230px; min-width: 230px; }
  .dt-train { flex: 1 1 auto; min-width: 0; max-height: none; overflow-y: visible; }
  .dt-title { font-size: 14px; }
  .dt-head { gap: 6px; }
  .dt-opt { font-size: 13px; padding: 11px 10px; min-height: 44px; }
  .dt-q { font-size: 13.5px; }
  .dt-mat :deep(th), .dt-mat :deep(td) { padding: 3px 5px; font-size: 11px; }
  .dt-mat :deep(table) { display: block; overflow-x: auto; }
  .dt-modes .btn, .dt-diff .btn { font-size: 12px; padding: 6px 8px; }
  .dt-ex-b { font-size: 13px; }
  .dt-ex-acts .btn { font-size: 12px; }
  .dt-kb-bar .btn { font-size: 11.5px; padding: 5px 7px; }
  .dt-kb-head { padding: 8px 10px; }
  .dt-kb-detail { padding: 8px 10px; }
}
</style>
