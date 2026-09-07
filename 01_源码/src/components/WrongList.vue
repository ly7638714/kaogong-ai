<script setup>
// R4：错题模块子组件（从 WrongPage.vue 对应模板逐字搬入）
// 父组件通过 ctx 注入全部依赖；模板保持与 WrongPage 完全一致，仅把状态/方法从 ctx 暴露到本组件作用域。
import { toRefs, computed, watch, ref } from 'vue'
import { WRONG_GROUPS as TAX, canonicalSubOf, canonicalGroupOf, typeLabelOf, isRealSub, typeOrderOfSub, CANON_TYPE_ORDER, groupLabelOf } from '../utils/wrongTaxonomy' // v3.8.207 板块→细分→题型归一
import { richMd } from '../utils/wrongText' // 错题渲染净化（字面换行/空svg围栏修复后再渲染）
import { reviewHealth } from '../utils/reviewHealth' // 复盘健康分（深化）
const dueOf = (q) => !!(q && q.digested && q.dueAt && q.dueAt <= Date.now())
const repOf = (q) => { const rs = (q && q.reviewStats) || {}; return { r: rs.r || 0, e: rs.e || 0 } }

const props = defineProps({ ctx: { type: Object, required: true } })

const {
  cur,
  fReason,
  fRev,
  fState,
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
  reasonTop
} = toRefs(props.ctx)
// ===== 板块→细分→题型（v3.8.207 归一：与 AI出题/题型库同一套 canonical）=====
const allWqs = () => (props.ctx.store && props.ctx.store.wqs) || []
// 细分下拉：只列“真细分”（图推/定义/类比/逻辑/片段/篇章/数量/资料/常识/政治），组名不再混入
const groupSubs = computed(() => {
  const list = []
  const push = (n) => { if (n && !list.includes(n)) list.push(n) }
  const present = new Set()
  allWqs().forEach((q) => { if (q) { const sub = canonicalSubOf(q); if (sub && isRealSub(sub)) present.add(sub) } })
  const g = fGroup.value ? TAX.find((x) => x.label === fGroup.value) : null
  if (g) (g.subs || []).forEach(push)
  else TAX.forEach((xg) => (xg.subs || []).forEach(push))
  const extras = [...present].filter((s) => !list.includes(s))
  return list.filter((s) => present.has(s)).concat(extras)
})
// 题型下拉：选了细分 → 该细分 canonical 题型池；只选组/全选 → 组内或全部真实题型（按 canonical 顺序，不跨板块混排）
const subOpts = computed(() => {
  if (fSubj.value) {
    const pool = typeOrderOfSub(fSubj.value)
    const hasUnc = allWqs().some((q) => q && canonicalSubOf(q) === fSubj.value && typeLabelOf(q) === '未分类')
    return (pool && pool.length ? pool.slice() : []).concat(hasUnc ? ['未分类'] : [])
  }
  const seen = new Set()
  allWqs().forEach((q) => {
    if (!q) return
    if (fGroup.value && canonicalGroupOf(q) !== fGroup.value) return
    const t = typeLabelOf(q)
    if (t) seen.add(t)
  })
  const rank = (t) => { const i = CANON_TYPE_ORDER.indexOf(t); return i < 0 ? 99999 : i }
  const arr = [...seen].filter((t) => t !== '未分类').sort((a, b) => rank(a) - rank(b))
  if (seen.has('未分类')) arr.push('未分类')
  return arr
})
// 细分被选中时自动反同步大板块（保证与下拉/筛选一致）
watch(fSubj, (v) => {
  if (!v) return
  const g = TAX.find((x) => x.label === v || (x.subs || []).includes(v))
  if (g && fGroup.value !== g.label) fGroup.value = g.label
})

