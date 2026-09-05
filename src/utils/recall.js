// recall.js —— 追问自动召回「我的错题 / 我的记忆」（深化，纯函数可单测）
// 触发：追问句式（上一题/这道/同类/又错/为什么错/再讲…）或短问。
// 召回：按 板块+题型+错因+秒杀 关键词与提问重合度打分，把“与我现在问的相关的历史错题/记忆”
//       注入 sys，让 AI 讲解贴着用户自己的错题讲（不重复问背景）。
const FW = /(上一题|上一道|上道|刚(才|刚)?那|这道题?|同类|再(讲|说|解释|分析|考)|还是(没|不)?(懂|会)|又(做)?错|错在哪|为什么错|考点|怎么(又)?选)/
export function isRecallAsk(query, plate6 = '') {
  const q = String(query || '')
  if (!q.trim()) return false
  if (FW.test(q)) return true
  return q.length <= 30 && !!plate6
}
function cap(t, n) { return String(t || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) }
export function recallWrongs(wqs, query, opts = {}) {
  const q = String(query || '')
  const plate6 = String(opts.plate6 || '')
  const out = []
  ;(Array.isArray(wqs) ? wqs : []).forEach((x) => {
    if (!x) return
    const subject = String(x.subject || x.plate || '')
    let s = 0
    if (plate6 && subject === plate6) s += 6
    if (plate6 && subject !== plate6 && (subject.indexOf(plate6) >= 0 || plate6.indexOf(subject) >= 0)) s += 2
    const words = []
    if (x.variant) words.push(String(x.variant))
    if (x.subx) words.push(String(x.subx))
    if (x.sub) words.push(String(x.sub))
    ;(Array.isArray(x.reasons) ? x.reasons : []).forEach((r) => words.push(String(r)))
    if (x.method) words.push(String(x.method))
    words.forEach((w) => {
      if (!w || w.length < 2) return
      const keys = []
      if (w.length >= 4) keys.push(w.slice(0, 4), w.slice(0, 2))
      else keys.push(w.slice(0, 2))
      for (const k of keys) {
        if (q.indexOf(k) >= 0) { s += k.length >= 4 ? 3 : 2; break }
      }
    })
    if (s < 6) return
    out.push({ id: x.id, subject, type: String(x.variant || x.subx || x.sub || ''), q: cap(x.question || x.q || x.stem || '', 90), wrongCount: Number(x.wrongCount) || 1, score: s })
  })
  return out.sort((a, b) => b.score - a.score).slice(0, Number(opts.topWrong) || 3)
}
export function recallMemories(srs, query, opts = {}) {
  const q = String(query || '')
  const out = []
  const map = (srs && typeof srs === 'object') ? srs : {}
  Object.keys(map).forEach((k) => {
    const i = k.lastIndexOf('|')
    const cat = i > 0 ? k.slice(0, i) : '常识'
    const title = i > 0 ? k.slice(i + 1) : k
    if (!title || title.length < 2) return
    if (q.indexOf(title.slice(0, 8)) < 0 && title.indexOf(q.slice(0, 6)) < 0) return
    out.push({ cat, title, key: k })
  })
  return out.sort((a, b) => a.title.length - b.title.length).slice(0, Number(opts.topMem) || 3)
}
export function recallBlock(input = {}) {
  const { wqs, srs, query, plate6, force } = input
  const q = String(query || '')
  const wrongs = recallWrongs(wqs, q, { plate6 })
  const mems = recallMemories(srs, q, { plate6 })
  if (!wrongs.length && !mems.length) return ''
  if (!force && !isRecallAsk(q, plate6)) return ''
  const L = ['\n【用户自己的历史·供针对性讲解】（来自本人错题本/记忆库；若与当前提问无关请忽略，不要当成当前题目）']
  wrongs.forEach((w) => {
    L.push('- 📋 错题(' + w.subject + (w.type ? '·' + w.type : '') + ')：' + w.q + '（错 ' + w.wrongCount + ' 次）')
  })
  mems.forEach((m) => L.push('- 🧠 记忆卡(' + m.cat + ')：' + m.title))
  return L.join('\n')
}
export default { recallWrongs, recallMemories, recallBlock, isRecallAsk }
