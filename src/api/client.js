// 底层 API 调用：双模型路由、鉴权头、流式/单次对话、AI 整理
import { store } from '../store'

export function supportsVision(c) {
  c = c || store.cfg.vision
  const m = (c.model || '').toLowerCase()
  const p = c.prov || ''
  if (p === 'openai' || p === 'anthropic' || p === 'custom') return true
  if (p === 'zhipu') return m.includes('v') || m.includes('vision')
  if (p === 'qwen') return m.includes('vl') || m.includes('vision')
  if (p === 'ds') return m.includes('vision') || m.includes('vl')
  return false
}

function hds(c) {
  const h = { 'Content-Type': 'application/json' }
  if (c.prov === 'anthropic') {
    h['x-api-key'] = c.key
    h['anthropic-version'] = '2023-06-01'
  } else {
    h['Authorization'] = 'Bearer ' + c.key
  }
  return h
}

export function activeCfg(hasImg) {
  const v = store.cfg.vision
  if (hasImg && v && v.key && supportsVision(v)) return v
  return store.cfg.text && store.cfg.text.key ? store.cfg.text : hasImg ? v : store.cfg.text
}

export async function chatStream(messages, c, onDelta, signal) {
  // 推理/思考模型（deepseek-reasoner、deepseek-v4 系列、kimi 等）不支持 temperature，
  // 且「思考过程 + 图片 + 正文」会大量占用 max_tokens：必须给足输出上限并去掉 temperature，
  // 否则思考没写完 max_tokens 就耗尽，正式回答(content)为空（表现为"只出思考过程"）。
  const isReasoner = /(reasoner|deepseek-r1|deepseek-v4|kimi|k2|o1|o3|thinking)/i.test(c.model || '')
  const body = { model: c.model, messages, max_tokens: isReasoner ? 20000 : 10000, stream: true }
  if (!isReasoner) body.temperature = 0.7
  const resp = await fetch(c.url, { method: 'POST', headers: hds(c), body: JSON.stringify(body), signal })
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}))
    throw new Error(e.error?.message || 'HTTP ' + resp.status)
  }
  const reader = resp.body.getReader()
  const dec = new TextDecoder('utf-8')
  let buf = ''
  let full = ''
  let think = ''
  let finish = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop()
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const d = line.slice(6).trim()
      if (d === '[DONE]') continue
      try {
        const p = JSON.parse(d)
        const ch = p.choices?.[0] || {}
        const delta = ch.delta || {}
        const c2 = delta?.content || ''
        const rc = delta?.reasoning_content || ''
        if (ch.finish_reason) finish = ch.finish_reason
        if (c2) {
          full += c2
          onDelta?.({ type: 'content', text: full, think })
        } else if (rc) {
          think += rc
          onDelta?.({ type: 'think', think })
        }
      } catch (e) {
        /* 忽略单个损坏帧 */
      }
    }
  }
  // 核心修复：思考过程(reasoning_content)只是"实时推理"，绝不能当正式回答发给用户。
  if (!full) {
    if (think)
      throw new Error(
        '模型只输出了思考过程、未生成正式回答（多为思考占满输出上限所致）。请重试，或检查识图用视觉模型（deepseek-v4-flash-vision-exp）的 API Key 是否有效。'
      )
    throw new Error('模型未返回任何内容，请重试。')
  }
  if (finish === 'length') full += '\n\n> ⚠️ 内容已达单次输出上限被截断，可继续追问剩余部分。'
  return full
}

export async function chatOnce(c, messages, maxTokens = 2000) {
  const isReasoner = /(reasoner|deepseek-r1|deepseek-v4|kimi|k2|o1|o3|thinking)/i.test(c.model || '')
  const body = {
    model: c.model,
    messages,
    max_tokens: isReasoner ? Math.max(maxTokens, 8192) : maxTokens,
    stream: false
  }
  if (!isReasoner) body.temperature = 0.3
  const resp = await fetch(c.url, { method: 'POST', headers: hds(c), body: JSON.stringify(body) })
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}))
    throw new Error(e.error?.message || 'HTTP ' + resp.status)
  }
  const d = await resp.json()
  const m = d.choices?.[0]?.message || {}
  return (m.content || '').trim() || null
}

export async function aiPolish(text) {
  const c = activeCfg(false)
  if (!c || !c.key) return null
  const prompt =
    '你是一位行测学习笔记整理助手。请把下面的内容整理成一份结构清晰、适合复习的笔记：按题归纳考点/题型、正确答案的依据（为什么对）、错误选项的坑（为什么错）、一句话秒杀规律；分条列点，用 Markdown 格式。不要遗漏关键信息，不要编造。\n\n内容：\n' +
    String(text).slice(0, 6000)
  try {
    return await chatOnce(
      c,
      [
        { role: 'system', content: '你是行测复习笔记整理助手，输出精炼准确的Markdown笔记。' },
        { role: 'user', content: prompt }
      ],
      2000
    )
  } catch (e) {
    return null
  }
}
