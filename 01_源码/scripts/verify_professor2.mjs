import { buildProfessorPrompt } from '../src/api/professor.js'
const checks = [
  ['政治理论','real','','官方文件语','党的全国代表大会'],
  ['常识判断','mid','','百科全书式','四要素'],
  ['言语理解','real','','官媒评论体','浅尝辄止'],
  ['图形推理','hard','','图形规律库','复合规律'],
  ['定义判断','mid','','学科概念词典','要件'],
  ['类比推理','mid','','关系显微镜','二级辨析'],
  ['逻辑判断','real','','论证解剖刀','力度'],
  ['数量关系','real','','数字陷阱师','整除'],
  ['资料分析','hard','','统计公报审读','同比vs环比'],
  ['判断推理','mid','削弱型','综合判断','削弱型']
]
let all = true
for (const [p, d, v, styleKey, logicKey] of checks) {
  const s = buildProfessorPrompt(p, d, v)
  const okStyle = s.includes(styleKey)
  const okBlue = s.includes('真题蓝本')
  const okLogic = s.includes(logicKey)
  const okV = !v || s.includes(v)
  console.log((okStyle && okBlue && okLogic && okV ? 'OK ' : 'BAD ') + p + ' | 风格=' + okStyle + ' 蓝本=' + okBlue + ' 逻辑=' + okLogic + ' 题型=' + okV)
  if (!(okStyle && okBlue && okLogic && okV)) all = false
}
console.log(all ? 'ALL PASS' : 'SOME FAIL')
