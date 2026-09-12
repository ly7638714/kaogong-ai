import { describe, it, expect } from 'vitest'
import { installCompatPolyfills } from '../utils/compat'

describe('运行环境兼容垫片', () => {
  it('安装 Promise.withResolvers，旧 Android WebView 可正常加载 PDF.js', async () => {
    installCompatPolyfills()
    const d = Promise.withResolvers()
    expect(typeof d.resolve).toBe('function')
    expect(typeof d.reject).toBe('function')
    d.resolve('ok')
    await expect(d.promise).resolves.toBe('ok')
  })
})

