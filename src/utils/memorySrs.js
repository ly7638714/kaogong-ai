// memorySrs.js —— 记忆卡 SRS（R「今日复习中枢」，与 FloatPanel 同 schema 写入 xc_srs）
// key = `cat|title`，值 { lvl, due, last }，due/last 均 YYYY-MM-DD；间隔 1/2/4/7/15/30 天
export const SRS_INT = [1, 2, 4, 7, 15, 30]
const KEY = 'xc_srs'
function p2(n) { return String(n).padStart(2, '0') }
export function ymdKey(d) {
  const x = d || new Date()
  return x.getFullYear() + '-' + p2(x.getMonth() + 1) + '-' + p2(x.getDate())
}
export function addDaysKey(key, n) {
  const d = new Date(key)
  d.setDate(d.getDate() + n)
  return ymdKey(d)
}
export function loadSrs() {
  try {
    const v = localStorage.getItem(KEY)
    return v ? JSON.parse(v) : {}
  } catch (e) {
    return {}
  }
}
export function saveSrs(srs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(srs || {}))
    window.dispatchEvent(new CustomEvent('xc-srs'))
  } catch (e) {}
}
// 已学且到期的记忆项（xc_srs 有记录 && due<=today）；未学新词条仍走积累页学习流程
export function dueMemoryItems(srs, today) {
  const out = []
  const td = String(today || ymdKey())
  Object.keys(srs || {}).forEach((k) => {
    const s = srs[k]
    if (!s || !s.due || String(s.due) > td) return
    const i = k.lastIndexOf('|')
    out.push({ key: k, cat: i > 0 ? k.slice(0, i) : '常识', title: i > 0 ? k.slice(i + 1) : k, due: s.due, lvl: Number(s.lvl) || 0 })
  })
  return out.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0))
}
export function rememberOne(srs, cat, title, ok, today) {
  const td = String(today || ymdKey())
  const key = cat + '|' + title
  const s = Object.assign({ lvl: 0, due: td }, (srs && srs[key]) || {})
  if (ok) {
    s.lvl = Math.min(SRS_INT.length, (s.lvl || 0) + 1)
    s.due = addDaysKey(td, SRS_INT[Math.min(Math.max(0, s.lvl - 1), SRS_INT.length - 1)])
  } else {
    s.lvl = 0
    s.due = addDaysKey(td, 1)
  }
  s.last = td
  srs[key] = s
  return { srs, key, due: s.due, lvl: s.lvl }
}
// 错题一键入记忆（R5 二期）：以 cat='我的错题' 写入，今天到期进入中枢复习队列
export function enqueueNew(srs, cat, title, today) {
  const td = String(today || ymdKey())
  const key = cat + '|' + String(title || '').trim()
  if (!title) return { srs, key: null }
  srs[key] = { lvl: 0, due: td, last: td }
  return { srs, key }
}
// 学新词条（v3.8.197）：从中枢「学新」列出尚未进入 xc_srs 的词条（按分类/限量）
export function freshPoolItems(poolItems, srs, cat, limit = 8) {
  const out = []
  ;(poolItems || []).forEach((it) => {
    if (!it || !it.t) return
    const c = String(it.pool || '')
    if (cat && c !== cat) return
    const key = c + '|' + it.t
    if (srs && srs[key]) return
    out.push({ cat: c, title: it.t, key, extra: it })
  })
  return out.slice(0, Math.max(1, Number(limit) || 8))
}
