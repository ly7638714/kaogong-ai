// retrieveV2 —— 方法卡检索升级：type 分词命中=强命中，signs/traps 加权，支持兜底降级
import { CARDS } from './cards-index'
import { normalizePlate } from './cards-index'

const TYPE_SPLIT = /[·\-—\s:：]+/
// 太泛的词不作 type 分词证据，避免“问题/方法/计算”等噪声
const WEAK_WORDS = new Set(['问题', '方法', '分析', '计算', '判断', '速算', '数量', '基础', '进阶', '技巧', '思想', '经典', '常识'])

// 正文检索用：去标点/空白后按 2 字 n-gram 比对，能接住“题目原文就是卡内例题/步骤”的口语化提问
const NORM_RE = /[^\u4e00-\u9fa5A-Za-z0-9%‰.]/g
const NOISE_GRAMS = new Set(['题干', '选项', '下列', '以上', '这道', '这道题', '请问', '怎么', '如何', '什么', '一个', '正确', '错误', '说法', '说法', '能够', '可以', '需要', '题干中', '上述'])

function normText(s) {
  return String(s || '').toLowerCase().replace(NORM_RE, '')
}

function charGrams(s, n = 2) {
  const out = []
  for (let i = 0; i + n <= s.length; i++) out.push(s.slice(i, i + n))
  return out
}

const _corpusCache = new Map()

function cardCorpus(c) {
  if (_corpusCache.has(c.id)) return _corpusCache.get(c.id)
  const ex = c.example || {}
  const text = normText(
    [
      c.type,
      c.source,
      (c.signs || []).join(' '),
      (c.steps || []).join(' '),
      (c.traps || []).join(' '),
      c.tip,
      ex.q,
      (ex.opts || []).join(' '),
      ex.path
    ].join(' ')
  )
  _corpusCache.set(c.id, text)
  return text
}

function corpusScore(c, q) {
  const qn = normText(q)
  if (!qn || qn.length < 4) return { add: 0, strong: false, grams: 0 }
  const qg = charGrams(qn)
  const cg = charGrams(cardCorpus(c))
  if (!cg.length || !qg.length) return { add: 0, strong: false, grams: 0 }
  const cset = new Set(cg)
  let hit = 0
  for (const g of qg) {
    if (NOISE_GRAMS.has(g)) continue
    if (cset.has(g)) hit++
  }
  const ratio = hit / qg.length
  // 例题/步骤正文与问题高度重合时，即使没有命中卡名也能作为“可循的蒸馏方法”召回
  if (ratio >= 0.42 && hit >= 3) return { add: Math.min(8, Math.round(hit / 2)), strong: ratio >= 0.68, grams: hit }
  return { add: 0, strong: false, grams: hit }
}

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
  const cr = corpusScore(c, q)
  s += cr.add
  if (cr.strong) strong = true
  return { s, strong, grams: cr.grams }
}

// 主检索：返回 [{card, score, strong}]，按分排序，score>0 才保留
export function retrieveDetailed(plate, question, limit = 4) {
  const q = String(question || '')
  if (!q.trim()) return []
  const p = normalizePlate(plate)
  const pool = CARDS.filter((c) => c.plate === p)
  const scored = pool
    .map((c) => ({ card: c, ...scoreCard(c, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => (b.s - a.s) || (b.strong - a.strong))
  if (!scored.length) return []
  // 正文重合极高但恰好未与卡名/信号词字面重合时，也允许进入候选（由调用方按序取用）
  const topRatio = Math.max(...scored.map((x) => x.s))
  return scored.filter((x) => x.s >= topRatio - 2 || x.strong).slice(0, limit)
}

// 兼容旧返回：直接给卡数组（V2 无强命中返回 []，便于调用方走旧检索兜底）
export function retrieveCardsV2(plate, question, limit = 4) {
  return retrieveDetailed(plate, question, limit).map((x) => x.card)
}

// 检查某卡是否命中“主卡”级强信号（供提示词强调用）
export function isStrongHit(d) { return d && d.strong }
