/* global AbortSignal */
// 底层 API 调用：双模型路由、鉴权头、流式/单次对话、AI 整理
import { store } from '../store'
import { recordCost, beginCost } from '../utils/costTrack'

// 花费标注：调用方可在发起 AI 请求前 setCostCtx('pet'|'exam'|...) 标注功能归属（下一条记录消费后自动清空）
let costCtx = ''
export function setCostCtx(name) { costCtx = name || '' }
export function supportsVision(c) {
  c = c || store.cfg.vision
  const m = (c.model || '').toLowerCase()
  const p = c.prov || ''
  if (p === 'openai' || p === 'anthropic' || p === 'custom') return true
  if (p === 'zhipu') return m.includes('v') || m.includes('vision')
  if (p === 'qwen') return m.includes('vl') || m.includes('vision')
  // DeepSeek 已发布视觉模型（deepseek-v4-flash-vision-exp 等，OpenAI 兼容格式）
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

// 智能识图路由：发图时决定走哪条通道
// ① vision=主视觉模型可识图（智谱/通义/OpenAI）→ 直接发图
// ② fig-read=主视觉不能识图但有「图形增强」视觉模型 → 读图提取文字 → 文字模型作答
// ③ graceful=都没有 → 仍接收图片，注入系统提示让模型礼貌引导
export function imgRoute(cfg, hasFigModel) {
  const v = cfg && cfg.vision
  if (v && v.key && supportsVision(v)) return 'vision'
  if (hasFigModel) return 'fig-read'
  return 'graceful'
}

export function activeCfg(hasImg) {
  const v = store.cfg.vision
  if (hasImg && v && v.key && supportsVision(v)) return v
  return store.cfg.text && store.cfg.text.key ? store.cfg.text : hasImg ? v : store.cfg.text
}

export async function chatStream(messages, c, onDelta, signal, timeoutMs = 120000) {
  // 推理/思考模型（deepseek-reasoner、deepseek-v4 系列、kimi 等）不支持 temperature，
  // 且「思考过程 + 图片 + 正文」会大量占用 max_tokens：必须给足输出上限并去掉 temperature，
  // 否则思考没写完 max_tokens 就耗尽，正式回答(content)为空（表现为"只出思考过程"）。
  const isReasoner = /(reasoner|deepseek-r1|deepseek-v4|kimi|k2|o1|o3|thinking)/i.test(c.model || '')
  const body = { model: c.model, messages, max_tokens: isReasoner ? 20000 : 10000, stream: true }
  if (!isReasoner) body.temperature = 0.7
  // 超时兜底：无论是否传入外部 signal，内部超时始终生效；用 AbortSignal.any 合并两者
  const _ctrl = new AbortController()
  const _timer = setTimeout(() => _ctrl.abort(), timeoutMs)
  let _sig = _ctrl.signal
  let _onAbort = null
  if (signal) {
    try {
      if (signal.aborted) _ctrl.abort()
      else if (typeof AbortSignal !== 'undefined' && AbortSignal.any) _sig = AbortSignal.any([signal, _ctrl.signal])
      else { _onAbort = () => _ctrl.abort(); signal.addEventListener('abort', _onAbort, { once: true }) }
    } catch (e) {
      // AbortSignal.any 不可用回退监听
      _onAbort = () => _ctrl.abort()
      signal.addEventListener('abort', _onAbort, { once: true })
    }
  }
  let _resp
  const _t0 = Date.now()
  const _hasImg = JSON.stringify(messages).includes('image_url')
  const _feat = costCtx || (_hasImg || c === store.cfg.vision ? 'vision' : 'chat')
    try { beginCost({ feature: _feat, provider: c.prov, model: c.model, kind: _hasImg ? 'img' : 'text' }) } catch (e) {}
  try {
    _resp = await fetch(c.url, { method: 'POST', headers: hds(c), body: JSON.stringify(body), signal: _sig })
  } catch (e) {
    clearTimeout(_timer)
    if (_onAbort) signal.removeEventListener('abort', _onAbort)
    // 外部取消（用户"停止生成"）：保持 AbortError 原样上抛，供上层识别"已停止"，避免误报超时
    if (signal && signal.aborted) {
      if (e.name === 'AbortError') throw e
      const er = new Error('已停止生成'); er.name = 'AbortError'; throw er
    }
    // 内部超时：包装为超时提示（唤醒重试语义，但 chatStream 本身不重试）
    throw e.name === 'AbortError' ? new Error('请求超时（' + Math.round(timeoutMs / 1000) + ' 秒）') : e
  }
  clearTimeout(_timer)
  if (_onAbort) signal.removeEventListener('abort', _onAbort)
  const resp = _resp
  if (!resp.ok) {
    const bodyTxt = await resp.text().catch(() => '')
    let em = ''
    try { const e = JSON.parse(bodyTxt); em = (e.error && (e.error.message || e.error.code)) || '' } catch (e) {}
    throw new Error('HTTP ' + resp.status + ' @' + c.url + (em ? ' · ' + String(em).slice(0, 160) : (bodyTxt ? ' · ' + bodyTxt.slice(0, 160) : '')))
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
        '模型只输出了思考过程、未生成正式回答（多为思考占满输出上限所致）。请重试，或检查识图用视觉模型（如 DeepSeek deepseek-v4-flash-vision-exp / 智谱 GLM-5V / 通义 Qwen-VL）的 API Key 是否有效。'
      )
    throw new Error('模型未返回任何内容，请重试。')
  }
  if (finish === 'length') full += '\n\n> ⚠️ 内容已达单次输出上限被截断，可继续追问剩余部分。'
  try {
    costCtx = ''
    recordCost({ feature: _feat, provider: c.prov, model: c.model, kind: _hasImg ? 'img' : 'text', inText: JSON.stringify(messages), outText: full + think, sec: (Date.now() - _t0) / 1000 })
  } catch (e) {}
  return full
}

