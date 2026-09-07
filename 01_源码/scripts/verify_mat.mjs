import { buildMaterialPrompt } from '../src/api/tasks.js'
const p = buildMaterialPrompt({ difficulty: 'real', matType: 'mixed', n: 5 })
console.log('len:', p.length)
console.log('has 材料+题组:', p.includes('材料+题组'))
console.log('has 纯文字/表格/混合:', p.includes('混合材料（文字背景+表格数据）'))
console.log('has 5题结构:', p.includes('5 道题'))
console.log('has 第1题·基期/现期:', p.includes('第1题·基期/现期'))
console.log('has 综合分析:', p.includes('综合分析'))
console.log('has 术语:', p.includes('术语挖坑'))
console.log('has 选项差距:', p.includes('选项差距设计'))
console.log('has 问法多变:', p.includes('问法多变'))
// 数量关系检查
import { buildProfessorPrompt } from '../src/api/professor.js'
const qs = buildProfessorPrompt('数量关系', 'hard', '工程问题')
console.log('数量·工程·难 | 问法轮换:', qs.includes('问法轮换：甲还需几天'), '| 整数选项:', qs.includes('几乎都是整数'), '| 选项差距:', qs.includes('相邻项差距'))
