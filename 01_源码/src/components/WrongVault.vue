<script setup>
// R4：错题模块子组件（从 WrongPage.vue 对应模板逐字搬入）
// 父组件通过 ctx 注入全部依赖；模板保持与 WrongPage 完全一致，仅把状态/方法从 ctx 暴露到本组件作用域。
import { toRefs } from 'vue'

const props = defineProps({ ctx: { type: Object, required: true } })

const {
  qcPapers,
  qcQuiz,
  vaultOpen
} = toRefs(props.ctx)

const {
  delVaultPaper,
  delVaultQuiz,
  exportPaperMd,
  exportQuizMd,
  redoPaper,
  redoQuizCol
} = props.ctx
</script>

<template>
      <!-- 卷库：全部历史卷子 + 出题集（查看/重做/导出/删除） -->
      <div class="ep-block vault">
        <div class="ep-block-hd ep-fold-hd" @click="vaultOpen = !vaultOpen">
          <span>📚 卷库（历史卷子 {{ qcPapers.length }} · 出题集 {{ qcQuiz.length }}）</span><span class="ep-fold-ic">{{ vaultOpen ? '▾ 收起' : '▸ 展开' }}</span>
        </div>
        <div v-if="vaultOpen">
          <div class="vault-sec">🗂️ 历史卷子（全部保留 · 可查看/重做/导出）</div>
          <div v-if="!qcPapers.length" class="empty"><div class="empty-i">🗂️</div><div class="empty-t">暂无卷子</div><div class="empty-d">在「模拟组卷」出的卷子会自动存入这里</div></div>
          <div v-else class="ep-list-scroll">
            <div v-for="(p, i) in qcPapers" :key="p.id" class="ep-paper">
              <button class="ep-paper-btn" :title="p.name + ' · ' + (p.questions||[]).length + ' 题'" @click="redoPaper(p)">{{ p.name }} · {{ (p.questions||[]).length }} 题 · {{ new Date(p.ts).toLocaleString() }}</button>
              <button class="btn btn-gh" style="padding: 2px 8px; font-size: 11px" @click="exportPaperMd(p)">⬇ 导出</button>
              <button class="ep-x" @click="delVaultPaper(i)">×</button>
            </div>
          </div>
          <div class="vault-sec">📚 出题集（全部保留 · 可二刷/导出）</div>
          <div v-if="!qcQuiz.length" class="empty"><div class="empty-i">📚</div><div class="empty-t">暂无出题</div><div class="empty-d">「单题快练」出的题会自动收纳到这里</div></div>
          <div v-else class="ep-list-scroll">
            <div v-for="(c, i) in qcQuiz" :key="c.id" class="ep-paper">
              <span class="qc-status" :class="c.lastOk === true ? 'ok' : c.lastOk === false ? 'no' : ''">{{ c.lastOk === true ? '✓' : c.lastOk === false ? '✗' : '•' }}</span>
              <button class="ep-paper-btn" :title="'【' + c.subject + (c.variant ? '·' + c.variant : '') + '】' + c.stem.slice(0, 80)" @click="redoQuizCol(c)">{{ c.subject }}{{ c.variant ? '·' + c.variant : '' }} · {{ c.stem.slice(0, 24) }}…（错{{ c.wrongCount }}）</button>
              <button class="ep-x" @click="delVaultQuiz(i)">×</button>
            </div>
          </div>
          <button class="btn btn-gh" style="margin-top: 8px" @click="exportQuizMd()">⬇ 导出全部出题集（Markdown）</button>
        </div>
      </div>
</template>