const {
  PAGE,
  fGroup, WRONG_GROUPS,
  dedupeNow,
  jumpTo,
  loadMore,
  masteryOf,
  openCards,
  openIdx,
  openRedo,
  resetFilters,
  store,
  todayFocus,
  openHub,
  setReasonFilter,
  openBatchReview,
  openRecall,
  startReasonPractice,
  wrongSubOf
} = props.ctx
// 复盘健康分（本地轻量计算，无副作用）
const health = computed(() => {
  try {
    const h = reviewHealth((store && store.wqs) || [])
    return h && h.t ? h : null
  } catch (e) { return null }
})
// 到期优先提示条（艾宾浩斯 3→7→15→30 天）：当天只提醒一次，可手动关闭到明天
const dueTipOff = ref((function () {
  try { return localStorage.getItem('xc_wq_due_tip') === new Date().toDateString() } catch (e) { return false }
})())
function dueTipLater() {
  dueTipOff.value = true
  try { localStorage.setItem('xc_wq_due_tip', new Date().toDateString()) } catch (e) {}
}
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
        <div class="ws2">
          <span class="ws2-n r">{{ stats.due }}</span>
          <span class="ws2-l">🔔 到期</span>
        </div>
      </div>
      <div v-if="stats.rep && stats.rep.r > 0" class="wq-rep">📉 复习后再做 {{ stats.rep.e }}/{{ stats.rep.r }} 次 · 复错率 {{ Math.round((stats.rep.e / stats.rep.r) * 100) }}% —— 复错 = 还没吃透，优先二刷 / 连做</div>
      <div v-if="health" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:6px 0;font-size:12px;color:var(--text2);border:1px solid rgba(127,127,127,.18);border-radius:8px;padding:5px 8px">
        <span>💗 复盘健康 <b :style="{ color: health.score >= 85 ? '#34d399' : health.score >= 60 ? '#fbbf24' : '#fb7185' }">{{ health.score }}</b> 分 · {{ health.grade }}</span>
        <template v-if="health.tips.length"><span style="color:var(--text3)">{{ health.tips[0] }}</span></template>
      </div>
      <div v-if="stats.due > 0 && !dueTipOff" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0;padding:8px 10px;border-radius:10px;background:rgba(251,113,133,.12);border:1px solid rgba(251,113,133,.4);font-size:12.5px">
        <span>🔔 有 <b style="color:#fb7185">{{ stats.due }}</b> 道错题已「到期」——按记忆曲线（消化后 3→7→15→30 天）该回访了，<b>先复习它们最划算</b>（到期若答错会退回待消化）</span>
        <button class="btn btn-pri" style="padding:3px 12px;font-size:12px" @click="openHub()">🗓️ 立即复习（今日复习中枢）</button>
        <button class="btn btn-gh" style="padding:3px 10px;font-size:12px" title="今天不再提醒，明天会自动出现" @click="dueTipLater()">✕ 今天先不提醒</button>
      </div>
      <!-- 筛选 + 快速定位 -->
      <div id="wqFilters" class="wq-filters">
        <input v-model="kw" class="wq-search" placeholder="🔍 搜题干 / 选项 / 答案 / 错因 / 秒杀 / 笔记…" />
