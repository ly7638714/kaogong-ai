import { describe, it, expect } from 'vitest'
import { weakPlates, wrongTotal, profileLine } from '../utils/petProfile'

describe('P2 petProfile 错题画像', () => {
  it('按板块统计最弱前二', () => {
    const wqs = [{ plate: '资料分析' }, { plate: '资料分析' }, { plate: '数量关系' }, { plate: '言语理解' }]
    const w = weakPlates(wqs, 2)
    expect(w[0].plate).toBe('资料分析')
    expect(w[0].n).toBe(2)
    expect(w.length).toBe(2)
  })
  it('无错题返回空', () => {
    expect(weakPlates([], 2)).toEqual([])
    expect(profileLine([])).toBe('')
  })
  it('profileLine 汇总一句话', () => {
    const s = profileLine([{ plate: '资料分析' }], 1)
    expect(s).toContain('资料分析')
    expect(s).toContain('错1')
  })
})