import { buildProfessorPrompt } from '../src/api/professor.js'
const checks = [
  ['逻辑判断', 'hard', '削弱型', '难度与字数无关', '短题干+隐蔽结构'],
  ['判断推理', 'real', '加强型', '难度与字数无关', '短题干也能出难题'],
  ['图形推理', 'hard', '数量规律', '长度与难度无关', '复合规律'],
  ['类比推理', 'mid', '对应关系', '长度与难度无关', '二级辨析'],
  ['定义判断', 'mid', '选非题', '不追求加长', '要件'],
  ['言语理解', 'real', '中心理解', '长≠难', '300-500字'],
  ['数量关系', 'real', '工程问题', '题干可长可短', '数字设计'],
  ['资料分析', 'hard', '增长率', '不为加长而加长', '陷阱叠加'],
  ['政治理论', 'mid', '新思想', '不必冗长', '限定词'],
  ['常识判断', 'mid', '时政', '长度与难度无关', '四要素']
]
let all = true
for (const [p, d, v, k1, k2] of checks) {
  const s = buildProfessorPrompt(p, d, v)
  const ok = s.includes(k1) && s.includes(k2)
  console.log((ok ? 'OK ' : 'BAD ') + p + '·' + v + ' -> ' + k1 + ' / ' + k2)
  if (!ok) all = false
}
console.log(all ? 'ALL DIFF-DIM PASS' : 'SOME FAIL')
