// verifyCalc.js —— 【验算】程序复核（深化·AI题可算必验；零额外 API 调用）
// 数量关系/资料分析单题：当模型自附一行【验算】且两侧都是纯数字算式时，
// 程序真正求值并核对是否与所选答案数值相等。绝不误伤句式：
//  - 未附【验算】/答案选项非纯数字/算式含汉字单位或无法解析 → skip（ok:null，不惩罚）
//  - 能解析但数值不符 → ok:false（定向重出，交给 deadline 内下一次生成修正）
function norm(s) {
  return String(s == null ? '' : s)
    .normalize('NFKC')
    .replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/－/g, '-')
    .replace(/(?<=\d),(?=\d)/g, '') // 千分位逗号
}
// 极简安全求值器：expr -> number；失败抛错（调用方按 skip 处理）
function evalExpr(s) {
  let i = 0
  const toks = norm(s).replace(/\s+/g, '')
  const peek = () => toks[i]
  const num = () => {
    const m = /^\d+(?:\.\d+)?/.exec(toks.slice(i))
    if (!m) throw new Error('expect number at ' + i)
    i += m[0].length
    return parseFloat(m[0])
  }
  const factor = () => {
    const c = peek()
    if (c === '-') { i++; return -factor() }
    if (c === '+') { i++; return factor() }
    if (c === '(') { i++; const v = expr(); if (peek() !== ')') throw new Error('expect )'); i++; return v }
    if (c === ')' || c === undefined) throw new Error('unexpected end')
    return num()
  }
  const term = () => { let v = factor(); for (;;) { const c = peek(); if (c === '*' || c === '/') { i++; const r = factor(); v = (c === '*') ? v * r : v / r } else break } return v }
  const expr = () => { let v = term(); for (;;) { const c = peek(); if (c === '+' || c === '-') { i++; v = (c === '+') ? v + term() : v - term() } else break } return v }
  const v = expr()
  if (i < toks.length) throw new Error('trailing: ' + toks.slice(i))
  return v
}
// q: {answer:'C', options:[{k,t}]}；rawText: 本轮模型原始输出
export function calcRecheck(q, rawText) {
  try {
    const raw = norm(rawText)
    const m = raw.match(/【验算】\s*([^\n【]{1,200})/)
    if (!m) return { ok: null }
    const seg = String(m[1]).trim()
    if (!seg.includes('=')) return { ok: null }
    const eqIdx = seg.lastIndexOf('=')
    const lhs = seg.slice(0, eqIdx).trim()
    const rhs = seg.slice(eqIdx + 1).trim()
    // 两侧必须是纯数字/四则符（允许 ≈ ~ 宽松标记）——出现汉字/字母即无法程序核对，跳过
    if (!lhs || !rhs || /[^0-9.\s+*/()≈~=-]/.test(lhs + rhs)) return { ok: null }
    const approx = /[≈~]/.test(seg)
    const cleanRhs = rhs.replace(/[≈~]/g, '').trim()
    if (!/^\d+(?:\.\d+)?$/.test(cleanRhs)) return { ok: null }
    // 答案选项必须是纯数字（带汉字/百分号/单位则跳过，避免量纲误判）
    const opts = Array.isArray(q && q.options) ? q.options : []
    const ans = String((q && q.answer) || '').trim().replace(/\.$/, '').toUpperCase()
    const opt = opts.find((o) => String(o && o.k || '').trim().toUpperCase() === ans) || opts[Number(ans)]
    const optTxt = String(opt && opt.t || '').trim()
    if (!/^\d+(?:\.\d+)?$/.test(optTxt)) return { ok: null }
    const ev = evalExpr(lhs)
    if (!Number.isFinite(ev)) return { ok: null }
    const claim = parseFloat(cleanRhs)
    const target = parseFloat(optTxt)
    const tol = approx ? Math.max(1e-4, Math.abs(ev) * 1e-3) : Math.max(1e-9, Math.abs(ev) * 5e-4)
    if (Math.abs(ev - claim) > tol) return { ok: false, reason: '【验算】算式结果=' + round4(ev) + ' 与所附数值 ' + round4(claim) + ' 不符' }
    if (Math.abs(ev - target) > tol) return { ok: false, reason: '答案数值 ' + round4(target) + ' 与验算式结果 ' + round4(ev) + ' 不一致' }
    return { ok: true }
  } catch (e) { return { ok: null } }
}
function round4(x) { return Math.round(x * 1e4) / 1e4 }

// groupNumericRecheck —— 材料题组版【验算】复核：把每行【验算】归属到其前的第几条【正确答案】，
// 用对应小题（qs 同序）做程序求值；只对有明确归属且可解析的行执行，任何失败即报 {ok:false, idx, reason}
export function groupNumericRecheck(rawText, qs) {
  try {
    let ansSeen = 0
    const lines = String(rawText == null ? '' : rawText).split('\n')
    for (const line of lines) {
      const ysM = /【验算】/.test(line)
      const ansM = /【正确答案】\s*[A-D]/i.test(line)
      if (ysM && !ansM) {
        const idx = ansSeen - 1
        const q = Array.isArray(qs) ? qs[idx] : undefined
        if (q) {
          const r = calcRecheck(q, line)
          if (r && r.ok === false) return { ok: false, idx, reason: r.reason }
        }
      }
      if (ansM) ansSeen++
    }
    return { ok: true }
  } catch (e) { return { ok: true } }
}

