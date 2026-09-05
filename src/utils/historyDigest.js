// historyDigest.js —— 对话长历史自动摘要（深化，纯函数可单测）
// 当会话超过「保留条数」时，被截掉的更早对话不再静默丢弃，而是压缩成摘要注入 sys：
// 保留最近 keep 条非状态消息为全文；更早的按 用户问/助手答 逐条摘要（含角色标签）。
import { plainText } from './msgText' // 兼容旧 content 形态
const STATUS_RE = /^[❌⚠️⏳🔄🎯✍️📋⏹]/
export function digestOlder(msgs, opts = {}) {
  const keep = Number(opts.keep) || 12
  const cap = Number(opts.cap) || 2200
  const qCap = Number(opts.qCap) || 90
  const aCap = Number(opts.aCap) || 150
  const list = Array.isArray(msgs) ? msgs : []
  const valid = []
  for (let i = 0; i < list.length; i++) {
    const m = list[i]
    if (!m || m.live) continue
    const t = plainText(m)
    if (!t.trim() || STATUS_RE.test(t.trim())) continue
    valid.push({ role: m.role, t: t.replace(/\s+/g, ' ').trim() })
  }
  const keepFrom = Math.max(0, valid.length - keep)
  const older = valid.slice(0, keepFrom)
  if (!older.length) return { text: '', keptN: valid.length, summarizedN: 0 }
  const lines = []
  const HEAD = '\n【本会话更早内容·已自动压缩】（仅作连贯参考；如与当前提问无关请忽略，不要把它当成当前题目）\n'
  const budget = Math.max(80, cap - HEAD.length - 2)
  let used = 0
  older.forEach((m) => {
    const brief = m.role === 'user' ? String(m.t).slice(0, qCap) : String(m.t).slice(0, aCap)
    if (!brief) return
    const line = (m.role === 'user' ? '用户问：' : '助手答：') + brief
    const add = line.length + 1
    if (used + add > budget) return
    lines.push(line)
    used += add
  })
  if (!lines.length) return { text: '', keptN: valid.length, summarizedN: 0 }
  return {
    text: HEAD + lines.join('\n'),
    keptN: valid.length - older.length,
    summarizedN: lines.length
  }
}
export default digestOlder
