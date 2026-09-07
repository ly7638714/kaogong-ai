<script setup>
// R3-③c：作答区子组件（从 ExamPanel.vue 的 doing 阶段模板逐字搬入）
// 父组件通过 ctx 注入全部依赖；模板保持与 ExamPanel 完全一致，仅把状态/方法从 ctx 暴露到本组件作用域。
import { toRefs } from 'vue'
import { downloadMdScreenshot } from '../utils/capture'

const props = defineProps({ ctx: { type: Object, required: true } })

// 状态 ref / 计算属性（双向 / 只读）
const {
  cur, questions, qLeft, qElapsed, marks, modLeft, modTotal, modDone,
  totalLeft, totalElapsed, singlePlate, paperMode, sheetMode, sheetShow,
  answeredCount, genStatus, prefetchQ, savedWrongFlash, singleMode,
  q, qHtml, optHtmls, hasSvgOpts, qExplainHtml
} = toRefs(props.ctx)

// 方法
const {
  go, retryGen, pick, selfMark, enhanceExplain, openDesigner,
  backToConfig, cancel, saveWrongs, finish, nextSingle, askFinish, prevQ, nextQ,
  fmt, savePaperMode
} = props.ctx

// 做题界面：当前题完整题目 / 完整解析 截图导出
function capExamQuestion() {
  const qq = q.value
  if (!qq) return
  const stem = String(qq.stem || '')
  const opts = (qq.options || []).map((o) => o.k + '. ' + o.t).join('\n\n')
  downloadMdScreenshot({
    title: '行测 · ' + (qq.subject || '做题') + ' · 题目',
    sub: (singlePlate.value || '') + ' · 第 ' + (cur.value + 1) + '/' + questions.value.length + ' 题',
    md: stem + (opts ? '\n\n' + opts : ''),
    name: '题目_' + (cur.value + 1)
  })
}
function capExamExplain() {
  const qq = q.value
  if (!qq) return
  const m = marks.value[cur.value] || {}
  const ana = qq.analysis || qq.explain || ''
  const parts = []
  if (m.pick) parts.push('**我的答案：**' + m.pick)
  if (qq.answer) parts.push('**正确答案：**' + qq.answer + (m.ok !== undefined ? (m.ok ? '（✅ 正确）' : '（❌ 错误）') : ''))
  if (ana) parts.push(ana)
  downloadMdScreenshot({
    title: '行测 · ' + (qq.subject || '做题') + ' · 解析',
    sub: '第 ' + (cur.value + 1) + '/' + questions.value.length + ' 题',
    md: parts.join('\n\n') || '（本题暂无解析）',
    name: '解析_' + (cur.value + 1)
  })
}
</script>

<template>
  <!-- ========== 作答 ========== -->
  <div class="sim-doing" :class="{ paper: paperMode, imm: singleMode }">
    <div class="pp-timer-bar">
      <span class="sim-plate">📐 {{ q.subject }}<template v-if="q.type && q.type !== '综合'"> · 🧩 {{ q.type }}</template><template v-if="q.variant"> · {{ q.variant === '一拖五' ? '一拖N 分析推理' : q.variant }}</template>
        <button class="db-b cap-btn" title="导出本题完整题目截图" @click="capExamQuestion()">📸 题目</button>
        <button class="db-b cap-btn" title="导出本题解析截图" @click="capExamExplain()">📸 解析</button>
      </span>
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
        <button v-if="sheetMode" class="btn btn-gh" :class="{ on: sheetShow }" title="仿真考试答题卡：填涂姓名/考场/准考证号，2B铅笔逐题填涂，交卷后统一查看答案" @click="sheetShow = !sheetShow">📋 仿真答题卡</button>
        <span class="ep-hint" style="font-size: 11px">已答 {{ answeredCount }} / {{ questions.length }} · ✏️ 随手记点悬浮球写笔记</span>
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
          :class="{ picked: marks[cur] && marks[cur].pick === o.k, right: marks[cur] && marks[cur].ok !== undefined && o.k === q.answer, wrong: marks[cur] && marks[cur].ok !== undefined && marks[cur].pick === o.k && o.k !== q.answer }"
          :disabled="!sheetMode && marks[cur] != null"
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
      <div v-if="marks[cur] && marks[cur].ok === undefined" class="quiz-result pending">✏️ 已填涂 {{ marks[cur].pick }}（可在 📋 答题卡改涂），交卷后统一查看答案与解析</div>
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
          <button class="btn btn-pri" :disabled="!marks[cur]" @click="finish()">📋 交卷看答案</button>
          <button class="btn btn-gh btn-next" @click="nextSingle()">🔁 再来一题 ▶</button>
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
</template>
