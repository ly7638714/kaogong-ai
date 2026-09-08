// dataTrainGen 同材料连问（v3.8.203）回归
import { describe, it, expect } from 'vitest'
import { genLocateChain } from '../utils/dataTrainChain'
import { createSharedPaper } from '../utils/dataTrainGen'

describe('genLocateChain', () => {
  it('同材料生成 2+ 问且每题问法不同、材料一致', () => {
    const c = genLocateChain(20260905)
    expect(c).toBeTruthy()
    expect(c.qs.length).toBe(5)
    expect(c.qs[0].materialMd || '').toBe('')
    expect(c.materialMd).toContain('文字资料')
    expect(c.materialMd).toContain('统计表')
    expect(c.materialMd).toContain('统计图')
    expect(c.materialSvg).toContain('<svg')
    const stems = new Set(c.qs.map((x) => x.q))
    expect(stems.size).toBe(c.qs.length)
    c.qs.forEach((q) => { expect(q.options.length).toBeGreaterThanOrEqual(4); expect(q.answer).toBeTruthy() })
  })

  it('传入领域时材料指标/单位与所选领域一致', () => {
    const dom = { n: '汽车', cat: '热', unit: '万辆', inds: ['汽车产量', '新能源汽车产量', '汽车销量', '汽车类零售额'] }
    const c = genLocateChain(20260905, 5, dom)
    expect(c).toBeTruthy()
    expect(c.materialMd).toContain('汽车领域')
    expect(c.materialMd).toContain('汽车产量')
    expect(c.materialMd).toContain('万辆')
    expect(c.materialMd).not.toContain('粮食产量')
  })

  it('共享篇章模式下5问材料与四层单题完全同一篇', () => {
    const dom = { n: '汽车', cat: '热', unit: '万辆', inds: ['汽车产量', '新能源汽车产量', '汽车销量', '汽车类零售额'] }
    const paper = createSharedPaper(20260907, dom)
    const c = genLocateChain(20260907, 5, dom, paper)
    expect(c).toBeTruthy()
    expect(c.qs.length).toBe(5)
    expect(c.materialMd).toBe(paper.materialMd)
    expect(c.materialSvg).toBe(paper.materialSvg)
    expect(new Set(c.qs.map((x) => x.q)).size).toBe(5)
  })
})
