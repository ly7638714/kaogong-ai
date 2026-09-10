import { WRONG_GROUPS, isRealSub, typeOrderOfSub } from './wrongTaxonomy'

// 严格三级筛选：大板块 → 细分板块 → 题型。
// 未选上级时返回空数组，禁止把其他板块/其他细分的选项混进来。
export function subsForGroup(groupLabel, groups = WRONG_GROUPS) {
  const g = (groups || []).find((x) => x && x.label === groupLabel)
  if (!g) return []
  return (g.subs || []).filter((s) => isRealSub(s))
}

export function typesForSub(subLabel) {
  if (!subLabel) return []
  return (typeOrderOfSub(subLabel) || []).slice()
}

export default { subsForGroup, typesForSub }
