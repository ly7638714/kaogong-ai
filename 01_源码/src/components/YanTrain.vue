<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { pickPassage, buildYanQ, verifyYanQ, YAN_MODES, YAN_DOMAINS, THEORY_MD } from '../utils/yanTrainLib'
import { renderMd } from '../utils/renderMd'
import { showToast } from '../utils/toast'
import { store, addWrong } from '../store'
import { chatOnce, activeCfg } from '../api'

const emit = defineEmits(['close', 'send-question'])
const md = (t) => renderMd(t || '')
const ready = ref(false)
const domain = ref('自动')
const paper = ref(null)
const q = ref(null)
const mode = ref('topic')
const picked = ref('')
const sentenceIdx = ref(0)
const helpShow = ref(false)
const aiBusy = ref(false)
const aiText = ref('')
const runStarted = ref(false)
const elapsed = ref(0)
const qStart = ref(0)
const qTime = ref(0)
const modeStats = ref({ topic: { ok: 0, bad: 0 }, sentence: { ok: 0, bad: 0 }, structure: { ok: 0, bad: 0 }, main: { ok: 0, bad: 0 } })
const modeOrder = YAN_MODES.map((m) => m.k)
const curMode = computed(() => YAN_MODES.find((m) => m.k === mode.value) || YAN_MODES[0])
const paperText = computed(() => (paper.value ? paper.value.sentences : []))
const modePct = computed(() =>
  YAN_MODES.map((m) => {
    const s = modeStats.value[m.k] || { ok: 0, bad: 0 }
    const t = s.ok + s.bad
    return { ...m, ok: s.ok, bad: s.bad, done: t, pct: t ? Math.round((s.ok / t) * 100) : 0 }
  })
)
const totalScore = computed(() => {
  const ok = YAN_MODES.reduce((n, m) => n + ((modeStats.value[m.k] || {}).ok || 0), 0)
  const bad = YAN_MODES.reduce((n, m) => n + ((modeStats.value[m.k] || {}).bad || 0), 0)
  return { ok, bad, total: ok + bad, pct: ok + bad ? Math.round((ok / (ok + bad)) * 100) : 0 }
})
function buildQ(seedOverride) {
  const p = paper.value
  if (!p) return
  const qq = buildYanQ(p, mode.value, seedOverride == null ? Date.now() % 100000 : seedOverride, sentenceIdx.value)
  if (!qq || !verifyYanQ(qq, p)) {
    q.value = null
    showToast('文段出题未通过质检，已自动重试', 'info')
    return
  }
  q.value = qq
  picked.value = ''
  qTime.value = 0
  qStart.value = Date.now()
}
function startTrain() {
  const seed = Date.now() % 100000
  paper.value = pickPassage(seed, domain.value)
  mode.value = 'topic'
  sentenceIdx.value = 0
  modeStats.value = { topic: { ok: 0, bad: 0 }, sentence: { ok: 0, bad: 0 }, structure: { ok: 0, bad: 0 }, main: { ok: 0, bad: 0 } }
  elapsed.value = 0
  ready.value = true
  buildQ(seed)
  showToast('📖 已生成一篇文段，请按四步拆解训练', 'success')
}
function backHome() {
  ready.value = false
  paper.value = null
  q.value = null
  picked.value = ''
}
function switchMode(m) {
  mode.value = m
  sentenceIdx.value = 0
  if (ready.value) buildQ()
}
function nextSentence() {
  if (!paper.value) return
  sentenceIdx.value = (sentenceIdx.value + 1) % paper.value.sentences.length
  buildQ()
  showToast('↻ 已切到第 ' + (sentenceIdx.value + 1) + ' 句，请判断其作用', 'info')
}
function newPassage() {
  const seed = Date.now() % 100000
  paper.value = pickPassage(seed, domain.value)
  mode.value = 'topic'
  sentenceIdx.value = 0
  buildQ(seed)
  showToast('🎲 已换一篇同领域文段', 'success')
}
function startRun() {
  if (runStarted.value) return
  runStarted.value = true
  elapsed.value = 0
  qStart.value = Date.now()
}
function pick(k) {
  if (!q.value || picked.value) return
  if (!runStarted.value) { showToast('请先点击「▶ 开始作答计时」', 'info'); return }
  picked.value = k
  qTime.value = Math.max(0, Math.round((Date.now() - qStart.value) / 1000))
  const ok = k === q.value.answer
  const st = modeStats.value[q.value.mode]
  if (ok) st.ok++
  else st.bad++
  const roleTxt = q.value.mode === 'sentence' && ok ? (q.value.role || '') : ''
  if (roleTxt) showToast('✅ ' + roleTxt.split('：')[0], 'success')
  else showToast(ok ? '✅ 回答正确，看拆解路径巩固' : '❌ 答错了，看右侧结构拆解', ok ? 'success' : 'error')
}
function nextLayer() {
  const idx = modeOrder.indexOf(mode.value)
  if (idx >= 0 && idx < modeOrder.length - 1) switchMode(modeOrder[idx + 1])
  else { newPassage(); return }
  if (idx === modeOrder.length - 1) newPassage()
}
async function aiCoach() {
  if (!q.value || aiBusy.value) return
  const c = activeCfg(false)
  if (!c || !c.key) { aiText.value = '尚未配置文字大模型 Key，可先用页面拆解自学。'; return }
  aiBusy.value = true
  aiText.value = ''
  const opts = q.value.options.map((o) => o.k + '. ' + o.t).join('\n')
  const p = paper.value
  try {
    const reply = await chatOnce(c, [
      { role: 'system', content: '你是行测言语理解名师（郭熙×花生十三×张弓三师融合），只讲片段阅读结构拆解，控制350字，不寒暄。' },
      { role: 'user', content: '文段领域：' + p.domain + '。\n题目：' + q.value.q + '\n选项：' + opts + '\n正确答案：' + q.value.answer + '\n请用“主题词→句子功能→行文骨架→主旨”四步讲解本题，并给出本题一句话口诀。' }
    ], 1000)
    aiText.value = String(reply || '').trim() || '（AI 未返回内容，请重试）'
  } catch (e) {
    aiText.value = 'AI 讲解失败：' + (e && e.message || e) + '；页面内本地拆解仍可使用。'
  } finally {
    aiBusy.value = false
  }
}
function sendChat() {
  if (!q.value || !paper.value) return
  const opts = q.value.options.map((o) => o.k + '. ' + o.t).join('\n')
  emit('send-question', '【言语理解·片段阅读结构拆解】请用郭熙×花生十三×张弓方法详细讲解：\n领域：' + paper.value.domain + '\n' + paper.value.sentences.map((s, i) => '第' + (i + 1) + '句：' + s).join('\n') + '\n题目：' + q.value.q + '\n' + opts + '\n正确答案：' + q.value.answer)
}
function saveWrong() {
  if (!q.value || !paper.value || !picked.value) return
  const p = paper.value
  const question = ['【片段阅读材料】' + p.title + '\n' + p.sentences.map((s, i) => '第' + (i + 1) + '句：' + s).join('\n'), '【题目】' + q.value.q, q.value.options.map((o) => o.k + '. ' + o.t).join('\n')].join('\n\n')
  const r = addWrong({
    subject: '言语理解',
    subx: '片段阅读',
    question,
    answer: '正确答案 ' + q.value.answer + (picked.value && picked.value !== q.value.answer ? '（我选' + picked.value + '）' : ''),
    reasons: ['文段结构四步拆解·' + q.value.modeT + '答错'],
    explain: q.value.explain || '',
    time: new Date().toLocaleString(), at: Date.now(), wrongCount: 1, correctStreak: 0, mastery: 0, digested: false
  }, { silent: true })
  showToast(r.ok ? '✅ 已存入错题本' : '🚫 非完整/重复未入库', r.ok ? 'success' : 'info')
}
watch(q, (qq) => {
  if (!qq || !paper.value) return
  store.readCtx = {
    type: 'yan',
    title: '片段结构·' + qq.modeT,
    text: (paper.value.sentences.join('。') + '。' + String(qq.q || '')).slice(0, 1200)
  }
  store.curQ = { plate: '言语理解', kind: '片段结构拆解', stem: qq.q, options: qq.options, answer: qq.answer }
})
let timerId = null
onMounted(() => {
  timerId = setInterval(() => { if (runStarted.value) elapsed.value = Math.floor((Date.now() - (qStart.value || Date.now())) / 1000) }, 1000)
})
onUnmounted(() => { if (timerId) clearInterval(timerId) })
</script>
<template>
  <div class="ov show yt-ov" @click.self="emit('close')">
    <div class="pnl yt-pnl">
      <div class="yt-head">
        <button class="pnl-top-b" @click="ready ? backHome() : emit('close')">← {{ ready ? '首页' : '返回' }}</button>
        <span class="yt-title">📖 言语理解 · 片段阅读结构四步拆解</span>
        <div class="yt-acts">
          <span class="dt-chip" title="本场正确率">🎯 {{ totalScore.pct }}%</span>
          <span class="dt-chip" title="计时状态">{{ runStarted ? '⏱ ' + elapsed + 's' : '⏱ 待开始' }}</span>
          <button class="btn btn-gh" @click="helpShow = !helpShow">{{ helpShow ? '收起说明' : '📖 能力说明' }}</button>
          <button class="pc-close" @click="emit('close')">✕</button>
        </div>
      </div>
      <div v-if="!ready" class="yt-guide">
        <div class="yt-card yt-guide-card">
          <div style="font-weight:800;font-size:16px;color:var(--accent)">🧰 片段阅读 · 四步拆解训练</div>
          <div style="font-size:13px;color:var(--text2);line-height:1.9;margin-top:8px">
            和资料速算一样采用“能力拆层”：每次生成一篇完整文段，同一篇文段依次训练 <b>① 主题词/关键词 → ② 句子功能 → ③ 行文结构 → ④ 主旨意图</b>。
            不再靠逐字精读，先学会把文段骨架拆出来再做题。
          </div>
          <div style="font-size:12px;color:var(--text3);margin-top:6px">文段覆盖社会治理、科技伦理、数字经济、文化保护、生态环保、教育健康、经济民生、城乡发展等真实高频领域。</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="dt-chip">领域：</span>
          <button v-for="d in YAN_DOMAINS" :key="d" class="btn" :class="domain === d ? 'btn-pri' : 'btn-gh'" style="padding:2px 9px;font-size:12px" @click="domain = d">{{ d }}</button>
        </div>
        <div class="yt-card" style="font-size:13px;line-height:1.9;color:var(--text2)">
          <div style="font-weight:700;color:var(--text)">训练前先背这张结构表</div>
          <div v-for="m in YAN_MODES" :key="m.k" style="margin:3px 0"><b>{{ m.t }}</b>：{{ m.d }}</div>
          <div style="color:var(--text3);margin-top:6px">答错会自动定位到错误能力层；每篇完成四步后建议点「📌 存错题」把不会的句子收进错题本。</div>
        </div>
        <button class="btn btn-pri yt-start" @click="startTrain()">🤖 开始四步拆解 · 随机一篇文段</button>
      </div>
      <template v-else>
        <div class="yt-body">
          <div class="yt-side">
            <div class="yt-card">
              <div class="yt-card-t">🧭 四步能力进度</div>
              <div v-for="lp in modePct" :key="lp.k" class="yt-py-row" :class="{ on: mode === lp.k }" @click="switchMode(lp.k)">
                <div class="yt-py-l"><b>{{ lp.t }}</b><span>{{ lp.ok }}/{{ lp.done }}</span></div>
                <div class="yt-py-bar"><i :style="{ width: lp.pct + '%' }"></i></div>
              </div>
              <div class="yt-tip">{{ curMode.d }}</div>
            </div>
            <div v-if="paper" class="yt-card">
              <div class="yt-card-t">📄 当前文段</div>
              <div class="yt-domain">{{ paper.domain }} · {{ paper.title }}</div>
              <div class="yt-theme">主题词：{{ paper.theme }}</div>
              <div class="yt-kw">关键词：{{ (paper.keywords || []).join('、') }}</div>
              <div class="yt-kw">结构：{{ paper.structureLabel.split('：')[0] }}</div>
              <div class="yt-tip">{{ paper.signal ? '信号词：' + paper.signal : '' }}</div>
            </div>
            <div class="yt-card">
              <div class="yt-card-t">📈 本场统计</div>
              <div class="yt-st">✅ 答对 <b>{{ totalScore.ok }}</b> · ❌ 答错 <b>{{ totalScore.bad }}</b> · 正确率 <b>{{ totalScore.pct }}%</b></div>
              <div class="yt-st">⏱ 用时 <b>{{ runStarted ? elapsed + 's' : '待开始' }}</b> · 本题 <b>{{ qTime }}s</b></div>
            </div>
          </div>
          <div class="yt-train">
            <div v-if="helpShow" class="yt-help" v-html="md(THEORY_MD)"></div>
            <div class="yt-modes">
              <button v-for="m in YAN_MODES" :key="m.k" class="btn" :class="mode === m.k ? 'btn-pri' : 'btn-gh'" :title="m.d" @click="switchMode(m.k)">{{ m.t }}</button>
              <button class="btn btn-gh" title="同篇文段下一句" :disabled="mode !== 'sentence'" @click="nextSentence()">↻ 下一句</button>
            </div>
            <div v-if="paper" class="yt-mat">
              <div class="yt-mat-title">{{ paper.title }}</div>
              <div v-for="(s, i) in paperText" :key="i" class="yt-sentence" :class="{ cur: q && q.kind === 'sentence' && q.sentenceIdx === i, done: picked && q && q.kind === 'sentence' && q.sentenceIdx === i }">
                <span class="yt-sn">{{ i + 1 }}</span>
                <span class="yt-sent">{{ s }}</span>
                <div v-if="picked && q && q.kind === 'sentence' && q.sentenceIdx === i" class="yt-role-tag" :style="{ color: picked === q.answer ? '#34d399' : '#fb7185' }">{{ q.role }}</div>
              </div>
              <div v-if="picked && q && q.kind !== 'sentence'" class="yt-ann">
                <span v-for="(s, i) in paperText" :key="i" class="yt-ann-row">第{{ i + 1 }}句 = {{ paper.roles[i].split('：')[0] }}</span>
              </div>
              <div v-if="paper" class="yt-mat-note">材料为本地生成教学文段，只用于结构阅读训练，不代表真实新闻/政策数据。</div>
            </div>
            <template v-if="q">
              <div class="yt-qcard">
                <div class="yt-qmode">{{ curMode.t }}</div>
                <div class="yt-q" v-html="md(q.q)"></div>
                <div class="yt-opts">
                  <button v-for="o in q.options" :key="o.k" class="yt-opt" :class="{ picked: picked === o.k, right: picked && o.k === q.answer, wrong: picked && o.k === picked && o.k !== q.answer }" :disabled="!!picked || !runStarted" @click="pick(o.k)">
                    <span class="dt-k">{{ o.k }}</span><span>{{ o.t }}</span>
                  </button>
                </div>
                <div v-if="!runStarted && !picked" class="yt-tip">请先点击「▶ 开始作答计时」再作答；切换能力层或下一篇会重新计时。</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
                  <button v-if="!runStarted" class="btn btn-pri" @click="startRun()">▶ 开始作答计时</button>
                  <button v-else class="btn btn-gh" @click="runStarted = false">⏹ 停止计时</button>
                  <button class="btn btn-gh" @click="newPassage()">🎲 换一篇</button>
                  <button class="btn btn-gh" @click="backHome()">🏠 首页</button>
                </div>
              </div>
              <div v-if="picked && q" class="yt-explain">
                <div class="yt-ex-t" :class="picked === q.answer ? 'ok' : 'bad'">{{ picked === q.answer ? '✅ 回答正确' : '❌ 答错了，正确答案是 ' + q.answer }}</div>
                <div class="yt-ex-b" v-html="md(q.explain)"></div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
                  <button class="btn btn-pri" @click="nextLayer()">{{ mode === 'main' ? '🔄 换一篇再练' : '➡️ 下一步 · ' + (YAN_MODES[modeOrder.indexOf(mode) + 1] || {}).t }}</button>
                  <button v-if="mode === 'sentence'" class="btn btn-gh" @click="nextSentence()">↻ 同篇下一句</button>
                  <button class="btn btn-gh" :disabled="aiBusy" @click="aiCoach()">{{ aiBusy ? '⏳ AI 讲解中…' : '🤖 AI 教练讲解' }}</button>
                  <button class="btn btn-gh" @click="sendChat()">💬 发到对话深挖</button>
                  <button v-if="picked !== q.answer" class="btn btn-gh" @click="saveWrong()">📌 存错题</button>
                </div>
                <div v-if="aiText" class="yt-ai" v-html="md(aiText)"></div>
              </div>
            </template>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
