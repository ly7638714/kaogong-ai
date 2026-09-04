// flaggedQuestions.js —— 疑题反馈（37号·正确性加固B）：用户认为题有问题的上报与汇总
// 目的：语义板块不可能程序判定“绝对唯一”，出题质量最终兜底=用户反馈闭环——
// 标记后进入 xc_flag_qs 列表，可汇总按 (板块,考点/题型) 计数，供降权/人工复核/回流提示词。
import { safeGet, safeSet, KEYS } from './storage'
import { qidOf } from './attemptLog'

const MAX = 300
export function listFlagged() {
  const l = safeGet(KEYS.FLAG_QS, [])
  return Array.isArray(l) ? l : []
}
function save(l) { safeSet(KEYS.FLAG_QS, l.slice(-MAX)) }

// 上报一条疑题：{ plate, stem?, kpoint?, variant?, note? } → 去重键 qid+plate+note 前缀
export function addFlaggedQuestion(f) {
  const q = f || {}
  const plate = String(q.plate || '未分类')
  const stem = String(q.stem || '')
  const qid = qidOf(stem || plate + String(q.variant || ''))
  const note = String(q.note || '疑似题目有误').slice(0, 40)
  const rec = {
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    t: Date.now(),
    plate,
    qid,
    kpoint: String(q.kpoint || ''),
    variant: String(q.variant || ''),
    note,
    answer: String(q.answer || ''),
    question: stem.slice(0, 200),
    status: FLAG_STATUS.OPEN
  }
  const l = listFlagged()
  const dup = l.find((x) => x.plate === plate && x.qid === qid && x.note === note)
  if (dup) return { ok: false, dup: true, item: dup }
  l.unshift(rec)
  save(l)
  return { ok: true, item: rec }
}
export function removeFlagged(id) {
  save(listFlagged().filter((x) => x.id !== id))
}
export function clearFlagged() { save([]) }
// 按 (板块,考点/题型) 聚合疑题计数（供降权参考）
// 疑题生命周期（深化·争议题状态流转）：open=待复核 / confirmed=已确认问题(继续降权) / dismissed=误报(不再降权)
export const FLAG_STATUS = { OPEN: 'open', CONFIRMED: 'confirmed', DISMISSED: 'dismissed' }
const VALID_STATUS = new Set(Object.values(FLAG_STATUS))
export function setFlagStatus(id, status) {
  const st = String(status || '')
  if (!VALID_STATUS.has(st)) return false
  const l = listFlagged()
  const rec = l.find((x) => x.id === id)
  if (!rec) return false
  rec.status = st
  save(l)
  return true
}
export function confirmFlagged(id) { return setFlagStatus(id, FLAG_STATUS.CONFIRMED) }
export function dismissFlagged(id) { return setFlagStatus(id, FLAG_STATUS.DISMISSED) }
// 状态计数（供榜单头部外显）

// 具体问题线索（深化·疑题规避内容化）：取该(板块|题型)最近被标记的具体备注（排除误报），
// confirmed 优先；用于注入出题提示词让模型规避真实踩过的坑（不止是“被标记过几次”）。
export function flaggedIssueHints(plate, variant, limit = 2) {
  try {
    const l = listFlagged().filter((x) => x.plate === String(plate || '') && (!variant || x.variant === String(variant || '')) && x.status !== FLAG_STATUS.DISMISSED && String(x.note || '').trim().length > 0)
    const pri = (x) => (x.status === FLAG_STATUS.CONFIRMED ? 0 : 1)
    return l.sort((a, b) => pri(a) - pri(b) || (b.t || 0) - (a.t || 0)).slice(0, Math.max(1, Number(limit) || 2)).map((x) => String(x.note).trim().slice(0, 30))
  } catch (e) { return [] }
}


// 按 (板块|题型变体) 聚合疑题计数（降权用，37号）——与 flaggedSummary(按 考点) 互补：
// 组卷考频配额按 variant 降权，这里忽略 kpoint 只按 variant 聚合，避免「记录带考点而变体级查不到」导致降权失效
export function flaggedByVariant() {
  const m = {}
  listFlagged().forEach((x) => {
    if (x.status === FLAG_STATUS.DISMISSED) return
    const k = x.plate + '|' + (x.variant || '综合')
    m[k] = (m[k] || 0) + 1
  })
  return m
}

export function flaggedStats() {
  const c = { open: 0, confirmed: 0, dismissed: 0 }
  listFlagged().forEach((x) => { const k = x.status === FLAG_STATUS.CONFIRMED ? 'confirmed' : x.status === FLAG_STATUS.DISMISSED ? 'dismissed' : 'open'; c[k]++ })
  return c
}

export function flaggedSummary() {
  const m = {}
  listFlagged().forEach((x) => {
    if (x.status === FLAG_STATUS.DISMISSED) return // 已判误报：不再降权同类题
    const k = x.plate + '|' + (x.kpoint || x.variant || '综合')
    m[k] = (m[k] || 0) + 1
  })
  return m
}

export default { listFlagged, addFlaggedQuestion, removeFlagged, clearFlagged, flaggedSummary, flaggedByVariant, setFlagStatus, confirmFlagged, dismissFlagged, flaggedStats, flaggedIssueHints, FLAG_STATUS }
