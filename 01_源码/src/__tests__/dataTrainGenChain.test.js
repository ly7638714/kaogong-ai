// dataTrainGen 同材料连问（v3.8.203）回归
import { describe, it, expect } from 'vitest'
import { genLocateChain } from '../utils/dataTrainChain'

describe('genLocateChain', () => {
  it('同材料生成 2+ 问且每题问法不同、材料一致', () => {
    const c = genLocateChain(20260905, 3)
    expect(c).toBeTruthy()
    expect(c.qs.length).toBeGreaterThanOrEqual(3)
    expect(c.qs[0].materialMd || '').toBe('')
    const stems = new Set(c.qs.map((x) => x.q))
    expect(stems.size).toBe(c.qs.length)
    c.qs.forEach((q) => { expect(q.options.length).toBeGreaterThanOrEqual(4); expect(q.answer).toBeTruthy() })
  })
})
