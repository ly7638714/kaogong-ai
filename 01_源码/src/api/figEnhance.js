// 图形理解增强：用「独立的开源视觉模型」把题目截图复刻成 SVG 图，
// 辅助理解 图形推理 / 数量关系几何 / 资料分析图表 类题目。
// 完全独立于上方文字/视觉模型：不配置不影响任何现有功能。
import { store } from '../store'
import { recordCost, beginCost } from '../utils/costTrack'

export const FIG_PROVIDERS = {
  // —— 完全免费（本地离线，无需任何 Key）——
  ollama: { n: 'Ollama 本地（完全免费离线）', url: 'http://localhost:11434/v1/chat/completions', model: 'minicpm-v' },
  lmstudio: { n: 'LM Studio 本地（完全免费·图形界面）', url: 'http://localhost:1234/v1/chat/completions', model: 'qwen2.5-vl-7b-instruct' },
  jan: { n: 'Jan 本地（完全免费·图形界面）', url: 'http://localhost:1337/v1/chat/completions', model: 'qwen2.5-vl-7b' },
  // —— 免费额度（注册后送免费额度，无需付费）——
  sf: { n: '硅基流动 SiliconFlow（开源模型·免费额度）', url: 'https://api.siliconflow.cn/v1/chat/completions', model: 'Qwen/Qwen2.5-VL-7B-Instruct' },
  zhipu: { n: '智谱 GLM-4V（免费额度）', url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4v-flash' },
  qwen: { n: '通义 DashScope Qwen-VL（免费额度）', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-vl-plus' },
  custom: { n: '自定义 OpenAI 兼容接口', url: '', model: '' }
}

// 返回已启用的图形增强配置；未启用/未填关键项返回 null
// 本地免费服务（Ollama / LM Studio / Jan）无需 Key
const LOCAL_PROVS = ['ollama', 'lmstudio', 'jan']
export function figCfg() {
  const c = store.cfg.fig || {}
  if (!c.on) return null
  if (!c.url || !c.model) return null
  if (!c.key && !LOCAL_PROVS.includes(c.prov)) return null
  return c
}

export function fillFigProvPreset(prov) {
  const pre = FIG_PROVIDERS[prov] || FIG_PROVIDERS.custom
  return { url: pre.url, model: pre.model }
}

// 连通性测试（文本即可，不传图）
export async function testFigConn(c) {
  if (!c || !c.url || !c.model) return { ok: null }
  try {
    const h = { 'Content-Type': 'application/json' }
    if (c.key) h['Authorization'] = 'Bearer ' + c.key
    const r = await fetch(c.url, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ model: c.model, messages: [{ role: 'user', content: '你好' }], max_tokens: 8, stream: false })
    })
    if (r.ok) return { ok: true }
    const e = await r.json().catch(() => ({}))
    return { ok: false, msg: e.error?.message || 'HTTP ' + r.status }
  } catch (e) {
    return { ok: false, msg: e.message }
  }
}

const FIG_PROMPT = `你是公考行测「图形理解复刻专家」。请仔细看这张截图（可能是图形推理 / 数量关系几何 / 资料分析图表 / 其他带图的题），把题目里的核心图形/表格用 SVG 精准复刻出来，并【在图上标注规律线索】帮助考生一眼看懂，像老师在图上画辅助线做笔记。

只输出一个 JSON，不要输出 JSON 以外的任何内容：
{"type":"图形推理|几何|表格|图表|其他","summary":"一句话概括题目图形","rule":"一句话点明本题规律（如：黑点每次向右移一格；对称轴数递增；黑白叠加黑+黑=白），无规律则空","tips":"快速解题的关键观察点","svg":"<svg ...>...</svg>"}

SVG 要求：
1. viewBox="0 0 300 300"，先画 <rect width="300" height="300" fill="#ffffff"/> 垫白底，再用深色线条画图形
2. 用 <rect>/<circle>/<ellipse>/<line>/<path>/<polygon>/<text> 精确画出题中图形（格子、形状、箭头、坐标轴、标注、数字等），线条描边色 #222，必要时可加少量填充色便于区分
3. 【规律标注（图形推理/几何题必做）】在复刻图上叠加清晰标注，用不同颜色：
   - 移动/变化方向 → 红色/橙色箭头（stroke="#ef4444" 或 #f97316，箭头用 polygon/path）
   - 辅助线 → 虚线（stroke="#f59e0b" stroke-dasharray="4 3"）
   - 高亮/圈出变化元素 → 半透明红框（fill="rgba(239,68,68,0.15)" stroke="#ef4444"）
   - 对称轴 → 蓝色虚线（stroke="#3b82f6" stroke-dasharray="5 3"）
   标注要克制清晰、不遮挡原图关键信息；标注元素放在图形之上（后画）
4. 文字用 <text fill="#111111" font-size="14">，中文直接写在标签里（如需换行用多个 <text>）
5. 如果截图里有多个图（如 A/B/C/D 选项或题干多图），请全部画出并分别用 <text> 标注 A/B/C/D
6. 如果是表格/图表，用 <rect> 画单元格边框 + <text> 写字（不强制标注）
7. 禁止使用 <image>、<script>、<foreignObject>、style 属性、on* 事件属性`

