// 考场计时（考场限时）单例共享状态
// 原本计时状态写在 ChatPage.vue 局部，导致只能显示在对话输入框旁边。
// 现抽到单例 composable，让「萌宠悬浮条」也能控制开关、展示实时倒计时，
// 对话输入区保持清爽（参照 v3.8.31x：计时关移到萌宠常用悬浮）。
import { ref, computed } from 'vue'
import { store, saveCfg } from '../store'

// —— 单例响应式状态（跨组件共享）——
const left = ref(60) // 剩余秒数
const runSec = ref(0) // 实际已走秒数（供耗时统计）
const limitShow = ref(60) // 模板展示的限时（秒）
let limitSec = 60 // 本次限时（秒）
let stopTimer = null

// 考场计时开关：直接读写 store.cfg.examMode（持久化）
const examMode = computed({
  get: () => !!store.cfg.examMode,
  set: (v) => {
    store.cfg.examMode = !!v
    saveCfg()
  }
})

// 估算问题中的问数（按问号，至少 1）
function countQuestions(txt) {
  const t = String(txt || '')
  const m = (t.match(/[?？]/g) || []).length
  return Math.max(1, m)
}

function startStopwatch(limit) {
  limitSec = Math.max(1, limit || 60)
  limitShow.value = limitSec
  left.value = limitSec
  runSec.value = 0
  if (stopTimer) clearInterval(stopTimer)
  stopTimer = setInterval(() => {
    runSec.value++
    left.value = Math.max(0, left.value - 1)
    if (left.value <= 0 && stopTimer) {
      clearInterval(stopTimer)
      stopTimer = null
    }
  }, 1000)
}

function stopStopwatch() {
  if (stopTimer) {
    clearInterval(stopTimer)
    stopTimer = null
  }
}

// 评估本题用时：返回是否超时与超时秒数
function assessTime() {
  const used = runSec.value
  const over = Math.max(0, used - limitSec)
  return { used, limit: limitSec, over, ok: over === 0 }
}

function fmtSec(s) {
  const m = Math.floor(s / 60)
  const ss = s % 60
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

// 重置展示（开启计时但未发题时，避免显示上一次遗留的 00:00）
function resetTimer() {
  stopStopwatch()
  left.value = 60
  limitShow.value = 60
  runSec.value = 0
}

function setExamMode(v) {
  const nv = !!v
  if (nv) resetTimer()
  else stopStopwatch()
  examMode.value = nv
}

function toggleExamTimer() {
  setExamMode(!examMode.value)
}

export function useExamTimer() {
  return {
    examMode,
    left,
    runSec,
    limitShow,
    countQuestions,
    startStopwatch,
    stopStopwatch,
    assessTime,
    fmtSec,
    resetTimer,
    setExamMode,
    toggleExamTimer
  }
}
