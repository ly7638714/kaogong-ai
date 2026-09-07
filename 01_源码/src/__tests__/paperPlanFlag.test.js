// paperPlan 疑题降权（37号 加固B）回归：被标记变体权重下降、无标记不受影响
import { describe, it, expect } from 'vitest'
import { planVariants, planStrengthened, applyFlagSuppress } from '../utils/paperPlan'

const mk = (plate, variant, n, ok) => Array.from({ length: n }, (_, i) => ({ plate, variant, ok: i < ok, usedSec: 20, genVer: 'g1', reqDiff: 'mid' }))

describe('applyFlagSuppress', () => {
  it('被标记变体权重按 1/(1+0.6·c) 降低，未标记不变', () => {
    const out = applyFlagSuppress('图形推理', { A: 1, B: 1, C: 1 }, { '图形推理|A': 2 })
    expect(out.A).toBeCloseTo(1 / (1 + 2 * 0.6), 6)
    expect(out.B).toBe(1)
    expect(out.C).toBe(1)
  })
})

describe('planVariants flags', () => {
  const tu = ['A', 'B', 'C']
  it('均匀下被标记 A 名额显著少于 B/C', () => {
    const seq = planVariants('图形推理', tu, 9, { flags: { '图形推理|A': 3 } })
    const c = (v) => seq.filter((x) => x === v).length
    expect(c('A')).toBeLessThan(c('B'))
    expect(c('B')).toBeGreaterThan(0)
    expect(seq.length).toBe(9)
  })
  it('无 flags 时与默认一致（行为不回归）', () => {
    expect(planVariants('图形推理', tu, 9, {})).toEqual(planVariants('图形推理', tu, 9))
  })
})

describe('planStrengthened flags', () => {
  it('补短模式下疑题变体同样被压制', () => {
    const atts = [].concat(mk('图形推理', 'A', 10, 2), mk('图形推理', 'B', 10, 8), mk('图形推理', 'C', 10, 8))
    const seq = planStrengthened('图形推理', ['A', 'B', 'C'], 12, atts, 0.6, { '图形推理|A': 4 })
    const c = (v) => seq.filter((x) => x === v).length
    expect(c('A')).toBeLessThan(c('B'))
    expect(seq.length).toBe(12)
  })
})
