// trapMap.js —— 陷阱映射 → 结构化错因（35号批次3-A，零 API）
// 思路：命题人设计说明末尾输出【陷阱映射】A:B:C:D 各选项陷阱类型（用户选哪个错项即得该陷阱），
//       再经 陷阱类型×板块 → wrongReasons 具体条目 的静态映射落成结构化错因，
//       使整卷/组卷入库的错题不再全部是占位符（ExamPanel.vue saveWrongs）。
// 补充：解析文本里模型已按选项点名陷阱（如「B项偷换概念」），无 designer 时用正则就近归因（尽力而为）。
import { SUBJ_REASONS, GENERIC_REASONS } from '../data/wrongReasons'

export const TRAP_TYPES = ['偷换概念', '以偏概全', '因果倒置', '时间单位陷阱', '缺要件', '力度不足', '无中生有', '范围扩大', '绝对化', '计算错解']
// 别名归一：模型/名师措辞多样 → 统一到枚举之一（未命中返回 null）
const TRAP_ALIAS = [
  ['偷换概念', ['偷换概念', '偷换']],
  ['以偏概全', ['以偏概全', '以偏概全项']],
  ['因果倒置', ['因果倒置']],
  ['时间单位陷阱', ['时间口径', '单位陷阱', '单位换', '看错单位', '时间陷阱', '同比环比', '时间单位']],
  ['缺要件', ['缺要件', '要件缺失']],
  ['力度不足', ['力度不足', '力度不够']],
  ['无中生有', ['无中生有']],
  ['范围扩大', ['范围扩大', '偷换范围']],
  ['绝对化', ['绝对化', '绝对表述']],
  ['计算错解', ['计算错', '算错', '计算粗心']]
]
const ALIAS_LOOKUP = {}
TRAP_ALIAS.forEach(([canon, arr]) => arr.forEach((a) => { ALIAS_LOOKUP[a] = canon }))

export function normalizeTrap(s) {
  const t = String(s || '').trim()
  if (!t) return ''
  if (TRAP_TYPES.includes(t)) return t
  // 最长别名优先，避免「偷换」先命中短的别名
  let hit = ''
  Object.keys(ALIAS_LOOKUP).forEach((k) => { if (k.length > hit.length && t.includes(k)) hit = k })
  return ALIAS_LOOKUP[hit] || ''
}

// 解析【陷阱映射】段：A:类型 B:类型…（支持换行/逗号/顿号分隔；未提供某选项则缺失）
export function parseTrapMap(text) {
  const out = {}
  const src = String(text || '')
  const m = src.match(/【陷阱映射】\s*([\s\S]{0,400})/i)
  if (!m) return out
  const seg = m[1]
  const re = /([A-D])\s*[:：.、]\s*([^,，;；、\n]+)/g
  let mm
  while ((mm = re.exec(seg))) {
    const can = normalizeTrap(mm[2])
    if (can) out[mm[1].toUpperCase()] = can
  }
  return out
}

// 解析文本里就近出现的陷阱（无 designer 时尽力而为）：如「B项/选项B 偷换概念…」
export function parseTrapFromExplain(text) {
  const out = {}
  const src = String(text || '')
  TRAP_TYPES.forEach((trap) => {
    const re = new RegExp('([A-D])\\s*(?:项|选项|选)?[^。；;\\n]{0,14}?' + trap, 'g')
    let mm
    while ((mm = re.exec(src))) { out[mm[1].toUpperCase()] = trap }
  })
  return out
}

// 陷阱类型 × 板块 → wrongReasons 具体条目（关键词匹配优先序；找不到回退通用原因）
export function reasonForTrap(plate, trap) {
  const can = normalizeTrap(trap)
  if (!can) return ''
  const list = SUBJ_REASONS[String(plate || '')] || SUBJ_REASONS['判断推理'] || []
  const kw = (TRAP_ALIAS.find(([c]) => c === can) || [])[1] || []
  for (const reason of list) {
    if (kw.some((k) => reason.includes(k))) return reason
  }
  for (const reason of GENERIC_REASONS) {
    if (can === '计算错解' && reason.includes('粗心')) return reason
    if (can === '绝对化' && reason.includes('陷阱')) return reason
  }
  return ''
}

// 占位符错因（无任何归因信号时保留，避免空 reasons；批次3目标是把占比打下来）
export const PLACEHOLDER_REASON = '整卷/组卷作答失误'

// 单题自动归因：优先 designer【陷阱映射】，其次解析就近陷阱；都无 → 占位符
export function autoWrongReasons(q, pick) {
  const qq = q || {}
  const designer = String(qq.designer || '')
  const explain = String(qq.explain || '')
  const map = Object.assign(parseTrapMap(designer), parseTrapFromExplain(explain))
  const pk = String(pick || '').trim().toUpperCase()
  // 只有能定位到「用户所选错误项」的陷阱时才归因；否则宁可用占位符也不张冠李戴
  const trap = (pk && map[pk]) || ''
  if (!trap) return [PLACEHOLDER_REASON]
  const reason = reasonForTrap(qq.subject, trap)
  return reason ? [reason] : [PLACEHOLDER_REASON]
}

export default { parseTrapMap, parseTrapFromExplain, reasonForTrap, autoWrongReasons, normalizeTrap, TRAP_TYPES }