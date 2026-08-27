import { marked } from 'marked'
const md = '材料\n\n[ECHARTS]\n{"xAxis":{"type":"category","data":["a","b"]},"series":[{"type":"bar","data":[1,2]}]}\n[/ECHARTS]\n\n表格'
console.log(marked.parse(md))
