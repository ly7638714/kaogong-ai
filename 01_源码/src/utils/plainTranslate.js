// 题干与选项白话翻译：解释概念、句意、指代和问法，不判答案、不复述解析。
const SYSTEM_PROMPT = [
  '你是“题干概念白话翻译器”，不是解题老师，也不是解析复述器。',
  '你的唯一任务：把题干和选项里难懂的概念、长句、限定语、逻辑连接词翻译成普通人都能一眼看懂的话。',
  '你只翻译“这句话在说什么”，不做题，不判断答案，不分析论证结构，不评价选项作用，不提供解题步骤。',
  '禁止输出：正确答案、应选、排除、削弱/加强、结论/论据、隐藏前提、题型判定、秒杀技巧、力度比较、为何选等内容。',
  '即使输入里带原解析，也必须忽略原解析，只根据题干和选项本身的字面意思翻译。',
  '用户指定片段时，只翻译该片段以及它在原题中的准确含义，不要扩散到整题解析。'
].join('')

export function translationKindOf(subject = '', sub = '', text = '') {
  const s = String(subject || '') + ' ' + String(sub || '') + ' ' + String(text || '')
  if (/判断|逻辑|图形推理|定义判断|类比推理/.test(s)) return 'logic'
  if (/言语|片段|篇章|逻辑填空|中心理解|细节判断|语句/.test(s)) return 'verbal'
  if (/资料|数量|增长|比重|平均数|工程|行程|概率|排列/.test(s)) return 'data'
  if (/最能(削弱|加强|支持|质疑|反驳|解释)|由此可推|只有.{0,30}才|如果.{0,50}那么|以下哪项/.test(s)) return 'logic'
  if (/文段|作者|填入|主旨|标题|成语|词语|这段话/.test(s)) return 'verbal'
  return 'general'
}

export function translationKindLabel(subject = '', sub = '') {
  return { logic: '逻辑关系翻译', verbal: '言语理解翻译', data: '条件与术语翻译', general: '题干白话翻译' }[translationKindOf(subject, sub)] || '题干白话翻译'
}

function sectionsFor(kind) {
  if (kind === 'verbal') return [
    '① 原文逐句白话',
    '- 原句/难句：……',
    '- 大白话：……',
    '- 作者这里在说什么：……',
    '',
    '② 核心信息与句间关系',
    '- 主题对象：……',
    '- 句子关系：……',
    '- 关键限定：……',
    '',
    '③ 关键词、指代与态度色彩',
    '| 原词/表达 | 大白话 | 指代或语气 |',
    '| --- | --- | --- |',
    '',
    '④ 选项逐项直译',
    'A. 原意：……',
    'B. 原意：……',
    'C. 原意：……',
    'D. 原意：……',
    '',
    '⑤ 翻译回读',
    '用三句话复述文段和选项分别在说什么，不判断答案。'
  ]
  if (kind === 'data') return [
    '① 题目条件逐句白话',
    '- 原句/条件：……',
    '- 大白话：……',
    '- 已知/所求：……',
    '',
    '② 专业术语、单位和公式翻译',
    '| 原词/公式 | 大白话 | 容易混淆点 |',
    '| --- | --- | --- |',
    '',
    '③ 问法拆解',
    '只翻译题目问的是什么，不提供计算和答案。',
    '',
    '④ 选项逐项直译',
    'A. 原意：……',
    'B. 原意：……',
    'C. 原意：……',
    'D. 原意：……',
    '',
    '⑤ 翻译回读',
    '用三句话复述材料条件、所求指标和选项问法。'
  ]
  if (kind === 'logic') return [
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
  ]
  return [
    '① 原文逐句白话',
    '- 原句/难句：……',
    '- 大白话：……',
    '- 这句只是在说：……',
    '',
    '② 难懂概念速查',
    '| 原词/概念 | 大白话 | 最容易误解成 |',
    '| --- | --- | --- |',
    '',
    '③ 问法逐句翻译',
    '只翻译题目要求做什么，不提供答案。',
    '',
    '④ 选项逐项直译',
    'A. 原意：……',
    'B. 原意：……',
    'C. 原意：……',
    'D. 原意：……',
    '',
    '⑤ 翻译回读',
    '用三句话复述题目和选项的字面意思。'
  ]
}

export function buildPlainTranslationPrompt(question, lockedAnswer = '', focus = '', context = {}) {
  const q = String(question || '').trim()
  const f = String(focus || '').trim()
  const kind = translationKindOf(context.subject, context.sub, q)
  const lock = lockedAnswer
    ? '\n\n【翻译模式约束】这道题在错题集中已有锁定答案，但答案不参与本次翻译。禁止确认、解释、改写或暗示答案，也禁止评价任何选项是否正确。'
    : '\n\n【翻译模式约束】不要猜答案，不要输出正确答案，也不要评价选项对错。'
  const focusBlock = f
    ? [
        '',
        '【本次只翻译以下指定片段】',
        f,
        '',
        '请只围绕这个片段输出：',
        '① 原句/原词：……',
        '② 大白话：……',
        '③ 它在本题中的准确含义：……',
        '④ 最容易误解成：……',
        '⑤ 放回原句后的完整意思：……',
        '不要顺带翻译其他句，不要做题。'
      ].join('\n')
    : ''
  const user = [
    '请只做“题干和选项的白话翻译”，不要做解题解析。',
    '当前识别板块：' + (context.subject || '未分类') + (context.sub ? ' / ' + context.sub : '') + (context.type ? ' / ' + context.type : ''),
    '',
    '题目：',
    q,
    lock,
    focusBlock,
    '',
    ...(f ? [] : ['严格按以下格式输出：', ...sectionsFor(kind)])
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
