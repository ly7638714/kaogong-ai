// sameStreak 同类连做引擎（35号§5.3 建议项）回归
import { describe, it, expect } from 'vitest'
import { createSameStreak, onSameResult, nextSameKey } from '../utils/sameStreak'

describe('同类连做决策', () => {
  it('答错钉住当前考点', () => {
    const st = onSameResult(createSameStreak(), { subject: '资料分析', variant: '比重', ok: false, enabled: true })
    expect(st.variant).toBe('比重')
    expect(nextSameKey(st, '增长率')).toBe('比重')
  })
  it('连对未满3题仍钉住（同一考点）', () => {
    let st = onSameResult(createSameStreak(), { subject: '资料分析', variant: '比重', ok: true, enabled: true })
    st = onSameResult(st, { subject: '资料分析', variant: '比重', ok: true, enabled: true })
    expect(st.okStreak).toBe(2)
    expect(st.variant).toBe('比重')
  })
  it('连对3题后清钉（换考点）', () => {
    let st = createSameStreak()
    for (let i = 0; i < 3; i++) st = onSameResult(st, { subject: '资料分析', variant: '比重', ok: true, enabled: true })
    expect(st.variant).toBeNull()
    expect(nextSameKey(st, '增长率')).toBe('增长率')
  })
  it('关闭时不干预（走正常轮换）', () => {
    const st = onSameResult(createSameStreak(), { subject: '言语理解', variant: '逻辑填空', ok: false, enabled: false })
    expect(st.variant).toBeNull()
  })
})
