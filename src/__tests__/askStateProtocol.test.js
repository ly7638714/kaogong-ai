import { describe, it, expect } from 'vitest'
import { classifyTurn, nextContext, questionFp } from '../utils/askState'
import { scenarioPrompt, buildScenarioPrompt, SCENARIO, batchScenarioPrompt, sortScenarioPrompt, typeFirstPrompt, honestyPrompt } from '../utils/replyProtocol'
import { taskShape, detectQuestionCount } from '../utils/intentProbe'

describe('P0-1b askState 换题/追问状态机', () => {
  it('追问(短句+指代)锁定上一轮板块', () => {
    const prev = { plate6: '资料分析', sub: '增长率', text: '2024年同比增速为多少？' }
    const cur = { plate6: '', sub: '', text: '那第2小问呢？' }
    const r = nextContext(prev, cur)
    expect(r.kind).toBe('followup')
    expect(r.plate6).toBe('资料分析')
    expect(r.keepPrev).toBe(true)
  })
  it('换板块是新题', () => {
    const prev = { plate6: '资料分析', sub: '', text: '…资料题…' }
    const cur = { plate6: '言语理解', sub: '', text: '这段文字意在说明？' }
    expect(classifyTurn(prev, cur).kind).toBe('newQ')
  })
  it('同板块换题型也算新题', () => {
    const prev = { plate6: '数量关系', sub: '工程', text: '工程题…' }
    const cur = { plate6: '数量关系', sub: '浓度', text: '浓度题…' }
    expect(classifyTurn(prev, cur).kind).toBe('newQ')
  })
  it('questionFp 稳定生成指纹', () => {
    const f1 = questionFp({ plate6: '数量关系', sub: '工程' }, '请帮我解这道工程题')
    expect(f1).toContain('数量关系')
  })
})

describe('P0-2 replyProtocol 分场景回复协议', () => {
  it('场景链存在且有序', () => {
    expect(SCENARIO.method.length).toBeGreaterThanOrEqual(3)
    expect(SCENARIO.quiz.join('')).toContain('答案')
  })
  it('scenarioPrompt 生成带序号的片段', () => {
    const s = scenarioPrompt('variant')
    expect(s).toContain('变式')
    expect(s).toContain('1.')
  })
  it('method 类提问触发方法协议', () => {
    const s = buildScenarioPrompt('这类工程题通用方法是什么？', { plate: '数量关系' })
    expect(s).toContain('方法总结')
  })
  it('quiz 类提问触发只出题协议', () => {
    const s = buildScenarioPrompt('给我出一道削弱题', { plate: '判断推理' })
    expect(s).toContain('只出题')
  })
  it('普通求解不触发额外场景(已有 INTENT_SYS 覆盖)', () => {
    expect(buildScenarioPrompt('帮我解这道行程题', { plate: '数量关系' })).toBe('')
  })
})
describe('P-A 任务形态识别 taskShape / 批答·排序协议', () => {
  it('题量估计：多选项组识别', () => {
    expect(detectQuestionCount('', { imgRead: '\n1. 题干\nA. x B. y C. z D. w\n2. 题干2\nA. a B. b C. c D. d' })).toBeGreaterThanOrEqual(2)
  })
  it('泛问→genericHow；多题词→batchN；单题指代→deepOne', () => {
    expect(taskShape('这种言语题怎么做').kind).toBe('genericHow')
    expect(taskShape('这几道题都做一下').kind).toBe('batchN')
    expect(taskShape('帮我解这道行程题').kind).toBe('deepOne')
  })
  it('排序问法标 sort', () => {
    expect(taskShape('这6句话排序，语序正确的是').sort).toBe(true)
  })
  it('批答/排序协议含关键约束', () => {
    expect(batchScenarioPrompt(6)).toContain('题号')
    expect(batchScenarioPrompt(6)).toContain('？')
    expect(sortScenarioPrompt()).toContain('首句')
  })

  it('typeFirstPrompt 含判型与主题词要求', () => {
    const s = typeFirstPrompt()
    expect(s).toContain('题型')
    expect(s).toContain('主题词')
  })

  it('honestyPrompt 含不确定与争议处理', () => {
    const s = honestyPrompt()
    expect(s).toContain('？')
    expect(s).toContain('备选')
  })
})