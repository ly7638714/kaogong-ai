// dataTrainTips（v3.8.200）回归：三锁定高亮 + 真实口径参考
import { describe, it, expect } from 'vitest'
import { lockHighlights, REAL_REF, findLockWords, semanticLockHighlights } from '../utils/dataTrainTips'

describe('lockHighlights', () => {
  it('给时间/指标/单位加粗，关闭时不改', () => {
    const md = '2024年粮食产量70650万吨，同比提高1.6%'
    const on = lockHighlights(md, true)
    expect(on).toContain('**2024年**')
    expect(on).toContain('**同比**')
    expect(on).toContain('**70650万吨**')
    expect(on).toContain('**1.6%**')
    expect(lockHighlights(md, false)).toBe(md)
  })
  it('REAL_REF 提供关键来源样例', () => {
    expect(REAL_REF['国家统计局 · 粮食']).toContain('70650')
  })
})

describe('findLockWords', () => {
  it('抽取 时间/指标/单位 定位词', () => {
    const r = findLockWords('2024年粮食产量70650万吨，同比提高1.6%')
    expect(r.time).toContain('2024年')
    expect(r.ind).toContain('同比')
    expect(r.unit.join(' ')).toContain('70650万吨')
  })
})

describe('semanticLockHighlights（当前题所需数据高亮）', () => {
  it('只给题干提到的时间/指标/数值加红色标记，其他数值不误伤', () => {
    const md = '2023年粮食产量65000万吨，2024年70650万吨，同比提高1.6%；生猪存栏43123万头。'
    const hit = semanticLockHighlights(md, { nums: ['70650万吨', '1.6%'], words: ['粮食产量', '2024年'] })
    expect(hit).toContain('dt-lock-red')
    expect(hit).toContain('70650万吨')
    expect(hit).not.toContain('dt-lock-red">2023年</span>')
    expect(hit).not.toContain('dt-lock-red">43123万头</span>')
    const off = semanticLockHighlights(md, {})
    expect(off).toBe(md)
  })

  it('比重题只高亮题干对应的分子/分母指标与当期数值，不误伤其他分项', () => {
    const md = '2024年上半年白酒产量为12,929亿元，卷烟产量为17,759亿元，啤酒产量为6,111亿元。'
    const hit = semanticLockHighlights(md, { nums: ['12,929', '17,759'], words: ['白酒产量', '卷烟产量', '2024年上半年', '亿元'] })
    expect(hit).toContain('dt-lock-red">12,929亿元</span>')
    expect(hit).toContain('dt-lock-red">17,759亿元</span>')
    expect(hit).toContain('白酒产量')
    expect(hit).toContain('卷烟产量')
    expect(hit).not.toContain('dt-lock-red">6,111</span>')
  })
})
