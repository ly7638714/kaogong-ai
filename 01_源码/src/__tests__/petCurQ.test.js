import { describe, it, expect, beforeEach, vi } from 'vitest'
import { store } from '../store'

// mock chatOnce so petAsk / petAnalyzeCurrent don't hit network
vi.mock('../api/client', () => ({ chatOnce: vi.fn(async () => 'mock-reply'), setCostCtx: vi.fn() }))
import { petBuildQContext, petAnalyzeCurrent, petAsk, petChat, petSpeakReply, petBuildKnowledge, petDetectPlate } from '../utils/pet'
import { chatOnce } from '../api/client'

const Q = {
  plate: '图形推理', subject: '图形推理', kind: '九宫格', answer: 'B',
  stem: '观察图形规律，选最合适的一项。',
  options: [{ t: '图A' }, { t: '图B' }, { t: '图C' }, { t: '图D' }],
  explain: '黑点每次右移一格，故选 B。',
  your: 'C', ok: false
}

describe('petBuildQContext 萌宠「看见」当前题', () => {
  it('包含板块/题干/选项/你的答案/正确答案/解析', () => {
    const s = petBuildQContext(Q)
    expect(s).toContain('图形推理')
    expect(s).toContain('观察图形规律')
    expect(s).toContain('A、图A')
    expect(s).toContain('用户已选：C')
    expect(s).toContain('正确答案：B')
    expect(s).toContain('黑点每次右移一格')
  })
  it('空对象返回空串', () => {
    expect(petBuildQContext(null)).toBe('')
    expect(petBuildQContext({})).toBe('')
  })
})

describe('petAnalyzeCurrent 答错实时错因分析', () => {
  beforeEach(() => {
    store.curQ = { ...Q }
    store.cfg.text = { prov: 'ds', key: 'k', model: 'deepseek-v4-flash' }
    petChat.value = []
    petSpeakReply.value = false
    vi.mocked(chatOnce).mockClear()
    vi.mocked(chatOnce).mockResolvedValue('你掉进了「移动方向看反」的坑：黑点是右移不是左移，下次先定方向再数步数。加油！')
  })
  it('调用快模型并把分析加入萌宠对话', async () => {
    const r = await petAnalyzeCurrent()
    expect(r).toContain('移动方向')
    expect(petChat.value.some((m) => m.role === 'user')).toBe(true)
    expect(petChat.value.some((m) => m.role === 'pet' && m.text.includes('移动方向'))).toBe(true)
    const callMsg = vi.mocked(chatOnce).mock.calls[0][1].find((m) => m.role === 'user').content
    expect(callMsg).toContain('掉进什么坑')
    expect(callMsg).toContain('正确答案：B')
  })
  it('无当前题时返回空并提示', async () => {
    store.curQ = null
    const r = await petAnalyzeCurrent()
    expect(r).toBe('')
    expect(vi.mocked(chatOnce)).not.toHaveBeenCalled()
  })
})

describe('petAsk 对话可追问当前题错因', () => {
  beforeEach(() => {
    store.curQ = { ...Q }
    store.cfg.text = { prov: 'ds', key: 'k', model: 'deepseek-v4-flash' }
    petChat.value = []
    petSpeakReply.value = false
    vi.mocked(chatOnce).mockClear()
    vi.mocked(chatOnce).mockResolvedValue('这道题掉在九宫格叠加方向上了，记住黑+黑=白。')
  })
  it('用户问“当前这道题掉什么坑”时注入题目上下文', async () => {
    await petAsk('当前这道题我掉什么坑了？')
    const callMsg = vi.mocked(chatOnce).mock.calls[0][1].find((m) => m.role === 'user').content
    expect(callMsg).toContain('当前题目上下文')
    expect(callMsg).toContain('观察图形规律')
    expect(callMsg).toContain('用户问题：当前这道题我掉什么坑了？')
    expect(petChat.value.some((m) => m.role === 'pet')).toBe(true)
  })
  it('无当前题时不注入上下文', async () => {
    store.curQ = null
    await petAsk('今天学什么？')
    const callMsg = vi.mocked(chatOnce).mock.calls[0][1].find((m) => m.role === 'user').content
    expect(callMsg).not.toContain('当前题目上下文')
  })
})

describe('萌宠通晓全板块名师方法论与知识库', () => {
  it('petBuildKnowledge 按板块注入对应名师方法（图推=刘义恒五眼）', () => {
    const kb = petBuildKnowledge('图形推理')
    expect(kb).toContain('名师方法论')
    expect(kb.length).toBeGreaterThan(1000)
  })
  it('逻辑判断板块注入薛睿体系', () => {
    expect(petBuildKnowledge('逻辑判断')).toContain('薛睿')
  })
  it('资料分析板块注入小P四大神器', () => {
    expect(petBuildKnowledge('资料分析')).toContain('资料分析')
  })
  it('petDetectPlate 优先取当前题板块，其次对话模式', () => {
    store.curQ = { plate: '资料分析' }
    store.mode = 'tutu'
    expect(petDetectPlate()).toBe('资料分析')
    store.curQ = null
    store.mode = 'tutu'
    expect(petDetectPlate()).toBe('图形推理')
    store.mode = 'all'
    expect(petDetectPlate()).toBe('')
  })
  it('petAsk 系统提示包含名师方法论知识库', async () => {
    store.curQ = { plate: '图形推理' }
    store.cfg.text = { prov: 'ds', key: 'k', model: 'deepseek-v4-flash' }
    petChat.value = []
    petSpeakReply.value = false
    vi.mocked(chatOnce).mockClear()
    vi.mocked(chatOnce).mockResolvedValue('按刘义恒五眼，先看元素组成。')
    await petAsk('图形推理怎么快速看？')
    const sys = vi.mocked(chatOnce).mock.calls[0][1].find((m) => m.role === 'system').content
    expect(sys).toContain('名师方法论')
    expect(sys).toContain('图形推理')
    expect(sys).toContain('记忆库')
  })
})
