// difficulty.js —— 难度校准表（35号执行说明书·批次2-A，纯统计零 API）
// 题类实测正确率 p̂ = (ok + α)/(n + α + β)，Beta 先验向 0.5 收缩（α=β=1.5）。
// 标定对象是「题类 cls = 板块|题型|请求难度档|genVer」（见 attemptLog.clsOf），不是单题（35 §3.1）。
// 能力：难度档与用户真实水平脱钩 → 出题时按实测偏差动态调整难度措辞（唯一真·用数据修 prompt）。
import { readAttempts, GEN_VER } from './attemptLog'

export const ALPHA = 1.5
export const BETA = 1.5
export const MIN_CLS_N = 5 // 题类样本门槛：n≥5 才可用题类标定，否则用板块级均值代替
export const MIN_PLATE_N = 8 // 板块样本门槛：n≥8 才可用板块均值（冷启动阶段不给数字）
const DIFF_LABEL = { easy: '易', mid: '中', hard: '难', real: '真题级' }
// 各档目标正确率区间（对齐 professor.js DIFF_STEM / DIFF_LEVELS）
const TARGET = { easy: [0.7, 0.85], mid: [0.5, 0.62], hard: [0.3, 0.42], real: [0.15, 0.35] }

// Beta 平滑后验正确率：n=0 → (α)/(α+β) = 0.5
export function betaP(ok, n) {
  const nn = Number(n) >= 0 ? Number(n) : 0
  const o = Math.max(0, Math.min(nn, Number(ok) || 0))
  return (o + ALPHA) / (nn + ALPHA + BETA)
}

// 单次聚合：attempts → { byCls: {cls:{n,ok,p}}, byPlate: {plate:{n,ok,p}} }
export function aggregate(attempts) {
  const byCls = {}
  const byPlate = {}
  ;(attempts || []).forEach((a) => {
    if (!a || !a.cls) return
    if (a.genVer && a.genVer !== GEN_VER) return // 只统计当前生成配置版本，防新旧分布混样（35 §3.1）
    const c = byCls[a.cls] || (byCls[a.cls] = { n: 0, ok: 0 })
    c.n++
    if (a.ok) c.ok++
    const pl = a.plate || '未分类'
    const p = byPlate[pl] || (byPlate[pl] = { n: 0, ok: 0 })
    p.n++
    if (a.ok) p.ok++
  })
  const fin = (o) => ({ n: o.n, ok: o.ok, p: betaP(o.ok, o.n) })
  const clsOut = {}
  Object.keys(byCls).forEach((k) => { clsOut[k] = fin(byCls[k]) })
  const plateOut = {}
  Object.keys(byPlate).forEach((k) => { plateOut[k] = fin(byPlate[k]) })
  return { byCls: clsOut, byPlate: plateOut }
}

// 读作答事件流（带 5s 内存缓存：整卷并发出题时避免每题都 parse localStorage）
let _cache = null
let _cacheAt = 0
export function attemptsNow() {
  const t = Date.now()
  if (_cache && t - _cacheAt < 5000) return _cache
  try { _cache = readAttempts() } catch (e) { _cache = [] }
  _cacheAt = t
  return _cache
}
export function clearCache() {
  _cache = null
  _cacheAt = 0
}

// 校准表输出（供 stats/UI 质量报告）：{ byCls, byPlate }，键为完整 cls 键
export function difficultyTable(attempts) {
  return aggregate(attempts == null ? attemptsNow() : attempts)
}

// 为某一次出题生成【难度校准】注入片段；样本不足返回 ''（不给没统计基础的数字，35 §3.2）
// plate 板块 / variant 题型 / diff 请求难度档（easy|mid|hard|real）
export function calibrationHint(plate, variant, diff, attempts) {
  const d = TARGET[diff] ? diff : 'mid'
  const lo = TARGET[d][0]
  const hi = TARGET[d][1]
  const ag = aggregate(attempts == null ? attemptsNow() : attempts)
  const variantKey = String(variant || '').trim() || '综合'
  const clsKey = String(plate || '未分类') + '|' + variantKey + '|' + d + '|' + GEN_VER
  const plateKey = String(plate || '')
  const c = ag.byCls[clsKey]
  const pl = plateKey && ag.byPlate[plateKey]
  let s = null
  let label = '题类'
  if (c && c.n >= MIN_CLS_N) {
    s = c
  } else if (pl && pl.n >= MIN_PLATE_N) {
    s = pl
    label = '板块'
  }
  if (!s) return ''
  const p = s.p
  // 只在实际偏差明显（越出目标区间 ≥5 个百分点）时干预，避免每道题都堆长指令
  if (p >= lo - 0.05 && p <= hi + 0.05) return ''
  const vn = variantKey === '综合' ? '本题型' : ('本考点「' + variantKey + '」' + (label === '板块' ? '（板块级样本）' : ''))
  const dir = p < lo
    ? '低于目标区间 ' + lo + '~' + hi + '：请在保持考点不变的前提下适当降低计算复杂度、减少陷阱叠加层数，使正确率回到目标区间（题偏难）。'
    : '高于目标区间 ' + lo + '~' + hi + '：请适当增加拐弯/陷阱叠加层数或提高计算复杂度，使正确率回到目标区间（题偏易）。'
  return '【难度校准】' + vn + '「' + (DIFF_LABEL[d] || d) + '」档历史实测正确率 ' + p.toFixed(2) + '（n=' + s.n + '），' + dir
}

export { DIFF_LABEL }