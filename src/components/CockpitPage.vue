<script setup>
import { ref, computed, onMounted } from 'vue'
import { store } from '../store'
import { detectBanKuai, PLATE_MODE } from '../api'
import { showToast } from '../utils/toast'
import { todaySeconds, totalSeconds, fmtMin, studyTick } from '../utils/study'

// 今日练习：统计今天(按日期)的 user 提问数（chat 记录无 time，用日期近似——用 store 计数即可，标注"累计"更稳）
const ck = computed(() => {
  const q = store.msgs.filter((m) => m.role === 'user').length
  const w = store.wqs.length
  const r = store.wqs.filter((x) => x.reviewed).length
  return { q, w, r, revRate: w ? Math.round((r / w) * 100) : 0 }
})
// 备考倒计时
const daysLeft = computed(() => {
  try {
    const d = store.cfg.examDate ? new Date(store.cfg.examDate) : null
    if (!d || isNaN(d)) return null
    return Math.max(0, Math.ceil((d - Date.now()) / 86400000))
  } catch (e) {
    return null
  }
})
const examDateFmt = computed(() => {
  try {
    const d = new Date(store.cfg.examDate || 0)
    if (isNaN(d)) return ''
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日'
  } catch (e) {
    return ''
  }
})
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
    const d = store.cfg.examDate ? new Date(store.cfg.examDate) : null
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
    { t: '📝笔试日', d: ex || store.cfg.examDate || '待定', i: '⏰', hot: true }
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
      return
    }
    if (t && t.date !== todayKey() && Array.isArray(t.items)) {
      const undone = t.items.filter((x) => !x.done).length
      if (undone > 0) yesterdayLeft.value = undone
    }
  } catch (e) {}
  genTasks()
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
  tasks.value = [
    { k: 'practice', label: wp ? '刷 5 道「' + wp + '」并开考场计时（对话页）' : '刷 5 道题并开考场计时（对话页）', done: false },
    { k: 'redo', label: '复盘/二刷 ' + Math.min(3, pending || 1) + ' 道错题（错题页）', done: false },
    { k: 'accum', label: '积累 2 条常识/时政（积累页）', done: false }
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
    store.tab = 'chat'
    setTimeout(() => window.dispatchEvent(new CustomEvent('xc-ask', { detail: '请出一道' + (weakPlate() || '判断推理') + '仿真题，并输出选项和【正确答案】' })), 60)
  } else if (t.k === 'redo') {
    store.tab = 'wq'
    setTimeout(() => window.dispatchEvent(new CustomEvent('xc-focus-wrong')), 60)
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
  { key: '判断推理', label: '判断', weight: 30, subs: ['判断推理', '图形推理', '定义判断', '类比推理', '逻辑判断'] },
  { key: '言语理解', label: '言语', weight: 30, subs: ['言语理解'] },
  { key: '资料分析', label: '资料', weight: 20, subs: ['资料分析'] },
  { key: '数量关系', label: '数量', weight: 8, subs: ['数量关系'] },
  { key: '常识判断', label: '常识', weight: 7, subs: ['常识判断'] },
  { key: '政治理论', label: '政治', weight: 5, subs: ['政治理论'] }
]
const cpCol = ref([])
try { cpCol.value = JSON.parse(localStorage.getItem('xc_quiz_col') || '[]') || [] } catch (e) {}
const cpMastery = computed(() => {
  const items = CP_PLATES.map((p) => {
    const col = cpCol.value.filter((x) => p.subs.includes(x.subject))
    let done = 0, ok = 0
    col.forEach((x) => { (x.history || []).forEach((h) => { done++; if (h.ok) ok++ }) })
    const wq = store.wqs.filter((q) => p.subs.includes(q.subject))
    const rev = wq.filter((q) => q.reviewed || q.digested).length
    const attempts = done + wq.length
    const rate = done ? Math.round((ok / done) * 100) : null
    let v = null
    if (attempts > 0) {
      const revBonus = wq.length ? Math.round((rev / wq.length) * 30) : 0
      const wqPen = Math.max(0, 100 - wq.length * 6)
      v = Math.max(0, Math.min(100, Math.round((rate != null ? rate : 0) * 0.55 + revBonus + wqPen * 0.15)))
    }
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
  setTimeout(() => window.dispatchEvent(new CustomEvent('xc-focus-wrong')), 60)
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
      <div class="ck-head">
        <div class="ck-title">🚀 学习驾驶舱</div>
        <div v-if="daysLeft != null" class="ck-sub">
          距笔试还有
          <b>{{ daysLeft }}</b>
          天（{{ examDateFmt }}，设置里可调）
        </div>
        <div v-else class="ck-sub">在设置 → 数据管理 里配置笔试日期可显示倒计时</div>
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

      <!-- 考试节点横条 -->
      <div class="sec-t">📅 国考冲刺节点</div>
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
