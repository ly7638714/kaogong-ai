import { describe, it, expect } from 'vitest'
import {
  COACH_OTHER,
  buildCoachPayload,
  buildLocalCoachFallback,
  parseCoachAiReply,
  resolveCoachChoice
} from '../utils/wrongReasonCoach'

describe('wrongReasonCoach 分步复盘整理', () => {
  it('每一步都支持“其他（自写）”，并能保留用户原话', () => {
    expect(resolveCoachChoice(COACH_OTHER, '我把选项主体看反了')).toBe('我把选项主体看反了')
    expect(buildCoachPayload({
      first: COACH_OTHER,
      firstCustom: '读题时只抓了熟悉词',
      block: '结论找错了',
      next: COACH_OTHER,
      nextCustom: '先圈结论，再看论据',
      reflection: '下次要复述完整意思'
    })).toEqual({
      first: '读题时只抓了熟悉词',
      block: '结论找错了',
      next: '先圈结论，再看论据',
      reflection: '下次要复述完整意思'
    })
  })

  it('解析 AI JSON，并限制错因数量与异常字段', () => {
    const parsed = parseCoachAiReply('```json\n{"reasons":["A","B","C","D"],"pattern":"先定主体","analysis":"失分链：主体→范围"}\n```')
    expect(parsed.reasons).toEqual(['A', 'B', 'C'])
    expect(parsed.pattern).toBe('先定主体')
    expect(parsed.analysis).toBe('失分链：主体→范围')
  })

  it('AI 不可用时生成可落库的本地兜底错因、规律、笔记与解析', () => {
    const out = buildLocalCoachFallback({
      first: '只看了局部关键词',
      block: '分不清结论和论据',
      next: '先复述结论再比较选项',
      reflection: '我总急着看选项'
    })
    expect(out.reasons.length).toBe(3)
    expect(out.reasons[0]).toContain('只看了局部关键词')
    expect(out.pattern).toContain('先复述结论再比较选项')
    expect(out.note).toContain('我总急着看选项')
    expect(out.analysis).toContain('分不清结论和论据')
  })
})
