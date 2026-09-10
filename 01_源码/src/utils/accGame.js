// accGame.js —— 积累板块「记忆闯关」题库生成引擎（纯函数）
import { CHANGSHI, SHIZHENG, CHENGYU, SHICI, YUFEN_CHENGYU, YUFEN_SHICI, skillMemCS, skillMemZZ } from '../data/memoryPools'

export const GAME_SUBJECTS = [
  { k: 'all', t: '混合挑战', icon: '🎮' },
  { k: '常识', t: '常识判断', icon: '🧠' },
  { k: '政治理论', t: '政治理论', icon: '🚩' },
  { k: '时政', t: '时政热点', icon: '📰' },
  { k: '成语', t: '成语辨析', icon: '📚' },
  { k: '实词', t: '实词辨析', icon: '🔤' }
]

export const GAME_LEVELS = [
  { k: 1, t: '第1关 · 识记编码', d: '词义闪卡：先主动回想，再看答案，建立可靠的第一层编码', icon: '🌱', science: '主动回忆' },
  { k: 2, t: '第2关 · 提取强化', d: '看义选词：反向提取比重复阅读更容易形成长期记忆', icon: '⚡', science: '提取练习' },
  { k: 3, t: '第3关 · 交错辨析', d: '近义词交错出现，专治“看着都会、一做就混”', icon: '🧩', science: '交错练习' },
  { k: 4, t: '第4关 · 情境迁移', d: '语境填空与正误判断，把知识迁移到真实用法', icon: '🔥', science: '情境迁移' }
]

export const GAME_MODES = [
  { k: 'camp', t: '记忆闭环训练', d: '主动回忆→提取→辨析→应用，一局完成四种记忆强化', icon: '🧪' },
  { k: 'level', t: '专项闯关', d: '任选识记、提取、辨析、情境迁移中的一关集中训练', icon: '🗺️' },
  { k: 'flash', t: '主动回忆闪卡', d: '先回想再看答案，按“忘了/模糊/记住”自评', icon: '🧠' },
  { k: 'contrast', t: '易混辨析对决', d: '近义词交错干扰，强制辨析语义侧重点', icon: '🧩' },
  { k: 'srs', t: '到期巩固', d: '优先抽取艾宾浩斯到期词条，在遗忘临界点复习', icon: '⏳' },
  { k: 'rapid', t: '极速 60 秒', d: '限时提取 + 连击，检验是否能快速准确调用', icon: '⏱️' },
  { k: 'wrong', t: '错题回炉', d: '只练答错词条，并换一种题型再次出现', icon: '🔁' }
]

export const WRONG_GAME_KEY = 'xc_acc_game_wrong_v1'
export const GAME_STATS_KEY = 'xc_acc_game_stats_v1'

function shuffle(list, rng = Math.random) {
  const a = (list || []).slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const t = a[i]; a[i] = a[j]; a[j] = t
  }
  return a
}

function clean(s) {
  return String(s || '').replace(/\s+/g, ' ').trim()
}

function firstSentence(s, max = 90) {
  const t = clean(s)
  const i = t.search(/[。；;]/)
  const out = i >= 6 ? t.slice(0, i) : t
  return out.length > max ? out.slice(0, max - 1) + '…' : out
}

// 统一词条结构：term=需要记住的词/考点，meaning=含义，context=应用语境，tip=辨析提醒
export function normalizeAccItem(raw, subject) {
  if (!raw || !raw.t) return null
  const text = clean(raw.t)
  if (raw.yishi) {
    const example = clean(raw.lj || raw.gm || '')
    return {
      subject,
      term: text,
      meaning: clean(raw.yishi),
      context: clean(example || raw.yishi),
      example,
      tip: clean(raw.yf || raw.jy || ''),
      synonyms: clean(raw.jy || ''),
      antonyms: clean(raw.fy || ''),
      verified: raw.verified !== false,
      source: raw
    }
  }
  let term = ''
  let meaning = text
  const ci = text.indexOf('：') >= 0 ? text.indexOf('：') : text.indexOf(':')
  if (ci > 0 && ci <= 18) {
    term = text.slice(0, ci)
    meaning = text.slice(ci + 1).trim()
  } else {
    const m = text.match(/^(.{2,14}?)(?:是|指|为|，|,)/)
    term = m ? m[1] : text.slice(0, Math.min(12, text.length))
    meaning = text
  }
  return { subject, term: clean(term), meaning: clean(meaning), context: text, example: '', tip: '', synonyms: '', antonyms: '', verified: true, source: raw }
}

