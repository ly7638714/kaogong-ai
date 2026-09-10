import { describe, it, expect } from 'vitest'
import { subsForGroup, typesForSub } from '../utils/wrongFilterHierarchy'

describe('wrongFilterHierarchy 错题筛选三级联动', () => {
  it('未选大板块时不展开任何细分', () => {
    expect(subsForGroup('')).toEqual([])
  })

  it('判断推理只展开自己的四个细分', () => {
    const subs = subsForGroup('判断推理')
    expect(subs).toEqual(['图形推理', '定义判断', '类比推理', '逻辑判断'])
    expect(subs).not.toContain('片段阅读')
    expect(subs).not.toContain('资料分析')
  })

  it('未选细分时不展开任何题型', () => {
    expect(typesForSub('')).toEqual([])
  })

  it('逻辑判断只列本细分题型，不混入言语/资料题型', () => {
    const types = typesForSub('逻辑判断')
    expect(types.length).toBeGreaterThan(0)
    expect(types).not.toContain('中心理解')
    expect(types).not.toContain('现期比重')
  })
})
