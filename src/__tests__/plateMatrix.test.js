import { describe, it, expect } from 'vitest'
import { PLATE_TREE, matchSub, routePlate } from '../data/plateMatrix'

describe('plateMatrix 板块细分矩阵', () => {
  it('六大板块细分齐全', () => {
    expect(Object.keys(PLATE_TREE).length).toBe(6)
    expect(PLATE_TREE['判断推理']['逻辑判断'].length).toBeGreaterThanOrEqual(3)
    expect(PLATE_TREE['言语理解']['片段阅读'].length).toBeGreaterThanOrEqual(6)
    expect(PLATE_TREE['资料分析']['特殊增长率'].length).toBeGreaterThanOrEqual(3)
  })
  it('细分信号词命中', () => {
    expect(matchSub('最能削弱上述结论')).toBe('逻辑判断')
    expect(matchSub('这段文字意在说明')).toBe('片段阅读')
    expect(matchSub('求两期比重差')).toBe('结构类')
  })
  it('routePlate 返回细分与题型列表', () => {
    const r = routePlate('言语理解', '', '填入横线最恰当')
    expect(['逻辑填空', '语句表达'].includes(r.sub)).toBe(true)
    expect(Array.isArray(r.types)).toBe(true)
  })
})