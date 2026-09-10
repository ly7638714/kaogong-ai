import { describe, it, expect } from 'vitest'
import { normalizeAccItem, poolForSubject, buildDeck } from '../utils/accGame'

describe('accGame 记忆闯关题库', () => {
  it('解析冒号式常识词条', () => {
    const x = normalizeAccItem({ t: '新发展格局：以国内大循环为主体。', cat: '政治理论' }, '政治理论')
    expect(x.term).toBe('新发展格局')
    expect(x.meaning).toContain('国内大循环')
  })

  it('成语池使用结构化释义', () => {
    const x = normalizeAccItem({ t: '浅尝辄止', yishi: '略微尝试就停止，不深入。', lj: '学习不能浅尝辄止。' }, '成语')
    expect(x.term).toBe('浅尝辄止')
    expect(x.meaning).toContain('不深入')
    expect(x.context).toContain('不能')
  })

  it('四类关卡都能生成四选项题且答案唯一', () => {
    for (const level of [1, 2, 3, 4]) {
      const deck = buildDeck('成语', level, 12, { rng: () => 0.42 })
      expect(deck.length).toBe(12)
      deck.forEach((q) => {
        expect(q.options.length).toBeGreaterThanOrEqual(2)
        expect(q.options.filter((o) => o.ok).length).toBe(1)
        expect(q.options.some((o) => o.k === q.answer)).toBe(true)
      })
    }
  })

  it('各分类都有足够词条', () => {
    ;['常识', '政治理论', '时政', '成语', '实词', 'all'].forEach((s) => expect(poolForSubject(s).length).toBeGreaterThan(4))
  })
})
