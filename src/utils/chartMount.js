// ECharts 按需挂载：扫描容器内 .gen-chart[data-echarts] 并渲染成统计图
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
echarts.use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, CanvasRenderer])

const registry = new WeakMap()
export function mountCharts(root) {
  if (!root) return
  root.querySelectorAll('.gen-chart[data-echarts]').forEach((el) => {
    if (registry.has(el)) { try { registry.get(el).resize() } catch (e) {} return }
    try {
      const option = JSON.parse(el.dataset.echarts || '{}')
      if (!option || typeof option !== 'object' || !option.series || !option.series.length) return
      const chart = echarts.init(el)
      chart.setOption(option)
      registry.set(el, chart)
      try { new ResizeObserver(() => chart.resize()).observe(el) } catch (e) {}
    } catch (e) {}
  })
}
export function disposeCharts(root) {
  if (!root) return
  root.querySelectorAll('.gen-chart').forEach((el) => {
    if (registry.has(el)) { try { registry.get(el).dispose() } catch (e) {} registry.delete(el) }
  })
}
