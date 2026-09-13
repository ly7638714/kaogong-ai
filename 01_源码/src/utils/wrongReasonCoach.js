// wrongReasonCoach.js —— 动态错因引导、AI 草稿清洗与旧数据兼容的纯函数层
// 目标：动态选项由 AI 优先生成并缓存；AI 不可用时按精确细分/题型兜底，绝不阻塞复盘。
export const COACH_OTHER = '__other__'

export const COACH_STEPS = [
  { id: 'reflect', title: '当时怎么想', prompt: '先还原当时的判断过程。你当时最接近哪种状态？' },
  { id: 'block', title: '真正卡在哪一步', prompt: '继续往下追一层：真正让判断跑偏的断点是什么？' },
  { id: 'action', title: '下次先做什么', prompt: '把这次的发现固定成一个下次能执行的动作。' }
]

function cleanText(v, max = 500) {
  return String(v || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max)
}

function uniq(list, max = 3) {
  const out = []
  const seen = new Set()
  for (const raw of Array.isArray(list) ? list : []) {
    const v = cleanText(raw, 320)
    if (!v || seen.has(v)) continue
    seen.add(v)
    out.push(v)
    if (out.length >= max) break
  }
  return out
}

function hashText(v) {
  let h = 2166136261
  const s = String(v || '')
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

function optionId(label, index) {
  return 'o_' + hashText(label).slice(0, 8) + '_' + index
}

function normalizeOption(raw, index = 0) {
  const o = raw && typeof raw === 'object' ? raw : { label: raw }
  const label = cleanText(o.label || o.t || o.title || o.text, 120)
  if (!label) return null
  return {
    id: cleanText(o.id, 40) || optionId(label, index),
    label,
    hint: cleanText(o.hint || o.d || o.desc || o.description, 180)
  }
}

function normalizeStep(raw, index = 0) {
  const base = COACH_STEPS[index] || COACH_STEPS[0]
  const s = raw && typeof raw === 'object' ? raw : {}
  return {
    id: cleanText(s.id, 24) || base.id,
    title: cleanText(s.title, 40) || base.title,
    prompt: cleanText(s.prompt || s.question, 220) || base.prompt,
    options: (Array.isArray(s.options) ? s.options : []).map(normalizeOption).filter(Boolean).slice(0, 6)
  }
}

function parseJson(text) {
  const raw = String(text || '').replace(/```json|```/gi, '').trim()
  if (!raw) return null
  try { return JSON.parse(raw) } catch (e) {}
  const objMatch = raw.match(/\{[\s\S]*\}/)
  const arrMatch = raw.match(/\[[\s\S]*\]/)
  try { if (objMatch) return JSON.parse(objMatch[0]) } catch (e) {}
  try { if (arrMatch) return { steps: JSON.parse(arrMatch[0]) } } catch (e) {}
  return null
}

export function resolveCoachChoice(selected, custom = '') {
  const s = cleanText(selected, 240)
  if (!s) return ''
  if (s === COACH_OTHER) return cleanText(custom, 320)
  return s
}

export function buildCoachPayload(input = {}) {
  return {
    first: resolveCoachChoice(input.first, input.firstCustom),
    block: resolveCoachChoice(input.block, input.blockCustom),
    next: resolveCoachChoice(input.next, input.nextCustom),
    reflection: cleanText(input.reflection, 500)
  }
}

export function buildCoachContext(input = {}) {
  return {
    group: cleanText(input.group, 40),
    sub: cleanText(input.sub, 40),
    type: cleanText(input.type, 40),
    question: cleanText(input.question, 2600),
    options: cleanText(input.options, 1800),
    userAnswer: cleanText(input.userAnswer, 200),
    answer: cleanText(input.answer, 200),
    analysis: cleanText(input.analysis, 1400),
    aiReply: cleanText(input.aiReply, 1400),
    reasons: uniq(input.reasons, 8),
    similarReasons: uniq(input.similarReasons, 10),
    hasImage: !!input.hasImage
  }
}

export function fingerprintCoachContext(input = {}) {
  const c = buildCoachContext(input)
  return hashText(JSON.stringify({
    group: c.group,
    sub: c.sub,
    type: c.type,
    question: c.question,
    options: c.options,
    userAnswer: c.userAnswer,
    answer: c.answer,
    analysis: c.analysis,
    hasImage: c.hasImage
  }))
}

function legacyAnswer(value, custom) {
  const v = cleanText(value, 240)
  const c = cleanText(custom, 320)
  if (!v) return { value: '', custom: '' }
  if (v === COACH_OTHER || c) return { value: COACH_OTHER, custom: c || v }
  return { value: v, custom: '' }
}

export function normalizeCoachState(rc = {}, fingerprint = '') {
  const src = rc && typeof rc === 'object' ? rc : {}
  const steps = (Array.isArray(src.steps) ? src.steps : []).map(normalizeStep).filter((s) => s.options.length >= 2).slice(0, 3)
  const answers = src.answers && typeof src.answers === 'object'
    ? {
        reflect: { value: cleanText(src.answers.reflect && src.answers.reflect.value, 240), custom: cleanText(src.answers.reflect && src.answers.reflect.custom, 320) },
        block: { value: cleanText(src.answers.block && src.answers.block.value, 240), custom: cleanText(src.answers.block && src.answers.block.custom, 320) },
        action: { value: cleanText(src.answers.action && src.answers.action.value, 240), custom: cleanText(src.answers.action && src.answers.action.custom, 320) }
      }
    : {
        reflect: legacyAnswer(src.first, src.firstCustom),
        block: legacyAnswer(src.block, src.blockCustom),
        action: legacyAnswer(src.next, src.nextCustom)
      }
  return {
    ...src,
    version: 2,
    fingerprint: cleanText(src.fingerprint || fingerprint, 80),
    mode: src.mode === 'ai' ? 'ai' : 'taxonomy',
    generatedAt: Number(src.generatedAt) || 0,
    steps,
    answers,
    notice: cleanText(src.notice, 300),
    deep: src.deep && typeof src.deep === 'object' ? src.deep : { pattern: '', note: '', analysis: '' },
    adopted: Array.isArray(src.adopted) ? uniq(src.adopted, 8) : [],
    completed: !!src.completed,
    source: cleanText(src.source, 30) || (src.mode === 'ai' ? 'ai' : 'local')
  }
}

export function parseCoachPlan(reply) {
  const obj = parseJson(reply)
  const rawSteps = obj && Array.isArray(obj.steps) ? obj.steps : []
  if (rawSteps.length < 3) return null
  const byId = {}
  rawSteps.forEach((s, i) => {
    const n = normalizeStep(s, i)
    byId[n.id] = n
  })
  const steps = COACH_STEPS.map((base, i) => byId[base.id] || normalizeStep(rawSteps[i], i))
  if (steps.some((s) => s.options.length < 2)) return null
  return { steps, notice: cleanText(obj.notice || obj.tip, 300), source: 'ai' }
}

const AXES = {
  图形推理: ['特征图没有马上对应到规律', '规律找对了，但数量/位置数错', '只在局部图形里找规律，没看整体', '时间紧，最后没有回代验证'],
  定义判断: ['核心要件漏看了一个', '主体、客体或对象发生错位', '把例子相近当成了要件满足', '没有逐项核对限定词'],
  类比推理: ['先找的一级关系不如命题人设定的直接', '一级关系对了，但二级辨析选错', '词性和感情色彩没有核对', '忽略了范围、方向或一一对应'],
  逻辑判断: ['结论和论据没有分开', '选项作用方向看反了', '因果链中间少验证了一步', '两个选项都会，但不会比较力度'],
  片段阅读: ['主旨句定位偏了', '转折、因果等关系词漏看', '把例子或细节当成了主旨', '选项主体、范围或程度被偷换'],
  数量关系: ['题目模型没有识别出来', '公式或等量关系列错', '计算过程中出错', '时间不够，没有先拿容易分'],
  资料分析: ['材料数据定位错行或错列', '现期、基期或增长率用反', '公式选错或口径混用', '估算和精度处理失误'],
  常识判断: ['对应知识点记混了', '两个选项之间凭感觉选', '时间、主体或适用范围没有核对', '绝对化选项没有及时排除'],
  政治理论: ['概念之间的对应关系记混', '新表述或关键词记错', '政策主体、时间或层级错位', '只背了词，没有理解适用场景']
}

function axiesFor(input) {
  const typed = AXES[input.sub] || AXES[input.group] || []
  if (typed.length) return typed
  return ['题意或核心关系理解偏了', '方法选错或步骤断开', '执行和核对不完整', '时间压力下没有按固定顺序判断']
}

function opts(labels, hints = []) {
  return labels.map((label, i) => ({ id: optionId(label, i), label, hint: hints[i] || '' }))
}

export function buildCoachFallback(input = {}) {
  const c = buildCoachContext(input)
  const typed = axiesFor(c)
  const reflect = [
    c.userAnswer && c.answer ? `我选 ${c.userAnswer} 时，只看到了它和题干的一部分相似点` : '我凭第一感觉比较选项，没有先还原完整题意',
    '关键概念或关系词被我理解成了另一个意思',
    '我知道大方向，但具体判断标准没有说清楚',
    '时间压力下着急选，没有完成最后核对'
  ]
  const action = [
    '先用自己的话复述题干结论和判断标准，再看选项',
    '按固定顺序逐项核对主体、时间、范围和作用方向',
    `先补上「${c.type || c.sub || '本题型'}」的关键规则，再做一道同类题`,
    '最后必须回代题干验证，不能只凭选项间的感觉比较'
  ]
  return {
    steps: [
      { ...COACH_STEPS[0], options: opts(reflect) },
      { ...COACH_STEPS[1], options: opts(typed) },
      { ...COACH_STEPS[2], options: opts(action) }
    ],
    notice: 'AI 暂不可用，已按当前细分和题型提供精简候选；可自写，也可稍后重新生成。',
    source: 'taxonomy'
  }
}

export function buildOneClickDraft(obj = {}) {
  const src = obj && typeof obj === 'object' ? obj : {}
  return {
    answer: cleanText(src.answer, 200),
    reasons: uniq(src.reasons || src.causes || src.errorReasons, 3),
    pattern: cleanText(src.pattern || src.method || src.rule, 500),
    note: cleanText(src.note || src.personalNote, 600),
    analysis: cleanText(src.analysis || src.explain, 900),
    evidence: uniq(src.evidence || src.basis, 3),
    guide: {
      pattern: uniq(src.guide && (src.guide.pattern || src.guide.method), 3),
      note: uniq(src.guide && src.guide.note, 3),
      analysis: uniq(src.guide && src.guide.analysis, 3)
    }
  }
}

export function parseCoachAiReply(reply) {
  const obj = parseJson(reply)
  if (Array.isArray(obj)) return buildOneClickDraft({ reasons: obj })
  if (!obj || typeof obj !== 'object') return null
  const result = buildOneClickDraft(obj)
  return result.reasons.length || result.pattern || result.note || result.analysis ? result : null
}

export function buildLocalCoachFallback(input = {}) {
  const p = buildCoachPayload(input)
  const reasons = []
  if (p.first) reasons.push('当时状态：' + p.first)
  if (p.block && p.block !== p.first) reasons.push('核心卡点：' + p.block)
  if (p.next && !reasons.some((r) => r.includes(p.next))) reasons.push('下次动作：' + p.next)
  if (p.reflection && reasons.length < 3) reasons.push('我的补充：' + p.reflection)
  const pattern = p.next ? '下次遇到同类题，先做到：' + p.next : ''
  const note = p.reflection || (p.block ? '我容易在“' + p.block + '”这一环失去稳定判断；下次先写出判断标准，再比较选项。' : '')
  const chain = [p.first, p.block].filter(Boolean).join(' → ')
  const analysis = chain
    ? '这道题的失分链是：' + chain + '。复盘时不只记正确答案，先还原我当时的判断顺序，再把正确标准固定成下一步动作。'
    : '复盘时先还原当时的判断顺序，再写清真正卡点和下次动作。'
  return { reasons: uniq(reasons, 3), pattern, note, analysis, evidence: [], guide: { pattern: [], note: [], analysis: [] } }
}

export default {
  COACH_OTHER,
  COACH_STEPS,
  resolveCoachChoice,
  buildCoachPayload,
  buildCoachContext,
  fingerprintCoachContext,
  normalizeCoachState,
  parseCoachPlan,
  buildCoachFallback,
  buildOneClickDraft,
  parseCoachAiReply,
  buildLocalCoachFallback
}
