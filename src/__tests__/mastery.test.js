// mastery 掌握度收编（批次6-6A 回归）：口径统一 + 一致性
import { describe, it, expect } from 'vitest'
import { masteryOfPlate, overallEstimate, MASTERY_PLATES } from '../utils/mastery'

const mk = (subject, reviewed = false, digested = false) => ({ subject, reviewed, digested })

describe('mastery 掌握度收编（批次6-6A）', () => {
  it('无数据返回 0（与看板"—"语义一致的"暂无数据"）', () => {
    expect(masteryOfPlate('言语理解', [])).toBe(0)
    expect(masteryOfPlate('言语理解', [{ subject: '数量关系' }])).toBe(0)
  })
  it('错题越多掌握越低、复盘越多越高', () => {
    const wqs = [mk('言语理解'), mk('言语理解'), mk('言语理解')]
    const base = masteryOfPlate('言语理解', wqs)
    const withRev = masteryOfPlate('言语理解', wqs.map((q, i) => (i === 0 ? { ...q, reviewed: true } : q)))
    expect(withRev).toBeGreaterThan(base)
    const moreWrong = masteryOfPlate('言语理解', [...wqs, mk('言语理解')])
    expect(moreWrong).toBeLessThan(base)
  })
  it('子板块分组：判断推理统计其子板块错题', () => {
    const wqs = [mk('图形推理'), mk('定义判断')]
    expect(masteryOfPlate('判断推理', wqs, { plates: ['判断推理', '图形推理', '定义判断', '类比推理', '逻辑判断'] })).toBeGreaterThan(0)
  })
  it('overallEstimate 六板块平均（无数据板块不计入）', () => {
    const wqs = [mk('言语理解', true), mk('言语理解', true), mk('资料分析')]
    const o = overallEstimate(wqs)
    expect(o).toBeGreaterThan(0)
    expect(overallEstimate([])).toBe(0)
  })
  it('MASTERY_PLATES 六板块齐备', () => {
    expect(MASTERY_PLATES.map((p) => p.key)).toEqual(['判断推理', '言语理解', '资料分析', '数量关系', '常识判断', '政治理论'])
  })
})
