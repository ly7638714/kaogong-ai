import { describe, it, expect } from 'vitest'
import { applyLocalMerge, mergeArrays, mergeSyncData, shouldSyncKey, syncScopeFromBackup } from '../utils/cloudSync'

const testMem = new Map()
globalThis.localStorage = {
  getItem: (k) => (testMem.has(k) ? testMem.get(k) : null),
  setItem: (k, v) => testMem.set(k, String(v)),
  removeItem: (k) => testMem.delete(k),
  key: (i) => [...testMem.keys()][i] ?? null,
  get length() { return testMem.size }
}

describe('cloudSync 多端安全合并', () => {
  it('远端/本机不同集合都保留，不整包覆盖', () => {
    const a = [{ id: 1, t: 1690000000100, stem: 'A' }, { id: 2, t: 1690000000200, stem: 'B' }]
    const b = [{ id: 3, t: 1690000000300, stem: 'C' }]
    const m = mergeArrays(a, b)
    expect(m.map((x) => x.id)).toEqual([1, 2, 3])
  })

  it('同 id 按更新时间取新，且远端只新增项不丢', () => {
    const a = [{ id: 'q1', t: 1690000000100, answer: 'A' }]
    const b = [{ id: 'q1', t: 1690000000300, answer: 'B' }, { id: 'q2', t: 1690000000400, answer: 'C' }]
    const m = mergeArrays(a, b)
    expect(m.find((x) => x.id === 'q1').answer).toBe('B')
    expect(m.some((x) => x.id === 'q2')).toBe(true)
  })

  it('只同步学习数据，不同步 cfg/本机 UI/密钥类键', () => {
    expect(shouldSyncKey('xc_msgs')).toBe(true)
    expect(shouldSyncKey('xc_cfg')).toBe(false)
    expect(shouldSyncKey('xc_auth')).toBe(false)
    expect(shouldSyncKey('xc_pet_pos_d')).toBe(false)
    const scoped = syncScopeFromBackup({ data: { xc_msgs: '[]', xc_cfg: '{}', xc_pet_pos_d: '{}', xc_pet: '{}' } })
    expect(Object.keys(scoped).sort()).toEqual(['xc_msgs', 'xc_pet'])
  })

  it('本机未修改且云端更新时，标量采用云端；本机也改了则本机优先', () => {
    const base = { xc_mode: 'all' }
    const local = { xc_mode: 'all' }
    const remote = { xc_mode: 'luoji' }
    expect(mergeSyncData(local, remote, base).xc_mode).toBe('luoji')
    expect(mergeSyncData({ xc_mode: 'tutu' }, remote, base).xc_mode).toBe('tutu')
  })

  it('远端空数组/空对象也能把本机已有项带去云端', () => {
    const local = { xc_msgs: JSON.stringify([{ id: 'm1', t: 1690000000100, role: 'user' }]) }
    const remote = { xc_msgs: JSON.stringify([]) }
    const merged = mergeSyncData(local, remote, {})
    expect(JSON.parse(merged.xc_msgs)).toHaveLength(1)
  })

  it('applyLocalMerge 下载远端后把两端集合安全合并并写回本机', () => {
    testMem.clear()
    testMem.set('xc_msgs', JSON.stringify([{ id: 'm1', t: 1690000000100, role: 'user', text: '本机' }]))
    const backup = {
      data: {
        xc_msgs: JSON.stringify([{ id: 'm2', t: 1690000000300, role: 'assistant', text: '云端' }]),
        xc_cfg: '{"webdav":{"pass":"secret"}}'
      }
    }
    const plan = applyLocalMerge({ data: { xc_msgs: testMem.get('xc_msgs') } }, backup, {})
    const localItems = JSON.parse(JSON.parse(JSON.stringify(localStorage.getItem('xc_msgs'))))
    expect(localItems.map((x) => x.id)).toEqual(['m1', 'm2'])
    expect(plan.sameAsRemote).toBe(false)
    expect(localStorage.getItem('xc_cfg')).toBeNull()
  })
})
