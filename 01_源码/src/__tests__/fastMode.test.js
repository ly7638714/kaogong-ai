import { describe, it, expect, beforeEach } from 'vitest'
import { isFastGenMode } from '../utils/fastMode'

const mem = new Map()
beforeEach(() => {
  mem.clear()
  globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)) }, removeItem: (k) => { mem.delete(k) } }
})

describe('fastMode 快模型出题检测', () => {
  it('未配置 → 非快模式', () => {
    expect(isFastGenMode()).toBe(false)
  })
  it('填了出题快模型名 → 快模式', () => {
    mem.set('xc_fast_gen_model', 'deepseek-chat')
    expect(isFastGenMode()).toBe(true)
  })
  it('开启图形快模型开关 → 快模式（即使快模型名为空）', () => {
    mem.set('xc_use_fig_gen', '1')
    expect(isFastGenMode()).toBe(true)
  })
  it('开关为 0 / 空串 / 非法 localStorage → false', () => {
    mem.set('xc_use_fig_gen', '0')
    expect(isFastGenMode()).toBe(false)
    mem.set('xc_fast_gen_model', '   ')
    expect(isFastGenMode()).toBe(false)
  })
})
