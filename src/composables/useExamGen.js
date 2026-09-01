// useExamGen —— ExamPanel 出题主流程（批次6B R3-②a）
// 自 ExamPanel.vue 纯移动，未改动：genOne（出题）/ 质量校验（质检）/ retryGen（重试）/ genAll+worker（并发出卷）
// 依赖全部由组件通过 ctx 注入，并在函数内解构为与拆分前**同名**的变量，保证函数体逐字一致、行为不变。
import { chatOnce, chatStream, buildQuizSys, buildGroupPrompt } from '../api'
import { parseQuiz, parseMaterialQuiz, extractChoices, answerLetter } from '../utils/quiz'
import { showToast } from '../utils/toast'
import { genTutuQuestion } from '../utils/tutuGen'
import { genSlQuestion } from '../utils/slGen'
import { genZzQuestion } from '../utils/zzGen'
import { verifyTruthTable } from '../utils/logicVerify'
import { localQuizVerify } from '../utils/quizVerify'
import { plateChecks, plateAiHint, plateLearn } from '../utils/quizVerifyProfiles'
import { recordGenLog, genLogHint } from '../utils/quizLog'
import { figCfg } from '../api/figEnhance'
import { diffCurve } from '../api/professor'
import { SUB_VARIANTS } from '../components/examData'
import { store } from '../store'
import { onUnmounted } from 'vue'

