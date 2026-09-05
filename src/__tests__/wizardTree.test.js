// wizardTree（v3.8.193）回归：向导 板块/细分/题型 与 canonical(SUB_VARIANTS+solveSteps) 同源
import { describe, it, expect } from 'vitest'
import { WIZARD_PLATES, subsOf, typesOf, typeHint } from '../data/wizardTree'
import { VARIANTS } from '../data/solveSteps'
import { SUB_VARIANTS } from '../components/examData'

describe('wizardTree 数据源', () => {
  it('六大板块齐备；判断推理细分 4 类', () => {
    expect(WIZARD_PLATES.map((x) => x.key)).toEqual(['判断推理', '言语理解', '数量关系', '资料分析', '常识判断', '政治理论'])
    expect(subsOf('判断推理')).toEqual(['图形推理', '定义判断', '类比推理', '逻辑判断'])
    expect(subsOf('言语理解')).toEqual([])
  })
  it('每板块可选题型非空，且全部存在于 solveSteps.VARIANTS（与分步模板对齐）', () => {
    for (const g of WIZARD_PLATES) {
      const ts = typesOf(g.key, '')
      expect(ts.length, g.key + ' 无题型').toBeGreaterThan(0)
      ts.forEach((t) => { expect(VARIANTS[t], g.key + ' 非 canonical: ' + t).toBeTruthy() })
      g.subs.forEach((s) => { const ts2 = typesOf(g.key, s); expect(ts2.length, g.key + '/' + s + ' 无题型').toBeGreaterThan(0); ts2.forEach((x) => expect(VARIANTS[x]).toBeTruthy()) })
    }
  })
  it('可达题型并集 === SUB_VARIANTS canonical 全量（与出题下拉一致）', () => {
    const reach = new Set()
    WIZARD_PLATES.forEach((g) => { typesOf(g.key, '').forEach((t) => reach.add(t)); g.subs.forEach((s) => typesOf(g.key, s).forEach((t) => reach.add(t))) })
    const all = new Set()
    Object.keys(SUB_VARIANTS).forEach((k) => (SUB_VARIANTS[k] || []).forEach((t) => all.add(t)))
    all.forEach((t) => expect(reach.has(t), '向导不可达: ' + t).toBe(true))
  })
  it('typeHint 返回 keypoint+陷阱；未知返回空', () => {
    expect(typeHint('削弱型')).toContain('因果倒置')
    expect(typeHint('不存在的题型X')).toBe('')
  })
})
