// replyProtocol —— 分场景回复协议（P0-2，纯函数）：按意图给输出顺序/格式约束，避免“永远全量讲”
import { probe } from './intentProbe'

// 各场景输出链（顺序=期望输出次序）；与 askAssist.INTENT_SYS 互补，不重复已覆盖的场景
export const SCENARIO = {
  method: ['先用一句话概括该题型的通用框架(判型信号→主公式/主步骤)', '再给 1 条高频陷阱与防法', '最后用题目原词举例说明如何落点(≤3 句)', '收尾一句“这类题的固定做题顺序”口诀'],
  variant: ['先用一句话点出本题的考点与做法', '换一个可替换的量/条件出变式(与本题同考点)', '给出变式的正确思路一句话', '指出两题差异点(哪一步会变、哪一步不变)'],
  solve: ['开头一句话复述“本题真正在问什么”(判型)', '按命中方法卡步骤作答', '逐项/关键步给出证据', '结尾给陷阱或秒杀一句话'],
  verify: ['先直接判定“你选的× 对/错”(≤10字)', '再用原文证据 1-2 句解释依据', '若错，补正确项判定要点(不重讲全题)'],
  error: ['点名你踩的坑(用你的选项做证据)', '给出正确判定的关键一步', '提醒同类题防法一句话'],
  explain: ['先说本题归属(板块·题型·考点)', '按“方法→本题代入→结论”三段展开', '最后给一句秒杀/记忆点'],
  quiz: ['只出题', '完整 A/B/C/D 四个选项，每项一行', '不输出答案与解析'],
  compare: ['一句话各自要点(A 讲 X，B 讲 Y)', '三维对照：考点/陷阱/解法', '给判断口诀“看到…选…”'],
  batch: ['按题号逐题作答，每题单独一行', '每行格式：题号：答案字母（只给 A/B/C/D 之一；不确定写 ？）', '每题判据限 1-2 句，禁止长篇展开；若本批超过 8 题，每题只给“题号：字母”一行', '全部答完再输出一行“汇总：题号=字母…”便于核对'],
  sort: ['先排除不宜做首句者（含指代词“这/它/此”且无前文、举例“比如”、结论“因此/总之”句不做首句）', '找连接词链定位：事实上→此外→不仅如此→这些→可见/总之', '用指代词就近回指验证相邻句（“这种/它/这些”所指必在紧前句）', '定序后把选项顺序代回原文默读一遍验证通顺'],
  typeFirst: ['先写一行“本题=〔题型〕·问法（≤15字）”，如：本题=中心理解·转折，问“主要说明”', '再写一行“主题词/中心句候选（≤15字）”：从转折后/结论句里摘核心词', '两行写完才允许逐项分析并给答案；言语/判断类禁止不判型直接选'],
  honest: ['对没把握的题，答案字母后加“？”并写一句存疑原因，禁止硬蒙', '当两个选项语义都强、无法唯一确定时，输出“主选 X（备选 Y）”，并说明取舍依据', '绝不为了“显得确定”而编造原文没有的依据；无卡支撑的推理须明说“通用推理”']
}

export function scenarioPrompt(intent, extra = '') {
  const chain = SCENARIO[intent]
  if (!chain) return ''
  const tag = { method: '方法总结', variant: '变式训练', solve: '规范作答', verify: '对答案', error: '错因分析', explain: '详细讲解', quiz: '出题', compare: '对比' }[intent] || intent
  return '\n【' + tag + '·输出顺序】' + chain.map((s, i) => (i + 1) + '. ' + s).join('\n') + (extra ? '\n（附注：' + extra + '）' : '')
}

// 按提问文本直接给出场景提示（供 sys 追加）；method/variant/compare 等 askAssist 未细化的场景优先
export function buildScenarioPrompt(text, opts = {}) {
  const p = probe(text, opts)
  if (p.intent === 'method') return scenarioPrompt('method')
  if (p.intent === 'variant') return scenarioPrompt('variant')
  if (p.intent === 'quiz') return scenarioPrompt('quiz')
  if (p.intent === 'explain' && !opts.skipExplain) return scenarioPrompt('explain')
  if (p.intent === 'verify') return scenarioPrompt('verify')
  return ''
}
export function batchScenarioPrompt(n) {
  const chain = SCENARIO.batch
  return '\n【批答纪律·本批共约 ' + (n || '多') + ' 题】' + chain.map((s, i) => (i + 1) + '. ' + s).join('\n') + '\n（先给“题号：答案”，需要详解的题用户会单独追问，不要每题长篇）'
}

export function sortScenarioPrompt() {
  const chain = SCENARIO.sort
  return '\n【语句排序·硬性流程】' + chain.map((s, i) => (i + 1) + '. ' + s).join('\n')
}

export function typeFirstPrompt() {
  const chain = SCENARIO.typeFirst
  return '\n【判型+主题词先行·硬性要求】' + chain.map((s, i) => (i + 1) + '. ' + s).join('\n')
}

export function honestyPrompt() {
  const chain = SCENARIO.honest
  return '\n【作答诚实度·硬性要求】' + chain.map((s, i) => (i + 1) + '. ' + s).join('\n')
}