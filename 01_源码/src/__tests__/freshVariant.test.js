// ③ 单题同类不重出：题型级短记忆 freshVariant 回归
import { describe, it, expect, beforeEach } from 'vitest'
import { freshVariant, recentVariants } from '../utils/genDiversity'

const mem = new Map()
beforeEach(() => {
  mem.clear()
  globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)) }, removeItem: (k) => { mem.delete(k) } }
})
const POOL = ['中心理解', '意图判断', '标题填入', '细节判断', '语句排序']

describe('freshVariant 题型级同类不重出', () => {
  it('连续抽取不立刻重复最近 3 个题型（池足够时）', () => {
    const got = []
    for (let i = 0; i < 10; i++) got.push(freshVariant('言语理解', POOL, 3))
    // 相邻 3 步内不应出现相同题型
    for (let i = 0; i < got.length; i++) {
      for (let j = Math.max(0, i - 3); j < i; j++) expect(got[j]).not.toBe(got[i])
    }
    expect(new Set(got.slice(0, 6)).size).toBeGreaterThanOrEqual(4)
  })
  it('记忆按板块隔离；recentVariants 可见最近 3 个', () => {
    freshVariant('言语理解', POOL, 3)
    freshVariant('资料分析', ['比重', '增长率'], 3)
    expect(recentVariants('言语理解').length).toBe(1)
    expect(recentVariants('资料分析').length).toBe(1)
    for (let i = 0; i < 6; i++) freshVariant('言语理解', POOL, 3)
    expect(recentVariants('言语理解').length).toBeLessThanOrEqual(3)
  })
  it('池太小/为空安全回退', () => {
    freshVariant('逻辑判断', ['削弱型'], 3)
    freshVariant('逻辑判断', ['削弱型'], 3) // 池只有 1 项也须正常返回
    expect(freshVariant('常识判断', [], 3)).toBe('')
  })
})
