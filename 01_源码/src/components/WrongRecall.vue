<script setup>
// 主动回忆式复盘（深化）：先默写再展开——不直接给答案，先让用户凭记忆写考点/思路/上次错因，
// 展开后再自评「回忆到位 / 没想起来」，结果计入二刷统计（复错率/掌握度）
import { toRefs, computed } from 'vue'
const props = defineProps({ ctx: { type: Object, required: true } })
const { rcShow, rcQ, rcRecall, rcRevealed } = toRefs(props.ctx)
const { rcClose, rcReveal, rcSelf, md } = props.ctx
const optsOf = computed(() => {
  const q = rcQ.value
  if (!q) return []
  try {
    const o = (q.options || []).length ? q.options : extractChoicesLocal(q.question || '')
    return o
  } catch (e) { return [] }
})
function extractChoicesLocal(text) {
  const re = /(?:^|\n)\s*([A-D])[.、．:：]\s*([^\n]+)/g
  const out = []
  let m
  while ((m = re.exec(String(text || ''))) && out.length < 4) out.push({ k: m[1], t: m[2].trim() })
  return out
}
</script>

<template>
  <div v-if="rcShow" class="ov show" @click.self="rcClose()">
    <div class="pnl" style="max-width: 640px">
      <h3>🧠 主动回忆复盘（先默写 · 再展开）</h3>
      <p style="font-size: 12px; color: var(--text3); margin: 2px 0 10px">
        回忆是最强巩固。先别看答案——凭记忆写下：这道题考什么、为什么选这个、上次错在哪。写不出来也没关系，点「展开解析」再对照。
      </p>
      <div v-if="rcQ" style="border: 1px solid rgba(127,127,127,.2); border-radius: 10px; padding: 8px 10px; margin-bottom: 8px">
        <div style="font-size: 12px; color: var(--text2); margin-bottom: 4px">{{ rcQ.subject || '未分类' }} · 错 {{ rcQ.wrongCount || 1 }} 次 · 上次错因：{{ (rcQ.reasons || []).join('、') || '未标' }}</div>
        <div class="rc-stem" v-html="md(String(rcQ.question || rcQ.q || rcQ.stem || '').replace(/\n{3,}/g, '\n\n'))"></div>
        <div v-if="optsOf.length" style="margin-top: 6px">
          <div v-for="o in optsOf" :key="o.k" style="font-size: 13px; padding: 1px 0"><b>{{ o.k }}.</b> <span v-html="md(String(o.t || ''))"></span></div>
        </div>
      </div>
      <textarea v-model="rcRecall" rows="3" placeholder="✍️ 先默写：考点 / 关键判断依据 / 上次为什么错…（可留空，直接展开）" style="width: 100%; box-sizing: border-box"></textarea>
      <div v-if="!rcRevealed" style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px">
        <button class="btn btn-pri" @click="rcReveal()">🔍 我想好了，展开解析</button>
        <button class="btn btn-gh" @click="rcReveal()">😵 想不起来，直接看解析</button>
      </div>
      <template v-else>
        <div style="border: 1px dashed rgba(52,211,153,.5); border-radius: 10px; padding: 8px 10px; margin-top: 8px">
          <div style="font-size: 13px"><b>✅ 答案：{{ rcQ.answer || '未填' }}</b></div>
          <div v-if="rcQ.method" style="font-size: 12.5px; color: #fbbf24; margin-top: 4px">⚡ 秒杀：{{ rcQ.method }}</div>
          <div v-if="rcQ.note" style="font-size: 12.5px; color: var(--text2); margin-top: 4px">📝 {{ rcQ.note }}</div>
          <div v-if="rcQ.explain || rcQ.analysis" style="font-size: 12.5px; color: var(--text2); margin-top: 4px; white-space: pre-wrap">{{ String(rcQ.explain || rcQ.analysis || '').slice(0, 1200) }}</div>
        </div>
        <div v-if="rcRecall && rcRecall.trim()" style="font-size: 12.5px; color: var(--text2); margin-top: 6px">🖊 你的回忆：{{ rcRecall }}</div>
        <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px">
          <button class="btn btn-pri" @click="rcSelf(true)">✅ 回忆到位（算二刷答对）</button>
          <button class="btn btn-gh" @click="rcSelf(false)">❌ 没想起来（算二刷答错，记复错）</button>
        </div>
      </template>
      <div class="pnl-btns">
        <button class="btn btn-gh" @click="rcClose()">关闭</button>
      </div>
    </div>
  </div>
</template>
