// dailyPlan（v3.8.189）回归
import { describe, it, expect } from 'vitest'
import { todayProgress, planStatus, weekMini, DEFAULT_PLAN, markMorningDone, morningDoneToday } from '../utils/dailyPlan'
const t = () => Date.now()
describe('todayProgress', () => {
  it('按今天统计 做题/复盘/时长/到期', () => {
    const p = todayProgress({
      attempts: [{ t: t() }, { t: t() - 86400000 }],
      wqs: [{ reviewedAt: t() }, { reviewedAt: t() - 86400000 }, { digested: true, dueAt: t() - 1 }],
      study: {}
    })
    expect(p.q).toBe(1)
    expect(p.rev).toBe(1)
    expect(p.due).toBe(1)
    expect(p.minutes).toBe(0)
  })
})
describe('planStatus', () => {
  it('默认目标与部分/全部达标', () => {
    expect(DEFAULT_PLAN.quiz).toBeGreaterThan(0)
    const part = planStatus({}, { q: 4, rev: 0, minutes: 10 })
    expect(part.allDone).toBe(false)
    const full = planStatus({}, { q: 99, rev: 99, minutes: 999 })
    expect(full.allDone).toBe(true)
    expect(full.pct).toBe(100)
  })
})
describe('weekMini', () => {
  it('返回最近 7 天且总数为0安全', () => {
    const w = weekMini({ attempts: [{ t: t() }], wqs: [], study: {} })
    expect(w.length).toBe(7)
    expect(w[6].total).toBe(1)
    expect(w[6].label).toBe('今')
    expect(weekMini({}).length).toBe(7)
  })
})

describe('morningDone（晨练打卡）', () => {
  it('mark 后当天为已完成，未 mark 为否', () => {
    const mem = {}
    globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v) }, removeItem: (k) => { delete mem[k] } }
    expect(morningDoneToday()).toBe(false)
    markMorningDone()
    expect(morningDoneToday()).toBe(true)
  })
})
