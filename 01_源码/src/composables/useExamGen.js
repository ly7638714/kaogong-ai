// useExamGen —— ExamPanel 出题主流程（批次6B R3-②a）
// 自 ExamPanel.vue 纯移动，未改动：genOne（出题）/ 质量校验（质检）/ retryGen（重试）/ genAll+worker（并发出卷）
// 依赖全部由组件通过 ctx 注入，并在函数内解构为与拆分前**同名**的变量，保证函数体逐字一致、行为不变。
import { chatOnce, chatStream, buildQuizSys, buildGroupPrompt } from '../api'
import { parseQuiz, parseMaterialQuiz, extractChoices, answerLetter } from '../utils/quiz'
import { showToast } from '../utils/toast'
import { genTutuQuestion } from '../utils/tutuGen'
import { genSlQuestion } from '../utils/slGen'
import { genZzQuestion } from '../utils/zzGen'
import { genZlQuestion } from '../utils/zlGen' // 深化(A)：资料构建性本地生成
import { genZlChartGroup } from '../utils/zlChartGroup' // 实测反馈：图形材料无 fig 模型时用确定性真 SVG 图题组兜底
import { verifyTruthTable } from '../utils/logicVerify'
import { canLocalStrat, localFirstFreeOk } from '../data/genStrategy' // P3-2 本地/AI 生成策略表（只读表不写死）
import { localQuizVerify } from '../utils/quizVerify'
import { plateChecks, plateAiHint, plateLearn } from '../utils/quizVerifyProfiles'
import { recordGenLog, genLogHint, recentGenStats } from '../utils/quizLog' // 35号批次5(2/3)：出卷质量报告
import { figCfg } from '../api/figEnhance'
import { diffCurve } from '../api/professor'
import { SUB_VARIANTS, EXTRA_VARIANTS } from '../components/examData' // 实测反馈③：不限轮换并入扩展题型池
import { kpointOf } from '../utils/kpointLib' // 35号批次1-A：出题即写考点
import { calibrationHint } from '../utils/difficulty' // 35号批次2-A：难度校准提示注入
import { makeVariantRotator, diversitySnippet, askVariant, recordQuestion, freshVariant } from '../utils/genDiversity' // ③ 单题同类不重出(题型级短记忆)
import { planVariants, planStrengthened } from '../utils/paperPlan' // 35号批次2-C/3-B：考频配额 + 补短加权
import { readAttempts } from '../utils/attemptLog' // 35号批次3-B：薄弱度输入
import { flaggedIssueHints, flaggedByVariant } from '../utils/flaggedQuestions' // 疑题降权(按题型) + 具体问题线索注入
import { createSameStreak, onSameResult } from '../utils/sameStreak' // 5.3 同类连做
import { loadBlueprintIndex, retrieveBlueprint, blueprintPrompt, copyIssue } from '../utils/blueprint' // 35号批次5：真题蓝本 RAG（默认关）
import { store } from '../store'
import { onUnmounted } from 'vue'
import { genTimeoutMs, genDeadlineMs } from '../utils/genBudget'
import { isFastGenMode } from '../utils/fastMode' // 深化·快模型质量门 // 深化·速度护栏：预算纯函数（可单测）
import { checkFigureText } from '../utils/svgCheck' // 单题快练优化④：配图强校验（图推必须有合法 SVG）
import { pickRetryReset } from '../utils/retryPlan' // 深化·续出：续出重置计划（纯函数）
import { calcRecheck, groupNumericRecheck } from '../utils/verifyCalc' // 深化·AI题可算必验（单题 + 材料题组子题）
import { canRelaxDecision, needAiRecheck } from '../utils/quizGate' // 39号矩阵：闸门判定纯函数（可单测）
import { savePending, loadPending, clearPending } from '../utils/pendingPaper' // 深化·断点续出：组卷失败/中断后持久化草稿

// 深化·速度护栏：单题时间预算（秒，默认45，可配 10..90）。所有出题/重试/流式/质检共用，超预算即止损。
function genBudgetMS() {
  return genTimeoutMs(store.cfg && store.cfg.genTimeoutSec)
}

const DIFF_LABEL = { easy: '易', mid: '中', hard: '难', real: '真题级' }
// 自动轮换题型池 = 自选表 ∪ 扩展池（去重；扩展/创新题型只在「不限」时并入轮换，不进自选下拉）
const poolOf = (plate) => {
  const base = SUB_VARIANTS[plate] || []
  const extra = EXTRA_VARIANTS[plate] || []
  return base.concat(extra.filter((x) => !base.includes(x)))
}
// 实测反馈·命题质感「挖坑设计」：按板块给真人命题人风格的具体坑种（只加冗余/措辞/审题层，
// 数据仍须自洽、答案唯一可程序复算/复核；严禁制造歧义或两选项同真）
function trapDesign(subject) {
  const T = {
    '言语理解': '【真题质感·挖坑】题干段落需有冗余铺垫与易混表述；干扰项主要埋 偷换概念/过度推断/绝对化(一定/必然/所有)/范围扩大缩小/因果倒置/无中生有 等细节陷阱；正确项表述克制、与原文对应清晰。',
    '逻辑判断': '【真题质感·挖坑】论证类在因果相关偷换/样本代表/时间先后上设疑；问“最能削弱/加强”时干扰项要同时包含 无关项 与 “貌似相关但力度弱”项；前提类埋 过度假设。',
    '定义判断': '【真题质感·挖坑】定义要件上埋 主体/时间范围/方式/结果 要件缺失或外延不符；干扰项是“部分符合但缺关键要件”的典型错解。',
    '类比推理': '【真题质感·挖坑】选项间埋 一级关系相同但二级关系(方向/词性/程度/主客体)不同的迷惑项。',
    '数量关系': '【真题质感·挖坑】数据给“冗余无用条件”与易混主体（甲/乙、原有/现有）；干扰项埋 单位陷阱(万/亿/%、‰)、时间口径(上月/上月同期)、半途答案 与 常见误算；问“至少/至多/约/精确”时措辞要清晰。',
    '资料分析': '【真题质感·挖坑】材料建议 多主体/多年度对比 + 冗余干扰列 + 单位换算(万吨/万吨千米、亿元/万元) + 口径词(限额以上/规模以上/国有控股、出口/进出口、同比/环比/当年/上年同期)；干扰项为 时间陷阱、单位陷阱、主体偷换、基期现期混用、同比环比混用 的错解。',
    '判断推理': '【真题质感·挖坑】同逻辑判断。',
    '常识判断': '【真题质感·挖坑】选项埋 时间/主体/绝对化(首个/唯一/最) 与相近概念偷换；正确项事实确凿。',
    '政治理论': '【真题质感·挖坑】选项埋 表述主体错位/关键限定词缺失(新时代/全面/现代化) /将并列降为因果 的陷阱；严格按官方表述。'
  }
  const ps = store.cfg && store.cfg.propStyle
  let style = ''
  if (ps === 'strong') style = '\n【质感·强陷阱】请把坑埋得更密一层：材料给 2 层以上冗余/口径干扰、数值题多设单位与时间坑，选项对仗贴近真题卷面难度。'
  else if (ps === 'gentle') style = '\n【质感·入门友好】干扰项用明显错误即可，题干与选项表述直白易读（仍须恰一正确唯一）。'
  return (T[subject] || '') + style
}

// 资料分析组卷考点递进表（实测反馈：覆盖乘积增长率/两期比重差/平均数增长率/基期和差等常考项）
const ZL_PLAN = ['基期/现期', '增长率', '增长量', '比重', '平均数', '倍数', '隔年增长', '年均增长', '混合增长率', '拉动增长/贡献率', '乘积增长率', '两期比重差', '平均数增长率', '基期和差']

// 流式实时显示时隐藏答案与解析：只保留到第一个揭示标记之前（题干+选项）
const REVEAL_RE = /【正确答案】|###\s*✅?\s*(答案解析|解析|答案详解)|正确答案\s*[:：]|^答案\s*[:：]/m
function liveVisible(t) {
  const s = String(t || '')
  const i = s.search(REVEAL_RE)
  return i >= 0 ? s.slice(0, i) : s
}

