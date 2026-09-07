import { describe, it, expect } from 'vitest'
import { kbFlowHead, kbFlowFallback, isMethodOverview } from '../utils/kbFlow'

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
  })})

  it('v2: 剥模式横幅、保留答题流程正文段（不再只剩标题）', () => {
    const kb = '\n【当前模式：言语理解·三师专项 · 深度知识库】\n\n【言语答题流程（每题按此走）】①看提问方式定题型→②定结构→③主题词→④对比择优→⑤答案。\n## 郭熙体系\n1. 中心理解三步…'
    const h = kbFlowHead(kb)
    expect(h).not.toContain('当前模式')
    expect(h).toContain('答题流程')
    expect(h).toContain('⑤')
    expect(h).not.toContain('郭熙体系')
  })
  it('v2: 流程类括号不误伤且超长截断', () => {
    const h = kbFlowHead('【数量答题流程（每题按此走）】\n【底层逻辑·必守】先秒杀再硬算。\n1. 先看选项气质 2. 断子考点')
    expect(h).toContain('底层逻辑')
    expect(h.length).toBeLessThan(500)
  })
  it('手工精校兜底：判断推理 luoji 流程可随时取用且有界', () => {
    const fb = kbFlowFallback('luoji')
    expect(fb).toContain('答题流程')
    expect(fb.length).toBeLessThanOrEqual(460)
    expect(kbFlowFallback('yanyu')).toBe('')
  })
