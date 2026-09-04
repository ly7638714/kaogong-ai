// quizVerifyProfiles.js —— 各板块/题型「质检子命题人」档案
// 每个板块、不同题型、不同命题人设计思路，都有专属的质检要求：
//  · check   ：本地确定性检查（叠加在通用 localQuizVerify 之上，零 API）
//  · aiHint  ：AI 质检时追加该板块/题型特有的语义质检要求
//  · learn   ：该板块最常见的质检失败原因与规避建议（随出题历史动态注入，让 AI 越出越好）
//  · 质检失败原因会写入「出题历史记录」（quizLog），再反哺进出题/质检提示词 → 持续学习。

// 题干/选项文本是否含 SVG 图形
function hasSvg(t) { return /<svg|```svg/.test(String(t || '')) }

// 逻辑填空=「选词填空」（填词/成语），严禁出成「语句填空/语句衔接」（填整句）：
// 确定性判定——选项若是完整句子（含句读）或明显超长句子式文本 → 判不合格。
function wordFillSentenceIssues(q) {
  const errs = []
  const opts = (q && q.options) || []
  opts.forEach((o) => {
    const k = String((o && o.k) || '')
    const t = String((o && o.t) || '').replace(/<[^>]*>/g, '').replace(/\s+/g, '')
    if (!t) return
    if (/[。！？]/.test(t)) errs.push('选项' + k + '是完整句子（逻辑填空=成语/实词选词填空，每空填词或成语，不能把空位填成整句——那是“语句填空”题型）')
    else if (t.length > 16) errs.push('选项' + k + '过长像句子（' + t.slice(0, 12) + '…；逻辑填空选项应为词/成语组合，句读/成句即语句填空样式）')
  })
  return errs
}

export const QUALITY_PROFILE = {
  '图形推理': {
    label: '图推·规律唯一可验证',
    check: (q) => {
      const errs = []
      const stem = String(q.stem || '')
      if (!hasSvg(stem) && !(q.options || []).some((o) => hasSvg(o.t || o.text))) errs.push('图推题题干/选项必须含 SVG 图形')
      return errs
    },
    aiHint: '；图推专项质检：①规律必须【唯一且可完整验证到最后一图】（禁止局部规律/多规律竞争）；②一组图=5图+问号、两组图=3+3、九宫格=9格、分组分类=6图，图数必须齐全；③四个选项必须各自画出候选图形；④选项图形与题干同一规律风格。',
    learn: '图推常见失败：规律不唯一/局部化、图数缺图、选项没画图、SVG 越界。出题时先想"唯一规律能否验证到末图"再写图。'
  },
  '逻辑判断': {
    label: '逻辑·论证/形式/一拖N',
    check: (q) => {
      const errs = []
      const stem = String(q.stem || '')
      if (stem.length < 30) errs.push('逻辑判断题干过短（缺论证/条件）')
      return errs
    },
    aiHint: '；逻辑判断专项质检：①论证推理：正确项力度是否唯一最强、干扰项是否犯了常见谬误（偷换/以偏概全/因果倒置/无因有果）；②形式逻辑：箭头/真假关系是否自洽；③一拖N：共用条件+新增条件是否自洽、每道小题是否恰一正确。',
    learn: '逻辑判断常见失败：论证力度比较漏、形式逻辑箭头反、一拖N新增条件与总题干矛盾。出题时先搭结构再填内容。'
  },
  '言语理解': {
    label: '言语·主旨/意图/细节',
    check: (q, _p, variant) => {
      const errs = []
      const stem = String(q.stem || '')
      const isBlank = /填空|选词/.test(String(variant || ''))
      const isWordFill = /逻辑填空|选词/.test(String(variant || '')) // 选词填空（词/成语）；语句填空=填整句，属另一题型，不能误伤
      if (isBlank) {
        // v3.8.163：选词填空(逻辑填空)题干多为短句挖空，放宽到 12 字；空位写法兼容 下划线/横线/全角空括号（（））/空位 等常见格式，避免误杀
        if (stem.length < (isWordFill ? 12 : 20)) errs.push(isWordFill ? '逻辑填空题干过短（有语境短句挖空即可）' : '填空题干过短（句子挖空即可，无需完整长文段）')
        const blankRe = isWordFill ? /空|横线|__|＿|（\s*）|\(\s*\)|\[空\d*\]/ : /空|横线|__|＿|\[空\d*\]/
        if (!blankRe.test(stem)) errs.push('填空题干必须标注空位（画横线/空括号（　）/“依次填入…”等均可）')
        if (isWordFill) errs.push(...wordFillSentenceIssues(q)) // 逻辑填空：选项必须是词/成语，禁止句子式选项（防串成语句填空）
      } else if (stem.length < 60) errs.push('言语题干过短（应给完整文段）')
      return errs
    },
    aiHint: '；言语专项质检：①正确项必须与文段主旨/意图/细节完全对应（主体/范围/程度/时间不变）；②干扰项必须来自文段常见四陷阱（偷换/以偏概全/过度推断/无中生有）而非凭空捏造；③语句排序/填空需回文验证通顺。',
    learn: '言语常见失败：正确项主体/范围偷换、干扰项与文段无关、选项同义。出题时保证正确项能在文段中"对得上"。'
  },
  '数量关系': {
    label: '数量·可解唯一',
    check: (q) => {
      const errs = []
      const opts = (q.options || []).map((o) => String(o.t || '').trim())
      if (opts.length === 4 && opts.every((t) => !/^[0-9-]/.test(t))) errs.push('数量关系选项应为数值/表达式')
      return errs
    },
    aiHint: '；数量专项质检：①题干数据是否足以唯一解出（无歧义）；②正确项由常规列式可算出、秒杀路径（整除/倍数/赋值/代入/选项关联）也能指向它；③干扰项=典型错解路径（漏算/多算/方向反/单位错）恰好算出的数。',
    learn: '数量常见失败：题干条件不足多解、干扰项不是典型错解、秒杀路径与正确项不符。出题时先自己算一遍确认唯一解。'
  },
  '资料分析': {
    label: '资料·数据可验算',
    check: (q) => {
      const errs = []
      const opts = (q.options || []).map((o) => String(o.t || '').trim())
      if (opts.length === 4 && opts.every((t) => !/[0-9]/.test(t) && !/上升|下降|增长|减少|超过|不到/.test(t))) errs.push('资料分析选项应为数值/量级/方向表述')
      return errs
    },
    aiHint: '；资料分析专项质检：①材料数据与每题答案可互相验算（时间/单位/基数/方向陷阱设计合理）；②正确项由材料数据+公式能推出；③干扰项=误算（时间口径/单位/方向/基数）恰好得到的数；④第5题综合分析：四个小判断分别对应不同考点，仅一个完全正确。',
    learn: '资料分析常见失败：材料与题数据不自洽、时间/单位陷阱设计错、综合分析多选项成立。出题时保证数据能互相验算。'
  },
  '常识判断': {
    label: '常识·知识唯一',
    check: (q) => {
      const errs = []
      const stem = String(q.stem || '')
      if (stem.length < 15) errs.push('常识题干过短（应给情境/背景）')
      return errs
    },
    aiHint: '；常识专项质检：①正确项=公认正确知识（不要争议/过时/超纲）；②干扰项=绝对化/张冠李戴/时间人物偷换/表述不准确；③四个选项互斥，只有一个完全正确。',
    learn: '常识常见失败：正确项有争议、干扰项不典型。出题时选"公认无争议"的知识点。'
  },
  '政治理论': {
    label: '政治·官方原文',
    check: () => [],
    aiHint: '；政治理论专项质检：①正确项=官方原文/权威提法用词一字不差；②干扰项=换词/换限定/张冠李戴/拼接真表述；③时政数据准确（时间/数字/会议）。',
    learn: '政治理论常见失败：提法张冠李戴、限定词偷换。出题时对照官方原文核对用词。'
  },
  '定义判断': {
    label: '定义·要件比对',
    check: (q) => {
      const errs = []
      if (String(q.stem || '').length < 40) errs.push('定义判断题干过短（缺定义要件）')
      return errs
    },
    aiHint: '；定义判断专项质检：①正确项满足定义全部关键要件；②干扰项缺一个要件/要件冲突/偷换主体/超出定义域；③选非题保证其余三项均满足要件、只有答案项不满足。',
    learn: '定义判断常见失败：干扰项差要件设计不准、选非/选是方向与答案不符。出题时逐要件核对每个选项。'
  },
  '类比推理': {
    label: '类比·关系唯一',
    check: (q) => {
      const errs = []
      const stem = String(q.stem || '')
      if (stem.length < 3 || !stem.includes('∶') && !stem.includes(':') && !stem.includes('：')) errs.push('类比题干应为"词A∶词B"形式')
      return errs
    },
    aiHint: '；类比推理专项质检：①题干词对关系明确（集合/逻辑/对应/语义/语法等大类）；②正确项二级关系与题干精确一致；③干扰项一级关系看似相同但二级错配。',
    learn: '类比常见失败：正确项二级关系不精确、干扰项一级关系迷惑性不足。出题时先定"一级+二级"关系再配词。'
  }
}


// 深化②（可算必验·数值层面）：数量/资料选项按数值归一后不得重复、答案必须为数值/量级型表述
function numVal(s) {
  const m = String(s || '').replace(/,/g, '').match(/(?:^|[^0-9])(\d+(?:\.\d+)?)\s*(%|％)?/)
  if (!m) return null
  return { v: Number(m[1]), pct: !!(m[2]) }
}
export function numericOptionIssues(q) {
  const errs = []
  const opts = (q && q.options) || []
  if (opts.length < 4) return errs
  const parsed = opts.map((o) => numVal(String((o && o.t) || '')))
  if (parsed.every((x) => x == null)) return errs // 非数值型选项（方向/文字表述）不适用
  const map = {}
  parsed.forEach((x, i) => {
    if (!x) return
    const key = x.v + (x.pct ? '%' : '')
    if (map[key] !== undefined) errs.push('选项数值重复：' + ['A','B','C','D'][map[key]] + '与' + ['A','B','C','D'][i] + '数值均为 ' + key + '（格式不同也算重复）→ 疑似出题失误')
    else map[key] = i
  })
  return errs
}

// ===== 35号批次1-C · 通用干扰项质量质检（确定性、零 API，对全部板块生效） =====
// 两条规则直击「正确项暴露 / 模板化痕迹」两类高频出题缺陷；命中即让上层带原因重出。
// 阈值写死为常量并注释：便于后续按实测收敛再调，不影响其余质检。

// 4 选项文本长度 标准差/均值 上限：超过视为选项长度失衡（疑似正确项长度暴露）。
const OPTION_LEN_RATIO = 0.45

// 通用干扰项质量检查：返回错误数组（空数组 = 通过）
export function distractorIssues(q) {
  const errs = []
  const opts = (q && q.options) || []
  if (opts.length < 4) return errs
  const texts = opts.map((o) => String((o && o.t) || '').trim()).filter(Boolean)
  if (texts.length < 4) return errs
  // 含 SVG/图形的题豁免（图推选项是图，文本长度不可比）
  if (hasSvg(texts.join('\n'))) return errs
  const lens = texts.map((s) => s.replace(/\s+/g, '').length)
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length
  if (mean >= 4) {
    const variance = lens.reduce((a, b) => a + (b - mean) * (b - mean), 0) / lens.length
    const cv = Math.sqrt(variance) / mean
    if (cv > OPTION_LEN_RATIO) errs.push('选项长度失衡（4 选项长度离散度 > ' + OPTION_LEN_RATIO + '，疑似正确项长度暴露，请把 4 个选项长度/信息量调均衡）')
  }
  // 干扰项前缀同质化：3 个干扰项前 4 字完全相同 → 模板化痕迹
  const ans = String((q && q.answer) || '').trim().toUpperCase()
  const distractors = opts.filter((o) => String((o && o.k) || '').toUpperCase() !== ans)
  if (distractors.length >= 3) {
    const pref = distractors.map((o) => String((o && o.t) || '').replace(/\s+/g, '').slice(0, 4)).filter(Boolean)
    if (pref.length >= 3 && pref.every((p) => p === pref[0])) errs.push('干扰项模板化：3 个干扰项前 4 字完全相同（疑似机械并列模板，请改写措辞使其各不相同）')
  }
  return errs
}

// 板块专属本地检查：返回附加错误数组（通用干扰项质检叠加在板块专属检查之前）
export function plateChecks(q, plate, _variant) {
  const out = []
  try { out.push(...distractorIssues(q)) } catch (e) {}
  // 深化② 可算必验：数量/资料为数值型题，数值归一重复判不合格
  if (plate === '数量关系' || plate === '资料分析') { try { out.push(...numericOptionIssues(q)) } catch (e) {} }
  const p = QUALITY_PROFILE[plate]
  if (p && p.check) {
    try { const r = p.check(q, plate, _variant) || []; out.push(...r) } catch (e) {}
  }
  return out
}
// 板块专属 AI 质检提示（追加到通用质检 sys）
export function plateAiHint(plate, _variant) {
  const p = QUALITY_PROFILE[plate]
  return p && p.aiHint ? p.aiHint : ''
}
// 板块「已学规避建议」（随出题历史动态加强，见 quizLog）
export function plateLearn(plate) {
  const p = QUALITY_PROFILE[plate]
  return p && p.learn ? p.learn : ''
}