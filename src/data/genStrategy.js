// genStrategy.js —— 本地确定性生成 vs AI 生成的策略表（P3-2）
// 目标：把 useExamGen 里散落的「哪个板块走本地/离线/本地优先」从代码 if 收进一张数据表——
//       改策略 = 改一行数据，不再翻代码分支（曾出现数量单题 7 个版本反复 173→174）。
// 字段含义：
//   local         是否提供本地确定性生成（图推 tutuGen / 数量 slGen / 政治 zzGen / 资料 zlGen 单题）
//   offlineLocal  未配 Key 时是否仍可本地出题（离线练习零门槛）
//   localFirstFree 开启 preferLocalDet 且为自由练（未指定子题型）时是否直接本地优先
//   noLocalVariants 这些子题型即使板块可本地也不走本地（如 3D 立体类需特殊能力）
export const GEN_STRATEGY = {
  '图形推理': { local: true, offlineLocal: true, localFirstFree: true, noLocalVariants: ['空间重构', '截面图', '三视图', '立体拼合'] },
  '数量关系': { local: true, offlineLocal: true, localFirstFree: true, noLocalVariants: [] },
  '政治理论': { local: true, offlineLocal: true, localFirstFree: true, noLocalVariants: [] },
  '资料分析': { local: true, offlineLocal: true, localFirstFree: true, noLocalVariants: [] },
  '言语理解': { local: false, offlineLocal: false, localFirstFree: false, noLocalVariants: [] },
  '判断推理': { local: false, offlineLocal: false, localFirstFree: false, noLocalVariants: [] },
  '常识判断': { local: false, offlineLocal: false, localFirstFree: false, noLocalVariants: [] }
}
export function strategyOf(subject) {
  return GEN_STRATEGY[String(subject || '')] || { local: false, offlineLocal: false, localFirstFree: false, noLocalVariants: [] }
}
// 该板块（针对某子题型）是否可走本地确定性生成
export function canLocalStrat(subject, variant) {
  const s = strategyOf(subject)
  if (!s.local) return false
  if (Array.isArray(s.noLocalVariants) && s.noLocalVariants.some((v) => String(variant || '').includes(v))) return false
  return true
}
// 未配 Key 时该板块单题是否可离线本地出
export function offlineLocalOk(subject) { return !!strategyOf(subject).offlineLocal }
// 开启 preferLocalDet 且为自由练时是否本地优先
export function localFirstFreeOk(subject) { return !!strategyOf(subject).localFirstFree }
