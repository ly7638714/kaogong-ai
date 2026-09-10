import { describe, it, expect } from 'vitest'
import { wrongQHash, wrongSyncId, addWrongDeleted, loadWrongDeleted, filterDeletedWrongs, parseWrongDeleted, WRONG_DELETED_KEY } from '../utils/wrongDelete'

const mem = new Map()
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  key: (i) => [...mem.keys()][i] ?? null,
  get length() { return mem.size }
}

describe('wrongDelete 永久删除墓碑', () => {
  it('按 id 生成墓碑，并按 id 过滤旧题', () => {
    const q = { id: 'w1', question: '完整题干。A. 甲 B. 乙 C. 丙 D. 丁' }
    expect(wrongSyncId(q)).toBe('w1')
    addWrongDeleted(q, 1)
    expect(loadWrongDeleted()).toEqual([{ id: 'w1', qhash: wrongQHash(q), t: 1 }])
    expect(filterDeletedWrongs([q], loadWrongDeleted())).toEqual([])
  })

  it('无 id 的旧题用题干哈希匹配墓碑', () => {
    const q = { question: '完整题干。A. 甲 B. 乙 C. 丙 D. 丁' }
    const hash = wrongQHash(q)
    expect(wrongSyncId(q)).toBe(hash)
    expect(filterDeletedWrongs([q], [{ id: hash, qhash: hash, t: 2 }])).toEqual([])
  })

  it('墓碑与旧数据解析容错', () => {
    expect(parseWrongDeleted('bad')).toEqual([])
    mem.set(WRONG_DELETED_KEY, 'bad')
    expect(loadWrongDeleted()).toEqual([])
  })
})
