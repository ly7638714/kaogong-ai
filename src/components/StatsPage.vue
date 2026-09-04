<script setup>
import { ref, computed } from 'vue'
import { store, saveCfg } from '../store'
import { detectBanKuai, chatOnce } from '../api'
import { todaySeconds, totalSeconds, fmtMin, studyTick, studyMap } from '../utils/study'
import { downloadText } from '../utils/export'
import { showToast } from '../utils/toast'
import { safeGet, KEYS } from '../utils/storage'
import { masteryOfPlate } from '../utils/mastery'
import { kpointOf } from '../utils/kpointLib'
import { gateNow } from '../utils/abilityGate' // 35号批次4-B：能力自评灰度解锁
import { recentGenStats } from '../utils/quizLog'
import { genHealth } from '../utils/genHealth' // 深化·可诊断性：跨卷出题健康（板块·题型失败率） // 37号：出题质检数据外显
import { readAttempts } from '../utils/attemptLog' // 5.2 考点热度数据源
import { kpointHeat } from '../utils/kpointHeat' // 5.2 考点热度聚合
import { difficultyTable } from '../utils/difficulty' // 难度校准摘要（数据在自动调难度）
import { listFlagged, removeFlagged, confirmFlagged, dismissFlagged, flaggedStats } from '../utils/flaggedQuestions' // 深化③ UI：疑题榜单
import { flaggedToCsv, flaggedToMd } from '../utils/flagExport' // 深化：疑题清单导出（CSV/MD 纯函数）
import { useAi } from '../utils/useAi'
const { run: aiRun } = useAi()
const stats = computed(() => ({
  tot: store.msgs.filter((m) => m.role === 'user').length,
  q: store.msgs.filter(
    (m) => m.role === 'user' && /分析|讲解|题目/.test(String((m.content && m.content.text) || m.content || ''))
  ).length,
  r: store.msgs.filter((m) => m.role === 'assistant' && /复盘|解析/.test(String(m.content))).length,
  w: store.wqs.length
}))
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
const revRate = computed(() =>
  store.wqs.length ? Math.round((store.wqs.filter((q) => q.reviewed).length / store.wqs.length) * 100) : 0
)
const detail = ref(''),
  show = ref(false)
