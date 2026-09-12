import { describe, test, expect, vi, afterEach } from 'vitest'
import { zhentiIndex, zhentiPaper, zhentiTypes } from '../data/zhenti'

const b64 = (text) => Buffer.from(String(text), 'utf8').toString('base64')

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('真题库加载器', () => {
  test('Web/PWA：相对路径 fetch 可加载索引、试卷和题型表', async () => {
    const payloads = {
      './zhenti/index.json': { papers: [{ id: 'p1' }] },
      './zhenti/p1.json': { id: 'p1', sections: {} },
      './zhenti/types.json': { papers: {} }
    }
    const fetchMock = vi.fn(async (url) => ({ ok: true, status: 200, text: async () => JSON.stringify(payloads[url]) }))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('window', {})
    await expect(zhentiIndex()).resolves.toEqual(payloads['./zhenti/index.json'])
    await expect(zhentiPaper('p1')).resolves.toEqual(payloads['./zhenti/p1.json'])
    await expect(zhentiTypes()).resolves.toEqual(payloads['./zhenti/types.json'])
  })

  test('Android file://：优先从 xcnative 随包 assets 读取，不依赖 fetch', async () => {
    const asset = JSON.stringify({ papers: [{ id: 'native' }] })
    const readAssetB64 = vi.fn(() => b64(asset))
    const fetchMock = vi.fn(() => { throw new Error('native 模式不应走 fetch') })
    vi.stubGlobal('window', { xcnative: { readAssetB64 } })
    vi.stubGlobal('fetch', fetchMock)
    await expect(zhentiIndex()).resolves.toEqual({ papers: [{ id: 'native' }] })
    expect(readAssetB64).toHaveBeenCalledWith('zhenti/index.json')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('索引不存在时给出明确 HTTP 错误', async () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })))
    await expect(zhentiIndex()).rejects.toThrow('HTTP 404')
  })
})
