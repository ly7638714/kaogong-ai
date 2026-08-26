// 智能训练：板块映射 + 出题/变式/诊断 系统提示词
import { SYS } from '../kb'
import { buildProfessorPrompt, SUB_PROFILE } from './professor'
const QUIZ_SYS = '你是资深公考命题专家，精通行测各板块（言语/判断/数量/资料/常识/政治）真题命题规律与命题人陷阱设计。'


export const PLATE_MODE = {
  判断推理: 'luoji',
  言语理解: 'yanyu',
  图形推理: 'tutu',
  资料分析: 'ziliao',
  数量关系: 'shuliang',
  政治理论: 'zhengzhi',
  常识判断: 'changshi',
  类比推理: 'leibi',
  定义判断: 'dingyi'
}

// 资料分析「材料+题组」生成提示词：1 篇材料 + N 道题（前 N-1 题单题递进，最后一题综合分析）
const ZL_ROTATION = ['基期/现期', '增长率', '增长量', '比重', '平均数', '倍数']
const MAT_TYPES = {
  text: '纯文字材料（统计公报式段落，含时间/范围/单位）',
  table: '表格材料（Markdown 表格，含表头/单位/时间口径，多行多年数据）',
  mixed: '混合材料（文字背景+表格数据）',
  chart: '图形数据材料（柱状/折线/饼图类，用 Markdown 表格+文字描述数据，保证数据完整可算）'
}
export function buildMaterialPrompt(opts = {}) {
  const difficulty = opts.difficulty || 'mid'
  const n = Math.max(2, Math.min(5, opts.n || 5))
  const matType = MAT_TYPES[opts.matType] || MAT_TYPES.mixed
  const base = buildProfessorPrompt('资料分析', difficulty, '')
  let qs = ''
  for (let i = 0; i < n - 1; i++) {
    const v = ZL_ROTATION[i % ZL_ROTATION.length]
    const sub = SUB_PROFILE[v]
    qs += '第' + (i + 1) + '题·' + v + '：' + (sub ? sub.style + '；题干规格：' + sub.stem + '；' + sub.traps : '') + '\n'
  }
  qs += '第' + n + '题·综合分析：问"以下能够推出/不能推出的是"，四个选项分别对应材料中 4 个不同考点/口径，需逐一验证，是全篇最难的一题。'
  return (
    base +
    '\n\n━━━━━━━━━━━━━━━━━━━━━━━━\n【本次任务·资料分析「材料+题组」】\n' +
    '本次只输出【1 篇材料 + ' + n + ' 道题】作为一个整体（模拟真题资料分析板块），不输出多余内容：\n' +
    '1. 材料形式：' + matType + '；数据自洽、可互相验算，信息量足够支撑 ' + n + ' 题。\n' +
    '2. 题组结构（严格按此，考点递进）：\n' + qs + '\n' +
    '3. 输出格式（严格）：\n### 📄 材料\n（材料内容；表格一律用 Markdown 表格）\n### 第1题\n（题干，承接材料，无歧义）\nA. … B. … C. … D. …\n【正确答案】X\n### ✅ 解析\n（正确项分析 + 每个干扰项错因点名）\n…（依此类推到第' + n + '题）'
  )
}

// 材料型题组统一生成（资料分析「材料+5题」 / 逻辑判断「一拖五」）
export function buildGroupPrompt(subject, variant, difficulty, n, matType) {
  if (subject === '资料分析') return buildMaterialPrompt({ difficulty, matType, n })
  // 逻辑判断·一拖五
  const base = buildProfessorPrompt('逻辑判断', difficulty, '一拖五')
  return (
    base +
    '\n\n━━━━━━━━━━━━━━━━━━━━━━━━\n【本次任务·逻辑判断「一拖五」题组】\n' +
    '本次只输出【1 个共用材料 + ' + n + ' 道小题】作为一个整体（模拟国考地市/执法卷一拖五），不输出多余内容：\n' +
    '1. 材料：1 个完整题干（3-6 条条件 + 若干对象，如 6 人对应 6 个岗位、5 天值班表、3 队比赛排名），条件自洽、无歧义、信息量足够支撑 ' + n + ' 题。\n' +
    '2. 小题递进：第1题简单定位 → 第2-3题排序/匹配 → 第4题较难 → 第5题最难（可确定/可能/综合分析）；共用同一组条件。\n' +
    '3. 输出格式（严格）：\n### 📄 材料\n（共用题干与条件）\n### 第1题\n（小题题干）\nA. … B. … C. … D. …\n【正确答案】X\n### ✅ 解析\n（正确项分析+每个干扰项错因点名）\n…（依此类推到第' + n + '题）'
  )
}

