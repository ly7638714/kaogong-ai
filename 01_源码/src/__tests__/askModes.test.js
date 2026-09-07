import { describe, it, expect } from 'vitest'
import { ASK_MODES, MODE_MAP, askModeSys, wizardHas, detectMode } from '../data/askModes'
import { PLATE_TREE } from '../data/plateMatrix'

describe('askModes 意图层与向导可用性', () => {
  it('四层意图齐全且 solve 为空提示', () => {
    expect(ASK_MODES.length).toBe(5)
    expect(askModeSys('solve')).toBe('')
    expect(MODE_MAP.wrong.label).toContain('错题')
  })
  it('意图映射生成提示', () => {
    expect(askModeSys('retell')).toContain('讲透彻')
    expect(askModeSys('pits')).toContain('易错')
    expect(askModeSys('sum')).toContain('总结')
    expect(askModeSys('wrong')).toContain('错因')
  })
  it('向导层级可用性', () => {
    const r1 = wizardHas(PLATE_TREE, '判断推理')
    expect(r1.l2).toBe(true)
    const r2 = wizardHas(PLATE_TREE, '言语理解', '片段阅读')
    expect(r2.l3).toBe(true)
  })
  it('detectMode 泛化口吻识别意图', () => {
    expect(detectMode('这题再详细讲讲，我没懂')).toBe('retell')
    expect(detectMode('这类题有哪些易错点')).toBe('pits')
    expect(detectMode('帮我总结下这个考点的口诀')).toBe('sum')
    expect(detectMode('这题怎么做')).toBe('')
  })
})