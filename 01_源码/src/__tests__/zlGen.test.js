// zlGen 资料构建性生成（深化A）回归：批量过闸 + 结构规范 + 九大家族程序复算
import { describe, it, expect } from 'vitest'
import { genZlQuestion } from '../utils/zlGen'
import { localQuizVerify } from '../utils/quizVerify'
import { numericOptionIssues } from '../utils/quizVerifyProfiles'

describe('zlGen 资料确定性生成', () => {
  it('40 抽全部结构完整且过闸、无数值重复', () => {
    let ok = 0
    for (let i = 0; i < 40; i++) {
      const q = genZlQuestion(i)
      if (!q) continue
      expect(q.stem.length).toBeGreaterThan(15)
      expect(Array.isArray(q.options)).toBe(true)
      expect(q.options.length).toBe(4)
      const v = localQuizVerify(q)
      expect(v.ok, 'seed ' + i + ' ' + v.reason).toBe(true)
      expect(numericOptionIssues(q)).toEqual([])
      ok++
    }
    expect(ok).toBeGreaterThanOrEqual(30)
  })

  it('九大家族全部覆盖且结构/闸门全绿（含乘积增长率/两期比重差/平均数增长率）', () => {
    const seen = new Set()
    let ok = 0
    for (let i = 0; i < 1200; i++) {
      const q = genZlQuestion(i)
      if (!q) continue
      seen.add(q.cardId)
      expect(q.stem.length).toBeGreaterThan(15)
      expect(q.options.length).toBe(4)
      expect(new Set(q.options.map((x) => String(x.t))).size).toBe(4)
      const v = localQuizVerify(q)
      expect(v.ok, 'card ' + q.cardId + ' seed ' + i + ' ' + v.reason).toBe(true)
      expect(numericOptionIssues(q)).toEqual([])
      ok++
    }
    expect(ok).toBeGreaterThan(800)
    for (const want of ['zl-zz', 'zl-zzl', 'zl-bz', 'zl-pj', 'zl-bs', 'zl-gn', 'zl-cjzl', 'zl-bzbj', 'zl-pjszl']) expect(seen.has(want), '缺少家族 ' + want).toBe(true)
  })

  it('倍数家族：答案=现期/基期（程序复算核对）', () => {
    let q = null
    for (let i = 0; i < 300 && !q; i++) { const x = genZlQuestion(i); if (x && x.cardId === 'zl-bs') q = x }
    expect(q).toBeTruthy()
    const nums = String(q.stem).match(/收入\s*([0-9.]+)\s*亿元[^。]*?为\s*([0-9.]+)\s*亿元/)
    expect(nums).toBeTruthy()
    const ratio = Math.round((parseFloat(nums[2]) / parseFloat(nums[1])) * 10) / 10
    const ans = q.options.find((o) => o.k === q.answer)
    expect(parseFloat(ans.t)).toBe(ratio)
  })

  it('隔年家族：答案=(1+p1%)×(1+p2%)−1 程序复算核对', () => {
    let q = null
    for (let i = 0; i < 300 && !q; i++) { const x = genZlQuestion(i); if (x && x.cardId === 'zl-gn') q = x }
    expect(q).toBeTruthy()
    const m = String(q.stem).match(/同比增长\s*([0-9.]+)%，[^。]*?又同比增长\s*([0-9.]+)%/)
    expect(m).toBeTruthy()
    const comp = Math.round(((1 + parseFloat(m[1]) / 100) * (1 + parseFloat(m[2]) / 100) - 1) * 100)
    const ans = q.options.find((o) => o.k === q.answer)
    expect(parseFloat(ans.t)).toBe(comp)
  })

  it('乘积增长率家族：答案=(1+a%)(1+b%)-1 程序复算核对', () => {
    let q = null
    for (let i = 0; i < 400 && !q; i++) { const x = genZlQuestion(i); if (x && x.cardId === 'zl-cjzl') q = x }
    expect(q).toBeTruthy()
    const arr = [...String(q.stem).matchAll(/同比增长\s*(-?[0-9.]+)%/g)].map((m) => parseFloat(m[1]))
    expect(arr.length).toBe(2)
    const r = Math.round(((1 + arr[0] / 100) * (1 + arr[1] / 100) - 1) * 100)
    const ans = q.options.find((o) => o.k === q.answer)
    expect(parseFloat(ans.t)).toBe(r)
  })

  it('两期比重差家族：答案方向 = 部分增速 vs 整体增速', () => {
    let q = null
    for (let i = 0; i < 400 && !q; i++) { const x = genZlQuestion(i); if (x && x.cardId === 'zl-bzbj') q = x }
    expect(q).toBeTruthy()
    const arr = [...String(q.stem).matchAll(/同比增长\s*(-?[0-9.]+)%/g)].map((m) => parseFloat(m[1]))
    expect(arr.length).toBe(2)
    const want = arr[0] > arr[1] ? '上升' : '下降'
    const ans = q.options.find((o) => o.k === q.answer)
    expect(String(ans.t)).toBe(want)
  })

  it('平均数增长率家族：答案与 (1+a)/(1+b)-1 一致（1 位小数）', () => {
    let q = null
    for (let i = 0; i < 400 && !q; i++) { const x = genZlQuestion(i); if (x && x.cardId === 'zl-pjszl') q = x }
    expect(q).toBeTruthy()
    const arr = [...String(q.stem).matchAll(/同比增长\s*(-?[0-9.]+)%/g)].map((m) => parseFloat(m[1]))
    expect(arr.length).toBe(2)
    const r = Math.round(((1 + arr[0] / 100) / (1 + arr[1] / 100) - 1) * 1000) / 10
    const ans = q.options.find((o) => o.k === q.answer)
    expect(parseFloat(ans.t)).toBeCloseTo(r, 6)
  })
})
