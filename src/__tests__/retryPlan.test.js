import { describe, it, expect } from 'vitest'
import { pickRetryReset } from '../utils/retryPlan'

const good = (extra = {}) => ({ stem: '已出成功题', err: false, options: [1, 2, 3, 4], ...extra })
const failed = (extra = {}) => ({ stem: '（出题失败：X）', err: true, options: [], ...extra })

describe('retryPlan 只补失败题计划', () => {
  it('纯成功卷：无任何重置', () => {
    const qs = [good(), good(), good()]
    expect(pickRetryReset(qs)).toEqual({ resetIdx: [], ok: 3, n: 0, groupReset: [] })
  })
  it('两个单题失败：只重置这两个（成功题绝不重置）', () => {
    const qs = [good({ variant: '选词填空' }), failed({ variant: '片段阅读' }), good(), failed({ variant: '语句排序' })]
    const r = pickRetryReset(qs)
    expect(r.n).toBe(2)
    expect(r.resetIdx).toEqual([1, 3])
    expect(r.ok).toBe(2)
  })
  it('题组 leader 失败 → 整组 5 个成员全重置（含原本成功的成员）', () => {
    const lead = { ...good(), group: true, groupId: 7, groupLeader: true, groupN: 5, variant: '资料分析' }
    lead.err = true; lead.stem = '（材料生成失败）'
    const qs = [lead, good({ group: true, groupId: 7 }), good({ group: true, groupId: 7 }), good({ group: true, groupId: 7 }), good({ group: true, groupId: 7 }), good({ subject: '常识判断' })]
    const r = pickRetryReset(qs)
    expect(r.resetIdx).toEqual([0, 1, 2, 3, 4])
    expect(r.ok).toBe(1) // 组外成功题保留
    expect(r.groupReset).toEqual([7])
  })
  it('题组中间某成员失败 → 整组重出（leader 也被重置，哪怕它已成功）', () => {
    const qs = [good({ group: true, groupId: 3, groupLeader: true }), good({ group: true, groupId: 3 }), failed({ group: true, groupId: 3 })]
    const r = pickRetryReset(qs)
    expect(r.resetIdx).toEqual([0, 1, 2])
  })
  it('空数组/非数组安全', () => {
    expect(pickRetryReset([])).toEqual({ resetIdx: [], ok: 0, n: 0, groupReset: [] })
    expect(pickRetryReset(null)).toEqual({ resetIdx: [], ok: 0, n: 0, groupReset: [] })
  })
})