// 资料分析专用：复刻材料（文字→结构化、表格→表、图→图）+ 标注每个问题数据在材料中的位置
const FIG_PROMPT_ZL = `你是公考行测「资料分析材料复刻专家」。请仔细看这张截图（资料分析的题目截图：可能是纯文字材料、统计表格、柱状/折线/饼图，或文字+表格+图形混合材料），把【材料本身】用 SVG 精准复刻出来，并在图上【标注每个问题用到的数据位置】帮助考生一眼看懂"数据在哪里"。

只输出一个 JSON，不要输出 JSON 以外的任何内容：
{"type":"文字材料|表格|图表|混合","summary":"一句话概括这份材料（时间范围+核心指标）","tips":"读这份材料/找数据的要点","svg":"<svg ...>...</svg>"}

SVG 要求：
1. viewBox="0 0 620 高度自定"，先画 <rect width="620" height="H" fill="#ffffff"/> 垫白底；画布高度按内容调整，内容别裁切
2. 【文字材料】把每一段整理成清晰的"分段块"：用 <rect> 画段落背景 + <text> 写出关键句（时间/主体/指标/数字），段落之间留白；不要逐字抄长文，保留所有关键数字与关系词（同比增长/其中/占比/比上年/累计等）
3. 【表格材料】用 <rect> 画单元格边框还原表格（表头加深色底、行/列清楚、保留单位与合计行），<text> 写字
4. 【图形材料】用 <rect>/<line>/<path> 还原柱状/折线/饼图，标出坐标轴、图例、数值
5. 【数据位置标注（核心·绝不遮挡原信息）】对截图中出现的每一道问题（题干里可能有 1-N 道题，如"第1题…第2题…"或材料下方的问题），用 ①②③… 圆圈标注——但圆圈必须放在该数据旁的【空白边距处/行首外侧】，再用一根细引线（<line stroke="#ef4444" stroke-width="1"/>）从圆圈指向该数据，【绝不可把圆圈或色块盖在文字/数字上】；需要高亮时只用细边框（<rect stroke="#ef4444" stroke-width="1.5" fill="none"/>）圈出该数据，不用填充色盖住文字。图下方用 <text fill="#111" font-size="13"> 写一行图例："①=第1题：xxx数据（第X段/第X行第X列/图中X点）"；若截图没有具体题目，则用①②③标注材料里最关键的 3-4 处数据并说明其含义。整个 SVG 必须保证原图所有文字/数字完整可读，任何标注都不得遮住、压住、覆盖原有信息
6. 文字用 <text fill="#111111" font-size="13">，中文直接写；行距拉开、排版整洁美观
7. 禁止使用 <image>、<script>、<foreignObject>、style 属性、on* 事件属性`

