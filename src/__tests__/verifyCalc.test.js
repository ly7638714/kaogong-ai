import { describe, it, expect } from 'vitest'
import { calcRecheck, groupNumericRecheck } from '../utils/verifyCalc'

const Q = (answer, opts) => ({ answer, options: opts.map((t, i) => ({ k: String.fromCharCode(65 + i), t })) })

describe('verifyCalc 【验算】程序复核', () => {
  it('无【验算】行 → skip（不惩罚）', () => {
    expect(calcRecheck(Q('C', ['12', '13', '36', '40']), '题干…\n【正确答案】C')).toEqual({ ok: null })
  })
  it('算式与所附数值、答案选项都一致 → ok', () => {
    const q = Q('C', ['12', '13', '36', '40'])
    expect(calcRecheck(q, '…\n【正确答案】C\n【验算】12*3=36')).toEqual({ ok: true })
  })
  it('答案选项与算式一致、所附数值被改错 → ok:false（防模型自相矛盾）', () => {
    const q = Q('C', ['12', '13', '36', '40'])
    const r = calcRecheck(q, '…\n【正确答案】C\n【验算】12*3=35')
    expect(r.ok).toBe(false)
  })
  it('算式正确但答案选项数值对不上 → ok:false（抓臆造答案）', () => {
    const q = Q('A', ['30', '36', '40', '44'])
    const r = calcRecheck(q, '…\n【正确答案】A\n【验算】12*3=36')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('不一致')
  })
  it('支持括号/除法/小数与全角符号、全角数字', () => {
    const q = Q('D', ['1', '2', '3', '4.5'])
    expect(calcRecheck(q, '…\n【正确答案】D\n【验算】（9÷2）=4.5')).toEqual({ ok: true })
  })
  it('选项/算式含汉字、百分号、单位 → skip（避免量纲误判）', () => {
    const q = Q('A', ['提高了36%', '降低', '持平', '无法判断'])
    expect(calcRecheck(q, '…\n【正确答案】A\n【验算】40-4=36%')).toEqual({ ok: null })
  })
  it('非纯算式（含未知符号）→ skip', () => {
    const q = Q('B', ['10', '12', '14', '16'])
    expect(calcRecheck(q, '…\n【正确答案】B\n【验算】x+2=12')).toEqual({ ok: null })
  })
  it('非法输入安全', () => {
    expect(calcRecheck(null, null)).toEqual({ ok: null })
    expect(calcRecheck(Q('A', ['1', '2', '3', '4']), '')).toEqual({ ok: null })
  })
})


describe('verifyCalc 材料题组版 groupNumericRecheck', () => {
  const qs = [Q('B', ['80', '120', '150', '200']), Q('C', ['40', '45', '50', '55'])]
  it('按【正确答案】归属：第二题【验算】数值错 → 报第二题(idx=1)', () => {
    const raw = '### 第1题\n题干A\nA.80\nB.120\nC.150\nD.200\n【正确答案】B\n### 第2题\n题干B\nA.40\nB.45\nC.50\nD.55\n【正确答案】C\n【验算】10*4=60'
    const r = groupNumericRecheck(raw, qs)
    expect(r.ok).toBe(false)
    expect(r.idx).toBe(1)
  })
  it('第一题答案与验算不符 → 报第一题(idx=0)', () => {
    const raw = '### 第1题\n题干A\nA.80\nB.120\nC.150\nD.200\n【正确答案】B\n【验算】100+20=80\n### 第2题\n题干B\nA.40\nB.45\nC.50\nD.55\n【正确答案】C'
    const r = groupNumericRecheck(raw, qs)
    expect(r.ok).toBe(false)
    expect(r.idx).toBe(0)
  })
  it('全部一致 → ok:true', () => {
    const raw = '### 第1题\n题干A\nA.80\nB.120\nC.150\nD.200\n【正确答案】B\n【验算】100+20=120\n### 第2题\n题干B\nA.40\nB.45\nC.50\nD.55\n【正确答案】C\n【验算】10*5=50'
    expect(groupNumericRecheck(raw, qs)).toEqual({ ok: true })
  })
  it('无【验算】/无法解析/越界归属 → ok:true（不误伤）', () => {
    expect(groupNumericRecheck('### 第1题\n题干A\nA.1\nB.2\nC.3\nD.4\n【正确答案】A', qs)).toEqual({ ok: true })
    expect(groupNumericRecheck('【验算】x+1=9', qs)).toEqual({ ok: true }) // 任何答案之前出现 → 无归属跳过
    expect(groupNumericRecheck(null, qs)).toEqual({ ok: true })
    expect(groupNumericRecheck('### 第1题\n【正确答案】A\n【验算】2*2=9', null)).toEqual({ ok: true })
  })
})
