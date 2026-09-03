import { describe, it, expect } from 'vitest'
import { kbFlowHead, isMethodOverview } from '../utils/kbFlow'

describe('S1 kbFlow 流程头抽取', () => {
  it('抽取首段并限长', () => {
    const kb = '【言语答题流程】①定题型→②定结构→③主题词→④对比择优→⑤答案。\n## 郭熙体系\n1. 中心理解三步…'
    const h = kbFlowHead(kb)
    expect(h).toContain('定题型')
    expect(h).not.toContain('郭熙体系')
    expect(h.length).toBeLessThan(500)
  })
  it('空输入返回空', () => {
    expect(kbFlowHead('')).toBe('')
  })
  it('超长截断并加省略号', () => {
    const h = kbFlowHead('a'.repeat(900))
    expect(h.endsWith('…')).toBe(true)
  })
  it('总览问法判定', () => {
    expect(isMethodOverview('言语理解的方法论是什么')).toBe(true)
    expect(isMethodOverview('这题怎么做')).toBe(false)
  })
})