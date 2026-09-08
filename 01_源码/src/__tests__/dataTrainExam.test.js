import { describe, it, expect } from 'vitest'
import { buildDataTrainExam, EXAM_LAYER_KEYS } from '../utils/dataTrainExam'
import { domainOf } from '../data/dataDomains'

describe('dataTrainExam 真题式四层训练引擎', () => {
  it('一篇材料固定生成 5 道不重复题，四层齐全且唯一答案', () => {
    const exam = buildDataTrainExam(20260909, domainOf('汽车'))
    expect(exam).toBeTruthy()
    expect(exam.qs.length).toBe(5)
    expect(new Set(exam.qs.map((q) => q.kind)).size).toBe(5)
    expect(exam.materialMd).toContain('文字资料')
    expect(exam.materialMd).toContain('主要指标表')
    expect(exam.materialMd).toContain('统计图')
    expect(exam.materialSvg).toContain('<svg')
    for (const q of exam.qs) {
      expect(String(q.stem).length).toBeGreaterThan(15)
      for (const lk of ['type', 'locate', 'formula', 'calc']) {
        const l = q.layers[lk]
        expect(l, lk + ' layer').toBeTruthy()
        expect(l.options).toHaveLength(4)
        expect(new Set(l.options.map((o) => o.t)).size).toBe(4)
        expect(l.answer).toMatch(/^[A-D]$/)
        expect(l.options.find((o) => o.k === l.answer)).toBeTruthy()
      }
    }
  })

  it('同种子确定性、材料四层共用同一篇', () => {
    const dom = domainOf('粮食')
    const a = buildDataTrainExam(777, dom)
    const b = buildDataTrainExam(777, dom)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(a.materialMd.length).toBeGreaterThan(500)
    expect(a.qs.every((q) => q.kind)).toBe(true)
    expect(a.qs.map((q) => q.typeLabel)).toEqual(['增长率', '增长量', '现期比重', '年均增长率', '综合分析'])
    expect(EXAM_LAYER_KEYS.map((x) => x.k)).toEqual(['type', 'locate', 'formula', 'calc'])
  })

  it('题型层答案与题目关键词一致', () => {
    const exam = buildDataTrainExam(20260910, domainOf('进出口'))
    const q1 = exam.qs[0]
    const typeTxt = q1.layers.type.options.find((o) => o.k === q1.layers.type.answer).t
    expect(typeTxt).toBe(q1.typeLabel)
    expect(q1.layers.type.q).toContain('判题型')
    expect(q1.layers.locate.q).toContain('找数据')
    expect(q1.layers.formula.q).toContain('选公式')
    expect(q1.layers.calc.q).toContain(q1.stem)
  })
})
