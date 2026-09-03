import { describe, it, expect } from 'vitest'
import { verifyReply, formulaCheck } from '../utils/replyVerify'

describe('P1-1 replyVerify 回复五查', () => {
  it('选非设问+正面措辞 → 提示方向', () => {
    const r = verifyReply({ question: '下列说法错误的是？', reply: '答案应选 C，C 是正确的。' })
    expect(r.pass).toBe(false)
    expect(r.warnings.some((x) => x.includes('选非'))).toBe(true)
  })
  it('同比题用“上个月”作基期 → 时间口径提示', () => {
    const r = verifyReply({ question: '2023年3月产量同比增速？', reply: '与上个月相比，产量增长5%。' })
    expect(r.warnings.some((x) => x.includes('环比口径') || x.includes('同比'))).toBe(true)
  })
  it('单位混用无换算 → 量级提示', () => {
    const r = verifyReply({ question: '该省出口额（单位：亿美元）增长多少？', reply: '增长了 3.2 万亿元，约合 3000 亿。' })
    // 无换算说明且同时出现 亿/万亿 → 提示
    expect(r.pass).toBe(true) // 含“约合”视为已换算
    const r2 = verifyReply({ question: 'A为12000亿元，B为4500万元', reply: 'A是1.2万亿，B是4500万元，相差悬殊' })
    expect(r2.warnings.length).toBeGreaterThan(0)
  })
  it('增长量漏分母 → 公式提示', () => {
    const steps = ['现期×r/(1+r)；百化分：r≈1/n 时增量≈现期/(n+1)']
    const r1 = formulaCheck('资料分析', '现期400，增长16.7%，增长量为？', '增长量 = 现期 × r = 66.7', steps)
    expect(r1.some((x) => x.includes('(1+r)'))).toBe(true)
    const r2 = formulaCheck('资料分析', '现期400，增长16.7%，增长量为？', '增长量=现期×r/(1+r)=400×16.7%/1.167≈57', steps)
    expect(r2.length).toBe(0)
  })
  it('空回复判为不过', () => {
    expect(verifyReply({ question: 'x', reply: '' }).pass).toBe(false)
  })
})