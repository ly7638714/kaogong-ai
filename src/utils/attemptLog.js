// attemptLog.js —— 作答事件流（35号执行说明书·批次1-B）
// 目标：把"每次作答"落成结构化明细（xc_attempts，环形上限 ATTEMPT_MAX），
// 让难度校准表 / 薄弱点加权 / Elo 能力值有数据可算——出题流水线从开环变闭环的第一块地基。
// 约定：改动只新增文件 + 在 ExamPanel.finish() 处挂载写入，不触碰 src/kb、src/ku。
import { safeGet, safeSet, KEYS } from './storage'
import { kpointOf } from './kpointLib'

export const ATTEMPT_MAX = 3000 // 环形上限（doc 35 §1-B）；超限丢弃最旧
// 生成配置版本：cls（题类键）的一部分。换出题模型 / 大改 professor.js 出题提示词后必须 +1，
// 否则新旧两个分布的历史 b 值混在一起会得到错误标定（见 35 §3.1）。
export const GEN_VER = 'g1'
const DIFFS = ['easy', 'mid', 'hard', 'real']

// qid：题干前 40 字 → 稳定 32 位 hash（与 quizCol 去重键同源：先取前 40 字再散列，紧凑可复现）
export function qidOf(stem) {
  const s = String(stem || '').slice(0, 40)
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(16).padStart(8, '0')
}

// 题类键 cls = (板块|题型|请求难度档|genVer)：b 值/校准表挂在 cls 上而非单题（35 §3.1 致命洞察）
export function clsOf({ subject, variant, difficulty }) {
  const p = String(subject || '未分类')
  const v = String(variant || '').trim() || '综合'
  const d = DIFFS.includes(difficulty) ? difficulty : 'mid'
  return [p, v, d, GEN_VER].join('|')
}

export function readAttempts() {
  const list = safeGet(KEYS.ATTEMPTS, [])
  return Array.isArray(list) ? list : []
}
export function saveAttempts(list) {
  safeSet(KEYS.ATTEMPTS, list)
}
// 追加一条作答事件（环形：超上限丢最旧）
export function appendAttempt(ev) {
  const list = readAttempts()
  list.push(ev)
  if (list.length > ATTEMPT_MAX) list.splice(0, list.length - ATTEMPT_MAX)
  saveAttempts(list)
  return ev
}

// 由卷面题对象 q + 交卷 mark 组装作答事件（q = questions[i]，mark = marks[i]）
export function buildAttempt(q, mark, src, paperId) {
  const m = mark || {}
  const stem = String(q.stem || '')
  const ok = !!m.ok
  return {
    t: Date.now(),
    qid: qidOf(stem),
    cls: clsOf(q),
    plate: String(q.subject || '未分类'),
    kpoint: String(q.kpoint || '').trim() || kpointOf(String(q.subject || ''), stem),
    variant: String(q.variant || ''),
    reqDiff: DIFFS.includes(q.difficulty) ? q.difficulty : 'mid',
    genVer: GEN_VER,
    ok,
    pick: m.pick || '',
    answer: String(q.answer || ''),
    usedSec: Number(m.usedSec) > 0 ? Math.round(Number(m.usedSec)) : 0,
    timeout: !!m.timeout,
    blank: !!m.blank,
    src: src || 'paper', // paper | single | redo | zhenti | wrong | anchor
    paperId: paperId || ''
  }
}

let _backfilled = false
// 幂等回填：xc_attempts 为空时用 quizCol 现有 history 生成初始事件（老用户升级即有点数据，无 usedSec 留空）
export function backfillFromQuizCol(quizCol) {
  if (_backfilled) return 0
  _backfilled = true
  if (readAttempts().length) return 0
  const cols = Array.isArray(quizCol) ? quizCol : safeGet(KEYS.QUIZ_COL, [])
  const seen = new Set()
  const out = []
  ;(cols || []).forEach((col) => {
    const stem = String(col && col.stem || '')
    const qid = qidOf(stem)
    const plate = String((col && col.subject) || '未分类')
    const kpoint = String(col && col.kpoint || '').trim() || kpointOf(plate, stem)
    ;((col && col.history) || []).forEach((h) => {
      const t = h && h.t ? h.t : Date.now()
      const key = qid + '|' + t
      if (seen.has(key)) return
      seen.add(key)
      out.push({
        t,
        qid,
        cls: clsOf(col),
        plate,
        kpoint,
        variant: String((col && col.variant) || ''),
        reqDiff: DIFFS.includes(col && col.difficulty) ? col.difficulty : 'mid',
        genVer: GEN_VER,
        ok: !!(h && h.ok),
        pick: '',
        answer: String((col && col.answer) || ''),
        usedSec: h && Number(h.usedSec) > 0 ? Math.round(Number(h.usedSec)) : 0,
        timeout: false,
        blank: false,
        src: 'redo',
        paperId: ''
      })
    })
  })
  if (out.length) saveAttempts(out.slice(-ATTEMPT_MAX))
  return out.length
}
// 挂载点复位（测试用）
export function resetBackfillFlag() {
  _backfilled = false
}
