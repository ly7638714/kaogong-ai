// SRS 学习统计纯函数（可单测）：今日复习计数 + 已掌握计数
export function srsReviewedToday(srs, today) {
  if (!srs || typeof srs !== 'object') return 0
  return Object.values(srs).filter((s) => s && s.last && String(s.last).slice(0, 10) === String(today || '').slice(0, 10)).length
}
export function srsMasteredCount(srs, items) {
  if (!srs || !Array.isArray(items)) return 0
  return items.filter((x) => {
    const s = srs[String(x.cat || '常识') + '|' + String(x.t || '')]
    return s && s.lvl >= 2
  }).length
}