<select v-model="fGroup" title="先选六大板块">
          <option value="">全部板块（六大板块）</option>
          <option v-for="g in WRONG_GROUPS" :key="g.label" :value="g.label">{{ groupLabelOf(g.label) }}</option>
          <option v-if="fGroup && !WRONG_GROUPS.some((g) => g.label === fGroup)" :value="fGroup">◉ {{ groupLabelOf(fGroup) || fGroup }}</option>
        </select>
        <select v-model="fSubj" title="细分板块：不选板块时可跨板块直选细分（选后自动归位所属大板块）">
          <option value="">全部细分板块（不选板块=跨全部板块筛细分）</option>
          <option v-for="s in groupSubs" :key="s" :value="s">{{ s }}</option>
          <option v-if="fSubj && !groupSubs.includes(fSubj)" :value="fSubj">⏺ {{ fSubj }}</option>
        </select>
        <select v-model="fSub" title="题型：选了细分板块则列该板块题型；否则跨板块按题型筛">
          <option value="">全部题型</option>
          <option v-for="s in subOpts" :key="s" :value="s">{{ s }}</option>
          <option v-if="fSub && !subOpts.includes(fSub)" :value="fSub">⏺ {{ fSub }}</option>
        </select>
        <select v-model="fRev">
          <option value="all">全部状态</option>
          <option value="rev">✅ 已复盘</option>
          <option value="pend">⏳ 待复盘</option>
        </select>
        <select v-model="fState" title="状态维度：默认全可见，可按 待消化/到期/已消化 切换">
          <option value="all">全部状态</option>
          <option value="undig">⏳ 待消化</option>
          <option value="due">🔔 到期复习</option>
          <option value="dig">✅ 已消化</option>
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
        <button class="btn btn-gh" style="padding: 6px 12px" @click="openHub()">🗓️ 今日复习中枢</button>
        <button class="btn btn-pri" style="padding: 6px 12px" @click="todayFocus()">🎯 今日优先</button>
        <button class="btn btn-gh" style="padding: 6px 12px" @click="openCards()">🎴 抽认卡</button>
        <button class="btn btn-gh" style="padding: 6px 12px" title="对当前筛选错题逐题 AI 生成 错因/一句话修正/今日动作" @click="openBatchReview()">🤖 AI 批量复盘</button>
        <button class="btn btn-gh" style="padding: 6px 12px" title="把题干完全相同的错题合并为一道，只保留 1 条" @click="dedupeNow()">🧹 一键去重</button>
      </div>
      <div v-if="reasonTop && reasonTop.length" class="wq-reasons">
        <span class="wq-reasons-hd">⚠️ 高频错因 · 点筛选 · ✍️连做同类</span>
        <span v-for="r in reasonTop" :key="r.reason" class="chip" :class="{ on: fReason === r.reason }" :title="'涉及：' + (r.plates || []).join(' / ')" @click="setReasonFilter(r.reason === fReason ? '' : r.reason)">
          {{ r.reason }}<b class="rr-n">×{{ r.n }}</b><i v-if="r.e" class="rr-e">复错{{ r.e }}</i><em class="rr-go" @click.stop="startReasonPractice(r.reason)">✍️</em>
        </span>
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
            <span class="ws">{{ wrongSubOf(q) || '未分类' }}</span>
            <span class="rv" :class="{ ok: q.reviewed }">{{ q.reviewed ? '✅ 已复盘' : '⏳ 待复盘' }}</span>
            <span class="ms" :class="{ dig: q.digested }">{{ q.digested ? (dueOf(q) ? '🔔 到期' : '✅ 已消化') : '掌握 ' + masteryOf(q) + '%' }}</span>
            <span v-if="repOf(q).r" class="rw" :class="{ bad: repOf(q).e > 0 }">{{ repOf(q).e ? '复错 ' + repOf(q).e + '/' + repOf(q).r : '复做 ' + repOf(q).r }}</span>
          </div>
          <div v-if="(q.imgs || []).length" class="wq-thumb">
            <img :src="q.imgs[0]" alt="原题截图" />
          </div>
          <div class="wq" v-html="richMd(String(q.question || ''))"></div>
          <div v-if="q.reasons && q.reasons.length" class="wr">
            <span v-for="r in q.reasons" :key="r">{{ r }}</span>
          </div>
          <div class="wt">
            {{ q.time }} · {{ q.answer ? '答案 ' + q.answer : '未填答案' }}
            <span v-if="q.method" class="wtm">⚡ {{ q.method }}</span>
            <span v-if="q.wrongCount && q.wrongCount > 1" class="wtm">错 {{ q.wrongCount }} 次</span>
            <button class="redo-mini" @click.stop="cur = store.wqs.indexOf(q); openRedo()">✍️ 二刷</button>
            <button class="redo-mini" title="主动回忆复盘：先默写考点/思路，再展开解析自评" @click.stop="openRecall(q)">🧠 回忆</button>
          </div>
        </div>
        <div v-if="shownTotal > shown.length" class="wq-more">
          <button class="btn btn-gh" @click="loadMore()">加载更多（已显示 {{ shown.length }} / {{ shownTotal }}）</button>
        </div>
      </div>
</template>