// 容错提取 JSON（去 markdown 围栏，失败再试数组）
function extractJson(raw) {
  let s = String(raw || '').replace(/```(?:json)?/gi, '').trim()
  const m = s.match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) } catch (e) {} }
  try {
    const arrM = s.match(/\[\s*\{[\s\S]*\}\s*\]/)
    if (arrM) return JSON.parse(arrM[0])
  } catch (e) {}
  return null
}

// SVG 白名单净化：只保留安全标签/属性，防脚本注入
export function sanitizeSvg(svg) {
  let s = String(svg || '')
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '')
  s = s.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
  s = s.replace(/<image\b[^>]*>/gi, '')
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
  s = s.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  s = s.replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/gi, '')
  s = s.replace(/(href|xlink:href)\s*=\s*("[^"]*"|'[^']*')/gi, (m, a, v) => {
    const val = v.slice(1, -1).trim().toLowerCase()
    if (/^(javascript|data:text\/html|vbscript)/.test(val)) return a + '=""'
    return m
  })
  // 只保留允许的标签（含自闭合）
  s = s.replace(/<(?!\/?(?:svg|g|path|rect|circle|ellipse|line|polyline|polygon|text|tspan|defs|linearGradient|radialGradient|stop|marker|clipPath|mask|pattern|filter|fe[a-z]*|title|desc)\b)[^>]*>/gi, '')
  if (!/^\s*<svg[\s\S]*<\/svg>\s*$/i.test(s)) return ''
  return s.trim()
}

// 「读题提取」提示词：用图形增强视觉模型把图片里的题目提取成文字（区分纯文字/含图形），
// 供「未配置主视觉模型」时走文字模型作答（DeepSeek 纯文本也能答）
const READ_PROMPT = `你是公考题目识别助手。请仔细看这张图片，把里面的行测题目完整提取出来。要求：
1. 逐字保留题干、问法、选项 A-D、数字/图表数据（如有）；识别不清的字用□标注，绝不编造。
2. 判断图片类型：如果图片只有文字（题干/选项/材料，没有图形/图片/表格），type 填 "text"；如果含有图形（图形推理、几何图、示意图、柱状/折线图等）或表格，type 填 "graph"。
3. 若有图形/表格，用 1-2 句话描述图形特征（形状、数量、位置、变化线索），供答题参考；若纯文字，fig 填空字符串。
只输出 JSON：{"type":"text|graph","text":"提取出的完整题目文字","fig":"图形特征描述（无则空）"}，不要输出 JSON 以外的内容。`

// 用图形增强视觉模型读取图片里的题目 → { ok, type, text, fig }
export async function readQuestionFromImage(dataUrl, questionText = '') {
  const c = figCfg()
  if (!c) return null
  const content = [
    { type: 'text', text: READ_PROMPT + (questionText ? '\n\n用户补充：' + String(questionText).slice(0, 300) : '') },
    { type: 'image_url', image_url: { url: dataUrl } }
  ]
  const h = { 'Content-Type': 'application/json' }
  if (c.key) h['Authorization'] = 'Bearer ' + c.key
  const body = { model: c.model, messages: [{ role: 'user', content }], max_tokens: 2400, stream: false, temperature: 0.2 }
  const _t0 = Date.now()
  try { beginCost({ feature: 'fig', provider: c.prov, model: c.model, kind: 'img' }) } catch (e) {}
  const resp = await fetch(c.url, { method: 'POST', headers: h, body: JSON.stringify(body) })
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}))
    throw new Error(e.error?.message || 'HTTP ' + resp.status)
  }
  const d = await resp.json()
  const text = (d.choices?.[0]?.message?.content || '').trim()
  if (!text) return { ok: false, err: '模型无返回' }
  try {
    const u = d.usage
    recordCost({ feature: 'fig', provider: c.prov, model: c.model, kind: 'img', inTokens: u && u.prompt_tokens != null ? u.prompt_tokens : null, outTokens: u && u.completion_tokens != null ? u.completion_tokens : null, inText: JSON.stringify(content), outText: text, exact: !!(u && u.prompt_tokens != null), sec: (Date.now() - _t0) / 1000, cost: LOCAL_PROVS.includes(c.prov) ? 0 : undefined })
  } catch (e) {}
  const data = extractJson(text)
  return {
    ok: !!(data && data.text),
    type: (data && data.type) || 'text',
    text: (data && String(data.text)) || '',
    fig: (data && String(data.fig)) || ''
  }
}

// 主入口：识别并复刻截图 → { ok, type, summary, tips, svg }
export async function analyzeFigImage(dataUrl, questionText = '', plate = '') {
  const c = figCfg()
  if (!c) return null
  const prompt = plate === '资料分析' ? FIG_PROMPT_ZL : FIG_PROMPT
  const content = [
    { type: 'text', text: prompt + (questionText ? '\n\n用户问题：' + String(questionText).slice(0, 400) : '') },
    { type: 'image_url', image_url: { url: dataUrl } }
  ]
  const h = { 'Content-Type': 'application/json' }
  if (c.key) h['Authorization'] = 'Bearer ' + c.key
  const body = { model: c.model, messages: [{ role: 'user', content }], max_tokens: 3200, stream: false, temperature: 0.2 }
  const _t0 = Date.now()
  try { beginCost({ feature: 'fig', provider: c.prov, model: c.model, kind: 'img' }) } catch (e) {}
  const resp = await fetch(c.url, { method: 'POST', headers: h, body: JSON.stringify(body) })
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}))
    throw new Error(e.error?.message || 'HTTP ' + resp.status)
  }
  const d = await resp.json()
  const text = (d.choices?.[0]?.message?.content || '').trim()
  if (!text) return { ok: false, err: '模型无返回' }
  try {
    const u = d.usage
    recordCost({ feature: 'fig', provider: c.prov, model: c.model, kind: 'img', inTokens: u && u.prompt_tokens != null ? u.prompt_tokens : null, outTokens: u && u.completion_tokens != null ? u.completion_tokens : null, inText: JSON.stringify(content), outText: text, exact: !!(u && u.prompt_tokens != null), sec: (Date.now() - _t0) / 1000, cost: LOCAL_PROVS.includes(c.prov) ? 0 : undefined })
  } catch (e) {}
  const data = extractJson(text)
  const svg = data && data.svg ? sanitizeSvg(String(data.svg)) : ''
  return {
    ok: !!svg,
    type: (data && data.type) || '图形',
    summary: (data && data.summary) || '',
    rule: (data && String(data.rule)) || '',
    tips: (data && data.tips) || '',
    svg
  }
}
