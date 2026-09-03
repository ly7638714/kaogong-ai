// imgMemory.js —— 图片内容记忆 & 历史组装（P-M：用户截图内容持久为文字纪要，跨模型/追问可引用）

// 多题切分（保守版）：仅当出现显式题号标记(第N题/第N问/【题N】)才切分，避免把正文数字行误切
const QMARK = /^\s*(?:第[0-9一二三四五六七八九十百]+[题问]|[【[]题?[0-9一二三四五六七八九十百]+[】]]|[(（][0-9一二三四五六七八九十]+[)）][^A-D])/
export function splitQuestionsFromRead(text) {
  const t = String(text || '').trim()
  if (!t) return []
  const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const chunks = []
  let cur = []
  const flush = () => { if (cur.length) { chunks.push(cur.join('\n')); cur = [] } }
  for (const l of lines) { if (QMARK.test(l) && cur.length) flush(); cur.push(l) }
  flush()
  return chunks.length ? chunks : [t]
}

// 生成图片内容纪要（多题列表 + 一行摘要）
export function makeImgNotes(readText, src = 'read') {
  const qs = splitQuestionsFromRead(readText).map((block, i) => ({ no: i + 1, brief: String(block).replace(/\s+/g, ' ').slice(0, 42) }))
  return { src, full: String(readText || ''), qs, brief: qs.map((x) => '第' + x.no + '题：' + x.brief).join('；') }
}

// 读图结果写入消息：_curImgRead(兼容旧逻辑) + imgNotes(结构化纪要)
export function attachImageRead(msg, readText, type = 'text') {
  if (!msg || !readText) return msg
  msg._curImgRead = String(readText)
  msg.imgNotes = makeImgNotes(readText)
  msg._imgType = type || 'text'
  return msg
}

// 从最近消息里找最新一张“无纪要”的图，按需补读一次（成本护栏：每次只补最新一张）
export async function ensureImgNotesForHistory(msgs, readFn, { force = false } = {}) {
  if (!Array.isArray(msgs) || typeof readFn !== 'function') return { changed: false }
  for (let i = (msgs || []).length - 1; i >= 0; i--) {
    const m = msgs[i]
    const imgs = m && m.content && Array.isArray(m.content.imgs) ? m.content.imgs : []
    if (!imgs.length) continue
    const hasNote = !!(m._curImgRead || (m.imgNotes && m.imgNotes.full))
    if (hasNote && !force) continue
    const txt = (m.content && typeof m.content.text === 'string') ? m.content.text : ''
    try {
      const fr = await readFn(imgs[0], txt)
      if (fr && fr.ok) { attachImageRead(m, (fr.text || txt) + (fr.fig ? '\n【图形特征】' + fr.fig : ''), fr.type || 'text'); return { changed: true } }
      return { changed: false }
    } catch (e) { return { changed: false } }
  }
  return { changed: false }
}

const STATUS_RE = /^[❌⚠️⏳🔄🎯✍️📋]/
// 统一历史组装：所有带纪要的旧图以【图片内容…】文字注入；仅最新一条带图消息附 image_url；无纪要且不可看图时给占位
export function buildChatHistory(msgs, opts = {}) {
  const limit = opts.limit || 20
  const budget = opts.budget || 35000
  const maxAiChars = opts.maxAiChars || 4000
  const visOk = opts.visOk !== false
  const attachImg = opts.attachImg !== false
  const history = []
  let cum = 0
  let imgSent = false
  for (let i = (msgs || []).length - 1; i >= 0 && history.length < limit; i--) {
    const m = msgs[i]
    if (!m) continue
    let item = null
    try {
      if (m.role === 'assistant') {
        const t = typeof m.content === 'string' ? m.content.trim() : ''
        if (!t || STATUS_RE.test(t)) continue
        item = { role: m.role, content: t.slice(0, maxAiChars) }
      } else if (typeof m.content === 'string') {
        if (!(m.content || '').trim()) continue
        item = { role: m.role, content: m.content }
      } else if (m.content && ((m.content.text || '').trim() || (m.content.imgs && m.content.imgs.length))) {
        const imgs = Array.isArray(m.content.imgs) ? m.content.imgs : []
        const note = m._curImgRead || (m.imgNotes && m.imgNotes.full) || ''
        const parts = []
        if (note) parts.push({ type: 'text', text: '【图片内容】' + note })
        else if ((m.content.text || '').trim()) parts.push({ type: 'text', text: m.content.text })
        if (visOk && attachImg && imgs.length && !imgSent) {
          for (const u of imgs) { if (u && /^(data:image|https?:\/\/)/i.test(String(u))) parts.push({ type: 'image_url', image_url: { url: u } }) }
          imgSent = true
        }
        if (!parts.length) parts.push({ type: 'text', text: visOk ? '[用户发送了一张图片]' : '[用户发送了一张图片，内容待读取]' })
        item = { role: m.role, content: parts }
      }
    } catch (e) {}
    if (!item) continue
    const clen = typeof item.content === 'string' ? item.content.length : 600
    if (cum + clen > budget && history.length > 0) break
    cum += clen
    history.unshift(item)
  }
  return history
}

// 会话图片题干目录：最近若干张有纪要的图，供 sys 注入（支持 第N题/第二题 指代）
export function lastImgTopics(msgs, n = 6) {
  const out = []
  for (let i = (msgs || []).length - 1; i >= 0 && out.length < n; i--) {
    const m = msgs[i]
    if (!m) continue
    const note = m.imgNotes || (m._curImgRead ? makeImgNotes(m._curImgRead) : null)
    if (note && Array.isArray(note.qs) && note.qs.length) {
      for (const q of note.qs) { out.push('截图第' + q.no + '题：' + q.brief) }
      if (out.length >= n) break
    }
  }
  return out.slice(0, n)
}