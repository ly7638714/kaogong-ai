import { buildProfessorPrompt } from '../src/api/professor.js'
const checks = [
  ['逻辑判断', '削弱型', '薛睿体系', '五步40秒', '13丑', '高效复盘指引'],
  ['判断推理', '加强型', '薛睿体系', '否定论点>拆桥', '美"', '高效复盘指引'],
  ['言语理解', '中心理解', '花生十三', '张弓', '郭熙', '高效复盘指引'],
  ['言语理解', '逻辑填空', '语境还原', '词语辨析', '高效复盘指引'],
  ['图形推理', '位置规律', '刘义恒', '24诀', '高效复盘指引'],
  ['定义判断', '选非题', '四步破题', '五要件', '高效复盘指引'],
  ['类比推理', '二词型', '三步定位', '二级辨析', '高效复盘指引'],
  ['数量关系', '工程问题', '四层金字塔', '秒杀路径', '高效复盘指引'],
  ['资料分析', '增长率', '四大神器', '反向验证', '高效复盘指引'],
  ['政治理论', '新思想', '小黑', '限定词辨析', '高效复盘指引'],
  ['常识判断', '时政', '四要素核对', '高效复盘指引']
]
let all = true
for (const [p, v, ...keys] of checks) {
  const s = buildProfessorPrompt(p, 'mid', v)
  const ok = keys.every((k) => s.includes(k)) && s.includes('解析输出协议') && s.includes('题型判定')
  console.log((ok ? 'OK ' : 'BAD ') + p + '·' + v)
  if (!ok) { keys.forEach((k) => { if (!s.includes(k)) console.log('   missing: ' + k) }); all = false }
}
console.log(all ? 'ALL METHOD PASS' : 'SOME FAIL')