function openStat(kind) {
  if (kind === 'w') {
    store.tab = 'wq'
    return
  }
  const ums = store.msgs.filter((m) => m.role === 'user')
  let list = []
  if (kind === 'tot')
    list = ums.slice(-10).map((m) => String((m.content && m.content.text) || m.content || '').slice(0, 60))
  else if (kind === 'q')
    list = ums
      .filter((m) => /分析|讲解|题目/.test(String((m.content && m.content.text) || m.content || '')))
      .slice(-10)
      .map((m) => String((m.content && m.content.text) || m.content || '').slice(0, 60))
  else
    list = ums
      .filter((m) => /复盘|分析|讲解/.test(String((m.content && m.content.text) || m.content || '')))
      .slice(-10)
      .map((m) => String((m.content && m.content.text) || m.content || '').slice(0, 60))
  detail.value = list.length ? list.map((t) => '· ' + t).join('\n') : '暂无记录'
  show.value = true
}
// ===== 学习趋势（近 7/14/30 天） =====
const range = ref(7)
const dayKey = (ts) => {
  if (!ts) return ''
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ''
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
const parseTime = (s) => {
  if (!s) return null
  const d = new Date(String(s).replace(/\//g, '-'))
  return isNaN(d.getTime()) ? null : d.getTime()
}
const seriesMeta = [
  { k: 'ask', label: '提问', color: '#22d3ee' },
  { k: 'quiz', label: '做题', color: '#a78bfa' },
  { k: 'wrong', label: '错题', color: '#fb7185' },
  { k: 'review', label: '复盘', color: '#34d399' }
]
// 学习时长
const todayMin = computed(() => { studyTick.value; return fmtMin(todaySeconds()) })
const totalMin = computed(() => { studyTick.value; return fmtMin(totalSeconds()) })
const trend = computed(() => {
  const days = []
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  for (let i = range.value - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = dayKey(d.getTime())
    const ask = store.msgs.filter((m) => m.role === 'user' && dayKey(m.t) === key).length
    const quiz = quizCol.value.reduce((a, x) => a + (x.history || []).filter((h) => h && h.t && dayKey(h.t) === key).length, 0)
    const wrong = store.wqs.filter((q) => dayKey(q.at || parseTime(q.time)) === key).length
    const review = store.wqs.filter((q) => q.reviewedAt && dayKey(q.reviewedAt) === key).length
    days.push({ key, label: d.getMonth() + 1 + '/' + d.getDate(), ask, quiz, wrong, review })
  }
  const max = Math.max(1, ...days.flatMap((d) => [d.ask, d.quiz, d.wrong, d.review]))
  const W = 600
  const H = 150
  const P = 26
  const x = (i) => (days.length <= 1 ? W / 2 : P + (i * (W - P * 2)) / (days.length - 1))
  const y = (v) => H - P - (v / max) * (H - P * 2)
  const line = (k) => days.map((d, i) => (i === 0 ? 'M' : 'L') + x(i).toFixed(1) + ',' + y(d[k]).toFixed(1)).join(' ')
  const area = (k) =>
    'M' + x(0).toFixed(1) + ',' + y(0).toFixed(1) + ' ' + line(k).replace(/^M/, 'L') + ' L' + x(days.length - 1).toFixed(1) + ',' + (H - P).toFixed(1) + ' Z'
  return { days, max, x, y, line, area, W, H, P }
})
// ===== 板块掌握度雷达（6 大板块）=====
const radarPlates = [
  { key: '判断推理', label: '判断', sub: ['判断推理', '图形推理', '类比推理', '定义判断'] },
  { key: '言语理解', label: '言语', sub: ['言语理解'] },
  { key: '数量关系', label: '数量', sub: ['数量关系'] },
  { key: '资料分析', label: '资料', sub: ['资料分析'] },
  { key: '常识判断', label: '常识', sub: ['常识判断'] },
  { key: '政治理论', label: '政治', sub: ['政治理论'] }
]
const radar = computed(() => {
  const vals = radarPlates.map((p) => {
    const wrongN = store.wqs.filter((q) => p.sub.includes(q.subject)).length
    // 批次6-6A 掌握度收编：统一走 mastery.js（与看板/CosmosScene 同口径）
    return { ...p, v: masteryOfPlate(p.key, store.wqs, { plates: p.sub }), nodata: wrongN === 0 }
  })
  const cx = 110
  const cy = 105
  const R = 78
  const pt = (i, r) => {
    const a = (Math.PI * 2 * i) / vals.length - Math.PI / 2
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  }
  const rings = [0.25, 0.5, 0.75, 1].map((f) =>
    vals.map((_, i) => pt(i, R * f).map((x) => x.toFixed(1)).join(',')).join(' ')
  )
  const poly = vals.map((v, i) => pt(i, R * (v.v / 100)).map((x) => x.toFixed(1)).join(',')).join(' ')
  const axes = vals.map((v, i) => {
    const [x0, y0] = pt(i, R + 18)
    return { x: x0.toFixed(1), y: y0.toFixed(1), label: v.label + (v.nodata ? '·无数据' : ''), val: v.v }
  })
  return { rings, poly, axes, vals, W: 220, H: 220 }
})
// ===== 掌握度评估系统（六大板块 + 细分题型 + 目标分 + 综合评估 + 鼓励） =====
const quizCol = ref([])
quizCol.value = safeGet(KEYS.QUIZ_COL, [])
const PLATES = [
  { key: '判断推理', label: '判断推理', weight: 30, subs: ['判断推理', '图形推理', '定义判断', '类比推理', '逻辑判断'] },
  { key: '言语理解', label: '言语理解', weight: 30, subs: ['言语理解'] },
  { key: '资料分析', label: '资料分析', weight: 20, subs: ['资料分析'] },
  { key: '数量关系', label: '数量关系', weight: 8, subs: ['数量关系'] },
  { key: '常识判断', label: '常识判断', weight: 7, subs: ['常识判断'] },
  { key: '政治理论', label: '政治理论', weight: 5, subs: ['政治理论'] }
]
const mastery = computed(() =>
  PLATES.map((p) => {
    const col = quizCol.value.filter((x) => p.subs.includes(x.subject))
    let done = 0, ok = 0
    col.forEach((x) => { (x.history || []).forEach((h) => { done++; if (h.ok) ok++ }) })
    const wq = store.wqs.filter((q) => p.subs.includes(q.subject))
    const rev = wq.filter((q) => q.reviewed || q.digested).length
    const attempts = done + wq.length
    let v = null
    if (attempts > 0) {
      const rate = done ? Math.round((ok / done) * 100) : 0
      // 无错题且做过题 = 该板块掌握无短板，视为复盘满分、错题零负担，避免"越完美反而封顶 70"的失真
      const perfect = wq.length === 0 && done > 0
      const revBonus = perfect ? 30 : wq.length ? Math.round((rev / wq.length) * 30) : 0
      const wqPen = perfect ? 100 : Math.max(0, 100 - wq.length * 6)
      v = Math.max(0, Math.min(100, Math.round(rate * 0.55 + revBonus + wqPen * 0.15)))
    }
    const vm = {}
    col.forEach((x) => {
      const k = x.variant || '综合'
      vm[k] = vm[k] || { done: 0, ok: 0 }
      ;(x.history || []).forEach((h) => { vm[k].done++; if (h.ok) vm[k].ok++ })
    })
    wq.forEach((q) => { const k = q.subject || '综合'; vm[k] = vm[k] || { done: 0, ok: 0 } })
    const variants = Object.keys(vm).map((k) => ({ k, rate: vm[k].done ? Math.round((vm[k].ok / vm[k].done) * 100) : 0, done: vm[k].done })).filter((x) => x.done > 0).sort((a, b) => b.rate - a.rate)
    return { ...p, v, attempts, variants }
  })
)
// 批次C·考点级下钻：读取时按题干/错题惰性打考点标签，聚合 正确率/错题/复盘率
const kpoints = computed(() =>
  PLATES.map((p) => {
    const agg = {}
    const bump = (k, done, ok, wrong, rev) => {
      agg[k] = agg[k] || { done: 0, ok: 0, wrong: 0, rev: 0 }
      const a = agg[k]
      a.done += done; a.ok += ok; a.wrong += wrong; a.rev += rev
    }
    quizCol.value.filter((x) => p.subs.includes(x.subject)).forEach((x) => {
      const k = kpointOf(x.subject, x.stem)
      ;(x.history || []).forEach((h) => bump(k, 1, h.ok ? 1 : 0, 0, 0))
    })
    store.wqs.filter((q) => p.subs.includes(q.subject)).forEach((q) => {
      bump(kpointOf(q.subject, q.question), 0, 0, 1, q.reviewed || q.digested ? 1 : 0)
    })
    const list = Object.entries(agg).map(([k, v]) => ({
      k,
      done: v.done, ok: v.ok, wrong: v.wrong, rev: v.rev,
      rate: v.done ? Math.round((v.ok / v.done) * 100) : null,
      revRate: v.wrong ? Math.round((v.rev / v.wrong) * 100) : null
    })).filter((x) => x.done > 0 || x.wrong > 0)
      .sort((a, b) => (b.wrong - a.wrong) || (b.done - a.done))
    return { key: p.key, list }
  })
)
const assessment = computed(() => {
  const plates = mastery.value.filter((p) => p.v != null)
  const totalW = plates.reduce((a, p) => a + p.weight, 0)
  const cur = totalW ? Math.round(plates.reduce((a, p) => a + p.v * p.weight, 0) / totalW) : null
  const goal = store.cfg.goalScore || 70
  return { cur, goal, gap: cur != null ? goal - cur : null, pct: cur != null ? Math.round((cur / Math.max(1, goal)) * 100) : 0, started: plates.length > 0 }
})
// 批次8·目标分拆解：目标分按权重拆到每板块（需达/现状/差），让“差42分”变成可执行清单
const goalBreakdown = computed(() => {
  const goal = store.cfg.goalScore || 70
  return mastery.value.map((p) => {
    const need = Math.round(((goal * p.weight) / 100) * 10) / 10
    const cur = p.v != null ? Math.round(((p.v * p.weight) / 100) * 10) / 10 : null
    return { label: p.label, weight: p.weight, v: p.v, need, cur, gap: cur != null ? Math.round((need - cur) * 10) / 10 : null }
  })
})
// 35号批次4-B：AI 能力自评（灰度）——按 doc 35 §3.2 门槛点亮：全量≥200 且覆盖≥60% 板块才显示能力值；
// 样本不足时只给解锁进度，不给没统计基础的数。能力值 = Elo θ（纵向自评口径，非全国排名）。
const ability = computed(() => {
  const g = gateNow()
  const rows = Object.keys(g.theta).map((label) => ({ label, theta: g.theta[label].θ, n: g.theta[label].n })).sort((a, b) => b.theta - a.theta)
  return { ...g.gate, rows, pct: Math.min(100, Math.round((g.gate.total / 200) * 100)) }
})
// 37号：出题质检运行数据（本机全量日志；门禁3 重出率反馈外显）
const qcSum = computed(() => {
  try {
    const s = recentGenStats(0)
    return s.gen ? { gen: s.gen, retried: s.retried, failed: s.failed, reasonsTop: (s.reasonsTop || []).slice(0, 2).join('；') } : null
  } catch (e) { return null }
})
// 深化·可诊断性：跨卷出题健康——按(板块|题型)聚合失败率，筛出「反复难出」的类型供用户调参
const health = computed(() => {
  try { const h = genHealth({ minGen: 5, topN: 4 }); return (h.rows || []).filter((r) => r.fail > 0) } catch (e) { return [] }
})
// 5.2 考点热度（近 4 周 Top10，做题量×正确率）
const heatTop = computed(() => {
  try { return kpointHeat(readAttempts(), { weeks: 4, topN: 10 }).kps } catch (e) { return [] }
})
// 难度校准摘要：各板块实测正确率偏离中位最明显的前3（出题时会自动向目标区间调难度）
const calibRows = computed(() => {
  try {
    const tbl = difficultyTable(readAttempts())
    const rows = Object.keys(tbl.byPlate).map((pl) => {
      const s = tbl.byPlate[pl]
      return { pl, p: s.p, n: s.n, d: Math.abs(s.p - 0.55) }
    }).filter((x) => x.n >= 8).sort((a, b) => b.d - a.d).slice(0, 3).map((x) => ({ ...x, tag: x.p >= 0.68 ? '偏易→自动调难' : x.p <= 0.42 ? '偏难→自动调易' : '区间内' }))
    return rows
  } catch (e) { return [] }
})
// 深化③ UI：疑题榜单（已上报且自动降权的题）
const flaggedList = ref([])
function loadFlagged() { try { flaggedList.value = listFlagged().slice(0, 20) } catch (e) { flaggedList.value = [] } }
loadFlagged()
function rmFlagged(id) { removeFlagged(id); loadFlagged() }
// 深化·疑题生命周期：确有问题 / 误报 状态流转（误报不再降权同类题）
function markFlag(id, st) { if (st === 'confirmed') confirmFlagged(id); else dismissFlagged(id); loadFlagged() }
const flagChips = computed(() => { try { return flaggedStats() } catch (e) { return { open: 0, confirmed: 0, dismissed: 0 } } })
// 深化(C)：疑题统计排行 + 导出
const flagRank = computed(() => {
  try {
    const m = {}
    listFlagged().forEach((x) => { const k = x.plate + '|' + (x.kpoint || x.variant || '综合'); m[k] = (m[k] || 0) + 1 })
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => ({ k, n }))
  } catch (e) { return [] }
})
function exportFlagged() {
  const list = (() => { try { return listFlagged() } catch (_) { return [] } })()
  downloadText(flaggedToMd(list), '疑题反馈清单_' + new Date().toISOString().slice(0, 10) + '.md', 'text/markdown;charset=utf-8')
  showToast('已导出疑题反馈清单（' + list.length + ' 条）', 'success')
}
function exportFlaggedCsv() {
  const list = (() => { try { return listFlagged() } catch (_) { return [] } })()
  downloadText(flaggedToCsv(list), '疑题反馈清单_' + new Date().toISOString().slice(0, 10) + '.csv', 'text/csv;charset=utf-8')
  showToast('已导出疑题清单 CSV（' + list.length + ' 条 · Excel 可直接打开）', 'success')
  loadFlagged()
}
const advice = computed(() => {
  const arr = mastery.value.filter((p) => p.v != null).sort((a, b) => a.v - b.v)
  if (!arr.length) return { text: '还没有做题数据，快去「单题快练 / 模拟组卷」开始第一题吧！', weak: '', strong: '' }
  const weak = arr[0], strong = arr[arr.length - 1]
  // 单一板块有数据时不重复说「弱势/优势」，避免自相矛盾
  const text = weak.label === strong.label
    ? '当前重点板块：' + weak.label + '（' + weak.v + '）→ 稳住优势并稳步提升，可再刷专项 10 题巩固手感。'
    : '弱势板块：' + weak.label + '（' + weak.v + '）→ 建议每天专项 10 题补强；优势板块：' + strong.label + '（' + strong.v + '）→ 保持手感并适当提速。'
  return { text, weak: weak.label, strong: strong.label }
})
const QUOTES = [
  '🌱 种一棵树最好的时间是十年前，其次是现在——你已经在路上了！',
  '💪 每一道错题都是上岸路上的垫脚石，错一题涨一题！',
  '🎯 你现在的每一点积累，都在为考场上那 120 分钟铺路。',
  '🔥 别怕慢，只怕站；坚持刷题的人，运气都不会差。',
  '📈 量变终将引起质变——你的正确率正在肉眼可见地爬升！',
  '🏆 相信过程，你认真刷的每一题都算数，局长之位非你莫属！',
  '🚀 现在的努力，是为了让未来的自己感谢现在的自己。'
]
const encourage = computed(() => {
  const a = assessment.value
  if (a.cur == null) return QUOTES[0]
  if (a.cur >= a.goal) return '🏆 已达成目标 ' + a.goal + ' 分！稳住节奏，上岸在望，冲！'
  const i = Math.min(QUOTES.length - 1, Math.floor((a.cur / Math.max(1, a.goal)) * (QUOTES.length - 1)))
  return QUOTES[i]
})
// 做题正确率（近 range 天，用于趋势提示）
const quizRate = computed(() => {
  const startKey = dayKey(new Date(Date.now() - range.value * 86400000).setHours(0, 0, 0, 0))
  let done = 0, ok = 0
  quizCol.value.forEach((x) => (x.history || []).forEach((h) => { if (h && h.t && dayKey(h.t) >= startKey) { done++; if (h.ok) ok++ } }))
  return done ? Math.round((ok / done) * 100) : null
})
// 成绩趋势（最近考试正确率，含目标线）
const results = ref([])
results.value = safeGet(KEYS.PAPER_RESULTS, [])
const scoreTrend = computed(() => {
  const list = results.value.slice(-10).map((r) => ({ rate: Math.round(r.rate || 0), label: r.ts ? (new Date(r.ts).getMonth() + 1) + '/' + new Date(r.ts).getDate() : '', n: r.n || 0 }))
  const W = 600, H = 120, P = 24
  const max = Math.max(100, ...list.map((x) => x.rate))
  const x = (i) => (list.length <= 1 ? W / 2 : P + (i * (W - P * 2)) / (list.length - 1))
  const y = (v) => H - P - (v / max) * (H - P * 2)
  const line = list.map((d, i) => (i === 0 ? 'M' : 'L') + x(i).toFixed(1) + ',' + y(d.rate).toFixed(1)).join(' ')
  return { list, W, H, P, line, x, y, goalY: y(store.cfg.goalScore || 70) }
})
// 报告导出选项
const repAi = ref(true)
const repBusy = ref(false)
// 按板块正确率 + 近半程趋势（全部做题记录）
const plateRate = computed(() => {
  const map = {}
  quizCol.value.forEach((x) => {
    const k = x.subject || '未分类'
    map[k] = map[k] || { done: 0, ok: 0, rec: [] }
    ;(x.history || []).forEach((h) => { if (h && h.ok !== undefined) { map[k].done++; if (h.ok) map[k].ok++; map[k].rec.push(!!h.ok) } })
  })
  return Object.keys(map).map((k) => {
    const v = map[k]
    const rate = v.done ? Math.round((v.ok / v.done) * 100) : 0
    const half = Math.max(1, Math.floor(v.rec.length / 2))
    const a = v.rec.slice(0, half), b = v.rec.slice(-half)
    const r1 = a.length ? Math.round((a.filter(Boolean).length / a.length) * 100) : 0
    const r2 = b.length ? Math.round((b.filter(Boolean).length / b.length) * 100) : 0
    const delta = v.done >= 4 ? r2 - r1 : null
    return { k, rate, done: v.done, delta }
  }).sort((x, y) => y.rate - x.rate)
})
// ===== 学习热力图（近 15 周打卡日历）=====
// 批次5-P5-3 热力图分桶：一次遍历 msgs/wqs/studyMap 建按日索引，每格 O(1) 读取（原 105 格各全量 filter）
const byDay = computed(() => {
  const b = {}
  store.msgs.forEach((m) => {
    if (m.role === 'user' && m.t) { const k = dayKey(m.t); if (k) (b[k] ||= { q: 0, w: 0, min: 0 }).q++ }
  })
  store.wqs.forEach((q) => { const k = dayKey(q.at || parseTime(q.time)); if (k) (b[k] ||= { q: 0, w: 0, min: 0 }).w++ })
  const sm = studyMap()
  for (const k in sm) { (b[k] ||= { q: 0, w: 0, min: 0 }).min = Math.round((sm[k] || 0) / 60) }
  return b
})
const heat = computed(() => {
  const weeks = []
  const end = new Date()
  end.setHours(0, 0, 0, 0)
  const todayIdx = end.getDay()
  end.setDate(end.getDate() - todayIdx)
  for (let w = 14; w >= 0; w--) {
    const week = []
    for (let d = 6; d >= 0; d--) {
      const day = new Date(end)
      day.setDate(end.getDate() - (w * 7 + d))
      const key = dayKey(day.getTime())
      const cell = byDay.value[key] || { q: 0, w: 0, min: 0 }
      week.push({ key, cnt: cell.q + cell.w, min: cell.min })
    }
    weeks.push(week)
  }
  const max = Math.max(1, ...weeks.flat().map((d) => Math.max(d.cnt, d.min)))
  return { weeks, max }
})
function heatColor(cnt, max) {
  if (!cnt) return 'rgba(255,255,255,0.05)'
  const a = 0.18 + Math.min(1, cnt / max) * 0.75
  return 'rgba(34,211,238,' + a.toFixed(2) + ')'
}
// 简易 md → Word 兼容 html
function mdToDocHtml(md) {
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const h = String(md).split('\n').map((l) => {
    if (!l) return '<p></p>'
    const t = esc(l).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    if (/^### /.test(t)) return '<h3>' + t.slice(4) + '</h3>'
    if (/^## /.test(t)) return '<h2>' + t.slice(3) + '</h2>'
    if (/^# /.test(t)) return '<h1>' + t.slice(2) + '</h1>'
    if (/^- /.test(t)) return '<li>' + t.slice(2) + '</li>'
    return '<p>' + t + '</p>'
  }).join('\n')
  return '<meta charset="utf-8"><style>body{font-family:SimSun,serif;line-height:1.8} h1,h2{color:#1f6feb}</style>' + h
}
// 一键导出学习报告：周报(7天)/月报(30天)，Markdown 或 Word(.doc)
async function exportReport(days = 7, fmt = 'md') {
  const L = []
  const title = days >= 30 ? '行测学习月报' : '行测学习周报'
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const start = new Date(now); start.setDate(start.getDate() - (days - 1))
  const sk = dayKey(start.getTime()), ek = dayKey(now.getTime())
  const inW = (ts) => { const k = dayKey(ts); return !!k && k >= sk && k <= ek }
  const asks = store.msgs.filter((m) => m.role === 'user' && inW(m.t)).length
  const wrongs = store.wqs.filter((q) => inW(q.at || parseTime(q.time))).length
  const revs = store.wqs.filter((q) => q.reviewedAt && inW(q.reviewedAt)).length
  let quizDone = 0, quizOk = 0
  quizCol.value.forEach((x) => (x.history || []).forEach((h) => { if (h && h.t && inW(h.t)) { quizDone++; if (h.ok) quizOk++ } }))
  const mins = Object.entries(studyMap()).filter(([k]) => k >= sk && k <= ek).reduce((a, [, v]) => a + Math.round((Number(v) || 0) / 60), 0)
  L.push('# 📊 ' + title)
  L.push('')
  L.push('> 统计区间：' + sk + ' ~ ' + ek + '（' + days + ' 天）· 生成时间：' + new Date().toLocaleString())
  L.push('')
  L.push('## 🎯 综合评估（目标 ' + assessment.value.goal + ' 分）')
  L.push('- 当前预估分：' + (assessment.value.cur != null ? assessment.value.cur : '—'))
  L.push('- 差距：' + (assessment.value.gap != null ? (assessment.value.gap >= 0 ? '差 ' + assessment.value.gap + ' 分' : '超 ' + (-assessment.value.gap) + ' 分') : '—'))
  L.push('- 达成度：' + assessment.value.pct + '%')
  L.push('- 建议：' + advice.value.text)
  L.push('- 鼓励：' + encourage.value)
  L.push('')
  L.push('## 📈 学习概况（' + days + ' 天）')
  L.push('- 提问 ' + asks + ' 次 · 做题 ' + quizDone + ' 题（正确率 ' + (quizDone ? Math.round((quizOk / quizDone) * 100) + '%' : '—') + '）')
  L.push('- 新增错题 ' + wrongs + ' 题 · 复盘 ' + revs + ' 次 · 学习 ' + mins + ' 分钟')
  L.push('')
  // 🧾 出题健康小节（深化·诊断报告化）：本机累计出题日志的薄弱板块·题型
  try {
    const hd = genHealth({ minGen: 5, topN: 5 })
    if (hd.total.gen > 0) {
      L.push('## 🧾 出题健康（本机累计 ' + hd.total.gen + ' 次出题 · 未过闸 ' + hd.total.fail + ' 题，均 fail-closed 不入卷）')
      const bad = hd.rows.filter((r) => r.fail > 0)
      if (bad.length) bad.forEach((r) => L.push('- ' + r.plate + '·' + r.variant + '：失败 ' + r.fail + '/' + r.gen + '（' + Math.round((r.fail / r.gen) * 100) + '%）'))
      else L.push('- 近段各类出题健康：无失败样本')
      if (hd.reasonsTop.length) L.push('- 高频失败原因：' + hd.reasonsTop.join('；'))
      L.push('')
    }
  } catch (e) {}
  L.push('## 🔥 学习打卡（近 15 周）')
  const cells = heat.value.weeks.flat()
  L.push('- 活跃 ' + cells.filter((d) => d.cnt > 0 || d.min > 0).length + ' 天 / ' + cells.length + ' 天')
  L.push('')
  L.push('## 🎯 板块掌握度')
  radar.value.axes.forEach((a) => L.push('- ' + a.label + '：' + a.val))
  L.push('')
  L.push('## 📚 细分题型掌握度')
  mastery.value.forEach((p) => {
    if (p.v == null) return
    L.push('- **' + p.label + '**：' + p.v + ' 分' + (p.attempts ? '（' + p.attempts + ' 题）' : ''))
    ;(p.variants || []).slice(0, 6).forEach((x) => L.push('  - ' + x.k + '：' + x.done + ' 题 · ' + x.rate + '%'))
  })
  L.push('')
  L.push('## 📊 板块提问分布')
  banKuai.value.arr.forEach(([b, n]) => L.push('- ' + b + '：' + n + ' 次'))
  L.push('')
  L.push('## ✅ 错题复盘率')
  L.push('- ' + revRate.value + '%（已复盘 ' + store.wqs.filter((q) => q.reviewed).length + ' / ' + store.wqs.length + ' 题）')
  L.push('')
  if (repAi.value) {
    L.push('## 🤖 AI 学习总结与建议')
    L.push('')
    repBusy.value = true
    const r = await aiRun(async (c) => {
      const sys = '你是公考行测督学教练。根据下面的学习数据，用 150-250 字输出：①一句话整体点评；②按优先级列出 3-4 条最该做的事（针对弱势板块、错题复盘、时间分配）；③一句鼓励。只输出正文，不要开场白。'
      return await chatOnce(c, [{ role: 'system', content: sys }, { role: 'user', content: L.join('\n').slice(0, 3000) }], 800, 90000)
    }, { keyHint: '文字模型', onError: () => {} })
    if (r == null) L.push('（未配置模型或生成失败，跳过 AI 总结）')
    else L.push(String(r || '').trim() || '（AI 总结生成失败，可稍后重试）')
    repBusy.value = false
    L.push('')
  }
  if (fmt === 'doc') {
    downloadText(mdToDocHtml(L.join('\n')), title + '.doc', 'application/msword')
    showToast('✅ 已导出 ' + title + ' Word(.doc)', 'success')
  } else {
    downloadText(L.join('\n'), title + '.md', 'text/markdown;charset=utf-8')
    showToast('✅ 已导出 ' + title + ' Markdown', 'success')
  }
}
</script>
<template>
  <div class="page on">
    <div class="page-inner">
      <div class="sg">
        <div class="sc" @click="openStat('tot')">
          <div class="sn">{{ stats.tot }}</div>
          <div class="sl">总对话</div>
        </div>
        <div class="sc" @click="openStat('q')">
          <div class="sn">{{ stats.q }}</div>
          <div class="sl">题目分析</div>
        </div>
        <div class="sc" @click="openStat('r')">
          <div class="sn">{{ stats.r }}</div>
          <div class="sl">复盘次数</div>
        </div>
        <div class="sc" @click="openStat('w')">
          <div class="sn">{{ stats.w }}</div>
          <div class="sl">错题数</div>
        </div>
        <div class="sc" title="学习时长（页面活跃时自动累计）">
          <div class="sn">{{ todayMin }}</div>
          <div class="sl">今日学习(分)</div>
        </div>
        <div class="sc" title="累计学习时长">
          <div class="sn">{{ totalMin }}</div>
          <div class="sl">累计学习(分)</div>
        </div>
      </div>

      <div style="text-align:right; margin: 2px 0 10px; display:flex; gap:6px; justify-content:flex-end; flex-wrap:wrap">
        <label class="rep-ai"><input v-model="repAi" type="checkbox" /> 🤖 AI 总结</label>
        <button class="btn btn-gh" :disabled="repBusy" @click="exportReport(7,'md')">{{ repBusy ? '🤖 生成中…' : '📤 周报 MD' }}</button>
        <button class="btn btn-gh" :disabled="repBusy" @click="exportReport(30,'md')">📤 月报 MD</button>
        <button class="btn btn-gh" :disabled="repBusy" @click="exportReport(7,'doc')">📄 周报 Word</button>
      </div>

      <div class="sec-t">🎯 综合评估（目标 {{ store.cfg.goalScore }} 分 / 100）</div>
      <div class="assess-card">
        <div class="ass-row">
          <div class="ass-item"><div class="ass-num" :class="assessment.cur != null && assessment.cur >= assessment.goal ? 'ok' : (assessment.cur != null && assessment.cur < assessment.goal * 0.6 ? 'no' : '')">{{ assessment.cur != null ? assessment.cur : '—' }}</div><div class="ass-l">当前预估分</div></div>
          <div class="ass-item"><div class="ass-num">{{ assessment.goal }}</div><div class="ass-l">目标分</div></div>
          <div class="ass-item"><div class="ass-num" :class="assessment.gap != null && assessment.gap <= 0 ? 'ok' : ''">{{ assessment.gap != null ? (assessment.gap >= 0 ? '差' + assessment.gap : '超' + (-assessment.gap)) : '—' }}</div><div class="ass-l">差距</div></div>
          <div class="ass-item"><div class="ass-num">{{ assessment.pct }}%</div><div class="ass-l">达成度</div></div>
        </div>
        <div class="ass-bar"><i :style="{ width: Math.min(100, assessment.pct) + '%' }"></i></div>
        <div v-if="goalBreakdown.some((b) => b.v != null)" class="gb-breakdown" style="margin-top: 8px; font-size: 12px">
          <div style="color: var(--text3); margin-bottom: 4px">🎯 目标 {{ assessment.goal }} 分拆解到板块（按权重）：</div>
          <div v-for="b in goalBreakdown" :key="b.label" style="display: flex; align-items: center; gap: 8px; margin-bottom: 2px">
            <span style="width: 60px">{{ b.label }}</span>
            <span style="width: 90px">需 {{ b.need }} 分</span>
            <span style="width: 90px" :style="{ color: b.v == null ? 'var(--text3)' : b.gap > 0 ? 'var(--red,#fb7185)' : 'var(--green,#34d399)' }">{{ b.v == null ? '未开始' : '现状 ' + b.cur }}</span>
            <span v-if="b.v != null && b.gap > 0" style="color: var(--red,#fb7185)">还差 {{ b.gap }}</span>
            <span v-else-if="b.v != null" style="color: var(--green,#34d399)">已达标</span>
          </div>
        </div>
        <div class="ass-advice">📌 {{ advice.text }}</div>
        <div class="ass-quote">{{ encourage }}</div>
        <div class="fld" style="margin-top: 6px">
          <label>🎯 行测目标分数（100 制，动态评估你的得分情况）</label>
          <input v-model.number="store.cfg.goalScore" type="number" min="0" max="100" style="width: 96px" @change="saveCfg()" />
        </div>
        <div style="font-size: 11px; color: var(--text3); margin-top: 4px">当前预估分 = 六大板块按题量权重加权（判断/言语各30、资料20、数量8、常识7、政治5）；掌握度来自做题正确率 + 错题复盘 + 错题量。</div>
      </div>

      <div class="sec-t">🧠 AI 能力自评（灰度）<span style="font-weight: 400; font-size: 12px; color: var(--text3)">纵向自评口径，非全国排名</span></div>
      <div class="assess-card" style="font-size: 13px">
        <template v-if="ability.predictionReady">
          <div style="margin-bottom: 6px">📊 基于作答流水 {{ ability.total }} 次的纵向能力估算（Elo θ，样本越足越稳）：</div>
          <div v-for="r in ability.rows" :key="r.label" style="display: flex; align-items: center; gap: 8px; margin-bottom: 3px">
            <span style="width: 64px">{{ r.label }}</span>
            <span class="ass-num" style="font-size: 14px">{{ r.theta }}</span>
            <span style="color: var(--text3)">样本 {{ r.n }} 题</span>
          </div>
          <div style="color: var(--text3); margin-top: 4px">说明：θ 由每次作答（含用时折价）按考点重放更新，仅供自我纵向对比；想得到“绝对校准”，可定期做锚点自测（每板块 10 道固定真题）。</div>
        </template>
        <template v-else>
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px">
            <span>🔒 能力自评解锁进度</span>
            <span style="flex: 1; height: 8px; border-radius: 4px; background: var(--bg2, #1e293b); overflow: hidden"><i style="display: block; height: 8px; border-radius: 4px; background: linear-gradient(90deg, #34d399, #22d3ee)" :style="{ width: ability.pct + '%' }"></i></span>
            <b>{{ Math.min(ability.total, 200) }}/200</b>
          </div>
          <div style="color: var(--text3)">
            <span v-if="ability.need > 0">还需累计作答 {{ ability.need }} 题后解锁（含单题/组卷/重做等全部作答事件）——样本不足时不显示能力值，避免给没统计基础的数。</span>
            <span v-else>作答量已达标，继续覆盖更多板块即可解锁（当前 {{ Math.round(ability.coverage * 100) }}% 板块）。</span>
            <span v-if="ability.anchorReady">；已累计 {{ ability.total }} 题，可定期做一次锚点自测（每板块 10 道固定真题）做绝对校准。</span>
          </div>
        </template>
        <div v-if="qcSum" style="font-size: 11px; color: var(--text3); border-top: 1px dashed var(--bg3,#334155); margin-top: 8px; padding-top: 6px">🧾 出题质检运行数据（本机累计 {{ qcSum.gen }} 题）：重出 {{ qcSum.retried }} 题 · 未过闸 {{ qcSum.failed }} 题<span v-if="qcSum.reasonsTop"> · 高频失败原因：{{ qcSum.reasonsTop }}</span>（失败题不会入卷，属 fail-closed）</div>
        <div v-if="health.length" style="font-size: 11px; color: var(--text3); margin-top: 4px">🔬 跨卷出题薄弱点（各 板块·题型 出题≥5）：<span v-for="h in health" :key="h.plate + h.variant" style="margin-right: 8px">{{ h.plate }}·{{ h.variant }} 失败{{ h.fail }}/{{ h.gen }}（{{ Math.round((h.fail / h.gen) * 100) }}%）</span>—— 这些类型常反复难出：可在出题配置关「严格质检/双模型互检」、换更快模型，或点「只补失败题」续出</div>
        <div v-if="calibRows.length" style="font-size: 11px; color: var(--text3); margin-top: 4px">🎚️ 难度校准（板块实测，n≥8）：<span v-for="c in calibRows" :key="c.pl" style="margin-right: 8px">{{ c.pl }} 实测{{ Math.round(c.p * 100) }}%（{{ c.tag }}）</span></div>
      </div>

      <div v-if="heatTop.length" class="sec-t">🔎 考点热度 Top{{ heatTop.length }}（近 30 天 · 做题量 × 正确率）</div>
      <div v-if="heatTop.length" class="assess-card" style="font-size: 12px">
        <div v-for="k in heatTop" :key="k.kp" style="display: flex; align-items: center; gap: 8px; margin-bottom: 3px">
          <span style="flex: 0 0 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap" :title="k.kp">{{ k.kp }}</span>
          <span style="flex: 1; height: 8px; border-radius: 4px; background: var(--bg2, #1e293b); overflow: hidden"><i style="display: block; height: 8px; border-radius: 4px" :style="{ width: Math.min(100, Math.round((k.total / heatTop[0].total) * 100)) + '%', background: k.rate == null ? '#64748b' : k.rate >= 80 ? '#34d399' : k.rate >= 60 ? '#fbbf24' : '#fb7185' }"></i></span>
          <span style="flex: 0 0 96px; text-align: right">{{ k.total }} 题 · {{ k.rate == null ? '—' : k.rate + '%' }}</span>
        </div>
        <div style="color: var(--text3); margin-top: 4px">条长=做题量；颜色=正确率（绿≥80 / 黄 60-79 / 红(不足60)）。红 + 条长 = 薄弱高频考点，优先补短；空白 = 练得少</div>
      </div>

      <details v-if="flaggedList.length" class="assess-card" style="font-size: 12px">
        <summary style="cursor: pointer; color: #fbbf24">⚠️ 疑题反馈榜（{{ flaggedList.length }} 条 · 已自动降低同类题出题权重）<span style="margin-left:6px; color:var(--text3); font-weight:400">待复核 {{ flagChips.open }} · 已确认 {{ flagChips.confirmed }} · 误报 {{ flagChips.dismissed }}</span></summary>
        <div style="margin-top: 4px">📊 按 板块|考点 排行：<span v-for="rk in flagRank" :key="rk.k" style="margin-right: 8px">{{ rk.k }}×{{ rk.n }}</span></div>
        <button class="btn btn-gh" style="padding: 1px 8px; font-size: 11px; margin-top: 2px" @click="exportFlagged()">📄 导出MD</button><button class="btn btn-gh" style="padding: 1px 8px; font-size: 11px; margin-top: 2px; margin-left: 4px" @click="exportFlaggedCsv()">📊 导出CSV</button>
        <div v-for="f in flaggedList" :key="f.id" style="display: flex; align-items: center; gap: 6px; margin-top: 4px">
          <span style="flex: 0 0 90px">{{ f.plate }}</span>
          <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap" :title="f.question">{{ f.kpoint || f.variant || '综合' }} · {{ f.note }}</span>
          <span style="font-size: 10px" :style="{ color: f.status === 'confirmed' ? '#34d399' : f.status === 'dismissed' ? '#94a3b8' : '#fbbf24' }">{{ f.status === 'confirmed' ? '已确认' : f.status === 'dismissed' ? '误报' : '待复核' }}</span>
          <template v-if="!f.status || f.status === 'open'"><button class="btn btn-gh" style="padding: 1px 6px; font-size: 11px" title="确认题目确实有问题（继续降权同类题）" @click="markFlag(f.id, 'confirmed')">✅确有问题</button><button class="btn btn-gh" style="padding: 1px 6px; font-size: 11px" title="判定为误报（解除降权）" @click="markFlag(f.id, 'dismissed')">❌误报</button></template>
          <button class="btn btn-gh" style="padding: 1px 6px; font-size: 11px" @click="rmFlagged(f.id)">移除</button>
        </div>
      </details>

      <div class="sec-t">📈 学习趋势</div>
      <div class="trend-card">
        <div class="trend-ranges">
          <button v-for="r in [7, 14, 30]" :key="r" class="tr-btn" :class="{ on: range === r }" @click="range = r">{{ r }}天</button>
        </div>
        <svg :viewBox="'0 0 ' + trend.W + ' ' + trend.H" class="trend-svg">
          <line
            v-for="i in 3"
            :key="'g' + i"
            :x1="0"
            :x2="trend.W"
            :y1="trend.H - trend.P - (i * (trend.H - trend.P * 2)) / 3"
            :y2="trend.H - trend.P - (i * (trend.H - trend.P * 2)) / 3"
            class="t-grid"
          />
          <path v-for="s in seriesMeta" :key="s.k" :d="trend.area(s.k)" :fill="s.color" opacity="0.08" />
          <path
            v-for="s in seriesMeta"
            :key="'l' + s.k"
            :d="trend.line(s.k)"
            :stroke="s.color"
            stroke-width="2"
            fill="none"
            stroke-linejoin="round"
          />
          <circle
            v-for="(d, i) in trend.days"
            :key="'x' + i"
            :cx="trend.x(i)"
            :cy="trend.y(d.ask)"
            r="2.5"
            fill="#22d3ee"
          />
        </svg>
        <div class="trend-legend">
          <span v-for="s in seriesMeta" :key="s.k" class="tl-item"><i :style="{ background: s.color }"></i>{{ s.label }}</span>
          <span class="tl-tip">最近 {{ range }} 天 · 今日提问 {{ trend.days.length ? trend.days[trend.days.length - 1].ask : 0 }} · 做题正确率 {{ quizRate != null ? quizRate + '%' : '—' }}</span>
        </div>
      </div>

      <div class="sec-t">🔥 学习热力图（近 15 周打卡）</div>
      <div class="heat-card">
        <div class="heat-grid">
          <div v-for="(week, wi) in heat.weeks" :key="wi" class="heat-week">
            <div
              v-for="(d, di) in week"
              :key="di"
              class="heat-cell"
              :style="{ background: heatColor(Math.max(d.cnt, d.min), heat.max) }"
              :title="d.key + ' · 学习 ' + d.cnt + ' 次 · ' + d.min + ' 分钟'"
            ></div>
          </div>
        </div>
        <div class="heat-legend">
          <span>少</span>
          <i style="background: rgba(34,211,238,0.2)"></i>
          <i style="background: rgba(34,211,238,0.5)"></i>
          <i style="background: rgba(34,211,238,0.85)"></i>
          <span>多</span>
        </div>
      </div>

      <div class="sec-t">🏅 成绩趋势（最近 {{ scoreTrend.list.length }} 次考试）</div>
      <div class="trend-card">
        <div v-if="!scoreTrend.list.length" class="empty"><div class="empty-i">📉</div><div class="empty-t">暂无考试记录</div><div class="empty-d">去「模拟组卷 / 整卷」考一次，这里会画你的正确率曲线</div></div>
        <svg v-else :viewBox="'0 0 ' + scoreTrend.W + ' ' + scoreTrend.H" class="trend-svg">
          <line :x1="0" :x2="scoreTrend.W" :y1="scoreTrend.goalY" :y2="scoreTrend.goalY" stroke="#fbbf24" stroke-dasharray="6 5" />
          <path :d="scoreTrend.line" stroke="#34d399" stroke-width="2.4" fill="none" stroke-linejoin="round" />
          <circle v-for="(d, i) in scoreTrend.list" :key="'s' + i" :cx="scoreTrend.x(i)" :cy="scoreTrend.y(d.rate)" r="3.4" fill="#34d399" />
          <text v-for="(d, i) in scoreTrend.list" :key="'t' + i" :x="scoreTrend.x(i)" :y="scoreTrend.y(d.rate) - 7" text-anchor="middle" class="radar-label">{{ d.rate }}%</text>
        </svg>
        <div class="trend-legend"><span class="tl-item"><i style="background:#34d399"></i>正确率</span><span class="tl-item"><i style="background:#fbbf24"></i>目标 {{ store.cfg.goalScore }}%</span><span class="tl-tip">最近 {{ scoreTrend.list.length }} 次考试 · 每次 {{ scoreTrend.list[scoreTrend.list.length-1] ? scoreTrend.list[scoreTrend.list.length-1].n + ' 题' : '' }}</span></div>
        <div v-if="plateRate.length" class="plate-rate">
          <div class="pr-t">📊 按板块正确率（全部做题 · ↑较前半程提升）</div>
          <div v-for="pr in plateRate" :key="pr.k" class="pr-row">
            <span class="pr-name">{{ pr.k }}</span>
            <span class="pr-bar"><i :style="{ width: pr.rate + '%' }"></i></span>
            <span class="pr-num">{{ pr.rate }}% · {{ pr.done }}题</span>
            <span class="pr-delta" :class="pr.delta == null ? '' : (pr.delta >= 0 ? 'up' : 'down')">{{ pr.delta == null ? '—' : (pr.delta >= 0 ? '↑' : '↓') + Math.abs(pr.delta) }}</span>
          </div>
        </div>
      </div>

      <div class="sec-t">🎯 板块掌握度雷达</div>
      <div class="radar-card">
        <svg :viewBox="'0 0 ' + radar.W + ' ' + radar.H" class="radar-svg">
          <polygon
            v-for="(r, i) in radar.rings"
            :key="i"
            :points="r"
            fill="none"
            stroke="rgba(255,255,255,0.14)"
            stroke-width="1"
          />
          <polygon :points="radar.poly" fill="rgba(34,211,238,0.22)" stroke="#22d3ee" stroke-width="1.6" />
          <text
            v-for="a in radar.axes"
            :key="a.label"
            :x="a.x"
            :y="a.y"
            text-anchor="middle"
            class="radar-label"
          >{{ a.label }} {{ a.val }}</text>
        </svg>
        <div class="radar-tip">掌握度按错题数与复盘率估算：错题越少、复盘越勤越高；无数据板块按 0 绘制并标注「暂无」。</div>
      </div>

      <div class="sec-t">📚 细分题型掌握度</div>
      <div class="subm-card">
        <div v-if="!mastery.some((p) => p.v != null)" class="empty">
          <div class="empty-i">📊</div>
          <div class="empty-t">还没有做题记录</div>
          <div class="empty-d">去「单题快练 / 模拟组卷」做题，这里会按 板块 + 细分题型 实时统计你的掌握度</div>
        </div>
        <div v-for="(p, i) in mastery" :key="p.key" class="subm-plate">
          <div class="subm-hd">
            <span class="sp-name">{{ p.label }}</span>
            <span v-if="p.v != null" class="sp-v" :class="p.v >= 80 ? 'ok' : p.v >= 60 ? 'mid' : 'no'">{{ p.v }}</span>
            <span v-else class="sp-v none">未开始</span>
            <span v-if="p.attempts" class="sp-attr">{{ p.attempts }} 题</span>
          </div>
          <div v-if="p.v != null" class="subm-bar"><i :style="{ width: p.v + '%' }"></i></div>
          <div v-if="p.variants.length" class="subm-vars">
            <div v-for="x in p.variants.slice(0, 6)" :key="x.k" class="subm-var">
              <span class="sv-name">{{ x.k }}</span>
              <span class="sv-bar"><i :style="{ width: Math.max(3, x.rate) + '%' }"></i></span>
              <span class="sv-rate">{{ x.done }}题 · {{ x.rate }}%</span>
            </div>
          </div>
          <details v-if="kpoints[i] && kpoints[i].list.length" class="subm-kp" style="margin-top:6px">
            <summary style="cursor:pointer;font-size:12.5px;color:var(--text2)">🔍 考点下钻（{{ kpoints[i].list.length }} 个考点）</summary>
            <div class="subm-vars" style="margin-top:6px">
              <div v-for="x in kpoints[i].list" :key="x.k" class="subm-var">
                <span class="sv-name">{{ x.k }}</span>
                <span class="sv-bar"><i :style="{ width: Math.max(3, x.rate || 0) + '%' }"></i></span>
                <span class="sv-rate">{{ x.done }}题{{ x.wrong ? ' · 错' + x.wrong : '' }}{{ x.rev ? ' · 复盘' + x.rev : '' }}{{ x.rate != null ? ' · ' + x.rate + '%' : '' }}</span>
              </div>
            </div>
          </details>
        </div>
      </div>

      <div class="sec-t">📊 板块提问分布</div>
      <div v-if="!banKuai.arr.length" class="empty">
        <div class="empty-i">🧭</div>
        <div class="empty-t">还没有提问记录</div>
        <div class="empty-d">去对话页问几道题，这里会按板块统计你的练习分布</div>
      </div>
      <div v-else class="bk-chart">
        <div v-for="[b, n] in banKuai.arr" :key="b" class="bk-row">
          <span class="bk-name">{{ b }}</span>
          <div class="bk-bar"><div class="bk-fill" :style="{ width: (n / banKuai.max) * 100 + '%' }"></div></div>
          <span class="bk-num">{{ n }}</span>
        </div>
      </div>

      <div class="sec-t">✅ 错题复盘率</div>
      <div class="rev-prog">
        <div class="rp-inner" :style="{ width: revRate + '%' }"></div>
        <span class="rp-l">{{ revRate }}%</span>
      </div>
      <div style="font-size: 11px; color: var(--text3); margin-top: 4px">
        已复盘 {{ store.wqs.filter((q) => q.reviewed).length }} / {{ store.wqs.length }} 题 — 复盘到位是提分关键
      </div>

      <div class="sec-t">📄 明细（点击上方卡片查看）</div>
    </div>
    <div class="ov" :class="{ show }" @click.self="show = false">
      <div class="pnl">
        <h3>📊 明细</h3>
        <pre style="white-space: pre-wrap; font-size: 13px; font-family: inherit">{{ detail }}</pre>
        <div class="pnl-btns"><button class="btn btn-gh" @click="show = false">关闭</button></div>
      </div>
    </div>
  </div>
</template>