<script setup>
import { richMd } from '../utils/wrongText'
// R4：错题模块子组件（从 WrongPage.vue 对应模板逐字搬入）
// 父组件通过 ctx 注入全部依赖；模板保持与 WrongPage 完全一致，仅把状态/方法从 ctx 暴露到本组件作用域。
import { toRefs } from 'vue'

const props = defineProps({ ctx: { type: Object, required: true } })

const {
  focusList,
  focusShow
} = toRefs(props.ctx)

const {
  focusRedo,
  masteryOf,
  wrongSubOf
} = props.ctx
</script>

<template>
  <div v-if="focusShow" class="ov show" @click.self="focusShow = false">
    <div class="pnl">
      <h3>🎯 今日优先复习（到期 / 复错加权 · 最多 8 题）</h3>
      <div v-if="!focusList.length" class="empty-t">暂无错题</div>
      <div v-for="(q, i) in focusList" :key="q.id" class="focus-item">
        <span class="fi-idx">{{ i + 1 }}</span>
        <div class="fi-body">
          <div class="fi-subj">{{ wrongSubOf(q) || '未分类' }} · 错 {{ q.wrongCount || 1 }} 次 · 掌握 {{ masteryOf(q) }}%{{ (q.digested && q.dueAt && q.dueAt <= Date.now()) ? ' · 🔔 到期' : '' }}</div>
          <div class="fi-q" v-html="richMd(String((q || {}).question || ''))"></div>
        </div>
        <button class="btn btn-gh" @click="focusRedo(q)">✍️ 二刷</button>
      </div>
    </div>
  </div>
</template>
