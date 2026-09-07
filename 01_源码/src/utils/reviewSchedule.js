// reviewSchedule.js —— 错题复习调度（R1/R2 纯函数，可单测）
// 消化门槛：连续答对 ≥2（与既有语义一致）；首次消化 dueAt=+3d，此后消化态答对按 3/7/15/30 递增；
// 消化态答错 → 回到待消化并累计复错。已复盘/已消化后的每次二刷计入 reviewStats（r=复习后再做次数，e=复错次数）。
export const DIGEST_INTERVALS = [3, 7, 15, 30]
export const DAY = 86400000

export function scheduleAfter(q, ok, now = Date.now()) {
  const cur = q || {}
  const rs = Object.assign({ r: 0, e: 0 }, cur.reviewStats || {})
  const wasReviewed = !!(cur.reviewed || cur.digested)
  let digested = !!cur.digested
  let digestLvl = Number(cur.digestLvl) || 0
  let dueAt = cur.dueAt || null
  if (ok) {
    const streak = (Number(cur.correctStreak) || 0) + 1
    if (!digested && streak >= 2) {
      digested = true
      digestLvl = 1
      dueAt = now + DIGEST_INTERVALS[0] * DAY
    } else if (digested) {
      digestLvl = Math.min(DIGEST_INTERVALS.length, (digestLvl || 1) + 1)
      dueAt = now + DIGEST_INTERVALS[Math.min(Math.max(0, digestLvl - 1), DIGEST_INTERVALS.length - 1)] * DAY
    }
  } else if (digested) {
    digested = false
    digestLvl = 0
    dueAt = null
  }
  if (wasReviewed) {
    rs.r += 1
    if (!ok) rs.e += 1
  }
  return { digested, digestLvl, dueAt, reviewStats: rs }
}

export default scheduleAfter