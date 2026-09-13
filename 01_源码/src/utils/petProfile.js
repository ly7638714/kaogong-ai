// petProfile —— 萌宠学习画像：把对话、错题、复盘、记忆与打卡统一转成可执行建议。
import { detectBanKuai } from '../api/detect'
import { groupLabelOf, groupOfName, taxonOf } from './wrongTaxonomy'

const GROUPS = ['判断推理', '言语理解', '数量关系', '资料分析', '常识判断', '政治理论']
const UNCLASSIFIED = '未分类'

function msgText(m) {
  if (!m) return ''
  const c = m.content
  if (typeof c === 'string') return c.trim()
  if (Array.isArray(c)) return c.map((x) => (typeof x === 'string' ? x : (x && (x.text || x.content)) || '')).join(' ').trim()
  if (c && typeof c === 'object') return String(c.text || c.content || c.value || '').trim()
  return String(m.text || m.msg || m.message || '').trim()
}

function msgTs(m, fallback = Date.now()) {
  const raw = m && (m.ts || m.at || m.time || m.t)
  const n = raw instanceof Date ? raw.getTime() : Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function dayKey(ts) {
  const n = ts instanceof Date ? ts.getTime() : Number(ts)
  if (!Number.isFinite(n) || n <= 0) return ''
  const d = new Date(n)
  if (isNaN(d.getTime())) return ''
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

function daysAgo(now, n) {
  const d = new Date(now)
  d.setDate(d.getDate() - n)
  return dayKey(d.getTime())
}

function blankPlate(group) {
  return {
    group,
    label: groupLabelOf(group) || group,
    asks: 0,
    wrongs: 0,
    reviewed: 0,
    digested: 0,
    due: 0,
    repeated: 0,
    masterySum: 0,
    masteryN: 0,
    score: 0,
    risk: 0,
    hasData: false,
    subs: {}
  }
}

function ensureSub(plate, sub, type) {
  const s = plate.subs[sub] || (plate.subs[sub] = { sub, wrongs: 0, asks: 0, reviewed: 0, due: 0, repeated: 0, masterySum: 0, masteryN: 0, types: {} })
  const t = type || '未分类'
  s.types[t] = s.types[t] || { type: t, wrongs: 0, asks: 0, reviewed: 0, due: 0, repeated: 0 }
  return { s, t: s.types[t] }
}

function normalizeGroup(value) {
  const raw = String(value || '').trim()
  if (!raw) return UNCLASSIFIED
  return groupOfName(raw) || (GROUPS.includes(raw) ? raw : UNCLASSIFIED)
}

function ensurePlate(plates, group) {
  const key = normalizeGroup(group)
  return plates[key] || (plates[key] = blankPlate(key))
}

export function weakPlates(wqs, top = 2) {
  const map = {}
  for (const q of wqs || []) {
    const group = taxonOf(q).group || '未分类'
    map[group] = (map[group] || 0) + 1
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, top).map(([plate, n]) => ({ plate, n }))
}

export function wrongTotal(wqs) { return Array.isArray(wqs) ? wqs.length : 0 }

export function profileLine(wqs, top = 2) {
  const weak = weakPlates(wqs, top)
  const total = wrongTotal(wqs)
  const parts = []
  if (total) parts.push('累计错题 ' + total + ' 道')
  if (weak.length) parts.push('薄弱板块：' + weak.map((x) => x.plate + '(错' + x.n + ')').join('、'))
  return parts.length ? parts.join('；') : ''
}

function recommendation(id, icon, title, desc, priority, action) {
  return { id, icon, title, desc, priority, action }
}

export function buildPetDashboard(input = {}) {
  const now = Number(input.now) || Date.now()
  const msgs = Array.isArray(input.msgs) ? input.msgs : []
  const wqs = Array.isArray(input.wqs) ? input.wqs : []
  const userMsgs = msgs.filter((m) => m && m.role === 'user')
  const today = dayKey(now)
  const plates = {}
  GROUPS.forEach((g) => { plates[g] = blankPlate(g) })

  let todayAsks = 0
  const activityMap = {}
  for (let i = 6; i >= 0; i--) activityMap[daysAgo(now, i)] = { date: daysAgo(now, i), asks: 0, wrongs: 0, reviews: 0 }

  for (const m of userMsgs) {
    const text = msgText(m)
    if (!text) continue
    const group = normalizeGroup(detectBanKuai(text))
    const key = dayKey(msgTs(m, now))
    if (key === today) todayAsks++
    if (activityMap[key]) activityMap[key].asks++
    const plate = ensurePlate(plates, group)
    plate.hasData = true
    plate.asks++
    if (group !== UNCLASSIFIED) {
      const tax = taxonOf({ subject: group, question: text })
      const { s, t } = ensureSub(plate, tax.sub || UNCLASSIFIED, tax.type || UNCLASSIFIED)
      s.asks++
      t.asks++
    }
  }

  let unreviewed = 0
  let due = 0
  let repeated = 0
  let todayReviews = 0
  for (const q of wqs) {
    const tax = taxonOf(q)
    const plate = ensurePlate(plates, tax.group)
    plate.hasData = true
    const sub = tax.sub || '未分类'
    const type = tax.type || '未分类'
    const { s, t } = ensureSub(plate, sub, type)
    const isDue = !!(q.digested && q.dueAt && Number(q.dueAt) <= now)
    const repeatedN = Number((q.reviewStats && q.reviewStats.e) || 0)
    const mastery = Number(q.mastery) || 50
    const createdAt = msgTs({ ts: q.createdAt || q.at || q.time || q.t }, now)
    plate.wrongs++
    plate.masterySum += mastery
    plate.masteryN++
    s.wrongs++
    s.masterySum += mastery
    s.masteryN++
    t.wrongs++
    if (q.reviewed) { plate.reviewed++; s.reviewed++; t.reviewed++ }
    if (q.digested) plate.digested++
    if (isDue) { plate.due++; s.due++; t.due++; due++ }
    if (repeatedN > 0) { plate.repeated += repeatedN; s.repeated += repeatedN; t.repeated += repeatedN; repeated += repeatedN }
    if (!q.reviewed) unreviewed++
    const reviewAt = q.reviewedAt || q.lastRedoAt
    const rk = dayKey(reviewAt)
    if (rk === today && q.reviewed) todayReviews++
    if (activityMap[rk]) {
      activityMap[rk].reviews += reviewAt && dayKey(reviewAt) === rk ? 1 : 0
    }
    const ck = dayKey(createdAt)
    if (activityMap[ck]) activityMap[ck].wrongs++
  }

  const rows = []
  const orderedGroups = GROUPS.concat(Object.keys(plates).filter((g) => !GROUPS.includes(g)))
  for (const group of orderedGroups) {
    const p = plates[group] || blankPlate(group)
    p.mastery = p.masteryN ? Math.round(p.masterySum / p.masteryN) : 0
    p.score = p.hasData ? Math.max(0, Math.min(100, Math.round(
      (p.mastery || 50) * 0.45 + Math.max(0, 100 - p.wrongs * 7) * 0.35 + Math.max(0, 100 - p.repeated * 12) * 0.2
    ))) : 0
    p.risk = p.hasData ? Math.round(p.wrongs * 4 + p.due * 5 + p.repeated * 8 + p.asks * 0.6 + (100 - p.score) * 0.5) : 0
    p.subs = Object.values(p.subs).map((s) => ({
      ...s,
      mastery: s.masteryN ? Math.round(s.masterySum / s.masteryN) : 0,
      types: Object.values(s.types).sort((a, b) => (b.wrongs + b.repeated * 2) - (a.wrongs + a.repeated * 2))
    })).sort((a, b) => (b.wrongs + b.due * 2 + b.repeated * 3) - (a.wrongs + a.due * 2 + a.repeated * 3))
    rows.push(p)
  }

  const activeRows = rows.filter((p) => p.wrongs || p.asks)
  const weak = activeRows.length ? [...activeRows].sort((a, b) => b.risk - a.risk)[0] : null
  const strong = activeRows.length ? [...activeRows].sort((a, b) => b.score - a.score || a.wrongs - b.wrongs)[0] : null
  const focusSub = weak && weak.subs.length ? weak.subs[0] : null
  const focusType = focusSub && focusSub.types.length ? focusSub.types[0] : null
  const activity7 = Object.values(activityMap)
  const totalActivity = userMsgs.length + wqs.length * 2
  const streak = Math.max(0, Number(input.streak) || 0)
  const todayCheckin = !!input.todayChecked
  const todayNotes = Number(input.todayNotes) || 0
  const todayWrongs = activity7.length ? activity7[activity7.length - 1].wrongs : 0
  const digestRate = wqs.length ? Math.round((wqs.filter((q) => q.digested).length / wqs.length) * 100) : 0

  const recommendations = []
  if (!userMsgs.length && !wqs.length) {
    recommendations.push(recommendation('start', '🌱', '先完成第一轮摸底', '先向对话提 3 道题，再存 1 道错题，我就能开始建立你的个人学习画像。', 100, { type: 'tab', target: 'chat', prompt: '请给我安排第一轮行测摸底，先问3道覆盖不同板块的题。' }))
  }
  if (due > 0) {
    recommendations.push(recommendation('due', '🔔', '先清掉到期错题', '有 ' + due + ' 道错题已经到复习时间，先回访能阻止旧错重新固化。', 95, { type: 'tab', target: 'wq', prompt: '带我先复习今天到期的错题，并按最容易复错的顺序排。' }))
  }
  if (unreviewed > 0) {
    recommendations.push(recommendation('review', '📋', '补一组错题复盘', '还有 ' + unreviewed + ' 道错题未复盘；先做 3 道，避免错题集只囤不消化。', 88, { type: 'tab', target: 'wq', prompt: '从我的错题里挑3道最值得先复盘的，陪我逐步完成复盘。' }))
  }
  if (weak) {
    recommendations.push(recommendation('weak', '🎯', '主攻 ' + weak.label, '当前风险最高：错 ' + weak.wrongs + ' 道、复错 ' + weak.repeated + ' 次、到期 ' + weak.due + ' 道。建议今天给它 20 分钟。', 82, { type: 'tab', target: 'chat', prompt: '根据我的' + weak.label + '数据，分析我最容易错的具体细分和题型，并给我一组20分钟专项训练。' }))
  }
  if (focusType) {
    recommendations.push(recommendation('focus-type', '🧩', '精准处理「' + focusType.type + '」', '在 ' + weak.label + ' / ' + focusSub.sub + ' 中，这是目前错误最集中的题型：错 ' + focusType.wrongs + ' 道、复错 ' + focusType.repeated + ' 次。先用一道同类题把判断流程说清楚。', 86, { type: 'tab', target: 'chat', prompt: '围绕「' + weak.label + '/' + focusSub.sub + '/' + focusType.type + '」给我做一次精准诊断：先出1道同类题，再按我的作答指出判断流程断在哪。' }))
  }
  if (repeated > 0) {
    recommendations.push(recommendation('repeat', '🧬', '处理重复错误', '你目前累计复错 ' + repeated + ' 次，说明不是不会，而是判断习惯没有固定。下一轮先做原因对比。', 78, { type: 'tab', target: 'wq', prompt: '筛出我复错最多的错题，带我做原因对比，找出反复出现的判断习惯。' }))
  }
  if (userMsgs.length >= 6 && activeRows.length < 3) {
    recommendations.push(recommendation('coverage', '🧭', '补齐板块覆盖', '目前学习数据只覆盖 ' + activeRows.length + ' 个板块，容易形成局部熟练、整体失分。建议用一组混合题补一次全科摸底。', 72, { type: 'tab', target: 'chat', prompt: '根据我目前覆盖不足的板块，给我一组覆盖言语、判断、资料、数量的混合摸底题，并说明每组题要观察什么。' }))
  }
  if (!recommendations.length) {
    recommendations.push(recommendation('keep', '✨', '保持当前节奏', '当前数据没有明显积压，建议做一组混合题保持手感，并用间隔复习守住已掌握内容。', 60, { type: 'tab', target: 'chat', prompt: '根据我的当前数据，给我一组混合巩固题并说明为什么这样搭配。' }))
  }

  const missions = [
    { id: 'ask', label: '完成 1 次有效提问', done: todayAsks > 0, action: { type: 'tab', target: 'chat' } },
    { id: 'wrong', label: '复盘 1 道错题', done: todayReviews > 0, action: { type: 'tab', target: 'wq' } },
    { id: 'note', label: '沉淀 1 条笔记', done: todayNotes > 0, action: { type: 'tab', target: 'ths' } },
    { id: 'checkin', label: '完成今日打卡', done: todayCheckin, action: { type: 'tab', target: 'ck' } }
  ]
  const missionDone = missions.filter((x) => x.done).length
  const achievements = [
    { id: 'first', icon: '🌱', label: '完成第一问', done: userMsgs.length > 0 },
    { id: 'ask20', icon: '💬', label: '累计提问 20 次', done: userMsgs.length >= 20 },
    { id: 'streak3', icon: '🔥', label: '连续学习 3 天', done: streak >= 3 },
    { id: 'breadth3', icon: '🧭', label: '覆盖 3 个板块', done: activeRows.length >= 3 },
    { id: 'review10', icon: '🧠', label: '复盘 10 道题', done: wqs.filter((q) => q.reviewed).length >= 10 },
    { id: 'digest50', icon: '✅', label: '错题消化率 50%', done: digestRate >= 50 },
    { id: 'checkin7', icon: '📅', label: '连续打卡 7 天', done: streak >= 7 }
  ]
  const hour = new Date(now).getHours()
  const greeting = hour < 6 ? '夜深了，做一道就收工' : hour < 11 ? '早上好，先拿下今天第一题' : hour < 14 ? '午间轻练，保持手感' : hour < 18 ? '下午专注，拆掉一个薄弱点' : hour < 22 ? '晚上好，把今天错题收干净' : '今天辛苦了，做一个轻复盘'

  return {
    greeting,
    summary: weak ? '已覆盖 ' + activeRows.length + ' 个板块，先处理 ' + weak.label + (focusType ? '·' + focusType.type : '') : '我还在等你的第一组学习数据',
    overall: {
      asks: userMsgs.length,
      answers: msgs.filter((m) => m && m.role === 'assistant').length,
      todayAsks,
      wrongs: wqs.length,
      unreviewed,
      reviewed: wqs.filter((q) => q.reviewed).length,
      digested: wqs.filter((q) => q.digested).length,
      due,
      repeated,
      streak,
      digestRate,
      todayReviews,
      todayWrongs,
      totalActivity,
      coverage: activeRows.length
    },
    plates: rows,
    activePlates: activeRows,
    weak,
    strong,
    focusSub,
    focusType,
    activity7,
    missions,
    missionDone,
    achievements,
    recommendations: recommendations.sort((a, b) => b.priority - a.priority),
    recentInsights: [
      activeRows.length ? '最近 7 天：提问 ' + activity7.reduce((n, d) => n + d.asks, 0) + ' 次，新增错题 ' + activity7.reduce((n, d) => n + d.wrongs, 0) + ' 道，复盘 ' + activity7.reduce((n, d) => n + d.reviews, 0) + ' 道。' : '最近 7 天还没有形成学习轨迹。',
      weak && strong && weak.group !== strong.group ? '风险最高板块：' + weak.label + '；相对稳定板块：' + strong.label + '。' : '',
      focusType ? '最集中的题型：' + weak.label + ' / ' + focusSub.sub + ' / ' + focusType.type + '。' : '',
      digestRate ? '错题消化率 ' + digestRate + '%' + (repeated ? '，仍有 ' + repeated + ' 次复错需要根治。' : '。') : ''
    ].filter(Boolean)
  }
}

export default { weakPlates, wrongTotal, profileLine, buildPetDashboard }
