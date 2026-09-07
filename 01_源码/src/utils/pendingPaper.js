// pendingPaper.js —— 组卷断点续出（深化·抗中断）：组卷被完整性拦截或中途中断时，
// 把「已出成功题」持久化到 localStorage；刷新/关闭后可从配置页一键恢复并只补失败题。
import { KEYS, safeGet, safeSet } from './storage'

const MAX_ITEMS = 300
// 只保留重建出卷所需字段，剔运行态/结果态字段以省空间
function slim(it) {
  const o = { subject: it.subject || '', variant: it.variant || '', difficulty: it.difficulty || '' }
  for (const f of ['dir', 'dirText', 'group', 'groupId', 'groupN', 'groupLeader', 'matType', 'stem', 'options', 'answer', 'explain', 'designer', 'kpoint', 'local', 'anchor', 'zhenti', 'fromWrong', 'wrongId', 'err']) if (it[f] !== undefined) o[f] = it[f]
  return o
}
export function savePending(paper) {
  try {
    if (!paper || !Array.isArray(paper.questions)) return false
    const items = paper.questions.slice(0, MAX_ITEMS).map(slim)
    const ok = items.filter((q) => !q.err && q.stem).length
    const n = items.length - ok
    if (n <= 0) return false // 没有失败题 → 不需要断点
    const payload = {
      v: 1, savedAt: Date.now(), name: String(paper.name || '模拟卷'),
      ok, n,
      summary: [...new Set(items.filter((q) => q.err || !q.stem).map((q) => (q.subject || '') + (q.variant ? '·' + q.variant : '')))].slice(0, 4).join('、'),
      items
    }
    return safeSet(KEYS.PENDING_PAPER, payload)
  } catch (e) { return false }
}
export function loadPending() {
  try {
    const d = safeGet(KEYS.PENDING_PAPER, null)
    if (!d || typeof d !== 'object' || !Array.isArray(d.items) || !d.items.length) return null
    if (!d.name) d.name = '模拟卷'
    return d
  } catch (e) { return null }
}
export function clearPending() {
  try { localStorage.removeItem(KEYS.PENDING_PAPER) } catch (e) {}
}
