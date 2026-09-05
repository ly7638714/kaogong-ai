// wrongPick.js —— 从对话历史里挑出“真正的题目全文”用于存错题（修复：截图提问被存成 AI 回复/空文字）
// 优先级：① 本窗口内的结构化题目卡(assistant.quiz.stem+options / orgCard) → ② 截图 OCR 全文
//         (user._curImgRead / imgNotes.full) → ③ 最近的用户文字提问 → ④ 无（返回空）
export function quizTextOf(qz) {
  if (!qz) return ''
  const stem = String(qz.stem || qz.q || '').trim()
  const opts = (Array.isArray(qz.options) ? qz.options : [])
    .map((o) => {
      const k = String((o && o.k) || '').trim()
      const t = String((o && (o.t || o)) || '').replace(/<[^>]+>/g, ' ').trim()
      return k ? k + '. ' + t : t
    })
    .filter(Boolean)
    .join('\n')
  return stem + (opts ? '\n\n' + opts : '')
}
function userInfo(m) {
  if (!m) return { typed: '', imgs: [], note: '' }
  const typed = typeof m.content === 'string' ? m.content : String((m.content && m.content.text) || '')
  const imgs = m.content && Array.isArray(m.content.imgs) ? m.content.imgs.slice() : []
  const note = String(m._curImgRead || (m.imgNotes && m.imgNotes.full) || '').trim()
  return { typed: typed.trim(), imgs, note }
}
export function pickWrongSource(msgs, anchor = -1, opts = {}) {
  const list = Array.isArray(msgs) ? msgs : []
  if (!list.length) return { q: '', source: 'none', msgIdx: -1, imgs: [] }
  const n = list.length
  let a = Number(anchor)
  if (!Number.isInteger(a) || a < 0 || a >= n) a = n - 1
  const back = Number(opts.winBack) || 10
  const lo = Math.max(0, a - back)
  const hi = Math.min(n - 1, a + 2)
  // ① 结构化题目卡（assistant.quiz.stem 完整，含选项）
  for (let i = lo; i <= hi; i++) {
    const m = list[i]
    if (m && m.role === 'assistant' && m.quiz && String((m.quiz.stem || m.quiz.q || '')).trim()) {
      const imgs = Array.isArray(m.orgImg) ? m.orgImg.slice() : []
      return { q: quizTextOf(m.quiz), source: 'quiz', msgIdx: i, imgs }
    }
  }
  // ② 最近的用户消息：优先截图 OCR 全文；其次带图/文字提问
  let last = null
  for (let i = a; i >= lo; i--) {
    const m = list[i]
    if (!m || m.role !== 'user') continue
    const info = userInfo(m)
    if (info.note) return { q: info.note, source: 'ocr', msgIdx: i, imgs: info.imgs }
    last = { info, i }
    if (info.imgs.length || info.typed) break
  }
  if (last) {
    const info = last.info
    const q = info.typed || (info.imgs.length ? '' : '')
    return { q, source: info.imgs.length ? 'img' : 'text', msgIdx: last.i, imgs: info.imgs }
  }
  // ③ 兜底：全历史最后一条用户消息
  for (let i = n - 1; i >= 0; i--) {
    const m = list[i]
    if (!m || m.role !== 'user') continue
    const info = userInfo(m)
    return { q: info.typed, source: info.imgs.length ? 'img' : 'text', msgIdx: i, imgs: info.imgs }
  }
  return { q: '', source: 'none', msgIdx: -1, imgs: [] }
}
export default { quizTextOf, pickWrongSource }
