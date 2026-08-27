<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { store, saveWqs } from '../store'
import { activeCfg, chatOnce, buildQuizSys } from '../api'
import { parseQuiz } from '../utils/quiz'
import { showToast } from '../utils/toast'

const emit = defineEmits(['close'])
const PLATES = ['判断推理', '言语理解', '资料分析', '数量关系', '常识判断', '政治理论', '图形推理', '类比推理', '定义判断']
const plate = ref('判断推理')
const count = ref(5)
const perQ = ref(90)
const difficulty = ref('mid')

const phase = ref('config') // config | doing | result
const questions = ref([]) // { stem, options, answer, explain, picked, correct, err }
const cur = ref(-1)
const left = ref(0)
const busy = ref(false)
const startAt = ref(0)
let timer = null

const fmt = (s) => {
  const m = Math.floor(Math.max(0, s) / 60)
  const ss = Math.max(0, s) % 60
  return String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0')
}
const curQ = computed(() => (cur.value >= 0 && questions.value[cur.value] ? questions.value[cur.value] : null))
const score = computed(() => questions.value.filter((q) => q.correct).length)

function start() {
  questions.value = []
  cur.value = -1
  phase.value = 'doing'
  startAt.value = Date.now()
  left.value = count.value * perQ.value
  if (timer) clearInterval(timer)
  timer = setInterval(() => {
    left.value--
    if (left.value <= 0) finish()
  }, 1000)
  next()
}
async function gen(i) {
  const c = activeCfg(false)
  if (!c || !c.key) {
    showToast('请先在设置配置文字模型 API Key', 'error')
    cancel()
    return
  }
  busy.value = true
  try {
    const sys = buildQuizSys({ plate: plate.value, difficulty: difficulty.value })
    const reply = await chatOnce(
      c,
      [{ role: 'system', content: sys }, { role: 'user', content: '请为【' + plate.value + '】出一道仿真模拟题。' }],
      1600
    )
    const q = parseQuiz(reply)
    if (q) questions.value[i] = { ...q, picked: null }
    else questions.value[i] = { err: true, stem: '（本题目 AI 生成格式异常，已跳过）', options: [], answer: '', explain: '', picked: null }
  } catch (e) {
    questions.value[i] = { err: true, stem: '（出题失败：' + e.message + '）', options: [], answer: '', explain: '', picked: null }
  }
  busy.value = false
}
function next() {
  const i = cur.value + 1
  if (i >= count.value) {
    finish()
    return
  }
  cur.value = i
  if (!questions.value[i]) gen(i)
}
function pick(k) {
  const q = curQ.value
  if (!q || q.picked != null || q.err) return
  q.picked = k
  q.correct = k === q.answer
}
function finish() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  // 未作答按错计
  questions.value.forEach((q) => {
    if (q.picked == null) {
      q.picked = ''
      q.correct = false
    }
  })
  phase.value = 'result'
}
const usedSec = computed(() => Math.round((Date.now() - startAt.value) / 1000))
const rate = computed(() => (count.value ? Math.round((score.value / count.value) * 100) : 0))
function saveWrongs() {
  const wrongs = questions.value.filter((q) => q.picked !== '' && !q.correct)
  if (!wrongs.length) {
    showToast('本次没有错题 🎉', 'success')
    return
  }
  wrongs.forEach((q) => {
    store.wqs.unshift({
      id: Date.now() + Math.random(),
      subject: plate.value,
      question: q.stem + '\n\n' + (q.options || []).map((o) => o.k + '. ' + o.t).join('\n'),
      answer: '正确答案 ' + q.answer + '（我选了' + (q.picked || '未选') + '）',
      reasons: ['整卷模拟作答失误'],
      time: new Date().toLocaleString(),
      at: Date.now(),
      wrongCount: 1,
      correctStreak: 0,
      mastery: 0,
      digested: false
    })
  })
  saveWqs()
  showToast('✅ 已存入错题本 ' + wrongs.length + ' 题', 'success')
}
function cancel() {
  if (timer) clearInterval(timer)
  timer = null
  emit('close')
}
function topBack() { if (phase.value === 'doing') replay(); else cancel() }
function replay() {
  phase.value = 'config'
  questions.value = []
  cur.value = -1
}
onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div class="ov show sim-ov" @click.self="cancel()">
    <div class="pnl sim-pnl">
      <div class="pnl-top">
        <button class="pnl-top-b" title="返回上一层（也可按 Esc / 浏览器返回）" @click="topBack()">← 返回</button>
        <span class="pnl-top-t">{{ phase === 'result' ? '📄 成绩单' : phase === 'doing' ? '📝 作答中 · ' + plate : '📝 整卷模拟' }}</span>
      </div>
      <!-- 配置 -->
      <div v-if="phase === 'config'" class="sim-config">
        <div class="fld"><label>板块</label><select v-model="plate"><option v-for="p in PLATES" :key="p" :value="p">{{ p }}</option></select></div>
        <div class="fld"><label>题数</label><select v-model="count"><option :value="5">5 题（约 7.5 分钟）</option><option :value="10">10 题（约 15 分钟）</option></select></div>
        <div class="fld"><label>每题限时</label><select v-model="perQ"><option :value="60">60 秒</option><option :value="90">90 秒</option><option :value="120">120 秒</option></select></div>
        <div class="fld"><label>难度</label><select v-model="difficulty"><option value="easy">易</option><option value="mid">中</option><option value="hard">难</option><option value="real">真题级</option></select></div>
        <div class="sim-tip">AI 逐题生成仿真单选题（命题专家模式：考点先行·干扰项错因·难度自检），整卷倒计时，交卷自动批改并支持错题入库。</div>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="cancel()">取消</button>
          <button class="btn btn-pri" @click="start()">🚀 开始考试</button>
        </div>
      </div>

      <!-- 作答 -->
      <div v-else-if="phase === 'doing'" class="sim-doing">
        <div class="sim-head">
          <span class="sim-plate">📐 {{ plate }}</span>
          <span class="sim-prog">第 {{ cur + 1 }} / {{ count }} 题</span>
          <span class="sim-timer" :class="{ warn: left <= 30 }">⏱ {{ fmt(left) }}</span>
        </div>
        <div v-if="!curQ || busy" class="sim-loading"><span class="spin"></span> AI 正在出题…</div>
        <template v-else>
          <div class="sim-q" v-html="curQ.stem"></div>
          <div v-if="curQ.err" class="sim-err">⚠️ {{ curQ.stem }} <button class="btn btn-gh" @click="gen(cur)">↻ 重出</button></div>
          <div v-else class="quiz-opts">
            <button
              v-for="o in curQ.options"
              :key="o.k"
              class="quiz-opt"
              :class="{ picked: curQ.picked === o.k, right: curQ.picked != null && o.k === curQ.answer, wrong: curQ.picked === o.k && o.k !== curQ.answer }"
              :disabled="curQ.picked != null"
              @click="pick(o.k)"
            >
              <span class="qk">{{ o.k }}</span><span class="qt">{{ o.t }}</span>
            </button>
          </div>
          <div v-if="curQ.picked != null" class="quiz-result" :class="curQ.correct ? 'ok' : 'no'">
            {{ curQ.correct ? '✅ 回答正确' : '❌ 回答错误，正确答案 ' + curQ.answer }}
          </div>
          <div v-if="curQ.picked != null && curQ.explain" class="sim-explain" v-html="curQ.explain"></div>
          <div class="pnl-btns">
            <button class="btn btn-gh" title="返回考试配置" @click="replay()">← 返回配置</button>
            <button class="btn btn-gh" @click="cancel()">退出</button>
            <button v-if="curQ.picked != null || curQ.err" class="btn btn-pri" @click="next()">{{ cur + 1 >= count ? '交卷 📄' : '下一题 ▶' }}</button>
          </div>
        </template>
      </div>

      <!-- 成绩单 -->
      <div v-else class="sim-result">
        <div class="sr-score">{{ score }} / {{ count }}</div>
        <div class="sr-rate">{{ rate }}%</div>
        <div class="sr-meta">用时 {{ fmt(usedSec) }} · 正确率 {{ rate }}%</div>
        <div class="sr-list">
          <div v-for="(q, i) in questions" :key="i" class="sr-item">
            <span class="sr-mark" :class="q.correct ? 'ok' : 'no'">{{ q.correct ? '✓' : '✗' }}</span>
            <span class="sr-t">{{ q.stem.slice(0, 60) }}</span>
          </div>
        </div>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="replay()">🔁 再来一卷</button>
          <button class="btn btn-gh" @click="saveWrongs()">📌 错题入库</button>
          <button class="btn btn-pri" @click="cancel()">完成</button>
        </div>
      </div>
    </div>
  </div>
</template>