export async function chatOnce(c, messages, maxTokens = 2000, timeoutMs = 120000, signal) {
  const isReasoner = /(reasoner|deepseek-r1|deepseek-v4|kimi|k2|o1|o3|thinking)/i.test(c.model || '')
  const body = {
    model: c.model,
    messages,
    max_tokens: isReasoner ? Math.max(maxTokens, 8192) : maxTokens,
    stream: false
  }
  if (!isReasoner) body.temperature = 0.3
  let lastErr = null
  // 最多 2 次尝试：网络抖动 / 超时 / 空响应自动重试一次
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    // 合并外部取消信号与内部超时：外部取消立即生效且不重试
    let sig = ctrl.signal
    let onAbort = null
    if (signal) {
      // 外部已取消则不发起请求
      if (signal.aborted) { clearTimeout(timer); const er = new Error('请求已取消'); er.name = 'AbortError'; throw er }
      if (typeof AbortSignal !== 'undefined' && AbortSignal.any) sig = AbortSignal.any([signal, ctrl.signal])
      else { onAbort = () => ctrl.abort(); signal.addEventListener('abort', onAbort, { once: true }) }
    }
    try {
      const t0 = Date.now()
      const hasImg0 = JSON.stringify(messages).includes('image_url')
      const feat0 = costCtx || (hasImg0 || c === store.cfg.vision ? 'vision' : 'chat')
      try { beginCost({ feature: feat0, provider: c.prov, model: c.model, kind: hasImg0 ? 'img' : 'text' }) } catch (e) {}
      const resp = await fetch(c.url, { method: 'POST', headers: hds(c), body: JSON.stringify(body), signal: sig })
      clearTimeout(timer)
      if (onAbort) signal.removeEventListener('abort', onAbort)
      if (!resp.ok) {
        const bodyTxt = await resp.text().catch(() => '')
        let em = ''
        try { const e = JSON.parse(bodyTxt); em = (e.error && (e.error.message || e.error.code)) || '' } catch (e) {}
        throw new Error('HTTP ' + resp.status + ' @' + c.url + (em ? ' · ' + String(em).slice(0, 160) : (bodyTxt ? ' · ' + bodyTxt.slice(0, 160) : '')))
      }
      const d = await resp.json()
      const m = d.choices?.[0]?.message || {}
      const t = (m.content || '').trim()
      try {
        const u = d.usage
        costCtx = ''
        recordCost({
          feature: feat0, provider: c.prov, model: c.model, kind: hasImg0 ? 'img' : 'text',
          inTokens: u && u.prompt_tokens != null ? u.prompt_tokens : null,
          outTokens: u && u.completion_tokens != null ? u.completion_tokens : null,
          reasonTokens: u && u.completion_tokens_details && u.completion_tokens_details.reasoning_tokens != null ? u.completion_tokens_details.reasoning_tokens : 0,
          inText: JSON.stringify(messages), outText: t,
          exact: !!(u && u.prompt_tokens != null),
          sec: (Date.now() - t0) / 1000
        })
      } catch (e) {}
      if (t) return t
      lastErr = new Error('模型返回为空，已自动重试')
    } catch (e) {
      clearTimeout(timer)
      if (onAbort) signal.removeEventListener('abort', onAbort)
      // 外部取消：原样抛出（不重试），供上层识别"已取消"
      if (signal && signal.aborted) {
        if (e.name === 'AbortError') throw e
        const er = new Error('请求已取消'); er.name = 'AbortError'; throw er
      }
      lastErr = e.name === 'AbortError' ? new Error('请求超时（' + Math.round(timeoutMs / 1000) + ' 秒），已自动重试') : e
      // AbortError（本函数超时触发）视为可重试；网络/服务端异常里含 timeout/abort/fetch 字样也重试一次
      if (!(e.name === 'AbortError' || /timeout|timed out|abort|ETIMEDOUT|fetch/i.test(String(e && e.message || '')))) break
    }
  }
  throw lastErr || new Error('请求失败')
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
