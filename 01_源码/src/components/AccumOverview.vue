<script setup>
// v3.8.191 6B·FloatPanel 拆分：顶部「引导 + 今日概览」独立子组件（显式 props/emits，行为与原先一致）
import { toRefs } from 'vue'
const props = defineProps({
  guideShow: Boolean,
  dueCountAll: Number,
  todayReviewed: Object,
  accStats: Object,
  todayGoalPct: Number,
  srsStages: Array,
  srsInt: Array,
  dailyGoal: Number
})
defineEmits(['closeGuide', 'startStudy'])
const { guideShow, dueCountAll, todayReviewed, accStats, todayGoalPct, srsStages, srsInt, dailyGoal } = toRefs(props)
</script>

<template>
      <!-- 从哪开始引导（可收起） -->
      <div v-if="guideShow" class="acc-guide">
        <div class="acc-guide-hd"><b>🧭 怎么用积累页？</b><button class="acc-guide-x" @click="$emit('closeGuide')">✕ 收起</button></div>
        <div class="acc-guide-steps">
          <span class="ags"><b>1</b>选分类</span><i>→</i>
          <span class="ags"><b>2</b>逐条记忆</span><i>→</i>
          <span class="ags"><b>3</b>记住了/没记住</span><i>→</i>
          <span class="ags"><b>4</b>速测检验</span><i>→</i>
          <span class="ags"><b>5</b>到期自动复习</span>
        </div>
        <div class="acc-guide-tip">💡 每看一条点「✅记住了」→ 按艾宾浩斯 1/2/4/7/15/30 天自动排期复习；「❌没记住」明天再复习；「🔁 复习」只抽到期条目。</div>
      </div>
      <!-- 今日概览卡：待复习 / 已学进度 / 艾宾浩斯排队 -->
      <div class="acc-ov">
        <div class="acc-ov-main">
          <button class="acc-ov-big" @click="$emit('startStudy')">
            <span class="aob-n">{{ dueCountAll }}</span>
            <span class="aob-t">今日待复习</span>
            <span class="aob-go">{{ dueCountAll > 0 ? '开始复习 →' : '无到期 · 学新 →' }}</span>
          </button>
          <div class="acc-ov-cols">
            <div class="aoc"><b>{{ todayReviewed.ok }}</b><span>今日记住</span></div>
            <div class="aoc"><b>{{ todayReviewed.total }}</b><span>今日已学</span></div>
            <div class="aoc"><b>{{ accStats.mastered }}</b><span>已掌握</span></div>
          </div>
        </div>
        <div class="acc-ov-bar"><div class="aob-fill" :style="{ width: todayGoalPct + '%' }"></div></div>
        <div class="acc-ov-meta">
          <span>🎯 今日 {{ todayReviewed.total }}/{{ dailyGoal }} 条</span>
          <span class="acc-ov-stages"><template v-for="(n, i) in srsStages" :key="i"><i>{{ srsInt[i] }}d</i><b>{{ n }}</b><em v-if="i < 5"> · </em></template><em class="aos-tip">排队复习</em></span>
        </div>
      </div>
</template>
