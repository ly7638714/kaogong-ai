<script setup>
// R4：错题模块子组件（从 WrongPage.vue 对应模板逐字搬入）
// 父组件通过 ctx 注入全部依赖；模板保持与 WrongPage 完全一致，仅把状态/方法从 ctx 暴露到本组件作用域。
import { toRefs, computed } from 'vue'
import { SUB_DICT } from '../utils/askAssist'

const props = defineProps({ ctx: { type: Object, required: true } })

const {
  cur,
  fReason,
  fRev,
  fSub,
  fSubj,
  jumpN,
  kw,
  pageN,
  reasonList,
  shown,
  shownTotal,
  sortBy,
  stats,
  subjList
} = toRefs(props.ctx)
// 当前板块下的题型选项（供题型筛选下拉）
const subOpts = computed(() => {
  if (!fSubj.value) return []
  const m = SUB_DICT[fSubj.value] || {}
  return Object.keys(m)
})

const {
  PAGE,
  dedupeNow,
  jumpTo,
  loadMore,
  masteryOf,
  openCards,
  openIdx,
  openRedo,
  resetFilters,
  store,
  todayFocus
} = props.ctx
</script>

<template>
      <!-- 统计条 -->
      <div class="wq-stats">
        <div class="ws2">
          <span class="ws2-n">{{ stats.t }}</span>
          <span class="ws2-l">共错题</span>
        </div>
        <div class="ws2">
          <span class="ws2-n g">{{ stats.rev }}</span>
          <span class="ws2-l">已复盘</span>
        </div>
        <div class="ws2">
          <span class="ws2-n a">{{ stats.pend }}</span>
          <span class="ws2-l">待复盘</span>
        </div>
      </div>
      <!-- 筛选 + 快速定位 -->
      <div id="wqFilters" class="wq-filters">
        <input v-model="kw" class="wq-search" placeholder="🔍 搜题干 / 选项 / 答案 / 错因 / 秒杀 / 笔记…" />
        <select v-model="fSubj">
          <option value="">全部板块</option>
          <option v-for="s in subjList" :key="s" :value="s">{{ s }}</option>
        </select>
        <select v-model="fSub" :disabled="!fSubj" title="先选板块再筛题型">
          <option value="">全部题型</option>
          <option v-for="s in subOpts" :key="s" :value="s">{{ s }}</option>
        </select>
        <select v-model="fRev">
          <option value="all">全部状态</option>
          <option value="rev">✅ 已复盘</option>
          <option value="pend">⏳ 待复盘</option>
        </select>
        <select v-model="fReason">
          <option value="">全部错因</option>
          <option v-for="r in reasonList" :key="r" :value="r">{{ r }}</option>
        </select>
        <select v-model="sortBy">
          <option value="time">⏱ 最新优先</option>
          <option value="wrong">💢 错得多优先</option>
          <option value="mastery">🎯 掌握低优先</option>
        </select>
        <span class="wq-count">筛选后 <b>{{ shownTotal }}</b> / {{ stats.t }} 题</span>
        <div class="wq-jump">
          <input v-model="jumpN" inputmode="numeric" placeholder="跳转序号" />
          <button class="btn btn-gh" style="padding: 6px 10px" @click="jumpTo()">跳转</button>
        </div>
        <button class="btn btn-gh" style="padding: 6px 12px" @click="resetFilters()">重置</button>
        <button class="btn btn-pri" style="padding: 6px 12px" @click="todayFocus()">🎯 今日优先 5 题</button>
        <button class="btn btn-gh" style="padding: 6px 12px" @click="openCards()">🎴 抽认卡</button>
        <button class="btn btn-gh" style="padding: 6px 12px" title="把题干完全相同的错题合并为一道，只保留 1 条" @click="dedupeNow()">🧹 一键去重</button>
      </div>
      <div class="wl">
        <div v-if="!store.wqs.length" class="empty">
          <div class="empty-i">📋</div>
          <div class="empty-t">暂无错题记录</div>
          <div class="empty-d">做题时点 AI 回复下的「📌 存错题」即可收纳</div>
        </div>
        <div v-else-if="!shown.length" class="empty">
          <div class="empty-i">🔍</div>
          <div class="empty-t">没有符合筛选的错题</div>
          <div class="empty-d">试试调整筛选条件</div>
        </div>
        <div v-for="(q, i) in shown" :key="q.id" class="wi" @click="openIdx(i)">
          <span class="wi-no">{{ (pageN - 1) * PAGE + i + 1 }}</span>
          <div class="wi-top">
            <span class="ws">{{ q.subject || '未分类' }}</span>
            <span class="rv" :class="{ ok: q.reviewed }">{{ q.reviewed ? '✅ 已复盘' : '⏳ 待复盘' }}</span>
            <span class="ms" :class="{ dig: q.digested }">{{ q.digested ? '✅ 已消化' : '掌握 ' + masteryOf(q) + '%' }}</span>
          </div>
          <div v-if="(q.imgs || []).length" class="wq-thumb">
            <img :src="q.imgs[0]" alt="原题截图" />
          </div>
          <div class="wq">{{ q.question }}</div>
          <div v-if="q.reasons && q.reasons.length" class="wr">
            <span v-for="r in q.reasons" :key="r">{{ r }}</span>
          </div>
          <div class="wt">
            {{ q.time }} · {{ q.answer ? '答案 ' + q.answer : '未填答案' }}
            <span v-if="q.method" class="wtm">⚡ {{ q.method }}</span>
            <span v-if="q.wrongCount && q.wrongCount > 1" class="wtm">错 {{ q.wrongCount }} 次</span>
            <button class="redo-mini" @click.stop="cur = store.wqs.indexOf(q); openRedo()">✍️ 二刷</button>
          </div>
        </div>
        <div v-if="shownTotal > shown.length" class="wq-more">
          <button class="btn btn-gh" @click="loadMore()">加载更多（已显示 {{ shown.length }} / {{ shownTotal }}）</button>
        </div>
      </div>
</template>
