// elo.js —— 单人纵向能力值 θ（35号执行说明书·批次4-A，灰度引擎，默认不上 UI）
// 对齐 doc 35 §4：θ 按「考点」存（attempt.kpoint），样本不足向板块基线收缩；
// E = 1/(1+10^((b-θ)/400))，s = ok?1:0，用时>该板块中位数×1.8 答对按 0.75（时间折价）；
// θ' = θ + Kθ·(s-E)，Kθ = 32/(1+nθ/50)；b 用难度档折算锚定值（easy/mid/hard/real）；
// 30 天向先验收缩 5% 防纵向漂移（§3.3）。
// ⚠️ 批次4 需累计 200+ 次作答才有统计意义（doc §4 开头即言明灰度）→ 本模块默认不接任何 UI，
//    只用单元测试与模拟序列验证收敛/不漂移，待真实数据到位再经 attemptLog 层启用。
import { readAttempts } from './attemptLog'

export const THETA0 = 1000
export const TIME_RATIO = 1.8
export const S_SLOW = 0.75
const K_BASE = 32
const K_DENOM = 50
export const KEY_SHRINK = 8
export const DRIFT_PULL = 0.05
export const DRIFT_MS = 30 * 86400000
export const DIFF_B = { easy: -60, mid: 0, hard: 60, real: 90 }

// 时间折价：答对但用时显著超板块常态 → s=0.75
function scored(ok, usedSec, medianSec) {
  if (!ok) return 0
  const u = Number(usedSec) > 0 ? Number(usedSec) : 0
  if (u > 0 && medianSec > 0 && u > TIME_RATIO * medianSec) return S_SLOW
  return 1
}
function medianOf(arr) {
  if (!arr.length) return 0
  const s = arr.slice().sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

// 把作答事件流按考点重放为 Elo 序列（纯函数不写库）
export function replayElo(attempts) {
  const list = (attempts || []).slice().sort((a, b) => (a.t || 0) - (b.t || 0))
  const usedByPlate = {}
  list.forEach((a) => { const pl = String(a.plate || '未分类'); (usedByPlate[pl] = usedByPlate[pl] || []).push(Number(a.usedSec) > 0 ? Number(a.usedSec) : null) })
  const medCache = {}
  Object.keys(usedByPlate).forEach((pl) => { medCache[pl] = medianOf(usedByPlate[pl].filter((x) => x != null)) })
  const plate = {}
  const kp = {}
  list.forEach((a) => {
    const pl = String(a.plate || '未分类')
    const key = String(a.kpoint || '').trim() || (pl + '·综合')
    const p = plate[pl] || (plate[pl] = { n: 0, ok: 0, last: 0, secSum: 0 })
    const k = kp[key] || (kp[key] = { θ: THETA0, n: 0, ok: 0, last: 0 })
    p.n++; k.n++
    if (a.ok) { p.ok++; k.ok++ }
    p.secSum += Number(a.usedSec) > 0 ? Number(a.usedSec) : 0
    const s = scored(!!a.ok, a.usedSec, medCache[pl])
    const b = THETA0 + (DIFF_B[a.reqDiff] || 0)
    const E = 1 / (1 + Math.pow(10, (b - k.θ) / 400))
    const K = K_BASE / (1 + k.n / K_DENOM)
    k.θ = k.θ + K * (s - E)
    k.last = a.t || 0
    p.last = Math.max(p.last, k.last || 0)
  })
  const now = Date.now()
  const res = { plates: {}, kpoints: {} }
  Object.keys(plate).forEach((pl) => {
    const p = plate[pl]
    const rate = p.n ? p.ok / p.n : 0.5
    const raw = (rate - 0.5) * 400 + THETA0
    // 30 天向先验收缩 5%（p.n≥200 认为样本足够稳定，不再拉偏）
    const age = p.last ? Math.min(1, (now - p.last) / DRIFT_MS) : 0
    const pull = age * (p.n >= 200 ? 0 : DRIFT_PULL)
    const θ = raw + (THETA0 - raw) * pull
    res.plates[pl] = { n: p.n, ok: p.ok, rate: Math.round(rate * 1000) / 10, θ, base: θ }
  })
  Object.keys(kp).forEach((key) => {
    const k = kp[key]
    const pl = key.includes('·') ? key.slice(0, key.indexOf('·')) : String(key).split('|')[0]
    const pb = res.plates[pl] ? res.plates[pl].base : THETA0
    const w = KEY_SHRINK / (k.n + KEY_SHRINK)
    res.kpoints[key] = { θ: k.θ * (1 - w) + pb * w, n: k.n, ok: k.ok, last: k.last }
  })
  res.ts = now
  return res
}

export function readElo() {
  try { return replayElo(readAttempts()) } catch (e) { return { plates: {}, kpoints: {} } }
}

export default { replayElo, readElo, THETA0, DIFF_B }
