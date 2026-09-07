import { describe, it, expect, vi, afterEach } from 'vitest'
import { chatStream } from '../api/client'

// 构造一个 SSE 流：把分行的 data 编码为 ReadableStream
function sseStream(lines, { withReasoning = true } = {}) {
  const enc = new TextEncoder()
  let body = ''
  if (withReasoning) {
    body += 'data: {"choices":[{"delta":{"reasoning_content":"思考第一行"}}]}\n\n'
    body += 'data: {"choices":[{"delta":{"reasoning_content":"思考第二行"}}]}\n\n'
  }
  for (const t of lines) {
    body += 'data: {"choices":[{"delta":{"content":"' + t + '"}}]}\n\n'
  }
  body += 'data: [DONE]\n\n'
  const chunks = body.split('\n').map((l) => enc.encode(l + '\n'))
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(c)
      controller.close()
    }
  })
}

function okResponse(resp) {
  return { ok: true, status: 200, body: resp, json: async () => ({}) }
}

const cfg = { url: 'https://x.com/chat/completions', model: 'deepseek-v4-flash', key: 'k', prov: 'ds' }

describe('chatStream 流式解析', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('正确累积 content，并触发 onDelta(content)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(sseStream(['你好', '世界']))))
    const deltas = []
    const full = await chatStream([{ role: 'user', content: 'hi' }], cfg, (d) => deltas.push(d))
    expect(full).toBe('你好世界')
    expect(deltas.filter((d) => d.type === 'content').length).toBeGreaterThan(0)
  })

  it('把思考过程放入 onDelta(think)，不作为正式回答', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(sseStream(['答案'], { withReasoning: true }))))
    const deltas = []
    const full = await chatStream([{ role: 'user', content: 'q' }], cfg, (d) => deltas.push(d))
    expect(full).toBe('答案')
    const think = deltas.find((d) => d.type === 'think')
    expect(think).toBeTruthy()
    expect(think.think).toContain('思考')
  })

  it('若只有思考过程、无正文，则抛错提示', async () => {
    const enc = new TextEncoder()
    const body =
      'data: {"choices":[{"delta":{"reasoning_content":"只思考"}}]}\n\n' + 'data: {}\n\n' + 'data: [DONE]\n\n'
    const r = new ReadableStream({
      start(controller) {
        for (const l of body.split('\n')) controller.enqueue(enc.encode(l + '\n'))
        controller.close()
      }
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(r)))
    await expect(chatStream([{ role: 'user', content: 'q' }], cfg, () => {})).rejects.toThrow(/思考过程/)
  })

  it('finish_reason=length 时追加截断提示', async () => {
    const enc = new TextEncoder()
    const body =
      'data: {"choices":[{"delta":{"content":"部分内容"}}]}\n\n' +
      'data: {"choices":[{"finish_reason":"length","delta":{}}]}\n\n' +
      '/n-EOF'
    const r = new ReadableStream({
      start(controller) {
        for (const l of body.split('\n')) controller.enqueue(enc.encode(l + '\n'))
        controller.close()
      }
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(r)))
    const full = await chatStream([{ role: 'user', content: 'q' }], cfg, () => {})
    expect(full).toContain('输出上限')
  })

  it('HTTP 非 2xx 抛错', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: false, status: 401, body: null, text: async () => '{"error":{"message":"未授权"}}', json: async () => ({ error: { message: '未授权' } }) })
    )
    await expect(chatStream([{ role: 'user', content: 'q' }], cfg, () => {})).rejects.toThrow(/未授权/)
  })
})
