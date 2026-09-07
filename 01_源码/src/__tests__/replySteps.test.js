// replySteps（v3.8.190）回归
import { describe, it, expect } from 'vitest'
import { hasStepHeadings, countSteps, listSections } from '../utils/replySteps'

describe('replySteps', () => {
  it('识别解题小节并兜底无小节', () => {
    const ok = '## 考点\n转折结构\n## 解题步骤\n1. 找转折词\n2. 对比选项\n## 一句话小结\n答案选 B'
    expect(hasStepHeadings(ok)).toBe(true)
    expect(hasStepHeadings('这是一般回答，没有小节')).toBe(false)
    expect(hasStepHeadings('')).toBe(false)
  })
  it('步骤计数与小节清单', () => {
    const s = '## 考点\n…\n## 解题步骤\n1. 先看结论\n2. 再比力度\n## 干扰项\nA 无关'
    expect(countSteps(s)).toBe(2)
    const secs = listSections(s)
    expect(secs).toContain('考点')
    expect(secs).toContain('干扰项')
  })
})
