// wrongTaxonomy.js —— 错题「六大板块 → 细分板块 → 题型」唯一归一口径（修复：判断推理/逻辑判断分裂、题型跨板块混杂）
// 与 AI出题 SUB_VARIANTS / solveSteps.VARIANTS 对齐：
//   组(6)：判断推理 | 言语理解 | 数量关系 | 资料分析 | 常识判断 | 政治理论
//   判断推理组细分：图形推理 / 定义判断 / 类比推理 / 逻辑判断（“判断推理”不再当细分出现）
//   言语理解组细分：片段阅读 / 篇章阅读（历史无细分的按组级 catch-all “言语理解”处理）
import { VARIANTS, canonicalType } from '../data/solveSteps'
import { groupLabelOf, GROUP_FULL, GROUP_KEYS_FULL } from '../data/groupNames' // 大板块全称（显示层/兼容层）
import { SUB_VARIANTS } from '../components/examData'
import { detectSubType } from './askAssist'
import { detectBanKuai } from '../api/detect'

export const WRONG_GROUPS = [
  { label: '判断推理', subs: ['图形推理', '定义判断', '类比推理', '逻辑判断'] },
  { label: '言语理解', subs: ['片段阅读', '篇章阅读'] },
  { label: '数量关系', subs: ['数量关系'] },
  { label: '资料分析', subs: ['资料分析'] },
  { label: '常识判断', subs: ['常识判断'] },
  { label: '政治理论', subs: ['政治理论'] }
]
export const GROUP_LABELS = WRONG_GROUPS.map((g) => g.label)
const GROUP_BY_SUB = {}
WRONG_GROUPS.forEach((g) => (g.subs || []).forEach((s) => { GROUP_BY_SUB[s] = g.label }))
// 组名同时可作“组级遗留”出现（subject 存了大板块名），但不作为真细分选项
GROUP_BY_SUB['判断推理'] = '判断推理'
GROUP_BY_SUB['言语理解'] = '言语理解'
// 判断推理组内：组名一律不当作细分（细分只允许 图推/定义/类比/逻辑）
const NOT_SUB = { '判断推理': 1, '言语理解': 1 } // 组名不作为真细分（言语真细分=片段/篇章）
// 全称 ↔ 内部旧组名（若未来任何地方把“大板块全称”当 subject 存入，也能归一）
const FULL_TO_OLD = { '逻辑判断与推理': '判断推理', '言语理解与表达': '言语理解' }
function oldGroupOf(x) {
  const s = String(x || '')
  if (!s) return s
  return FULL_TO_OLD[s] || s
}

