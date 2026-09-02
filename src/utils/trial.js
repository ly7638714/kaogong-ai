// utils/trial.js —— 试用模式门禁（仅当构建时开启 VITE_TRIAL_MODE=true 才生效，正式构建完全不受影响）
// 配置来源：.env.trial（VITE_TRIAL_CODE 邀请码 / VITE_TRIAL_EXPIRES 到期时间）
// 说明：纯前端“软限制”——足够限制普通体验用户；到期后自动锁定，无法进入。
const CFG = {
  enabled: import.meta.env.VITE_TRIAL_MODE === 'true',
  code: String(import.meta.env.VITE_TRIAL_CODE || '').trim(),
  expires: String(import.meta.env.VITE_TRIAL_EXPIRES || '').trim()
}
const LS_KEY = 'xc_trial_unlocked_v1'

export function trialEnabled() {
  return CFG.enabled
}
function parseExpires() {
  if (!CFG.expires) return NaN
  const raw = String(CFG.expires)
  // ISO 带 T/时区 直接解析；纯日期 'YYYY-MM-DD' 做兼容替换
  const d = raw.includes('T') ? new Date(raw) : new Date(raw.replace(/-/g, '/'))
  return d.getTime()
}
export function trialExpiresText() {
  const t = parseExpires()
  if (!Number.isFinite(t)) return CFG.expires || ''
  const d = new Date(t)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
export function trialExpired() {
  if (!CFG.enabled || !CFG.expires) return false
  const t = parseExpires()
  return Number.isFinite(t) && Date.now() > t
}
export function trialLocked() {
  if (!CFG.enabled) return false
  if (trialExpired()) return true
  try { return localStorage.getItem(LS_KEY) !== '1' } catch (e) { return true }
}
export function trialUnlock(code) {
  if (!CFG.enabled) return { ok: true, reason: '' }
  if (trialExpired()) return { ok: false, reason: 'expired' }
  if (!CFG.code) {
    try { localStorage.setItem(LS_KEY, '1') } catch (e) {}
    return { ok: true, reason: '' }
  }
  if (String(code || '').trim() === CFG.code) {
    try { localStorage.setItem(LS_KEY, '1') } catch (e) {}
    return { ok: true, reason: '' }
  }
  return { ok: false, reason: 'badcode' }
}
