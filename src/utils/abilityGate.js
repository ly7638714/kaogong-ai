// abilityGate.js —— 能力值/锚点/预测分的灰度解锁门槛（35号批次4-B UI 前置）
// doc 35 §3.2 分阶段点亮：不给没统计基础的数。阈值：
//   · 板块能力值 θ：该板块累计作答 n≥8 才展示（不足只给进度提示）
//   · 锚点自测提示：全量累计 ≥100 次作答后建议
//   · 预测分：全量 ≥200 且覆盖 ≥60% 六大板块才显示（否则只给进度提示）
import { readAttempts } from './attemptLog'
import { replayElo, THETA0 } from './elo'

export const THETA_MIN_N = 8
export const ANCHOR_TOTAL = 100
export const PRED_TOTAL = 200
export const PRED_COVERAGE = 0.6
const PLATES6 = ['判断推理', '言语理解', '资料分析', '数量关系', '常识判断', '政治理论']
// 出题所用板块名 → 六大板块（判断推理四子板块归并）
const GROUP_OF = {
  判断推理: '判断推理',
  图形推理: '判断推理',
  定义判断: '判断推理',
  类比推理: '判断推理',
  逻辑判断: '判断推理',
  言语理解: '言语理解',
  资料分析: '资料分析',
  数量关系: '数量关系',
  常识判断: '常识判断',
  政治理论: '政治理论'
}
export function groupOf(plate) {
  return GROUP_OF[String(plate || '')] || ''
}

export function attemptsStats(attempts) {
  const byGroup = {}
  const list = attempts || []
  list.forEach((a) => {
    const g = groupOf(a && a.plate)
    if (g) byGroup[g] = (byGroup[g] || 0) + 1
  })
  return { total: list.length, byGroup }
}

export function computeGate(attempts) {
  const st = attemptsStats(attempts)
  const coverage = Object.keys(st.byGroup).length / PLATES6.length
  const thetaGroups = Object.keys(st.byGroup).filter((g) => st.byGroup[g] >= THETA_MIN_N)
  return {
    total: st.total,
    byGroup: st.byGroup,
    coverage,
    need: Math.max(0, PRED_TOTAL - st.total),
    thetaReady: thetaGroups.length > 0,
    thetaGroups,
    predictionReady: st.total >= PRED_TOTAL && coverage >= PRED_COVERAGE,
    anchorReady: st.total >= ANCHOR_TOTAL
  }
}

// 板块级能力值：θ 按作答原始板块重放后归并到六大板块（按样本量加权）
export function groupTheta(attempts) {
  const res = replayElo(attempts || [])
  const agg = {}
  Object.keys(res.plates || {}).forEach((pl) => {
    const g = groupOf(pl)
    if (!g) return
    const p = res.plates[pl]
    const t = agg[g] || (agg[g] = { s: 0, n: 0, ok: 0 })
    t.s += (p.θ || THETA0) * p.n
    t.n += p.n
    t.ok += p.ok || 0
  })
  const out = {}
  Object.keys(agg).forEach((g) => {
    const t = agg[g]
    out[g] = { θ: Math.round(t.s / Math.max(1, t.n)), n: t.n, ok: t.ok }
  })
  return out
}

export function gateNow() {
  let atts = []
  try { atts = readAttempts() } catch (e) {}
  return { gate: computeGate(atts), theta: groupTheta(atts) }
}

export default { computeGate, groupTheta, gateNow, groupOf, attemptsStats, THETA_MIN_N, ANCHOR_TOTAL, PRED_TOTAL }
