import { renderMd } from '../src/utils/renderMd.js'
const md = '| 季度 | GDP（亿元） | 同比增速 |\n|---|---|---|\n| 一季度 | 320 | 5.2% |\n| 四季度 | 410 | 7.0% |\n\n正文内容很长很长的测试文字。'
const html = renderMd(md)
console.log('table-scroll 包裹:', html.includes('table-scroll'))
console.log('表格保留:', html.includes('<table>'))
console.log('示例片段:', html.slice(0, 120).replace(/\n/g, ' '))
