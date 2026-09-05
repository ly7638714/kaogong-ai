// reviewHub（今日复习中枢汇总）回归
import { describe, it, expect } from 'vitest'
import { wrongDueOf, hubSnapshot } from '../utils/reviewHub'

describe('reviewHub', () => {
  it('wrongDueOf：只列已消化且已到期', () => {
    const now = Date.now()
    const wqs = [
      { digested: true, dueAt: now - 1000 },
      { digested: true, dueAt: now + 999999 },
      { digested: false, dueAt: now - 5 },
      { digested: true }
    ]
    const due = wrongDueOf(wqs, now)
    expect(due.length).toBe(1)
  })
  it('hubSnapshot：两队列计数与 total', () => {
    const now = Date.now()
    const d = new Date(now)
    const ymd = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    const snap = hubSnapshot({
      wqs: [{ digested: true, dueAt: now - 1 }],
      srs: { '成语|A': { lvl: 1, due: ymd } },
      now
    })
    expect(snap.wrongN).toBe(1)
    expect(snap.memoryN).toBe(1)
    expect(snap.total).toBe(2)
    expect(snap.wrongDue.length).toBe(1)
    expect(snap.memoryDue.length).toBe(1)
  })
})