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
  { k: 1, t: '第1关 · 识词', d: '看词选义，建立第一印象', icon: '🌱' },
  { k: 2, t: '第2关 · 辨义', d: '看义选词，反向回忆', icon: '⚡' },
  { k: 3, t: '第3关 · 应用', d: '语境填空 + 正误判断', icon: '🔥' },
  { k: 4, t: 'Boss · 混合战', d: '四种题型混合，检验真掌握', icon: '👑' }
]

export const GAME_MODES = [
  { k: 'level', t: '闯关模式', d: '10 题一关，可看解析，稳稳记牢', icon: '🗺️' },
  { k: 'rapid', t: '极速 60 秒', d: '60 秒内答对越多越好，连击加分', icon: '⏱️' },
  { k: 'wrong', t: '错题回炉', d: '只练闯关答错的词条，一把清空', icon: '🔁' }
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
    return {
      subject,
      term: text,
      meaning: clean(raw.yishi),
      context: clean(raw.lj || raw.gm || raw.yishi),
      tip: clean(raw.yf || raw.jy || ''),
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
  return { subject, term: clean(term), meaning: clean(meaning), context: text, tip: '', source: raw }
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
  return list.filter((x) => x && x.term && x.meaning)
}

function typeFor(level, i, rng) {
  if (level === 1) return 'term2meaning'
  if (level === 2) return i % 2 ? 'meaning2term' : 'term2meaning'
  if (level === 3) return ['meaning2term', 'truefalse', 'fill'][i % 3]
  const types = ['term2meaning', 'meaning2term', 'truefalse', 'fill']
  return types[Math.floor(rng() * types.length)]
}

function optsWithAnswer(correct, others, field, kPrefix = 'ABCD') {
  const vals = []
  others.forEach((o) => {
    const v = field(o)
    if (v && v !== correct && !vals.includes(v)) vals.push(v)
  })
  const picked = shuffle(vals, Math.random).slice(0, 3)
  const all = shuffle([correct].concat(picked))
  return all.map((t, i) => ({ k: kPrefix[i], t, ok: t === correct }))
}

export function makeQuestion(item, pool, level, idx, rng = Math.random) {
  const type = typeFor(level, idx, rng)
  const others = shuffle(pool.filter((x) => x && x.term !== item.term), rng).slice(0, 6)
  if (type === 'term2meaning') {
    const opts = optsWithAnswer(item.meaning, others, (x) => x.meaning)
    const ans = opts.find((o) => o.ok)
    return { type, tag: '看词选义', term: item.term, prompt: '“' + item.term + '”的含义是？', options: opts, answer: ans && ans.k, item, explain: item.meaning, tip: item.tip }
  }
  if (type === 'meaning2term') {
    const opts = optsWithAnswer(item.term, others, (x) => x.term)
    const ans = opts.find((o) => o.ok)
    return { type, tag: '看义选词', term: item.term, prompt: '“' + firstSentence(item.meaning, 86) + '”对应的是？', options: opts, answer: ans && ans.k, item, explain: item.term + '：' + item.meaning, tip: item.tip }
  }
  if (type === 'truefalse') {
    const wrong = others.find((x) => firstSentence(x.meaning, 80) !== firstSentence(item.meaning, 80))
    const isTrue = rng() > 0.45 || !wrong
    const showMeaning = isTrue ? item.meaning : (wrong ? wrong.meaning : item.meaning)
    return {
      type, tag: '正误判断', term: item.term,
      prompt: '判断：“' + item.term + '”的含义是——' + firstSentence(showMeaning, 82),
      options: [{ k: 'T', t: '正确', ok: isTrue }, { k: 'F', t: '错误', ok: !isTrue }],
      answer: isTrue ? 'T' : 'F',
      item,
      explain: isTrue ? '正确。' + item.term + '：' + item.meaning : '错误。' + item.term + '：' + item.meaning,
      tip: item.tip
    }
  }
  const sentence = String(item.context || '').replace(item.term, '____')
  const prompt = sentence && sentence !== item.term ? sentence : '根据含义选择正确词条：' + firstSentence(item.meaning, 80)
  const opts = optsWithAnswer(item.term, others, (x) => x.term)
  const ans = opts.find((o) => o.ok)
  return { type: 'fill', tag: '语境填空', term: item.term, prompt, options: opts, answer: ans && ans.k, item, explain: item.term + '：' + item.meaning, tip: item.tip }
}

export function buildDeck(subject = 'all', level = 1, count = 10, opts = {}) {
  const rng = opts.rng || Math.random
  let pool = poolForSubject(subject)
  if (opts.wrongTerms && opts.wrongTerms.length) {
    const set = new Set(opts.wrongTerms)
    const hit = pool.filter((x) => set.has(x.term))
    if (hit.length) pool = hit
  }
  if (pool.length < 4) return []
  const picked = shuffle(pool, rng).slice(0, Math.max(1, Math.min(count, pool.length)))
  return picked.map((it, i) => makeQuestion(it, pool, level, i, rng))
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
