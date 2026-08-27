import { renderMd } from '../src/utils/renderMd.js'
const opt = { xAxis: { type: 'category', data: ['一季度','二季度'] }, series: [{ type: 'bar', data: [320,355] }] }
const md = '材料说明\n\n[ECHARTS]\n' + JSON.stringify(opt) + '\n[/ECHARTS]\n\n表格'
const h = renderMd(md)
console.log('len', h.length)
console.log('含 [ECHARTS]:', h.includes('[ECHARTS]'))
console.log('含 gen-chart:', h.includes('gen-chart'))
console.log('HEAD:', JSON.stringify(h.slice(0, 300)))
