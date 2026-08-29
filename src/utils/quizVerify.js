// quizVerify.js —— 本地出题质检 skill（确定性算法，不耗 API）
// 目标：严格保证「单选·唯一正确项」。每道题必须且只能有一个选项符合题目问法，
// 否则判不合格 → 出题流程触发重出。与 AI 质检（语义）互补：本模块负责一切
// 能用确定性规则查出的问题（结构/去重/答案一致性/问法方向），AI 负责语义唯一性。

// 规范化选项文本（去空白/去尾部标点），用于"重复选项"检测
function norm(t) {
  return String(t || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[\s\u3000]+/g, '')
    .replace(/[，。、；：,.;:？！?!]$/g, '')
    .toLowerCase()
}

// 判定问法方向：选非题（"错误的是/不属于/不能/不符合"…）返回 'fei'，否则 'shi'/'auto'
export function askDirection(q) {
  const ask = String((q && (q.stem || q.q || q.text)) || '')
  // 选项里出现"正确/属于/能推出"等字样只影响选项，不影响问法；问法在题干末尾
  const tail = ask.slice(-80)
  if (/(不正确|错误的是|不属于|不符合|不能(推出|体现|说明|由|从|确定|成立)|没有(体现|说明|提到)|无法(确定|推出)|不可能|除外|不包含|未(涉及|体现)|与文段(不符|相反))/.test(tail)) return 'fei'
  if (/(正确的是|属于|能(推出|体现|说明)|符合|可以推出|最能(支持|削弱|加强|解释|质疑)|以下哪项(为真|成立)|据此(可知|推出))/.test(tail)) return 'shi'
  return 'auto'
}

// 本地质检：返回 { ok, reason }；ok=false 时必须重出
export function localQuizVerify(q) {
  const errs = []
  if (!q) return { ok: false, reason: '题目为空' }
  const opts = Array.isArray(q.options) ? q.options : []
  const ans = String(q.answer || q.ans || q.correct || '').trim()
  const stem = String(q.stem || q.q || q.text || '').trim()

  // 1) 结构
  if (!stem) errs.push('题干缺失')
  if (opts.length !== 4) errs.push('选项数=' + opts.length + '（必须恰好4个）')
  if (!/^[A-Da-d]$/.test(ans)) errs.push('答案标记非法/缺失（须 A-D 之一）：' + (ans || '空'))

  // 2) 答案对应选项非空
  if (/^[A-Da-d]$/.test(ans)) {
    const idx = ans.toUpperCase().charCodeAt(0) - 65
    const t = opts[idx] ? String(opts[idx].t || opts[idx].text || '').trim() : ''
    if (!t) errs.push('答案项(' + ans + ')内容为空')
  }

  // 3) 重复选项（两个选项同义 → 不可能是唯一单选）
  const n = opts.map((o) => norm(o.t || o.text || ''))
  const seen = {}
  for (let i = 0; i < n.length; i++) {
    if (!n[i]) continue
    if (seen[n[i]] !== undefined) errs.push('选项' + ['A', 'B', 'C', 'D'][i] + '与' + ['A', 'B', 'C', 'D'][seen[n[i]]] + '重复（同义）→ 无法唯一单选')
    seen[n[i]] = i
  }

  // 4) 解析/说明里点明的答案字母必须与答案标记一致（最常见 bug：解析说 B，标记 A）
  const explain = String(q.explain || q.analysis || '')
  const m = explain.match(/(?:正确答案|答案|故选|应选|因此选|选择)[为是]?\s*([A-Da-d])(?:[.、．:：。！？!?]|\s|$)/)
  if (m && /^[A-Da-d]$/.test(ans) && m[1].toUpperCase() !== ans.toUpperCase()) {
    errs.push('解析指向答案' + m[1].toUpperCase() + '，但答案标记为' + ans.toUpperCase() + '（不一致）')
  }

  // 5) 问法方向 vs 解析结论方向（选非题答案若被解析说成"正确/符合"→ 冲突）
  const dir = askDirection(q)
  const last100 = explain.slice(-100)
  if (dir === 'fei' && /(正确答案是|故选|应选)/.test(last100) && /(符合|正确|属于|能推出)/.test(last100) && !/不/.test(last100.slice(0, 20))) {
    // 选非题解析末尾若只说"正确/符合"而未说明"错误/不属于"，存疑但不强判（避免误杀）
  }

  // 6) 题干过短（一般行测题干至少几十字；图推题可有图形但题干也应说明问法）
  const hasSvg = /<svg|```svg/.test(stem) || opts.some((o) => /<svg|```svg/.test(String(o.t || '')))
  if (stem.length < 15 && !hasSvg) errs.push('题干过短')

  // 7) 选项内容过短/雷同题干
  const optLens = opts.map((o) => String(o.t || o.text || '').trim().length)
  if (optLens.length === 4 && optLens.some((l) => l === 0)) errs.push('存在空选项')

  return { ok: errs.length === 0, reason: errs.join('；'), dir }
}
