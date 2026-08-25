// ===== 学习时长统计：页面可见且用户活跃时每 30s 累计 =====
import { ref } from 'vue'
const KEY = 'xc_study'
export const studyTick = ref(0) // 心跳计数：驱动看板/统计的时长刷新
let timer = null
let lastActive = Date.now()
function bump() {
  lastActive = Date.now()
}
function todayKey() {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
function getStudy() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {}
  } catch (e) {
    return {}
  }
}
export function todaySeconds() {
  return getStudy()[todayKey()] || 0
}
export function totalSeconds() {
  const s = getStudy()
  return Object.values(s).reduce((a, b) => a + (Number(b) || 0), 0)
}
export function startStudyTrack() {
  if (timer) return
  bump()
  window.addEventListener('mousemove', bump)
  window.addEventListener('keydown', bump)
  window.addEventListener('touchstart', bump)
  timer = setInterval(() => {
    if (document.visibilityState === 'visible' && Date.now() - lastActive < 5 * 60000) {
      const s = getStudy()
      const k = todayKey()
      s[k] = (s[k] || 0) + 30
      try {
        localStorage.setItem(KEY, JSON.stringify(s))
      } catch (e) {}
    }
    studyTick.value++
  }, 30000)
}
export function stopStudyTrack() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  window.removeEventListener('mousemove', bump)
  window.removeEventListener('keydown', bump)
  window.removeEventListener('touchstart', bump)
}
export function fmtMin(sec) {
  return Math.round((Number(sec) || 0) / 60)
}
