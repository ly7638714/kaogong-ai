<script setup>
// AI 批量复盘（深化 v3.8.209）：支持 自选 板块(大板块全称)→细分→题型 范围；每行贴原题信息、可点「查看原题」；导出 MD 含完整原题
import { toRefs } from 'vue'
import { groupLabelOf } from '../data/groupNames'
import { canonicalSubOf, typeLabelOf } from '../utils/wrongTaxonomy'
const props = defineProps({ ctx: { type: Object, required: true } })
const { brBusy, brCancel, brDone, brErr, brLog, brN, brRows, brShow, brGroup, brSub, brType } = toRefs(props.ctx)
const { brStart, brStop, brExportMd, brSpeakAll, brPick, brGroupOptions, brSubOptions, brTypeOptions, brSyncN, brOpenQ, store } = props.ctx
function clean(t, n) {
  return String(t || '').replace(/```svg[\s\S]*?```/g, '【图】').replace(/<svg[\s\S]*?<\/svg>/g, '【图】').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n || 200)
}
function qLabel(q) {
  if (!q) return ''
  const sub = canonicalSubOf(q)
  return groupLabelOf(sub) || sub || String(q.subject || '')
}
function typeOf(q) { return typeLabelOf(q) }
function hasImg(q) { return !!(q && (q.imgs || []).length) }
</script>

<template>
  <div v-if="brShow" class="ov show" @click.self="brCancel = true; brShow = false">
    <div class="pnl" style="max-width: 680px">
      <h3>🤖 AI 批量复盘</h3>
      <p style="font-size: 12px; color: var(--text3); margin: 2px 0 10px">
        逐题做 错因 → 一句话修正 → 今日动作；<b>范围可自选</b>（不选=沿用当前列表筛选）。每题一次轻量请求，可随时停止。
      </p>
      <!-- 范围：板块(组全称) → 细分 → 题型 -->
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px;font-size:12.5px">
        <select v-model="brGroup" class="tb-sel" style="max-width:150px" @change="brSub = ''; brType = ''; brSyncN()">
          <option value="">板块：全部</option>
          <option v-for="g in brGroupOptions()" :key="g" :value="g">{{ groupLabelOf(g) }}</option>
        </select>
        <select v-if="brGroup && brSubOptions().length" v-model="brSub" class="tb-sel" style="max-width:150px" @change="brType = ''; brSyncN()">
          <option value="">细分：全部</option>
          <option v-for="sb in brSubOptions()" :key="sb" :value="sb">{{ sb }}</option>
        </select>
        <select v-if="brTypeOptions().length" v-model="brType" class="tb-sel" style="max-width:170px" @change="brSyncN()">
          <option value="">题型：全部</option>
          <option v-for="t in brTypeOptions()" :key="t" :value="t">{{ t }}</option>
        </select>
        <span style="color:var(--text2)">范围 <b>{{ brN }}</b> 题</span>
      </div>
      <div style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-bottom: 8px">
        <span style="font-size: 13px">每次最多复盘：</span>
        <button class="btn btn-gh" style="padding: 4px 10px; font-size: 12px" @click="brPick(5)">5 题</button>
        <button class="btn btn-gh" style="padding: 4px 10px; font-size: 12px" @click="brPick(10)">10 题</button>
        <button class="btn btn-gh" style="padding: 4px 10px; font-size: 12px" @click="brPick(15)">15 题</button>
        <button class="btn btn-gh" style="padding: 4px 10px; font-size: 12px" @click="brPick(20)">20 题</button>
      </div>
      <div v-if="!brBusy" style="display: flex; gap: 6px; flex-wrap: wrap">
        <button class="btn btn-pri" :disabled="brN <= 0" @click="brStart()">▶️ 开始批量复盘（{{ brN }} 题）</button>
        <button class="btn btn-gh" :disabled="!brRows.length" @click="brExportMd()">📤 导出报告 MD（含完整原题）</button>
        <button class="btn btn-gh" :disabled="!brRows.length" @click="brSpeakAll()">🔊 朗读报告</button>
      </div>
      <div v-else class="br-prog" style="margin: 6px 0">
        <div style="font-size: 13px">⏳ {{ brLog }}</div>
        <div style="height: 6px; border-radius: 4px; background: rgba(127,127,127,.15); margin-top: 6px; overflow: hidden">
          <i :style="{ display: 'block', height: '6px', width: Math.round((brDone / brN) * 100) + '%', background: 'linear-gradient(90deg,#34d399,#fbbf24)', transition: 'width .3s' }"></i>
        </div>
        <button class="btn btn-gh" style="padding: 3px 12px; font-size: 12px; margin-top: 6px" @click="brStop()">⏹ 停止</button>
      </div>
      <div v-if="brErr" style="color: #f87171; font-size: 12px; margin: 4px 0">{{ brErr }}</div>
      <div v-if="brRows.length" style="max-height: 48vh; overflow: auto; margin-top: 8px">
        <div v-for="r in brRows" :key="'br' + r.idx" style="border: 1px solid rgba(127,127,127,.18); border-radius: 8px; padding: 6px 8px; margin-bottom: 6px">
          <div style="display:flex;align-items:flex-start;gap:8px;flex-wrap:wrap">
            <b style="font-size:13px">第 {{ r.idx + 1 }} 题 · {{ qLabel(store.wqs[r.idx]) }} · {{ typeOf(store.wqs[r.idx]) }}</b>
            <button class="btn btn-gh" style="padding:1px 8px;font-size:11px" title="回到错题列表打开这道题看完整题干/选项/图" @click="brOpenQ(r.idx)">👁 查看原题</button>
          </div>
          <div style="font-size:12px;color:var(--text2);margin:3px 0;line-height:1.6">{{ clean((store.wqs[r.idx] || {}).question, 260) }}<span v-if="hasImg(store.wqs[r.idx])" style="color:#fb7185"> …〔含原图截图〕</span></div>
          <div style="font-size: 12.5px; color: #fbbf24">😖 错因：{{ r.reason || '—' }}</div>
          <div style="font-size: 12.5px; color: #34d399">💡 修正：{{ r.fix || '—' }}</div>
          <div style="font-size: 12.5px; color: var(--text2)">📌 今日动作：{{ r.action || '—' }}</div>
        </div>
      </div>
      <div v-else-if="!brBusy && !brErr && brDone === 0" class="empty" style="padding: 12px 0">
        <div class="empty-t">先选范围（或不选=沿用当前筛选），再点「开始」；完成后每行可点「👁 查看原题」</div>
      </div>
      <div class="pnl-btns">
        <button class="btn btn-gh" @click="brCancel = true; brShow = false">关闭</button>
      </div>
    </div>
  </div>
</template>
