// weakTask.js —— 补弱任务（深化，纯函数）：同一题型累计答错 >=3 次 → 生成「补弱任务」进今日目标
// 口径：对每道错题按（subject, 题型）归组；组内 Σ wrongCount 即该题型累计答错次数
//      （wrongCount 含首次错 + 每次二刷/回忆答错，语义=答错次数）。
// 触发：组内累计答错 >= MIN_WRONG(3) → 该组成为补弱任务，label 含建议题量。
export const MIN_WRONG = 3
export function typeOfQ(q, wrongTypeOf) {
  try {
    if (!q) return ''
    if (typeof wrongTypeOf === 'function') return String(wrongTypeOf(q) || '未分类')
    return String(q.variant || q.subx || q.sub || '未分类')
  } catch (e) {
    return '未分类'
  }
}
// 汇总补弱候选：返回 [{plate,type,wrongN,key}]，按 wrongN 降序
export function weakCandidates(wqs, opts = {}) {
  const wrongTypeOf = opts.wrongTypeOf
  const min = Number(opts.min) || MIN_WRONG
  const map = {}
  ;(Array.isArray(wqs) ? wqs : []).forEach((q) => {
    if (!q) return
    const plate = String(q.subject || q.plate || '未分类')
    const type = typeOfQ(q, wrongTypeOf)
    const n = Math.max(1, Number(q.wrongCount) || 1)
    const k = plate + '|' + type
    const m = map[k] || (map[k] = { plate, type, wrongN: 0, qs: 0 })
    m.wrongN += n
    m.qs += 1
  })
  return Object.keys(map)
    .map((k) => map[k])
    .filter((x) => x.wrongN >= min)
    .sort((a, b) => b.wrongN - a.wrongN)
    .map((x) => ({ ...x, key: x.plate + '·' + x.type }))
}
// 生成任务条目（供看板今日任务合并）：label 附带建议题量（缺口越大题量越多，2..6 封顶）
export function weakTaskItem(c, base = 2) {
  const n = Math.min(6, base + Math.ceil((c.wrongN - 3) / 2))
  return {
    k: 'weak-' + c.plate + '-' + c.type,
    label: '补弱【' + c.type + '】' + c.plate + '已累计答错 ' + c.wrongN + ' 次 · 连做 ' + n + ' 道同类（对话页）',
    done: false,
    weak: true,
    plate: c.plate,
    type: c.type,
    wrongN: c.wrongN
  }
}
// 把补弱候选 upsert 进今日任务列表（已有同 k 则更新 label；返回是否新增/变化）
export function mergeWeakTasks(tasks, wqs, opts = {}) {
  const list = Array.isArray(tasks) ? tasks.slice() : []
  const cands = weakCandidates(wqs, opts)
  const byKey = {}
  list.forEach((t) => { if (t && t.k) byKey[t.k] = t })
  let changed = false
  cands.forEach((c) => {
    const item = weakTaskItem(c)
    if (byKey[item.k]) {
      if (!byKey[item.k].done && byKey[item.k].label !== item.label) {
        byKey[item.k].label = item.label
        byKey[item.k].wrongN = c.wrongN
        changed = true
      }
    } else {
      list.push(item)
      changed = true
    }
  })
  return { tasks: list, changed, cands }
}
export default { MIN_WRONG, weakCandidates, weakTaskItem, mergeWeakTasks }
