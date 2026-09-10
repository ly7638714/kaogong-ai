<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { buildDeck, makeQuestion, poolForSubject, GAME_SUBJECTS, GAME_LEVELS, GAME_MODES, loadGameWrong, saveGameWrong, loadGameStats, saveGameStats } from '../utils/accGame'
import { loadSrs, saveSrs, rememberOne, ymdKey } from '../utils/memorySrs'
import { addPoints as petAddPoints } from '../utils/pet'
import { showToast } from '../utils/toast'

const emit = defineEmits(['close'])
const screen = ref('start')
const subject = ref('all')
const mode = ref('camp')
const level = ref(1)
const deck = ref([])
const idx = ref(0)
const picked = ref('')
const revealed = ref(false)
const correctN = ref(0)
const wrongN = ref(0)
const score = ref(0)
const combo = ref(0)
const maxCombo = ref(0)
const hearts = ref(3)
const elapsed = ref(0)
const result = ref(null)
const retryN = ref(0)
const retryFixed = ref(0)
const mistakeTerms = ref(loadGameWrong())
const stats = ref(loadGameStats())
let timer = null
let autoNextTimer = null
const TOTAL_SECONDS = 60

const current = computed(() => deck.value[idx.value] || null)
const progressPct = computed(() => (deck.value.length ? Math.round(((idx.value + 1) / deck.value.length) * 100) : 0))
const remainSec = computed(() => Math.max(0, TOTAL_SECONDS - elapsed.value))
const levelName = computed(() => (GAME_LEVELS.find((x) => x.k === level.value) || GAME_LEVELS[0]).t)
const isFlash = computed(() => current.value && current.value.type === 'flash')

