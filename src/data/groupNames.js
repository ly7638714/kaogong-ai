// groupNames.js —— 六大板块全称（显示层，消除 大板块名 与 细分小板块 的歧义）
// 说明：内部 key 保持 判断推理/言语理解 等（兼容出题/题库/KB），仅界面展示用全称。
export const GROUP_FULL = {
  '判断推理': '逻辑判断与推理',
  '言语理解': '言语理解与表达',
  '数量关系': '数量关系',
  '资料分析': '资料分析',
  '常识判断': '常识判断',
  '政治理论': '政治理论'
}
export const GROUP_KEYS_FULL = ['逻辑判断与推理', '言语理解与表达', '数量关系', '资料分析', '常识判断', '政治理论']
export function groupLabelOf(k) {
  return GROUP_FULL[k] || k || ''
}
export default { GROUP_FULL, GROUP_KEYS_FULL, groupLabelOf }
