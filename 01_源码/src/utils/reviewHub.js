// reviewHub.js —— 今日复习中枢汇总（纯函数）：错题到期 + 记忆卡到期
import { dueMemoryItems, ymdKey } from './memorySrs'

export function wrongDueOf(wqs, now = Date.now()) {
  return (wqs || []).filter((q) => q && q.digested && Number(q.dueAt) > 0 && Number(q.dueAt) <= now)
}
export function hubSnapshot({ wqs, srs, now = Date.now() } = {}) {
  const wrongDue = wrongDueOf(wqs, now)
  const memoryDue = dueMemoryItems(srs, ymdKey(new Date(now)))
  return { wrongDue, memoryDue, wrongN: wrongDue.length, memoryN: memoryDue.length, total: wrongDue.length + memoryDue.length }
}