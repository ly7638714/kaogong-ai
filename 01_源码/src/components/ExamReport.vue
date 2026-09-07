<script setup>
// R3-③b：成绩单 / 报告区子组件（从 ExamPanel.vue 的 result 阶段模板逐字搬入）
// 父组件通过 ctx 注入全部依赖；模板保持与 ExamPanel 完全一致，仅把状态/方法从 ctx 暴露到本组件作用域。
import { toRefs, ref } from 'vue'
import { addFlaggedQuestion } from '../utils/flaggedQuestions' // 37号 正确性加固B：疑题反馈
import { showToast } from '../utils/toast'
import { downloadLiveScreenshot, downloadMdScreenshot } from '../utils/capture' // 成绩单截图分享

const props = defineProps({ ctx: { type: Object, required: true } })

// 状态 ref / 计算属性（双向 / 只读）：用 toRefs 暴露为同名变量，模板可原样使用
const {
  curPaper, questions, totalElapsed, marks, reviewOpen, aiLayout, separateAns,
  savedWrongFlash, singleMode, score, rate, moduleStats
} = toRefs(props.ctx)

// 方法 / 常量：直接解构（函数与数组不被 reactive 解包，保持原引用）
const {
  achieveText, renderMd, doExportPaper, backToConfig, nextSingle, replay,
  saveWrongs, backList, fmt, openDesigner
} = props.ctx

const shotBox = ref(null)
const shotIdx = ref(0)
function optLines(qq) {
  const o = qq && qq.options
  if (!o || !o.length) return ''
  return o.map((x) => (typeof x === 'string' ? x : ((x && x.k) ? x.k + '. ' + (x.t != null ? x.t : '') : (x && x.t) || ''))).join('\n')
}
async function shotQuestion() {
  const qs = questions.value
  if (!qs) return showToast('请先选择题号', 'info')
  const qq = qs && qs[shotIdx.value]
  if (!qq) return showToast('请先选择题号', 'info')
  const stem = String(qq.stem || qq.question || qq.q || '').trim()
  const opts = optLines(qq)
  const markList = marks.value
  const m = (markList && markList[shotIdx.value]) || {}
  const parts = []
  parts.push(stem)
  if (opts) parts.push(opts)
  const meta = []
  if (m && (m.pick || m.blank)) meta.push((m.blank ? '**我的作答：**未答' : '**我的作答：**' + m.pick))
  if (qq.answer) meta.push('**正确答案：**' + qq.answer)
  const ana = String(qq.explain || qq.analysis || '')
  if (ana) parts.push(ana)
  const md = parts.join('\n\n') + (meta.length ? '\n\n' + meta.join('\n') : '')
  const no = String(qq.subject || '') ? qq.subject : ''
  const nm = '成绩单第' + (shotIdx.value + 1) + '题_' + new Date().toISOString().slice(0, 10)
  try {
    const paper = curPaper.value
    await downloadMdScreenshot({ title: (paper && paper.name) + ' · 第' + (shotIdx.value + 1) + '题', sub: no, md: md || '（本题内容为空）', name: nm })
  } catch (e) { showToast('截图失败：' + (e && e.message || e), 'error') }
}
async function shotReport() {
  const el = shotBox.value
  if (!el) return showToast('尚未生成成绩单', 'info')
  const paper = curPaper.value
  const nm = (paper && paper.name) || '成绩单'
  try { await downloadLiveScreenshot(el, { title: '📄 ' + nm + ' · 成绩单', name: '成绩单_' + new Date().toISOString().slice(0, 10) }) }
  catch (e) { showToast('截图失败：' + (e && e.message || e), 'error') }
}

// 37号 正确性加固B：成绩单里对某道错题一键上报「疑题」→ 进入 xc_flag_qs，后续组卷自动降低同类考点权重
function flagQ(qq) {
  if (!qq) return
  const r = addFlaggedQuestion({
    plate: qq.subject || '未分类',
    variant: qq.variant || '',
    kpoint: qq.kpoint || '',
    stem: qq.stem || '',
    answer: qq.answer || '',
    note: '用户在成绩单标记：疑似题目有误'
  })
  showToast(r.ok ? '⚠️ 已上报疑题：将降低该考点同类题的出题权重' : '该题此前已上报过', r.ok ? 'warning' : 'info')
}
</script>

