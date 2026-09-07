// U7 考点×周热力矩阵（kpointMatrix / rateOf / cellColor）回归
import { describe, it, expect } from 'vitest'
import { rateOf } from '../utils/kpointHeat'
import { buildHeatOption, cellColor, weekLabel } from '../utils/kpointMatrix'

describe('rateOf', () => {
  it('按 ok/n 取整计算正确率，空返回 null', () => {
    expect(rateOf({ n: 3, ok: 2 })).toBe(67)
    expect(rateOf({ n: 0, ok: 0 })).toBe(null)
    expect(rateOf(null)).toBe(null)
  })
})

describe('cellColor / weekLabel', () => {
  it('颜色语义与 Top10 条图一致（绿≥80/黄60-79/红<60），题量为 0 透明', () => {
    expect(cellColor(0, 100, 10)).toBe('rgba(255,255,255,0)')
    expect(cellColor(2, 90, 10)).toMatch(/^rgba\(52,211,153,/)
    expect(cellColor(2, 70, 10)).toMatch(/^rgba\(251,191,36,/)
    expect(cellColor(2, 40, 10)).toMatch(/^rgba\(251,113,133,/)
  })
  it('透明度随题量占比提升', () => {
    expect(cellColor(10, 90, 10)).toBe(cellColor(5, 90, 5))
  })
  it('周标签：0=本周，其余=周前', () => {
    expect(weekLabel(0)).toBe('本周')
    expect(weekLabel(3)).toBe('3周前')
  })
})

describe('buildHeatOption', () => {
  it('生成 heatmap option：行=考点列=周、含非空格数据', () => {
    const heat = {
      kps: [{ kp: '资料分析·比重', total: 3 }, { kp: '言语理解·逻辑填空', total: 2 }],
      wkRows: [
        { w: 1, cells: [{ n: 1, ok: 1 }, { n: 2, ok: 1 }] },
        { w: 0, cells: [{ n: 2, ok: 1 }, { n: 0, ok: 0 }] }
      ]
    }
    const opt = buildHeatOption(heat)
    expect(opt).not.toBe(null)
    expect(opt.series[0].type).toBe('heatmap')
    expect(opt.xAxis.data).toEqual(['1周前', '本周'])
    expect(opt.yAxis.data).toEqual(['资料分析·比重', '言语理解·逻辑填空'])
    // 第 2 周第 2 个考点 n=0 → 无数据点
    expect(opt.series[0].data.length).toBe(3)
    expect(opt.yAxis.inverse).toBe(true)
  })
  it('无考点或全空返回 null', () => {
    expect(buildHeatOption({ kps: [], wkRows: [] })).toBe(null)
    const heat = { kps: [{ kp: 'A', total: 0 }], wkRows: [{ w: 0, cells: [{ n: 0, ok: 0 }] }] }
    expect(buildHeatOption(heat)).toBe(null)
  })
})