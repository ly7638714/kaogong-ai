import { describe, it, expect } from 'vitest'
import { KNOWLEDGE_CARDS, KB_LAYERS, cardById, searchCards, cardForQuiz } from '../utils/dataTrainLib'
import { CALC_METHOD_LIB } from '../utils/dataTrainGen'

describe('dataTrainLib 双师知识库', () => {
  it('卡片总数在 40-60 之间，且四层均有覆盖', () => {
    expect(KNOWLEDGE_CARDS.length).toBeGreaterThanOrEqual(40)
    expect(KNOWLEDGE_CARDS.length).toBeLessThanOrEqual(60)
    const layers = new Set(KNOWLEDGE_CARDS.map((c) => c.layer))
    expect(layers.has('type')).toBe(true)
    expect(layers.has('locate')).toBe(true)
    expect(layers.has('formula')).toBe(true)
    expect(layers.has('calc')).toBe(true)
    expect(KB_LAYERS).toHaveLength(4)
  })

  it('每张卡必填字段齐全、来源合法、id 唯一', () => {
    const ids = new Set()
    for (const c of KNOWLEDGE_CARDS) {
      expect(c.id).toBeTruthy()
      expect(ids.has(c.id)).toBe(false)
      ids.add(c.id)
      expect(['type', 'locate', 'formula', 'calc']).toContain(c.layer)
      expect(['LY', '小P', '双师']).toContain(c.source)
      expect(String(c.title).length).toBeGreaterThan(2)
      expect(String(c.principle).length).toBeGreaterThan(10)
      expect(String(c.scene).length).toBeGreaterThan(5)
      expect(Array.isArray(c.steps)).toBe(true)
      expect(c.steps.length).toBeGreaterThanOrEqual(3)
      expect(String(c.tip)).toContain('口诀')
      expect(c.example && String(c.example.q).length).toBeGreaterThan(5)
      expect(Array.isArray(c.tags)).toBe(true)
    }
  })

  it('searchCards 按关键词/层/来源过滤正确，空结果不报错', () => {
    expect(searchCards('化除为乘').length).toBeGreaterThanOrEqual(1)
    expect(searchCards('', 'calc').every((c) => c.layer === 'calc')).toBe(true)
    expect(searchCards('', undefined, '小P').every((c) => c.source === '小P')).toBe(true)
    expect(searchCards('', 'calc', '小P').every((c) => c.layer === 'calc' && c.source === '小P')).toBe(true)
    expect(searchCards('不存在的关键词xyz').length).toBe(0)
    expect(searchCards('', 'type', '小P')).toBeInstanceOf(Array)
  })

  it('cardById 命中与未命中', () => {
    expect(cardById('c8').title).toBeTruthy()
    expect(cardById('not-exist')).toBeNull()
  })

  it('cardForQuiz：速算方法名与题型名都能映射到存在的卡', () => {
    const methodNames = Object.keys(CALC_METHOD_LIB)
    expect(methodNames.length).toBeGreaterThanOrEqual(9)
    for (const name of methodNames) {
      const card = cardForQuiz(name)
      expect(card, '速算方法 ' + name + ' 未映射').toBeTruthy()
      expect(card.id).toBeTruthy()
    }
    const typeNames = ['基期量', '现期量', '增长量', '增长率', '间隔增长率', '年均增长率', '现期比重', '基期比重', '两期比重差', '平均数', '平均数增长率', '倍数', '混合增长率', '综合分析']
    for (const name of typeNames) {
      expect(cardForQuiz(name), '题型 ' + name + ' 未映射').toBeTruthy()
    }
    expect(cardForQuiz('未知')).toBeNull()
  })
})