export function groupOfName(x) {
  const s = oldGroupOf(x)
  return s ? (GROUP_BY_SUB[s] || '') : ''
}
export function isRealSub(x) {
  const s = String(x || '')
  return !!s && !!GROUP_BY_SUB[s] && !NOT_SUB[s]
}
function typeGroupOf(token) {
  const c = canonicalType('', String(token || '').trim())
  if (!c || !VARIANTS[c]) return ''
  return groupOfName(VARIANTS[c].sub || '')
}
function typeSubOf(token) {
  const c = canonicalType('', String(token || '').trim())
  return c && VARIANTS[c] ? String(VARIANTS[c].sub || '') : ''
}
function subjectInfo(q) {
  const raw = String((q && (q.subject || q.plate)) || '').trim()
  const normalized = oldGroupOf(raw)
  return {
    raw,
    normalized,
    group: groupOfName(normalized) || '',
    sub: isRealSub(normalized) ? normalized : ''
  }
}
function explicitTypeOf(q, group = '') {
  const tokens = [q && q.sub, q && q.variant, q && q.vx]
  for (const token of tokens) {
    const c = canonicalType('', String(token || '').trim())
    if (!c || !VARIANTS[c]) continue
    const g = groupOfName(VARIANTS[c].sub || '')
    if (!group || !g || g === group) return c
  }
  return ''
}
function detectedTypeForGroup(q, group = '') {
  const text = String((q && (q.question || q.q || q.stem)) || '')
  if (!text) return ''
  const inferred = detectBanKuai(text)
  const groups = group ? [group] : (inferred ? [inferred] : [])
  for (const g of groups) {
    try {
      const r = detectSubType(text, g)
      const c = canonicalType('', (r && r.name) || '')
      if (c && VARIANTS[c]) {
        const cg = groupOfName(VARIANTS[c].sub || '')
        if (!group || !cg || cg === group) return c
      }
    } catch (e) {}
  }
  return ''
}
// 题型的 canonical 名称（q.sub/q.variant 可为 canonical 或 legacy 短名；否则按正文识别；未知返回 ''）
export function canonicalTypeOf(q) {
  if (!q) return ''
  const group = canonicalGroupOf(q)
  const explicit = explicitTypeOf(q, group)
  if (explicit) return explicit
  const detected = detectedTypeForGroup(q, group)
  if (detected) return detected
  if (!group) {
    const inferred = detectBanKuai(String(q.question || q.q || q.stem || ''))
    return explicitTypeOf(q, inferred) || detectedTypeForGroup(q, inferred)
  }
  return ''
}
export function typeLabelOf(q) {
  return canonicalTypeOf(q) || '未分类'
}
// 细分板块（真细分：图推/定义/类比/逻辑/片段/篇章/数量/资料/常识/政治；组名“判断推理”会被归位）
export function canonicalSubOf(q) {
  if (!q) return ''
  const group = canonicalGroupOf(q)
  const info = subjectInfo(q)
  const subx = String(q.subx || '').trim()
  // 只接受与最终大板块一致的三级字段，跨板块脏字段一律忽略，避免资料题带逻辑 subx 后整题串板。
  if (subx && isRealSub(subx) && (!group || groupOfName(subx) === group)) return subx
  if (info.sub && (!group || groupOfName(info.sub) === group)) return info.sub
  const explicit = explicitTypeOf(q, group)
  if (explicit && VARIANTS[explicit]) {
    const sub = String(VARIANTS[explicit].sub || '')
    if (sub && (!group || !groupOfName(sub) || groupOfName(sub) === group)) {
      if (sub === '言语理解' && (info.raw === '片段阅读' || info.raw === '篇章阅读')) return info.raw
      return sub
    }
  }
  const detectedSub = typeSubOf(detectedTypeForGroup(q, group))
  if (detectedSub && (!group || groupOfName(detectedSub) === group)) return detectedSub
  if (group === '判断推理') return '逻辑判断'
  return group || info.normalized || '未分类'
}
export function canonicalGroupOf(q) {
  if (!q) return '未分类'
  const info = subjectInfo(q)
  const text = String(q.question || q.q || q.stem || '')
  const textGroup = detectBanKuai(text)
  const subx = String(q.subx || '').trim()
  const subxGroup = subx && isRealSub(subx) ? groupOfName(subx) : ''
  const typeGroup = typeGroupOf(q.sub) || typeGroupOf(q.variant) || typeGroupOf(q.vx)
  // 明确的 subx /题型字段与 subject 同组时，视为可靠标注；否则若正文给出了另一个明确板块，以正文校正旧脏 subject。
  if (info.group) {
    const sameGroupEvidence = (subxGroup && subxGroup === info.group) || (typeGroup && typeGroup === info.group)
    if (textGroup && textGroup !== info.group && !sameGroupEvidence) return textGroup
    return info.group
  }
  return subxGroup || typeGroup || textGroup || '未分类'
}
export function taxonOf(q) {
  return { group: canonicalGroupOf(q), sub: canonicalSubOf(q), type: typeLabelOf(q) }
}
export function wrongTaxonKey(q) {
  const t = taxonOf(q)
  return [t.group || '未分类', t.sub || '未分类', t.type || '未分类'].join('|')
}
export function sameWrongTaxon(a, b) {
  const x = taxonOf(a)
  const y = taxonOf(b)
  return !!x.group && !!x.sub && !!x.type && x.type !== '未分类' &&
    x.group === y.group && x.sub === y.sub && x.type === y.type
}
// 任意“组 token”（旧组名/新全称/细分小板块名/题型名）→ 该题的 大板块全称（唯一展示词）
function fullGroupOfToken(v) {
  const s = String(v == null ? '' : v)
  if (!s) return ''
  const x = oldGroupOf(s) // 全称→旧组名；其余原样
  const g = groupOfName(x) || groupOfName(s)
  if (g) return groupLabelOf(g)
  return groupLabelOf(x) || s
}
// 写库用 canonical subject：能确定细分→细分小板块（图形/定义/类比/逻辑/片段/篇章），否则大板块全称
function canonicalSubjectOf(q) {
  if (!q) return ''
  const S = String(q.subject || q.plate || '').trim()
  // 明确细分（subx / sub 是细分名）
  const sx = String(q.subx || '').trim()
  if (sx && isRealSub(sx)) return sx
  // 由题型推导细分
  const t = canonicalTypeOf(q)
  if (t && VARIANTS[t]) {
    const sub = VARIANTS[t].sub
    if (isRealSub(sub)) {
      if (sub === '言语理解') return '言语理解' // 言语题型无 片段/篇章 细分信息 → 组级全称
      return sub
    }
  }
  // subject 本身
  const g = groupOfName(S) || groupOfName(oldGroupOf(S))
  if (g) {
    if (isRealSub(S)) return S
    return groupLabelOf(g)
  }
  return S || ''
}
// 该细分下的题型候选（按 SUB_VARIANTS canonical 顺序；片段/篇章共用言语题型表）
export function typeOrderOfSub(sub) {
  const s = String(sub || '')
  if (s === '片段阅读' || s === '篇章阅读' || s === '言语理解') return (SUB_VARIANTS['言语理解'] || []).slice()
  return (SUB_VARIANTS[s] || []).slice()
}
// 全部 canonical 题型顺序（去重，供跨板块下拉排序）
export const CANON_TYPE_ORDER = (function () {
  const seen = []
  const push = (arr) => (arr || []).forEach((t) => { if (!seen.includes(t)) seen.push(t) })
  WRONG_GROUPS.forEach((g) => {
    const list = g.label === '言语理解' ? (SUB_VARIANTS['言语理解'] || []) : (SUB_VARIANTS[g.label] || [])
    push(list)
    ;(g.subs || []).forEach((s) => { if (s !== g.label) push(SUB_VARIANTS[s]) })
  })
  return seen
})()
export { groupLabelOf, GROUP_FULL, GROUP_KEYS_FULL, oldGroupOf, fullGroupOfToken, canonicalSubjectOf }
export default { WRONG_GROUPS, groupOfName, isRealSub, canonicalTypeOf, typeLabelOf, canonicalSubOf, canonicalGroupOf, taxonOf, wrongTaxonKey, sameWrongTaxon, typeOrderOfSub, CANON_TYPE_ORDER, groupLabelOf, oldGroupOf, fullGroupOfToken, canonicalSubjectOf }
