// dailyPlan.js —— 今日目标 / 周完成（v3.8.189，纯函数）
import { ymdKey } from './memorySrs'
const DAY = 86400000
export const DEFAULT_PLAN = { quiz: 10, review: 5, minutes: 30 }
export function ymdOf(ms) { try { return ymdKey(new Date(Number(ms) || Date.now())) } catch (e) { return '' } }
export function todayProgress({ attempts = [], wqs = [], study = {} } = {}) {
  const today = ymdKey()
  const q = (attempts || []).filter((a) => a && ymdOf(a.t) === today).length
  const rev = (wqs || []).filter((x) => x && x.reviewedAt && ymdOf(x.reviewedAt) === today).length
  const minutes = Math.round((Number(study[today]) || 0) / 60)
  const due = (wqs || []).filter((x) => x && x.digested && Number(x.dueAt) > 0 && Number(x.dueAt) <= Date.now()).length
  return { q, rev, minutes, due }
}
export function planStatus(cfg, p) {
  const g = Object.assign({}, DEFAULT_PLAN, cfg || {})
  const item = (done, goal) => ({ done, goal: Number(goal) || 0, pct: Number(goal) > 0 ? Math.min(100, Math.round((done / Number(goal)) * 100)) : 100 })
  const items = { quiz: item(p.q, g.quiz), review: item(p.rev, g.review), minutes: item(p.minutes, g.minutes) }
  const keys = Object.keys(items)
  const allDone = keys.every((k) => items[k].done >= items[k].goal)
  const pct = Math.round(keys.reduce((s, k) => s + items[k].pct, 0) / keys.length)
  return { items, allDone, pct }
}
export const MORNING_KEY = 'xc_morning_done'
function ymd() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
export function markMorningDone() { try { localStorage.setItem(MORNING_KEY, ymd()); window.dispatchEvent(new CustomEvent('xc-morning')) } catch (e) {} }
export function morningDoneToday() { try { return localStorage.getItem(MORNING_KEY) === ymd() } catch (e) { return false } }
export function weekMini({ attempts = [], wqs = [], study = {} } = {}) {
  const out = []
  for (let d = 6; d >= 0; d--) {
    const key = ymdKey(new Date(Date.now() - d * DAY))
    const q = (attempts || []).filter((a) => a && ymdOf(a.t) === key).length
    const r = (wqs || []).filter((x) => x && x.reviewedAt && ymdOf(x.reviewedAt) === key).length
    const min = Math.round((Number(study[key]) || 0) / 60)
    out.push({ key, q, r, min, total: q + r, label: d === 0 ? '今' : String(new Date(key).getDate()) })
  }
  return out
}
