import { renderMd } from '../src/utils/renderMd.js'
const opt = { xAxis: { type: 'category', data: ['一季度','二季度','三季度','四季度'] }, yAxis: { type: 'value' }, series: [{ type: 'bar', data: [320,355,380,410] }] }
const md = '材料说明\n\n[ECHARTS]\n' + JSON.stringify(opt) + '\n[/ECHARTS]\n\n| 季度 | GDP |\n|---|---|\n| 一季度 | 320 |'
const h = renderMd(md)
console.log('含 .gen-chart:', h.includes('class="gen-chart"'))
console.log('含 data-echarts:', h.includes('data-echarts'))
console.log('保留表格:', h.includes('table-scroll'))
