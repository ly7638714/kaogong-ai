// recentGenStats 出卷质量报告（35号批次5(2/3)）回归
const __mem = {}
globalThis.localStorage = { getItem: (k) => (k in __mem ? __mem[k] : null), setItem: (k, v) => { __mem[k] = String(v) }, removeItem: (k) => { delete __mem[k] }, clear: () => { for (const k of Object.keys(__mem)) delete __mem[k] } }
import { describe, it, expect, beforeEach } from 'vitest'
import { recordGenLog, recentGenStats } from '../utils/quizLog'

describe('recentGenStats 时段汇总', () => {
  beforeEach(() => { localStorage.clear() })
  it('统计 gen/retried/attempts/failed/reasonsTop', () => {
    recordGenLog({ plate: '言语理解', variant: '中心理解', difficulty: 'mid', ok: true, attempts: 1, reasons: [], src: 'single' })
    recordGenLog({ plate: '言语理解', variant: '中心理解', difficulty: 'mid', ok: true, attempts: 2, reasons: ['格式不合格'], src: 'single' })
    recordGenLog({ plate: '言语理解', variant: '中心理解', difficulty: 'mid', ok: false, attempts: 3, reasons: ['唯一解不符', '选项重复'], src: 'single' })
    const s = recentGenStats(Date.now() - 60000)
    expect(s.gen).toBe(3)
    expect(s.retried).toBe(2) // attempts>1 的两条
    expect(s.attempts).toBe(6)
    expect(s.failed).toBe(1)
    expect(s.reasonsTop.length).toBeGreaterThan(0)
  })
  it('fromTs 过滤生效（更早的日志不计入）', () => {
    recordGenLog({ plate: '资料分析', ok: true, attempts: 1, reasons: [], src: 'single' })
    const later = recentGenStats(Date.now() + 60000)
    expect(later.gen).toBe(0)
  })
})