<template>
  <!-- ========== 成绩单 ========== -->
  <div class="sim-result">
    <!-- 空卷守护：避免展示 0/0 的臃肿成绩单 -->
    <div v-if="!questions.length" class="sr-empty">
      <h3>📄 成绩单 · {{ curPaper ? curPaper.name : '模拟卷' }}</h3>
      <p style="color: var(--text3)">本卷暂无作答记录（可能出题失败或尚未开始作答），可返回重新出题。</p>
      <div class="pnl-btns">
        <button class="btn btn-gh" @click="backToConfig()">← 返回配置</button>
        <button class="btn btn-pri" title="返回上一界面（卷子/解析已保存，可随时再打开）" @click="backToConfig()">✔ 完成（返回上一界面）</button>
      </div>
    </div>
    <template v-else>
    <div ref="shotBox" class="sr-shot"> <!-- 截图区域：不含导出/操作按钮 -->
      <h3>📄 成绩单 · {{ curPaper ? curPaper.name : '模拟卷' }}</h3>
      <div class="sr-score">{{ score }} / {{ questions.length }}</div>
      <div class="sr-rate">{{ rate }}% · {{ achieveText() }}</div>
      <div class="sr-meta">总用时 {{ fmt(totalElapsed) }} · 平均每题 {{ Math.round(totalElapsed / questions.length) }} 秒</div>
      <div v-if="curPaper && curPaper.qc && (curPaper.qc.retried || curPaper.qc.failed)" class="sr-meta" style="color: var(--text3)">🧾 本卷质检：{{ curPaper.qc.gen }} 题入卷 · 重出 {{ curPaper.qc.retried }} 题（合计生成 {{ curPaper.qc.attempts }} 次）<template v-if="curPaper.qc.failed"> · 未过闸剔除 {{ curPaper.qc.failed }} 题</template></div>
      <div v-if="curPaper && curPaper.mix" class="sr-meta" style="color: var(--text3)">🧮 本卷构成：AI 生成 {{ curPaper.mix.ai }} · 本地确定性 {{ curPaper.mix.local }} · 真题 {{ curPaper.mix.zhenti }}{{ curPaper.mix.anchor ? " · 锚点 " + curPaper.mix.anchor : "" }}{{ curPaper.mix.redo ? " · 错题重做 " + curPaper.mix.redo : "" }}（本地题答案程序可重算，错题不入新出题）</div>
      <div v-if="moduleStats.length" class="ep-mstats">
        <div v-for="ms in moduleStats" :key="ms.subject" class="ep-mstat">
          <span class="ep-ms-name">{{ ms.subject }}</span>
          <span class="ep-ms-bar"><i :style="{ width: (ms.total ? Math.round((ms.ok / ms.total) * 100) : 0) + '%' }"></i></span>
          <span class="ep-ms-num">{{ ms.ok }}/{{ ms.total }}</span>
        </div>
      </div>
      <div class="sr-list">
        <div v-for="(qq, i) in questions" :key="i" class="sr-item" @click="reviewOpen[i] = !reviewOpen[i]">
          <span class="sr-mark" :class="marks[i] && marks[i].ok ? 'ok' : 'no'">{{ marks[i] && marks[i].ok ? '✓' : '✗' }}</span>
          <span class="sr-t">{{ qq.local ? '🎲 ' : qq.anchor ? '📐 ' : qq.zhenti ? '📋 ' : '' }}{{ (qq.subject || '') + ' · ' + (qq.stem || '').slice(0, 46) }}</span>
          <span v-if="marks[i]" class="sr-mine">{{ marks[i].pick ? '我涂 ' + marks[i].pick : (marks[i].blank ? '未答' : '') }} · 答案 {{ qq.answer || '—' }}</span>
          <span class="sr-exp">{{ reviewOpen[i] ? '▾ 收起解析' : '📖 解析' }}</span>
          <button v-if="marks[i] && !marks[i].ok" class="sr-flag" style="margin-left: 6px; border: none; background: none; cursor: pointer; color: #fbbf24; font-size: 13px" title="认为这题有问题？上报后同类考点自动降权，避免再刷到" @click.stop="flagQ(qq)">⚠️ 疑题</button>
        </div>
        <div v-for="(qq, i) in questions" v-show="reviewOpen[i]" :key="'e' + i" class="sr-detail">
          <div class="sr-ex" v-html="renderMd(qq.explain || qq.analysis || '（暂无解析，可点「💬 发到对话」让 AI 讲解）')"></div>
          <div style="margin-top: 4px"><button class="btn btn-gh" style="padding: 1px 8px; font-size: 11px" :disabled="qq.designerLoading" @click.stop="openDesigner(qq)">{{ qq.designerLoading ? '🧠 正在生成命题人设计说明…' : (qq.designer ? '🧠 查看命题人设计说明' : '🧠 生成命题人设计说明（出题意图·考察能力·陷阱）') }}</button><span v-if="qq.designer" style="font-size:10px;color:var(--text3);margin-left:6px">由命题视角生成，非解析复述</span></div>
        </div>
      </div>
    </div>
      <!-- 导出收纳：默认折叠，需要时展开，减少成绩单臃肿感 -->
      <details class="ep-export-details">
        <summary>📤 导出整卷（Word / PDF / Markdown / LaTeX / Typst）{{ aiLayout ? ' · ✨ AI排版开' : '' }}</summary>
        <div class="ep-export-row" style="flex-wrap: wrap">
          <span class="ep-export-l">📷 单题截图：</span>
          <select v-model.number="shotIdx" style="max-width: 180px; padding: 5px 8px; border-radius: 8px; border: 1px solid var(--glass-border); background: var(--surface); color: var(--text); font-size: 12px" title="选择要截图的题号">
            <option v-for="(q, j) in questions" :key="j" :value="j">第 {{ j + 1 }} 题{{ q.subject ? ' · ' + q.subject : '' }}</option>
          </select>
          <button class="btn btn-gh ep-export-b" title="截图当前选中题目：完整题干+选项+作答+解析（与错题本截图一致，整题渲染）" @click="shotQuestion()">📷 截本题（题+解析）</button>
          <button class="btn btn-gh ep-export-b" title="整张成绩单合成长图（较长，适合短卷）" @click="shotReport()">🖼 整卷长图</button>
          <span class="ep-export-l">选项：</span>
          <button class="btn btn-gh ep-export-b" :class="{ on: aiLayout }" :title="aiLayout ? 'AI 排版已开启：先梳理考点/错因/秒杀规律再导出' : 'AI 排版关闭：原样导出'" @click="aiLayout = !aiLayout">✨ {{ aiLayout ? 'AI排版开' : 'AI排版关' }}</button>
          <button class="btn btn-gh ep-export-b" :class="{ on: separateAns }" :title="separateAns ? '题答分离已开启：题目在前，答案解析集中到卷尾（适合打印重做）' : '题答分离关闭：答案解析跟在每题后'" @click="separateAns = !separateAns; if (separateAns && aiLayout) aiLayout = false">🧩 {{ separateAns ? '题答分离开' : '题答分离关' }}</button>
          <span class="ep-export-l">导出：</span>
          <button class="btn btn-gh ep-export-b" @click="doExportPaper('docx')">Word</button>
          <button class="btn btn-gh ep-export-b" @click="doExportPaper('pdf')">PDF</button>
          <button class="btn btn-gh ep-export-b" @click="doExportPaper('md')">Markdown</button>
          <button class="btn btn-gh ep-export-b" @click="doExportPaper('tex')">LaTeX</button>
          <button class="btn btn-gh ep-export-b" @click="doExportPaper('typ')">Typst</button>
        </div>
        <div v-if="aiLayout" class="ep-note" style="text-align: center">✨ AI 排版：先让 AI 梳理每题的考点 / 错因 / 秒杀规律并突出错题，再生成排版文档（需文字模型 Key，耗时约 10-20 秒）</div>
      </details>
      <div class="pnl-btns">
        <button class="btn btn-gh" title="返回出卷配置（卷子已保存在历史卷子）" @click="backToConfig()">← 返回配置</button>
        <button v-if="singleMode" class="btn btn-gh" @click="nextSingle()">🔁 再来一组</button>
        <button v-else class="btn btn-gh" @click="replay()">🔁 再来一卷</button>
        <button class="btn btn-gh" :class="{ 'wq-saved': savedWrongFlash }" @click="saveWrongs()">{{ savedWrongFlash ? '✅ 已入库' : '📌 错题入库' }}</button>
        <button class="btn btn-gh" @click="backList()">🏠 卷子列表</button>
        <button class="btn btn-pri" title="返回上一界面（卷子/解析已保存，可随时再打开）" @click="backToConfig()">✔ 完成（返回上一界面）</button>
      </div>
    </template>
  </div>
</template>
