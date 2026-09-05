// mastery.js —— 掌握度（R3 evidence-based，批次6-6A 收编的升级口径）
import { fullGroupOfToken } from './wrongTaxonomy' // v3.8.212 按 canonical 组汇总（兼容新旧 subject）
// 单题：错题/复盘/二刷/到期/复错 证据加权（不再纯启发式）；
// 板块：近 60 天作答正确率(0.6) + 该板块错题 questionMastery 均值(0.4) 融合；
//       无作答证据但有错题 → 错题均值；两者皆无 → 0（保持“暂无数据”语义）。
export function questionMastery(q, now = Date.now()) {
  if (!q) return 0
  const wc = Number(q.wrongCount) || 1
  const cs = Number(q.correctStreak) || 0
  let s = 20
  if (q.reviewed || q.digested) s += 15
  s += Math.min(30, cs * 12)
  s -= Math.min(30, Math.max(0, wc - 1) * 8)
  if (q.digested && (!q.dueAt || Number(q.dueAt) > now)) s += 30
  const rs = q.reviewStats
  if (rs && Number(rs.e) > 0) s -= Math.min(20, Number(rs.e) * 10)
  return Math.max(2, Math.min(100, Math.round(s)))
}
export const MASTERY_PLATES = [
  { key: '判断推理', plates: ['判断推理', '图形推理', '定义判断', '类比推理', '逻辑判断'] },
  { key: '言语理解', plates: ['言语理解'] },
  { key: '资料分析', plates: ['资料分析'] },
  { key: '数量关系', plates: ['数量关系'] },
  { key: '常识判断', plates: ['常识判断'] },
  { key: '政治理论', plates: ['政治理论'] }
]
function recentAttempts(attempts, now) {
  const list = (attempts || []).filter((a) => a && Number(a.t) <= now && now - Number(a.t) <= 60 * 86400000)
  return list.length ? list : (attempts || [])
}
export function masteryOfPlate(subject, wqs, opts = {}) {
  const plates = opts.plates || [subject]
  const now = opts.now || Date.now()
  // v3.8.212：按 canonical 大板块全称归组，兼容 旧组名/全称/细分小板块 任一存储写法
  const plateFull = (plates || []).map((p) => fullGroupOfToken(p)).filter(Boolean)
  const inPlates = (token) => plateFull.includes(fullGroupOfToken(token))
  const pqs = (wqs || []).filter((q) => inPlates(String(q.subject || q.plate || '')))
  const att = recentAttempts(opts.attempts, now).filter((a) => inPlates(String(a.plate || '')))
  const okRate = att.length ? att.filter((a) => a.ok).length / att.length : null
  const wrongMean = pqs.length ? pqs.reduce((s, q) => s + questionMastery(q, now), 0) / pqs.length : null
  if (att.length >= 5) {
    const base = Math.round(okRate * 100)
    return Math.round(base * 0.6 + (wrongMean != null ? wrongMean : base) * 0.4)
  }
  if (wrongMean != null) return Math.round(wrongMean)
  return 0
}
export function overallEstimate(wqs, opts = {}) {
  const vals = MASTERY_PLATES.map((p) => masteryOfPlate(p.key, wqs, { plates: p.plates, attempts: opts.attempts, now: opts.now })).filter((v) => v > 0)
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0
}