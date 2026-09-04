// paperPlan 考频配额组卷（35号批次2-C）回归：配额守恒 / 考频导向 / 相邻错开排序
import { describe, it, expect } from 'vitest'
import { allocQuotas, orderQuotas, planVariants, weightFor, variantWeights, subjectTotal } from '../utils/paperPlan'

describe('allocQuotas 配额守恒（最大余数法）', () => {
  it('Σquota = n 严格守恒（多组输入）', () => {
    const cases = [
      [{ A: 3, B: 3, C: 3, D: 1 }, 10],
      [{ A: 9, B: 1 }, 10],
      [{ A: 5 }, 13],
      [{ A: 1, B: 1, C: 1, D: 1, E: 1 }, 7],
      [{ 甲: 7, 乙: 3, 丙: 1 }, 0]
    ]
    cases.forEach(([w, n]) => {
      const q = allocQuotas(w, n)
      const sum = Object.values(q).reduce((a, b) => a + b, 0)
      expect(sum).toBe(n)
    })
  })
  it('权重大者分得多', () => {
    expect(allocQuotas({ A: 9, B: 1 }, 10)).toEqual({ A: 9, B: 1 })
    expect(allocQuotas({ A: 9, B: 1 }, 20)).toEqual({ A: 18, B: 2 })
  })
  it('n 为 0 返回空对象', () => {
    expect(allocQuotas({ A: 1 }, 0)).toEqual({})
  })
})

describe('orderQuotas 相邻错开', () => {
  it('输出长度等于总配额', () => {
    const out = orderQuotas({ A: 4, B: 3, C: 1 })
    expect(out.length).toBe(8)
  })
  it('配额允许时相邻题型不同', () => {
    const out = orderQuotas({ A: 4, B: 3, C: 1 })
    for (let i = 1; i < out.length; i++) expect(out[i]).not.toBe(out[i - 1])
  })
  it('某题型超半数时允许相邻（仍输出全长）', () => {
    const out = orderQuotas({ A: 9, B: 1 })
    expect(out.length).toBe(10)
    expect(out.filter((x) => x === 'A').length).toBe(9)
  })
})

describe('weightFor / variantWeights 考频表', () => {
  it('真题高频变体权重大（言语·逻辑填空 > 低频下文推断）', () => {
    expect(weightFor('言语理解', '逻辑填空')).toBeGreaterThan(weightFor('言语理解', '下文推断'))
  })
  it('未收录板块退化为均匀权重 1', () => {
    expect(weightFor('图形推理', '位置规律')).toBe(1)
    expect(weightFor('政治理论', '新思想')).toBe(1)
  })
  it('收录板块未上榜变体用 2% 基准（数量·最值问题）', () => {
    const w = weightFor('数量关系', '最值问题')
    expect(w).toBeGreaterThanOrEqual(1)
    expect(w).toBeLessThan(subjectTotal('数量关系'))
  })
  it('空变体列表 → 综合权重 1', () => {
    expect(variantWeights('言语理解', [])).toEqual({ 综合: 1 })
  })
})

describe('planVariants 主入口', () => {
  const yy = ['中心理解', '意图判断', '标题填入', '态度观点', '细节判断', '词句理解', '语句填空', '下文推断', '语句排序', '逻辑填空']
  it('输出长度 = 题量且变体全部来自候选', () => {
    for (const n of [1, 7, 15, 30]) {
      const out = planVariants('言语理解', yy, n)
      expect(out.length).toBe(n)
      out.forEach((v) => expect(yy).toContain(v))
    }
  })
  it('高频变体（逻辑填空）题量显著高于低频（下文推断）', () => {
    const out = planVariants('言语理解', yy, 30)
    const c = (v) => out.filter((x) => x === v).length
    expect(c('逻辑填空')).toBeGreaterThan(c('下文推断') + 5)
  })
  it('无考频板块仍均匀出题（图推 10 种全覆盖）', () => {
    const tu = ['位置规律', '样式规律', '属性规律', '数量规律', '组合规律', '空间重构', '截面图', '三视图', '立体拼合', '汉字字母']
    const out = planVariants('图形推理', tu, 10)
    expect(out.length).toBe(10)
    expect(new Set(out).size).toBe(10)
  })
  it('题量为 0 / 空变体返回空数组', () => {
    expect(planVariants('言语理解', yy, 0)).toEqual([])
    expect(planVariants('言语理解', [], 5)).toEqual([])
  })
})
