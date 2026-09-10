import { describe, it, expect } from 'vitest'
import { normalizeAccItem, poolForSubject, buildDeck, GAME_MODES } from '../utils/accGame'

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

  it('各关卡题型结构正确：闪卡无选项，选择题答案唯一', () => {
    for (const level of [1, 2, 3, 4, 'camp']) {
      const deck = buildDeck('成语', level, 12, { rng: () => 0.42 })
      expect(deck.length).toBe(12)
      deck.forEach((q) => {
        if (q.type === 'flash') {
          expect(q.options.length).toBe(0)
          expect(q.answer).toBe('')
          return
        }
        expect(q.options.length).toBeGreaterThanOrEqual(2)
        expect(q.options.filter((o) => o.ok).length).toBe(1)
        expect(q.options.some((o) => o.k === q.answer)).toBe(true)
      })
    }
  })

  it('记忆闭环包含主动回忆、反向提取、交错辨析和情境迁移', () => {
    const deck = buildDeck('成语', 'camp', 16, { rng: () => 0.42 })
    const types = new Set(deck.map((q) => q.type))
    expect(types.has('flash')).toBe(true)
    expect(types.has('meaning2term') || types.has('term2meaning')).toBe(true)
    expect(types.has('discrimination') || types.has('truefalse')).toBe(true)
    expect(types.has('fill') || types.has('discrimination')).toBe(true)
    expect(deck.every((q) => q.science)).toBe(true)
    expect(new Set(deck.map((q) => q.term)).size).toBeLessThanOrEqual(4)
  })

  it('到期词条模式只抽取传入的 dueTerms', () => {
    const pool = poolForSubject('成语')
    const term = pool[0].term
    const deck = buildDeck('成语', 4, 8, { dueTerms: [term], rng: () => 0.2 })
    expect(deck.length).toBeGreaterThan(0)
    expect(deck.every((q) => q.term === term)).toBe(true)
  })

  it('玩法覆盖主动回忆、交错练习、间隔复习和错误回炉', () => {
    expect(GAME_MODES.map((x) => x.k)).toEqual(expect.arrayContaining(['camp', 'flash', 'contrast', 'srs', 'wrong']))
  })

  it('各分类都有足够词条', () => {
    ;['常识', '政治理论', '时政', '成语', '实词', 'all'].forEach((s) => expect(poolForSubject(s).length).toBeGreaterThan(4))
  })
})
