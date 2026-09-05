// historyDigest（长历史自动摘要）回归
import { describe, it, expect } from 'vitest'
import { digestOlder } from '../utils/historyDigest'
describe('historyDigest', () => {
  it('足够短时不产出摘要', () => {
    const msgs = Array.from({ length: 8 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: '消息' + i }))
    const r = digestOlder(msgs, { keep: 10 })
    expect(r.text).toBe('')
  })
  it('超出保留条数时压缩更早内容并标注', () => {
    const msgs = []
    for (let i = 0; i < 30; i++) msgs.push({ role: i % 2 ? 'assistant' : 'user', content: '第' + i + '轮内容片段' })
    const r = digestOlder(msgs, { keep: 6 })
    expect(r.text).toContain('更早内容')
    expect(r.text).toContain('用户问：')
    expect(r.summarizedN).toBeGreaterThan(0)
  })
  it('跳过 live/状态消息', () => {
    const msgs = [
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
      { role: 'assistant', content: '❌ 请求失败', live: false },
      { role: 'assistant', content: '⏳ 正在生成', live: true }
    ]
    const r = digestOlder(msgs, { keep: 1 })
    expect(r.text).not.toContain('请求失败')
  })
  it('尊重字符上限', () => {
    const msgs = []
    for (let i = 0; i < 60; i++) msgs.push({ role: i % 2 ? 'assistant' : 'user', content: '很长很长的内容片段用来测试上限' })
    const r = digestOlder(msgs, { keep: 2, cap: 300 })
    expect(r.text.length).toBeLessThanOrEqual(320)
  })
})