<style scoped>
.yt-ov { z-index: 432; }
.yt-pnl { width: min(1180px, 97vw); max-height: 94vh; display: flex; flex-direction: column; overflow: hidden; }
.yt-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
.yt-title { font-size: 16px; font-weight: 800; color: var(--accent); }
.yt-acts { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.yt-body { display: flex; gap: 14px; flex: 1; min-height: 0; }
.yt-side { flex: 0 0 250px; min-width: 220px; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; }
.yt-train { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; padding-right: 2px; }
.yt-card { background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 10px; padding: 10px 12px; }
.yt-card-t { font-size: 12px; font-weight: 700; color: var(--text3); margin-bottom: 8px; }
.yt-py-row { display: block; padding: 6px 9px; border-radius: 8px; background: var(--surface); border: 1px solid transparent; margin-bottom: 6px; cursor: pointer; }
.yt-py-row.on { border-color: var(--accent); }
.yt-py-l { display: flex; justify-content: space-between; font-size: 12px; color: var(--text); margin-bottom: 4px; }
.yt-py-row.on .yt-py-l b { color: var(--accent); }
.yt-py-bar { height: 5px; border-radius: 3px; background: rgba(128,128,128,.2); overflow: hidden; }
.yt-py-bar i { display: block; height: 100%; background: var(--accent); border-radius: 3px; transition: width .3s; }
.yt-tip, .yt-st { font-size: 11.5px; color: var(--text3); line-height: 1.65; margin-top: 5px; }
.yt-domain { font-weight: 700; color: var(--accent); margin: 4px 0; }
.yt-theme, .yt-kw { font-size: 12px; color: var(--text2); margin: 3px 0; line-height: 1.6; }
.yt-guide { max-width: 920px; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; padding: 4px 2px; overflow-y: auto; }
.yt-start { align-self: flex-start; padding: 9px 18px; font-size: 13px; }
.yt-mat { border: 1px solid var(--glass-border); border-radius: 10px; background: var(--glass-bg); padding: 12px; }
.yt-mat-title { font-weight: 800; margin-bottom: 8px; }
.yt-sentence { display: flex; gap: 8px; padding: 5px 6px; border-radius: 8px; line-height: 1.75; font-size: 14px; }
.yt-sentence.cur { background: rgba(34,211,238,.1); }
.yt-sn { flex: 0 0 22px; height: 22px; border-radius: 11px; background: var(--surface); color: var(--text3); font-size: 11px; display: inline-flex; align-items: center; justify-content: center; margin-top: 2px; }
.yt-role-tag { flex-basis: 100%; font-size: 11.5px; color: #34d399; padding-left: 30px; }
.yt-ann { display: flex; gap: 6px; flex-wrap: wrap; border-top: 1px dashed var(--glass-border); margin-top: 8px; padding-top: 8px; }
.yt-ann-row { font-size: 11px; color: var(--text3); background: var(--surface); border-radius: 12px; padding: 3px 9px; }
.yt-mat-note { font-size: 11px; color: var(--text3); margin-top: 8px; }
.yt-modes { display: flex; gap: 6px; flex-wrap: wrap; }
.yt-qcard, .yt-explain, .yt-help, .yt-ai { background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 10px; padding: 10px 12px; }
.yt-qmode { font-size: 12px; font-weight: 700; color: var(--accent); margin-bottom: 8px; }
.yt-q { font-size: 14px; line-height: 1.8; color: var(--text); overflow-wrap: break-word; word-break: break-word; }
.yt-opts { display: grid; grid-template-columns: repeat(auto-fit,minmax(220px,1fr)); gap: 8px; margin-top: 10px; }
.yt-opt { display: flex; gap: 8px; align-items: flex-start; text-align: left; padding: 10px; border: 1px solid var(--glass-border); border-radius: 8px; background: var(--surface); font-size: 13px; line-height: 1.6; }
.yt-opt.right { border-color: #34d399; color: #34d399; }
.yt-opt.wrong { border-color: #fb7185; color: #fb7185; }
.yt-opt:disabled { cursor: default; }
.yt-explain { margin-top: 10px; }
.yt-ex-t { font-weight: 800; }
.yt-ex-t.ok { color: #34d399; }
.yt-ex-t.bad { color: #fb7185; }
.yt-ex-b { font-size: 13px; line-height: 1.8; margin-top: 6px; }
.yt-help { font-size: 13px; line-height: 1.8; }
@media (max-width: 760px) {
  .yt-body { flex-direction: column; }
  .yt-side { flex: none; max-height: 35vh; }
  .yt-title { font-size: 13.5px; }
  .yt-opts { grid-template-columns: 1fr; }
}
</style>
