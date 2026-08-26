// 图形理解增强：用「独立的开源视觉模型」把题目截图复刻成 SVG 图，
// 辅助理解 图形推理 / 数量关系几何 / 资料分析图表 类题目。
// 完全独立于上方文字/视觉模型：不配置不影响任何现有功能。
import { store } from '../store'

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

const FIG_PROMPT = `你是公考行测「图形理解复刻专家」。请仔细看这张截图（可能是图形推理 / 数量关系几何 / 资料分析图表 / 其他带图的题），把题目里的核心图形/表格用 SVG 精准复刻出来，帮助考生看懂题意。

只输出一个 JSON，不要输出 JSON 以外的任何内容：
{"type":"图形推理|几何|表格|图表|其他","summary":"一句话概括题目图形","tips":"快速解题的关键观察点","svg":"<svg ...>...</svg>"}

SVG 要求：
1. viewBox="0 0 300 300"，先画 <rect width="300" height="300" fill="#ffffff"/> 垫白底，再用深色线条画图形
2. 用 <rect>/<circle>/<ellipse>/<line>/<path>/<polygon>/<text> 精确画出题中图形（格子、形状、箭头、坐标轴、标注、数字等），线条描边色 #222，必要时可加少量填充色便于区分
3. 文字用 <text fill="#111111" font-size="14">，中文直接写在标签里（如需换行用多个 <text>）
4. 如果截图里有多个图（如 A/B/C/D 选项或题干多图），请全部画出并分别用 <text> 标注 A/B/C/D
5. 如果是表格/图表，用 <rect> 画单元格边框 + <text> 写字
6. 禁止使用 <image>、<script>、<foreignObject>、style 属性、on* 事件属性`

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

// 主入口：识别并复刻截图 → { ok, type, summary, tips, svg }
export async function analyzeFigImage(dataUrl, questionText = '') {
  const c = figCfg()
  if (!c) return null
  const content = [
    { type: 'text', text: FIG_PROMPT + (questionText ? '\n\n用户问题：' + String(questionText).slice(0, 400) : '') },
    { type: 'image_url', image_url: { url: dataUrl } }
  ]
  const h = { 'Content-Type': 'application/json' }
  if (c.key) h['Authorization'] = 'Bearer ' + c.key
  const body = { model: c.model, messages: [{ role: 'user', content }], max_tokens: 3200, stream: false, temperature: 0.2 }
  const resp = await fetch(c.url, { method: 'POST', headers: h, body: JSON.stringify(body) })
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}))
    throw new Error(e.error?.message || 'HTTP ' + resp.status)
  }
  const d = await resp.json()
  const text = (d.choices?.[0]?.message?.content || '').trim()
  if (!text) return { ok: false, err: '模型无返回' }
  const data = extractJson(text)
  const svg = data && data.svg ? sanitizeSvg(String(data.svg)) : ''
  return {
    ok: !!svg,
    type: (data && data.type) || '图形',
    summary: (data && data.summary) || '',
    tips: (data && data.tips) || '',
    svg
  }
}
