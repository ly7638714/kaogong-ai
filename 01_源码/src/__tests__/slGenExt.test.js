// slGen 扩量回归（深化①）：最值/浓度/年龄三类可被种子产出且全过 localQuizVerify
import { describe, it, expect } from 'vitest'
import { genSlQuestion } from '../utils/slGen'
import { localQuizVerify } from '../utils/quizVerify'

describe('slGen 新增可算类型覆盖', () => {
  it('浓度/年龄/抽屉三类均在 0..3000 种子内可产出且过闸', () => {
    const want = ['sl-nd', 'sl-nl', 'sl-zd']
    const hits = {}
    const bad = []
    for (let s = 0; s < 3000; s++) {
      if (want.every((k) => (hits[k] || 0) >= 2)) break
      const q = genSlQuestion(s)
      if (!q) continue
      if (want.includes(q.cardId)) {
        hits[q.cardId] = (hits[q.cardId] || 0) + 1
        const v = localQuizVerify(q)
        if (!v.ok) bad.push(q.cardId + '#' + s + ': ' + v.reason)
      }
    }
    expect(bad).toEqual([])
    want.forEach((k) => expect(hits[k] || 0, '缺少产出 ' + k).toBeGreaterThanOrEqual(1))
  })
})
