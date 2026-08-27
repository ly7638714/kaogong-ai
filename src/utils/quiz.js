// 解析 AI 出题内容 → 选择题结构化数据（对话页可点选项作答）
// AI 输出需含 A/B/C/D 选项 + 【正确答案】X 标记（见 api/tasks.js 出题提示词）
function extractOptions(text) {
  const opts = []
  const lines = String(text).split('\n')
  const lineRe = /^\s*([A-D])[.、．:：]\s*(.*)$/
  for (let i = 0; i < lines.length && opts.length < 4; i++) {
    const m = lines[i].match(lineRe)
    if (!m) continue
    const k = m[1]
    if (opts.some((o) => o.k === k)) continue
    let t = m[2].trim()
    // 跨行合并选项内容（直到下一个选项/标题/答案标记）
    // 代码块(```svg)原样保留（图推选项内嵌 SVG 不能压平），普通文字才折叠空白
    let j = i + 1
    let inFence = false
    let fence = ''
    const texts = []
    while (
      j < lines.length &&
      !lineRe.test(lines[j]) &&
      !/^#{1,6}\s/.test(lines[j]) &&
      !/【正确答案】/.test(lines[j])
    ) {
      const s = lines[j]
      const st = s.trim()
      if (!s && !inFence) break
      if (/^```/.test(st)) {
        inFence = !inFence
        fence += s + '\n'
      } else if (inFence) {
        fence += s + '\n'
      } else if (st) {
        texts.push(st)
      }
      j++
    }
    if (!inFence && fence) fence = fence.replace(/\n$/, '')
    // 修复：不能直接用 texts 覆盖首行文字；首行 t 保留，续行 texts 追加其后
    if (texts.length) t = t ? t + ' ' + texts.join(' ') : texts.join(' ')
    if (fence) t = t ? t + '\n' + fence : fence
    opts.push({ k, t: t.trim() })
    i = j - 1
    // 同行内联选项：A. 2 B. 3 C. 4 D. 5
    const rest = m[2]
    const inline = [...rest.matchAll(/([B-D])[.、．:：]\s*([^A-D\n]*)/g)]
    if (inline.length) {
      const ai = opts.findIndex((o) => o.k === k)
      if (ai >= 0) opts[ai].t = rest.slice(0, inline[0].index).replace(/\s+/g, ' ').trim()
    }
    for (const im of inline) {
      if (opts.length >= 4) break
      const ik = im[1]
      if (opts.some((o) => o.k === ik)) continue
      opts.push({ k: ik, t: im[2].replace(/\s+/g, ' ').trim() })
    }
  }
  // 兜底：题干与选项同行（"题干… A. 2 B. 3 C. 4 D. 5"）时按内联选项提取
  if (opts.length < 2) {
    const inline = String(text).match(/([A-D])[.、．:：]\s*([^A-D\n]+)/g)
    if (inline && inline.length >= 2) {
      opts.splice(0, opts.length)
      inline.forEach((sg) => opts.push({ k: sg[0], t: sg.slice(1).replace(/^[.、．:：]\s*/, '').trim() }))
    }
  }
  return opts.sort((a, b) => a.k.localeCompare(b.k))
}

export function parseQuiz(text) {
  if (!text || typeof text !== 'string') return null
  let opts = extractOptions(text)
  // 选项去重：文本重复的选项剔除（多选/重复项视为出题失误），不足2个返回 null
  const seen = new Set()
  opts = opts.filter((o) => { const k = String(o.t || '').trim(); if (!k || seen.has(k)) return false; seen.add(k); return true })
  if (opts.length < 2) return null

  // 正确答案：优先【正确答案】X 标记，其次"答案：X/正确答案：X"
  let answer = null
  const marker = String(text).match(/【正确答案】\s*([A-D])/i)
  if (marker) answer = marker[1].toUpperCase()
  if (!answer) {
    const ans = String(text).match(/(?:正确答案|答案|正确选项)\s*[:：]?\s*([A-D])/i)
    if (ans) answer = ans[1].toUpperCase()
  }
  if (!answer) return null

  // 题干：第一个选项之前的内容（去掉"### 📝 题目"这类标题）
  const lines = String(text).split('\n')
  const lineRe = /^\s*([A-D])[.、．:：]/
  let firstOptLine = -1
  for (let i = 0; i < lines.length; i++) {
    if (lineRe.test(lines[i])) {
      firstOptLine = i
      break
    }
  }
  let stem = ''
  if (firstOptLine >= 0) {
    stem = lines.slice(0, firstOptLine).join('\n').replace(/^#{1,6}\s*(✅\s*)?(题目|📝|题干)[^\n]*\n?/i, '').trim()
  } else {
    // 内联选项兜底：题干与选项同行（"题干… A. 2 B. 3 C. 4 D. 5"）
    const m = String(text).match(/([A-D])[.、．:：]/)
    stem = m ? String(text).slice(0, m.index).replace(/^#{1,6}\s*(✅\s*)?(题目|📝|题干)[^\n]*\n?/i, '').trim() : ''
  }
  if (!stem) return null

  // 解析区：从"答案解析/解析"标题到结尾
  const explainIdx = lines.findIndex((l) => /^#{1,6}\s*(✅\s*)?(答案解析|解析|答案详解)/.test(l.trim()))
  let explain = explainIdx >= 0 ? lines.slice(explainIdx).join('\n').trim() : ''
  // 分离「命题人设计说明」为独立字段（不随解析直接展示，答完+看完解析后由按钮单独打开）
  let designer = ''
  const dm = explain.match(/###?\s*🧠\s*命题人设计说明\s*\n?([\s\S]*)$/)
  if (dm) {
    designer = dm[1].trim()
    explain = explain.slice(0, dm.index).trim()
  }

  return { stem, options: opts, answer, explain, designer }
}

// 出题提示词尾部追加片段：要求输出答案标记，便于解析成可点选项
export const QUIZ_ANSWER_MARK =
  '\n\n【输出格式硬性要求】选项区结束后，单独一行输出【正确答案】X（X 只能是 A/B/C/D 之一，不要写别的）。'

// 从文本提取 A-D 选项（错题二刷交互作答用）；不足 2 个选项返回 []
export function extractChoices(text) {
  const opts = extractOptions(text)
  return opts.length >= 2 ? opts : []
}

// 从答案文本中提取正确选项字母（如 "B" / "正确答案 B（我选了A）" / "答案：D"）
export function answerLetter(s) {
  const t = String(s || '')
  const m = t.match(/(?:正确答案|答案|正确选项)\s*[:：]?\s*([A-D])\b/i)
  if (m) return m[1].toUpperCase()
  const m2 = t.match(/\b([A-D])\b/)
  return m2 ? m2[1].toUpperCase() : ''
}

// 资料分析「材料+题组」解析：从 AI 输出中拆出 材料 + N 道题
// 期望格式：### 📄 材料 ... ### 第1题 ... ### ✅ 解析 ... ### 第2题 ...
export function parseMaterialQuiz(text, n) {
  if (!text || typeof text !== 'string') return null
  const src = String(text)
  // 1) 材料块：### 📄 材料 到 第一个 ### 第N题 之间
  let material = ''
  const matM = src.match(/###\s*📄\s*材料\s*\n([\s\S]*?)(?=\n###\s*第\s*\d+\s*题|$)/)
  if (matM) material = matM[1].trim()
  // 2) 按 ### 第N题 切块
  const parts = src.split(/###\s*第\s*(\d+)\s*题/)
  const qs = []
  for (let i = 1; i + 1 < parts.length; i += 2) {
    const block = parts[i + 1]
    const q = parseQuiz(block)
    if (q) {
      // 若解析区为空，兜底抓取 "解析：" 尾段
      if (!q.explain) {
        const ei = block.search(/解析\s*[:：]/)
        if (ei >= 0) q.explain = block.slice(ei).trim()
      }
      qs.push(q)
    }
  }
  // 3) 兜底：一个题都没切出来时，尝试整段按单题解析
  if (!qs.length) {
    const q = parseQuiz(src.replace(/###\s*📄\s*材料[\s\S]*?\n###\s*第1题/, ''))
    if (q) qs.push(q)
  }
  return { material, qs }
}
