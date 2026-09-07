// retryPlan.js —— 「只补失败题」续出计划（深化·续出）
// 纯函数：决定续出时哪些题需要重新生成。铁律：非失败且不属于失败题组的题【绝不】被重置
// （它们已消耗额度/时间，重置=白付钱）。题组内任一题失败 → 整组重出（保证题组材料自洽）。
export function pickRetryReset(qs) {
  const list = Array.isArray(qs) ? qs : []
  const groupReset = new Set()
  list.forEach((it) => {
    if (it && (it.err || !it.stem) && it.group && it.groupId !== undefined) groupReset.add(it.groupId)
  })
  const resetIdx = []
  let ok = 0
  list.forEach((it, idx) => {
    if (!it) return
    if (it.err || !it.stem || (it.group && groupReset.has(it.groupId))) resetIdx.push(idx)
    else if (!it.err && it.stem) ok++
  })
  return { resetIdx, ok, n: resetIdx.length, groupReset: [...groupReset] }
}
