// retrieveV2 —— 方法卡检索升级：type 分词命中=强命中，signs/traps 加权，支持兜底降级
import { CARDS } from './cards-index'
import { normalizePlate } from './cards-index'

const TYPE_SPLIT = /[·\-—\s:：]+/
// 太泛的词不作 type 分词证据，避免“问题/方法/计算”等噪声
const WEAK_WORDS = new Set(['问题', '方法', '分析', '计算', '判断', '速算', '数量', '基础', '进阶', '技巧', '思想', '经典', '常识'])

function typeTokens(type) {
  return String(type || '').split(TYPE_SPLIT).map((s) => s.trim()).filter((s) => s.length >= 2 && !WEAK_WORDS.has(s))
}

function scoreCard(c, q) {
  let s = 0
  let strong = false
  // 1) 完整 type 命中 → 强信号
  if (q.includes(c.type)) { s += 6; strong = true }
  // 2) type 分词命中（每词 +2，最多 +6）
  const toks = typeTokens(c.type)
  let tokHit = 0
  for (const tk of toks) { if (q.includes(tk)) { s += 2; tokHit++ } }
  if (tokHit >= 2) strong = true
  // 3) signs 命中（每个 +2）
  for (const sg of c.signs || []) { if (sg && q.includes(String(sg))) s += 2 }
  // 4) traps 弱证据（每个 +1，封顶 2）
  let tr = 0
  for (const tp of c.traps || []) { if (tp && q.includes(String(tp))) { s += 1; if (++tr >= 2) break } }
  return { s, strong }
}

// 主检索：返回 [{card, score, strong}]，按分排序，score>0 才保留
export function retrieveDetailed(plate, question, limit = 4) {
  const q = String(question || '')
  if (!q.trim()) return []
  const p = normalizePlate(plate)
  const pool = CARDS.filter((c) => c.plate === p)
  return pool
    .map((c) => ({ card: c, ...scoreCard(c, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => (b.s - a.s) || (b.strong - a.strong))
    .slice(0, limit)
}

// 兼容旧返回：直接给卡数组（V2 无强命中返回 []，便于调用方走旧检索兜底）
export function retrieveCardsV2(plate, question, limit = 4) {
  return retrieveDetailed(plate, question, limit).map((x) => x.card)
}

// 检查某卡是否命中“主卡”级强信号（供提示词强调用）
export function isStrongHit(d) { return d && d.strong }