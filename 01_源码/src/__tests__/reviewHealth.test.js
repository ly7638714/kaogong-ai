// reviewHealth（复盘健康分/周报口径）回归
import { describe, it, expect } from 'vitest'
import { reviewHealth, weekReviewStats, weekDaily } from '../utils/reviewHealth'
const DAY = 86400000
describe('reviewHealth', () => {
  it('空数据：0 分不报错', () => {
    const h = reviewHealth([], { now: Date.now() })
    expect(h.score).toBe(0)
    expect(h.t).toBe(0)
  })
  it('全部已复盘已消化且无复错 → 高分', () => {
    const now = Date.now()
    const wqs = [
      { reviewed: true, digested: true, dueAt: now + DAY, wrongCount: 1, reviewStats: { r: 1, e: 0 } },
      { reviewed: true, digested: true, dueAt: now + DAY * 2, wrongCount: 1, reviewStats: { r: 1, e: 0 } }
    ]
    const h = reviewHealth(wqs, { now })
    expect(h.reviewedRate).toBe(100)
    expect(h.digestRate).toBe(100)
    expect(h.repRate).toBe(0)
    expect(h.score).toBeGreaterThanOrEqual(90)
  })
  it('逾期 + 复错拉低分数并给提示', () => {
    const now = Date.now()
    const wqs = [
      { reviewed: true, digested: true, dueAt: now - 1000, wrongCount: 3, reviewStats: { r: 3, e: 2 } },
      { reviewed: false, digested: false, dueAt: null, wrongCount: 1, reviewStats: { r: 0, e: 0 } },
      { reviewed: false, digested: false, dueAt: null, wrongCount: 1, reviewStats: { r: 0, e: 0 } }
    ]
    const h = reviewHealth(wqs, { now })
    expect(h.overdue).toBe(1)
    expect(h.repRate).toBeGreaterThanOrEqual(60)
    expect(h.score).toBeLessThan(60)
    expect(h.tips.length).toBeGreaterThan(0)
  })
})
describe('weekReviewStats', () => {
  it('窗口内统计新增/复盘/二刷/复错', () => {
    const now = Date.now()
    const wqs = [
      { at: now - 86400000, reviewedAt: now - 3600000, redoHistory: [{ t: now - 3600000, ok: true }, { t: now - 1000, ok: false }], digestedAt: now - 3600000 },
      { at: now - 40 * DAY, reviewedAt: null, redoHistory: [] }
    ]
    const s = weekReviewStats(wqs, { now, days: 7 })
    expect(s.newWrongs).toBe(1)
    expect(s.reviews).toBe(1)
    expect(s.redoEvents).toBe(2)
    expect(s.redoWrong).toBe(1)
    expect(s.digestGain).toBe(1)
  })
})
describe('weekDaily', () => {
  it('近 7 天每日 0 初始且能累计', () => {
    const now = Date.now()
    const d = weekDaily([{ at: now - 86400000, reviewedAt: null, redoHistory: [{ t: now - 86400000, ok: false }] }], { now, days: 7 })
    expect(d.length).toBe(7)
    expect(d.some((x) => x.newWrongs === 1 && x.redo === 1)).toBe(true)
    expect(d.every((x) => typeof x.key === 'string')).toBe(true)
  })
})
