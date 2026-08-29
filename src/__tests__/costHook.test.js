import { describe, it, expect, vi, beforeEach } from 'vitest'
import { chatStream, chatOnce } from '../api/client'
import { costState, costLive } from '../utils/costTrack'

function sseStream(lines) {
  const enc = new TextEncoder()
  let body = ''
  for (const t of lines) body += 'data: {"choices":[{"delta":{"content":"' + t + '"}}]}\n\n'
  body += 'data: [DONE]\n\n'
  const chunks = body.split('\n').map((l) => enc.encode(l + '\n'))
  return new ReadableStream({ start(c) { for (const x of chunks) c.enqueue(x); c.close() } })
}
const cfg = { url: 'https://x.com/chat/completions', model: 'deepseek-v4-flash', key: 'k', prov: 'ds' }

describe('AI 用量埋点（client.js → costTrack）', () => {
  beforeEach(() => { costState.list = [] })

  it('chatStream 成功后自动记一笔（功能/模型/类型/token）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, body: sseStream(['你好', '，我是助教']), json: async () => ({}) }))
    const full = await chatStream([{ role: 'user', content: '你好' }], cfg, () => {})
    expect(full).toContain('助教')
    expect(costState.list.length).toBe(1)
    const r = costState.list[0]
    expect(r.feature).toBe('chat')
    expect(r.model).toBe('deepseek-v4-flash')
    expect(r.kind).toBe('text')
    expect(r.inT).toBeGreaterThan(0)
    expect(r.outT).toBeGreaterThan(0)
    expect(r.cost).toBeGreaterThan(0)
    vi.unstubAllGlobals()
  })

  it('chatOnce 读 usage 精确 token 并标记 exact', async () => {
    const payload = JSON.stringify({ choices: [{ message: { content: '答案是B' } }], usage: { prompt_tokens: 123, completion_tokens: 45, completion_tokens_details: { reasoning_tokens: 10 } } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => JSON.parse(payload) }))
    const t = await chatOnce(cfg, [{ role: 'user', content: '这题选什么' }], 500)
    expect(t).toBe('答案是B')
    const r = costState.list[0]
    expect(r.inT).toBe(123)
    expect(r.outT).toBe(45)
    expect(r.reasonT).toBe(10)
    expect(r.exact).toBe(true)
    expect(r.kind).toBe('text')
    vi.unstubAllGlobals()
  })

  it('调用期间 costLive.active 为 true，完成后复位', async () => {
    let resolveFetch
    vi.stubGlobal('fetch', vi.fn(() => new Promise((res) => { resolveFetch = res })))
    const p = chatOnce(cfg, [{ role: 'user', content: 'hi' }], 100)
    await new Promise((r) => setTimeout(r, 30))
    expect(costLive.active).toBe(true)
    resolveFetch({ ok: true, status: 200, json: async () => JSON.parse('{"choices":[{"message":{"content":"ok"}}]}') })
    await p
    expect(costLive.active).toBe(false)
    vi.unstubAllGlobals()
  })
})
