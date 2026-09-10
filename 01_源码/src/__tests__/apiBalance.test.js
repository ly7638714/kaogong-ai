import { describe, it, expect } from 'vitest'
import { providerBalanceMeta, queryProviderBalance } from '../utils/apiBalance'

describe('apiBalance 平台余额查询', () => {
  it('DeepSeek 正确解析 balance_infos', async () => {
    const r = await queryProviderBalance(
      { prov: 'ds', key: 'k', url: 'https://api.deepseek.com/chat/completions' },
      { fetchImpl: async () => ({ ok: true, text: async () => JSON.stringify({ balance_infos: [{ currency: 'CNY', total_balance: '12.34' }] }) }) }
    )
    expect(r.ok).toBe(true)
    expect(r.text).toBe('12.34 CNY')
  })

  it('未开放余额接口的平台返回后台入口', async () => {
    const meta = providerBalanceMeta('openai')
    expect(meta.unsupported).toBe(true)
    const r = await queryProviderBalance({ prov: 'openai', key: 'k' })
    expect(r.ok).toBe(false)
    expect(r.dashboard).toContain('platform.openai.com')
  })

  it('未配置 Key 时不发请求', async () => {
    let called = false
    const r = await queryProviderBalance({ prov: 'ds', key: '' }, { fetchImpl: async () => { called = true } })
    expect(r.ok).toBe(false)
    expect(called).toBe(false)
  })
})
