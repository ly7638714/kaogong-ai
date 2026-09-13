import { describe, it, expect, beforeEach } from 'vitest'
import { checkInToday, currentStreak, loadCheckinState, checkinWeek } from '../utils/checkin'

function memStorage(seed = {}) {
  const m = new Map(Object.entries(seed).map(([k, v]) => [k, String(v)]))
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() }
}

describe('每日打卡与连续天数', () => {
  let storage
  beforeEach(() => { storage = memStorage() })

  it('首次打卡连续 1 天，重复点击不会重复累计', () => {
    const now = new Date(2026, 8, 13, 9, 0, 0)
    const a = checkInToday(storage, now)
    expect(a.added).toBe(true)
    expect(a.state.streak).toBe(1)
    const b = checkInToday(storage, now)
    expect(b.added).toBe(false)
    expect(b.state.streak).toBe(1)
    expect(b.state.total).toBe(1)
  })

  it('连续两天打卡累计 2 天，中断后从 1 重新开始', () => {
    checkInToday(storage, new Date(2026, 8, 12, 9, 0, 0))
    const day2 = checkInToday(storage, new Date(2026, 8, 13, 9, 0, 0))
    expect(day2.state.streak).toBe(2)
    const reset = checkInToday(storage, new Date(2026, 8, 15, 9, 0, 0))
    expect(reset.state.streak).toBe(1)
    expect(reset.state.total).toBe(3)
  })

  it('兼容旧的 xc_streak 数据', () => {
    const old = memStorage({ xc_streak: JSON.stringify({ n: 6, d: '2026-09-12' }) })
    const s = loadCheckinState(old, new Date(2026, 8, 13, 9, 0, 0))
    expect(s.streak).toBe(6)
    const r = checkInToday(old, new Date(2026, 8, 13, 9, 0, 0))
    expect(r.state.streak).toBe(7)
    expect(r.state.total).toBe(7)
  })

  it('过期连续记录显示为 0，打卡后重新为 1', () => {
    const old = memStorage({ xc_streak: JSON.stringify({ n: 9, d: '2026-09-01' }) })
    expect(currentStreak(loadCheckinState(old, new Date(2026, 8, 13)), new Date(2026, 8, 13))).toBe(0)
    expect(checkInToday(old, new Date(2026, 8, 13)).state.streak).toBe(1)
  })

  it('最近七天状态正确标记今天与已打卡日期', () => {
    const now = new Date(2026, 8, 13, 9, 0, 0)
    checkInToday(storage, new Date(2026, 8, 12, 9, 0, 0))
    const r = checkInToday(storage, now)
    const week = checkinWeek(r.state, now)
    expect(week).toHaveLength(7)
    expect(week[6].today).toBe(true)
    expect(week[6].done).toBe(true)
    expect(week[5].done).toBe(true)
  })
})

