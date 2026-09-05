// wrongKnowledge（R5）回归：命中与空安全（只读 kb）
import { describe, it, expect } from 'vitest'
import { linkCardsOf } from '../utils/wrongKnowledge'

describe('linkCardsOf', () => {
  it('判断推理含"削弱"题干 → 命中关联卡且限长', () => {
    const cards = linkCardsOf({ subject: '判断推理', question: '以下哪项最能削弱上述结论？研究发现喝咖啡者心脏病比例低。' }, 3)
    expect(Array.isArray(cards)).toBe(true)
    expect(cards.length).toBeGreaterThan(0)
    expect(cards.length).toBeLessThanOrEqual(3)
    expect(cards[0].id).toBeTruthy()
  })
  it('空安全：无板块/无题干返回 []', () => {
    expect(linkCardsOf(null)).toEqual([])
    expect(linkCardsOf({ subject: '判断推理', question: '' })).toEqual([])
  })
})