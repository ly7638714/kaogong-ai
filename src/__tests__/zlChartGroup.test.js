// zlChartGroup 图形材料确定性题组（实测反馈·图形材料必有图）回归
import { describe, it, expect } from 'vitest'
import { genZlChartGroup } from '../utils/zlChartGroup'
import { localQuizVerify } from '../utils/quizVerify'
import { numericOptionIssues } from '../utils/quizVerifyProfiles'

describe('zlChartGroup 图形材料确定性题组', () => {
  it('300 抽全部产出：真 SVG（viewBox）+ 5 题结构合法且过闸', () => {
    const kinds = new Set()
    let ok = 0
    for (let i = 0; i < 300; i++) {
      const g = genZlChartGroup()
      if (!g) continue
      kinds.add(g.kind)
      expect(String(g.svg)).toContain('<svg')
      expect(String(g.svg)).toContain('viewBox')
      expect(Array.isArray(g.qs)).toBe(true)
      expect(g.qs.length).toBe(5)
      for (const q of g.qs) {
        expect(q.stem.length).toBeGreaterThan(8)
        expect(q.options.length).toBe(4)
        expect(new Set(q.options.map((x) => String(x.t))).size).toBe(4)
        expect(/^[A-D]$/.test(q.answer)).toBe(true)
        const v = localQuizVerify(q)
        expect(v.ok, 'kind ' + g.kind + ' seed ' + i + ' ' + v.reason).toBe(true)
        expect(numericOptionIssues(q)).toEqual([])
        expect(String(q.explain || '')).not.toBe('')
      }
      ok++
    }
    expect(ok).toBeGreaterThan(200)
    for (const k of ['bar', 'line', 'pie']) expect(kinds.has(k), '缺图形类型 ' + k).toBe(true)
  })
})
