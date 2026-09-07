// wizardTree.js —— 四步发题向导统一数据源（v3.8.193）：板块/细分/题型 与 AI 出题(SUB_VARIANTS) + 题型模板库(solveSteps.VARIANTS) 同一套 canonical
import { SUB_VARIANTS } from '../components/examData'
import { VARIANTS } from './solveSteps'

// ① 板块(6 大) → ② 细分(仅判断推理 分 图推/定义/类比/逻辑；其余板块细分=板块自身，可跳过)
export const WIZARD_PLATES = [
  { key: '判断推理', subs: ['图形推理', '定义判断', '类比推理', '逻辑判断'] },
  { key: '言语理解', subs: [] },
  { key: '数量关系', subs: [] },
  { key: '资料分析', subs: [] },
  { key: '常识判断', subs: [] },
  { key: '政治理论', subs: [] }
]
export function subsOf(plate) {
  const g = WIZARD_PLATES.find((x) => x.key === plate)
  return g ? g.subs : []
}
// 题型池：选了细分用 SUB_VARIANTS[细分]；未选细分用 SUB_VARIANTS[板块]（言语/数量/资料/常识/政治 直接在板块层列题型）
export function typesOf(plate, sub) {
  const key = (sub && SUB_VARIANTS[sub]) ? sub : plate
  const pool = SUB_VARIANTS[key] || []
  return pool.filter((t) => VARIANTS[t]) // 只列已有分步模板的 canonical 题型（与 v3.8.192 对齐）
}
export function typeHint(type) {
  const v = VARIANTS[type]
  if (!v) return ''
  return (v.keypoint || '') + (v.trapFocus ? '；陷阱：' + v.trapFocus : '')
}

export default { WIZARD_PLATES, subsOf, typesOf, typeHint }
