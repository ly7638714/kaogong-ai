import { buildProfessorPrompt } from '../src/api/professor.js'
const names = { easy: '易', mid: '中', hard: '难', real: '真题级' }
for (const d of Object.keys(names)) {
  const p = buildProfessorPrompt('言语理解', d, '中心理解')
  console.log(d, '| 题干规格:', p.includes('本题题干规格·' + names[d]), '| 材料长度:', (p.match(/材料\d+-\d+字/)||['?'])[0], '| 子命题人:', p.includes('子命题人·主旨提炼师'))
}
const pj = buildProfessorPrompt('判断推理', 'real', '削弱型')
console.log('判断·真题级·削弱型 | 材料长度:', (pj.match(/材料\d+-\d+字/)||['?'])[0], '| 论证拆解师:', pj.includes('论证拆解师'), '| 力度排序:', pj.includes('否定论点>拆桥'))
const pz = buildProfessorPrompt('政治理论', 'real', '新思想')
console.log('政治·真题级·新思想 | 背景铺垫:', pz.includes('背景铺垫'), '| 原文校稿员:', pz.includes('原文校稿员'))
