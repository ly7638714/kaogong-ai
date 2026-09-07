// events 事件总线（批次6-6A 回归）：on/off/emit 配对 + 生命周期清理
// vitest node 环境无 window：提供内存版事件 mock（必须在 import events 前定义）
const __listeners = {}
globalThis.window = {
  addEventListener: (name, fn) => { (__listeners[name] ||= []).push(fn) },
  removeEventListener: (name, fn) => { if (__listeners[name]) __listeners[name] = __listeners[name].filter((f) => f !== fn) },
  dispatchEvent: (ev) => { (__listeners[ev.type] || []).forEach((f) => f(ev)); return true }
}
import { describe, it, expect, vi } from 'vitest'
import { on, off, emit } from '../utils/events'

describe('events 事件总线（批次6-6A）', () => {
  it('emit 触发 on 注册的监听（含 detail）', () => {
    const fn = vi.fn()
    on('test-1', fn)
    emit('test-1', { a: 1 })
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn.mock.calls[0][0].detail).toEqual({ a: 1 })
    off('test-1', fn)
  })
  it('off 后不再触发', () => {
    const fn = vi.fn()
    on('test-2', fn)
    off('test-2', fn)
    emit('test-2')
    expect(fn).not.toHaveBeenCalled()
  })
  it('on 返回的卸载函数可一次移除', () => {
    const fn = vi.fn()
    const cleanup = on('test-3', fn)
    cleanup()
    emit('test-3')
    expect(fn).not.toHaveBeenCalled()
  })
})
