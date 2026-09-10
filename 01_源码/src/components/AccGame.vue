<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { buildDeck, GAME_SUBJECTS, GAME_LEVELS, GAME_MODES, loadGameWrong, saveGameWrong, loadGameStats, saveGameStats } from '../utils/accGame'
import { loadSrs, saveSrs, rememberOne, ymdKey } from '../utils/memorySrs'
import { addPoints as petAddPoints } from '../utils/pet'
import { showToast } from '../utils/toast'

const emit = defineEmits(['close'])
const screen = ref('start')
const subject = ref('all')
const mode = ref('level')
const level = ref(1)
const deck = ref([])
const idx = ref(0)
const picked = ref('')
const correctN = ref(0)
const wrongN = ref(0)
const score = ref(0)
const combo = ref(0)
const maxCombo = ref(0)
const hearts = ref(3)
const elapsed = ref(0)
const result = ref(null)
const mistakeTerms = ref(loadGameWrong())
const stats = ref(loadGameStats())
let timer = null
let autoNextTimer = null
const TOTAL_SECONDS = 60

const current = computed(() => deck.value[idx.value] || null)
const progressPct = computed(() => (deck.value.length ? Math.round((idx.value / deck.value.length) * 100) : 0))
const remainSec = computed(() => Math.max(0, TOTAL_SECONDS - elapsed.value))
const levelName = computed(() => (GAME_LEVELS.find((x) => x.k === level.value) || GAME_LEVELS[0]).t)