export function poolForSubject(subject) {
  let list = []
  if (subject === '成语') list = CHENGYU.concat(YUFEN_CHENGYU).map((x) => normalizeAccItem(x, '成语'))
  else if (subject === '实词') list = SHICI.concat(YUFEN_SHICI).map((x) => normalizeAccItem(x, '实词'))
  else if (subject === '时政') list = SHIZHENG.concat(skillMemZZ).map((x) => normalizeAccItem(x, '时政'))
  else if (subject === '政治理论') list = CHANGSHI.filter((x) => x.cat === '政治理论').concat(skillMemZZ).map((x) => normalizeAccItem(x, '政治理论'))
  else if (subject === '常识') list = CHANGSHI.concat(skillMemCS).map((x) => normalizeAccItem(x, '常识'))
  else {
    list = CHANGSHI.map((x) => normalizeAccItem(x, x.cat === '政治理论' ? '政治理论' : '常识'))
      .concat(skillMemCS.map((x) => normalizeAccItem(x, '常识')))
      .concat(SHIZHENG.map((x) => normalizeAccItem(x, '时政')))
      .concat(skillMemZZ.map((x) => normalizeAccItem(x, '政治理论')))
      .concat(CHENGYU.concat(YUFEN_CHENGYU).map((x) => normalizeAccItem(x, '成语')))
      .concat(SHICI.concat(YUFEN_SHICI).map((x) => normalizeAccItem(x, '实词')))
  }
  return list.filter((x) => x && x.term && x.meaning && x.verified !== false)
}

function campaignType(i, count) {
  const p = (i + 1) / Math.max(1, count)
  if (p <= 0.25) return 'flash'
  if (p <= 0.5) return i % 2 ? 'meaning2term' : 'term2meaning'
  if (p <= 0.75) return i % 2 ? 'discrimination' : 'truefalse'
  return ['fill', 'discrimination', 'truefalse'][i % 3]
}

function typeFor(level, i, rng, count = 10) {
  if (level === 'camp') return campaignType(i, count)
  if (level === 1) return 'flash'
  if (level === 2) return i % 2 ? 'meaning2term' : 'term2meaning'
  if (level === 3) return ['discrimination', 'truefalse', 'fill'][i % 3]
  const types = ['term2meaning', 'meaning2term', 'truefalse', 'fill', 'discrimination']
  return types[Math.floor(rng() * types.length)]
}

function optsWithAnswer(correct, others, field, rng = Math.random, kPrefix = 'ABCD') {
  const vals = []
  others.forEach((o) => {
    const v = field(o)
    if (v && v !== correct && !vals.includes(v)) vals.push(v)
  })
  const picked = shuffle(vals, rng).slice(0, 3)
  const all = shuffle([correct].concat(picked), rng)
  return all.map((t, i) => ({ k: kPrefix[i], t, ok: t === correct }))
}

function confusablePool(item, pool, rng) {
  const scored = pool
    .filter((x) => x && x.term !== item.term && x.subject === item.subject)
    .map((x) => {
      let score = 0
      if (item.synonyms && item.synonyms.includes(x.term)) score += 8
      if (x.synonyms && x.synonyms.includes(item.term)) score += 8
      if (item.tip && item.tip.includes(x.term)) score += 6
      if (x.tip && x.tip.includes(item.term)) score += 6
      if ([...item.term].some((ch) => x.term.includes(ch))) score += 1
      return { x, score }
    })
    .sort((a, b) => b.score - a.score)
  return shuffle(scored.filter((x) => x.score > 0).map((x) => x.x), rng)
}

