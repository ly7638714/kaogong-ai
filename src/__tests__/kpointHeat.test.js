// kpointHeat 考点热度（5.2 数据层）回归：近周窗口/TopN/按周聚合
import { describe, it, expect } from 'vitest'
import { kpointHeat } from '../utils/kpointHeat'

const mk = (plate, kp, t, ok) => ({ plate, kpoint: kp, ok, t, usedSec: 20, genVer: 'g1', reqDiff: 'mid' })
const D = 86400000

describe('kpointHeat', () => {
  it('按周窗口与 TopN 聚合', () => {
    const now = Date.now()
    const list = [
      mk('资料分析', '资料分析·比重', now - 1 * D, true),
      mk('资料分析', '资料分析·比重', now - 1 * D, false),
      mk('资料分析', '资料分析·比重', now - 9 * D, true), // 上周
      mk('言语理解', '言语理解·逻辑填空', now - 1 * D, true),
      mk('言语理解', '言语理解·逻辑填空', now - 40 * D, true) // 超出窗口
    ]
    const h = kpointHeat(list, { weeks: 2, topN: 5 })
    expect(h.kps.length).toBe(2)
    expect(h.kps[0].kp).toBe('资料分析·比重')
    expect(h.kps[0].total).toBe(3)
    expect(h.kps[0].rate).toBe(67)
    expect(h.wkRows.length).toBe(2)
    expect(h.wkRows[1].cells[0].n).toBe(2) // 本周（索引1）
    expect(h.wkRows[0].cells[0].n).toBe(1) // 上周
  })
  it('空输入安全', () => {
    const h = kpointHeat([], { weeks: 4, topN: 10 })
    expect(h.kps).toEqual([])
    expect(h.wkRows.length).toBe(4)
  })
})
