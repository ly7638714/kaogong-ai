// SRS 学习统计（返工1 回归）：今日复习计数 + 已掌握计数
import { describe, it, expect } from 'vitest'
import { srsReviewedToday, srsMasteredCount } from '../utils/srsStats'

describe('srsStats SRS 学习统计（阶段1返工1 回归）', () => {
  it('reviewedToday：写入 lvl=1 + 今日 last 的记录后计数为 1', () => {
    const srs = { '常识|xxx': { lvl: 1, last: '2026-08-30' } }
    expect(srsReviewedToday(srs, '2026-08-30')).toBe(1)
    // 昨天/明天不算今日
    expect(srsReviewedToday(srs, '2026-08-29')).toBe(0)
    expect(srsReviewedToday(srs, '2026-08-31')).toBe(0)
  })
  it('reviewedToday：兼容时间戳格式（截前10位比较）', () => {
    const srs = { '时政|yyy': { lvl: 1, last: '2026-08-30 17:50:23' } }
    expect(srsReviewedToday(srs, '2026-08-30')).toBe(1)
  })
  it('masteredCount：lvl>=2 计入已掌握，lvl<2 不计', () => {
    const srs = { '成语|A': { lvl: 2 }, '成语|B': { lvl: 1 }, '成语|C': { lvl: 3 } }
    const items = [{ cat: '成语', t: 'A' }, { cat: '成语', t: 'B' }, { cat: '成语', t: 'C' }]
    expect(srsMasteredCount(srs, items)).toBe(2)
  })
  it('masteredCount：按 cat|t 键匹配（常识/时政/成语/实词 前缀各自独立）', () => {
    const srs = { '常识|X': { lvl: 2 }, '实词|X': { lvl: 1 } }
    const items = [{ cat: '常识', t: 'X' }, { cat: '实词', t: 'X' }]
    expect(srsMasteredCount(srs, items)).toBe(1)
  })
  it('空/非法输入不抛错', () => {
    expect(srsReviewedToday(null, '2026-08-30')).toBe(0)
    expect(srsMasteredCount({}, [])).toBe(0)
  })
})
