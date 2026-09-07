import { describe, it, expect } from 'vitest'
import { detectAskDir, detectIntent, probe, confusableHints } from '../utils/intentProbe'

describe('P0-1 意图/易混探测 intentProbe', () => {
  it('问法方向：选是/选非', () => {
    expect(detectAskDir('下列错误的是')).toBe('非')
    expect(detectAskDir('下列说法正确的是')).toBe('是')
    expect(detectAskDir('请讲解这题')).toBe('')
  })
  it('子意图识别', () => {
    expect(detectIntent('给我出一道加强题')).toBe('quiz')
    expect(detectIntent('再来一题变式')).toBe('variant')
    expect(detectIntent('我选B，对吗')).toBe('verify')
    expect(detectIntent('这道题我为什么错')).toBe('error')
    expect(detectIntent('这题怎么做这类题的方法是什么')).toBe('method')
    expect(detectIntent('请解析一下这道题')).toBe('explain')
  })
  it('四维 probe：板块/意图/方向', () => {
    const p = probe('这段文字意在说明什么？', { plate: '言语理解' })
    expect(p.plate6).toBe('言语理解')
    expect(p.intent).toBe('solve')
    const q = probe('帮我解析一下这道资料分析增长量题', { plate: '资料分析' })
    expect(q.plate6).toBe('资料分析')
    expect(q.intent).toBe('explain')
  })
  it('资料分析易混提示：增长量 vs 增长率', () => {
    const h1 = confusableHints('资料分析', '2024年比2022年增长了多少亿元？')
    expect(h1.some((x) => x.includes('增长量'))).toBe(true)
    const h2 = confusableHints('资料分析', '求2024年同比增速为多少？')
    expect(h2.some((x) => x.includes('率'))).toBe(true)
  })
  it('判断推理/言语易混提示', () => {
    expect(confusableHints('判断推理', '最能削弱上述结论').some((x) => x.includes('削弱'))).toBe(true)
    expect(confusableHints('言语理解', '这段文字主要说明了什么').some((x) => x.includes('主旨'))).toBe(true)
    expect(confusableHints('常识判断', '随便一句')).toEqual([])
  })
})