function clearTimer() {
  if (timer) { clearInterval(timer); timer = null }
  if (autoNextTimer) { clearTimeout(autoNextTimer); autoNextTimer = null }
}
function start() {
  const n = mode.value === 'rapid' ? 80 : mode.value === 'wrong' ? Math.max(6, Math.min(20, mistakeTerms.value.length || 8)) : 10
  const lv = mode.value === 'rapid' || mode.value === 'wrong' ? 4 : level.value
  const d = buildDeck(subject.value, lv, n, { wrongTerms: mode.value === 'wrong' ? mistakeTerms.value : [] })
  if (!d.length) { showToast('当前分类词条不足，先换一个分类试试', 'info'); return }
  deck.value = d
  idx.value = 0
  picked.value = ''
  correctN.value = 0
  wrongN.value = 0
  score.value = 0
  combo.value = 0
  maxCombo.value = 0
  hearts.value = mode.value === 'rapid' ? 5 : 3
  elapsed.value = 0
  result.value = null
  screen.value = 'play'
  clearTimer()
  timer = setInterval(() => {
    elapsed.value++
    if (mode.value === 'rapid' && remainSec.value <= 0) finish()
  }, 1000)
  focusKey()
}
function focusKey() {
  try { window.focus() } catch (e) {}
}
function answer(k) {
  const q = current.value
  if (!q || picked.value) return
  picked.value = k
  const ok = k === q.answer
  if (ok) {
    correctN.value++
    combo.value++
    maxCombo.value = Math.max(maxCombo.value, combo.value)
    score.value += 10 + Math.min(20, combo.value * 2)
    petAddPoints(2)
    mistakeTerms.value = mistakeTerms.value.filter((x) => x !== q.term)
  } else {
    wrongN.value++
    combo.value = 0
    hearts.value = Math.max(0, hearts.value - 1)
    if (!mistakeTerms.value.includes(q.term)) mistakeTerms.value.push(q.term)
  }
  saveGameWrong(mistakeTerms.value)
  const srs = loadSrs()
  rememberOne(srs, q.item.subject || subject.value, q.term, ok, ymdKey())
  saveSrs(srs)
  if (mode.value === 'rapid') {
    autoNextTimer = setTimeout(() => next(), ok ? 260 : 620)
  }
}
function next() {
  if (!picked.value) return
  if (mode.value === 'level' && hearts.value <= 0) { finish(); return }
  if (idx.value >= deck.value.length - 1) { finish(); return }
  idx.value++
  picked.value = ''
}
function finish() {
  if (screen.value !== 'play') return
  clearTimer()
  const total = correctN.value + wrongN.value
  const acc = total ? Math.round((correctN.value / total) * 100) : 0
  result.value = { total, acc, score: score.value, maxCombo: maxCombo.value, elapsed: elapsed.value, passed: hearts.value > 0 && acc >= 60 }
  const s = Object.assign({}, stats.value)
  s.best = Math.max(Number(s.best) || 0, score.value)
  s.total = (Number(s.total) || 0) + total
  const today = ymdKey()
  if (s.lastDay !== today) {
    const y = new Date(Date.now() - 86400000)
    const yKey = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0')
    s.streak = s.lastDay === yKey ? (Number(s.streak) || 0) + 1 : 1
    s.lastDay = today
  }
  stats.value = s
  saveGameStats(s)
  screen.value = 'result'
}
function again() { screen.value = 'start'; result.value = null; clearTimer() }
function onKey(e) {
  if (screen.value !== 'play' || picked.value) return
  const keys = current.value ? current.value.options.map((o) => o.k) : []
  const i = ['1', '2', '3', '4', 'A', 'B', 'C', 'D', 'T', 'F'].indexOf(String(e.key).toUpperCase())
  if (i >= 0) {
    const k = ['1', '2', '3', '4', 'A', 'B', 'C', 'D', 'T', 'F'][i]
    const opt = keys.includes(k) ? k : keys[i]
    if (opt) answer(opt)
  }
  if (e.key === 'Enter' && picked.value) next()
  if (e.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => { window.removeEventListener('keydown', onKey); clearTimer() })
</script>

<template>
  <div class="ov show ag-ov" @click.self="emit('close')">
    <div class="pnl ag-pnl">
      <div class="ag-top">
        <button class="pnl-top-b" @click="emit('close')">← 返回积累页</button>
        <b class="ag-title">🎮 记忆闯关</b>
        <span class="ag-chip">🏆 最高 {{ stats.best || 0 }} 分</span>
        <span class="ag-chip">🔥 连续 {{ stats.streak || 0 }} 天</span>
      </div>

      <div v-if="screen === 'start'" class="ag-start">
        <div class="ag-hero">
          <div class="ag-hero-i">🧠</div>
          <div>
            <div class="ag-hero-t">把常识、政治理论、时政、成语、实词练成游戏</div>
            <div class="ag-hero-s">看词选义 → 看义选词 → 语境填空 → Boss 混合战。答对答错都会自动写入艾宾浩斯复习计划。</div>
          </div>
        </div>
        <div class="ag-sec">选择战场</div>
        <div class="ag-subjects">
          <button v-for="s in GAME_SUBJECTS" :key="s.k" class="ag-sub" :class="{ on: subject === s.k }" @click="subject = s.k">{{ s.icon }} {{ s.t }}</button>
        </div>
        <div class="ag-sec">选择玩法</div>
        <div class="ag-modes">
          <button v-for="m in GAME_MODES" :key="m.k" class="ag-mode" :class="{ on: mode === m.k }" @click="mode = m.k">
            <b>{{ m.icon }} {{ m.t }}</b><span>{{ m.d }}</span>
          </button>
        </div>
        <template v-if="mode === 'level'">
          <div class="ag-sec">选择关卡</div>
          <div class="ag-levels">
            <button v-for="l in GAME_LEVELS" :key="l.k" class="ag-level" :class="{ on: level === l.k }" @click="level = l.k">
              <b>{{ l.icon }} {{ l.t }}</b><span>{{ l.d }}</span>
            </button>
          </div>
        </template>
        <div v-if="mistakeTerms.length" class="ag-wrong-tip">🔁 错题回炉已缓存 {{ mistakeTerms.length }} 个词条，答对会自动移出。</div>
        <button class="btn btn-pri ag-start-btn" @click="start()">🚀 开始挑战</button>
      </div>

      <div v-else-if="screen === 'play' && current" class="ag-play">
        <div class="ag-hud">
          <span class="ag-chip">💎 {{ score }}</span>
          <span class="ag-chip" :class="{ hot: combo >= 3 }">🔥 x{{ combo }}</span>
          <span class="ag-chip">❤️ {{ hearts }}</span>
          <span v-if="mode === 'rapid'" class="ag-chip time">⏱ {{ remainSec }}s</span>
          <span class="ag-progress">{{ idx + 1 }} / {{ deck.length }}</span>
        </div>
        <div class="ag-bar"><i :style="{ width: progressPct + '%' }"></i></div>
        <div class="ag-card">
          <div class="ag-tag">{{ current.tag }} · {{ subject === 'all' ? '混合挑战' : subject }}<span v-if="mode === 'level'"> · {{ levelName }}</span></div>
          <div class="ag-prompt">{{ current.prompt }}</div>
          <div class="ag-options" :class="{ tf: current.options.length === 2 }">
            <button v-for="o in current.options" :key="o.k" class="ag-opt" :class="{ picked: picked === o.k, right: picked && o.ok, wrong: picked && picked === o.k && !o.ok }" :disabled="!!picked" @click="answer(o.k)">
              <b>{{ o.k }}</b><span>{{ o.t }}</span>
            </button>
          </div>
          <div v-if="picked" class="ag-feedback" :class="picked === current.answer ? 'ok' : 'bad'">
            <div class="ag-fb-t">{{ picked === current.answer ? '✅ 答对了' : '❌ 正确答案：' + current.answer }}</div>
            <div class="ag-fb-b">{{ current.explain }}</div>
            <div v-if="current.tip" class="ag-fb-tip">💡 {{ current.tip }}</div>
            <button v-if="mode !== 'rapid'" class="btn btn-pri" @click="next()">{{ idx >= deck.length - 1 ? '查看成绩' : '下一题' }}</button>
            <span v-else class="ag-tip">自动进入下一题…</span>
          </div>
        </div>
      </div>

      <div v-else-if="screen === 'result' && result" class="ag-result">
        <div class="ag-medal">{{ result.passed ? '🏆' : '💪' }}</div>
        <div class="ag-res-t">{{ result.passed ? '闯关成功！' : '这关还差一点，回炉再来' }}</div>
        <div class="ag-res-grid">
          <div><b>{{ result.score }}</b><span>本局得分</span></div>
          <div><b>{{ result.acc }}%</b><span>正确率</span></div>
          <div><b>{{ result.maxCombo }}</b><span>最高连击</span></div>
          <div><b>{{ result.total }}</b><span>本局题数</span></div>
        </div>
        <div v-if="mistakeTerms.length" class="ag-wrong-list">
          <b>需要回炉：</b>
          <span v-for="t in mistakeTerms.slice(0, 12)" :key="t">{{ t }}</span>
        </div>
        <div class="ag-res-acts">
          <button class="btn btn-pri" @click="again()">🔄 再来一局</button>
          <button class="btn btn-gh" @click="emit('close')">回积累页</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ag-ov { z-index: 470; }
.ag-pnl { width: min(920px, 96vw); max-height: 94vh; display: flex; flex-direction: column; overflow: hidden; padding: 12px 14px; }
.ag-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.ag-title { font-size: calc(16px * var(--ui-fs-scale, 1)); color: var(--accent); }
.ag-chip { border: 1px solid var(--glass-border); background: var(--glass-bg); border-radius: 20px; padding: 3px 10px; font-size: calc(12px * var(--ui-fs-scale, 1)); color: var(--text2); }
.ag-chip.hot, .ag-chip.time { color: #fb923c; border-color: rgba(251,146,60,.55); }
.ag-start, .ag-play, .ag-result { overflow-y: auto; min-height: 0; }
.ag-hero { display: flex; gap: 12px; align-items: center; padding: 14px; border-radius: 14px; background: linear-gradient(135deg, rgba(34,211,238,.12), rgba(167,139,250,.12)); border: 1px solid var(--glass-border); }
.ag-hero-i { font-size: 42px; }
.ag-hero-t { font-size: calc(17px * var(--ui-fs-scale, 1)); font-weight: 800; }
.ag-hero-s { font-size: calc(12.5px * var(--ui-fs-scale, 1)); color: var(--text2); line-height: 1.7; margin-top: 5px; }
.ag-sec { font-weight: 800; color: var(--text2); margin: 12px 0 6px; font-size: calc(13px * var(--ui-fs-scale, 1)); }
.ag-subjects, .ag-modes, .ag-levels { display: flex; gap: 7px; flex-wrap: wrap; }
.ag-sub, .ag-mode, .ag-level { border: 1px solid var(--glass-border); background: var(--glass-bg); color: var(--text); border-radius: 10px; padding: 8px 11px; font: inherit; font-size: calc(12.5px * var(--ui-fs-scale, 1)); cursor: pointer; text-align: left; }
.ag-sub.on, .ag-mode.on, .ag-level.on { border-color: var(--accent); color: var(--accent); background: rgba(34,211,238,.1); }
.ag-mode { display: flex; flex-direction: column; gap: 3px; min-width: 180px; flex: 1; }
.ag-mode span, .ag-level span { color: var(--text3); font-size: calc(11px * var(--ui-fs-scale, 1)); }
.ag-level { display: flex; flex-direction: column; gap: 3px; min-width: 160px; }
.ag-wrong-tip { color: #fbbf24; font-size: calc(12px * var(--ui-fs-scale, 1)); margin-top: 10px; }
.ag-start-btn { margin-top: 14px; padding: 10px 24px; font-size: calc(15px * var(--ui-fs-scale, 1)); }
.ag-hud { display: flex; gap: 7px; align-items: center; flex-wrap: wrap; }
.ag-progress { margin-left: auto; color: var(--text3); font-size: calc(12px * var(--ui-fs-scale, 1)); }
.ag-bar { height: 7px; border-radius: 4px; background: rgba(127,127,127,.18); overflow: hidden; margin: 8px 0 12px; }
.ag-bar i { display: block; height: 100%; background: linear-gradient(90deg,#22d3ee,#34d399); transition: width .25s; }
.ag-card { border: 1px solid var(--glass-border); background: var(--glass-bg); border-radius: 16px; padding: 16px; }
.ag-tag { font-size: calc(12px * var(--ui-fs-scale, 1)); color: var(--accent); font-weight: 800; margin-bottom: 10px; }
.ag-prompt { font-size: calc(18px * var(--ui-fs-scale, 1)); line-height: 1.8; font-weight: 700; color: var(--text); }
.ag-options { display: grid; gap: 9px; margin-top: 14px; }
.ag-options.tf { grid-template-columns: 1fr 1fr; }
.ag-opt { display: flex; gap: 10px; align-items: flex-start; text-align: left; padding: 12px 13px; border-radius: 12px; border: 1px solid var(--glass-border); background: var(--surface); color: var(--text); font: inherit; font-size: calc(14px * var(--ui-fs-scale, 1)); line-height: 1.7; cursor: pointer; }
.ag-opt b { color: var(--accent); }
.ag-opt.right { border-color: #34d399; background: rgba(52,211,153,.12); }
.ag-opt.wrong { border-color: #fb7185; background: rgba(251,113,133,.12); }
.ag-feedback { margin-top: 14px; padding: 12px; border-radius: 12px; border: 1px solid var(--glass-border); }
.ag-feedback.ok { border-color: rgba(52,211,153,.45); }
.ag-feedback.bad { border-color: rgba(251,113,133,.45); }
.ag-fb-t { font-weight: 800; margin-bottom: 6px; }
.ag-fb-b { font-size: calc(13.5px * var(--ui-fs-scale, 1)); line-height: 1.8; }
.ag-fb-tip { color: #fbbf24; font-size: calc(12.5px * var(--ui-fs-scale, 1)); line-height: 1.7; margin: 7px 0 10px; }
.ag-result { text-align: center; padding: 20px 6px; }
.ag-medal { font-size: 58px; }
.ag-res-t { font-size: calc(20px * var(--ui-fs-scale, 1)); font-weight: 900; color: var(--accent); margin: 6px 0 14px; }
.ag-res-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; max-width: 620px; margin: 0 auto; }
.ag-res-grid > div { border: 1px solid var(--glass-border); border-radius: 10px; padding: 10px; }
.ag-res-grid b { display: block; font-size: calc(22px * var(--ui-fs-scale, 1)); color: #34d399; }
.ag-res-grid span { font-size: calc(11px * var(--ui-fs-scale, 1)); color: var(--text3); }
.ag-wrong-list { margin: 16px auto 0; max-width: 680px; text-align: left; color: var(--text2); font-size: calc(12.5px * var(--ui-fs-scale, 1)); line-height: 1.8; }
.ag-wrong-list span { display: inline-block; border: 1px solid rgba(251,113,133,.4); color: #fb7185; border-radius: 14px; padding: 1px 8px; margin: 2px 4px 2px 0; }
.ag-res-acts { display: flex; gap: 8px; justify-content: center; margin-top: 18px; flex-wrap: wrap; }
.ag-tip { color: var(--text3); font-size: calc(12px * var(--ui-fs-scale, 1)); }
@media (max-width: 640px) {
  .ag-pnl { width: 100%; height: 100dvh; max-height: 100dvh; border-radius: 0; padding: 10px 11px; }
  .ag-hero { align-items: flex-start; }
  .ag-res-grid { grid-template-columns: repeat(2, 1fr); }
  .ag-options.tf { grid-template-columns: 1fr; }
}
</style>
