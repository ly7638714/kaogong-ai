// costTrack.js —— AI 用量与花费实时追踪（透明计费，让用户心里有底）
// 记录每次 AI 调用（文字/视觉/图形增强/朗读/克隆等）的 功能/模型/图文类型/输入输出思考token/耗时/费用明细，
// 持久化到 localStorage(xc_cost)，提供「今日/本周/本月/累计 + 按功能/按模型/按类型/按提供商 + 总token」全维度统计，
// 并在调用进行中实时点亮状态（costLive），顶栏徽标实时跳动。
import { reactive } from 'vue'

const KEY = 'xc_cost'
const MAX_RECORDS = 3000

// ---------- 计价表（元/千 token；朗读为 元/千字；克隆为 元/次）----------
// 默认值按主流公开价估算；用户可在「💰 用量与花费」面板里自行改成自己账单的真实单价。
export const COST_FEATURES = {
  chat: '💬 文字问答',
  vision: '👁️ 视觉识别',
  fig: '🖼 图形增强',
  tts: '🗣️ 朗读',
  clone: '🧬 音色克隆',
  exam: '📝 AI 出题',
  pet: '🐾 萌宠对话',
  polish: '📝 AI 整理'
}
export const COST_KINDS = { text: '📝 纯文字', img: '🖼 图文/图片', audio: '🔊 音频' }
export const DEF_PRICES = {
  // 官方公开价（2026-08 基准）：单位 元/百万 token（内部换算为 元/千 token）。美元模型按 1 USD ≈ ¥7 折算。
  // DeepSeek 2026-08 起实行峰谷定价，下表取「平时」档；缓存命中输入低至 0.02-0.05 元/百万，高峰时段约 ×2-3，以官方账单为准。
  'deepseek-chat': { in: 0.001, out: 0.002, note: 'DeepSeek 官方·V4-Flash 非思考(平时档) 输入1元/百万·输出2元/百万', src: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/' },
  'deepseek-reasoner': { in: 0.001, out: 0.004, note: 'DeepSeek 官方·V4-Flash 思考模式(平时档) 输出价更高', src: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/' },
  'deepseek-v4-flash': { in: 0.001, out: 0.002, note: 'DeepSeek 官方·V4-Flash(平时档) 输入1元/百万·输出2元/百万', src: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/' },
  'deepseek-v4-flash-vision-exp': { in: 0.001, out: 0.002, note: 'DeepSeek 官方·视觉版(平时档) 同 V4-Flash', src: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/' },
  'deepseek-v4-pro': { in: 0.003, out: 0.006, note: 'DeepSeek 官方·V4-Pro(平时档) 输入3元/百万·输出6元/百万', src: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/' },
  'glm-4': { in: 0.002, out: 0.004, note: '智谱官方·GLM-4（旧模型）', src: 'https://open.bigmodel.cn/pricing' },
  'glm-4.5': { in: 0.0043, out: 0.0158, note: '智谱官方·GLM-4.5 $0.6/$2.2 每百万(≈¥4.3/¥15.8)', src: 'https://open.bigmodel.cn/pricing' },
  'glm-4.6': { in: 0.0043, out: 0.0158, note: '智谱官方·GLM-4.6 $0.6/$2.2 每百万(≈¥4.3/¥15.8)', src: 'https://open.bigmodel.cn/pricing' },
  'glm-4v': { in: 0.002, out: 0.006, note: '智谱官方·GLM-4V 视觉(参考)', src: 'https://open.bigmodel.cn/pricing' },
  'glm-5v': { in: 0.005, out: 0.022, note: '智谱官方·GLM-5V-Turbo 输入5元/百万·输出22元/百万', src: 'https://open.bigmodel.cn/pricing' },
  'qwen': { in: 0.002, out: 0.006, note: '通义官方·Qwen-VL 等（参考 ¥2/¥6 每百万）', src: 'https://help.aliyun.com/zh/model-studio/models' },
  'gpt-4o': { in: 0.0178, out: 0.071, note: 'OpenAI 官方·GPT-4o $2.5/$10 每百万(≈¥17.8/¥71)', src: 'https://developers.openai.com/api/docs/models/gpt-4o' },
  'gpt-4o-mini': { in: 0.0011, out: 0.0043, note: 'OpenAI 官方·GPT-4o-mini $0.15/$0.6 每百万(≈¥1.1/¥4.3)', src: 'https://developers.openai.com/api/docs/models/gpt-4o' },
  'default': { in: 0.001, out: 0.002, note: '其他/自定义（保守参考 1/2 元每百万）' },
  ttsPer1k: 0.002,
  cloneFee: 0.05
}
export function getPrices() {
  try {
    const raw = localStorage.getItem(KEY + '_p')
    if (raw) return { ...DEF_PRICES, ...JSON.parse(raw) }
  } catch (e) {}
  return { ...DEF_PRICES }
}
export function savePrices(p) {
  try { localStorage.setItem(KEY + '_p', JSON.stringify(p)) } catch (e) {}
}
// 朗读单价（元/千字）与克隆固定费（元/次），随价格表一起存储，可在 UI 里改
export function getTtsPrice() {
  const p = getPrices()
  return Number(p.ttsPer1k) > 0 ? Number(p.ttsPer1k) : 0.002
}
export function getCloneFee() {
  const p = getPrices()
  return Number(p.cloneFee) > 0 ? Number(p.cloneFee) : 0.05
}
function priceOf(model) {
  const m = String(model || '').toLowerCase()
  const p = getPrices()
  for (const k of Object.keys(p)) {
    if (k !== 'default' && m.includes(k)) return p[k]
  }
  return p['default'] || DEF_PRICES['default']
}
// 估算 token：中文约 0.8 token/字，英文约 1 token/3.5 字符
export function estimateTokens(text) {
  const s = String(text || '')
  const cjk = (s.match(/[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/g) || []).length
  const other = s.length - cjk
  return Math.max(1, Math.ceil(cjk * 0.8 + other / 3.5))
}
// 计算费用：返回 { in, out, fixed, total }，按 元/千token
export function calcCost(model, inT, outT, opt = {}) {
  const pr = priceOf(model)
  const inCost = (inT / 1000) * pr.in
  const outCost = (outT / 1000) * pr.out
  const fixed = Number(opt.fixed || 0)
  return {
    in: Math.round(inCost * 100000) / 100000,
    out: Math.round(outCost * 100000) / 100000,
    fixed: Math.round(fixed * 100000) / 100000,
    total: Math.round((inCost + outCost + fixed) * 100000) / 100000
  }
}

// ---------- 进行中调用（实时状态）----------
export const costLive = reactive({ active: false, feature: '', kind: '', provider: '', model: '', beganAt: 0 })
export function beginCost(o) {
  costLive.active = true
  costLive.feature = o.feature || 'chat'
  costLive.kind = o.kind || ''
  costLive.provider = o.provider || ''
  costLive.model = o.model || ''
  costLive.beganAt = Date.now()
}
export function endCost() {
  costLive.active = false
  costLive.feature = ''
  costLive.kind = ''
  costLive.provider = ''
  costLive.model = ''
  costLive.beganAt = 0
}

// ---------- 记录 ----------
export const costState = reactive({ list: load(), updated: Date.now() })
function load() {
  try {
    const raw = localStorage.getItem(KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch (e) { return [] }
}
function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(costState.list.slice(-MAX_RECORDS)))
  } catch (e) {}
  costState.updated = Date.now()
}
// 记录一次调用。inTokens/outTokens 传数字则精确（含 usage 返回），传 null 则按文本估算。
export function recordCost(o) {
  const now = Date.now()
  const inT = typeof o.inTokens === 'number' ? o.inTokens : estimateTokens(o.inText || '')
  const outT = typeof o.outTokens === 'number' ? o.outTokens : estimateTokens(o.outText || '')
  const reasonT = typeof o.reasonTokens === 'number' ? o.reasonTokens : 0
  const sec = typeof o.sec === 'number' ? Math.round(o.sec) : 0
  const fe = o.cost != null ? { in: 0, out: 0, fixed: 0, total: o.cost } : calcCost(o.model, inT, outT, o)
  costState.list.push({
    t: now,
    feature: o.feature || 'chat',
    provider: o.provider || '',
    model: o.model || '',
    kind: o.kind || '',
    inT, outT, reasonT,
    exact: o.exact !== false && (typeof o.inTokens === 'number' || typeof o.outTokens === 'number'),
    sec,
    inCost: fe.in, outCost: fe.out, fixedCost: fe.fixed,
    cost: Math.round(fe.total * 100000) / 100000,
    note: o.note || ''
  })
  if (costState.list.length > MAX_RECORDS) costState.list = costState.list.slice(-MAX_RECORDS)
  endCost()
  persist()
  return fe.total
}
export function clearCost(scope) {
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0)
  if (scope === 'today') costState.list = costState.list.filter((r) => r.t < dayStart.getTime())
  else if (scope === 'week') {
    const d = new Date(); const dow = (d.getDay() + 6) % 7
    const ws = new Date(d); ws.setDate(d.getDate() - dow); ws.setHours(0, 0, 0, 0)
    costState.list = costState.list.filter((r) => r.t < ws.getTime())
  } else if (scope === 'month') {
    const ms = new Date(); ms.setDate(1); ms.setHours(0, 0, 0, 0)
    costState.list = costState.list.filter((r) => r.t < ms.getTime())
  } else costState.list = []
  persist()
}

// ---------- 统计 ----------
export function costStats() {
  const list = costState.list
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0)
  const d = new Date(); const dow = (d.getDay() + 6) % 7
  const weekStart = new Date(d); weekStart.setDate(d.getDate() - dow); weekStart.setHours(0, 0, 0, 0)
  const monthStart = new Date(d); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
  let today = 0, week = 0, month = 0, total = 0
  let todayN = 0, weekN = 0, monthN = 0, totalN = 0
  let totalInT = 0, totalOutT = 0, totalReasonT = 0
  const byFeat = {}, byModel = {}, byKind = {}, byProv = {}
  for (const r of list) {
    total += r.cost; totalN++
    totalInT += r.inT || 0; totalOutT += r.outT || 0; totalReasonT += r.reasonT || 0
    if (r.t >= dayStart.getTime()) { today += r.cost; todayN++ }
    if (r.t >= weekStart.getTime()) { week += r.cost; weekN++ }
    if (r.t >= monthStart.getTime()) { month += r.cost; monthN++ }
    byFeat[r.feature] = (byFeat[r.feature] || 0) + r.cost
    const mk = r.model || r.provider || '?'
    byModel[mk] = (byModel[mk] || 0) + r.cost
    byKind[r.kind || 'text'] = (byKind[r.kind || 'text'] || 0) + r.cost
    byProv[r.provider || '?'] = (byProv[r.provider || '?'] || 0) + r.cost
  }
  const r2 = (n) => Math.round(n * 100) / 100
  return {
    today: r2(today), week: r2(week), month: r2(month), total: r2(total),
    todayN, weekN, monthN, totalN,
    totalInT, totalOutT, totalReasonT, totalT: totalInT + totalOutT + totalReasonT,
    byFeat, byModel, byKind, byProv,
    list: [...list].reverse().slice(0, 100)
  }
}
export function fmtCost(n) { return '¥' + (Math.round(Number(n || 0) * 100) / 100).toFixed(2) }
export function fmtTok(n) {
  const v = Number(n || 0)
  if (v >= 10000) return (v / 10000).toFixed(2) + 'w'
  if (v >= 1000) return (v / 1000).toFixed(1) + 'k'
  return String(v)
}
export function fmtTime(t) {
  const dt = new Date(t)
  const p = (n) => String(n).padStart(2, '0')
  return p(dt.getMonth() + 1) + '-' + p(dt.getDate()) + ' ' + p(dt.getHours()) + ':' + p(dt.getMinutes()) + ':' + p(dt.getSeconds())
}
