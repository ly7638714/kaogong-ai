import { describe, it, expect } from 'vitest'
import { buildDataTrainExam, EXAM_LAYER_KEYS } from '../utils/dataTrainExam'
import { domainOf } from '../data/dataDomains'

describe('dataTrainExam 真题式四层训练引擎', () => {
  it('一篇材料固定生成 5 道不重复题，四层齐全且唯一答案', () => {
    const exam = buildDataTrainExam(20260909, domainOf('汽车'))
    expect(exam).toBeTruthy()
    expect(exam.qs.length).toBe(5)
    expect(new Set(exam.qs.map((q) => q.kind)).size).toBe(5)
    expect(exam.materialMd).toContain('【材料】')
    expect(exam.materialMd).toMatch(/一、/)
    expect(exam.materialMd).toMatch(/二、/)
    expect(exam.materialMd).toMatch(/三、/)
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
    expect(new Set([a.materialMd, b.materialMd]).size).toBe(1)
    expect(a.qs.every((q) => q.kind)).toBe(true)
    expect(a.qs[4].typeLabel).toBe('综合分析')
    expect(new Set(a.qs.slice(0, 4).map((q) => q.typeLabel)).size).toBe(4)
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

  it('不同种子会切换材料结构与题型表达，不只是换数字', () => {
    const dom = domainOf('汽车')
    const a = buildDataTrainExam(770001, dom)
    let different = false
    let b = null
    for (let i = 1; i <= 80 && !different; i++) {
      b = buildDataTrainExam(770001 + i * 997, dom)
      different = b.matStyle !== a.matStyle || b.tableKind !== a.tableKind || b.chartKind !== a.chartKind || b.qs[0].stem !== a.qs[0].stem
    }
    expect(different).toBe(true)
    expect(b).toBeTruthy()
  })

  it('材料数值不是刻意取整的漂亮数字', () => {
    for (let i = 0; i < 20; i++) {
      const exam = buildDataTrainExam(810000 + i * 313, domainOf('粮食'))
      expect(exam.materialMd).not.toContain('50,000')
      const nums = (exam.materialMd.match(/\b\d[\d,]*\b/g) || []).map((x) => Number(x.replace(/,/g, ''))).filter((x) => x > 100)
      expect(nums.some((n) => n % 10 !== 0)).toBe(true)
    }
  })

  it('前四题考查顺序随套题变化，综合分析仍放第5题', () => {
    const orders = new Set()
    for (let i = 0; i < 20; i++) {
      const exam = buildDataTrainExam(920000 + i * 433, domainOf('电力'))
      orders.add(exam.qs.slice(0, 4).map((q) => q.kind).join(','))
      expect(exam.qs[4].kind).toBe('comp')
    }
    expect(orders.size).toBeGreaterThan(1)
  })

  it('真题式组卷包含高难考点且综合分析需计算占比变化', () => {
    for (let i = 0; i < 30; i++) {
      const exam = buildDataTrainExam(930000 + i * 511, domainOf('粮食'))
      const kinds = exam.qs.map((q) => q.kind)
      expect(kinds.some((k) => ['base', 'interval', 'shareDiff'].includes(k))).toBe(true)
      const comp = exam.qs[4]
      expect(comp.layers.calc.options.find((o) => o.k === comp.layers.calc.answer).t).toContain('比重较2023年')
    }
  })
})
