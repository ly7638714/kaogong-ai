// reasonProfile.js —— 错因画像（R4，纯函数）：按错因聚合 次数/复错/涉及板块/最近出现
export function reasonProfile(wqs, opts = {}) {
  const top = opts.top || 8
  const map = {}
  ;(wqs || []).forEach((q) => {
    const plate = String(q.subject || q.plate || '未分类')
    ;(q.reasons || []).forEach((r) => {
      if (!r) return
      const m = map[r] || (map[r] = { reason: r, n: 0, e: 0, plates: {}, latest: 0 })
      m.n += 1
      m.e += Number((q.reviewStats && q.reviewStats.e) || 0)
      m.plates[plate] = 1
      const t = Number(q.lastRedoAt || q.at || 0)
      if (t > m.latest) m.latest = t
    })
  })
  return Object.keys(map)
    .map((r) => {
      const x = map[r]
      return { reason: r, n: x.n, e: x.e, plates: Object.keys(x.plates), latest: x.latest, score: x.n * 2 + x.e * 3 + (x.latest ? 1 : 0) }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, top)
}
export function wqsOfReason(wqs, reason) {
  if (!reason) return []
  return (wqs || []).filter((q) => (q.reasons || []).includes(reason))
}