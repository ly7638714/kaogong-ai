// abilityGate 灰度门槛（35号批次4-B）回归：板块归并 / θ 展示门槛 / 预测分解锁 / 锚点提示
import { describe, it, expect } from 'vitest'
import { computeGate, groupTheta, groupOf, THETA_MIN_N, PRED_TOTAL, ANCHOR_TOTAL } from '../utils/abilityGate'

const att = (plate, ok, t) => ({ t: t || 1, plate, variant: '综合', kpoint: plate + '·综合', ok, usedSec: 20, genVer: 'g1', reqDiff: 'mid' })

describe('groupOf 板块归并', () => {
  it('判断推理四子板块归并到判断推理', () => {
    expect(groupOf('图形推理')).toBe('判断推理')
    expect(groupOf('逻辑判断')).toBe('判断推理')
    expect(groupOf('言语理解')).toBe('言语理解')
    expect(groupOf('未分类')).toBe('')
  })
})

describe('computeGate 门槛', () => {
  it('不足 200：predictionReady=false 且 need 正确', () => {
    const list = Array.from({ length: 30 }, () => att('图形推理', true))
    const g = computeGate(list)
    expect(g.total).toBe(30)
    expect(g.predictionReady).toBe(false)
    expect(g.need).toBe(PRED_TOTAL - 30)
    expect(g.anchorReady).toBe(false)
    expect(g.byGroup['判断推理']).toBe(30)
  })
  it('累计 200 且覆盖≥60% 板块才解锁预测分', () => {
    const list = []
    for (let i = 0; i < PRED_TOTAL; i++) { const pl = ['图形推理', '言语理解', '资料分析', '数量关系'][i % 4]; list.push(att(pl, i % 3 !== 0, i)) }
    const g = computeGate(list)
    expect(g.total).toBe(PRED_TOTAL)
    expect(g.thetaReady).toBe(true)
    expect(g.coverage).toBeGreaterThanOrEqual(4 / 6)
    expect(g.predictionReady).toBe(true)
  })
  it('锚点提示在累计 100 解锁', () => {
    const list = Array.from({ length: ANCHOR_TOTAL }, (_, i) => att(['言语理解', '常识判断'][i % 2], true))
    expect(computeGate(list).anchorReady).toBe(true)
  })
  it('θ 展示需板块样本 n≥THETA_MIN_N', () => {
    const few = Array.from({ length: THETA_MIN_N - 1 }, () => att('言语理解', true))
    expect(computeGate(few).thetaGroups).toEqual([])
    const enough = Array.from({ length: THETA_MIN_N }, () => att('言语理解', true))
    expect(computeGate(enough).thetaGroups).toContain('言语理解')
  })
})

describe('groupTheta 板块能力值归并', () => {
  it('按样本量加权并归并到六大板块', () => {
    const list = [].concat(Array.from({ length: 10 }, () => att('图形推理', true)), Array.from({ length: 10 }, () => att('定义判断', false)), Array.from({ length: 5 }, () => att('言语理解', true)))
    const th = groupTheta(list)
    expect(th['判断推理'].n).toBe(20)
    expect(th['言语理解'].n).toBe(5)
    expect(typeof th['判断推理'].θ).toBe('number')
  })
})
