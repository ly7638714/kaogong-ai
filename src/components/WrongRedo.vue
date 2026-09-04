<script setup>
import { richMd } from '../utils/wrongText'
// R4：错题模块子组件（从 WrongPage.vue 对应模板逐字搬入）
// 父组件通过 ctx 注入全部依赖；模板保持与 WrongPage 完全一致，仅把状态/方法从 ctx 暴露到本组件作用域。
import { toRefs } from 'vue'

const props = defineProps({ ctx: { type: Object, required: true } })

const {
  cur,
  redo,
  redoAnswer,
  redoChoices,
  redoHasChoice,
  redoHistory,
  redoPick,
  redoQ,
  redoResult,
  redoT,
  show
} = toRefs(props.ctx)

const {
  closeRedo,
  fmtT,
  masteryOf,
  redoFeedback,
  store,
  submitByChoice,
  submitRedo
} = props.ctx
</script>

<template>
  <div v-if="redo && cur >= 0 && store.wqs[cur]" class="ov redo-ov show">
    <div class="pnl redo-pnl">
      <h3>✍️ {{ (redoQ.redoHistory || []).length ? '三刷' : '二刷' }}重做 <span class="redo-timer">⏱ {{ fmtT(redoT) }}</span></h3>
      <div class="redo-subj">{{ store.wqs[cur].subject || '未分类' }}</div>
      <div class="redo-q" v-html="richMd(String((store.wqs[cur] || {}).question || ''))"></div>
      <div v-if="(store.wqs[cur].imgs || []).length" class="wq-imgs">
        <img v-for="(im, j) in store.wqs[cur].imgs" :key="j" class="wq-img" :src="im" />
      </div>
      <div v-if="!redoResult" class="redo-ask">
        <div class="redo-hint">{{ redoHasChoice ? '直接点击选项提交作答' : '先不看答案自己再解一遍（计时中）' }}</div>
        <div v-if="redoHasChoice" class="quiz-opts">
          <button
            v-for="o in redoChoices"
            :key="o.k"
            class="quiz-opt"
            :class="{ picked: redoPick === o.k, right: redoPick === o.k && o.k === redoAnswer, wrong: redoPick === o.k && o.k !== redoAnswer }"
            @click="submitByChoice(o.k)"
          >
            <span class="qk">{{ o.k }}</span><span class="qt" v-html="richMd(String(o.t || ''))"></span>
          </button>
        </div>
        <div v-else class="redo-btns">
          <button class="btn btn-pri" @click="submitRedo(true)">✅ 我答对了</button>
          <button class="btn btn-gh" @click="submitRedo(false)">❌ 还是错了</button>
        </div>
      </div>
      <div v-else class="redo-result" :class="redoResult">
        <div class="rr-t">{{ redoResult === 'ok' ? '🎉 这次答对了！' : '😥 这次答错了' }}</div>
        <div v-if="redoHasChoice" class="rr-line">
          你选了 {{ redoPick }} · 正确答案 {{ redoAnswer }}
          <span class="rr-badge" :class="redoResult">{{ redoResult === 'ok' ? '✓ 正确' : '✗ 错误' }}</span>
        </div>
        <div v-if="redoFeedback(store.wqs[cur])" class="rr-fb" :class="redoResult">{{ redoFeedback(store.wqs[cur]) }}</div>
        <div class="rr-line">正确答案：{{ store.wqs[cur].answer || '（未填）' }}</div>
        <div v-if="store.wqs[cur].method" class="rr-line">⚡ 秒杀：{{ store.wqs[cur].method }}</div>
        <div class="rr-line">当前掌握 {{ masteryOf(store.wqs[cur]) }}% · 连续答对 {{ store.wqs[cur].correctStreak || 0 }} 次 · 累计错 {{ store.wqs[cur].wrongCount || 1 }} 次</div>
        <div v-if="redoHistory.length" class="rr-hist">
          历次二刷：
          <span v-for="(h, i) in redoHistory" :key="i" class="rr-h" :class="h.ok ? 'ok' : 'no'">{{ h.ok ? '✓' : '✗' }}</span>
          （{{ redoHistory.filter((h) => h.ok).length }} 对 {{ redoHistory.filter((h) => !h.ok).length }} 错）
        </div>
        <div v-if="store.wqs[cur].digested" class="rr-dig">✅ 已连续答对 2 次，标记为「已消化」</div>
      </div>
      <div class="pnl-btns">
        <button class="btn btn-gh" @click="closeRedo()">关闭</button>
        <button v-if="redoResult" class="btn btn-gh" @click="show = true; closeRedo()">📝 去复盘</button>
      </div>
    </div>
  </div>
</template>
