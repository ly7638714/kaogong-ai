// dataTrainTips（v3.8.200）回归：三锁定高亮 + 真实口径参考
import { describe, it, expect } from 'vitest'
import { lockHighlights, REAL_REF, findLockWords } from '../utils/dataTrainTips'

describe('lockHighlights', () => {
  it('给时间/指标/单位加粗，关闭时不改', () => {
    const md = '2024年粮食产量70650万吨，同比提高1.6%'
    const on = lockHighlights(md, true)
    expect(on).toContain('**2024年**')
    expect(on).toContain('**同比**')
    expect(on).toContain('**70650万吨**')
    expect(on).toContain('**1.6%**')
    expect(lockHighlights(md, false)).toBe(md)
  })
  it('REAL_REF 提供关键来源样例', () => {
    expect(REAL_REF['国家统计局 · 粮食']).toContain('70650')
  })
})

describe('findLockWords', () => {
  it('抽取 时间/指标/单位 定位词', () => {
    const r = findLockWords('2024年粮食产量70650万吨，同比提高1.6%')
    expect(r.time).toContain('2024年')
    expect(r.ind).toContain('同比')
    expect(r.unit.join(' ')).toContain('70650万吨')
  })
})
