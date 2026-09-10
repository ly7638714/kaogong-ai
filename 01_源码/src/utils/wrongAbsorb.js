// wrongAbsorb.js —— 错题吸收度（纯函数）
// 把“看懂答案”拆成可验证的 6 个动作：答案、错因、考点骨架、秒杀方法、变式检验、间隔复习。
// 每一维都有对应的持久化证据，避免只靠主观感觉判断“会了没有”。
export const ABSORB_STEPS = [
  { k: 'answer', label: '对答案', weight: 10, tip: '补全正确答案，建立判分基线' },
  { k: 'reason', label: '写错因', weight: 15, tip: '至少写清一个可复用的错因' },
  { k: 'core', label: '拆考点', weight: 20, tip: '提炼考点、骨架、陷阱与一句话修正' },
  { k: 'method', label: '记方法', weight: 15, tip: '写下一句话秒杀规律或操作口诀' },
  { k: 'variant', label: '做变式', weight: 20, tip: '用同类题或 AI 变式检验迁移能力' },
  { k: 'review', label: '间隔复习', weight: 20, tip: '至少一次二刷/主动回忆或进入消化队列' }
]

function doneMap(q) {
  const s = q || {}
  const rs = s.reviewStats || {}
  return {
    answer: !!String(s.answer || '').trim(),
    reason: !!((s.reasons || []).filter(Boolean).length),
    core: !!(s.absorb && (s.absorb.kp || s.absorb.core || s.absorb.skeleton)) || !!String(s.note || '').trim(),
    method: !!String(s.method || '').trim(),
    variant: !!(s.variantStats && Number(s.variantStats.total) > 0),
    review: Number(s.correctStreak || 0) > 0 || !!s.reviewed || !!s.digested || Number(rs.r || 0) > 0
  }
}

export function absorbState(q, now = Date.now()) {
  const src = q || {}
  const done = doneMap(src)
  let score = 0
  const steps = ABSORB_STEPS.map((s) => {
    const ok = !!done[s.k]
    if (ok) score += s.weight
    return { ...s, done: ok }
  })
  // 复错越多，吸收度越要打折；仅做轻量惩罚，不掩盖证据维度。
  const repErr = Number((src.reviewStats && src.reviewStats.e) || 0)
  const wrongCount = Math.max(1, Number(src.wrongCount) || 1)
  score -= Math.min(18, repErr * 6 + Math.max(0, wrongCount - 1) * 2)
  score = Math.max(0, Math.min(100, Math.round(score)))
  const next = steps.find((s) => !s.done) || null
  const level = score >= 85 ? '已吃透' : score >= 65 ? '基本掌握' : score >= 40 ? '正在吸收' : '待吃透'
  return { score, level, steps, next, done, updatedAt: Number(src.absorb && src.absorb.at) || 0, now }
}

export function absorbSummary(wqs) {
  const list = (wqs || []).filter(Boolean)
  if (!list.length) return { total: 0, avg: 0, full: 0, weak: 0, due: 0, list: [] }
  const rows = list.map((q) => ({ q, ...absorbState(q) }))
  const avg = Math.round(rows.reduce((s, x) => s + x.score, 0) / rows.length)
  return {
    total: rows.length,
    avg,
    full: rows.filter((x) => x.score >= 85).length,
    weak: rows.filter((x) => x.score < 40).length,
    due: rows.filter((x) => x.q.digested && x.q.dueAt && Number(x.q.dueAt) <= Date.now()).length,
    list: rows
  }
}

export default { ABSORB_STEPS, absorbState, absorbSummary }
