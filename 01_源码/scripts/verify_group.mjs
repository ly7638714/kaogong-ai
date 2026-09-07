import { buildGroupPrompt } from '../src/api/tasks.js'
const g = buildGroupPrompt('逻辑判断', '一拖五', 'real', 5, undefined)
console.log('一拖五 len:', g.length)
console.log('has 一拖五题组:', g.includes('一拖五」题组'))
console.log('has 共用材料+5:', g.includes('1 个共用材料 + 5 道小题'))
console.log('has 输出格式:', g.includes('### 📄 材料'))
console.log('has 综合推演师:', g.includes('综合推演师'))
const zl = buildGroupPrompt('资料分析', '综合分析', 'hard', 5, 'table')
console.log('资料·表格·5题 len:', zl.length, '| 表格材料:', zl.includes('表格材料（Markdown 表格'))
