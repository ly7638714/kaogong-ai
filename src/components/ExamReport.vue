<script setup>
// R3-③b：成绩单 / 报告区子组件（从 ExamPanel.vue 的 result 阶段模板逐字搬入）
// 父组件通过 ctx 注入全部依赖；模板保持与 ExamPanel 完全一致，仅把状态/方法从 ctx 暴露到本组件作用域。
import { toRefs } from 'vue'
import { addFlaggedQuestion } from '../utils/flaggedQuestions' // 37号 正确性加固B：疑题反馈
import { showToast } from '../utils/toast'

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
      <!-- 导出收纳：默认折叠，需要时展开，减少成绩单臃肿感 -->
      <details class="ep-export-details">
        <summary>📤 导出整卷（Word / PDF / Markdown / LaTeX / Typst）{{ aiLayout ? ' · ✨ AI排版开' : '' }}</summary>
        <div class="ep-export-row">
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