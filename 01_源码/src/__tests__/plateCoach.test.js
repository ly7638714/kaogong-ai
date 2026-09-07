import { describe, it, expect } from 'vitest'
import { coachOf, wrongExplainPrompt, explainRuleOf } from '../utils/plateCoach'

describe('plateCoach 每板块讲解/错题协议', () => {
  it('六大板块都有规则', () => {
    for (const p of ['判断推理', '言语理解', '资料分析', '数量关系', '常识判断', '政治理论']) {
      expect(coachOf(p)).toBeTruthy()
      expect(coachOf(p).wrong.length).toBeGreaterThan(10)
    }
    expect(coachOf('未知板块')).toBeNull()
  })
  it('错题协议按板块生成且含错因框架', () => {
    const s = wrongExplainPrompt('言语理解', { userPick: 'C' })
    expect(s).toContain('主题词')
    expect(s).toContain('C')
    const g = wrongExplainPrompt('')
    expect(g).toContain('正确判定')
  })
  it('explainRule 预留', () => {
    expect(explainRuleOf('资料分析')).toContain('公式')
  })
})