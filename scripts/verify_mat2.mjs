import { buildProfessorPrompt, SUB_PROFILE } from '../src/api/professor.js'
const zl = buildProfessorPrompt('资料分析', 'real', '')
console.log('资料·真题级 | 材料形式:', zl.includes('材料形式（按序轮换'), '| 5题卷面:', zl.includes('一篇材料配 5 题'), '| 综合分析:', zl.includes('以下能够推出/不能推出'), '| 术语:', zl.includes('同比/环比'), '| 选项差距:', zl.includes('选项差距设计'))
const sl = buildProfessorPrompt('数量关系', 'hard', '工程问题')
console.log('数量·难·工程 | 问法多变:', sl.includes('问法多变：同一题型换问法'), '| 整数选项:', sl.includes('几乎都是整数'), '| 子命题人问法:', sl.includes('问法轮换：甲还需几天'), '| 特殊化:', sl.includes('数字陷阱师'))
const qs = buildProfessorPrompt('数量关系', 'hard', '行程问题')
console.log('数量·行程 问法:', qs.includes('问法轮换：何时相遇'))
console.log('资料子命题人数量:', Object.keys(SUB_PROFILE).filter(k => ['基期/现期','增长率','增长量','比重','平均数','倍数'].includes(k)).length, '/ 6')
