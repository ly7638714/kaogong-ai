import { buildProfessorPrompt } from '../src/api/professor.js'
const prof = buildProfessorPrompt('言语理解', 'real', '逻辑填空')
const outFmt = '\n\n输出格式（严格按此结构）：\n### 📝 题目\n（题干/材料）\n（【问法】单独一行…）\nA. … B. … C. … D. …\n【正确答案】X\n### ✅ 答案解析\n…'
console.log('新版 QUIZ_SYS + prof + 输出格式 =', (('你是资深公考命题专家…').length + prof.length + outFmt.length), '字符（旧版含 SYS 约 15000+）')
console.log('prof 含 问法铁律:', prof.includes('问法铁律'))
console.log('prof 含 逻辑填空问法:', prof.includes('依次填入画横线部分最恰当的一项是'))