function clearTimer() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  if (autoNextTimer) {
    clearTimeout(autoNextTimer)
    autoNextTimer = null
  }
}
function dueTermsForCurrentSubject() {
  const srs = loadSrs()
  const today = ymdKey()
  return Object.keys(srs)
    .filter((key) => srs[key] && (!srs[key].due || srs[key].due <= today))
    .map((key) => key.slice(key.lastIndexOf('|') + 1))
}
function start() {
  const isRapid = mode.value === 'rapid'
  const isWrong = mode.value === 'wrong'
  const isSrs = mode.value === 'srs'
  const isCamp = mode.value === 'camp'
  const n = isRapid ? 80 : isWrong ? Math.max(6, Math.min(20, mistakeTerms.value.length || 8)) : isCamp ? 20 : 10
  let lv = isRapid || isWrong || isSrs ? 4 : level.value
  let forceType = ''
  if (isCamp) lv = 'camp'
  if (mode.value === 'flash') {
    lv = 1
    forceType = 'flash'
  }
  if (mode.value === 'contrast') {
    lv = 3
    forceType = 'discrimination'
  }
  const dueTerms = isSrs ? dueTermsForCurrentSubject() : []
  if (isSrs && !dueTerms.length) {
    showToast('今天没有到期的记忆词条，先做一组主动回忆巩固也不错', 'info')
    forceType = 'flash'
    lv = 1
  }
  const d = buildDeck(subject.value, lv, n, {
    wrongTerms: isWrong ? mistakeTerms.value : [],
    dueTerms,
    forceType
  })
  if (!d.length) {
    showToast('当前分类词条不足，先换一个分类试试', 'info')
    return
  }
  deck.value = d
  idx.value = 0
  picked.value = ''
  revealed.value = false
  correctN.value = 0
  wrongN.value = 0
  score.value = 0
  combo.value = 0
  maxCombo.value = 0
  hearts.value = isRapid ? 5 : 3
  elapsed.value = 0
  result.value = null
  retryN.value = 0
  retryFixed.value = 0
  screen.value = 'play'
  clearTimer()
  timer = setInterval(() => {
    elapsed.value++
    if (isRapid && remainSec.value <= 0) finish()
  }, 1000)
  focusKey()
}
function focusKey() {
  try {
    window.focus()
  } catch (e) {}
}
function mark(ok) {
  const q = current.value
  if (!q) return
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
  if (q.retry) {
    retryN.value++
    if (ok) retryFixed.value++
  }
  saveGameWrong(mistakeTerms.value)
  const srs = loadSrs()
  rememberOne(srs, q.item.subject || subject.value, q.term, ok, ymdKey())
  saveSrs(srs)
  if (mode.value === 'rapid') autoNextTimer = setTimeout(() => next(), ok ? 260 : 620)
}
function answer(k) {
  const q = current.value
  if (!q || picked.value || q.type === 'flash') return
  picked.value = k
  const ok = k === q.answer
  mark(ok)
}
function reveal() {
  if (isFlash.value) revealed.value = true
}
function selfRate(rating) {
  if (!isFlash.value || !revealed.value || picked.value) return
  picked.value = rating
  mark(rating === 'know')
}
function queueRetry() {
  const q = current.value
  if (!q || q.retry || mode.value === 'rapid' || deck.value.length >= 36) return
  if (deck.value.some((x) => x.retry && x.term === q.term)) return
  const pool = poolForSubject(subject.value)
  const retry = makeQuestion(q.item, pool, 4, 0, Math.random, q.type === 'meaning2term' ? 'fill' : 'meaning2term')
  retry.retry = true
  retry.tag = '错误回炉 · ' + retry.tag
  retry.science = '错误回炉：在短间隔后用另一种题型重新提取，修正错误记忆'
  const at = Math.min(idx.value + 3, deck.value.length)
  deck.value.splice(at, 0, retry)
}
function next() {
  if (!picked.value) return
  const wasCorrect = picked.value === current.value.answer || picked.value === 'know'
  if (!wasCorrect) queueRetry()
  if (hearts.value <= 0) {
    finish()
    return
  }
  if (idx.value >= deck.value.length - 1) {
    finish()
    return
  }
  idx.value++
  picked.value = ''
  revealed.value = false
}
function finish() {
  if (screen.value !== 'play') return
  clearTimer()
  const total = correctN.value + wrongN.value
  const acc = total ? Math.round((correctN.value / total) * 100) : 0
  const memoryScore = Math.max(0, Math.min(100, Math.round(acc * 0.75 + Math.min(maxCombo.value, 8) * 3 - retryN.value * 4)))
  const strategies = Array.from(new Set(deck.value.map((q) => q.science).filter(Boolean))).slice(0, 4)
  result.value = { total, acc, score: score.value, maxCombo: maxCombo.value, elapsed: elapsed.value, passed: hearts.value > 0 && acc >= 60, retryN: retryN.value, retryFixed: retryFixed.value, strategies, memoryScore }
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
function again() {
  screen.value = 'start'
  result.value = null
  clearTimer()
}
function onKey(e) {
  if (screen.value !== 'play') return
  if (picked.value) {
    if (e.key === 'Enter') next()
    if (e.key === 'Escape') emit('close')
    return
  }
  if (isFlash.value) {
    if (!revealed.value && (e.key === 'Enter' || e.key === ' ')) reveal()
    else if (revealed.value && ['1', '2', '3'].includes(e.key)) selfRate(['forgot', 'fuzzy', 'know'][Number(e.key) - 1])
    if (e.key === 'Escape') emit('close')
    return
  }
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
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  clearTimer()
})
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
          <div class="ag-hero-i">🔬</div>
          <div>
            <div class="ag-hero-t">把“看过”练成真正记得住、调得出</div>
            <div class="ag-hero-s">主动回忆、提取练习、交错辨析、错误回炉、间隔复习五条记忆链组合训练。每一次作答都会同步进艾宾浩斯排期。</div>
          </div>
        </div>
        <div class="ag-science">
          <span>🧠 主动回忆：先想再看</span>
          <span>⚡ 提取练习：看义找词</span>
          <span>🧩 交错练习：易混词强制辨析</span>
          <span>🔁 错误回炉：错题换题型重现</span>
          <span>⏳ 间隔复习：到期优先</span>
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
          <div v-if="isFlash" class="ag-flash">
            <div class="ag-flash-term">{{ current.term }}</div>
            <div class="ag-flash-hint">先在心里说出它的含义、感情色彩和常见搭配</div>
            <button v-if="!revealed" class="btn btn-pri ag-reveal" @click="reveal()">翻面核对答案</button>
            <template v-else>
              <div class="ag-flash-answer">{{ current.explain }}</div>
              <div v-if="current.tip" class="ag-fb-tip">💡 {{ current.tip }}</div>
              <div class="ag-self">
                <button class="ag-self-btn forgot" :class="{ on: picked === 'forgot' }" @click="selfRate('forgot')">😵 忘了</button>
                <button class="ag-self-btn fuzzy" :class="{ on: picked === 'fuzzy' }" @click="selfRate('fuzzy')">🤔 模糊</button>
                <button class="ag-self-btn know" :class="{ on: picked === 'know' }" @click="selfRate('know')">✅ 记住</button>
              </div>
            </template>
          </div>
          <template v-else>
            <div class="ag-prompt">{{ current.prompt }}</div>
            <div class="ag-options" :class="{ tf: current.options.length === 2 }">
              <button v-for="o in current.options" :key="o.k" class="ag-opt" :class="{ picked: picked === o.k, right: picked && o.ok, wrong: picked && picked === o.k && !o.ok }" :disabled="!!picked" @click="answer(o.k)">
                <b>{{ o.k }}</b><span>{{ o.t }}</span>
              </button>
            </div>
          </template>
          <div v-if="current.science" class="ag-science-note">🧪 {{ current.science }}</div>
          <div v-if="picked && !isFlash" class="ag-feedback" :class="picked === current.answer ? 'ok' : 'bad'">
            <div class="ag-fb-t">{{ picked === current.answer ? '✅ 答对了' : '❌ 正确答案：' + current.answer }}</div>
            <div class="ag-fb-b">{{ current.explain }}</div>
            <div v-if="current.tip" class="ag-fb-tip">💡 {{ current.tip }}</div>
            <button v-if="mode !== 'rapid'" class="btn btn-pri" @click="next()">{{ idx >= deck.length - 1 ? '查看成绩' : '下一题' }}</button>
            <span v-else class="ag-tip">自动进入下一题…</span>
          </div>
          <div v-if="picked && isFlash" class="ag-feedback" :class="picked === 'know' ? 'ok' : 'bad'">
            <div class="ag-fb-t">{{ picked === 'know' ? '✅ 已记为记住' : picked === 'fuzzy' ? '🟡 已记为模糊，会更快再出现' : '❌ 已进入回炉队列' }}</div>
            <button class="btn btn-pri" @click="next()">{{ idx >= deck.length - 1 ? '查看成绩' : '下一题' }}</button>
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
        <div class="ag-strategy-res">
          <div class="ag-memory-score">🧠 本局记忆强度 <b>{{ result.memoryScore }}</b> / 100</div>
          <b>本局训练策略</b>
          <span v-for="s in result.strategies" :key="s">{{ s }}</span>
        </div>
        <div v-if="result.retryN" class="ag-retry-res">🔁 错误回炉 {{ result.retryN }} 次，其中当场修正 {{ result.retryFixed }} 次</div>
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
.ag-science { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
.ag-science span { border: 1px solid rgba(34,211,238,.32); background: rgba(34,211,238,.08); color: var(--text2); border-radius: 14px; padding: 3px 9px; font-size: calc(11.5px * var(--ui-fs-scale, 1)); }
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
.ag-flash { text-align: center; padding: 16px 6px 8px; }
.ag-flash-term { font-size: calc(34px * var(--ui-fs-scale, 1)); line-height: 1.25; font-weight: 900; color: var(--accent); letter-spacing: .04em; }
.ag-flash-hint { color: var(--text3); font-size: calc(12.5px * var(--ui-fs-scale, 1)); margin: 9px 0 16px; }
.ag-reveal { padding: 9px 22px; }
.ag-flash-answer { margin: 8px auto 0; max-width: 680px; padding: 13px; border-radius: 12px; background: rgba(52,211,153,.08); border: 1px solid rgba(52,211,153,.3); text-align: left; font-size: calc(15px * var(--ui-fs-scale, 1)); line-height: 1.85; }
.ag-self { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-top: 14px; }
.ag-self-btn { border: 1px solid var(--glass-border); background: var(--glass-bg); color: var(--text); border-radius: 10px; padding: 8px 15px; font: inherit; font-size: calc(13px * var(--ui-fs-scale, 1)); cursor: pointer; }
.ag-self-btn.forgot.on { border-color: #fb7185; color: #fb7185; background: rgba(251,113,133,.12); }
.ag-self-btn.fuzzy.on { border-color: #fbbf24; color: #fbbf24; background: rgba(251,191,36,.12); }
.ag-self-btn.know.on { border-color: #34d399; color: #34d399; background: rgba(52,211,153,.12); }
.ag-science-note { margin-top: 11px; color: var(--text3); font-size: calc(11.5px * var(--ui-fs-scale, 1)); line-height: 1.6; }
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
.ag-strategy-res { max-width: 680px; margin: 13px auto 0; color: var(--text2); font-size: calc(12px * var(--ui-fs-scale, 1)); }
.ag-memory-score { margin-bottom: 10px; color: var(--text); }
.ag-memory-score b { color: #34d399; font-size: calc(17px * var(--ui-fs-scale, 1)); }
.ag-strategy-res b { display: block; margin-bottom: 6px; }
.ag-strategy-res span { display: inline-block; margin: 2px 5px 2px 0; padding: 2px 8px; border-radius: 12px; border: 1px solid rgba(34,211,238,.32); background: rgba(34,211,238,.08); }
.ag-retry-res { margin-top: 9px; color: #fbbf24; font-size: calc(12px * var(--ui-fs-scale, 1)); }
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
