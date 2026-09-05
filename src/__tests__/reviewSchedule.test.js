// reviewSchedule（R1/R2）回归：消化/升档/答错降级/复错计数
import { describe, it, expect } from 'vitest'
import { scheduleAfter, DIGEST_INTERVALS } from '../utils/reviewSchedule'

const DAY = 86400000
const mk = (extra = {}) => ({ wrongCount: 1, correctStreak: 0, reviewed: false, digested: false, digestLvl: 0, dueAt: null, reviewStats: { r: 0, e: 0 }, ...extra })
describe('scheduleAfter', () => {
  it('未复盘首错：不计复错、不消化', () => {
    const p = scheduleAfter(mk(), false, 1000)
    expect(p.digested).toBe(false)
    expect(p.dueAt).toBe(null)
    expect(p.reviewStats).toEqual({ r: 0, e: 0 })
  })
  it('连续答对 2 次 → 消化并排 3 天', () => {
    const q = mk()
    const p1 = scheduleAfter(q, true, 1000)
    expect(p1.digested).toBe(false)
    const q2 = mk({ correctStreak: 1 })
    const p2 = scheduleAfter(q2, true, 2000)
    expect(p2.digested).toBe(true)
    expect(p2.digestLvl).toBe(1)
    expect(p2.dueAt).toBe(2000 + DIGEST_INTERVALS[0] * DAY)
  })
  it('消化态再答对 → 按 3/7/15/30 升档', () => {
    const q = mk({ digested: true, digestLvl: 1, dueAt: 1000, correctStreak: 2 })
    const p2 = scheduleAfter(q, true, 5000)
    expect(p2.digestLvl).toBe(2)
    expect(p2.dueAt).toBe(5000 + DIGEST_INTERVALS[1] * DAY)
  })
  it('消化态答错 → 回到待消化 + 复错 +1（已复盘后才计 r）', () => {
    const q = mk({ reviewed: true, digested: true, digestLvl: 2, dueAt: 1000, reviewStats: { r: 1, e: 0 } })
    const p = scheduleAfter(q, false, 5000)
    expect(p.digested).toBe(false)
    expect(p.digestLvl).toBe(0)
    expect(p.dueAt).toBe(null)
    expect(p.reviewStats).toEqual({ r: 2, e: 1 })
  })
  it('已复盘首做二刷（对）→ r+1 不计复错', () => {
    const q = mk({ reviewed: true, reviewStats: { r: 0, e: 0 } })
    const p = scheduleAfter(q, true, 1000)
    expect(p.reviewStats).toEqual({ r: 1, e: 0 })
    expect(p.digested).toBe(false)
  })
})