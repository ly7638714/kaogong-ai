// replyVerify —— 讲解回复本地五查（P1-1，纯函数；仿 quizVerify 思路，供对话/萌宠回答后自查）
import { detectAskDir } from './intentProbe'

// 1) 方向：题干选“非”时，警惕把正确项讲成“对/能推出/属于”的正面表述
function directionCheck(askDir, reply) {
  if (askDir !== '非') return []
  const t = String(reply || '')
  const warn = []
  // 反向设问却用“正确的是/能够推出/应当选”作结，且结论句明显没有否定词 → 可疑
  const concl = t.match(/(?:答案|应选|选|正确项|应填)[^\n。]{0,18}?([A-D])/g) || []
  if (concl.length && /(正确的是|是正确的|正确|能够推出|应当选|符合文意)/.test(t) && !/不选|排除|错误项|不能推出|不正确|错误$/.test(t)) {
    warn.push('题干为“选非/不能推出/错误”设问，结论句宜以“×项错误/不能推出”措辞，勿写“正确的是…”')
  }
  return warn
}

// 2) 时间口径：同比=上年同期、环比=上一统计期；累计/当月别混
const BASIS = { 同比: '上年同期', 环比: '上一统计期(如上月/上季)' }
function timeBasisCheck(q, reply) {
  const warn = []
  const r = String(reply || '')
  for (const k of Object.keys(BASIS)) {
    if (String(q || '').includes(k)) {
      if (!r.includes(k) && /(基期|去年|上年|上个月)/.test(r)) {
        const m = r.match(/(去年|上年|上个月)/)
        const want = BASIS[k]
        if (k === '同比' && m && /上个月|上月/.test(m[0])) warn.push('题干同比(“与' + want + '比”)，回复却用“上月/上个月”作基期——疑似环比口径')
        if (k === '环比' && m && /去年|上年/.test(m[0])) warn.push('题干环比(“与' + want + '比”)，回复却用“去年/上年”作基期——疑似同比口径')
      }
    }
  }
  if (/(累计|1~|1-|1—)/.test(String(q || '')) && /当月|单月/.test(String(q || '')) && /1~/.test(r) === false && /累计/.test(r) && /当月|单月/.test(r) === false) warn.push('题干含“累计-单月”口径，回复需区分“累计值与当期值”的减法关系')
  return warn
}

// 3) 单位/量级：题干给亿/万/%,结论句若出现跨量级且无换算说明 → 提示
function unitCheck(q, reply) {
  const warn = []
  const t = String(reply || '')
  const qq = String(q || '')
  const pair = [['亿', '万'], ['万亿', '亿'], ['%', '‰'], ['吨', '万吨'], ['元', '万元']].find(([a, b]) => qq.includes(a) && qq.includes(b))
  if (pair && t.includes(pair[0]) && t.includes(pair[1]) && !/换算|即|相当于/.test(t)) {
    warn.push('题干同时含“' + pair[0] + '”与“' + pair[1] + '”，回复若混用需写明换算关系，防止量级错')
  }
  if (/(增加|增长|减少).{0,6}?[0-9.]+%/.test(qq) && /增长(了|到).{0,4}?[0-9.]+%/.test(t)) warn.push('确认回复的“增长x%”是增长率还是百分点变化，二者口径不同')
  return warn
}

// 4) 公式比对：命中方法卡时，卡内关键公式若在回复里出现但形态相反/漏分母 → 提示（限定强信号）
export function formulaCheck(plate6, q, reply, cardSteps) {
  const warn = []
  const r = String(reply || '')
  const qq = String(q || '')
  const steps = Array.isArray(cardSteps) ? cardSteps.join('') : String(cardSteps || '')
  const tpl = [
    { on: /增长|增量|增加了/, inSteps: /现期\s*[×x*]\s*r\s*\/\s*\(\s*1\s*\+\s*r\s*\)|现期[×x*]r\/\(1\+r\)/, good: /(1\+r|n\+1)/, msg: '增长量=现期×r/(1+r)，回复若只写“现期×r”而未除(1+r)，属漏分母' },
    { on: /基期|去年|上年/, inSteps: /基期\s*=\s*现期\s*[÷/]\s*\(\s*1\s*\+\s*r\s*\)|基期=现期÷\(1\+r\)/, good: /(1\+r|\(1-r\)|÷\(1\+|\/\(1\+)/, msg: '基期=现期÷(1+r)，勿把现期直接当基期或乘(1+r)' },
    { on: /平均.*增速|人均.*增长|单位.*增/, inSteps: /(r总-r份|r分子-r分母|\(r总-r份\)\/\(1\+r份\))/, good: /(r总|r分子|分母|1\+)/, msg: '平均数增长率=(总量增速-份数增速)/(1+份数增速)，分子分母勿颠倒' }
  ]
  if (!steps) return warn
  for (const rule of tpl) {
    if (!rule.on.test(qq)) continue
    if (!rule.inSteps.test(steps)) continue
    if (rule.good.test(r)) continue
    // 回复里连该公式的骨架都没出现时才提示（避免误报自由表述）
    if (/(增长量\s*=|现期\s*[×x*]\s*r|[÷/]\s*\(\s*1\s*\+|[×x*]r|n\+1|\(1-r\))/.test(r)) warn.push(rule.msg)
  }
  return warn
}

// 汇总五查（方向/时间/单位/公式/完整性）
export function verifyReply({ question = '', reply = '', plate6 = '', askDir, cardSteps = null } = {}) {
  const q = String(question || '')
  const r = String(reply || '')
  const dir = askDir || detectAskDir(q)
  const warnings = []
  warnings.push(...directionCheck(dir, r))
  warnings.push(...timeBasisCheck(q, r))
  warnings.push(...unitCheck(q, r))
  if (plate6 && cardSteps) warnings.push(...formulaCheck(plate6, q, r, cardSteps))
  if (!r) warnings.push('回复为空')
  return { pass: warnings.length === 0, warnings, dir }
}