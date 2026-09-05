// memorySrs（今日复习中枢·记忆侧）回归：到期列表与 remember 双态
import { describe, it, expect } from 'vitest'
import { dueMemoryItems, rememberOne, ymdKey, addDaysKey, SRS_INT, enqueueNew, freshPoolItems } from '../utils/memorySrs'

describe('memorySrs', () => {
  it('dueMemoryItems：只列已学且到期；未到期/无记录不列', () => {
    const srs = {
      '成语|A': { lvl: 1, due: '2026-09-04' },
      '常识|B': { lvl: 2, due: '2026-09-06' },
      '实词|C': { lvl: 0, due: '2026-09-05' }
    }
    const due = dueMemoryItems(srs, '2026-09-05')
    expect(due.length).toBe(2)
    expect(due.map((x) => x.title).sort()).toEqual(['A', 'C'])
    expect(due[0].cat).toBeTruthy()
  })
  it('rememberOne 记住升档排期 / 忘记降级明天', () => {
    let srs = {}
    const t = '2026-09-05'
    const r1 = rememberOne(srs, '成语', 'A', true, t)
    expect(r1.lvl).toBe(1)
    expect(r1.due).toBe(addDaysKey(t, SRS_INT[0]))
    expect(r1.key).toBe('成语|A')
    const r2 = rememberOne(srs, '成语', 'A', true, t)
    expect(r2.lvl).toBe(2)
    const r3 = rememberOne(srs, '成语', 'A', false, t)
    expect(r3.lvl).toBe(0)
    expect(r3.due).toBe(addDaysKey(t, 1))
  })
  it('ymdKey / addDaysKey 边界', () => {
    expect(ymdKey(new Date(2026, 8, 5))).toBe('2026-09-05')
    expect(addDaysKey('2026-09-05', 30)).toBe('2026-10-05')
  })
})
describe('enqueueNew（错题一键入记忆）', () => {
  it('写入 cat|title，lvl0 / due=今天，空标题安全', () => {
    const srs = {}
    const out = enqueueNew(srs, '我的错题', '秒杀：削弱优先拆桥', '2026-09-05')
    expect(out.key).toBe('我的错题|秒杀：削弱优先拆桥')
    expect(srs[out.key]).toEqual({ lvl: 0, due: '2026-09-05', last: '2026-09-05' })
    const e2 = enqueueNew(srs, '我的错题', '', '2026-09-05')
    expect(e2.key).toBe(null)
  })
})

describe('freshPoolItems（学新词条）', () => {
  it('按分类只列未学过、限量；学过即排除', () => {
    const pool = [{ pool: '成语', t: 'A' }, { pool: '成语', t: 'B' }, { pool: '实词', t: 'C' }]
    const srs = { '成语|A': { lvl: 1 } }
    const out = freshPoolItems(pool, srs, '成语', 8)
    expect(out.map(x => x.title)).toEqual(['B'])
    expect(freshPoolItems(pool, srs, '实词', 8).map(x => x.title)).toEqual(['C'])
    expect(freshPoolItems(pool, {}, '成语', 1).length).toBe(1)
  })
})
