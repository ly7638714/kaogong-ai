import { describe, it, expect } from 'vitest'
import { absorbState, absorbSummary } from '../utils/wrongAbsorb'

describe('wrongAbsorb 错题吸收度', () => {
  it('空白错题只给出下一步动作', () => {
    const r = absorbState({ question: 'q', wrongCount: 1 })
    expect(r.score).toBe(0)
    expect(r.next.k).toBe('answer')
    expect(r.level).toBe('待吃透')
  })

  it('六个动作完整时判为已吃透', () => {
    const r = absorbState({
      answer: 'C',
      reasons: ['因果倒置'],
      absorb: { kp: '论证结构', skeleton: '论点-论据' },
      method: '先画论证骨架',
      variantStats: { total: 3, ok: 3 },
      correctStreak: 2,
      reviewed: true,
      wrongCount: 1,
      reviewStats: { r: 2, e: 0 }
    })
    expect(r.steps.every((s) => s.done)).toBe(true)
    expect(r.score).toBe(100)
    expect(r.level).toBe('已吃透')
    expect(r.next).toBe(null)
  })

  it('复错会拉低吸收度并汇总薄弱数量', () => {
    const q = { answer: 'A', reasons: ['粗心'], method: '慢读', wrongCount: 4, reviewStats: { r: 0, e: 3 } }
    const r = absorbState(q)
    expect(r.score).toBeLessThan(50)
    const s = absorbSummary([q])
    expect(s.total).toBe(1)
    expect(s.weak).toBe(1)
  })
})
