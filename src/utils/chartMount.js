// ECharts 按需挂载：扫描容器内 .gen-chart[data-echarts] 并渲染成统计图
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart, HeatmapChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
echarts.use([BarChart, LineChart, PieChart, HeatmapChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, CanvasRenderer])

const registry = new WeakMap()
export function mountCharts(root) {
  if (!root) return
  root.querySelectorAll('.gen-chart[data-echarts]').forEach((el) => {
    const ent = registry.get(el)
    if (ent) { try { ent.chart.resize() } catch (e) {} return }
    try {
      const option = JSON.parse(el.dataset.echarts || '{}')
      if (!option || typeof option !== 'object' || !option.series || !option.series.length) return
      const chart = echarts.init(el)
      chart.setOption(option)
      let ro = null
      try { ro = new ResizeObserver(() => chart.resize()); ro.observe(el) } catch (e) { ro = null }
      registry.set(el, { chart, ro })
    } catch (e) {}
  })
}
export function disposeCharts(root) {
  if (!root) return
  root.querySelectorAll('.gen-chart').forEach((el) => {
    const ent = registry.get(el)
    if (ent) {
      try { ent.chart.dispose() } catch (e) {}
      if (ent.ro) { try { ent.ro.disconnect() } catch (e) {} }
      registry.delete(el)
    }
  })
}

// 单点挂载/销毁（U7 考点热力矩阵用）：与 mountCharts/disposeCharts 共用同一注册表与 ResizeObserver
export function mountOne(el, option) {
  if (!el || !option || typeof option !== 'object' || !option.series || !option.series.length) return null
  const ent = registry.get(el)
  if (ent) { try { ent.chart.resize() } catch (e) {} return ent.chart }
  try {
    const chart = echarts.init(el)
    chart.setOption(option)
    let ro = null
    try { ro = new ResizeObserver(() => chart.resize()); ro.observe(el) } catch (e) { ro = null }
    registry.set(el, { chart, ro })
    return chart
  } catch (e) { return null }
}
export function disposeOne(el) {
  if (!el) return
  const ent = registry.get(el)
  if (ent) {
    try { ent.chart.dispose() } catch (e) {}
    if (ent.ro) { try { ent.ro.disconnect() } catch (e) {} }
    registry.delete(el)
  }
}