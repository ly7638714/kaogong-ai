// vitest node 环境无 localStorage，这里提供内存版 mock（必须在 import costTrack 前定义）
const __mem = {}
globalThis.localStorage = {
  getItem: (k) => (k in __mem ? __mem[k] : null),
  setItem: (k, v) => { __mem[k] = String(v) },
  removeItem: (k) => { delete __mem[k] },
  clear: () => { for (const k of Object.keys(__mem)) delete __mem[k] }
}
import { describe, it, expect, beforeEach } from 'vitest'
import { recordCost, costState, costStats, clearCost, calcCost, estimateTokens, getPrices, savePrices, DEF_PRICES, beginCost, endCost, costLive } from '../utils/costTrack'

describe('AI 用量与花费追踪 costTrack', () => {
  beforeEach(() => {
    costState.list = []
    localStorage.clear()
  })

  it('estimateTokens 中文按 0.8 token/字、英文按 3.5 字符/token 估算', () => {
    expect(estimateTokens('你好')).toBe(2) // 2字 × 0.8 = 1.6 → ceil 2
    expect(estimateTokens('hello world')).toBeGreaterThan(1)
    expect(estimateTokens('')).toBe(1)
  })

  it('calcCost 返回输入/输出/固定/合计明细', () => {
    const c = calcCost('deepseek-chat', 1000, 500)
    expect(c.total).toBeCloseTo(0.001 * 1 + 0.002 * 0.5, 5)
    expect(c.in).toBeCloseTo(0.001, 5)
    expect(c.out).toBeCloseTo(0.001, 5)
    expect(c.fixed).toBe(0)
  })

  it('recordCost 记录图文类型/思考token/耗时/费用明细', () => {
    recordCost({ feature: 'vision', provider: 'ds', model: 'deepseek-v4-flash-vision-exp', kind: 'img', inTokens: 1000, outTokens: 200, reasonTokens: 300, sec: 4.5 })
    const r = costState.list[0]
    expect(r.kind).toBe('img')
    expect(r.reasonT).toBe(300)
    expect(r.sec).toBe(5) // 四舍五入
    expect(r.exact).toBe(true)
    expect(r.inCost).toBeGreaterThan(0)
    expect(r.outCost).toBeGreaterThan(0)
  })

  it('beginCost/endCost 实时状态', () => {
    beginCost({ feature: 'pet', model: 'deepseek-chat', kind: 'text' })
    expect(costLive.active).toBe(true)
    expect(costLive.feature).toBe('pet')
    endCost()
    expect(costLive.active).toBe(false)
  })

  it('costStats 含本月/总token/按类型/按提供商', () => {
    recordCost({ feature: 'chat', provider: 'ds', model: 'deepseek-chat', kind: 'text', inTokens: 100, outTokens: 100 })
    recordCost({ feature: 'vision', provider: 'ds', model: 'deepseek-v4-flash-vision-exp', kind: 'img', inTokens: 200, outTokens: 200, cost: 0 })
    const st = costStats()
    expect(st.month).toBeGreaterThanOrEqual(0)
    expect(st.totalInT).toBe(300)
    expect(st.totalOutT).toBe(300)
    expect(st.byKind.text).toBeGreaterThan(0)
    expect(st.byProv.ds).toBeGreaterThanOrEqual(0)
  })

  it('recordCost 显式 token 精确记录，并按模型累计', () => {
    recordCost({ feature: 'chat', provider: 'ds', model: 'deepseek-chat', inTokens: 1000, outTokens: 1000 })
    recordCost({ feature: 'tts', provider: 'glm', model: 'glm-tts', cost: 0.001, note: '10 字' })
    const s = costStats()
    expect(s.totalN).toBe(2)
    expect(s.byFeat.chat).toBeCloseTo(0.003, 5)
    expect(s.byFeat.tts).toBeCloseTo(0.001, 5)
    expect(s.byModel['deepseek-chat']).toBeCloseTo(0.003, 5)
  })

  it('recordCost 无 usage 时按文本长度估算 token', () => {
    recordCost({ feature: 'chat', model: 'deepseek-chat', inText: '甲'.repeat(1000), outText: '乙'.repeat(100) })
    const r = costState.list[0]
    expect(r.inT).toBeGreaterThan(0)
    expect(r.cost).toBeGreaterThan(0)
  })

  it('clearCost 清空今日/全部', () => {
    recordCost({ feature: 'chat', model: 'm', inTokens: 10, outTokens: 10 })
    // 伪造一条昨天的记录
    costState.list[0].t = Date.now() - 48 * 3600 * 1000
    recordCost({ feature: 'chat', model: 'm', inTokens: 10, outTokens: 10 })
    clearCost('today')
    expect(costStats().totalN).toBe(1)
    clearCost('all')
    expect(costStats().totalN).toBe(0)
  })

  it('计价表可保存/恢复默认', () => {
    savePrices({ ...DEF_PRICES, 'deepseek-chat': { in: 0.001, out: 0.004 } })
    const p = getPrices()
    expect(p['deepseek-chat'].in).toBe(0.001)
    expect(p.ttsPer1k).toBe(0.002)
  })
})
