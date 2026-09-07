// paperPlan.js —— 考点考频配额组卷（35号执行说明书·批次2-C，纯本地零 API）
// 卷面名额 = 真题考频基准（本批次：纯考频；批次3 将叠加 1+λ·薄弱度）。
// 数据：src/data/kpointFreq.json（构建脚本 scripts/buildKpointFreq.mjs 从真题分类汇总折算）；
// 无法折算的板块在产物中缺席 → 退化为板块内均匀基准（仍保留相邻题型错开排序，优于旧一轮随机全覆盖）。
import kpointFreq from '../data/kpointFreq.json'

// 未上榜变体的基准权重：占该板块真题总量的 2%（保留低考频题型偶发出现，避免彻底消失）
export const BASE_RATIO = 0.02
const freq = kpointFreq || {}
const meta = freq._meta || {}

export function subjectTotal(subject) {
  return (meta.subjectTotal && meta.subjectTotal[subject]) || 0
}

// 单个变体的考频权重（未收录板块=1 → 板块内均匀）
export function weightFor(subject, variant) {
  const map = freq[subject]
  if (map && map[variant] != null) return map[variant]
  if (map) return Math.max(1, Math.round(subjectTotal(subject) * BASE_RATIO))
  return 1
}

// 列表 → 权重表（带 '综合'/空变体保护）
export function variantWeights(subject, variants) {
  const list = (variants || []).map((v) => String(v || '').trim()).filter(Boolean)
  const w = {}
  if (!list.length) { w['综合'] = 1; return w }
  list.forEach((v) => { w[v] = weightFor(subject, v) })
  return w
}

// 配额分配（最大余数法）：Σquota = n 严格守恒
export function allocQuotas(weights, n) {
  const total = Math.max(0, Math.floor(Number(n) || 0))
  const keys = Object.keys(weights || {})
  if (!total || !keys.length) return {}
  const wSum = keys.reduce((a, k) => a + Math.max(0, weights[k] || 0), 0) || 1
  const quotas = {}
  let used = 0
  const rem = keys.map((k) => {
    const exact = (total * Math.max(0, weights[k] || 0)) / wSum
    const base = Math.floor(exact)
    quotas[k] = base
    used += base
    return { k, frac: exact - base }
  })
  let rest = total - used
  rem.sort((a, b) => b.frac - a.frac) // 余数大的先补 1
  for (let i = 0; rest > 0 && i < rem.length; i++, rest--) quotas[rem[i].k] = (quotas[rem[i].k] || 0) + 1
  // 极端：n 很大且余数轮空后仍有 rest（如全部 frac 为 0 且 keys 少）→ 顺序回填给权重最大项
  const sorted = keys.slice().sort((a, b) => (weights[b] || 0) - (weights[a] || 0))
  for (let i = 0; rest > 0; i = (i + 1) % sorted.length, rest--) quotas[sorted[i]] = (quotas[sorted[i]] || 0) + 1
  return quotas
}

// 配额 → 顺序列表（相邻题型尽量错开；某题型超半数时允许相邻）
export function orderQuotas(quotas) {
  const pool = Object.entries(quotas || {}).filter(([, q]) => q > 0).map(([k, q]) => ({ k, q }))
  const total = pool.reduce((a, x) => a + x.q, 0)
  const out = []
  const pick = (last) => {
    let best = null
    pool.forEach((x) => {
      if (x.q <= 0) return
      if (x.k === last) return
      if (!best || x.q > best.q) best = x
    })
    if (!best) best = pool.filter((x) => x.q > 0).sort((a, b) => b.q - a.q)[0] || null
    if (!best) return false
    out.push(best.k)
    best.q--
    return true
  }
  let last = null
  while (out.length < total) { const ok = pick(last); if (!ok) break; last = out[out.length - 1] }
  return out
}

// 主入口：给定板块/候选变体/题量 → 返回长度为 n 的变体顺序列表（空变体返回 []）

