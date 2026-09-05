// kpointHeat.js —— 考点热度聚合（5.2 考点热力图数据层；纯函数）
// 输入作答事件流 → 输出近 W 周的考点热度网格：kps TopN 按总量排序 + 每周(ok/total)；供统计页做色块热力图
import { groupOf } from './abilityGate'

const DAY = 86400000
export function rateOf(cell) {
  if (!cell || !cell.n) return null
  return Math.round((cell.ok / cell.n) * 100)
}
export function weekOf(t, now) { return Math.floor((now - (t || now)) / (7 * DAY)) }

export function kpointHeat(attempts, opts = {}) {
  const now = Date.now()
  const weeks = Math.max(1, Math.min(8, Number(opts.weeks) || 4))
  const topN = Math.max(5, Math.min(40, Number(opts.topN) || 20))
  const agg = {}
  const list = attempts || []
  list.forEach((a) => {
    const w = weekOf(a.t, now)
    if (w < 0 || w >= weeks) return
    const kp = String(a.kpoint || '').trim() || (String(a.plate || '') + '·综合')
    const g = groupOf(a.plate) || a.plate || '其他'
    const cell = agg[kp] || (agg[kp] = { kp, g, total: 0, ok: 0, wk: [] })
    cell.total++
    if (a.ok) cell.ok++
    cell.wk[w] = cell.wk[w] || { n: 0, ok: 0 }
    cell.wk[w].n++
    if (a.ok) cell.wk[w].ok++
  })
  const kps = Object.values(agg).sort((a, b) => b.total - a.total).slice(0, topN).map((c) => ({
    kp: c.kp, g: c.g, total: c.total, ok: c.ok,
    rate: c.total ? Math.round((c.ok / c.total) * 100) : null
  }))
  const wkRows = []
  for (let w = weeks - 1; w >= 0; w--) {
    const cells = kps.map((k) => {
      const c = agg[k.kp] && agg[k.kp].wk[w]
      return c ? { n: c.n, ok: c.ok } : { n: 0, ok: 0 }
    })
    wkRows.push({ w, cells })
  }
  return { weeks, topN, kps, wkRows, ts: now }
}

export default kpointHeat
