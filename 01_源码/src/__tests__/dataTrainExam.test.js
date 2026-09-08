import { describe, it, expect } from 'vitest'
import { buildDataTrainExam, EXAM_LAYER_KEYS, applyPaperOptions } from '../utils/dataTrainExam'
import { genDataQ, createSharedPaper } from '../utils/dataTrainGen'
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

  it('自动随机图型必须包含饼形，且四种图型都有机会出现', () => {
    const kinds = new Set()
    for (let i = 0; i < 60; i++) {
      const exam = buildDataTrainExam(940000 + i * 211, domainOf('粮食'))
      kinds.add(exam.chartKind)
    }
    expect(kinds.has(3)).toBe(true)
    expect(kinds.size).toBeGreaterThanOrEqual(3)
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

  it('材料排版支持纯文字/纯表格/两两混合/三者混合，且题目结构不受影响', () => {
    const dom = domainOf('汽车')
    for (const form of ['text', 'table', 'textTable', 'textChart', 'tableChart', 'all']) {
      for (let i = 0; i < 12; i++) {
        const exam = buildDataTrainExam(310000 + i * 179, dom, { form, timeKind: 'annual', chart: 'auto' })
        expect(exam.materialForm).toBe(form)
        expect(exam.qs).toHaveLength(5)
        expect(new Set(exam.qs.map((q) => q.kind)).size).toBe(5)
        if (form === 'text' || form === 'textTable' || form === 'textChart' || form === 'all') expect(exam.materialMd).toContain('文字资料')
        else expect(exam.materialMd).not.toContain('文字资料')
        if (form === 'table' || form === 'textTable' || form === 'tableChart' || form === 'all') expect(exam.materialMd).toContain('主要指标表')
        else expect(exam.materialMd).not.toContain('主要指标表')
        if (form === 'textChart' || form === 'tableChart' || form === 'all') expect(exam.materialSvg).toContain('<svg')
        else expect(exam.materialSvg).toBe('')
      }
    }
  })

  it('统计口径支持年度/累计/半年/季度/单月且年份窗口不固定为2020—2024', () => {
    const dom = domainOf('粮食')
    const kinds = new Set()
    for (let i = 0; i < 80; i++) {
      const exam = buildDataTrainExam(410000 + i * 271, dom, { form: 'all', timeKind: 'auto', chart: 'auto' })
      kinds.add(exam.periodKind)
      expect(exam.periodLabels).toHaveLength(5)
      expect(exam.materialMd).toContain(exam.periodLabels[4])
    }
    expect(kinds.size).toBeGreaterThanOrEqual(4)
    const fixed = Array.from(kinds).every((k) => k === 'annual')
    expect(fixed).toBe(false)
  })

  it('自动随机图型即使在三者混合中也必须让饼形有稳定出现机会', () => {
    const dom = domainOf('电力')
    const charts = new Set()
    for (let i = 0; i < 80; i++) {
      const exam = buildDataTrainExam(510000 + i * 331, dom, { form: 'all', chart: 'auto' })
      charts.add(exam.chartKind)
      expect(exam.materialSvg).toContain('<svg')
    }
    expect(charts.has(3)).toBe(true)
    expect(charts.size).toBeGreaterThanOrEqual(3)
  })

  it('拆分单题应用自定义排版后四层共用同一篇文字材料且找数据不回表格', () => {
    const dom = domainOf('汽车')
    const paper = applyPaperOptions(createSharedPaper(20260907, dom), 20260907, { form: 'text', timeKind: 'annual', chart: 'auto' })
    expect(paper.materialMd).toContain('文字资料')
    expect(paper.materialMd).not.toContain('主要指标表')
    expect(paper.hasTable).toBe(false)
    const mats = new Set()
    for (const m of ['type', 'locate', 'formula', 'calc']) {
      for (let i = 0; i < 30; i++) {
        const q = genDataQ(m, 610000 + i, 2, undefined, dom, paper)
        expect(q).toBeTruthy()
        expect(q.materialMd).toBe(paper.materialMd)
        expect(q.materialMd).toContain('文字资料')
        expect(String(q.q)).not.toContain('材料表')
        mats.add(q.materialMd)
      }
    }
    expect(mats.size).toBe(1)
  })
})
