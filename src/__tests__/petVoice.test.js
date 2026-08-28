
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { buildWrongAnalysis, petNextSpeed, petFastCfg, petReadCurrent } from '../utils/pet'
import { store } from '../store'

describe('buildWrongAnalysis 错题实时分析文案', () => {
  it('包含题目/你的选择/正确答案/错因/解析', () => {
    const wq = { plate: '判断推理', q: '所有猫都会飞', your: 'A', answer: 'B', reason: '概念混淆', explain: '猫不会飞，选 B。' }
    const s = buildWrongAnalysis(wq)
    expect(s).toContain('判断推理')
    expect(s).toContain('所有猫都会飞')
    expect(s).toContain('你当时选了A')
    expect(s).toContain('正确答案是B')
    expect(s).toContain('概念混淆')
    expect(s).toContain('猫不会飞')
  })
  it('空对象返回空串', () => {
    expect(buildWrongAnalysis(null)).toBe('')
    expect(buildWrongAnalysis({})).toBe('')
  })
  it('无解析时也能生成鼓励语', () => {
    const s = buildWrongAnalysis({ plate: '资料分析', q: 'x', your: 'C', answer: 'D' })
    expect(s).toContain('错题是最好的老师')
  })
})

describe('petNextSpeed 朗读倍速循环', () => {
  beforeEach(() => {
    store.cfg.ttsRate = 1
    try { localStorage.setItem('xc_cfg', JSON.stringify(store.cfg)) } catch (e) {}
  })
  it('按 0.75→1→1.25→1.5→0.75 循环', () => {
    expect(petNextSpeed()).toBe(1.25)
    expect(petNextSpeed()).toBe(1.5)
    expect(petNextSpeed()).toBe(0.75)
    expect(petNextSpeed()).toBe(1)
  })
})

describe('petFastCfg 萌宠快模型（非思考）', () => {
  const fakeLs = (() => { let m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v) }, removeItem: (k) => { delete m[k] } } })()
  beforeEach(() => {
    store.cfg.text = { prov: 'ds', key: 'k', url: 'https://api.deepseek.com/chat/completions', model: 'deepseek-v4-flash' }
    fakeLs.removeItem('xc_chat_fast_model'); fakeLs.removeItem('xc_fast_gen_model')
    vi.stubGlobal('localStorage', fakeLs)
  })
  it('DeepSeek 默认切 deepseek-chat（非思考秒回）', () => {
    const c = petFastCfg()
    expect(c.model).toBe('deepseek-chat')
  })
  it('用户填了快模型时优先使用', () => {
    fakeLs.setItem('xc_chat_fast_model', 'glm-4-flash')
    const c = petFastCfg()
    expect(c.model).toBe('glm-4-flash')
  })
  it('无 Key 返回 null', () => {
    store.cfg.text.key = ''
    expect(petFastCfg()).toBeNull()
  })
})

describe('petReadCurrent 朗读当前内容', () => {
  beforeEach(() => {
    store.readCtx = null
    store.cfg.ttsRate = 1
    store.cfg.petVoice = true
  })
  it('readCtx 有内容时返回 true', () => {
    store.readCtx = { type: 'quiz', title: '图形推理', text: '观察图形规律' }
    expect(petReadCurrent()).toBe(true)
  })
  it('readCtx 为空时返回 false', () => {
    store.readCtx = null
    expect(petReadCurrent()).toBe(false)
  })
})
