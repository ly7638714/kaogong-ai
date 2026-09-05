// mastery R3（evidence-based）回归：单题证据加权 + 板块融合 + 暂无数据语义
import { describe, it, expect } from 'vitest'
import { masteryOfPlate, overallEstimate, MASTERY_PLATES, questionMastery } from '../utils/mastery'

const mk = (subject, extra = {}) => ({ subject, reviewed: false, digested: false, wrongCount: 1, ...extra })

describe('questionMastery（R3 单题）', () => {
  it('新错未复盘：低起点；复盘+连续答对提升；复错显著回落', () => {
    const fresh = mk('言语理解')
    expect(questionMastery(fresh)).toBeGreaterThanOrEqual(2)
    const rev = mk('言语理解', { reviewed: true, correctStreak: 1 })
    expect(questionMastery(rev)).toBeGreaterThan(questionMastery(fresh))
    const dig = mk('言语理解', { digested: true, correctStreak: 2, dueAt: Date.now() + 86400000 })
    expect(questionMastery(dig)).toBeGreaterThan(questionMastery(rev))
    const reWrong = mk('言语理解', { reviewed: true, correctStreak: 2, digested: true, dueAt: Date.now() + 86400000, reviewStats: { r: 2, e: 1 } })
    expect(questionMastery(reWrong)).toBeLessThan(questionMastery(dig))
  })
  it('clamp 2..100；null 输入为 0', () => {
    expect(questionMastery(null)).toBe(0)
    expect(questionMastery(mk('言语理解', { reviewed: true, correctStreak: 99, digested: true }))).toBeGreaterThanOrEqual(90)
  })
})

describe('masteryOfPlate（R3 板块）', () => {
  it('无作答无错题返回 0（暂无数据语义）', () => {
    expect(masteryOfPlate('言语理解', [])).toBe(0)
    expect(masteryOfPlate('言语理解', [{ subject: '数量关系' }])).toBe(0)
  })
  it('无作答证据但有错题 → 退化为错题均值；错得越深越低、复盘越高', () => {
    const wqs = [mk('言语理解'), mk('言语理解'), mk('言语理解')]
    const base = masteryOfPlate('言语理解', wqs)
    const withRev = masteryOfPlate('言语理解', wqs.map((q, i) => (i === 0 ? { ...q, reviewed: true } : q)))
    expect(withRev).toBeGreaterThan(base)
    const deep = [mk('言语理解'), mk('言语理解', { wrongCount: 3 })]
    expect(masteryOfPlate('言语理解', deep)).toBeLessThan(masteryOfPlate('言语理解', [mk('言语理解'), mk('言语理解')]))
  })
  it('有作答证据（≥5 近 60 天）→ 正确率主导融合', () => {
    const attempts = Array.from({ length: 20 }, (_, i) => ({ plate: '言语理解', ok: i < 17, t: Date.now() - i * 86400000 }))
    const wqs = [mk('言语理解', { reviewed: true, correctStreak: 1 })]
    const v = masteryOfPlate('言语理解', wqs, { attempts })
    expect(v).toBeGreaterThan(60)
    expect(v).toBeLessThanOrEqual(100)
  })
  it('子板块分组：判断推理统计其子板块错题/作答', () => {
    const wqs = [mk('图形推理'), mk('定义判断')]
    expect(masteryOfPlate('判断推理', wqs, { plates: ['判断推理', '图形推理', '定义判断', '类比推理', '逻辑判断'] })).toBeGreaterThan(0)
  })
})

describe('overallEstimate / MASTERY_PLATES', () => {
  it('六板块平均（无数据不计入）；空为 0', () => {
    const wqs = [mk('言语理解', { reviewed: true, correctStreak: 2 }), mk('言语理解', { reviewed: true }), mk('资料分析')]
    expect(overallEstimate(wqs)).toBeGreaterThan(0)
    expect(overallEstimate([])).toBe(0)
  })
  it('MASTERY_PLATES 六板块齐备', () => {
    expect(MASTERY_PLATES.map((p) => p.key)).toEqual(['判断推理', '言语理解', '资料分析', '数量关系', '常识判断', '政治理论'])
  })
})