const DIFF_LABEL = { easy: '易', mid: '中', hard: '难', real: '真题级' }

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
    genEta, genBusy
  } = ctx

  // 出题过程中的模块级可变状态（拆分前位于组件内，现随出题流程一并收拢）
  let genTimer = null
  let genAbort = false
  let genCtrl = null // AbortController：取消出卷时立即中断进行中的请求
  const generating = {}
  onUnmounted(() => { if (genTimer) clearInterval(genTimer) })

  function resolveDir(d) { if (d === 'is' || d === 'not') return d; return Math.random() < 0.5 ? 'is' : 'not' }
  function dirHint(subject, dir, dirText) {
    if (dirText) return '\n【问法】本题问法：' + dirText + '（严格按此问法出题）。'
    if (subject === '定义判断' || subject === '图形推理' || subject === '空间重构') return ''
    return dir === 'is'
      ? '\n【问法】本题为选是题：问"下列属于/正确的是/符合的是/能推出的是"（非定义类按本板块惯例使用正向问法）。'
      : '\n【问法】本题为选非题：问"下列不属于/错误的是/不符合的是/不能推出的是"。'
  }

  // 出题严格质检：二次验证 题干自洽/唯一解/恰一正确（开启 strictGen 时对每道生成题执行）
  async function verifyQuestion(q, plate, variant) {
    const c = pickGenC()
    if (!c || !c.key) return true
    try {
      const learn = genLogHint(plate, variant) // 历史质检学习：过去这类题常错在哪
      const sys = '你是公考行测出题质检员（严格单选）。检查下面这道题：①题干条件是否自洽、能否推出唯一解；②【唯一正确项】必须且只能有一个选项符合题目问法：禁止多选、禁止无正确选项、禁止两个选项同真、禁止选项全对、禁止两个选项同义重复；③选非题（错误的是/不属于/不能推出/不符合）必须保证其余三项均【符合】问法、只有答案项【不符合】；选是题反之；④选项与题干相关、无逻辑谬误；⑤若题干/选项含 SVG 图形（图推/几何），检查：每个 svg 是否带 viewBox 且元素坐标不越出画布（越界会被前端裁切显示不全）、题干图数是否齐全（一组图5图+问号/两组图3+3/九宫格9格/分组分类6图）、选项是否每项都画了候选图。' + plateAiHint(plate, variant) + (learn ? '\n' + learn : '') + '只回复 JSON：{"ok":true} 或 {"ok":false,"reason":"指出具体是哪几个选项都成立/都不成立/重复，便于重出修正"}'
      const user = '题干：' + String(q.stem || '') + '\n选项：' + (q.options || []).map((o) => o.k + '. ' + o.t).join('\n') + '\n答案：' + String(q.answer || '')
      const r = await chatOnce(c, [{ role: 'system', content: sys }, { role: 'user', content: user }], 400)
      const m = String(r || '').match(/"ok"\s*:\s*(true|false)/)
      // fail-closed：质检结果无法解析（缺 ok 字段/JSON 异常）一律视同不合格，触发重出，避免"白付钱却放行劣质题"
      if (!m) return false
      return m[1] === 'true'
    } catch (e) { return false }
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
    const localCapable = { '图形推理': genTutuQuestion, '数量关系': genSlQuestion, '政治理论': genZzQuestion }
    const canLocal = localCapable[item.subject]
    if (singleMode.value && canLocal && (singleLocal.value || !pickGenC() || !pickGenC().key)) {
      const lq = canLocal()
      if (lq) { item.stem = lq.stem; item.options = lq.options; item.answer = lq.answer; item.explain = lq.explain || ''; item.variant = '本地题库'; item.local = true; return }
    }
    const c = pickGenC()
    if (!c || !c.key) {
      // 未配 Key 时本地可出题板块（图推/数量/政治）照样出题：离线练习零门槛
      if (singleMode.value && canLocal && !String(item.variant || '').match(/空间重构|截面图|三视图|立体拼合/)) {
        const lq = canLocal()
        if (lq) { item.stem = lq.stem; item.options = lq.options; item.answer = lq.answer; item.explain = lq.explain || ''; item.variant = '本地题库'; item.local = true; return }
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
        const sys = buildGroupPrompt(item.subject, item.variant, item.difficulty || 'mid', gn, item.matType)
        const matTypeName = { text: '纯文字材料', table: '表格材料', mixed: '混合材料', chart: '图形数据材料' }[item.matType] || '混合材料'
        const ask = (isZL
          ? '请为【资料分析】出一篇完整材料 + ' + gn + ' 道题（材料形式：' + matTypeName + '，第' + gn + '题为综合分析题，前 ' + (gn - 1) + ' 题考点递进）。'
          : '请为【逻辑判断】出一套「一拖' + gn + '」题组（1 个共用材料 + ' + gn + ' 道小题，小题可在不违背总题干逻辑的前提下新增附加条件）。') +
          '【本次输出要求（提速，必须遵守）】只输出 材料 + ' + gn + ' 道小题的题干/选项/答案：### 📄 材料 → ### 第1题（题干 + A./B./C./D. 四选项 + 单独一行【正确答案】X）→ ### 第2题…；不要输出解析/考点/秒杀/命题人设计说明（这些稍后按需单独生成）。材料与各题数据必须自洽、可互相验算。'
        const reply = await chatOnce(c, [{ role: 'system', content: sys }, { role: 'user', content: ask }], 8000, 120000, genCtrl && genCtrl.signal)
        const parsed = parseMaterialQuiz(reply, gn)
        const okN = parsed && parsed.qs.length ? Math.min(gn, parsed.qs.length) : 0
        // 本地唯一单选质检：题组里任何一题不满足「严格单选」→ 整组重出（保证质量是根本）
        const badIdx = (parsed && parsed.qs || []).findIndex((qq) => !localQuizVerify(qq).ok)
        if (okN >= Math.min(2, gn) && badIdx >= 0) {
          failAll('（本组第 ' + (badIdx + 1) + ' 题未过本地唯一单选质检：' + localQuizVerify(parsed.qs[badIdx]).reason + '，可点「重出」重试整组）')
          return
        }
        if (okN >= Math.min(2, gn)) {
          // 材料/共用题干缺失时视为整组失败（缺材料题无法作答），触发重出而非静默拼成无材料题
          if (!parsed.material) { failAll('（材料缺失，可点「重出」重试整组）'); return }
          // 资料分析：材料若没有 SVG 图，用图形增强模型兜底绘制成真题风格图表（迁移图推绘图能力）
          let mat = parsed.material
          if (isZL && !/```svg/.test(mat) && (item.matType === 'table' || item.matType === 'mixed' || item.matType === 'chart')) {
            showToast('📊 正在把材料绘制成图表…', 'info')
            mat = await drawZlMaterialSVG(mat, item.matType)
          }
          for (let k = 0; k < gn; k++) {
            const slot = questions.value[i + k]
            const q = parsed.qs[k]
            if (slot && q) {
              slot.stem = '【📄 材料】\n' + mat + '\n\n' + q.stem
              slot.options = q.options
              slot.answer = q.answer
              slot.explain = q.explain || ''
              slot.variant = slot.variant || (isZL ? (k === gn - 1 ? '综合分析' : ['基期/现期', '增长率', '增长量', '比重', '平均数', '倍数', '隔年增长', '年均增长', '混合增长率', '拉动增长/贡献率'][k % 10]) : '分析推理')
            } else if (slot) {
              slot.err = true
              slot.stem = '（本组第 ' + (k + 1) + ' 题解析失败，可点「重出」重试整组）'
            }
          }
        } else failAll('（材料题组生成格式异常，可点「重出」重试整组）')
        // 写入出题历史（材料题组）：成功与否 + 失败原因，供 AI 学习
        recordGenLog({ plate: item.subject, variant: item.variant || '', difficulty: item.difficulty || '', ok: !!parsed && okN >= Math.min(2, gn) && !questions.value[i + (gn - 1)].err, attempts: 1, reasons: [], src: 'group' })
      } catch (e) {
        if (genAbort) return // 取消出卷：静默返回，不记为出题失败
        failAll('（出题失败：' + e.message + '）')
        recordGenLog({ plate: item.subject, variant: item.variant || '', difficulty: item.difficulty || '', ok: false, attempts: 1, reasons: [String(e && e.message || '')], src: 'group' })
      }
      return
    }
    const variant = item.variant || ''
    try {
      const sys = buildQuizSys({ plate: item.subject, difficulty: item.difficulty || 'mid', variant })
      const dir = item.dir || resolveDir('auto')
      const dh = dirHint(item.subject, dir, item.dirText)
      const fmtHint = (item.subject === '图形推理' && singleMode.value && tutuFormat.value && tutuFormat.value !== 'auto') ? '本题出题形式固定为【' + tutuFormat.value + '】，请严格按【图形推理】子命题人的「SVG 布局铁律」中该形式的画布尺寸与格子布局出图。' : ''
      const zlLearn = genLogHint(item.subject, variant) + (plateLearn(item.subject) ? '（本板块避坑：' + plateLearn(item.subject) + '）' : '')
      const ask = (variant ? '请为【' + item.subject + '】出一道' + variant + '仿真模拟题（本题型：' + variant + '）。' : '请为【' + item.subject + '】出一道仿真模拟题。') + (zlLearn ? '\n' + zlLearn : '') + dh +
        '【本次输出要求（提速，必须遵守）】只输出：题干 + 4 个选项（A./B./C./D.）+ 单独一行【正确答案】X' +
        (item.subject === '逻辑判断' && variant === '真假话' ? ' + 末尾【验证数据】JSON' : '') +
        '。不要输出解析/考点/秒杀/难度自评/命题人设计说明（这些稍后由系统单独生成，你这次只出题）。' + fmtHint
      const msgs = [{ role: 'system', content: sys }, { role: 'user', content: ask }]
      let reply
      if (singleMode.value && questions.value.length === 1) {
        // 单题：流式生成，题干边出边显示
        genLive.value = ''
        reply = await chatStream(msgs, c, (d) => { if (d && d.text) genLive.value = liveVisible(d.text) }, genCtrl && genCtrl.signal, 150000)
        genLive.value = liveVisible(reply || '')
      } else {
        reply = await chatOnce(c, msgs, 6000, 120000, genCtrl && genCtrl.signal)
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
      const stage = (attempt, label) => { genStatus.value = (attempt > 0 ? '第 ' + (attempt + 1) + ' 次重出 · ' : '') + label }
      for (let attempt = 0; attempt < 3 && !qz; attempt++) {
        genAttempts++
        stage(attempt, 'AI 生成中…')
        let cur = attempt === 0 ? parseQuiz(raw) : null
        if (!cur || !cur.options || cur.options.length < 4) {
          // 网络/Key 错误直接抛出（外层显示真实原因），不盲目重试；质检不过则带原因定向重出
          raw = await chatOnce(c, fixHint ? [{ role: 'system', content: sys }, { role: 'user', content: ask + fixHint }] : msgs, 6000, 90000, genCtrl && genCtrl.signal)
          cur = parseQuiz(raw)
        }
        if (!cur || !cur.options || cur.options.length < 4) { fixHint = '。上一版格式不合格：必须输出题干 + 4 个选项（A./B./C./D.）+ 单独一行【正确答案】X，（解析/设计说明本次不需要，稍后单独生成）'; continue }
        // 本地唯一单选质检（确定性 skill）：通用硬规则 + 本板块/题型「质检子命题人」专属检查
        const lv = localQuizVerify(cur)
        const plateErr = plateChecks(cur, item.subject, variant)
        const allErr = [...(lv.ok ? [] : [lv.reason]), ...plateErr]
        if (allErr.length) {
          const reason = allErr.join('；')
          failReasons.push(reason)
          fixHint = '。上一版未过本地质检（' + reason + '）：请修正使题目恰有唯一正确选项（单选），其余三项必须明显不符合问法，严禁重复/同义选项' + (plateLearn(item.subject) ? '（本板块避坑：' + plateLearn(item.subject) + '）' : ''); continue
        }
        lastParsed = cur // 解析成功且通过本地质检 → 记下，供放宽兜底
        if ((variant === '真假话' || String(raw).includes('【验证数据】')) && item.subject === '逻辑判断') {
          stage(attempt, '真值表硬校验中…')
          const vd = extractVerifyData(raw)
          const vt = vd ? verifyTruthTable(vd) : null
          if (!vt || !vt.ok) { fixHint = '。上一版真值表校验未通过（' + (vt ? vt.reason : '缺少【验证数据】JSON') + '）：请重设条件/选项，使 2^n 枚举恰一组满足题设真假数、且恰一个选项对应唯一解，并在输出末尾附【验证数据】JSON'; continue }
          ttVerified = true
        }
        if (store.cfg.strictGen && !ttVerified) {
          stage(attempt, 'AI 质检中…')
          const vq = await verifyQuestion(cur, item.subject, variant)
          if (!vq) { failReasons.push('AI质检未过（唯一解/恰一正确/无逻辑谬误）'); fixHint = '。上一版未过 AI 质检（题干自洽/唯一解/恰一正确/无逻辑谬误）：请按反馈修正后重出'; continue }
        }
        qz = cur
      }
      // 放宽兜底：本地唯一单选质检必须通过；未通过本地质检的题绝不收（保证唯一单选是底线）
      // 写入出题历史（供 AI 学习：板块/题型/尝试次数/失败原因/是否成功）
      recordGenLog({ plate: item.subject, variant, difficulty: item.difficulty || '', ok: !!qz, attempts: genAttempts, reasons: failReasons, src: 'single' })
      if (!qz && lastParsed && variant !== '真假话' && localQuizVerify(lastParsed).ok) qz = lastParsed
      if (qz && qz.options && qz.options.length >= 4) {
        item.stem = qz.stem
        item.options = qz.options
        item.answer = qz.answer
        item.explain = qz.explain || ''
        item.designer = qz.designer || ''
        item.variant = variant
      } else {
        // AI 多次未过质检 → 本地题库自动回退（图推/数量/政治，保证一定出得了题、且无裁切）
        const localFallback = item.subject === '图形推理' ? genTutuQuestion : (item.subject === '数量关系' ? genSlQuestion : (item.subject === '政治理论' ? genZzQuestion : null))
        if (localFallback && !(item.subject === '图形推理' && String(item.variant || '').match(/空间重构|截面图|三视图|立体拼合/))) {
          const lq = localFallback()
          if (lq) { item.stem = lq.stem; item.options = lq.options; item.answer = lq.answer; item.explain = lq.explain || ''; item.variant = '本地题库'; item.local = true; item.err = false; return }
        }
        item.stem = '（本题目 AI 生成多次未通过质检，可点「重出」重试）'
        item.err = true
      }
    } catch (e) {
      if (genAbort) { item.err = true; return } // 取消出卷：仅标记待重出，不覆盖为“出题失败”
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
    const variant = singleVariant.value === '不限' ? '' : singleVariant.value
    const dir = singleDir.value === 'auto' ? resolveDir('auto') : singleDir.value
    const dirText = singleDir.value === 'custom' ? singleDirText.value.trim() : ''
    const item = { subject: plate, difficulty: diff, variant, dir, dirText, stem: null, options: [], answer: '', explain: '', picked: null, correct: null, timeout: false, err: false }
    const localCapable = { '图形推理': genTutuQuestion, '数量关系': genSlQuestion, '政治理论': genZzQuestion }
    if (localCapable[plate] && (singleLocal.value || !pickGenC() || !pickGenC().key)) {
      const lq = localCapable[plate]()
      if (lq) prefetchQ.value = { item: { ...item, stem: lq.stem, options: lq.options, answer: lq.answer, explain: lq.explain || '', variant: '本地题库', local: true }, plate, difficulty: diff, variant: variant === '' ? '不限' : variant }
      return
    }
    const c = pickGenC()
    if (!c || !c.key) return
    try {
      const sys = buildQuizSys({ plate, difficulty: diff, variant })
      const ask = (variant ? '请为【' + plate + '】出一道' + variant + '仿真模拟题（本题型：' + variant + '）。' : '请为【' + plate + '】出一道仿真模拟题。') + dirHint(plate, dir, dirText)
      const reply = await chatOnce(c, [{ role: 'system', content: sys }, { role: 'user', content: ask }], 6000, 120000, genCtrl && genCtrl.signal)
      const qz = parseQuiz(reply)
      if (qz && qz.options && qz.options.length >= 4) prefetchQ.value = { item: { ...item, stem: qz.stem, options: qz.options, answer: qz.answer, explain: qz.explain || '', designer: qz.designer || '' }, plate, difficulty: diff, variant }
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
    const plan = []
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
            const variant = k === gn - 1 ? '综合分析' : (['基期/现期', '增长率', '增长量', '比重', '平均数', '倍数', '隔年增长', '年均增长', '混合增长率', '拉动增长/贡献率'][k % 6])
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
      const slots = []
      for (let i = 0; i < n; i++) {
        const v = vars.length ? vars[i % vars.length] : ''
        slots.push({ v })
      }
      slots.forEach((s) => {
        const d = difficulty.value === 'curve' ? diffCurve(gi, total) : difficulty.value
        plan.push({ subject: m.subject, difficulty: d, variant: s.v, dir: resolvePaperDir(), dirText: paperDir.value === 'custom' ? paperDirText.value.trim() : '', stem: null, options: [], answer: '', explain: '', picked: null, correct: null, timeout: false, err: false })
        gi++
      })
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
    if (singlePlate.value === '资料分析' && batch > 1) {
      let gid = 0
      for (let g = 0; g < batch; g += 5) {
        const gn = Math.min(5, batch - g)
        const matType = singleMatType.value === 'auto' ? ['text', 'table', 'mixed', 'chart'][gid % 4] : singleMatType.value
        const dir = singleDir.value === 'auto' ? resolveDir('auto') : singleDir.value
        const dirText = singleDir.value === 'custom' ? singleDirText.value.trim() : ''
        for (let k = 0; k < gn; k++) {
          const variant = k === gn - 1 ? '综合分析' : (['基期/现期', '增长率', '增长量', '比重', '平均数', '倍数', '隔年增长', '年均增长', '混合增长率', '拉动增长/贡献率'][k % 6])
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
    for (let i = 0; i < batch; i++) {
      const v = fixedVar || (vars.length ? vars[i % vars.length] : '')
      const dir = singleDir.value === 'auto' ? resolveDir('auto') : singleDir.value
      const dirText = singleDir.value === 'custom' ? singleDirText.value.trim() : ''
      items.push({ subject: singlePlate.value, difficulty: diff, variant: v, dir, dirText, stem: null, options: [], answer: '', explain: '', picked: null, correct: null, timeout: false, err: false })
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
    const plan = []
    // 资料分析 5 题（真题一篇材料配 5 题，第 5 题综合分析）
    for (let k = 0; k < 5; k++) {
      const variant = k === 4 ? '综合分析' : (['基期/现期', '增长率', '增长量', '比重', '平均数'][k])
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
    papers.value.unshift(p); savePapers()
    genAll(p)
  }
  // 每周错题重做卷（批次8）：近 7 天新错的题一键重做（含未复盘优先）
  function startWeekRedo() {
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
      const valid = questions.value.filter((q) => !q.err && q.stem)
      questions.value = valid
      genTotal.value = valid.length
    }
    // 1.7 出题成功才入历史卷子（失败/取消已在上方 return，不产生成绩痕迹）
    if (!papers.value.some((x) => x.id === paper.id)) { papers.value.unshift(paper); savePapers() }
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
    showToast('✅ 出卷完成，共 ' + questions.value.length + ' 题' + (genErrCount.value ? '（' + genErrCount.value + ' 题失败已跳过）' : ''), 'success')
  }
  function cancelGen() {
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
      subject: col.subject, difficulty: col.difficulty, variant: col.variant,
      stem: col.stem, options: (col.options || []).map((o) => ({ ...o })),
      answer: col.answer, explain: col.explain || '', designer: col.designer || '',
      picked: null, correct: null, timeout: false, err: false, fromCol: true
    }
    const paper = makePaper('二刷 · ' + col.subject, [item])
    papers.value.unshift(paper); savePapers()
    startPaper(paper)
  }
  function updateQuizColResult(q, ok) {
    const key = q && String(q.stem || '').slice(0, 40)
    if (!key) return
    const col = quizCol.value.find((x) => String(x.stem || '').slice(0, 40) === key)
    if (!col) return
    col.lastAt = Date.now(); col.lastOk = ok
    if (ok) { col.correctStreak++; } else { col.wrongCount++; col.correctStreak = 0 }
    col.history = col.history || []
    col.history.push({ t: Date.now(), ok })
    if (col.history.length > 20) col.history = col.history.slice(-20)
    saveQuizCol()
  }
  function nextSingle() {
    // 单题快练：优先用预生成的下一题（秒开），否则实时生成
    singleMode.value = true
    const curPlate = singlePlate.value
    const curDiff = difficulty.value === 'curve' ? 'mid' : difficulty.value
    const curVar = singleVariant.value === '不限' ? '' : singleVariant.value
    const pf = prefetchQ.value
    if (pf && pf.item && pf.item.stem && pf.plate === curPlate && pf.difficulty === curDiff && pf.variant === curVar) {
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
    const items = buildSingleItems()
    const paper = makePaper('单题快练 · ' + curPlate + (items.length > 1 ? '（' + items.length + ' 题组）' : ''), items)
    papers.value[0] = paper; savePapers()
    genAll(paper)
  }

  return {
    resolveDir, dirHint, liveVisible, verifyQuestion, drawZlMaterialSVG,
    genOne, ensureGen, prefetchSingle, retryGen, genAll, cancelGen,
    expandModules, resolvePaperDir, startAi, buildSingleItems, startSingle,
    startMorning, startWeekRedo, startRedo, nextSingle,
    addToQuizCol, saveQuizCol, updateQuizColResult
  }
}
