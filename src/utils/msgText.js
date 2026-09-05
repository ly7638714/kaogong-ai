// msgText.js —— 消息正文纯文本提取（供摘要/召回等只读工具复用）
export function plainText(m) {
  try {
    if (!m) return ''
    if (typeof m.content === 'string') return m.content
    const c = m.content || {}
    if (typeof c.text === 'string') return c.text
    if (Array.isArray(c)) {
      return c.map((p) => (p && p.type === 'text' ? p.text : '')).join(' ')
    }
    return ''
  } catch (e) { return '' }
}
export default plainText
