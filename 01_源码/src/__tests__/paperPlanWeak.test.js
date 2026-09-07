// paperPlan 补短模式（35号批次3-B）回归：薄弱度/样本门槛/冷启动/加权配额
import { describe, it, expect } from 'vitest'
import { statsByVariant, weaknessFor, planStrengthened, planVariants, WEAK_N, WEAK_GATE } from '../utils/paperPlan'

const mk = (plate, variant, n, okCount) => { const arr = []; for (let i = 0; i < n; i++) arr.push({ plate, variant, ok: i < okCount }); return arr }

describe('statsByVariant 聚合', () => {
  it('按 板块×变体 计数', () => {
    const atts = [].concat(mk('言语理解', '逻辑填空', 5, 2), mk('言语理解', '标题填入', 3, 3), mk('判断推理', '逻辑判断', 4, 0))
    const by = statsByVariant(atts)
    expect(by['言语理解']['逻辑填空']).toEqual({ n: 5, ok: 2 })
    expect(by['判断推理']['逻辑判断']).toEqual({ n: 4, ok: 0 })
  })
})

describe('weaknessFor 薄弱度', () => {
  it('n≥WEAK_N 给权重：弱变体薄弱度大', () => {
    const atts = [].concat(mk('图形推理', 'A', 8, 0), mk('图形推理', 'B', 8, 7))
    const wf = weaknessFor('图形推理', ['A', 'B'], atts)
    expect(wf.map.A).toBeGreaterThan(wf.map.B)
    expect(wf.map.A).toBeCloseTo(1 - (0 + 1.5) / (8 + 3), 6)
    expect(wf.map.B).toBeCloseTo(1 - (7 + 1.5) / (8 + 3), 6)
  })
  it('n<WEAK_N 不给权重（weak=0）', () => {
    const wf = weaknessFor('言语理解', ['逻辑填空'], mk('言语理解', '逻辑填空', 3, 0))
    expect(wf.map['逻辑填空']).toBe(0)
  })
  it('板块累计作答计入 subjectN', () => {
    const wf = weaknessFor('图形推理', ['A', 'B', 'C'], [].concat(mk('图形推理', 'A', 10, 0), mk('图形推理', 'B', 10, 0), mk('图形推理', 'C', 10, 0)))
    expect(wf.subjectN).toBe(30)
  })
})

describe('planStrengthened 补短配额', () => {
  const tu = ['A', 'B', 'C', 'D']
  it('满足门槛时薄弱变体获得更多名额', () => {
    const atts = [].concat(mk('图形推理', 'A', 10, 0), mk('图形推理', 'B', 10, 9), mk('图形推理', 'C', 8, 8), mk('图形推理', 'D', 2, 1))
    const seq = planStrengthened('图形推理', tu, 12, atts, 0.6)
    const c = (v) => seq.filter((x) => x === v).length
    expect(c('A')).toBeGreaterThan(c('B'))
    expect(c('A')).toBeGreaterThan(c('C'))
    expect(seq.length).toBe(12)
  })
  it('λ=0 或板块累计 <WEAK_GATE 时退化为纯考频（均匀）', () => {
    const atts = mk('图形推理', 'A', 5, 0) // subjectN=5 < 30
    const seq = planStrengthened('图形推理', tu, 8, atts, 0.6)
    const uni = planVariants('图形推理', tu, 8)
    expect(seq.length).toBe(8)
    expect(new Set(seq).size).toBe(4)
    expect(planStrengthened('图形推理', tu, 8, mk('图形推理', 'A', 40, 0), 0)).toEqual(uni)
  })
  it('空/0 输入安全返回空', () => {
    expect(planStrengthened('图形推理', tu, 0, [])).toEqual([])
    expect(planStrengthened('图形推理', [], 8, [])).toEqual([])
  })
})

describe('补充常量红线', () => {
  it('门槛常量符合 doc 35 §3.2（WEAK_N=8 / WEAK_GATE=30）', () => {
    expect(WEAK_N).toBe(8)
    expect(WEAK_GATE).toBe(30)
  })
})