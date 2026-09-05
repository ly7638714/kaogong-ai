import { describe, it, expect } from 'vitest'
import { GEN_STRATEGY, canLocalStrat, offlineLocalOk, localFirstFreeOk } from '../data/genStrategy'

// P3-2 本地确定性 vs AI 生成策略表：改策略=改一行数据，不再翻代码 if

describe('GEN_STRATEGY 策略表', () => {
  it('本地可生成板块 = 图推/数量/政治/资料（含 gen 函数者）', () => {
    for (const p of ['图形推理', '数量关系', '政治理论', '资料分析']) expect(GEN_STRATEGY[p].local).toBe(true)
    for (const p of ['言语理解', '判断推理', '常识判断']) expect(GEN_STRATEGY[p].local).toBe(false)
  })
  it('canLocalStrat：3D 子题型（空间重构/截面图/三视图/立体拼合）不落本地', () => {
    expect(canLocalStrat('图形推理', '空间重构')).toBe(false)
    expect(canLocalStrat('图形推理', '三视图')).toBe(false)
    expect(canLocalStrat('图形推理', '黑白块')).toBe(true)
    expect(canLocalStrat('数量关系', '工程问题')).toBe(true)
  })
  it('offlineLocalOk / localFirstFreeOk 与表一致', () => {
    expect(offlineLocalOk('政治理论')).toBe(true)
    expect(localFirstFreeOk('数量关系')).toBe(true)
    expect(localFirstFreeOk('言语理解')).toBe(false)
    expect(canLocalStrat('未知板块', 'x')).toBe(false)
  })
})
