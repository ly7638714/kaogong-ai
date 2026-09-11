// 逻辑题干白话翻译：只解释难懂概念和句意，不做解析、不判题型、不评价选项、不碰答案。
const SYSTEM_PROMPT = [
  '你是“题干概念白话翻译器”，不是解题老师，也不是解析复述器。',
  '你的唯一任务：把题干和选项里难懂的概念、长句、限定语、逻辑连接词翻译成普通人都能一眼看懂的话。',
  '你只翻译“这句话在说什么”，不做题，不判断答案，不分析论证结构，不评价选项作用，不提供解题步骤。',
  '禁止输出：正确答案、应选、排除、削弱/加强、结论/论据、隐藏前提、题型判定、秒杀技巧、力度比较、为何选等内容。',
  '即使输入里带原解析，也必须忽略原解析，只根据题干和选项本身的字面意思翻译。'
].join('')

export function buildPlainTranslationPrompt(question, lockedAnswer = '') {
  const q = String(question || '').trim()
  const lock = lockedAnswer
    ? '\n\n【翻译模式约束】这道题在错题集中已有锁定答案，但答案不参与本次翻译。禁止确认、解释、改写或暗示答案，也禁止评价任何选项是否正确。'
    : '\n\n【翻译模式约束】不要猜答案，不要输出正确答案，也不要评价选项对错。'
  const user = [
    '请只做“题干和选项的白话翻译”，不要做解题解析。',
    '',
    '题目：',
    q,
    lock,
    '',
    '严格按以下格式输出：',
    '① 题干逐句白话',
    '- 原句/难句：……',
    '- 大白话：……',
    '- 这句只是在说：……',
    '',
    '② 难懂概念速查',
    '| 原词/概念 | 大白话 | 最容易误解成 |',
    '| --- | --- | --- |',
    '',
    '③ 逻辑连接词翻译',
    '只翻译“只有…才…”“除非…否则…”“且/或/并非”等词本身的意思，不判断谁对谁错。',
    '',
    '④ 选项逐项直译',
    'A. 原意：……',
    'B. 原意：……',
    'C. 原意：……',
    'D. 原意：……',
    '',
    '⑤ 翻译回读',
    '用三句话复述题目在说什么，只复述句意，不判断答案。'
  ].join('\n')
  return { system: SYSTEM_PROMPT, user }
}

const HARD_ANALYSIS_LINE = /(正确答案|应选答案|答案是|最终应选|选择[A-D]|排除[A-D]|为什么选|解题步骤|秒杀技巧|题型判定|论证结构|结论\s*\/\s*论据|力度最强|无关项|偷换主体|主体不一致|隐藏前提)/
const SOFT_ANALYSIS_LINE = /(削弱|加强|结论|论据|前提)/
const TRANSLATION_LINE = /^(?:[-*]\s*)?(?:原句\/难句|大白话|这句只是在说|原词\/概念|逻辑连接词)|^[A-D][.、：:]/

export function sanitizePlainTranslation(text) {
  return String(text || '')
    .split(/\r?\n/)
    .filter((line) => {
      const s = String(line || '').trim()
      if (!s) return true
      // 翻译字段优先保留；标题和正文一旦出现判题/原解析语气，就剔除，避免退回讲题模式。
      if (TRANSLATION_LINE.test(s) && !HARD_ANALYSIS_LINE.test(s)) return true
      if (/^[①②③④⑤⑥⑦⑧]/.test(s)) return !HARD_ANALYSIS_LINE.test(s) && !SOFT_ANALYSIS_LINE.test(s)
      return !HARD_ANALYSIS_LINE.test(s) && !SOFT_ANALYSIS_LINE.test(s)
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
