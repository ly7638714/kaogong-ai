<script setup>
import { richMd } from '../utils/wrongText'
// R4：错题模块子组件（从 WrongPage.vue 对应模板逐字搬入）
// 父组件通过 ctx 注入全部依赖；模板保持与 WrongPage 完全一致，仅把状态/方法从 ctx 暴露到本组件作用域。
import { toRefs } from 'vue'

const props = defineProps({ ctx: { type: Object, required: true } })

const {
  cardFlip,
  cardIdx,
  cardQueue,
  cardShow
} = toRefs(props.ctx)

const {
  cardMark
} = props.ctx
</script>

<template>
  <div v-if="cardShow" class="ov show" @click.self="cardShow = false">
    <div class="pnl card-pnl">
      <h3>🎴 错题抽认卡 <span class="card-prog">{{ cardIdx + 1 }} / {{ cardQueue.length }}</span></h3>
      <template v-if="cardQueue[cardIdx]">
        <div class="card-front">
          <div class="redo-subj">{{ cardQueue[cardIdx].subject || '未分类' }}</div>
          <div class="redo-q" v-html="richMd(String((cardQueue[cardIdx] || {}).question || ''))"></div>
          <div v-if="(cardQueue[cardIdx].imgs || []).length" class="wq-imgs">
            <img v-for="(im, j) in cardQueue[cardIdx].imgs" :key="j" class="wq-img" :src="im" />
          </div>
        </div>
        <div v-if="cardFlip" class="card-back">
          <div class="rr-line">✅ 答案：{{ cardQueue[cardIdx].answer || '未填' }}</div>
          <div v-if="cardQueue[cardIdx].method" class="rr-line">⚡ 秒杀：{{ cardQueue[cardIdx].method }}</div>
          <div v-if="(cardQueue[cardIdx].reasons || []).length" class="rr-line">🔍 错因：{{ cardQueue[cardIdx].reasons.join('、') }}</div>
          <div v-if="cardQueue[cardIdx].note" class="rr-line">📝 笔记：{{ cardQueue[cardIdx].note }}</div>
        </div>
      </template>
      <div class="pnl-btns">
        <button class="btn btn-gh" @click="cardShow = false">关闭</button>
        <button v-if="!cardFlip" class="btn btn-pri" @click="cardFlip = true">👁 翻答案</button>
        <template v-if="cardFlip">
          <button class="btn btn-gh" @click="cardMark(false)">❌ 没记住</button>
          <button class="btn btn-pri" @click="cardMark(true)">✅ 记住了</button>
        </template>
      </div>
    </div>
  </div>
</template>
