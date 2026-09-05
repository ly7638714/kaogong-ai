// kpointMatrix.js —— 考点×周热力矩阵 option 构建（U7；纯函数）
// 输入 kpointHeat() 的返回 → 输出 ECharts heatmap option：
//   行 = 考点（按做题量 TopN，题量最多在顶部）；列 = 近 W 周（滚动 7 天窗口，最右=本周）
// 颜色语义与 StatsPage「考点热度 Top10」条图一致：正确率绿≥80 / 黄 60-79 / 红<60，透明度按题量归一；空=未练
import { rateOf } from './kpointHeat'

const BASE = { ok: '34d399', mid: 'fbbf24', low: 'fb7185', na: '94a3b8' }
function rgba(hex, a) {
  const n = parseInt(hex, 16)
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a.toFixed(2) + ')'
}
export function cellColor(n, rate, maxN) {
  if (!n) return 'rgba(255,255,255,0)'
  const hex = rate == null ? BASE.na : rate >= 80 ? BASE.ok : rate >= 60 ? BASE.mid : BASE.low
  return rgba(hex, 0.25 + 0.75 * Math.min(1, n / (maxN || 1)))
}
export function weekLabel(w) { return w === 0 ? '本周' : w + '周前' }

export function buildHeatOption(heat) {
  if (!heat || !heat.kps || !heat.kps.length || !heat.wkRows || !heat.wkRows.length) return null
  const kps = heat.kps
  const rows = heat.wkRows // kpointHeat: rows[0]=最远周(w=weeks-1)…最后=本周(w=0)，cells 与 kps 对齐
  const maxN = Math.max(1, ...kps.map((k) => k.total))
  const data = []
  rows.forEach((row, r) => {
    row.cells.forEach((cell, i) => {
      if (!cell || !cell.n) return
      const rate = rateOf(cell)
      data.push({ value: [r, i, cell.n], itemStyle: { color: cellColor(cell.n, rate, maxN), borderRadius: 2 } })
    })
  })
  if (!data.length) return null
  return {
    animation: false,
    tooltip: {
      confine: true,
      formatter: (p) => {
        const r = p.data.value[0]
        const i = p.data.value[1]
        const n = p.data.value[2]
        const cell = rows[r] && rows[r].cells[i]
        const rate = rateOf(cell)
        const ok = cell && cell.ok ? cell.ok : 0
        return '<b>' + (kps[i] ? kps[i].kp : '') + '</b><br/>' + weekLabel(rows[r].w) + ' · 共 ' + n + ' 题 · 对 ' + ok +
          (rate == null ? '' : ' · 正确率 <b>' + rate + '%</b>')
      }
    },
    grid: { left: 8, right: 12, top: 28, bottom: 4, containLabel: true },
    xAxis: {
      type: 'category', data: rows.map((row) => weekLabel(row.w)),
      axisLabel: { fontSize: 10, color: '#94a3b8', interval: 0 },
      axisTick: { show: false }, axisLine: { lineStyle: { color: 'rgba(148,163,184,.3)' } },
      splitArea: { show: true, areaStyle: { color: ['rgba(255,255,255,0)', 'rgba(255,255,255,.015)'] } }
    },
    yAxis: {
      type: 'category', data: kps.map((k) => k.kp), inverse: true,
      axisLabel: { fontSize: 10, color: '#cbd5e1', formatter: (v) => (v.length > 13 ? v.slice(0, 12) + '…' : v) },
      axisTick: { show: false }, axisLine: { show: false }
    },
    series: [{ type: 'heatmap', data, progressive: 4000, emphasis: { itemStyle: { borderColor: '#fff', borderWidth: 1 } } }]
  }
}

export default buildHeatOption
