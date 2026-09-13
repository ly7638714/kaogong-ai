import { describe, it, expect } from 'vitest'
import {
  COACH_OTHER,
  buildCoachFallback,
  buildCoachPayload,
  buildLocalCoachFallback,
  buildOneClickDraft,
  fingerprintCoachContext,
  normalizeCoachState,
  parseCoachPlan,
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

  it('题目指纹只随题目和作答上下文变化，不因错因池或 AI 回复变化', () => {
    const base = { group: '资料分析', sub: '资料分析', type: '增长率', question: '2019年增长多少？', userAnswer: 'A', answer: 'B' }
    const a = fingerprintCoachContext(base)
    const b = fingerprintCoachContext({ ...base, reasons: ['旧错因'], aiReply: '旧解析' })
    const c = fingerprintCoachContext({ ...base, userAnswer: 'C' })
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })

  it('本地兜底按精确细分题型给出不同卡点，而不是统一套逻辑模板', () => {
    const logic = buildCoachFallback({ group: '判断推理', sub: '逻辑判断', type: '削弱型', question: '最能削弱的是？' })
    const data = buildCoachFallback({ group: '资料分析', sub: '资料分析', type: '增长率', question: '同比增长多少？' })
    const logicBlock = logic.steps[1].options.map((x) => x.label).join('|')
    const dataBlock = data.steps[1].options.map((x) => x.label).join('|')
    expect(logicBlock).toContain('结论')
    expect(dataBlock).toContain('数据定位')
    expect(logicBlock).not.toBe(dataBlock)
  })

  it('解析并规范化 AI 三步动态选项', () => {
    const parsed = parseCoachPlan(JSON.stringify({
      notice: '先还原判断过程',
      steps: [
        { id: 'reflect', prompt: '当时怎么想？', options: [{ label: '只抓了熟悉词', hint: '没有还原完整意思' }, { label: '先看选项', hint: '被选项带跑' }] },
        { id: 'block', prompt: '卡在哪？', options: [{ label: '主体看错' }, { label: '范围偷换' }] },
        { id: 'action', prompt: '下次做什么？', options: [{ label: '先圈主体' }, { label: '再对范围' }] }
      ]
    }))
    expect(parsed.steps).toHaveLength(3)
    expect(parsed.steps[0].options[0].hint).toContain('完整')
  })

  it('旧版 first/block/next 可映射为新版 answers，不丢用户原话', () => {
    const rc = normalizeCoachState({ first: COACH_OTHER, firstCustom: '我只看了一半', block: '公式用错', next: '先写公式' }, 'fp1')
    expect(rc.version).toBe(2)
    expect(rc.fingerprint).toBe('fp1')
    expect(rc.answers.reflect).toEqual({ value: COACH_OTHER, custom: '我只看了一半' })
    expect(rc.answers.block.value).toBe('公式用错')
  })

  it('一键草稿保留依据并限制脏字段长度', () => {
    const d = buildOneClickDraft({ answer: 'D', reasons: ['主体看错', '主体看错', '范围偷换'], evidence: ['题干主体是甲'], pattern: '先核对主体' })
    expect(d.answer).toBe('D')
    expect(d.reasons).toEqual(['主体看错', '范围偷换'])
    expect(d.evidence[0]).toContain('甲')
  })
})
