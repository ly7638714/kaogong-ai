// storage 统一持久化层（批次6-6A 回归）：safeGet 类型校验 / safeSet 写读 / 版本迁移
const __mem = {}
globalThis.localStorage = {
  getItem: (k) => (k in __mem ? __mem[k] : null),
  setItem: (k, v) => { __mem[k] = String(v) },
  removeItem: (k) => { delete __mem[k] },
  clear: () => { for (const k of Object.keys(__mem)) delete __mem[k] }
}
import { describe, it, expect, beforeEach } from 'vitest'
import { safeGet, safeSet, migrate, KEYS } from '../utils/storage'

describe('storage 统一持久化层（批次6-6A）', () => {
  beforeEach(() => { localStorage.clear() })
  it('safeSet 写入后 safeGet 读回（对象/数组）', () => {
    expect(safeSet(KEYS.WQS, [{ id: 1 }])).toBe(true)
    expect(safeGet(KEYS.WQS, [])).toEqual([{ id: 1 }])
  })
  it('safeGet 无 key 返回 fallback', () => {
    expect(safeGet(KEYS.PAPERS, [])).toEqual([])
    expect(safeGet(KEYS.CFG, null)).toBeNull()
  })
  it('safeGet 类型校验：fallback 数组而存储为脏对象 → 返回 fallback', () => {
    localStorage.setItem(KEYS.PAPERS, JSON.stringify({ bad: true }))
    expect(safeGet(KEYS.PAPERS, [])).toEqual([])
  })
  it('safeGet 解析失败返回 fallback', () => {
    localStorage.setItem(KEYS.CFG, '{broken')
    expect(safeGet(KEYS.CFG, null)).toBeNull()
  })
  it('migrate 首次载入记录版本号且不改数据', () => {
    localStorage.setItem(KEYS.MSGS, JSON.stringify([{ role: 'user', content: 'x' }]))
    const d = migrate(KEYS.MSGS, 1)
    expect(Array.isArray(d)).toBe(true)
    expect(d[0].content).toBe('x')
    expect(localStorage.getItem(KEYS.MSGS + '_v')).toBe('1')
  })
  it('KEYS 注册表关键键齐全', () => {
    for (const k of ['CFG', 'MSGS', 'WQS', 'PAPERS', 'PAPER_RESULTS', 'QUIZ_COL', 'COST', 'SRS']) {
      expect(KEYS[k]).toMatch(/^xc_/)
    }
  })
})