export function useExamGen(ctx) {
  const {
    // —— 组件注入的行为（定义在组件内的函数/回调）——
    pickGenC, makePaper, savePapers, startPaper, onPaperReady,
    // —— 组件持有的响应式状态 ——
    questions, phase, cur, singleMode, singlePlate, singleVariant, singleDir, singleDirText,
    singleLocal, singleBatch, singleMatType, singleVars, difficulty, tutuFormat, modules,
    aiCap, genConcur, paperDir, paperDirText, paperYtNGroup, paperYtN, selTmpl, prefetchQ,
    papers, quizCol, genLive, genStatus, genCur, genDone, genTotal, genErrCount, genSec,
    genEta, genBusy, retryInfo
  } = ctx

  // 出题过程中的模块级可变状态（拆分前位于组件内，现随出题流程一并收拢）
  let genTimer = null
  let genAbort = false
  let genCtrl = null // AbortController：取消出卷时立即中断进行中的请求
  const generating = {}
  // —— Request E 多样性：连续出题序号（问法/角度轮换）——
  // 5.3 同类连做状态：答错钉住同考点；连对3题清钉换考点（cfg.keepSame 开关）
  const sameStreakState = createSameStreak()
  let diverSeq = 0          // 递增序号：注入 diversitySnippet / askVariant 的 seq 参数
  onUnmounted(() => { if (genTimer) clearInterval(genTimer) })

  function resolveDir(d) { if (d === 'is' || d === 'not') return d; return Math.random() < 0.5 ? 'is' : 'not' }
  function dirHint(subject, dir, dirText) {
    if (dirText) return '\n【问法】本题问法：' + dirText + '（严格按此问法出题）。'
    if (subject === '定义判断' || subject === '图形推理' || subject === '空间重构') return ''
    return dir === 'is'
      ? '\n【问法】本题为选是题：问"下列属于/正确的是/符合的是/能推出的是"（非定义类按本板块惯例使用正向问法）。'
      : '\n【问法】本题为选非题：问"下列不属于/错误的是/不符合的是/不能推出的是"。'
  }

  // 深化：个人常犯错因反哺出题（wqs.reasons 统计，本板块错误≥2 次才注入，少而精）
  function wrongReasonsHint(subject) {
    try {
      const m = {}
      ;(store.wqs || []).filter((w) => w.subject === subject).forEach((w) => {
        ;(w.reasons || []).forEach((rr) => { const k = String(rr || '').slice(0, 30); if (k) m[k] = (m[k] || 0) + 1 })
      })
      const top = Object.entries(m).sort((a, b) => b[1] - a[1]).filter((x) => x[1] >= 2).slice(0, 2).map((x) => x[0] + '(' + x[1] + '次)')
      return top.length ? '【你的常犯错因】' + top.join('、') + '：命题时请在对应陷阱上给足明确信息、避免加重这类失误。' : ''
    } catch (e) { return '' }
  }

  // 出题严格质检：二次验证 题干自洽/唯一解/恰一正确（开启 strictGen 时对每道生成题执行）
  async function verifyQuestion(q, plate, variant) {
    // 37号 加固C：双模型互检（默认关）——开启且配置了「图增强模型(fig)」且与出题模型不同厂商时，复核用独立厂商模型（+1 次/题，计入 costTrack）
    const useDual = !!store.cfg.dualCheck
    let c = pickGenC()
    if (useDual) {
      try {
        const fg = figCfg()
        if (fg && fg.key && (!c || fg.prov !== c.prov)) {
          const DEF_URL = { ds: 'https://api.deepseek.com/chat/completions', zhipu: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', sf: 'https://api.siliconflow.cn/v1/chat/completions', openai: 'https://api.openai.com/v1/chat/completions' }
          c = { ...fg, url: fg.url || DEF_URL[fg.prov] || DEF_URL.ds }
        }
      } catch (e) {}
    }
    if (!c || !c.key) return { pass: true }
    try {
      const learn = genLogHint(plate, variant) // 历史质检学习：过去这类题常错在哪
      let sys = '你是公考行测出题质检员（严格单选）。检查下面这道题：①题干条件是否自洽、能否推出唯一解；②【唯一正确项】必须且只能有一个选项符合题目问法：禁止多选、禁止无正确选项、禁止两个选项同真、禁止选项全对、禁止两个选项同义重复；③选非题（错误的是/不属于/不能推出/不符合）必须保证其余三项均【符合】问法、只有答案项【不符合】；选是题反之；④选项与题干相关、无逻辑谬误；⑤若题干/选项含 SVG 图形（图推/几何），检查：每个 svg 是否带 viewBox 且元素坐标不越出画布（越界会被前端裁切显示不全）、题干图数是否齐全（一组图5图+问号/两组图3+3/九宫格9格/分组分类6图）、选项是否每项都画了候选图。' + plateAiHint(plate, variant) + (learn ? '\n' + learn : '') + '只回复 JSON：{"ok":true} 或 {"ok":false,"reason":"指出具体是哪几个选项都成立/都不成立/重复，便于重出修正"}'
      // 深化(选项2)：数量/资料 AI 计算题强制“答案代回题干重算”复核（在既有唯一性复核内追加，不新增调用次数）
      // 言语·选词填空专属复核口径（v3.8.146）：防“意思相近但搭配/语境不符”被误判为两可或多解而反复否决
      if (plate === '言语理解') {
        if (/逻辑填空|选词/.test(String(variant || ''))) {
          sys += '；选词填空（逻辑填空）判定口径：正确项必须与该空位语法搭配且与文段语境线索唯一契合；其余组词若只是“词义相近但搭配对象/语体/感情色彩/逻辑呼应不符”，应判定其不成立，不得判两可或多解；逐空检查选项与空位数一一对应；【关键】逻辑填空填的是词或成语——若某选项是完整句子（句号/问号/叹号结尾，或明显成句的超长文本）直接判不合格，那是语句填空题型，绝不允许串题。'
        } else if (/填空/.test(String(variant || ''))) {
          sys += '；语句填空判定口径：该题型空位应填完整句子，正确项须与上下文话题/逻辑/语气唯一衔接（回文验证通顺）。'
        }
      }
      if (plate === '数量关系' || plate === '资料分析') {
        sys = sys.replace('只回复 JSON：{"ok":true}', '；⑥若是计算题：请把【答案数值】代回题干列式重新验算，必须恰好成立（注意单位/量纲/百分号/四舍五入口径）；不符或题干数据无法重算 → 回复 ok:false 并指出原因。只回复 JSON：{"ok":true}')
      }
      const user = '题干：' + String(q.stem || '') + '\n选项：' + (q.options || []).map((o) => o.k + '. ' + o.t).join('\n') + '\n答案：' + String(q.answer || '')
      const r = await chatOnce(c, [{ role: 'system', content: sys }, { role: 'user', content: user }], 400)
      const m = String(r || '').match(/"ok"\s*:\s*(true|false)/)
      // fail-closed：质检结果无法解析（缺 ok 字段/JSON 异常）一律视同不合格，触发重出，避免"白付钱却放行劣质题"
      if (!m) return { pass: false }
      return { pass: m[1] === 'true' }
    } catch (e) { return { error: true } } // 调用/网络异常≠内容否决
  }

  // 资料分析材料 SVG 兜底绘制：把 Markdown/文字材料画成真题风格 SVG 表格/图表（迁移图推绘图能力）
  async function drawZlMaterialSVG(material, matType) {
    const m = String(material || '').trim()
    if (!m || /```svg/.test(m)) return m
    const isDrawable = matType === 'table' || matType === 'mixed' || matType === 'chart' || /表格|柱状|折线|饼图|统计|同比|指标|比上年|增长/.test(m.slice(0, 220))
    if (!isDrawable) return m
    let c = null
    try { c = figCfg() } catch (e) {}
    if (!c || !c.key) return m
    const prompt = '你是公考资料分析「材料图表绘制专家」。把下面这份资料分析材料画成一张真题风格的 SVG 图（表格或柱状/折线/饼图），只输出一个 ```svg 代码块，不要任何其他文字。' +
      'SVG 铁律：<svg width=620 height=按内容 viewBox="0 0 620 H">、白底、深色描边、元素坐标在界内留≥8px、字体≥12px、数据自洽可验算。' +
      '表格→<rect>画表头(深色底#1e3a5f+白字)+单元格+<text>写数据并标注单位；柱状/折线/饼图→坐标轴/图例/数值/年份清晰。材料内容：\n' + m.slice(0, 1200)
    try {
      const resp = await fetch(c.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(c.key ? { Authorization: 'Bearer ' + c.key } : {}) },
        body: JSON.stringify({ model: c.model, messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }], max_tokens: 3200, stream: false, temperature: 0.2 })
      })
      if (!resp.ok) return m
      const d = await resp.json()
      const text = String((d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '').trim()
      const svgM = String(text).match(/```svg\s*\n?([\s\S]*?)```|<svg[\s\S]*?<\/svg>/)
      const svg = svgM ? (svgM[1] || svgM[0]).trim() : ''
      if (svg && svg.includes('<svg')) return m + '\n\n```svg\n' + svg + '\n```'
    } catch (e) {}
    return m
  }

  // 核心出题：生成第 i 题（含题型轮换），供预生成/单题/重出共用
  async function genOne(i) {
    const item = questions.value[i]
    if (!item || item.stem) return
    if (item.fromWrong) return
    if (item.group && !item.groupLeader) return // 占位：由组首生成后统一填充
    // 🎲 本地题库生成（单题快练·图形推理/数量关系/政治理论，选择本地或未配Key离线练习）→ 零额度、确定性质检、永不裁切
    const localCapable = { '图形推理': genTutuQuestion, '数量关系': genSlQuestion, '政治理论': genZzQuestion, '资料分析': genZlQuestion } // 深化(A)：资料单题(自由练)本地可算
    const canLocal = canLocalStrat(item.subject, item.variant) ? localCapable[item.subject] : null // P3-2 读策略表（localCapable 仍持生成函数）
    // 深化②(2/2)：确定性本地优先路由——开启 preferLocalDet 且为自由练（未指定题型）时，图推/数量/政治直接走本地确定性生成（零错题、零成本）
    const localFreeDet = singleMode.value && canLocal && !!store.cfg.preferLocalDet && localFirstFreeOk(item.subject) && !String(item.variant || '') // P3-2 读策略表
    if (singleMode.value && canLocal && !item.group && (singleLocal.value || localFreeDet || !pickGenC() || !pickGenC().key)) {
      const lq = canLocal()
      if (lq) { item.stem = lq.stem; item.options = lq.options; item.answer = lq.answer; item.explain = lq.explain || ''; item.variant = '本地题库'; item.local = true; item.kpoint = kpointOf(item.subject, lq.stem); return }
    }
    const c = pickGenC()
    if (!c || !c.key) {
      // 未配 Key 时本地可出题板块（图推/数量/政治）照样出题：离线练习零门槛
      if (canLocal && !item.group && canLocalStrat(item.subject, item.variant) && (singleMode.value || !pickGenC() || !pickGenC().key)) { // P3-2 noLocalVariants(3D) 读策略表
        const lq = canLocal()
        if (lq) { item.stem = lq.stem; item.options = lq.options; item.answer = lq.answer; item.explain = lq.explain || ''; item.variant = '本地题库'; item.local = true; item.kpoint = kpointOf(item.subject, lq.stem); return }
      }
      item.err = true; item.stem = '（未配置模型，无法出题）'; return
    }
    // 资料分析「材料+题组」：一次生成整组
    if (item.group) {
      const gn = item.groupN || 5
      const failAll = (msg) => {
        for (let k = 0; k < gn; k++) {
          const slot = questions.value[i + k]
          if (slot) { slot.err = true; slot.stem = msg }
        }
      }
      try {
        const isZL = item.subject === '资料分析'
        const isWZ = item.wz === true // 言语·篇章阅读（一篇长文配 N 小题）
        // 实测反馈·图形材料必有图：无 fig 模型、或 fig 绘制失败/材料无图时，都兜底到确定性真 SVG 图题组（柱/线/饼 + 可复算小题，零 API）
        const _figOk = (() => { try { const f = figCfg(); return !!(f && f.key) } catch (e) { return false } })()
        const fillLocalChart = (lg, srcTag) => {
          const _mat = '```svg\n' + lg.svg + '\n```'
          for (let k = 0; k < gn; k++) {
            const slot = questions.value[i + k]
            const q = lg.qs[k]
            if (slot && q) {
              slot.err = false; slot.local = true
              slot.stem = '【📄 材料】\n' + _mat + '\n\n' + q.stem
              slot.options = q.options; slot.answer = q.answer; slot.explain = q.explain || ''
              slot.variant = slot.variant || (k === gn - 1 ? '综合分析' : ZL_PLAN[k % ZL_PLAN.length])
              slot.kpoint = kpointOf(item.subject, q.stem || '')
            } else if (slot) { slot.err = true; slot.stem = '（本组第 ' + (k + 1) + ' 题解析失败）' }
          }
          recordGenLog({ plate: item.subject, variant: item.variant || '', difficulty: item.difficulty || '', ok: true, attempts: 1, reasons: [], src: srcTag || 'local-chart' })
        }
        if (isZL && !_figOk && gn <= 5 && (item.matType === 'chart' || item.matType === 'mixed')) {
          const _lc = genZlChartGroup()
          if (_lc && Array.isArray(_lc.qs) && _lc.qs.length >= gn) { fillLocalChart(_lc, 'local-chart'); return }
        }
        const sys = buildGroupPrompt(item.subject, item.variant, item.difficulty || 'mid', gn, item.matType)
        const matTypeName = { text: '纯文字材料', table: '表格材料', mixed: '混合材料', chart: '图形数据材料' }[item.matType] || '混合材料'
        let ask = (isZL
          ? '请为【资料分析】出一篇完整材料 + ' + gn + ' 道题（材料形式：' + matTypeName + '，第' + gn + '题为综合分析题，前 ' + (gn - 1) + ' 题考点递进）。'
          : '请为【逻辑判断】出一套「一拖' + gn + '」题组（1 个共用材料 + ' + gn + ' 道小题，小题可在不违背总题干逻辑的前提下新增附加条件）。') +
          '【本次输出要求（提速，必须遵守）】只输出 材料 + ' + gn + ' 道小题的题干/选项/答案：### 📄 材料 → ### 第1题（题干 + A./B./C./D. 四选项 + 单独一行【正确答案】X）→ ### 第2题…；不要输出解析/考点/秒杀/命题人设计说明（这些稍后按需单独生成）。材料与各题数据必须自洽、可互相验算。' + (isZL ? '（数值小题选做：可在该题【正确答案】行后另起一行附【验算】<算式>=<数值>，如 12*3=36；写不了就不附，正常出题即可。另：各小题考点尽量拉开——可从 基期/现期、增长率/增长量、比重及两期比较、平均数及增长率、倍数、隔年/年均、混合增速、乘积增长率、贡献率拉动 等考点递进选题。）材料请按真题质感编排：可用 多主体/多年度 对比与冗余干扰信息（含单位换算、口径限定词如 限额以上/规模以上/同比 等）作铺垫，但数据必须自洽、答案唯一可验算。' : '')
      if (isWZ) {
        ask = '请为【言语理解·篇章阅读】创作一篇完整现代文材料（600-900字，可选 社会/科技/文化/生态/经济/教育 等主题，客观有层次），并围绕它出 ' + gn + ' 道小题。输出格式：### 📄 材料 → ### 第1题…第' + gn + '题（每题：题干 + A./B./C./D. 四选项 + 单独一行【正确答案】X）；前面小题建议覆盖 细节理解/词句理解/中心理解/意图判断/语句衔接 等，末题可为 篇章综合；每道小题都必须在原文有明确依据、严格单选恰一正确，选项不得同义重复或模棱两可。只输出材料与题目，不要解析/设计说明。'
      }
        // 材料题组带原因多次尝试（≥3 次整组重出，整卷预算内）——显著降低“5 题一篇一次小瑕疵就整组失败”
        const MAX_GROUP_TRY = 3
        let groupFix = ''
        let groupOk = false
        let groupReason = ''
        let groupAttempts = 0
        for (let gTry = 0; gTry < MAX_GROUP_TRY && !groupOk && !genAbort; gTry++) {
          groupAttempts++
          if (gTry > 0) genStatus.value = '第 ' + (gTry + 1) + ' 次重出 · ' + item.subject + ' 材料题组（带原因修正）'
          const reply = await chatOnce(c, [{ role: 'system', content: sys }, { role: 'user', content: ask + groupFix }], 6000, genBudgetMS(), genCtrl && genCtrl.signal)
          const parsed = parseMaterialQuiz(reply, gn)
          const okN = parsed && parsed.qs.length ? Math.min(gn, parsed.qs.length) : 0
          const badIdx = (parsed && parsed.qs || []).findIndex((qq) => !localQuizVerify(qq).ok)
          let reason = ''
          if (okN >= Math.min(2, gn) && badIdx >= 0) reason = '本组第 ' + (badIdx + 1) + ' 题未过本地唯一单选质检：' + localQuizVerify(parsed.qs[badIdx]).reason
          else if (isZL && okN >= Math.min(2, gn) && parsed.material && /```svg/i.test(parsed.material)) { const sc = checkFigureText(parsed.material); if (!sc.ok) reason = '材料 SVG 不合法：' + sc.issue }
          else if (isZL && okN >= Math.min(2, gn)) { const gcr = groupNumericRecheck(reply, parsed.qs); if (gcr && gcr.ok === false) reason = '本组第 ' + (gcr.idx + 1) + ' 题【验算】复核未过：' + gcr.reason }
          else if (okN >= Math.min(2, gn) && !parsed.material) reason = '材料缺失'
          else if (okN < Math.min(2, gn)) reason = '材料题组格式异常/有效小题不足'
          if (reason) {
            groupReason = reason
            groupFix = '。上一版题组未过：' + reason + '。请重新生成整组并严守：### 📄 材料 → ### 第N题（题干 + A./B./C./D. 四选项 + 单独一行【正确答案】X），每小题严格单选恰一正确，严禁两个选项同时成立或选项重复；材料与各小题数据自洽、可互相验算' + (isZL ? '；数值小题可附【验算】<算式>=<数值>' : '')
            continue
          }
          let mat = parsed.material
          if (isZL && !/```svg/.test(mat) && (item.matType === 'table' || item.matType === 'mixed' || item.matType === 'chart')) {
            showToast('📊 正在把材料绘制成图表…', 'info')
            mat = await drawZlMaterialSVG(mat, item.matType)
          }
          // 实测反馈·混合/图形材料：fig 已配置但没画出 SVG（或材料本身无图）→ 兜底确定性图形题组，保证有真图
          if (isZL && (item.matType === 'chart' || item.matType === 'mixed') && !/```svg/.test(mat)) {
            const _lg = genZlChartGroup()
            if (_lg && Array.isArray(_lg.qs) && _lg.qs.length >= gn) { fillLocalChart(_lg, 'local-chart-fallback'); return }
          }
          for (let k = 0; k < gn; k++) {
            const slot = questions.value[i + k]
            const q = parsed.qs[k]
            if (slot && q) {
              slot.err = false
              slot.stem = '【📄 材料】\n' + mat + '\n\n' + q.stem
              slot.options = q.options
              slot.answer = q.answer
              slot.explain = q.explain || ''
              slot.variant = slot.variant || (isZL ? (k === gn - 1 ? '综合分析' : ZL_PLAN[k % ZL_PLAN.length]) : (isWZ ? (k === gn - 1 ? '篇章综合' : ['细节理解', '词句理解', '中心理解', '意图判断', '语句衔接', '综合推断'][k % 6]) : '分析推理'))
              slot.kpoint = String(q.kpoint || '').trim() || kpointOf(item.subject, q.stem || '')
            } else if (slot) { slot.err = true; slot.stem = '（本组第 ' + (k + 1) + ' 题解析失败，可点「重出」重试整组）' }
          }
          groupOk = true
        }
        if (!groupOk) {
          failAll('（材料题组多次未过：' + groupReason + '，可点「重出」重试整组）')
          recordGenLog({ plate: item.subject, variant: item.variant || '', difficulty: item.difficulty || '', ok: false, attempts: groupAttempts, reasons: [groupReason], src: 'group' })
          return
        }
        recordGenLog({ plate: item.subject, variant: item.variant || '', difficulty: item.difficulty || '', ok: true, attempts: groupAttempts, reasons: [], src: 'group' })
      } catch (e) {
        if (genAbort) return // 取消出卷：静默返回，不记为出题失败
        failAll('（出题失败：' + e.message + '）')
        recordGenLog({ plate: item.subject, variant: item.variant || '', difficulty: item.difficulty || '', ok: false, attempts: 1, reasons: [String(e && e.message || '')], src: 'group' })
      }
      return
    }
    const variant = item.variant || ''
    const isBlankQC = item.subject === '言语理解' && /填空|选词/.test(variant) // 逻辑填空/语句填空 均为填空类：本地质检通过后 AI 复核至多 1 次即放行
    try {
      // 35号批次2-A：按该题类（板块|题型|难度档|genVer）历史实测正确率生成难度校准提示（样本不足返回空）
      const dq = item.difficulty || 'mid'
      const sys = buildQuizSys({ plate: item.subject, difficulty: dq, variant, calib: calibrationHint(item.subject, variant, dq) })
      const dir = item.dir || resolveDir('auto')
      const dh = dirHint(item.subject, dir, item.dirText)
      const fmtHint = (item.subject === '图形推理' && singleMode.value && tutuFormat.value && tutuFormat.value !== 'auto') ? '本题出题形式固定为【' + tutuFormat.value + '】，请严格按【图形推理】子命题人的「SVG 布局铁律」中该形式的画布尺寸与格子布局出图。' : ''
      const zlLearn = genLogHint(item.subject, variant) + (plateLearn(item.subject) ? '（本板块避坑：' + plateLearn(item.subject) + '）' : '')
      // 深化③：疑题反馈自动反哺提示词（零 API）——该(板块|题型)被用户标记过则提醒复核
      let flagLearn = ''
      try {
        const c = variant ? (flaggedByVariant()[item.subject + '|' + variant] || 0) : 0 // 按题型聚合计数（与 v3.8.128 降权键一致，避免带考点记录漏计）
        const issues = flaggedIssueHints(item.subject, variant, 2)
        if (c || issues.length) {
          flagLearn = '【疑题规避】该考点/题型曾被用户标记' + (c ? ' ' + c + ' 次' : '') + '疑题' + (issues.length ? '（最近具体反馈：' + issues.map((s) => '“' + s + '”').join('、') + '）' : '') + '：请自查避免这类问题（表述歧义/选项重复/答案争议等），确保唯一正确项无懈可击后再出。'
        }
      } catch (e) {}
      // Request E·多样性：开放换话题（防撞记忆：避免重复最近题）+ 自然化 + 问法变体
      const qv = askVariant(item.subject, variant, diverSeq)
      const qvHint = (qv && !item.dirText) ? '\n【本题问法】' + qv + '（真题提问方式，可据此组织题干末尾的问法行）' : ''
      const diverTxt = diversitySnippet(item.subject, variant, diverSeq)
      diverSeq++
      const wqHint = wrongReasonsHint(item.subject)
      // 深化·AI题可算必验：数量/资料单题鼓励自附【验算】纯算式（选做——写不了就正常出题，绝不强迫格式）
      const calcReq = (item.subject === '数量关系' || item.subject === '资料分析') ? (item.subject === '数量关系' ? '\n请像资深数量命题人出题：场景自然真实（工程/行程/买卖/浓度等），条件恰够、数据好算，按真题难度自然埋一个常见陷阱；若数据能写成纯数字算式复核，请在末尾另起一行附【验算】算式，如 12*3=36（只能含数字与 + - * / ( )，写不了就不附））' : '\n（验算要求·选做：若本题数据可写成纯数字算式验算，请在输出最末另起一行附【验算】<算式>=<答案数值>，例：12*3=36。算式只能含数字与 + - * / ( )；写不了就不要附，正常出题即可。）') : ''
      const askBase = (variant ? '请为【' + item.subject + '】出一道' + variant + '仿真模拟题（本题型：' + variant + '）。' : '请为【' + item.subject + '】出一道仿真模拟题。') + (zlLearn ? '\n' + zlLearn : '') + (flagLearn ? '\n' + flagLearn : '') + (wqHint ? '\n' + wqHint : '') + dh + diverTxt + qvHint +
        '【本次输出要求（提速，必须遵守）】只输出：题干 + 4 个选项（A./B./C./D.）+ 单独一行【正确答案】X' +
        (item.subject === '逻辑判断' && variant === '真假话' ? ' + 末尾【验证数据】JSON' : '') +
        '。不要输出解析/考点/秒杀/难度自评/命题人设计说明（这些稍后由系统单独生成，你这次只出题）。' + fmtHint
      // 35号批次5：真题蓝本 RAG（默认关 store.cfg.blueprintRag，开启后 +token；仅学结构、防照抄在出题后程序校验）
      let bpText = ''
      let bpEntries = []
      if (store.cfg.blueprintRag) {
        try {
          const bpIdx = await loadBlueprintIndex()
          bpEntries = retrieveBlueprint(bpIdx, item.subject, variant, 2)
          if (bpEntries.length) bpText = blueprintPrompt(item.subject, variant, bpEntries)
        } catch (e) {}
      }
      let ask = askBase + (bpText ? '\n\n' + bpText : '') + calcReq + trapDesign(item.subject) + ((item.subject === '言语理解' && variant === '逻辑填空') ? '\n（请像资深命题人出【逻辑填空】（成语/实词选词填空）：语境自然，空位用 ____ 标出；选项为词或成语（多空按序对应），正确项由语境唯一托住，干扰项像真题那种“沾边但搭配/感情色彩不对”的词；选项不要写成完整句子（那是语句填空题型）。）' : '')
      // 深度命题两段式（cfg.deepPlan 默认关）：先让子命题人设计(板块专属：数据结构/坑点/配图与SVG布局/官方表述等)再成题——质感更强；任何失败回退普通单次
        const _deepPlates = ['言语理解', '逻辑判断', '定义判断', '类比推理', '常识判断', '数量关系', '资料分析', '图形推理', '政治理论']
      if (store.cfg.deepPlan && !item.group && _deepPlates.includes(item.subject) && variant !== '真假话') {
        try {
          const _planBy = { '数量关系': '（数据必须整数可复算；坑点=单位/时间口径/半途答案/误算，另配冗余条件）', '资料分析': '（定材料主题与是否配图(柱/折/饼)及数据结构(多年度/多主体/单位/口径词)，四数值一综合分工，答案全可验算）', '图形推理': '（先定呈现形式(一组/两组/九宫格/分组/空间重构)与画布，再定规律(位置/样式/属性/数量/组合)，说明 SVG 布局画题干与选项：带 viewBox、坐标在界内）', '政治理论': '（严格官方权威表述设计正确项关键词；干扰=限定词缺失/主体错位/绝对化）' }
          const _planAsk = '你是公考行测' + item.subject + '命题人。请用不超过 140 字设计本题「命题要点」（只输出设计，不要出题）：1) 用哪种材料/数据结构与真实感细节铺垫；2) 准备埋哪些坑（时间/单位/主体/口径/偷换概念/绝对化/要件缺失/二级关系等，按板块适用）；3) 正确项如何设置以保证唯一；4) 三个干扰项分别对应哪种典型错解。' + (_planBy[item.subject] || '')
          const _planR = await chatOnce(c, [{ role: 'system', content: sys }, { role: 'user', content: _planAsk }], 300, 12000, genCtrl && genCtrl.signal)
          const _planTxt = String(_planR || '').trim().slice(0, 640)
          if (_planTxt) ask = ask + '\n【已定命题设计·请严格按其命题】' + _planTxt
        } catch (e) { /* 回退普通单次 */ }
      }
      // v3.8.176 图推：资深命题人口吻的自然指引（不再堆硬规矩）
      if (item.subject === '图形推理' && !item.local) {
        ask += '\n（请像资深图推命题人：心里先定好唯一规律，让题干图形严格按它展开，正确项就是延续规律的那一幅，干扰项是规律明显断开的；解析顺着图形自然讲清规律并回验到最后一幅即可，别用“好像/可能”这类模糊话。）'
      }


      // v3.8.177 平衡之尺：给模型一个“人味分寸”的整体提示（不列条目），防止过于放飞或过于憨包
      if (['言语理解', '数量关系', '图形推理', '资料分析', '逻辑判断', '定义判断', '类比推理'].includes(item.subject)) {
        ask += '\n（分寸提醒：这一题按国考真题的“舒服感”来——取材自然、能读得通；难度贴真题：不是一眼送分，也不靠绕口刁难；陷阱设计成考生真正会踩的坑；语言精炼不啰嗦、不生硬。整题只保留一个无争议正确项，其余三项都有明确的错因。）'
      }

      const msgs = [{ role: 'system', content: sys }, { role: 'user', content: ask }]
      let reply
      if (singleMode.value && questions.value.length === 1) {
        // 单题：流式生成，题干边出边显示
        genLive.value = ''
        reply = await chatStream(msgs, c, (d) => { if (d && d.text) genLive.value = liveVisible(d.text) }, genCtrl && genCtrl.signal, genBudgetMS())
        genLive.value = liveVisible(reply || '')
      } else {
        reply = await chatOnce(c, msgs, 6000, genBudgetMS(), genCtrl && genCtrl.signal)
      }
      const extractVerifyData = (text) => {
        const m = String(text || '').match(/【验证数据】\s*(\{[\s\S]*?\})/)
        if (!m) return null
        try { return JSON.parse(m[1]) } catch (e) { return null }
      }
      // 出题质检：本地校验(4选项) → 真假话程序真值表硬校验 → 严格质检，最多重试 3 次
      let qz = null
      let raw = reply || '' // 最近一次模型输出原文
      let fixHint = '' // 质检未通过原因 → 下一轮定向修正（减少盲目重出、更快成功）
      const failReasons = [] // 各次质检失败原因 → 写入出题历史（供 AI 学习）
      let genAttempts = 0 // 出题尝试次数（记录进历史）
      let ttVerified = false // 真假话已过程序真值表硬校验（比 AI 质检更强，免二次 AI 质检）
      let lastParsed = null // 解析成功的题先记下，作为放宽兜底（避免 AI 质检过严反复“多次重出”）
      let calcBad = false // 数量/资料【验算】复核不过 → 禁止放宽兜底复活数值错误题
      const aiGate = !!((store.cfg.strictGen || store.cfg.dualCheck) || (store.cfg.fastAutoQC !== false && isFastGenMode())) // 是否有 AI 复核门（strict/双检/快模型质量门）
      let qcHardFail = false // 质检“内容否决”硬标记：仅真否决才禁止放宽兜底（调用失败不算）
      const stage = (attempt, label) => { genStatus.value = (attempt > 0 ? '第 ' + (attempt + 1) + ' 次重出 · ' : '') + label }
      // 深化·速度护栏：整题硬性总预算（默认90s=45s×2），超预算即停止重试走止损，绝不无限拖
  const dlAt = Date.now() + genDeadlineMs(store.cfg && store.cfg.genTimeoutSec)
  for (let attempt = 0; attempt < 3 && !qz && Date.now() < dlAt; attempt++) {
        genAttempts++
        stage(attempt, 'AI 生成中…')
        let cur = attempt === 0 ? parseQuiz(raw) : null
        if (!cur || !cur.options || cur.options.length < 4) {
          // 网络/Key 错误直接抛出（外层显示真实原因），不盲目重试；质检不过则带原因定向重出
          raw = await chatOnce(c, fixHint ? [{ role: 'system', content: sys }, { role: 'user', content: ask + fixHint + (attempt >= 2 && ((store.cfg && store.cfg.deepPlan) || (store.cfg && store.cfg.propStyle === 'strong')) ? '\n【系统自动降档】前两轮在强陷阱/深度命题约束下多次未过质检：本轮请放低陷阱密度与设计复杂度，直接出一道中等难度、结构清晰、题干信息完整、干扰项明显错误、答案唯一明确的标准题，确保能一次通过质检。' : '') }] : msgs, 6000, genBudgetMS(), genCtrl && genCtrl.signal)
          cur = parseQuiz(raw)
        }
        if (!cur || !cur.options || cur.options.length < 4) { fixHint = '。上一版格式不合格：必须输出题干 + 4 个选项（A./B./C./D.）+ 单独一行【正确答案】X，（解析/设计说明本次不需要，稍后单独生成）'; continue }
        // 本地唯一单选质检（确定性 skill）：通用硬规则 + 本板块/题型「质检子命题人」专属检查
        const lv = localQuizVerify(cur)
        const plateErr = plateChecks(cur, item.subject, variant)
        const allErr = [...(lv.ok ? [] : [lv.reason]), ...plateErr]
        // 优化④配图强校验：图形推理 题干+选项必须含合法 SVG（无图/坏图不入卷）
        const _figIssue = (item.subject === '图形推理') ? (() => {
          const ft = String(cur.stem || '') + ' ' + (cur.options || []).map((o) => String((o && o.t) || '')).join(' ')
          if (!/<svg/i.test(ft)) return '题干/选项缺少可渲染的 SVG 图形'
          const s2 = checkFigureText(ft)
          return s2.ok ? '' : ('SVG 不合法：' + s2.issue)
        })() : ''
        if (allErr.length || _figIssue) {
          const reason = allErr.length ? allErr.join('；') : _figIssue
          failReasons.push(reason)
          fixHint = '。上一版未过本地质检（' + reason + '）：请修正使题目恰有唯一正确选项（单选），其余三项必须明显不符合问法，严禁重复/同义选项' + (plateLearn(item.subject) ? '（本板块避坑：' + plateLearn(item.subject) + '）' : ''); continue
        }
        // 35号批次5：蓝本防照抄（确定性零 API）——生成题干与所选真题蓝本出现连续 12 字重合即判重出
        if (bpEntries.length) {
          const cpy = copyIssue(cur.stem, bpEntries)
          if (cpy) {
            const reason = '题干与真题蓝本字面重合（' + cpy + '），防照抄规则拒绝'
            failReasons.push(reason)
            fixHint = '。上一版题干与所选真题蓝本出现连续 12 字重合：严禁照抄，请更换素材/数字/场景/表述后重出'; continue
          }
        }
        // 深化·AI题可算必验（零额外 API）：数量/资料单题【验算】纯算式程序求值复核；不符 → 定向重出并锁定 calcBad
        if (item.subject === '数量关系' || item.subject === '资料分析') {
          const cc = calcRecheck(cur, raw)
          if (cc && cc.ok === false) {
            calcBad = true
            failReasons.push(cc.reason)
            fixHint = '。上一版【验算】程序复核未过（' + cc.reason + '）：请重算修正，使【验算】算式结果与所附数值、所选答案选项的数值一致（算式仅限纯数字与 + - * / ( )）'; continue
          }
        }
        lastParsed = cur // 解析成功且通过本地质检 → 记下，供放宽兜底
        if ((variant === '真假话' || String(raw).includes('【验证数据】')) && item.subject === '逻辑判断') {
          stage(attempt, '真值表硬校验中…')
          const vd = extractVerifyData(raw)
          const vt = vd ? verifyTruthTable(vd) : null
          if (!vt || !vt.ok) { fixHint = '。上一版真值表校验未通过（' + (vt ? vt.reason : '缺少【验证数据】JSON') + '）：请重设条件/选项，使 2^n 枚举恰一组满足题设真假数、且恰一个选项对应唯一解，并在输出末尾附【验证数据】JSON'; continue }
          ttVerified = true
        }
        if (needAiRecheck({ aiGateOn: aiGate, ttVerified, isBlank: isBlankQC, attempt })) { // 选词填空：本地质检通过后 AI 复核至多 2 次（防误杀型反复否决） // 37号 加固C：双模型互检 / 快模型质量门（strictGen 关掉但用快模型出题时仍保底一次 AI 复核）
          stage(attempt, 'AI 质检中…')
          const vq = await verifyQuestion(cur, item.subject, variant)
          if (vq && vq.error) { failReasons.push('AI质检调用失败（网络/模型/限流）——暂不据此判死'); continue }
          if (!(vq && vq.pass)) { qcHardFail = true; failReasons.push('AI质检未过（唯一解/恰一正确/无逻辑谬误）'); fixHint = '。上一版未过 AI 质检（题干自洽/唯一解/恰一正确/无逻辑谬误）：请按反馈修正后重出'; continue }
        }
        qz = cur
      }
      // 放宽兜底：本地唯一单选质检必须通过；未通过本地质检的题绝不收（保证唯一单选是底线）
      // 写入出题历史（供 AI 学习：板块/题型/尝试次数/失败原因/是否成功）
      recordGenLog({ plate: item.subject, variant, difficulty: item.difficulty || '', ok: !!qz, attempts: genAttempts, reasons: failReasons, src: 'single' })
      // 放宽兜底仅在【无 AI 复核门】时允许：开启 strict/双检/快模型质量门后，被 AI 复核否决(非唯一/多解/多选)的题绝不兜底放行——宁可判失败重出，也不把有争议的题发给用户
      if (!qz && canRelaxDecision({ hasLastParsed: !!lastParsed, lastOk: lastParsed ? localQuizVerify(lastParsed).ok : false, calcBad, isTruthTable: variant === '真假话', qcHardFail })) qz = lastParsed // 仅“内容真被否决”才不放行；调用失败等可按本地兜底收下
      if (qz && qz.options && qz.options.length >= 4) {
        item.stem = qz.stem
        item.options = qz.options
        item.answer = qz.answer
        item.explain = String(qz.explain || '').replace(/【验算】[^\n]*/g, '').trim() // 【验算】复核行不外显
        item.designer = qz.designer || ''
        item.variant = variant
        // 35号批次1-A：考点出题即写（AI自标缺失时本地兜底），随题入库/作答事件
        item.kpoint = String(qz.kpoint || '').trim() || kpointOf(item.subject, qz.stem)
        // Request E·多样性：成功出题后记录本题题干头（供后续题避开同话题/同素材）
        recordQuestion(item.subject, qz.stem)
      } else {
        // AI 多次未过质检 → 本地题库自动回退（图推/数量/政治，保证一定出得了题、且无裁切）
        const localFallback = item.subject === '图形推理' ? genTutuQuestion : (item.subject === '数量关系' ? genSlQuestion : (item.subject === '政治理论' ? genZzQuestion : (item.subject === '资料分析' && !item.group ? genZlQuestion : null)))
        if (localFallback && !(item.subject === '图形推理' && String(item.variant || '').match(/空间重构|截面图|三视图|立体拼合/))) {
          const lq = localFallback()
          if (lq) { item.stem = lq.stem; item.options = lq.options; item.answer = lq.answer; item.explain = lq.explain || ''; item.variant = '本地题库'; item.local = true; item.err = false; item.kpoint = kpointOf(item.subject, lq.stem); return }
        }
        const lastReason = failReasons.length ? failReasons[failReasons.length - 1] : ''
        item.stem = lastReason && /逻辑填空|填空|质检|格式|空位|唯一|正确/.test(lastReason) ? '（本题目连出未过，最近一次原因：' + String(lastReason).replace(/\.$/, '').slice(0, 140) + '）' : '（本题目 AI 生成多次未通过质检，可点「重出」重试）'
        item.err = true
      }
    } catch (e) {
      if (genAbort) { item.err = true; return } // 取消出卷：仅标记待重出，不覆盖为“出题失败”
      // 深化·兜底加固：异常（网络/Key/超时/上游5xx）路径同样先试本地确定性生成（图推/数量/政治）——
      // 这类题不依赖模型算力即可成题，避免整卷因个别题瞬时异常而残缺开考
      try {
        const lf = item.subject === '图形推理' ? genTutuQuestion : (item.subject === '数量关系' ? genSlQuestion : (item.subject === '政治理论' ? genZzQuestion : (item.subject === '资料分析' && !item.group ? genZlQuestion : null)))
        if (lf && !(item.subject === '图形推理' && String(item.variant || '').match(/空间重构|截面图|三视图|立体拼合/))) {
          const lq = lf()
          if (lq && lq.options && lq.options.length >= 4) {
            item.stem = lq.stem; item.options = lq.options; item.answer = lq.answer; item.explain = lq.explain || ''
            item.variant = '本地题库'; item.local = true; item.err = false; item.kpoint = kpointOf(item.subject, lq.stem)
            return
          }
        }
      } catch (ignored) { void ignored }
      item.stem = '（出题失败：' + e.message + '）'
      item.err = true
    }
  }

  async function ensureGen(i) {
    const item = questions.value[i]
    if (!item || item.stem || generating[i]) return
    if (item.fromWrong) return
    generating[i] = true
    genBusy.value = true
    await genOne(i)
    generating[i] = false
    genBusy.value = false
    // 预生成下一题
    if (questions.value[i + 1]) ensureGen(i + 1)
  }

  async function prefetchSingle() {
    // 后台预生成下一题（同板块/难度/题型），点「再来一题」秒开
    if (!singleMode.value || genAbort) return
    const plate = singlePlate.value
    const diff = difficulty.value === 'curve' ? 'mid' : difficulty.value
    const isFree = singleVariant.value === '不限'
    // Request E·多样性：不限时用题型轮换器让相邻"再来一题"的题型也不同
    const vars = singleVars.value
    const variant = isFree ? (vars.length ? freshVariant(plate, poolOf(plate), 3) : '') : singleVariant.value // ③同类不重出
    const dir = singleDir.value === 'auto' ? resolveDir('auto') : singleDir.value
    const dirText = singleDir.value === 'custom' ? singleDirText.value.trim() : ''
    const item = { subject: plate, difficulty: diff, variant, dir, dirText, stem: null, options: [], answer: '', explain: '', picked: null, correct: null, timeout: false, err: false }
    const localCapable = { '图形推理': genTutuQuestion, '数量关系': genSlQuestion, '政治理论': genZzQuestion }
    if (localCapable[plate] && (singleLocal.value || !pickGenC() || !pickGenC().key)) {
      const lq = localCapable[plate]()
      if (lq) { prefetchQ.value = { item: { ...item, stem: lq.stem, options: lq.options, answer: lq.answer, explain: lq.explain || '', variant: '本地题库', local: true, kpoint: kpointOf(plate, lq.stem) }, plate, difficulty: diff, variant: variant === '' ? '不限' : variant }; recordQuestion(plate, lq.stem) }
      return
    }
    const c = pickGenC()
    if (!c || !c.key) return
    try {
      const sys = buildQuizSys({ plate, difficulty: diff, variant, calib: calibrationHint(plate, variant, diff) })
      const qv = askVariant(plate, variant, diverSeq)
      const qvHint = (qv && !dirText) ? '\n【本题问法】' + qv + '（真题提问方式，可据此组织题干末尾的问法行）' : ''
      diverSeq++
      const diverTxt = diversitySnippet(plate, variant, diverSeq)
      const ask = (variant ? '请为【' + plate + '】出一道' + variant + '仿真模拟题（本题型：' + variant + '）。' : '请为【' + plate + '】出一道仿真模拟题。') + dirHint(plate, dir, dirText) + diverTxt + qvHint
      const reply = await chatOnce(c, [{ role: 'system', content: sys }, { role: 'user', content: ask }], 6000, genBudgetMS(), genCtrl && genCtrl.signal)
      const qz = parseQuiz(reply)
      if (qz && qz.options && qz.options.length >= 4) {
        prefetchQ.value = { item: { ...item, stem: qz.stem, options: qz.options, answer: qz.answer, explain: qz.explain || '', designer: qz.designer || '', kpoint: String(qz.kpoint || '').trim() || kpointOf(plate, qz.stem) }, plate, difficulty: diff, variant }
        recordQuestion(plate, qz.stem)
      }
    } catch (e) { /* 预生成失败静默，下次点再来一题再实时生成 */ }
  }

  function retryGen() {
    const i = cur.value
    const item = questions.value[i]
    if (!item) return
    if (item.group) {
      // 整组重出：定位组首，清空整组
      let lead = i
      for (let k = i; k >= 0; k--) {
        const x = questions.value[k]
        if (x && x.group && x.groupId === item.groupId) lead = k
        else break
      }
      for (let k = lead; k < lead + (item.groupN || 5); k++) {
        const x = questions.value[k]
        if (x) { x.stem = null; x.err = false; x.options = []; x.answer = ''; x.explain = '' }
      }
      ensureGen(lead)
      return
    }
    item.stem = null; item.err = false; item.options = []; item.answer = ''; item.explain = ''
    ensureGen(i)
  }
  // 深化·续出（组卷拦截后）：仅重出失败题——已成功的题保留在卷子里，不整卷重出、不重复烧额度
  async function retryGo() {
    if (phase.value !== 'config') return
    const info = retryInfo && retryInfo.value
    const p = info && info.paper
    if (!p || !Array.isArray(p.questions)) return
    // 重置计划（纯函数）：非失败且不属于失败题组的题绝不重置；失败题组整组重出保材料自洽
    const plan = pickRetryReset(p.questions)
    if (!plan.n) { if (retryInfo) retryInfo.value = null; return }
    plan.resetIdx.forEach((idx) => {
      const it = p.questions[idx]
      if (!it) return
      it.err = false; it.stem = null; it.options = []; it.answer = ''; it.explain = ''; it.local = false; it.kpoint = ''
      if (it.group) it.variant = '' // 组内题型随材料重新递进，旧题型标签作废
    })
    if (retryInfo) retryInfo.value = null
    showToast('🔄 正在只补 ' + plan.n + ' 题失败题（已出 ' + plan.ok + ' 题保留，不重复出）…', 'info')
    await genAll(p)
  }
  function retryDismiss() {
    if (retryInfo) retryInfo.value = null
    try { clearPending() } catch (e) {}
    questions.value = []
    phase.value = 'config'
    genTotal.value = 0
    genDone.value = 0
  }


  // 深化·断点续出：从本地草稿恢复中断组卷（已出成功题保留，失败题只补）
  function resumePending() {
    if (phase.value !== 'config') return
    const d = loadPending()
    if (!d || !Array.isArray(d.items) || !d.items.length) { showToast('没有可恢复的出卷草稿', 'info'); return }
    try {
      const items = d.items.map((it) => ({ ...it, picked: null, correct: null, timeout: false, err: !!it.err }))
      const p = makePaper(String(d.name || '模拟卷·续出') + '（续出）', items)
      questions.value = []
      const errN = items.filter((x) => x.err || !x.stem).length
      if (retryInfo) retryInfo.value = { ok: items.length - errN, n: errN, summary: d.summary || '', paper: p }
      if (errN) { retryGo() } else { if (!papers.value.some((x) => x.id === p.id)) { papers.value.unshift(p); savePapers() } try { clearPending() } catch (e) {} questions.value = p.questions; onPaperReady(p) }
    } catch (e) { showToast('恢复草稿失败：' + (e && e.message || e), 'error') }
  }

  // AI 智能出题：按卷面构成每个板块生成 min(count, aiCap) 题，预生成（并发2）并展示进度/预计剩余时间
  // 组卷规则引擎：判断推理大类自动展开为 4 子板块（避免只出逻辑题），保证题型轮换覆盖全类
  function expandModules(list) {
    const out = []
    ;(list || []).forEach((m) => {
      if (m.subject === '判断推理') {
        const subs = ['图形推理', '定义判断', '类比推理', '逻辑判断']
        const n = Math.max(0, m.count || 0)
        if (n <= 0) return // 0 题板块不得出题
        const base = Math.floor(n / subs.length), rem = n % subs.length
        const ref = Math.max(3, Math.round((m.refMin || 20) / subs.length))
        subs.forEach((s, i) => { out.push({ subject: s, count: base + (i < rem ? 1 : 0), refMin: ref }) })
      } else out.push({ ...m })
    })
    return out
  }
  function resolvePaperDir() {
    if (paperDir.value === 'is' || paperDir.value === 'not') return paperDir.value
    if (paperDir.value === 'custom') return 'custom'
    return resolveDir('auto')
  }
  function startAi() {
    singleMode.value = false // 来源隔离：组卷按整卷语义走完整性护栏（防上次单题状态泄漏）
    const plan = []
    // 35号批次3-B：补短模式（store.cfg.strengthen）——薄弱点加权只在有足够作答数据时启用
    const strengthenOn = !!store.cfg.strengthen
    const flagCounts = flaggedByVariant() // 37号 正确性加固B：疑题计数(按变体) → 组卷对该(板块|变体)降权（修正：勿用按考点聚合的 flaggedSummary，否则带考点的标记查不到变体而降权失效）
    let strengthenAttempts = null
    const getAtt = () => { if (strengthenAttempts == null) { try { strengthenAttempts = readAttempts() } catch (e) { strengthenAttempts = [] } } return strengthenAttempts }
    let total = 0
    const modN = (m) => { const c = Math.max(0, Number(m.count) || 0); return aiCap.value > 0 ? Math.min(c, aiCap.value) : c }
    const exp = expandModules(modules.value)
    exp.forEach((m) => { total += modN(m) })
    let gi = 0
    let gid = 0
    exp.forEach((m) => {
      const n = modN(m)
      if (n <= 0) return // 0 题板块不得出题
      const vars = SUB_VARIANTS[m.subject] || []
      if (m.subject === '资料分析') {
        // 真题卷面：一篇材料配 5 题（最后一组可不足），材料形式轮换；组内题型递进
        const groups = []
        for (let i = 0; i < n; i += 5) groups.push(Math.min(5, n - i))
        groups.forEach((gn) => {
          for (let k = 0; k < gn; k++) {
            const d = difficulty.value === 'curve' ? diffCurve(gi, total) : difficulty.value
            const variant = k === gn - 1 ? '综合分析' : (ZL_PLAN[k % ZL_PLAN.length])
            plan.push({
              subject: '资料分析', difficulty: d, variant, dir: resolvePaperDir(), dirText: paperDir.value === 'custom' ? paperDirText.value.trim() : '', group: true, groupId: gid, groupN: gn,
              groupLeader: k === 0, matType: (m.matType && m.matType !== 'auto') ? m.matType : ['text', 'table', 'mixed', 'chart'][gid % 4],
              stem: null, options: [], answer: '', explain: '', picked: null, correct: null, timeout: false, err: false
            })
            gi++
          }
          gid++
        })
        return
      }
      // 预分配题型（同板块内轮换，单题题型；一拖N 分析推理单独追加，见末尾）
      // 35号批次2-C：组卷名额按真题考频基准分配（planVariants，相邻错开由内部排序保证）；
      // 无考频数据的板块退化为均匀基准。自由出题/单题快练仍走 makeVariantRotator 保持原体验。
      // 35号批次3-B：开启补短时按 (考频基准 × (1+λ·薄弱度)) 加权（内部有冷启动门槛，不足自动退化为纯考频）
      const seq = vars.length ? (strengthenOn ? planStrengthened(m.subject, vars, n, getAtt(), undefined, flagCounts) : planVariants(m.subject, vars, n, { flags: flagCounts })) : []
      diverSeq += n
      for (let i = 0; i < n; i++) {
        const v = seq[i] || ''
        const d = difficulty.value === 'curve' ? diffCurve(gi, total) : difficulty.value
        plan.push({ subject: m.subject, difficulty: d, variant: v, dir: resolvePaperDir(), dirText: paperDir.value === 'custom' ? paperDirText.value.trim() : '', stem: null, options: [], answer: '', explain: '', picked: null, correct: null, timeout: false, err: false })
        gi++
      }
    })
    // 一拖N 分析推理组：独立于题型轮换（每组 N 小题，属分析推理综合推演）
    const ytGroups = Math.max(0, Math.min(2, paperYtNGroup.value || 0))
    for (let g = 0; g < ytGroups; g++) {
      const gn = Math.max(2, Math.min(5, paperYtN.value || 5))
      for (let k = 0; k < gn; k++) {
        const d = difficulty.value === 'curve' ? diffCurve(gi, total) : difficulty.value
        plan.push({
          subject: '逻辑判断', difficulty: d, variant: '一拖五', group: true, groupId: gid, groupN: gn,
          groupLeader: k === 0,
          stem: null, options: [], answer: '', explain: '', picked: null, correct: null, timeout: false, err: false
        })
        gi++
      }
      gid++
    }
    if (!plan.length) { showToast('请先配置卷面（至少一个板块）', 'info'); return }
    const paper = makePaper('智能模拟卷 · ' + selTmpl.value.name, plan)
    // 1.7 出题成功才入历史卷子：失败/取消不产生成绩痕迹（生成成功后在 genAll 末尾统一入卷）
    genAll(paper)
  }

  function buildSingleItems() {
    const diff = difficulty.value === 'curve' ? 'mid' : difficulty.value
    const fixedVar = singleVariant.value === '不限' ? '' : singleVariant.value
    const vars = singleVars.value
    const batch = Math.max(1, Math.min(20, singleBatch.value || 1))
    const items = []
    // 资料分析·真题题组模式：组量≥5 时，一篇完整材料（文字/表格/图形/综合，可自定义）配 5 题，第5题为综合分析；组量>5 拆多组
    // 言语·篇章阅读题组模式：一篇完整现代文配 2-5 道小题（类判断一拖N），底层仍归言语理解板块
    if (singlePlate.value === '篇章阅读' && batch > 1) {
      const WZ_KINDS = ['细节理解', '词句理解', '中心理解', '意图判断', '语句衔接', '综合推断']
      let wg = 9000
      for (let g = 0; g < batch; g += 5) {
        const gn = Math.min(5, batch - g)
        for (let k = 0; k < gn; k++) {
          items.push({ subject: '言语理解', wz: true, difficulty: diff, variant: k === gn - 1 ? '篇章综合' : WZ_KINDS[k % WZ_KINDS.length], dir: 'auto', dirText: '', group: true, groupId: wg, groupN: gn, groupLeader: k === 0, stem: null, options: [], answer: '', explain: '', picked: null, correct: null, timeout: false, err: false })
        }
        wg++
      }
      return items
    }
    if (singlePlate.value === '资料分析' && batch > 1) {
      let gid = 0
      for (let g = 0; g < batch; g += 5) {
        const gn = Math.min(5, batch - g)
        const matType = singleMatType.value === 'auto' ? ['text', 'table', 'mixed', 'chart'][gid % 4] : singleMatType.value
        const dir = singleDir.value === 'auto' ? resolveDir('auto') : singleDir.value
        const dirText = singleDir.value === 'custom' ? singleDirText.value.trim() : ''
        for (let k = 0; k < gn; k++) {
          const variant = k === gn - 1 ? '综合分析' : (ZL_PLAN[k % ZL_PLAN.length])
          items.push({
            subject: '资料分析', difficulty: diff, variant, dir, dirText,
            group: true, groupId: gid, groupN: gn, groupLeader: k === 0, matType,
            stem: null, options: [], answer: '', explain: '', picked: null, correct: null, timeout: false, err: false
          })
        }
        gid++
      }
      return items
    }
    const rot = makeVariantRotator(poolOf(singlePlate.value), diverSeq % 3) // 池=自选∪扩展（不限轮换含创新题型）
    for (let i = 0; i < batch; i++) {
      // Request E·多样性：不限时用题型轮换器让相邻题型错开
      const v = fixedVar || (vars.length ? rot() : '')
      const dir = singleDir.value === 'auto' ? resolveDir('auto') : singleDir.value
      const dirText = singleDir.value === 'custom' ? singleDirText.value.trim() : ''
      items.push({ subject: (singlePlate.value === '片段阅读' || singlePlate.value === '篇章阅读') ? '言语理解' : singlePlate.value, difficulty: diff, variant: v, dir, dirText, stem: null, options: [], answer: '', explain: '', picked: null, correct: null, timeout: false, err: false })
    }
    return items
  }
  function startSingle() {
    try { localStorage.setItem('xc_single_plate', singlePlate.value) } catch (e) {}
    singleMode.value = true
    const items = buildSingleItems()
    const batch = items.length
    const paper = makePaper('单题快练 · ' + singlePlate.value + (batch > 1 ? '（' + batch + ' 题组）' : ''), items)
    papers.value.unshift(paper); savePapers()
    genAll(paper) // 先出题再开考，避免做题倒计时提前启动
  }

  // 🌅 晨练包（批次8）：资料速算5(一篇材料配5题) + 常识速测5 + 错题本未复盘二刷5 = 15题，复用 genAll 出卷流程
  function startMorning() {
    singleMode.value = false
    const plan = []
    // 资料分析 5 题（真题一篇材料配 5 题，第 5 题综合分析）
    for (let k = 0; k < 5; k++) {
      const variant = k === 4 ? '综合分析' : (ZL_PLAN[k])
      plan.push({ subject: '资料分析', difficulty: 'mid', variant, dir: resolveDir('auto'), dirText: '', group: true, groupId: 0, groupN: 5, groupLeader: k === 0, matType: ['text', 'table', 'chart'][k % 3], stem: null, options: [], answer: '', explain: '', picked: null, correct: null, timeout: false, err: false })
    }
    // 常识判断 5 题
    for (let k = 0; k < 5; k++) {
      plan.push({ subject: '常识判断', difficulty: 'mid', variant: '', dir: resolveDir('auto'), dirText: '', stem: null, options: [], answer: '', explain: '', picked: null, correct: null, timeout: false, err: false })
    }
    // 错题本未复盘/未消化 5 题（二刷）
    const pend = store.wqs.filter((q) => !(q.reviewed || q.digested)).slice(0, 5)
    pend.forEach((wq) => {
      const opts = extractChoices(wq.question || '')
      plan.push({ subject: wq.subject || '未分类', stem: wq.question || '', options: opts, answer: answerLetter(wq.answer || ''), analysis: [wq.method, wq.note].filter(Boolean).join('\n'), fromWrong: true, wrongId: wq.id, picked: null, correct: null, timeout: false, err: false })
    })
    if (!plan.length) { showToast('晨练包生成失败：请先收纳错题或配置模型', 'error'); return }
    const p = makePaper('🌅 每日晨练包（15题）', plan)
    genAll(p)
  }
  // 每周错题重做卷（批次8）：近 7 天新错的题一键重做（含未复盘优先）
  function startWeekRedo() {
    singleMode.value = false // 周重做卷为整卷计时语义（防上次单题状态泄漏）
    const weekAgo = Date.now() - 7 * 86400000
    let src = store.wqs.filter((q) => (q.at || 0) >= weekAgo)
    if (!src.length) src = store.wqs.slice().sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 10)
    src = src.slice(0, 20)
    const list = src.map((wq) => {
      const opts = extractChoices(wq.question || '')
      return { subject: wq.subject || '未分类', stem: wq.question || '', options: opts, answer: answerLetter(wq.answer || ''), analysis: [wq.method, wq.note].filter(Boolean).join('\n'), fromWrong: true, wrongId: wq.id, picked: null, correct: null, timeout: false, err: false }
    })
    if (!list.length) { showToast('暂无错题可组重做卷，先去刷题吧', 'info'); return }
    const p = makePaper('📅 每周错题重做卷（' + list.length + '题）', list)
    papers.value.unshift(p); savePapers()
    startPaper(p)
  }

  // 预生成所有题目：并发 2，进度条 + 预计剩余时间（用户可随时取消）
  async function genAll(paper) {
    genAbort = false
    if (retryInfo) retryInfo.value = null // 新一次出卷开始 → 清掉上一卷的「只补失败题」快照
    try { clearPending() } catch (e) {}
    if (genCtrl) { genCtrl.abort(); genCtrl = null }
    genCtrl = new AbortController()
    questions.value = paper.questions
    phase.value = 'gen'
    genTotal.value = questions.value.length
    genDone.value = 0
    genErrCount.value = 0
    genCur.value = '准备出题…'
    genLive.value = ''
    genEta.value = 0
    genSec.value = 0
    const t0 = Date.now()
    if (genTimer) clearInterval(genTimer)
    genTimer = setInterval(() => { genSec.value = Math.round((Date.now() - t0) / 1000) }, 1000)
    const times = []
    let cursor = 0
    const CONC = Math.max(1, Math.min(4, genConcur.value || 3))
    async function worker() {
      while (cursor < questions.value.length && !genAbort) {
        const i = cursor++
        const item = questions.value[i]
        genCur.value = '第 ' + (i + 1) + ' / ' + genTotal.value + ' 题 · ' + item.subject + (item.difficulty ? '（' + (DIFF_LABEL[item.difficulty] || item.difficulty) + '）' : '')
        const st = Date.now()
        await genOne(i)
        const dt = Date.now() - st
        times.push(dt)
        if (times.length > 10) times.shift()
        genDone.value++
        if (item.err) genErrCount.value++
        const avg = times.reduce((a, b) => a + b, 0) / Math.max(1, times.length)
        genEta.value = Math.max(0, Math.round(((questions.value.length - genDone.value) * avg) / 1000))
      }
    }
    // 按并发度设置启动对应数量的 worker（之前写死 2 路，UI 的并发选项形同虚设）
    await Promise.all(Array.from({ length: CONC }, () => worker()))
    if (genTimer) { clearInterval(genTimer); genTimer = null }
    if (genAbort) { phase.value = 'config'; showToast('已取消出卷', 'info'); return }
    if (!questions.value.some((q) => !q.err && q.stem)) {
      phase.value = 'config'
      const firstErr = questions.value.find((q) => q.err && q.stem)
      let reason = firstErr ? String(firstErr.stem).replace(/^[（(]出题失败[：:]\s*/, '').slice(0, 160) : ''
      if (reason.includes('未配置模型')) reason = '未配置文字模型，请到设置填 Key'
      showToast('出题失败：' + (reason || '请检查模型 Key 或网络'), 'error')
      return
    }
    // 1.9 质检失败剔除：仍失败(未通过质检)的题从卷中剔除，答题卡不留空行，总分按有效题数计
    if (questions.value.some((q) => q.err || !q.stem)) {
      const failedQ = questions.value.filter((q) => q.err || !q.stem)
      paper.retryMissing = failedQ.map((qq) => ({ subject: qq.subject || '', variant: qq.variant || '', reason: String(qq.stem || qq.err || '').replace(/^（|）$/g, '').slice(0, 140) }))
      const valid = questions.value.filter((q) => !q.err && q.stem)
      questions.value = valid
      genTotal.value = valid.length
      // 深化·完整性护栏：非单题快练的组卷不允许以残缺卷开考（失败题重新出卷/单题重出排查后再开始）
      if (!singleMode.value && paper.retryMissing.length) {
        phase.value = 'config'
        questions.value = []
        genTotal.value = 0
        const r0 = paper.retryMissing[0]
        // 深化·续出：拦截残缺卷同时把「已出成功题」整卷快照挂在 paper 上 → 配置页出现「🔄 只补失败题」一键续出
        if (retryInfo) {
          try {
            retryInfo.value = {
              ok: valid.length,
              n: paper.retryMissing.length,
              summary: [...new Set(paper.retryMissing.map((m) => m.subject + (m.variant ? '·' + m.variant : '')))].slice(0, 4).join('、') + (paper.retryMissing.length > 1 ? ' 等' : ''),
              reasons: [...new Set(paper.retryMissing.map((m) => (m.subject || '') + (m.variant ? '·' + m.variant : '') + (m.reason ? '：' + String(m.reason).replace(/\s+/g, ' ').slice(0, 56) : '')))].slice(0, 4),
              paper
            }
          } catch (e) { retryInfo.value = null }
        }
        try { savePending(paper) } catch (e) {} // 断点续出：把成功题草稿落盘（刷新/关闭后可在配置页恢复）
        showToast('❌ 本卷有 ' + paper.retryMissing.length + ' 题出题失败（已拦截残缺卷，避免无效作答）：' + r0.subject + '（' + (r0.variant || '综合') + '）' + (paper.retryMissing.length > 1 ? ' 等' : '') + '。可点下方「🔄 只补失败题」续出（已出 ' + valid.length + ' 题保留不重复）；或降低并发/关闭严格质检与双模型互检/换更快模型后重新开始出卷。', 'error')
        return
      }
      showToast('⚠️ 有 ' + paper.retryMissing.length + ' 题失败已跳过（单题/批量练习模式）', 'warning')
    }
    // 1.7 出题成功才入历史卷子（失败/取消已在上方 return，不产生成绩痕迹）
    if (!papers.value.some((x) => x.id === paper.id)) { papers.value.unshift(paper); savePapers() }
    try { clearPending() } catch (e) {} // 出卷成功 → 断点草稿作废
    // 35号批次5(2/3)：出卷质量报告——汇总本卷出题日志（重出数/总生成次数），附到卷子供结果页展示
    try {
      paper.qc = recentGenStats(t0)
    } catch (e) {
      paper.qc = null
    }
    // 深化：卷构成（AI/本地确定性/真题/重做/锚点）统计——结果页外显“确定性保证度”
    try {
      const m = { ai: 0, local: 0, zhenti: 0, anchor: 0, redo: 0 }
      questions.value.forEach((qq) => {
        if (qq.local) m.local++
        else if (qq.anchor) m.anchor++
        else if (qq.zhenti) m.zhenti++
        else if (qq.fromWrong || qq.fromCol) m.redo++
        else m.ai++
      })
      paper.mix = m
    } catch (e) { paper.mix = null }
    if (singleMode.value) {
      questions.value.forEach((qq) => { if (qq && qq.stem && !qq.err) addToQuizCol(qq) })
      if (questions.value.length === 1) prefetchSingle()
    }
    if (singleMode.value && questions.value.length === 1) {
      // 单题快练：出完直接开考（不打断节奏）
      startPaper(paper)
    } else {
      // 组卷/多题组：等用户点「是」才开考与计时
      onPaperReady(paper)
    }
    showToast('✅ 出卷完成，共 ' + questions.value.length + ' 题' + (genErrCount.value ? '（' + genErrCount.value + ' 题失败已剔除）' : '') + (paper.qc && paper.qc.retried ? ' · 质检重出 ' + paper.qc.retried + ' 题（合计生成 ' + paper.qc.attempts + ' 次）' : ''), 'success')
  }
  function cancelGen() {
    try { clearPending() } catch (e) {} // 用户主动取消出卷 → 断点草稿作废
    genAbort = true
    if (genCtrl) { genCtrl.abort(); genCtrl = null } // 立即中断进行中的生成请求，避免取消后仍在消耗额度
    if (genTimer) { clearInterval(genTimer); genTimer = null }
    phase.value = 'config'
    questions.value = []
    showToast('已取消出卷', 'info')
  }

  // ===== 出题集（单题快练/出题自动收纳，支持二刷）=====
  function saveQuizCol() { try { localStorage.setItem('xc_quiz_col', JSON.stringify(quizCol.value)) } catch (e) {} }
  function addToQuizCol(q) {
    const key = String(q.stem || '').slice(0, 40)
    const exist = quizCol.value.find((x) => String(x.stem || '').slice(0, 40) === key)
    if (exist) { exist.lastAt = Date.now(); saveQuizCol(); return }
    quizCol.value.unshift({
      id: Date.now() + Math.random(), ts: Date.now(),
      subject: q.subject, difficulty: q.difficulty, variant: q.variant,
      kpoint: String(q.kpoint || '').trim() || kpointOf(q.subject, q.stem), // 35号批次1-A
      stem: q.stem, options: q.options || [], answer: q.answer, explain: q.explain || '', designer: q.designer || '',
      wrongCount: 0, correctStreak: 0, lastAt: Date.now(), lastOk: null, history: []
    })
    if (quizCol.value.length > 200) quizCol.value = quizCol.value.slice(0, 200)
    saveQuizCol()
  }
  // 二刷：直接用出题集里的题（不重新调 AI），先做题后看答案
  function startRedo(col) {
    singleMode.value = true
    const item = {
      subject: col.subject, difficulty: col.difficulty, variant: col.variant, kpoint: col.kpoint || '',
      stem: col.stem, options: (col.options || []).map((o) => ({ ...o })),
      answer: col.answer, explain: col.explain || '', designer: col.designer || '',
      picked: null, correct: null, timeout: false, err: false, fromCol: true
    }
    const paper = makePaper('二刷 · ' + col.subject, [item])
    papers.value.unshift(paper); savePapers()
    startPaper(paper)
  }
  // 35号批次1-A：签名扩展 (q, ok, usedSec)，history 记录作答用时（供难度/速度信号使用）
  function updateQuizColResult(q, ok, usedSec) {
    const key = q && String(q.stem || '').slice(0, 40)
    if (!key) return
    const col = quizCol.value.find((x) => String(x.stem || '').slice(0, 40) === key)
    if (!col) return
    col.lastAt = Date.now(); col.lastOk = ok
    if (ok) { col.correctStreak++; } else { col.wrongCount++; col.correctStreak = 0 }
    col.history = col.history || []
    col.history.push({ t: Date.now(), ok, usedSec: Number(usedSec) > 0 ? Math.round(Number(usedSec)) : 0 })
    if (col.history.length > 20) col.history = col.history.slice(-20)
    saveQuizCol()
  }
  function nextSingle() {
    // 单题快练：优先用预生成的下一题（秒开），否则实时生成
    singleMode.value = true
    const curPlate = singlePlate.value
    const curDiff = difficulty.value === 'curve' ? 'mid' : difficulty.value
    const curVar = singleVariant.value === '不限' ? '' : singleVariant.value
    // 5.3 同类连做：钉住考点时不再用随机预生成，走同考点实时生成（换素材不换考点）
    const pinned = samePinned()
    const pf = pinned ? null : prefetchQ.value
    // Request E：不限(自由)模式预生成题型已自动轮换(concrete variant)，故匹配只按板块+难度；
    // 指定题型模式则仍要求题型一致
    const matchFree = curVar === ''
    const usePf = pf && pf.item && pf.item.stem && pf.plate === curPlate && pf.difficulty === curDiff && (matchFree || pf.variant === curVar)
    if (usePf) {
      const item = { ...pf.item, picked: null, correct: null, timeout: false, err: false }
      const paper = makePaper('单题快练 · ' + curPlate, [item])
      papers.value[0] = paper; savePapers()
      prefetchQ.value = null
      if (item && item.stem && !item.err) addToQuizCol(item)
      startPaper(paper)
      prefetchSingle()
      return
    }
    prefetchQ.value = null
    singlePlate.value = curPlate
    singleVariant.value = curVar === '' ? '不限' : curVar
    let items = []
    if (pinned) {
      // 钉住同考点：临时把题型设为钉住值生成单题（真实用时再恢复）
      const prevVar = singleVariant.value
      singleVariant.value = pinned
      items = buildSingleItems()
      singleVariant.value = prevVar
    } else {
      items = buildSingleItems()
    }
    const paper = makePaper('单题快练 · ' + curPlate + (items.length > 1 ? '（' + items.length + ' 题组）' : ''), items)
    papers.value[0] = paper; savePapers()
    genAll(paper)
  }

  function sameRecord(subject, variant, ok) {
    const next = onSameResult(sameStreakState, { subject, variant, ok, enabled: !!store.cfg.keepSame })
    Object.assign(sameStreakState, next)
  }
  function samePinned() {
    return store.cfg.keepSame && sameStreakState.variant ? sameStreakState.variant : ''
  }
  function sameReset() {
    Object.assign(sameStreakState, createSameStreak())
  }

  return {
    resolveDir, dirHint, liveVisible, verifyQuestion, drawZlMaterialSVG,
    genOne, ensureGen, prefetchSingle, retryGen, genAll, cancelGen,
    expandModules, resolvePaperDir, startAi, buildSingleItems, startSingle,
    startMorning, startWeekRedo, startRedo, nextSingle, retryGo, retryDismiss, resumePending,
    addToQuizCol, saveQuizCol, updateQuizColResult,
    sameRecord, samePinned, sameReset
  }
}