<script setup>
// 错题集·题型强弱分布（Request D Part 1）
// 把错题按板块进一步细分到题型（论证推理的加强/削弱/前提…），并用颜色+长度做强弱力度可视化，
// 红色=薄弱（该题型错题多）、绿色=较稳；点题型即筛选下方错题列表，再点一次取消。
import { computed, toRefs } from 'vue'
import { groupLabelOf } from '../data/groupNames' // 大板块全称

const props = defineProps({ ctx: { type: Object, required: true } })
const { fSubj, fSub } = toRefs(props.ctx)
// typeStats 由父组件 WrongPage 计算后通过 ctx 注入：{ plates:[{plate,total,subs:[{name,count,pct,t}]}], topWeak, maxCount }
const d = computed(() => props.ctx.typeStats || { plates: [], topWeak: [], maxCount: 1 })

// 强弱力度配色：n=该题型错题数。越多越红（越薄弱）
function strengthColor(n) {
  if (n >= 5) return '#e23b3b' // 红：很薄弱
  if (n >= 3) return '#f0883e' // 橙：较弱
  if (n >= 2) return '#e6b800' // 黄：一般
  return '#3aa657'              // 绿：相对稳
}
function barWidth(count) {
  const max = d.value.maxCount || 1
  return Math.max(12, Math.round((count / max) * 100)) + '%'
}
// v3.8.207：行=「细分·题型」，组为六大板块；判断推理/言语理解 组内行带细分前缀（如 逻辑判断·削弱型）
const SPLIT_GROUPS = ['判断推理', '言语理解']
function rowLabel(plate, s) {
  const sub = (s && s.sub) || ''
  const type = (s && s.type) || (s && s.name) || ''
  if (sub && sub !== plate && SPLIT_GROUPS.includes(plate)) return sub + '·' + type
  return type
}
function chipLabel(x) {
  // 判断推理/言语理解 组内行自带细分前缀，不再重复组名；其余组用全称前缀
  if (SPLIT_GROUPS.includes(x.group)) return rowLabel(x.group, x)
  return (groupLabelOf(x.group) || x.group) + '·' + (x.name || '')
}
function isActive(s) {
  return !!s && fSubj.value === s.sub && fSub.value === (s.type || s.name)
}
function pick(plate, s) {
  if (isActive(s)) props.ctx.clearTypeFilter()
  else props.ctx.setTypeFilter(plate, (s && s.sub) || '', (s && (s.type || s.name)) || '')
}
</script>

<template>
  <div class="wts">
    <div class="wts-head">
      <span class="wts-title">📊 题型强弱分布</span>
      <span class="wts-sub">按板块细分到题型 · 红=薄弱(错题多) 绿=较稳 · 点题型可筛选错题</span>
    </div>

    <!-- 全局最薄弱题型 TOP5：跨板块一眼定位重灾区 -->
    <div v-if="d.topWeak.length" class="wts-top">
      <span class="wts-top-l">⚠️ 最薄弱题型 TOP</span>
      <span
        v-for="(x, i) in d.topWeak"
        :key="x.group + '|' + x.sub + '|' + x.name"
        class="wts-top-chip"
        :class="{ on: isActive(x) }"
        :title="`${groupLabelOf(x.group) || x.group} · ${x.sub || ''} · ${x.name}`"
        :style="{ background: strengthColor(x.count) + '1f', borderColor: strengthColor(x.count) }"
        @click="pick(x.group, x)"
      >{{ i + 1 }}. {{ chipLabel(x) }} <b>{{ x.count }}</b></span>
    </div>

    <div v-if="!d.plates.length" class="wts-empty">暂无错题数据，先去刷题并把错题「📌 存错题」吧～</div>

    <div v-for="p in d.plates" :key="p.plate" class="wts-plate">
      <div class="wts-plate-h">
        <span class="wts-plate-n">{{ groupLabelOf(p.plate) }}</span>
        <span class="wts-plate-t">{{ p.total }} 题</span>
      </div>
      <div
        v-for="s in p.subs"
        :key="s.sub + '|' + s.type"
        class="wts-row"
        :class="{ on: isActive(s) }"
        :title="`${groupLabelOf(p.plate) || p.plate} · ${rowLabel(p.plate, s)}：共 ${s.count} 道错题（占本板块 ${s.pct}%）`"
        @click="pick(p.plate, s)"
      >
        <span class="wts-name" style="flex-basis:auto;min-width:96px;text-align:left">{{ rowLabel(p.plate, s) }}</span>
        <span class="wts-bar-wrap">
          <span class="wts-bar" :style="{ width: barWidth(s.count), background: strengthColor(s.count) }"></span>
        </span>
        <span class="wts-cnt">{{ s.count }}<i>·{{ s.pct }}%</i></span>
      </div>
    </div>

    <div v-if="fSubj || fSub" class="wts-active">
      已筛选：<b>{{ fSubj }}</b> / <b>{{ fSub }}</b>
      <button class="wts-clear" @click="props.ctx.clearTypeFilter()">✕ 清除</button>
    </div>
  </div>
