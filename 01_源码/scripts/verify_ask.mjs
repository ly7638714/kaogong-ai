import { buildProfessorPrompt } from '../src/api/professor.js'
const checks = [
  ['言语理解', 'real', '中心理解', '这段文字主要强调的是'],
  ['言语理解', 'real', '逻辑填空', '依次填入画横线部分最恰当的一项是'],
  ['言语理解', 'real', '语句排序', '语序正确的是'],
  ['逻辑判断', 'real', '削弱型', '最能削弱上述结论'],
  ['逻辑判断', 'real', '前提假设型', '需要补充以下哪项作为前提'],
  ['图形推理', 'real', '位置规律', '选择最合适的一个填入问号处'],
  ['图形推理', 'real', '空间重构', '能由它折叠而成'],
  ['类比推理', 'real', '二词型', '逻辑关系最为相似'],
  ['定义判断', 'real', '选非题', '下列不属于'],
  ['数量关系', 'real', '工程问题', '问法铁律']
]
let all = true
for (const [p, d, v, key] of checks) {
  const s = buildProfessorPrompt(p, d, v)
  const ok = s.includes('问法铁律') && s.includes(key)
  console.log((ok ? 'OK ' : 'BAD ') + p + '·' + v + ' -> ' + key)
  if (!ok) all = false
}
console.log(all ? 'ALL ASK RULES PASS' : 'SOME FAIL')
