const CHECKIN_KEY = 'xc_checkins'
const LEGACY_KEY = 'xc_streak'

export function dateKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return ''
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

export function shiftDateKey(key, days) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''))
  if (!m) return ''
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  d.setDate(d.getDate() + Number(days || 0))
  return dateKey(d)
}

function validDateKey(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && shiftDateKey(v, 0) === String(v)
}

export function normalizeCheckinState(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const dates = Array.from(new Set((Array.isArray(src.dates) ? src.dates : []).filter(validDateKey))).sort().slice(-400)
  const last = validDateKey(src.last) ? src.last : (dates[dates.length - 1] || '')
  const streak = Math.max(0, Number(src.streak) || 0)
  const total = Math.max(streak, dates.length, Number(src.total) || 0)
  return { dates, streak, last, total }
}

function parseJSON(storage, key, fallback) {
  try { return JSON.parse(storage.getItem(key) || JSON.stringify(fallback)) } catch (e) { return fallback }
}

export function loadCheckinState(storage = globalThis.localStorage, now = new Date()) {
  const saved = parseJSON(storage, CHECKIN_KEY, null)
  if (saved && typeof saved === 'object') return normalizeCheckinState(saved)
  const legacy = parseJSON(storage, LEGACY_KEY, {})
  const state = normalizeCheckinState({ dates: legacy && legacy.d ? [legacy.d] : [], streak: legacy && legacy.n, last: legacy && legacy.d, total: legacy && legacy.n })
  const streak = currentStreak(state, now)
  return streak === state.streak ? state : Object.assign({}, state, { streak })
}

export function currentStreak(state, now = new Date()) {
  const s = normalizeCheckinState(state)
  const today = dateKey(now)
  if (s.last !== today && s.last !== shiftDateKey(today, -1)) return 0
  return s.streak || (s.last ? 1 : 0)
}

export function checkInToday(storage = globalThis.localStorage, now = new Date()) {
  const s = loadCheckinState(storage, now)
  const today = dateKey(now)
  if (!today) return { state: s, added: false }
  if (s.last === today || s.dates.includes(today)) {
    return { state: normalizeCheckinState(Object.assign({}, s, { streak: Math.max(1, s.streak), last: today })), added: false }
  }
  const yesterday = shiftDateKey(today, -1)
  const streak = s.last === yesterday ? Math.max(1, s.streak + 1) : 1
  const dates = s.dates.concat(today).sort().slice(-400)
  const state = normalizeCheckinState({ dates, streak, last: today, total: Math.max(s.total, s.dates.length) + 1 })
  try { storage.setItem(CHECKIN_KEY, JSON.stringify(state)) } catch (e) {}
  return { state, added: true }
}

export function checkinWeek(state, now = new Date()) {
  const s = normalizeCheckinState(state)
  const done = new Set(s.dates)
  const today = dateKey(now)
  const out = []
  for (let i = 6; i >= 0; i--) {
    const key = shiftDateKey(today, -i)
    const d = new Date(key + 'T12:00:00')
    out.push({ key, label: ['日', '一', '二', '三', '四', '五', '六'][d.getDay()] || '', done: done.has(key), today: key === today })
  }
  return out
}

