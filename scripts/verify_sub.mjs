import { buildProfessorPrompt } from '../src/api/professor.js'
const SUB_VARIANTS = {
  '判断推理': ['削弱型', '加强型', '前提假设型', '结论推出型', '解释型', '评价型'],
  '逻辑判断': ['削弱型', '加强型', '前提假设型', '结论推出型', '解释型', '评价型', '论证缺陷型'],
  '图形推理': ['位置规律', '样式规律', '属性规律', '数量规律', '空间重构'],
  '定义判断': ['选是题', '选非题', '多定义题', '匹配对应题'],
  '类比推理': ['二词型', '三词型', '填空型', '集合图型'],
  '言语理解': ['中心理解', '意图判断', '细节判断', '语句排序', '语句填空', '逻辑填空', '词句理解'],
  '资料分析': ['基期/现期', '增长率', '增长量', '比重', '平均数', '倍数'],
  '数量关系': ['工程问题', '行程问题', '排列组合', '概率问题', '利润问题', '容斥问题', '最值问题'],
  '常识判断': ['时政', '法律常识', '科技常识', '人文历史', '地理常识', '经济常识'],
  '政治理论': ['新思想', '党史', '马原哲学', '时政报告', '重要会议']
}
let bad = 0, total = 0
for (const [plate, vars] of Object.entries(SUB_VARIANTS)) {
  for (const v of vars) {
    total++
    const p = buildProfessorPrompt(plate, 'real', v)
    if (!p.includes('子命题人·') || !p.includes(v)) { bad++; console.log('MISSING sub-profile:', plate, v) }
  }
}
for (const d of ['easy','mid','hard','real']) {
  const p = buildProfessorPrompt('言语理解', d, '中心理解')
  console.log(d, 'stem spec:', p.includes('本题题干规格·' + d), '| sample:', (p.match(/材料\d+-\d+字/)||['?'])[0])
}
console.log('sub-profile coverage:', total - bad, '/', total)
