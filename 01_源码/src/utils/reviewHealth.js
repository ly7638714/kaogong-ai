// reviewHealth.js —— 复盘健康分 / 周报口径（深化，纯函数可单测）
// 口径（只读 wqs 既有字段，绝不迁移/改写数据）：
//  - 复盘率 reviewedRate = 已复盘 / 总数
//  - 消化率 digestRate   = 已消化 / 总数
//  - 到期积压 overdueN   = 已消化且 dueAt<=now（逾期未回访）
//  - 复错率 repRate      = Σe / Σr（有复习后再做记录才统计）
// 健康分 = 50 + 复盘率*20 + 消化率*10 + (1-逾期占比)*10 + (1-复错率)*10，clamp 0..100
import { ymdKey } from './memorySrs'
export function reviewHealth(wqs, opts = {}) {
  const now = Number(opts.now) || Date.now()
  const list = Array.isArray(wqs) ? wqs : []
  const t = list.length
  const reviewed = list.filter((q) => q && (q.reviewed || q.digested)).length
  const digested = list.filter((q) => q && q.digested).length
  const overdue = list.filter((q) => q && q.digested && Number(q.dueAt) > 0 && Number(q.dueAt) <= now).length
  let rr = 0
  let ee = 0
  list.forEach((q) => { const rs = (q && q.reviewStats) || {}; if (Number(rs.r) > 0) { rr += Number(rs.r); ee += Number(rs.e) || 0 } })
  const reviewedRate = t ? Math.round((reviewed / t) * 100) : 0
  const digestRate = t ? Math.round((digested / t) * 100) : 0
  const overdueRate = digested ? Math.round((overdue / digested) * 100) : 0
  const repRate = rr ? Math.round((ee / rr) * 100) : null
  const score = !t ? 0 : Math.max(0, Math.min(100, Math.round(
    reviewedRate * 0.3 + digestRate * 0.2 + (100 - overdueRate) * 0.25 + (repRate == null ? 100 : 100 - repRate) * 0.25
  )))
  const grade = score >= 85 ? '优秀' : score >= 70 ? '良好' : score >= 50 ? '一般' : '需加油'
  const tips = []
  if (t && reviewedRate < 60) tips.push('还有 ' + (t - reviewed) + ' 题未复盘——先补结构化复盘（对答案/错因/秒杀）')
  if (digestRate < 40 && t >= 3) tips.push('消化率偏低：连续答对 2 次会自动「已消化」并进入 3/7/15/30 天到期复习')
  if (overdue > 0) tips.push('有 ' + overdue + ' 题到期未回访，去「🗓️ 今日复习中枢」清掉')
  if (repRate != null && repRate >= 30) tips.push('复错率 ' + repRate + '% 偏高：复错=没吃透，优先「✍️ 连做同类」再消化')
  if (!tips.length && score >= 70) tips.push('复盘链路健康：保持到期回访 + 同类连做节奏')
  return {
    score, grade, t, reviewed, digested, overdue, rr, ee,
    reviewedRate, digestRate, overdueRate, repRate, tips: tips.slice(0, 3)
  }
}
// 周口径快照（近 N 天）：新增错题 / 复盘次数 / 二刷次数 / 复错事件 / 达标题（到期内回访）
export function weekReviewStats(wqs, opts = {}) {
  const days = Number(opts.days) || 7
  const now = Number(opts.now) || Date.now()
  const DAY = 86400000
  const start = now - (days - 1) * DAY
  const inWin = (ts) => { const v = Number(ts); return v > 0 && v >= start && v <= now }
  const list = Array.isArray(wqs) ? wqs : []
  const out = { days, newWrongs: 0, reviews: 0, redoEvents: 0, redoWrong: 0, digestGain: 0 }
  list.forEach((q) => {
    if (!q) return
    if (inWin(q.at)) out.newWrongs++
    if (inWin(q.reviewedAt)) out.reviews++
    if (Number(q.digestedAt) >= start && Number(q.digestedAt) <= now) out.digestGain++
    ;(q.redoHistory || []).forEach((h) => {
      const t = h && h.t ? h.t * 1 : (new Date(String(h.at || '')).getTime() || 0)
      if (inWin(t)) { out.redoEvents++; if (!h.ok) out.redoWrong++ }
    })
  })
  return out
}
// 以日粒度聚合近 N 天「错题活动日」：{key,label,newWrongs,reviews,redo}
export function weekDaily(wqs, opts = {}) {
  const days = Number(opts.days) || 7
  const now = Number(opts.now) || Date.now()
  const DAY = 86400000
  const map = {}
  for (let i = days - 1; i >= 0; i--) {
    const key = ymdKey(new Date(now - i * DAY))
    map[key] = { key, newWrongs: 0, reviews: 0, redo: 0 }
  }
  const dayOf = (ts) => { try { const v = Number(ts); return v > 0 ? ymdKey(new Date(v)) : '' } catch (e) { return '' } }
  ;(Array.isArray(wqs) ? wqs : []).forEach((q) => {
    if (!q) return
    const a = dayOf(q.at)
    if (a && map[a]) map[a].newWrongs++
    const r = dayOf(q.reviewedAt)
    if (r && map[r]) map[r].reviews++
    ;(q.redoHistory || []).forEach((h) => {
      const t = h && h.t ? h.t * 1 : (new Date(String(h.at || '')).getTime() || 0)
      const dk = dayOf(t)
      if (dk && map[dk]) map[dk].redo++
    })
  })
  return Object.keys(map).map((k) => map[k])
}
export default reviewHealth