// ===== 37号 正确性加固B：疑题降权 =====
// 用户标记疑题(板块|变体 计数) → 该变体权重除以 (1 + 0.6×疑题数)，疑题越多出得越少；纯本地零成本。
export const FLAG_PENALTY = 0.6
export function applyFlagSuppress(plate, weights, flags) {
  const out = {}
  Object.keys(weights || {}).forEach((v) => {
    const c = Number((flags || {})[plate + '|' + v]) || 0
    out[v] = (weights[v] || 1) / (1 + c * FLAG_PENALTY)
  })
  return out
}

export function planVariants(subject, variants, n, opts = {}) {
  const total = Math.max(0, Math.floor(Number(n) || 0))
  if (!total) return []
  const list = (variants || []).map((v) => String(v || '').trim()).filter(Boolean)
  if (!list.length) return []
  const base = opts.weights || variantWeights(subject, list)
  const weights = opts.flags ? applyFlagSuppress(subject, base, opts.flags) : base
  const quotas = allocQuotas(weights, total)
  return orderQuotas(quotas)
}

// ===== 35号批次3-B：补短模式（薄弱点加权组卷）=====
// 卷面名额 = 真题考频基准 × (1 + λ·薄弱度)；薄弱度 = 1 - 实测正确率 p̂（Beta 平滑，题类样本 n≥8 才给权重）；
// 冷启动闸门：板块累计作答 ≥30 才参与加权（doc 35 §3.2），否则 λ 强制为 0。
export const WEAK_LAMBDA = 0.6
export const WEAK_N = 8 // 单变体弱项判定最小样本
export const WEAK_GATE = 30 // 板块级冷启动门槛（累计作答）
import { betaP } from './difficulty'

// 按 (板块, 变体) 聚合作答（与难度无关：薄弱看的是会不会，不是题难不难）
export function statsByVariant(attempts) {
  const by = {}
  ;(attempts || []).forEach((a) => {
    if (!a || !a.plate || !a.variant) return
    const pl = by[a.plate] || (by[a.plate] = {})
    const v = pl[a.variant] || (pl[a.variant] = { n: 0, ok: 0 })
    v.n++
    if (a.ok) v.ok++
  })
  return by
}

// 单板块变体薄弱度：{ map: {v: 0..1}, subjectN }（n<WEAK_N 的变体不给权重 → weak=0）
export function weaknessFor(subject, variants, attempts) {
  const by = statsByVariant(attempts || [])
  const sub = by[subject] || {}
  const list = (variants || []).map((v) => String(v || '').trim()).filter(Boolean)
  const map = {}
  let subjectN = 0
  list.forEach((v) => {
    const st = sub[v]
    if (!st) return
    subjectN += st.n
  })
  // 板块级门槛只算本模块候选变体（与组卷配额同口径，够用即可）
  list.forEach((v) => {
    const st = sub[v]
    if (!st || st.n < WEAK_N) { map[v] = 0; return }
    const p = betaP(st.ok, st.n)
    map[v] = Math.max(0, Math.min(1, 1 - p))
  })
  return { map, subjectN }
}

// 补短配额：权重 = 考频基准 × (1 + λ·薄弱度)；不满足门槛时退化为纯考频
export function planStrengthened(subject, variants, n, attempts, lambda = WEAK_LAMBDA, flags) {
  const total = Math.max(0, Math.floor(Number(n) || 0))
  if (!total) return []
  const list = (variants || []).map((v) => String(v || '').trim()).filter(Boolean)
  if (!list.length) return []
  const lam = Number(lambda) > 0 ? Number(lambda) : 0
  const wf = weaknessFor(subject, list, attempts || [])
  if (!(lam > 0) || wf.subjectN < WEAK_GATE) return planVariants(subject, list, total, flags ? { flags } : undefined)
  const base = variantWeights(subject, list)
  const weights = {}
  list.forEach((v) => { weights[v] = (base[v] || 1) * (1 + lam * (wf.map[v] || 0)) })
  return planVariants(subject, list, total, { weights, flags })
}

export default { planVariants, variantWeights, allocQuotas, orderQuotas, weightFor, subjectTotal, statsByVariant, weaknessFor, planStrengthened, applyFlagSuppress, FLAG_PENALTY, WEAK_LAMBDA, WEAK_N, WEAK_GATE }