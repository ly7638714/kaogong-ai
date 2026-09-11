// 朗读计费回归：官方单价写实 + 缓存命中不再重复扣费（省钱的根本）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../utils/ttsCache', () => ({
  ttsCacheKey: (...a) => 'k_' + a.join('|'),
  ttsCacheGet: vi.fn(async () => null),
  ttsCacheSet: vi.fn(async () => {}),
  ttsCacheClear: vi.fn(async () => {}),
  ttsCacheCount: vi.fn(async () => 0)
}))

import { store } from '../store'
import { glmSynthesize } from '../utils/ttsEngine'
import { ttsCacheGet } from '../utils/ttsCache'
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
})