</template>

<style scoped>
.wts {
  background: var(--surface, #fff);
  border: 1px solid var(--glass-border, rgba(128, 128, 128, 0.3));
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 14px;
}
.wts-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.wts-title { font-size: 15px; font-weight: 800; color: var(--text, #222); }
.wts-sub { font-size: 11px; color: var(--text3, #888); }
.wts-top {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 10px;
  padding: 8px;
  border-radius: 8px;
  background: rgba(226, 59, 59, 0.06);
}
.wts-top-l { font-size: 12px; font-weight: 700; color: #e23b3b; margin-right: 2px; }
.wts-top-chip {
  cursor: pointer;
  font-size: 11.5px;
  padding: 3px 8px;
  border-radius: 20px;
  border: 1px solid transparent;
  color: var(--text, #222);
  user-select: none;
  transition: transform 0.12s;
}
.wts-top-chip b { font-weight: 800; }
.wts-top-chip:hover { transform: translateY(-1px); }
.wts-top-chip.on { box-shadow: 0 0 0 2px var(--pri, #4f7cff) inset; }
.wts-empty {
  font-size: 13px;
  color: var(--text3, #888);
  padding: 18px 6px;
  text-align: center;
}
.wts-plate { margin-bottom: 10px; }
.wts-plate:last-child { margin-bottom: 0; }
.wts-plate-h {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.wts-plate-n { font-size: 13px; font-weight: 700; color: var(--text, #222); }
.wts-plate-t { font-size: 11px; color: var(--text3, #888); }
.wts-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  border-radius: 7px;
  cursor: pointer;
  transition: background 0.12s;
}
.wts-row:hover { background: rgba(128, 128, 128, 0.08); }
.wts-row.on { background: rgba(79, 124, 255, 0.12); box-shadow: 0 0 0 1px var(--pri, #4f7cff) inset; }
.wts-name {
  flex: 0 0 84px;
  font-size: 12.5px;
  color: var(--text, #222);
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wts-bar-wrap {
  flex: 1 1 auto;
  height: 14px;
  background: rgba(128, 128, 128, 0.12);
  border-radius: 7px;
  overflow: hidden;
}
.wts-bar {
  display: block;
  height: 100%;
  border-radius: 7px;
  min-width: 12px;
  transition: width 0.3s;
}
.wts-cnt {
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 700;
  color: var(--text, #222);
  min-width: 44px;
  text-align: left;
}
.wts-cnt i { font-style: normal; font-weight: 400; font-size: 10.5px; color: var(--text3, #888); margin-left: 2px; }
.wts-active {
  margin-top: 10px;
  font-size: 12px;
  color: var(--text3, #888);
}
.wts-active b { color: var(--text, #222); }
.wts-clear {
  margin-left: 8px;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 14px;
  border: 1px solid var(--glass-border, rgba(128, 128, 128, 0.3));
  background: var(--card, #fff);
  color: var(--text, #222);
  cursor: pointer;
}
</style>
