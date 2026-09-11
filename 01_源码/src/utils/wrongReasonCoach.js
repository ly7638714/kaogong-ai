// wrongReasonCoach.js —— 错题分步复盘的数据整理与兜底
// 目标：即使用户选择“其他（自写）”或 AI 暂不可用，也能把用户真实表达整理成可复用的错因。
export const COACH_OTHER = '__other__'

function cleanText(v, max = 500) {
  return String(v || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max)
}

function uniq(list, max = 3) {
  const out = []
  const seen = new Set()
  for (const raw of Array.isArray(list) ? list : []) {
    const v = cleanText(raw, 320)
    if (!v || seen.has(v)) continue
    seen.add(v)
    out.push(v)
    if (out.length >= max) break
  }
  return out
}

export function resolveCoachChoice(selected, custom = '') {
  const s = cleanText(selected, 240)
  if (!s) return ''
  if (s === COACH_OTHER) return cleanText(custom, 320)
  return s
}

export function buildCoachPayload(input = {}) {
  const first = resolveCoachChoice(input.first, input.firstCustom)
  const block = resolveCoachChoice(input.block, input.blockCustom)
  const next = resolveCoachChoice(input.next, input.nextCustom)
  const reflection = cleanText(input.reflection, 500)
  return { first, block, next, reflection }
}

export function parseCoachAiReply(reply) {
  const text = String(reply || '').replace(/```json|```/gi, '').trim()
  if (!text) return null
  let obj = null
  try {
    obj = JSON.parse(text)
  } catch (e) {
    const objMatch = text.match(/\{[\s\S]*\}/)
    const arrMatch = text.match(/\[[\s\S]*\]/)
    try { if (objMatch) obj = JSON.parse(objMatch[0]) } catch (_) {}
    try { if (!obj && arrMatch) obj = JSON.parse(arrMatch[0]) } catch (_) {}
  }
  if (Array.isArray(obj)) obj = { reasons: obj }
  if (!obj || typeof obj !== 'object') return null
  const guide = obj.guide && typeof obj.guide === 'object' ? obj.guide : {}
  const result = {
    reasons: uniq(obj.reasons || obj.causes || obj.errorReasons, 3),
    pattern: cleanText(obj.pattern || obj.method || obj.rule, 500),
    note: cleanText(obj.note || obj.personalNote, 600),
    analysis: cleanText(obj.analysis || obj.explain, 900),
    guide: {
      pattern: uniq(guide.pattern || guide.method, 3),
      note: uniq(guide.note, 3),
      analysis: uniq(guide.analysis, 3)
    }
  }
  return result.reasons.length || result.pattern || result.note || result.analysis ? result : null
}

export function buildLocalCoachFallback(input = {}) {
  const p = buildCoachPayload(input)
  const reasons = []
  if (p.first) reasons.push('当时状态：' + p.first)
  if (p.block && p.block !== p.first) reasons.push('核心卡点：' + p.block)
  if (p.next && !reasons.some((r) => r.includes(p.next))) reasons.push('下次动作：' + p.next)
  if (p.reflection && reasons.length < 3) reasons.push('我的补充：' + p.reflection)
  const pattern = p.next ? '下次遇到同类题，先做到：' + p.next : ''
  const note = p.reflection || (p.block ? '我容易在“' + p.block + '”这一环失去稳定判断；下次先写出判断标准，再比较选项。' : '')
  const chain = [p.first, p.block].filter(Boolean).join(' → ')
  const analysis = chain
    ? '这道题的失分链是：' + chain + '。复盘时不只记正确答案，先还原我当时的判断顺序，再把正确标准固定成下一步动作。'
    : '复盘时先还原当时的判断顺序，再写清真正卡点和下次动作。'
  return { reasons: uniq(reasons, 3), pattern, note, analysis, guide: { pattern: [], note: [], analysis: [] } }
}
