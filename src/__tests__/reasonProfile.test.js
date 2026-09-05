// reasonProfile（R4）回归：聚合/复错/排序/过滤
import { describe, it, expect } from 'vitest'
import { reasonProfile, wqsOfReason } from '../utils/reasonProfile'

describe('reasonProfile', () => {
  it('按错因聚合 次数/复错/板块/最近，并按 score 排序取 Top', () => {
    const wqs = [
      { subject: '判断推理', reasons: ['因果倒置', '力度排序'], reviewStats: { e: 1 } },
      { subject: '判断推理', reasons: ['因果倒置'], reviewStats: { e: 1 } },
      { subject: '言语理解', reasons: ['无中生有'] }
    ]
    const rows = reasonProfile(wqs, { top: 8 })
    expect(rows.length).toBe(3)
    const g = rows.find((r) => r.reason === '因果倒置')
    expect(g.n).toBe(2)
    expect(g.e).toBe(2)
    expect(rows[0].reason).toBe('因果倒置')
    expect(rows.every((r) => r.score >= 0)).toBe(true)
  })
  it('Top 截断与空安全', () => {
    expect(reasonProfile([])).toEqual([])
    expect(reasonProfile(null)).toEqual([])
  })
  it('wqsOfReason 精确过滤', () => {
    const wqs = [{ reasons: ['A'] }, { reasons: ['B', 'A'] }, { reasons: [] }]
    expect(wqsOfReason(wqs, 'A').length).toBe(2)
    expect(wqsOfReason(wqs, '')).toEqual([])
  })
})