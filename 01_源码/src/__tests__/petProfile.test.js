import { describe, it, expect } from 'vitest'
import { weakPlates, profileLine, buildPetDashboard } from '../utils/petProfile'

describe('P2 petProfile 错题画像', () => {
  it('按板块统计最弱前二', () => {
    const wqs = [{ plate: '资料分析' }, { plate: '资料分析' }, { plate: '数量关系' }, { plate: '言语理解' }]
    const w = weakPlates(wqs, 2)
    expect(w[0].plate).toBe('资料分析')
    expect(w[0].n).toBe(2)
    expect(w.length).toBe(2)
  })
  it('无错题返回空', () => {
    expect(weakPlates([], 2)).toEqual([])
    expect(profileLine([])).toBe('')
  })
  it('profileLine 汇总一句话', () => {
    const s = profileLine([{ plate: '资料分析' }], 1)
    expect(s).toContain('资料分析')
    expect(s).toContain('错1')
  })
  it('buildPetDashboard 汇总板块细节并生成针对性建议', () => {
    const now = new Date('2026-09-13T12:00:00+08:00').getTime()
    const d = buildPetDashboard({
      now,
      streak: 4,
      todayChecked: true,
      todayNotes: 1,
      msgs: [
        { role: 'user', text: '资料分析增长率怎么算？', ts: now },
        { role: 'assistant', text: '先找现期和基期', ts: now + 1 }
      ],
      wqs: [
        { subject: '资料分析', variant: '增长率', question: '2025年同比增长率约为多少？', reviewed: false, mastery: 30, reviewStats: { e: 2 }, at: now },
        { subject: '逻辑判断', sub: '加强型', question: '以下哪项最能加强？', reviewed: true, digested: true, dueAt: now - 1, mastery: 75, at: now }
      ]
    })
    expect(d.overall.asks).toBe(1)
    expect(d.overall.todayAsks).toBe(1)
    expect(d.overall.wrongs).toBe(2)
    expect(d.overall.due).toBe(1)
    expect(d.overall.repeated).toBe(2)
    expect(d.plates.find((p) => p.group === '资料分析').wrongs).toBe(1)
    expect(d.plates.find((p) => p.group === '资料分析').subs.length).toBeGreaterThan(0)
    expect(d.activity7.length).toBe(7)
    expect(d.recommendations.some((r) => r.id === 'due')).toBe(true)
    expect(d.recommendations.some((r) => r.id === 'weak')).toBe(true)
    expect(d.missionDone).toBe(3)
  })
  it('兼容 text 消息与未知分类，不把脏数据塞进判断推理', () => {
    const now = new Date('2026-09-13T12:00:00+08:00').getTime()
    const d = buildPetDashboard({
      now,
      msgs: [{ role: 'user', text: '资料分析增长率怎么算？', ts: now }],
      wqs: [{ question: '这是一道暂时无法归类的题', at: now }]
    })
    expect(d.overall.asks).toBe(1)
    expect(d.plates.find((p) => p.group === '资料分析').asks).toBe(1)
    expect(d.plates.find((p) => p.group === '未分类').wrongs).toBe(1)
    expect(d.plates.find((p) => p.group === '判断推理').wrongs).toBe(0)
  })
  it('首次使用返回摸底建议而不是空面板', () => {
    const d = buildPetDashboard({ now: Date.now(), msgs: [], wqs: [] })
    expect(d.recommendations[0].id).toBe('start')
    expect(d.missions.length).toBe(4)
  })
})
