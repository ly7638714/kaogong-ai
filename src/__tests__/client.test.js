import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { supportsVision, activeCfg, chatOnce } from '../api/client'
import { store } from '../store'

describe('supportsVision 识别可识图模型', () => {
  it('DeepSeek 视觉模型可识图', () => {
    expect(supportsVision({ prov: 'ds', model: 'deepseek-v4-flash-vision-exp' })).toBe(true)
  })
  it('DeepSeek 纯文本模型不可识图', () => {
    expect(supportsVision({ prov: 'ds', model: 'deepseek-v4-flash' })).toBe(false)
  })
  it('智谱含 v 或 vision 可识图', () => {
    expect(supportsVision({ prov: 'zhipu', model: 'glm-5v-turbo' })).toBe(true)
    expect(supportsVision({ prov: 'zhipu', model: 'glm-4' })).toBe(false)
  })
  it('通义含 vl 可识图', () => {
    expect(supportsVision({ prov: 'qwen', model: 'qwen-vl-max' })).toBe(true)
  })
  it('OpenAI/自定义 默认可识图', () => {
    expect(supportsVision({ prov: 'openai', model: 'gpt-4o' })).toBe(true)
    expect(supportsVision({ prov: 'custom', model: 'x' })).toBe(true)
  })
})

describe('activeCfg 双模型路由', () => {
  beforeEach(() => {
    store.cfg.text = { key: 'text-key' }
    store.cfg.vision = { prov: 'ds', key: '', model: 'deepseek-v4-flash-vision-exp' }
  })
  it('无图时走文字模型', () => {
    expect(activeCfg(false)).toMatchObject({ key: 'text-key' })
  })
  it('有图且视觉已配 Key 走视觉', () => {
    store.cfg.vision.key = 'vis-key'
    expect(activeCfg(true)).toMatchObject({
      prov: 'ds',
      key: 'vis-key',
      model: 'deepseek-v4-flash-vision-exp'
    })
  })
  it('有图但视觉未配 Key 走文字', () => {
    const c = activeCfg(true)
    expect(c.key).toBe('text-key')
  })
  it('无任何 Key 返回 text 配置', () => {
    store.cfg.text.key = ''
    expect(activeCfg(false)).toMatchObject({ key: '' })
  })
})

describe('chatOnce 外部取消信号', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })
  it('外部 signal 取消立即中断且不重试', async () => {
    let fetches = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (url, init) =>
          new Promise((res, rej) => {
            fetches++
            init.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))
          })
      )
    )
    const c = { prov: 'ds', key: 'k', url: 'https://api.test/chat', model: 'deepseek-v4-flash' }
    const ac = new AbortController()
    const p = chatOnce(c, [{ role: 'user', content: 'q' }], 2000, 60000, ac.signal)
    await new Promise((r) => setTimeout(r, 10)) // 等 fetch 发起
    ac.abort()
    await expect(p).rejects.toThrow()
    expect(fetches).toBe(1) // 外部取消不应自动重试
  })
})
