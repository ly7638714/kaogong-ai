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
  // 单位：内部存「元/千 token」 = 官方「元/百万 token」÷ 1000；美元模型按 1 USD ≈ ¥7 折算。
  // 下列为 2026-09 联网核验的公开价默认参考，可在「💰 用量与花费」面板改成你账单真实单价。
  // 注意：priceOf 按「模型名包含该 key」做子串匹配，故同族里「更具体/更长」的 key 必须排在「更泛化」的 key 之前，否则会被泛化 key 截胡。

  // ---------- DeepSeek（2026-08-17 起峰谷定价，官方价格页 2026-09 核验）----------
  // 高峰：北京 09:00–12:00、14:00–18:00（其余为空闲档，价格×0.5）；缓存命中输入更低。下表取「空闲档·缓存未命中」作默认。
  'deepseek-v4-flash-vision-exp': { in: 0.0015, out: 0.0045, note: 'DeepSeek 官方·V4-Flash-Vision-Exp 空闲档·缓存未命中 输入1.5/输出4.5 元每百万(高峰×2；图片转 token 计费)', src: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing' },
  'deepseek-v4-pro': { in: 0.0045, out: 0.0135, note: 'DeepSeek 官方·V4-Pro 空闲档·缓存未命中 输入4.5/输出13.5 元每百万(高峰×2；缓存命中更低)', src: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing' },
  'deepseek-v4-flash': { in: 0.0015, out: 0.0045, note: 'DeepSeek 官方·V4-Flash 空闲档·缓存未命中 输入1.5/输出4.5 元每百万(高峰×2)', src: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing' },
  'deepseek-reasoner': { in: 0.0015, out: 0.0045, note: 'DeepSeek 官方·V4-Flash 思考模式(兼容名) 价同 V4-Flash；思考会多产出输出 token', src: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing' },
  'deepseek-chat': { in: 0.0015, out: 0.0045, note: 'DeepSeek 官方·V4-Flash 非思考(兼容名) 价同 V4-Flash', src: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing' },

  // ---------- 智谱 GLM（open.bigmodel.cn/pricing 2026-09 核验；取 [32+) 档为默认）----------
  'glm-4.7-flash': { in: 0, out: 0, note: '智谱官方·GLM-4.7-Flash 免费', src: 'https://open.bigmodel.cn/pricing' },
  'glm-4.5-air': { in: 0.0012, out: 0.008, note: '智谱官方·GLM-4.5-Air [32,128) 输入1.2/输出8 元每百万', src: 'https://open.bigmodel.cn/pricing' },
  'glm-4.6v': { in: 0.002, out: 0.006, note: '智谱官方·GLM-4.6V [32,128) 输入2/输出6 元每百万', src: 'https://open.bigmodel.cn/pricing' },
  'glm-5.3': { in: 0.008, out: 0.028, note: '智谱官方·GLM-5.3 输入8/输出28 元每百万(新品)', src: 'https://open.bigmodel.cn/pricing' },
  'glm-5.2': { in: 0.008, out: 0.028, note: '智谱官方·GLM-5.2 输入8/输出28 元每百万', src: 'https://open.bigmodel.cn/pricing' },
  'glm-5.1': { in: 0.008, out: 0.028, note: '智谱官方·GLM-5.1 [32+) 输入8/输出28 元每百万', src: 'https://open.bigmodel.cn/pricing' },
  'glm-5v': { in: 0.007, out: 0.026, note: '智谱官方·GLM-5V-Turbo [32+) 输入7/输出26 元每百万', src: 'https://open.bigmodel.cn/pricing' },
  'glm-5-turbo': { in: 0.007, out: 0.026, note: '智谱官方·GLM-5-Turbo [32+) 输入7/输出26 元每百万', src: 'https://open.bigmodel.cn/pricing' },
  'glm-4.7': { in: 0.004, out: 0.016, note: '智谱官方·GLM-4.7 [32,200) 输入4/输出16 元每百万', src: 'https://open.bigmodel.cn/pricing' },
  'glm-4.6': { in: 0.002, out: 0.006, note: '智谱官方·GLM-4.6V 参考 输入2/输出6 元每百万', src: 'https://open.bigmodel.cn/pricing' },
  'glm-4.5': { in: 0.0012, out: 0.008, note: '智谱官方·GLM-4.5-Air 参考 输入1.2/输出8 元每百万', src: 'https://open.bigmodel.cn/pricing' },
  'glm-4v': { in: 0.004, out: 0.012, note: '智谱官方·GLM-4.5V 参考 输入4/输出12 元每百万', src: 'https://open.bigmodel.cn/pricing' },
  'glm-5': { in: 0.006, out: 0.022, note: '智谱官方·GLM-5 [32+) 输入6/输出22 元每百万', src: 'https://open.bigmodel.cn/pricing' },
  'glm-4': { in: 0.002, out: 0.004, note: '智谱官方·GLM-4（旧模型）输入2/输出4 元每百万', src: 'https://open.bigmodel.cn/pricing' },

  // ---------- 通义千问 Qwen（阿里云百炼官方定价 2026-09 核验）----------
  'qwen3-max': { in: 0.007, out: 0.028, note: '阿里云百炼·Qwen3-Max 输入7/输出28 元每百万(旗舰)', src: 'https://help.aliyun.com/zh/model-studio/models' },
  'qwen3-flash': { in: 0.000367, out: 0.002936, note: '阿里云百炼·Qwen3-Flash 输入0.367/输出2.936 元每百万(轻量高速)', src: 'https://help.aliyun.com/zh/model-studio/models' },
  'qwen-max': { in: 0.02, out: 0.06, note: '阿里云百炼·qwen-max 输入0.02/输出0.06 元每千tokens(=20/60 元每百万)', src: 'https://www.aliyun.com/product/bailian/pricing' },
  'qwen-plus': { in: 0.0008, out: 0.002, note: '阿里云百炼·qwen-plus 输入0.0008/输出0.002 元每千tokens(=0.8/2 元每百万)', src: 'https://www.aliyun.com/product/bailian/pricing' },
  'qwen-turbo': { in: 0.0003, out: 0.0006, note: '阿里云百炼·qwen-turbo 输入0.0003/输出0.0006 元每千tokens(=0.3/0.6 元每百万)', src: 'https://www.aliyun.com/product/bailian/pricing' },
  'qwen-vl': { in: 0.012, out: 0.012, note: '阿里云百炼·Qwen-VL 输入0.012/输出0.012 元每千tokens', src: 'https://help.aliyun.com/zh/model-studio/models' },
  'qwen': { in: 0.0008, out: 0.002, note: '通义·Qwen 通用参考（按 qwen-plus 档 0.8/2 元每百万）', src: 'https://help.aliyun.com/zh/model-studio/models' },

  // ---------- OpenAI（官方价 2026-08 核验；美元按 ¥7 折算 元每百万 → ÷1000 得 元每千token）----------
  'gpt-5-mini': { in: 0.00175, out: 0.014, note: 'OpenAI 官方·GPT-5-mini $0.25/$2 每百万(≈¥1.75/¥14)', src: 'https://developers.openai.com/api/docs/pricing' },
  'gpt-5': { in: 0.00875, out: 0.07, note: 'OpenAI 官方·GPT-5 $1.25/$10 每百万(≈¥8.75/¥70)', src: 'https://developers.openai.com/api/docs/pricing' },
  'gpt-4o-mini': { in: 0.00105, out: 0.0042, note: 'OpenAI 官方·GPT-4o-mini $0.15/$0.6 每百万(≈¥1.05/¥4.2)', src: 'https://developers.openai.com/api/docs/pricing' },
  'gpt-4o': { in: 0.0175, out: 0.07, note: 'OpenAI 官方·GPT-4o $2.5/$10 每百万(≈¥17.5/¥70)', src: 'https://developers.openai.com/api/docs/pricing' },
  'gpt': { in: 0.0175, out: 0.07, note: 'OpenAI 通用参考（按 GPT-4o 档 $2.5/$10 每百万）', src: 'https://developers.openai.com/api/docs/pricing' },

  'default': { in: 0.001, out: 0.002, note: '其他/自定义（保守参考 1/2 元每百万，请改成你账单实际价）' },

  // —— 2026-09-02 联网核验追加（美元按 ¥7/1 折算；仅列已核实价，未核验厂商请到各自官网账单为准，勿瞎填）——
  'kimi-k3': { in: 0.021, out: 0.105, note: '月之暗面官方·Kimi K3 $3/$15 每百万(≈¥21/¥105) 2026-07', src: 'https://platform.moonshot.cn/docs/pricing/chat' },
  'kimi-k2.6': { in: 0.00665, out: 0.028, note: '月之暗面官方·K2.6 $0.95/$4 每百万(≈¥6.65/¥28) 2026-04', src: 'https://platform.moonshot.cn/docs/pricing/chat' },
  'gemini-3.7-flash': { in: 0.00525, out: 0.02625, note: 'Google 官方·Gemini 3.7 Flash 促销 $0.75/$3.75 每百万(≈¥5.25/¥26.25) 2026-08', src: 'https://ai.google.dev/gemini-api/docs/pricing' },
  'gemini-3.1-pro': { in: 0.014, out: 0.084, note: 'Google 官方·Gemini 3.1 Pro $2/$12 每百万(≈¥14/¥84) 2026-02', src: 'https://ai.google.dev/gemini-api/docs/pricing' },
  'doubao-seed-1.6-flash': { in: 0.00015, out: 0.0015, note: '火山官方·Doubao-Seed-1.6-Flash 0-32k 输入¥0.15/输出¥1.5 每百万(官方2026-07)', src: 'https://www.volcengine.com/docs/82379/1544106' },
  ttsPer1k: 0.002,
  cloneFee: 0.05,
  // 各家真人朗读引擎单价（元/千字）：已实测核验的写真实价，未核验走上方 ttsPer1k 兜底（UI 可改）
  ttsPrices: { dash: 0.08, glm: 0.05, openai: 0.02, edge: 0, sys: 0 }
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
// 朗读单价（元/千字）：优先按引擎真实价（已核验：dash=qwen3-tts ¥0.8/万字符=0.08/千字），
// 未核验引擎回退 ttsPer1k（可在「计价表」里改成你账单实际值）
export function getTtsPrice(prov) {
  const p = getPrices()
  const m = (p.ttsPrices || {})
  if (prov && m[prov] != null) return Number(m[prov]) > 0 ? Number(m[prov]) : 0
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
// 批次3.4 今日预算熔断：xc_cost_budget 元/日，0=不限制
export function getBudget() {
  try { return Number(localStorage.getItem('xc_cost_budget')) || 0 } catch (e) { return 0 }
}
export function setBudget(v) {
  const n = Math.max(0, Number(v) || 0)
  try { localStorage.setItem('xc_cost_budget', String(n)) } catch (e) {}
  return n
}
export function todaySpend() { try { return costStats().today } catch (e) { return 0 } }
export function budgetBlocked() {
  const b = getBudget()
  return b > 0 && todaySpend() >= b
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
