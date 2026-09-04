// genHealth.js —— 跨卷出题健康仪表（深化·可诊断性）
// 聚合本机全量出题日志（xc_quiz_log）为 (板块|题型) 粒度：出题数/失败数/尝试次数，
// 按失败数降序取头部 → 用户一眼看出哪类题「反复难出」，据此决定关闭该题型/换模型/只补题。
import { KEYS, safeGet } from './storage'

export function genHealth(opts) {
  const o = opts || {}
  const minGen = Math.max(1, Number(o.minGen) || 5)
  const topN = Math.max(1, Number(o.topN) || 6)
  const list = safeGet(KEYS.QUIZ_LOG, [])
  const by = new Map()
  let gen = 0, fail = 0, attempts = 0
  const reasonMap = {}
  for (const x of list) {
    if (!x || !x.plate) continue
    const a = Math.max(1, Number(x.attempts) || 1)
    const f = !x.ok
    gen++; attempts += a
    if (f) { fail++; ;(Array.isArray(x.reasons) ? x.reasons : []).forEach((r) => { const k = String(r || '').slice(0, 40); reasonMap[k] = (reasonMap[k] || 0) + 1 }) }
    const key = x.plate + '|' + (x.variant || '综合')
    if (!by.has(key)) by.set(key, { plate: x.plate, variant: x.variant || '综合', gen: 0, fail: 0, attempts: 0 })
    const g = by.get(key)
    g.gen++; g.attempts += a; if (f) g.fail++
  }
  const rows = [...by.values()]
    .filter((r) => r.gen >= minGen)
    .sort((a, b) => (b.fail - a.fail) || (b.gen - a.gen))
    .slice(0, topN)
  const reasonsTop = Object.entries(reasonMap).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([r, n]) => r + '(' + n + '次)')
  return { total: { gen, fail, attempts }, rows, reasonsTop }
}
