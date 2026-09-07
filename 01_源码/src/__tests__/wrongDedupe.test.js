import { describe, it, expect, beforeEach } from 'vitest'
import { store, addWrong, dedupeWrongs, isCompleteWrong } from '../store'

const FULL_Q = '这是一道完整的选择题题干内容。A. 选项甲 B. 选项乙 C. 选项丙 D. 选项丁'
const mk = (q = FULL_Q, extra = {}) => ({ id: Date.now() + Math.random(), question: q, answer: '正确答案 B', subject: '言语理解', ...extra })

describe('错题查重与去重', () => {
  beforeEach(() => { store.wqs.length = 0 })

  it('addWrong：完全相同的题干只存一道，重复时累计错误次数', () => {
    const a = mk(FULL_Q)
    const r1 = addWrong(a)
    expect(r1.dup).toBe(false)
    expect(store.wqs).toHaveLength(1)
    const r2 = addWrong(mk(FULL_Q))
    expect(r2.dup).toBe(true)
    expect(store.wqs).toHaveLength(1)
    expect(store.wqs[0].wrongCount).toBe(2)
  })

  it('addWrong：题干空白/HTML 差异视为相同', () => {
    addWrong(mk('这是 一道 完整的 选择题 题干内容。A. 选项甲 B. 选项乙 C. 选项丙 D. 选项丁'))
    const r = addWrong(mk('<p>这是一道完整的选择题题干内容。A. 选项甲 B. 选项乙 C. 选项丙 D. 选项丁</p>'))
    expect(r.dup).toBe(true)
    expect(store.wqs).toHaveLength(1)
  })

  it('addWrong：不同题干正常新增', () => {
    addWrong(mk('第一道完整题。A. 甲 B. 乙 C. 丙 D. 丁'))
    addWrong(mk('第二道完整题。A. 甲 B. 乙 C. 丙 D. 丁'))
    expect(store.wqs).toHaveLength(2)
  })

  it('dedupeWrongs：一键去重只保留一条', () => {
    const q = FULL_Q
    addWrong(mk(q))
    addWrong(mk(q))
    addWrong(mk(q))
    addWrong(mk('另一道完整题。A. 甲 B. 乙 C. 丙 D. 丁'))
    expect(store.wqs).toHaveLength(2) // 去重规则已阻止新增，手动塞入模拟历史重复
    // 模拟历史数据里的重复（绕过 addWrong 直接 push）
    store.wqs.push(mk(q), mk(q))
    expect(store.wqs).toHaveLength(4)
    const removed = dedupeWrongs()
    expect(removed).toBe(2)
    expect(store.wqs).toHaveLength(2)
    const dupes = store.wqs.filter((x) => x.question === q)
    expect(dupes).toHaveLength(1)
  })

  it('完整性校验：对话回复/非题目内容不允许导入', () => {
    const reply = addWrong(mk('好的，这道题的解析是：先找论点再比力度，削弱题优先拆桥……这是一段 AI 回复正文没有选项', { answer: '' }))
    expect(reply.ok).toBe(false)
    expect(reply.reason).toBeTruthy()
    expect(store.wqs).toHaveLength(0)
  })

  it('完整性校验：完整选择题与带截图题可导入', () => {
    const full = '基层治理需要精细化，下列做法正确的是？\nA. 一刀切 B. 精准施策 C. 大水漫灌 D. 层层加码'
    const r = addWrong(mk(full, { answer: '正确答案 B' }))
    expect(r.ok).toBe(true)
    expect(store.wqs).toHaveLength(1)
    store.wqs.length = 0
    const withImg = addWrong(mk('只有题干没有选项的截图题，内容足够长以便通过长度校验', { answer: '', imgs: ['data:image/png;base64,xxx'] }))
    expect(withImg.ok).toBe(true)
  })

  it('isCompleteWrong：短文本 / 无答案 / 回复消息判定', () => {
    expect(isCompleteWrong(mk('太短')).ok).toBe(false)
    expect(isCompleteWrong(mk('这是一道完整的题没有答案只有题干文字内容', { answer: '' })).ok).toBe(false)
    expect(isCompleteWrong(mk('好的 我来帮你 这道题选 A 因为……', { answer: '' })).ok).toBe(false)
  })
})