export function makeQuestion(item, pool, level, idx, rng = Math.random, forceType = '', count = 10) {
  const type = forceType || typeFor(level, idx, rng, count)
  const distractors = confusablePool(item, pool, rng)
  const others = distractors.concat(shuffle(pool.filter((x) => x && x.term !== item.term), rng)).slice(0, 8)
  if (type === 'flash') {
    return {
      type,
      tag: '主动回忆',
      science: '先想再看，避免把“眼熟”误认为“记住”',
      term: item.term,
      prompt: '请先回想它的准确含义，再翻开答案。',
      options: [],
      answer: '',
      item,
      explain: item.meaning,
      tip: [item.synonyms && '近义：' + item.synonyms, item.tip].filter(Boolean).join('；')
    }
  }
  if (type === 'term2meaning') {
    const opts = optsWithAnswer(item.meaning, others, (x) => x.meaning, rng)
    const ans = opts.find((o) => o.ok)
    return { type, tag: '看词选义', science: '双重编码：词形与语义同时建立连接', term: item.term, prompt: '“' + item.term + '”的含义是？', options: opts, answer: ans && ans.k, item, explain: item.meaning, tip: item.tip }
  }
  if (type === 'meaning2term') {
    const opts = optsWithAnswer(item.term, others, (x) => x.term, rng)
    const ans = opts.find((o) => o.ok)
    return { type, tag: '看义选词', science: '提取练习：从记忆里主动找词，比重复阅读更牢', term: item.term, prompt: '“' + firstSentence(item.meaning, 86) + '”对应的是？', options: opts, answer: ans && ans.k, item, explain: item.term + '：' + item.meaning, tip: item.tip }
  }
  if (type === 'truefalse') {
    const wrong = others.find((x) => firstSentence(x.meaning, 80) !== firstSentence(item.meaning, 80))
    const isTrue = rng() > 0.45 || !wrong
    const showMeaning = isTrue ? item.meaning : (wrong ? wrong.meaning : item.meaning)
    return {
      type, tag: '正误判断', science: '错误预警：主动分辨形近义近干扰', term: item.term,
      prompt: '判断：“' + item.term + '”的含义是——' + firstSentence(showMeaning, 82),
      options: [{ k: 'T', t: '正确', ok: isTrue }, { k: 'F', t: '错误', ok: !isTrue }],
      answer: isTrue ? 'T' : 'F',
      item,
      explain: isTrue ? '正确。' + item.term + '：' + item.meaning : '错误。' + item.term + '：' + item.meaning,
      tip: item.tip
    }
  }
  if (type === 'discrimination') {
    const opts = optsWithAnswer(item.term, others, (x) => x.term, rng)
    const ans = opts.find((o) => o.ok)
    return {
      type,
      tag: '易混辨析',
      science: '交错练习：相似选项并列出现，强迫比较语义侧重点',
      term: item.term,
      prompt: '“' + firstSentence(item.meaning, 88) + '”最适配的词是？',
      options: opts,
      answer: ans && ans.k,
      item,
      explain: item.term + '：' + item.meaning,
      tip: item.tip || (item.synonyms ? '近义词：' + item.synonyms : '')
    }
  }
  const sentence = String(item.example || item.context || '').replace(item.term, '____')
  const prompt = sentence && sentence !== item.term ? sentence : '根据含义选择正确词条：' + firstSentence(item.meaning, 80)
  const opts = optsWithAnswer(item.term, others, (x) => x.term, rng)
  const ans = opts.find((o) => o.ok)
  return { type: 'fill', tag: '语境填空', science: '情境迁移：在真实语境里调用，才算真正会用', term: item.term, prompt, options: opts, answer: ans && ans.k, item, explain: item.term + '：' + item.meaning, tip: item.tip }
}

export function buildDeck(subject = 'all', level = 1, count = 10, opts = {}) {
  const rng = opts.rng || Math.random
  let pool = poolForSubject(subject)
  let selectedPool = pool
  if (opts.wrongTerms && opts.wrongTerms.length) {
    const set = new Set(opts.wrongTerms)
    const hit = pool.filter((x) => set.has(x.term))
    if (hit.length) selectedPool = hit
  }
  if (opts.dueTerms && opts.dueTerms.length) {
    const set = new Set(opts.dueTerms)
    const hit = pool.filter((x) => set.has(x.term))
    if (hit.length) selectedPool = hit
  }
  if (pool.length < 4 || !selectedPool.length) return []
  if (level === 'camp') {
    const groupSize = Math.max(2, Math.floor(count / 4))
    const picked = shuffle(selectedPool, rng).slice(0, Math.min(groupSize, selectedPool.length))
    const stages = ['flash', 'meaning2term', 'discrimination', 'fill']
    const out = []
    for (const stage of stages) {
      for (const item of shuffle(picked, rng)) out.push(makeQuestion(item, pool, 1, 0, rng, stage, groupSize))
    }
    return out.slice(0, count)
  }
  const picked = shuffle(selectedPool, rng).slice(0, Math.max(1, Math.min(count, selectedPool.length)))
  return picked.map((it, i) => makeQuestion(it, pool, level, i, rng, opts.forceType || '', picked.length))
}

export function loadGameWrong() {
  try {
    const a = JSON.parse(localStorage.getItem(WRONG_GAME_KEY) || '[]')
    return Array.isArray(a) ? a.filter(Boolean) : []
  } catch (e) { return [] }
}

export function saveGameWrong(list) {
  try { localStorage.setItem(WRONG_GAME_KEY, JSON.stringify((list || []).slice(0, 200))) } catch (e) {}
}

export function loadGameStats() {
  try { return Object.assign({ best: 0, streak: 0, lastDay: '', total: 0 }, JSON.parse(localStorage.getItem(GAME_STATS_KEY) || '{}')) } catch (e) { return { best: 0, streak: 0, lastDay: '', total: 0 } }
}

export function saveGameStats(s) {
  try { localStorage.setItem(GAME_STATS_KEY, JSON.stringify(s || {})) } catch (e) {}
}

export default { GAME_SUBJECTS, GAME_LEVELS, GAME_MODES, normalizeAccItem, poolForSubject, makeQuestion, buildDeck, loadGameWrong, saveGameWrong, loadGameStats, saveGameStats }
