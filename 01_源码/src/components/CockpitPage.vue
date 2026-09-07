<script setup>
import { ref, computed, onMounted } from 'vue'
import { store, saveCfg, getActiveExam, setActiveExam } from '../store'
import { readAttempts } from '../utils/attemptLog' // R3 掌握度接作答证据
import { loadSrs, dueMemoryItems, ymdKey } from '../utils/memorySrs' // R 中枢角标
import { todayProgress, planStatus, weekMini, DEFAULT_PLAN, morningDoneToday } from '../utils/dailyPlan' // 189 今日目标
import { detectBanKuai, PLATE_MODE } from '../api'
import { showToast } from '../utils/toast'
import { safeGet, KEYS } from '../utils/storage'
import { masteryOfPlate } from '../utils/mastery'
import { reviewHealth } from '../utils/reviewHealth' // 复盘健康分（深化）
import { mergeWeakTasks } from '../utils/weakTask' // 补弱任务（深化）
import { todaySeconds, totalSeconds, fmtMin, studyTick, studyMap } from '../utils/study'

// 今日练习：统计今天(按日期)的 user 提问数（chat 记录无 time，用日期近似——用 store 计数即可，标注"累计"更稳）
const ck = computed(() => {
  const q = store.msgs.filter((m) => m.role === 'user').length
  const w = store.wqs.length
  const r = store.wqs.filter((x) => x.reviewed).length
  return { q, w, r, revRate: w ? Math.round((r / w) * 100) : 0 }
})
// 复盘健康分（深化）：复错率/到期/消化/复盘率 → 看板小结
const health = computed(() => {
  try { return reviewHealth(store.wqs) } catch (e) { return { score: 0, grade: '—', t: 0, tips: [], reviewedRate: 0, digestRate: 0, overdue: 0, repRate: null } }
})
// 当前激活考试（多考试倒计时：看板只针对当前激活的那场考试）
const activeExam = computed(() => getActiveExam())
const examLabel = computed(() => (activeExam.value && activeExam.value.name) || (store.cfg && store.cfg.examName) || '国考') // 冲刺节点标题随考试名
const activeDate = computed(() => (activeExam.value && activeExam.value.date) || store.cfg.examDate || '2026-11-29')
// 备考倒计时
const daysLeft = computed(() => {
  try {
    const d = activeDate.value ? new Date(activeDate.value) : null
    if (!d || isNaN(d)) return null
    return Math.max(0, Math.ceil((d - Date.now()) / 86400000))
  } catch (e) {
    return null
  }
})
const examDateFmt = computed(() => {
  try {
    const d = new Date(activeDate.value || 0)
    if (isNaN(d)) return ''
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日'
  } catch (e) {
    return ''
  }
})
// 某考试剩余天数（用于切换 chips 角标）
function daysLeftOf(dateStr) {
  try {
    const d = dateStr ? new Date(dateStr) : null
    if (!d || isNaN(d)) return null
    return Math.max(0, Math.ceil((d - Date.now()) / 86400000))
  } catch (e) { return null }
}
// 板块分布
const banKuai = computed(() => {
  const m = {}
  store.msgs.forEach((x) => {
    if (x.role !== 'user') return
    const t = String((x.content && x.content.text) || x.content || '')
    if (!t) return
    const bk = detectBanKuai(t) || '综合'
    m[bk] = m[bk] + 1 || 1
  })
  const arr = Object.entries(m).sort((a, b) => b[1] - a[1])
  const max = Math.max(1, ...arr.map((x) => x[1]))
  return { arr, max }
})
// 最弱板块（提问最少但存在）提示策略
const weakest = computed(() => {
  const a = banKuai.value.arr
  return a.length ? a[a.length - 1] : null
})
function goto(t) {
  store.tab = t
}
// 考试节点：按设置的笔试日期自动推算（报名/缴费为常见周期估算，以官方公告为准）
const nodeAt = (offsetDays) => {
  try {
    const d = activeDate.value ? new Date(activeDate.value) : null
    if (!d || isNaN(d)) return null
    const x = new Date(d)
    x.setDate(x.getDate() + offsetDays)
    return (x.getMonth() + 1) + '月' + x.getDate() + '日'
  } catch (e) { return null }
}
const nodes = computed(() => {
  const ex = nodeAt(0)
  return [
    { t: '报名（约）', d: nodeAt(-60) || '待定', i: '✍️' },
    { t: '缴费（约）', d: nodeAt(-45) || '待定', i: '💳' },
    { t: '考前冲刺', d: nodeAt(-30) || '—', i: '🚀' },
    { t: '打印准考证', d: nodeAt(-7) || '考前一周', i: '🎫' },
    { t: '📝笔试日', d: ex || activeDate.value || '待定', i: '⏰', hot: true }
  ]
})
// 冲刺倒推计划：按剩余天数给每日刷题/复盘/套卷建议
const plan = computed(() => {
  const d = daysLeft.value
  if (d == null) return null
  if (d > 90) return { q: '20 题', r: '5 道', w: '1 套', note: '基础期：按板块专项刷题，错题当天复盘消化' }
  if (d > 45) return { q: '30 题', r: '8 道', w: '2 套', note: '强化期：主攻薄弱板块，每周 2 套真题限时' }
  if (d > 15) return { q: '40 题', r: '10 道', w: '3 套', note: '冲刺期：整卷为主，错题集二刷三刷' }
  return { q: '1 套真题', r: '全部错题', w: '7 套', note: '最后冲刺：每天 1 套真题保手感，错题全部复盘' }
})
// ===== 今日任务打卡 =====
const todayKey = () => {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
const tasks = ref([])
const streak = ref(0)
let streakLast = ''
const customTask = ref('')
const yesterdayLeft = ref(0)
const STREAK_MEDALS = [[7, '🥉 青铜'], [14, '🥈 白银'], [21, '🥇 黄金'], [30, '💎 钻石']]
function streakMedal() {
  let m = ''
  for (const [n, name] of STREAK_MEDALS) if (streak.value >= n) m = name
  return m
}
function addTask() {
  const t = String(customTask.value || '').trim()
  if (!t) return
  tasks.value.push({ k: 'c' + Date.now(), label: t, done: false, custom: true })
  customTask.value = ''
  saveTasks()
}
function delTask(i) {
  tasks.value.splice(i, 1)
  saveTasks()
}
function loadTasks() {
  try {
    const s = JSON.parse(localStorage.getItem('xc_streak') || '{"n":0,"d":""}')
    streak.value = s.n || 0
    streakLast.value = s.d || ''
  } catch (e) {}
  try {
    const t = JSON.parse(localStorage.getItem('xc_tasks') || 'null')
    if (t && t.date === todayKey() && Array.isArray(t.items)) {
      tasks.value = t.items
    } else {
      if (t && t.date !== todayKey() && Array.isArray(t.items)) {
        const undone = t.items.filter((x) => !x.done).length
        if (undone > 0) yesterdayLeft.value = undone
      }
      genTasks()
    }
  } catch (e) {
    genTasks()
  }
  mergeWeak()
}
// 补弱任务（深化）：同一题型累计答错>=3 的错题 → 自动 upsert 进今日任务；由错题二刷答错触发 xc-task-change 后刷新
function mergeWeak() {
  try {
    const r = mergeWeakTasks(tasks.value, store.wqs, { wrongTypeOf: (q) => {
      if (q && q.sub) return String(q.sub)
      const plate = String((q && (q.subject || q.plate)) || '')
      if (plate === '言语理解') return '片段阅读'
      return plate || '未分类'
    } })
    tasks.value = r.tasks
    if (r.changed) saveTasks()
  } catch (e) {}
}
function trainWeak() {
  if (!weakest.value) return
  store.mode = PLATE_MODE[weakest.value[0]] || store.mode
  goto('chat')
}
function weakPlate() {
  const cnt = {}
  store.wqs.forEach((q) => {
    const k = q.subject || '未分类'
    cnt[k] = (cnt[k] || 0) + 1
  })
  let best = null
  for (const k in cnt) if (!best || cnt[k] > best.n) best = { k, n: cnt[k] }
  return best ? best.k : null
}
function genTasks() {
  const wp = weakPlate()
  const pending = store.wqs.filter((q) => !q.digested).length
  // 批次8·目标分拆解联动：找出"还差最多分"的板块 → 生成专项补强任务（建议题量按缺口 x2 封顶 10）
  const goal = store.cfg.goalScore || 70
  const gb = cpMastery.value.items
    .filter((x) => x.v != null)
    .map((x) => {
      const need = Math.round(((goal * x.weight) / 100) * 10) / 10
      const cur = Math.round(((x.v * x.weight) / 100) * 10) / 10
      return { label: x.label, gap: Math.max(0, Math.round((need - cur) * 10) / 10) }
    })
    .sort((a, b) => b.gap - a.gap)[0]
  const goalTasks = gb && gb.gap > 0
    ? [{ k: 'goal', label: '专项补强【' + gb.label + '】（还差 ' + gb.gap + ' 分）· 刷 ' + Math.min(10, 2 + Math.ceil(gb.gap * 2)) + ' 题（对话页）', done: false }]
    : []
  tasks.value = [
    { k: 'practice', label: wp ? '刷 5 道「' + wp + '」并开考场计时（对话页）' : '刷 5 道题并开考场计时（对话页）', done: false },
    { k: 'redo', label: '复盘/二刷 ' + Math.min(3, pending || 1) + ' 道错题（错题页）', done: false },
    { k: 'accum', label: '积累 2 条常识/时政（积累页）', done: false },
    ...goalTasks
  ]
  saveTasks()
}
function saveTasks() {
  try {
    localStorage.setItem('xc_tasks', JSON.stringify({ date: todayKey(), items: tasks.value }))
  } catch (e) {}
}
function toggleTask(i) {
  if (!Array.isArray(tasks.value) || !tasks.value[i]) return
  tasks.value[i].done = !tasks.value[i].done
  saveTasks()
  const all = tasks.value.length && tasks.value.every((t) => t.done)
  if (all && streakLast.value !== todayKey()) {
    streak.value++
    streakLast.value = todayKey()
    try {
      localStorage.setItem('xc_streak', JSON.stringify({ n: streak.value, d: streakLast.value }))
    } catch (e) {}
    const md = streakMedal()
    showToast('🎉 今日任务全部完成，连续打卡 ' + streak.value + ' 天' + (md ? '，达成 ' + md + '！' : '！'), 'success')
  }
  window.dispatchEvent(new CustomEvent('xc-task-change'))
}
function goTask(t) {
  if (t.k === 'practice') {
    // 批次6-6A 竞态修复：先写 pendingAsk，目标页 onMounted 立即消费（不依赖 setTimeout 赌时序）
    store.pendingAsk = '请出一道' + (weakPlate() || '判断推理') + '仿真题，并输出选项和【正确答案】'
    store.tab = 'chat'
  } else if (t.k === 'redo') {
    store.tab = 'wq'
  } else if (t.weak) {
    // 补弱任务（深化）：直接去对话页出同题型题
    store.pendingAsk = '请给我出一道【' + (t.type || '') + '】' + (t.plate || '') + '题练手，先别给答案'
    store.tab = 'chat'
  } else {
    store.tab = 'ths'
    showToast('💡 积累页已打开：选 常识/时政/成语/实词 → 看一条 → 点「记住了」按艾宾浩斯排期复习', 'info')
  }
}
// 学习时长（studyTick 心跳驱动刷新）
const todayMin = computed(() => { studyTick.value; return fmtMin(todaySeconds()) })
const totalMin = computed(() => { studyTick.value; return fmtMin(totalSeconds()) })
// 看板欢迎词（局长风·随机/按时段）
const WELCOME = [
  '局长！欢迎来学习！争取早日上岸！！！',
  '局长，今日宜刷题、宜复盘、宜上岸！',
  '局长加油！上岸局长就是你！',
  '别急，慢慢来，局长终会上岸！',
  '上岸之路，局长稳步前行！'
]
const welcome = ref('')
// ===== 掌握度概览（看板 · 六大板块 + 目标分评估） =====
const CP_PLATES = [
  { key: '判断推理', label: '逻辑判断与推理', weight: 30, subs: ['判断推理', '逻辑判断与推理', '图形推理', '定义判断', '类比推理', '逻辑判断'] },
  { key: '言语理解', label: '言语理解与表达', weight: 30, subs: ['言语理解', '言语理解与表达', '片段阅读', '篇章阅读'] },
  { key: '资料分析', label: '资料分析', weight: 20, subs: ['资料分析'] },
  { key: '数量关系', label: '数量关系', weight: 8, subs: ['数量关系'] },
  { key: '常识判断', label: '常识判断', weight: 7, subs: ['常识判断'] },
  { key: '政治理论', label: '政治理论', weight: 5, subs: ['政治理论'] }
]
const cpCol = ref([])
cpCol.value = safeGet(KEYS.QUIZ_COL, [])
const srsTick = ref(0)
window.addEventListener('xc-srs', () => { srsTick.value++ })
const hubCnt = computed(() => {
  srsTick.value
  let n = 0
  try { n += store.wqs.filter((q) => q.digested && q.dueAt && q.dueAt <= Date.now()).length } catch (e) {}
  try { n += dueMemoryItems(loadSrs(), ymdKey()).length } catch (e) {}
  return n
})
function openHub() { window.dispatchEvent(new CustomEvent('xc-open-hub')) }
const planCfg = computed(() => Object.assign({}, DEFAULT_PLAN, (store.cfg && store.cfg.dailyPlan) || {}))
const tp = computed(() => { try { return todayProgress({ attempts: readAttempts(), wqs: store.wqs, study: studyMap() }) } catch (e) { return { q: 0, rev: 0, minutes: 0, due: 0 } } })
const ps = computed(() => planStatus(planCfg.value, tp.value))
const morningTick = ref(0)
window.addEventListener('xc-morning', () => { morningTick.value++ })
const morningOk = computed(() => { morningTick.value; try { return morningDoneToday() } catch (e) { return false } })
const week = computed(() => { try { return weekMini({ attempts: readAttempts(), wqs: store.wqs, study: studyMap() }) } catch (e) { return [] } })
const weekMax = computed(() => Math.max(1, ...week.value.map((d) => d.total)))
function setPlanGoal(k, v) {
  const c = Object.assign({}, planCfg.value)
  c[k] = Math.max(0, parseInt(v, 10) || 0)
  try { store.cfg = Object.assign({}, store.cfg || {}, { dailyPlan: c }); saveCfg(store.cfg) } catch (e) {}
}
function goQuizAsk() { store.tab = 'chat'; store.pendingAsk = '请给我出一道' + (weakPlate() || '判断推理') + '单选题练手' }
function goWrongs() { store.tab = 'wq' }
const cpMastery = computed(() => {
  const items = CP_PLATES.map((p) => {
    const col = cpCol.value.filter((x) => p.subs.includes(x.subject))
    let done = 0, ok = 0
    col.forEach((x) => { (x.history || []).forEach((h) => { done++; if (h.ok) ok++ }) })
    const wq = store.wqs.filter((q) => p.subs.includes(q.subject))
    const rev = wq.filter((q) => q.reviewed || q.digested).length
    const attempts = done + wq.length
    const rate = done ? Math.round((ok / done) * 100) : null
    // 批次6-6A 掌握度收编：统一走 mastery.js（与统计雷达/CosmosScene 同口径）；无数据保持 null（看板显示"—"）
    let v = null
    if (attempts > 0) v = masteryOfPlate(p.key, store.wqs, { plates: p.subs, attempts: readAttempts() })
    // 近 7 天活跃
    let active = false
    col.forEach((x) => { if (x.at && Date.now() - x.at < 7 * 86400000) active = true })
    wq.forEach((q) => { if (q.at && Date.now() - q.at < 7 * 86400000) active = true })
    // 智能建议
    let advice = '暂无数据，去「单题快练」做几道题生成评估 ✍️'
    if (attempts > 0) {
      if (v >= 85) advice = '掌握扎实，可挑战更高难度的综合题 💪'
      else if (v >= 70) advice = '基础不错，建议针对薄弱点做专项巩固 👍'
      else if (v >= 45) advice = '还需加强，建议专项刷题 + 及时复盘错题 📈'
      else advice = '这块偏弱，优先专项突破：每天 5 题 + 错题复盘 🎯'
    }
    return { ...p, v, attempts, rate, wrong: wq.length, rev, active, advice }
  })
  const has = items.filter((x) => x.v != null)
  const totalW = has.reduce((a, x) => a + x.weight, 0)
  const cur = totalW ? Math.round(has.reduce((a, x) => a + x.v * x.weight, 0) / totalW) : null
  const goal = store.cfg.goalScore || 70
  const pct = cur != null && goal ? Math.round(Math.min(100, (cur / goal) * 100)) : 0
  return { items, cur, goal, pct }
})
function initWelcome() {
  const h = new Date().getHours()
  let base = '局长！欢迎来学习！争取早日上岸！！！'
  if (h >= 5 && h < 9) base = '局长早安！一日之计在于晨，开卷！'
  else if (h >= 12 && h < 14) base = '局长午安！小憩片刻，下午继续冲！'
  else if (h >= 21) base = '局长晚上好！今天也辛苦了，复盘一下再睡～'
  welcome.value = Math.random() < 0.5 ? base : WELCOME[Math.floor(Math.random() * WELCOME.length)]
}
// ===== 掌握度深度交互：板块展开详情 + 去练习/看错题 =====
const expandedKey = ref(null)
function toggleExpanded(key) {
  expandedKey.value = expandedKey.value === key ? null : key
}
function trainPlate(key) {
  store.mode = PLATE_MODE[key] || store.mode
  goto('chat')
  showToast('🎯 已切换到「' + key + '」专项，去对话页出题练习', 'info')
}
function seeWrong(key) {
  goto('wq')
  showToast('📋 已打开错题本' + (key ? '（' + key + '）' : '') + '，优先复盘', 'info')
}
// ===== 励志语录（数据感知：打卡/倒计时越久越激励） =====
const QUOTES = [
  '稳住，我们能赢！上岸是一场持久战，也是耐力战。',
  '今天多刷一题，考场上就多一分从容。',
  '错题是最好的老师：看懂一道错题，胜过盲刷十题。',
  '不必每分钟都学习，但学习的每一分钟都要算数。',
  '行测高分没有捷径，只有日拱一卒的积累。',
  '自律的尽头，是你要去的远方。',
  '每一道做对的题，都在为你铺上岸的路。',
  '别怕慢，只怕站。今天的坚持，是明天的底气。',
  '把每一次练习都当成考场，把考场当成一次练习。',
  '你的对手不是别人，是昨天的自己。',
  '刷题的意义，是把不确定性变成确定性。',
  '累了就休息，但别放弃——终点就在前方。'
]
const quote = ref('')
function pickQuote() {
  const pool = QUOTES.slice()
  const d = daysLeft.value
  const st = streak.value
  if (st >= 21) pool.unshift('🏆 已连续打卡 ' + st + ' 天！你已是「自律局长」，稳住就能赢！')
  else if (st >= 7) pool.unshift('🔥 已连续打卡 ' + st + ' 天，坚持就是胜利！上岸只是时间问题。')
  if (d != null && d <= 15) pool.unshift('⏰ 距笔试仅 ' + d + ' 天！最后冲刺，全力以赴，不留遗憾！')
  else if (d != null && d <= 45) pool.unshift('🚀 距笔试 ' + d + ' 天，强化冲刺期：主攻薄弱、每周套卷限时！')
  let q = pool[Math.floor(Math.random() * pool.length)]
  if (q === quote.value) q = pool[(Math.random() * pool.length) | 0]
  quote.value = q || ''
}
function nextQuote() {
  pickQuote()
}
onMounted(() => { loadTasks(); initWelcome(); pickQuote() })

</script>
<template>
  <div class="page on">
    <div class="page-inner cock">
      <div style="margin: 2px 0 8px"><button class="btn btn-gh" style="padding: 5px 12px" @click="openHub()">🗓️ 今日复习中枢 <b v-if="hubCnt" style="color:#fb7185">{{ hubCnt }}</b></button></div>
  <div class="ck-head">
        <div class="ck-title">🚀 学习驾驶舱</div>
        <div v-if="daysLeft != null" class="ck-sub">
          距 <b class="ck-exam-name" :style="{ color: activeExam ? activeExam.color : '' }">【{{ activeExam ? activeExam.name : '考试' }}】</b> 笔试还有
          <b>{{ daysLeft }}</b>
          天（{{ examDateFmt }}）
        </div>
        <div v-else class="ck-sub">在 设置 → 考试管理 里配置笔试日期可显示倒计时</div>
      </div>
      <!-- 今日目标（189）：复习到期/做题/复盘/时长 + 本周完成迷你柱 -->
  <div class="ck-plan" style="margin:10px 0 4px;border-radius:12px;padding:10px 12px">
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <b>🎯 今日目标</b>
      <span v-if="ps.allDone" style="color:#34d399;font-size:12px">✅ 已达成</span>
      <span :style="{ color: morningOk ? '#34d399' : 'var(--text3)', fontSize: '12px' }">🌅 晨练{{ morningOk ? ' ✅' : ' 未做' }}</span>
      <span style="flex:1"></span>
      <span style="font-size:12px;color:var(--text3)">进度 {{ ps.pct }}%</span>
    </div>
    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:6px;align-items:center">
      <span style="font-size:12px">复习到期 <b style="color:#fb7185">{{ tp.due }}</b></span>
      <span style="font-size:12px">做题 <b>{{ tp.q }}/{{ planCfg.quiz }}</b> <input type="number" min="0" style="width:46px;color:var(--text);background:var(--bg3,rgba(127,127,127,.12))" :value="planCfg.quiz" @change="setPlanGoal('quiz', $event.target.value)" /></span>
      <span style="font-size:12px">复盘 <b>{{ tp.rev }}/{{ planCfg.review }}</b> <input type="number" min="0" style="width:46px;color:var(--text);background:var(--bg3,rgba(127,127,127,.12))" :value="planCfg.review" @change="setPlanGoal('review', $event.target.value)" /></span>
      <span style="font-size:12px">时长分 <b>{{ tp.minutes }}/{{ planCfg.minutes }}</b> <input type="number" min="0" style="width:46px;color:var(--text);background:var(--bg3,rgba(127,127,127,.12))" :value="planCfg.minutes" @change="setPlanGoal('minutes', $event.target.value)" /></span>
    </div>
    <div style="height:6px;border-radius:4px;background:rgba(127,127,127,.15);margin-top:8px;overflow:hidden"><i :style="{ display:'block', height:'6px', width: ps.pct + '%', background:'linear-gradient(90deg,#34d399,#fbbf24)' }"></i></div>
    <div style="display:flex;gap:6px;margin-top:8px;align-items:flex-end">
      <span style="font-size:11px;color:var(--text3);margin-right:6px">本周</span>
      <span v-for="(d, i) in week" :key="d.key" style="display:flex;flex-direction:column;align-items:center;gap:2px" :title="d.key + ' 做题' + d.q + ' · 复盘' + d.r + ' · ' + d.min + '分'">
        <i :style="{ display:'block', width:'10px', height: Math.max(2, Math.round(d.total / weekMax * 22)) + 'px', background:'var(--accent2,#22d3ee)', borderRadius:'2px', opacity:.85 }"></i>
        <em style="font-style:normal;font-size:10px;color:var(--text3)">{{ d.label }}</em>
      </span>
    </div>
    <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
      <button class="btn btn-gh" style="padding:2px 10px;font-size:12px" @click="openHub()">🗓️ 复习中枢</button>
      <button class="btn btn-gh" style="padding:2px 10px;font-size:12px" @click="goQuizAsk()">⚡ 单题快练</button>
      <button class="btn btn-gh" style="padding:2px 10px;font-size:12px" @click="goWrongs()">📋 错题</button>
    </div>
  </div>
  <!-- 考试切换 chips：各自独立倒计时 -->
      <div class="ck-exams">
        <button
          v-for="ex in (store.cfg.exams || [])" :key="ex.id"
          class="ck-exam-chip" :class="{ on: activeExam && ex.id === activeExam.id }"
          :style="ex.id === (activeExam && activeExam.id) ? { borderColor: ex.color, color: ex.color } : {}"
          @click="setActiveExam(ex.id)"
        >
          <span class="ck-chip-dot" :style="{ background: ex.color }"></span>
          {{ ex.name }}
          <span class="ck-chip-d">{{ daysLeftOf(ex.date) }}天</span>
        </button>
      </div>

      <!-- 今日任务打卡 -->
      <!-- 欢迎横幅 -->
      <div class="ck-welcome">
        <span class="cw-badge">🧧</span>
        <div>
          <div class="cw-title">{{ welcome }}</div>
          <div class="cw-sub">今日任务 · 倒计时 · 板块分布，助你高效上岸</div>
        </div>
      </div>
      <!-- 掌握度概览 -->
      <div class="ck-mastery">
        <div class="ckm-hd">
          <span>📊 掌握度概览</span>
          <span v-if="cpMastery.cur != null" class="ckm-score" :class="cpMastery.cur >= cpMastery.goal ? 'ok' : 'no'">{{ cpMastery.cur }}/{{ cpMastery.goal }}<small> 分（目标）</small></span>
          <span v-else class="ckm-score none">开始做题生成评估</span>
        </div>
        <div v-if="cpMastery.cur != null" class="ckm-gbar"><i :style="{ width: cpMastery.pct + '%' }"></i></div>
        <div v-if="cpMastery.cur != null" class="ckm-gsub">{{ cpMastery.cur >= cpMastery.goal ? '🎉 已达目标分' : '还差 ' + (cpMastery.goal - cpMastery.cur) + ' 分达标 · 达成 ' + cpMastery.pct + '%' }}</div>
        <div class="ckm-bars">
          <div v-for="p in cpMastery.items" :key="p.key" class="ckm-row">
            <div class="ckm-bar" :class="{ open: expandedKey === p.key, nodata: p.v == null }" @click="toggleExpanded(p.key)">
              <span class="ckm-l">{{ p.label }}</span>
              <span class="ckm-t"><i :style="{ width: (p.v != null ? p.v : 0) + '%' }"></i></span>
              <span class="ckm-v">{{ p.v != null ? p.v : '—' }}</span>
              <span class="ckm-att">{{ p.attempts }}题</span>
              <span class="ckm-caret">{{ expandedKey === p.key ? '▴' : '▾' }}</span>
            </div>
            <Transition name="hud">
              <div v-if="expandedKey === p.key" class="ckmd">
                <div class="ckmd-grid">
                  <div class="ckmd-cell"><b>{{ p.v != null ? p.v + '%' : '—' }}</b><span>掌握度</span></div>
                  <div class="ckmd-cell"><b>{{ p.attempts }}</b><span>做题数</span></div>
                  <div class="ckmd-cell"><b>{{ p.rate != null ? p.rate + '%' : '—' }}</b><span>正确率</span></div>
                  <div class="ckmd-cell"><b>{{ p.wrong }}</b><span>错题</span></div>
                  <div class="ckmd-cell"><b>{{ p.rev }}</b><span>已复盘</span></div>
                  <div class="ckmd-cell"><b>{{ p.active ? '活跃' : '静默' }}</b><span>近7天</span></div>
                </div>
                <div class="ckmd-advice">💡 {{ p.advice }}</div>
                <div class="ckmd-acts">
                  <button class="btn btn-pri" @click.stop="trainPlate(p.key)">🎯 去练习「{{ p.label }}」</button>
                  <button class="btn btn-gh" @click.stop="seeWrong(p.key)">📋 看错题</button>
                </div>
              </div>
            </Transition>
          </div>
        </div>
        <div v-if="cpMastery.cur == null" class="ckm-hint">去「单题快练 / 模拟组卷」做题，实时统计你的板块掌握度与得分评估</div>
      </div>
      <!-- 励志语录（点击换一句） -->
      <div class="ck-quote" title="点击换一句励志语录" @click="nextQuote">
        <span class="cq-ic">💬</span>
        <span class="cq-text">{{ quote || '稳住，我们能赢！' }}</span>
        <span class="cq-next">换一句 ›</span>
      </div>
      <div class="ck-tasks">
        <div class="ck-tasks-head">
          <span class="ct-title">🎯 今日任务</span>
          <span v-if="streak > 0" class="ct-streak">🔥 连续 {{ streak }} 天</span>
          <span v-if="streakMedal()" class="ct-medal">{{ streakMedal() }}</span>
          <span class="ct-prog">{{ tasks.filter((t) => t.done).length }}/{{ tasks.length }}</span>
        </div>
        <div v-if="yesterdayLeft > 0" class="ct-yesterday">⚠️ 昨天有 {{ yesterdayLeft }} 项任务未完成，今天补上！</div>
        <div v-if="!tasks.length" class="ct-empty">正在生成今日任务…</div>
        <div v-for="(t, i) in tasks" :key="t.k" class="ct-item" :class="{ done: t.done }">
          <input type="checkbox" :checked="t.done" @change="toggleTask(i)" />
          <span class="ct-lbl" @click="goTask(t)">{{ t.label }}</span>
          <span v-if="t.done" class="ct-ok">✓</span>
          <button v-if="t.custom" class="ct-del" title="删除自定义任务" @click="delTask(i)">✕</button>
        </div>
        <div class="ct-add">
          <input v-model="customTask" placeholder="添加自定义任务，回车保存" @keydown.enter.prevent="addTask()" />
          <button class="btn btn-gh" @click="addTask()">＋ 添加</button>
        </div>
        <div v-if="tasks.length && tasks.every((t) => t.done)" class="ct-all">🎉 今日任务全部完成，去休息或加练吧！</div>
      </div>

      <!-- 概览四卡 -->
      <div class="ck-cards">
        <div class="ck-card">
          <div class="ck-n">{{ ck.q }}</div>
          <div class="ck-l">累计提问</div>
        </div>
        <div class="ck-card g">
          <div class="ck-n">{{ ck.w }}</div>
          <div class="ck-l">已收错题</div>
        </div>
        <div class="ck-card a">
          <div class="ck-n">{{ ck.r }}</div>
          <div class="ck-l">已复盘</div>
        </div>
        <div class="ck-card b">
          <div class="ck-n">{{ daysLeft != null ? daysLeft : '—' }}</div>
          <div class="ck-l">备考倒计时</div>
        </div>
      </div>

      <div class="ck-study">⏱ 今日学习 <b>{{ todayMin }}</b> 分钟 · 累计 <b>{{ totalMin }}</b> 分钟</div>

      <!-- 板块强度 -->
      <div class="sec-t">📊 板块练习分布</div>
      <div v-if="!banKuai.arr.length" class="empty">
        <div class="empty-i">🧭</div>
        <div class="empty-t">还没有提问记录</div>
        <div class="empty-d">去对话页问几道题，这里会按板块统计</div>
      </div>
      <div v-else class="bk-chart">
        <div v-for="[b, n] in banKuai.arr" :key="b" class="bk-row">
          <span class="bk-name">{{ b }}</span>
          <div class="bk-bar"><div class="bk-fill" :style="{ width: (n / banKuai.max) * 100 + '%' }"></div></div>
          <span class="bk-num">{{ n }}</span>
        </div>
      </div>

      <!-- 复盘率 -->
      <div class="sec-t">✅ 错题复盘率</div>
      <div class="rev-prog">
        <div class="rp-inner" :style="{ width: ck.revRate + '%' }"></div>
        <span class="rp-l">{{ ck.revRate }}%</span>
      </div>
      <div style="font-size: 11px; color: var(--text3); margin-top: 4px">
        复盘到位是提分关键。待复盘 {{ ck.w - ck.r }} 题。
      </div>

      <!-- 复盘健康（深化）：评分 + 四指标 + 建议 -->
      <div class="sec-t">💗 复盘健康</div>
      <div v-if="health.t" style="border:1px solid rgba(127,127,127,.18);border-radius:12px;padding:10px 12px;background:var(--bg2,rgba(127,127,127,.06))">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <div style="font-size:26px;font-weight:700;line-height:1" :style="{ color: health.score >= 85 ? '#34d399' : health.score >= 60 ? '#fbbf24' : '#fb7185' }">{{ health.score }}</div>
          <div style="flex:1;min-width:150px">
            <div style="font-size:13px">复盘健康 <b>{{ health.grade }}</b> · 共 {{ health.t }} 题错题</div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;font-size:11.5px;color:var(--text2);margin-top:3px">
              <span>复盘率 {{ health.reviewedRate }}%</span>
              <span>消化率 {{ health.digestRate }}%</span>
              <span v-if="health.repRate != null">复错率 {{ health.repRate }}%</span>
              <span v-if="health.overdue">到期积压 <b style="color:#fb7185">{{ health.overdue }}</b></span>
            </div>
          </div>
          <button class="btn btn-gh" style="padding:3px 12px;font-size:12px" @click="openHub()">🗓️ 清到期</button>
        </div>
        <div v-if="health.tips.length" style="font-size:11.5px;color:var(--text3);margin-top:6px">{{ health.tips.join('；') }}</div>
      </div>
      <div v-else class="empty" style="padding:10px 0"><div class="empty-d">先收几道错题并复盘，这里会给出「复盘健康分」与建议</div></div>

      <!-- 考试节点横条 -->
      <div class="sec-t">📅 {{ examLabel }}冲刺节点</div>
      <div class="ck-nodes">
        <div v-for="n in nodes" :key="n.t" class="ck-node" :class="{ hot: n.hot }">
          <div class="cn-i">{{ n.i }}</div>
          <div class="cn-t">{{ n.t }}</div>
          <div class="cn-d">{{ n.d }}</div>
        </div>
      </div>
      <div style="font-size: 10.5px; color: var(--text3); margin-top: 4px">
        参考节点，具体以官方公告为准；笔试日为设置里倒计时对应日期。
      </div>

      <!-- 冲刺倒推计划 -->
      <template v-if="plan">
        <div class="sec-t">🚀 冲刺倒推计划（距笔试 {{ daysLeft }} 天）</div>
        <div class="plan-card">
          <div class="plan-row"><span>每日建议刷题</span><b>{{ plan.q }}</b></div>
          <div class="plan-row"><span>每日建议复盘</span><b>{{ plan.r }}</b></div>
          <div class="plan-row"><span>每周建议套卷</span><b>{{ plan.w }}</b></div>
          <div class="plan-note">💡 {{ plan.note }}</div>
        </div>
      </template>

      <!-- 学习策略 / 快捷入口 -->
      <div class="sec-t">💡 学习策略</div>
      <div v-if="weakest" class="ck-tip">
        最近的薄弱板块似乎是「{{ weakest[0] }}」（提问 {{ weakest[1] }} 次）。建议：去对话页切换该板块模式，用
        🎲模拟出题 + 🔁变式检验 专项练透。
        <button class="btn btn-pri" style="margin-top:8px" @click="trainWeak()">🎯 专项练「{{ weakest[0] }}」</button>
      </div>
      <div v-else class="ck-tip">多去对话页提问、把错题做完复盘，看板会越来越有针对性。</div>

      <div class="ck-acts">
        <button class="btn btn-pri" @click="goto('chat')">💬 去提问 / 智能训练</button>
        <button class="btn btn-gh" @click="goto('wq')">📋 去错题复盘</button>
        <button class="btn btn-gh" @click="goto('stat')">📊 看统计</button>
      </div>
    </div>
  </div>
</template>
