// 疑题反馈（37号 正确性加固B + 深化·生命周期）回归：去重/列表/汇总/状态流转
const __mem = {}
globalThis.localStorage = { getItem: (k) => (k in __mem ? __mem[k] : null), setItem: (k, v) => { __mem[k] = String(v) }, removeItem: (k) => { delete __mem[k] }, clear: () => { for (const k of Object.keys(__mem)) delete __mem[k] } }
import { describe, it, expect, beforeEach } from 'vitest'
import { addFlaggedQuestion, listFlagged, removeFlagged, clearFlagged, flaggedSummary, flaggedByVariant, setFlagStatus, confirmFlagged, dismissFlagged, flaggedStats, flaggedIssueHints } from '../utils/flaggedQuestions'

describe('flaggedQuestions 疑题反馈', () => {
  beforeEach(() => { localStorage.clear() })
  it('flaggedByVariant：忽略 kpoint 只按(板块|题型)聚合，误报不计入', () => {
    addFlaggedQuestion({ plate: '言语理解', variant: '中心理解', stem: 'var 题面1', kpoint: '中心·转折', note: 'x' })
    addFlaggedQuestion({ plate: '言语理解', variant: '中心理解', stem: 'var 题面2', kpoint: '中心·总分总' })
    const d = addFlaggedQuestion({ plate: '言语理解', variant: '中心理解', stem: 'var 题面3', note: '误报' })
    dismissFlagged(d.item.id)
    const m = flaggedByVariant()
    expect(m['言语理解|中心理解']).toBe(2) // 两条不同 kpoint 都归到同一 variant
    expect(m['言语理解|综合']).toBeUndefined()
    expect(flaggedByVariant()['资料分析|比重']).toBeUndefined()
  })
  it('flaggedIssueHints：返回具体备注、confirmed 优先、误报不参与', () => {
    const a = addFlaggedQuestion({ plate: '言语理解', variant: '中心理解', stem: 'hint 题面1', note: '两个选项都能推出中心思想' })
    addFlaggedQuestion({ plate: '言语理解', variant: '中心理解', stem: 'hint 题面2', note: '提问对象不明确' })
    confirmFlagged(a.item.id)
    const h = flaggedIssueHints('言语理解', '中心理解')
    expect(h[0]).toBe('两个选项都能推出中心思想') // confirmed 优先
    expect(h).toContain('提问对象不明确')
    const c = addFlaggedQuestion({ plate: '言语理解', variant: '中心理解', stem: 'hint 题面3', note: '只是用户误报' })
    dismissFlagged(c.item.id)
    expect(flaggedIssueHints('言语理解', '中心理解').length).toBe(2)
    expect(flaggedIssueHints('言语理解', '中心理解')).not.toContain('只是用户误报')
    expect(flaggedIssueHints('数量关系', '工程问题')).toEqual([])
    expect(flaggedIssueHints('言语理解', '逻辑填空')).toEqual([])
  })
  it('新增/去重/列表', () => {
    const a = addFlaggedQuestion({ plate: '言语理解', variant: '中心理解', stem: '这段文字主要讲什么内容用以测试', note: '疑似答案有误' })
    expect(a.ok).toBe(true)
    const b = addFlaggedQuestion({ plate: '言语理解', variant: '中心理解', stem: '这段文字主要讲什么内容用以测试', note: '疑似答案有误' })
    expect(b.dup).toBe(true)
    expect(listFlagged().length).toBe(1)
    expect(a.item.status).toBe('open') // 默认待复核
  })
  it('移除与汇总', () => {
    addFlaggedQuestion({ plate: '言语理解', variant: '中心理解', stem: 's1', kpoint: '中心·转折' })
    addFlaggedQuestion({ plate: '资料分析', variant: '比重', stem: 's2', kpoint: '比重·现期比重' })
    const s = flaggedSummary()
    expect(s['言语理解|中心·转折']).toBe(1)
    expect(s['资料分析|比重·现期比重']).toBe(1)
    removeFlagged(listFlagged()[0].id)
    expect(listFlagged().length).toBe(1)
    clearFlagged()
    expect(listFlagged().length).toBe(0)
  })
  it('生命周期：默认待复核 → 确认问题/误报/状态统计/非法输入', () => {
    const a = addFlaggedQuestion({ plate: '言语理解', variant: '中心理解', stem: '生命线测试题面1', note: '疑似答案有误' })
    const b = addFlaggedQuestion({ plate: '资料分析', variant: '比重', stem: '生命线测试题面2' })
    expect(flaggedStats()).toEqual({ open: 2, confirmed: 0, dismissed: 0 })
    expect(confirmFlagged(a.item.id)).toBe(true)
    expect(dismissFlagged(b.item.id)).toBe(true)
    expect(flaggedStats()).toEqual({ open: 0, confirmed: 1, dismissed: 1 })
    expect(setFlagStatus('no-such', 'confirmed')).toBe(false)
    expect(setFlagStatus(a.item.id, 'bogus')).toBe(false)
    expect(listFlagged().find((x) => x.id === a.item.id).status).toBe('confirmed')
  })
  it('误报题不再进入降权汇总（驳回/移除均可解除降权）', () => {
    addFlaggedQuestion({ plate: '言语理解', variant: '中心理解', stem: '降权测试题面3', kpoint: '中心·转折' })
    const b = addFlaggedQuestion({ plate: '言语理解', variant: '中心理解', stem: '降权测试题面4', kpoint: '中心·转折' })
    expect(flaggedSummary()['言语理解|中心·转折']).toBe(2)
    dismissFlagged(b.item.id)
    expect(flaggedSummary()['言语理解|中心·转折']).toBe(1)
    removeFlagged(b.item.id)
    expect(flaggedSummary()['言语理解|中心·转折']).toBe(1) // 已驳回的那条已移除，剩余 open 仍计 1
  })
})
