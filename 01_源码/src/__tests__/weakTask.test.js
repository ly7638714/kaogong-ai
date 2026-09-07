// weakTask（答错≥3同类 → 补弱任务）回归
import { describe, it, expect } from 'vitest'
import { weakCandidates, weakTaskItem, mergeWeakTasks, MIN_WRONG } from '../utils/weakTask'
describe('weakTask', () => {
  it('弱候选：同题型累计答错 >=3 才触发', () => {
    const wqs = [
      { subject: '判断推理', sub: '削弱型', wrongCount: 3 },
      { subject: '判断推理', sub: '削弱型', wrongCount: 1 },
      { subject: '数量关系', sub: '工程问题', wrongCount: 2 },
      { subject: '言语理解', variant: '逻辑填空', wrongCount: 4 }
    ]
    const c = weakCandidates(wqs, { wrongTypeOf: (q) => q.sub || q.variant })
    const keys = c.map((x) => x.type)
    expect(keys).toContain('削弱型')
    expect(keys).toContain('逻辑填空')
    expect(keys).not.toContain('工程问题')
    expect(MIN_WRONG).toBe(3)
  })
  it('weakTaskItem 题量随答错次数增加', () => {
    const it1 = weakTaskItem({ plate: '判断推理', type: '削弱型', wrongN: 3 })
    const it5 = weakTaskItem({ plate: '判断推理', type: '削弱型', wrongN: 8 })
    expect(it1.label).toContain('补弱')
    expect(it5.label).toContain('连做')
  })
  it('mergeWeakTasks upsert 不重复', () => {
    const base = [{ k: 'practice', label: '刷5题', done: false }]
    const wqs = [{ subject: '数量关系', sub: '行程问题', wrongCount: 4 }]
    const r1 = mergeWeakTasks(base, wqs, { wrongTypeOf: (q) => q.sub })
    expect(r1.changed).toBe(true)
    expect(r1.tasks.length).toBe(2)
    const r2 = mergeWeakTasks(r1.tasks, wqs, { wrongTypeOf: (q) => q.sub })
    expect(r2.changed).toBe(false)
    expect(r2.tasks.length).toBe(2)
  })
})
