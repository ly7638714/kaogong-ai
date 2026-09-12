// 朗读计费回归：官方单价写实 + 缓存命中不再重复扣费（省钱的根本）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../utils/ttsCache', () => ({
  ttsCacheKey: (...a) => 'k_' + a.join('|'),
  ttsCacheGet: vi.fn(async () => null),
  ttsCacheSet: vi.fn(async () => {}),
  ttsCachePin: vi.fn(async () => {}),
  ttsCacheClear: vi.fn(async () => {}),
  ttsCacheCount: vi.fn(async () => 0)
}))

import { store } from '../store'
import { glmSynthesize, speakPro, ttsCacheCoverage } from '../utils/ttsEngine'
import { ttsCacheGet, ttsCacheSet, ttsCachePin } from '../utils/ttsCache'
import { DEF_PRICES, getTtsPrice } from '../utils/costTrack'

const mem = new Map()
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
  key: (i) => [...mem.keys()][i] ?? null,
  get length() { return mem.size }
}

describe('朗读官方计价（2026-09-11 核验）', () => {
  it('智谱 GLM-TTS 按官方 2 元/万字符（0.2 元/千字）写入默认表', () => {
    expect(DEF_PRICES.ttsPrices.glm).toBe(0.2)
    expect(DEF_PRICES.ttsPrices.dash).toBe(0.08)
    expect(getTtsPrice('glm')).toBe(0.2)
  })

  it('智谱音色克隆按官方 6 元/次写入默认表', () => {
    expect(DEF_PRICES.cloneFee).toBe(6)
  })
})

describe('朗读缓存命中不重复计费', () => {
  beforeEach(() => {
    mem.clear()
    ttsCacheGet.mockReset()
    ttsCacheSet.mockReset()
    ttsCachePin.mockReset()
    store.cfg.ttsGm = { key: 'k', url: 'https://open.bigmodel.cn/api/paas/v4/audio/speech', model: 'glm-tts', voice: 'tongtong' }
    store.cfg.fig = { key: '', url: '' }
    store.cfg.ttsRate = 1
    store.cfg.ttsGuard = true
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('整段命中缓存：不扣费、不占每日额度、不发起请求', async () => {
    ttsCacheGet.mockResolvedValue({ bytes: new ArrayBuffer(16), mime: 'audio/wav' })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const r = await glmSynthesize('这是一段用于测试缓存命中的朗读文本。', { chunkSize: 240, firstChunkSize: 42 })
    expect(r.ok).toBe(true)
    expect(r.billChars).toBe(0)
    expect(r.cachedChars).toBeGreaterThan(0)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(localStorage.getItem('xc_tts_chars')).toBeNull()
    expect(localStorage.getItem('xc_cost')).toBeNull()
  })

  it('缓存未命中：按真实字数计费并计入每日额度', async () => {
    ttsCacheGet.mockResolvedValue(null)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(32), json: async () => ({}) })))
    const r = await glmSynthesize('这段文本没有缓存，需要真实请求。', { chunkSize: 240, firstChunkSize: 42 })
    expect(r.ok).toBe(true)
    expect(r.cachedChars).toBe(0)
    expect(r.billChars).toBeGreaterThan(0)
    const led = JSON.parse(localStorage.getItem('xc_tts_chars') || '{}')
    expect(Number(led.c)).toBe(r.billChars)
  })

  it('缓存重读模式遇到未命中时直接停止，不发请求也不扣费', async () => {
    ttsCacheGet.mockResolvedValue(null)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const onError = vi.fn()
    const r = await speakPro('这段重读内容没有缓存，不能回退到付费合成。', {
      engine: 'glm',
      voice: 'tongtong',
      cacheOnly: true,
      onError
    })
    expect(r.ok).toBe(false)
    expect(r.msg).toBe('cache-miss')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(localStorage.getItem('xc_cost')).toBeNull()
    expect(onError).toHaveBeenCalledWith('cache-miss')
  })

  it('首次完整朗读会把音频分块标记为永久固定缓存', async () => {
    ttsCacheGet.mockResolvedValue(null)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(32), json: async () => ({}) })))
    const r = await glmSynthesize('这条语音需要在首次完整朗读后永久保留。', { chunkSize: 240, firstChunkSize: 42, pinCache: true })
    expect(r.ok).toBe(true)
    expect(ttsCacheSet).toHaveBeenCalled()
    expect(ttsCacheSet.mock.calls.every((c) => c[3] === true)).toBe(true)
  })

  it('已有缓存升级为永久固定缓存时不会重新请求音频', async () => {
    ttsCacheGet.mockResolvedValue({ bytes: new ArrayBuffer(16), mime: 'audio/wav' })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await glmSynthesize('这条缓存需要从普通缓存升级为永久缓存。', { chunkSize: 240, firstChunkSize: 42, pinCache: true })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(ttsCachePin).toHaveBeenCalled()
  })

  it('OpenAI 兼容缓存覆盖校验按角色指定 model 生成同一条 key，不串到默认模型', async () => {
    store.cfg.ttsOpenAI = { key: 'k', url: 'https://example.com/v1', model: 'default-model', voice: 'default' }
    ttsCacheGet.mockResolvedValue({ bytes: new ArrayBuffer(16), mime: 'audio/mpeg' })
    await ttsCacheCoverage('角色模型缓存校验。', { mode: 'openai', model: 'role-model', voice: 'role-voice', speed: 1 })
    const keys = ttsCacheGet.mock.calls.map((c) => String(c[0]))
    expect(keys.length).toBeGreaterThan(0)
    expect(keys.every((k) => k.includes('role-model') && k.includes('role-voice'))).toBe(true)
  })

  it('阿里百炼自定义声线写入独立缓存 key，避免与预设音色串音', async () => {
    store.cfg.ttsDash = { key: 'k', url: 'https://example.com', model: 'qwen3-tts-instruct-flash', voice: 'Cherry', voiceCustom: '' }
    ttsCacheGet.mockResolvedValue({ bytes: new ArrayBuffer(16), mime: 'audio/mpeg' })
    await ttsCacheCoverage('自定义声线缓存校验。', { mode: 'dash', voiceCustom: '温柔女老师', speed: 1 })
    const keys = ttsCacheGet.mock.calls.map((c) => String(c[0]))
    expect(keys.length).toBeGreaterThan(0)
    expect(keys.every((k) => k.includes('design:温柔女老师'))).toBe(true)
  })

  it('智谱角色指定 model 时缓存 key 固定使用该 model，重读不会串到默认模型', async () => {
    ttsCacheGet.mockResolvedValue({ bytes: new ArrayBuffer(16), mime: 'audio/wav' })
    await glmSynthesize('角色模型缓存校验。', { model: 'glm-role-tts', chunkSize: 240, firstChunkSize: 42 })
    const keys = ttsCacheGet.mock.calls.map((c) => String(c[0]))
    expect(keys.length).toBeGreaterThan(0)
    expect(keys.every((k) => k.includes('glm-role-tts'))).toBe(true)
  })
})