export function buildTaskSys(kind, opts = {}) {
  if (kind === 'quiz') {
    const plate = opts.plate || ''
    const difficulty = opts.difficulty || 'mid'
    const variant = opts.variant || ''
    const prof = buildProfessorPrompt(plate, difficulty, variant)
    return (
      QUIZ_SYS +
      '\n\n━━━━━━━━━━━━━━━━━━━━━━━━\n【本次任务·模拟出题（命题专家模式）】\n' +
      prof +
      '\n\n输出格式（严格按此结构）：\n### 📝 题目\n（题干/材料）\n（【问法】单独一行：真题提问方式，如"这段文字意在强调（　）。""以下哪项如果为真，最能削弱上述结论？""从所给的四个选项中，选择最合适的一个填入问号处…"）\nA. … B. … C. … D. …\n【正确答案】X\n### ✅ 答案解析\n（正确项分析 + 逐一点名每个干扰项的错因类型，如偷换概念/以偏概全/时间陷阱/因果倒置…）\n### 🎯 考点\n（所属考点/题型 + 近年真题考频标注：高频/中频/低频）\n### ⚡ 秒杀规律\n（一句话，真正能提速的）\n### 📊 难度自评\n（本档难度是否达成 + 一句话说明达标点；图表数据题数据用 Markdown 表格呈现，图推用文字精确描述图形特征）\n### 🧠 命题人设计说明\n（本题出题意图 + 考点选择理由 + 3 个干扰项各用哪种陷阱设计（逐项点名）+ 反套路/难度设计点，100-200 字，讲清命题人为什么这么出）'
    )
  }
  if (kind === 'variant') {
    const prev = opts.prev || ''
    return (
      QUIZ_SYS +
      '\n\n━━━━━━━━━━━━━━━━━━━━━━━━\n【本次任务·变式检验（举一反三）】\n用户刚问过一道题并得到了讲解。请你出一道【考点、题型完全相同，但题干背景、数字、人物、场景等素材完全换新】的变式题，用于检验用户是否真正掌握了这个知识点。\n\n用户刚问的原题：\n' +
      String(prev).slice(0, 1600) +
      '\n\n要求：考点与解题思路保持一致，但题目素材、数字、人物、场景等必须全新；保持真题难度——3个干扰项各有一个明确错因（解析中逐一指名，如偷换概念/以偏概全/时间陷阱/因果倒置等）、正确项不显然、4个选项长度与信息量均衡；按同样格式输出（题目+4选项+【正确答案】X+答案解析+考点+秒杀规律），并在选项区结束后单独一行输出【正确答案】X。'
    )
  }
  if (kind === 'diag') {
    return (
      (SYS ? SYS : '') +
      '\n\n━━━━━━━━━━━━━━━━━━━━━━━━\n【本次任务·学习诊断报告】\n请依据下面提供的用户学习数据（各板块提问次数、正确情况、错题分布、复盘情况），生成一份简洁务实的学习诊断报告，包含：\n1. 📊 板块表现一览（按掌握度排序，强→弱，用表格）；\n2. 🔍 高频薄弱点与普遍错因；\n3. 🎯 分板块学习建议（每个板块给2-3条具体可执行建议）；\n4. ⏱️ 备考优先级建议。\n用 Markdown，语气鼓励但实事求是。'
    )
  }
  return SYS || ''
}
