// 真假话·程序级硬校验：把 AI 输出的命题逻辑式 + 选项表达式用真值表枚举 2^n 组合，
// 验证【恰好一组满足题设真假数】且【恰好一个选项为真】。不通过 = 出题失误，丢弃重出。
// 表达式语法：原子 A-D，!非，&且，|或，->蕴含（等价 !a|b）；如 "!A|!B"、"C->D"、"B&C"。

function parseExpr(s) {
  const toks = String(s || '').replace(/\s+/g, '').split(/([!|&>()])/).filter((t) => t)
  let i = 0
  const atom = () => {
    const t = toks[i++]
    if (t === '!') return { op: '!', a: atom() }
    if (t === '(') { const e = impl(); i++; return e }
    return { v: t }
  }
  const and = () => { let e = atom(); while (toks[i] === '&') { i++; e = { op: '&', a: e, b: atom() } } return e }
  const or = () => { let e = and(); while (toks[i] === '|') { i++; e = { op: '|', a: e, b: and() } } return e }
  const impl = () => { let e = or(); if (toks[i] === '>') { i++; return { op: '->', a: e, b: impl() } } return e }
  try { const e = impl(); if (i < toks.length) throw new Error('残留: ' + toks.slice(i).join('')) ; return e } catch (e) { throw new Error('表达式解析失败: ' + s) }
}
function evalE(e, vals) {
  if (e.v) return !!vals[e.v]
  if (e.op === '!') return !evalE(e.a, vals)
  if (e.op === '&') return evalE(e.a, vals) && evalE(e.b, vals)
  if (e.op === '|') return evalE(e.a, vals) || evalE(e.b, vals)
  if (e.op === '->') return !evalE(e.a, vals) || evalE(e.b, vals)
  return false
}
// data: { exprs:["!A|!B",...], trueCount:2, opts:["A&!B",...], ans:"C"|0..3 }
export function verifyTruthTable(data) {
  try {
    if (!data || !Array.isArray(data.exprs) || !data.exprs.length || !Array.isArray(data.opts) || data.opts.length < 2) return { ok: false, reason: '缺少表达式/选项' }
    const atoms = ['A', 'B', 'C', 'D']
    const trueCount = Number(data.trueCount)
    const sols = []
    const n = atoms.length
    for (let mask = 0; mask < 1 << n; mask++) {
      const vals = {}
      atoms.forEach((a, k) => { vals[a] = !!(mask & (1 << k)) })
      let t = 0
      for (const e of data.exprs) { try { if (evalE(parseExpr(e), vals)) t++ } catch (e2) { return { ok: false, reason: '条件表达式无效' } } }
      if (t === trueCount) sols.push(vals)
    }
    if (sols.length !== 1) return { ok: false, reason: '唯一解数量=' + sols.length + '（需恰好1）' }
    const sol = sols[0]
    let trueOpts = []
    for (let i = 0; i < data.opts.length; i++) { try { if (evalE(parseExpr(data.opts[i]), sol)) trueOpts.push(i) } catch (e2) { return { ok: false, reason: '选项表达式无效' } } }
    if (trueOpts.length !== 1) return { ok: false, reason: '正确选项数量=' + trueOpts.length + '（需恰好1）' }
    const want = String(data.ans || '').toUpperCase()
    const wantIdx = /^[A-D]$/.test(want) ? want.charCodeAt(0) - 65 : Number(data.ans)
    if (trueOpts[0] !== wantIdx) return { ok: false, reason: '答案与唯一解不符' }
    return { ok: true, sol }
  } catch (e) {
    return { ok: false, reason: '校验异常' }
  }
}
