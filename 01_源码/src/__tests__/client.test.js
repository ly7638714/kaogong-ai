import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { supportsVision, activeCfg, imgRoute, chatOnce } from '../api/client'
import { store } from '../store'

describe('supportsVision 识别可识图模型', () => {
  it('DeepSeek V4.1-Flash（deepseek-flash）原生支持图像理解', () => {
    expect(supportsVision({ prov: 'ds', model: 'deepseek-flash' })).toBe(true)
    // 旧视觉实验名与新 Flash 同款模型，也应判为可识图
    expect(supportsVision({ prov: 'ds', model: 'deepseek-v4-flash-vision-exp' })).toBe(true)
    // 旧 v4-flash 名已被官方路由到 V4.1-Flash，同样可识图
    expect(supportsVision({ prov: 'ds', model: 'deepseek-v4-flash' })).toBe(true)
  })
  it('DeepSeek V4-Pro 不支持图像理解', () => {
    expect(supportsVision({ prov: 'ds', model: 'deepseek-v4-pro' })).toBe(false)
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

describe('imgRoute 智能识图路由', () => {
  it('主视觉可识图 → vision 直发图片', () => {
    const cfg = { vision: { prov: 'zhipu', key: 'k', model: 'glm-5v-turbo' } }
    expect(imgRoute(cfg, false)).toBe('vision')
    expect(imgRoute(cfg, true)).toBe('vision')
  })
  it('主视觉为 DeepSeek 视觉模型（配 Key）→ vision 直发图片', () => {
    const cfg = { vision: { prov: 'ds', key: 'k', model: 'deepseek-v4-flash-vision-exp' } }
    expect(imgRoute(cfg, false)).toBe('vision')
  })
  it('主视觉未配 Key 且无图形增强模型 → graceful（不拒收）', () => {
    const cfg = { vision: { prov: 'ds', key: '', model: 'deepseek-v4-flash-vision-exp' } }
    expect(imgRoute(cfg, false)).toBe('graceful')
  })
  it('未配置视觉模型 → graceful', () => {
    expect(imgRoute({ vision: { key: '' } }, false)).toBe('graceful')
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
  it('有图且视觉为 DeepSeek 视觉模型（配 Key）走视觉', () => {
    store.cfg.vision.key = 'vis-key'
    expect(activeCfg(true)).toMatchObject({ prov: 'ds', key: 'vis-key', model: 'deepseek-v4-flash-vision-exp' })
  })
  it('有图且视觉为真视觉模型（智谱）走视觉', () => {
    store.cfg.vision = { prov: 'zhipu', key: 'vis-key', model: 'glm-5v-turbo' }
    expect(activeCfg(true)).toMatchObject({ prov: 'zhipu', key: 'vis-key', model: 'glm-5v-turbo' })
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

describe('DeepSeek 旧模型名兼容映射', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })
  async function bodyFor(cfg) {
    let body = null
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      body = JSON.parse(init.body)
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'ok' } }], usage: {} })
      }
    }))
    await chatOnce({ prov: 'ds', key: 'k', url: 'https://x.test/chat', model: cfg.model, ...(cfg.noThink != null ? { noThink: cfg.noThink } : {}) }, [{ role: 'user', content: 'q' }], 2000)
    return body
  }
  it('deepseek-chat 映射为 deepseek-flash 且关闭思考', async () => {
    const body = await bodyFor({ model: 'deepseek-chat' })
    expect(body.model).toBe('deepseek-flash')
    expect(body.thinking).toEqual({ type: 'disabled' })
    expect(typeof body.temperature).toBe('number')
  })
  it('deepseek-reasoner 映射为 deepseek-flash 且开启思考', async () => {
    const body = await bodyFor({ model: 'deepseek-reasoner' })
    expect(body.model).toBe('deepseek-flash')
    expect(body.thinking).toEqual({ type: 'enabled' })
    expect(body.temperature).toBeUndefined()
  })
  it('V4.1-Flash 使用官方实际模型名 deepseek-flash', async () => {
    const body = await bodyFor({ model: 'deepseek-v4.1-flash' })
    expect(body.model).toBe('deepseek-flash')
  })
  it('v4-flash 标记 noThink 时发送 thinking=disabled', async () => {
    const body = await bodyFor({ model: 'deepseek-v4-flash', noThink: true })
    expect(body.model).toBe('deepseek-flash')
    expect(body.thinking).toEqual({ type: 'disabled' })
  })
  it('deepseek-v4-flash-vision-exp 也映射为 deepseek-flash', async () => {
    const body = await bodyFor({ model: 'deepseek-v4-flash-vision-exp' })
    expect(body.model).toBe('deepseek-flash')
  })
  it('deepseek-flash 默认走思考模式：不带 temperature 且放大输出上限', async () => {
    const body = await bodyFor({ model: 'deepseek-flash' })
    expect(body.model).toBe('deepseek-flash')
    expect(body.temperature).toBeUndefined()
    expect(body.max_tokens).toBeGreaterThanOrEqual(8192)
  })
  it('deepseek-flash 标记 noThink 时关闭思考并恢复 temperature', async () => {
    const body = await bodyFor({ model: 'deepseek-flash', noThink: true })
    expect(body.thinking).toEqual({ type: 'disabled' })
    expect(typeof body.temperature).toBe('number')
  })
})
