// memoryPools（v3.8.188）回归：数据池完整性 + findPoolItem 检索
import { describe, it, expect } from 'vitest'
import { CHANGSHI, SHIZHENG, CHENGYU, SHICI, skillMemCS, skillMemZZ, findPoolItem } from '../data/memoryPools'

describe('memoryPools 数据池单源', () => {
  it('各池非空且池内标题无重复', () => {
    const pools = [['常识', CHANGSHI], ['时政', SHIZHENG], ['成语', CHENGYU], ['实词', SHICI]]
    for (const [name, arr] of pools) {
      expect(arr.length, name + ' 空池').toBeGreaterThan(0)
      const seen = new Set()
      arr.forEach((x) => { const t = String(x && x.t || ''); expect(t, name + ' 空标题').toBeTruthy(); expect(seen.has(t), name + ' 重复: ' + t).toBe(false); seen.add(t) })
    }
    expect(skillMemCS.length).toBeGreaterThan(0)
    expect(skillMemZZ.length).toBeGreaterThan(0)
  })
  it('findPoolItem 命中返回原条目内容、未命中返回 null', () => {
    const hit = findPoolItem('浅尝辄止')
    expect(hit).toBeTruthy()
    expect(hit.yishi).toBeTruthy()
    expect(findPoolItem('宪法规定：中华人民共和国的一切权力属于人民。')).toBeTruthy()
    expect(findPoolItem('不存在的词条XYZ')).toBe(null)
    expect(findPoolItem('')).toBe(null)
  })
})
