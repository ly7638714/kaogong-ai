import { buildTaskSys } from '../src/api/tasks.js'
import { diffCurve } from '../src/api/professor.js'
const p1 = buildTaskSys('quiz', { plate: '数量关系', difficulty: 'real', variant: '工程问题' })
console.log('quiz prompt length:', p1.length)
console.log('has 命题专家:', p1.includes('命题专家模式'))
console.log('has 真题级:', p1.includes('真题级'))
console.log('has 数字设计是灵魂:', p1.includes('数字设计是灵魂'))
console.log('has 自检清单:', p1.includes('命题自检清单'))
console.log('has 输出格式:', p1.includes('### 📝 题目'))
console.log('has 变式强化:', buildTaskSys('variant', { prev: 'x' }).includes('保持真题难度'))
console.log('curve:', [0,2,4,6,8,9].map(i => diffCurve(i,10)).join(','))
