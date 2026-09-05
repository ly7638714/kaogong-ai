// 数学公式渲染工具：先把公式用占位符保护，避免被 marked 破坏，再回填 KaTeX
import katex from 'katex'
import { marked } from 'marked'
import { normalizeSvg } from './svgFix'
import DOMPurify from 'dompurify'
import { sanitizeSvg } from '../api/figEnhance'
// DOMPurify：浏览器下自动取实例；Node/测试无 window 时降级（不影响 SVG 归一化与渲染本身）
let purify = null
try {
  purify = typeof DOMPurify.sanitize === 'function' ? DOMPurify : (typeof DOMPurify === 'function' ? DOMPurify(globalThis.window || undefined) : null)
} catch (e) { purify = null }

function katexHtml(src, display) {
  try {
    return katex.renderToString(src, { throwOnError: false, displayMode: !!display, strict: false })
  } catch (e) {
    // 兜底：katex 失败时转成可读 Unicode，绝不把 \frac{...} 源码暴露给用户
    return '<span class="tex-fallback">' + cleanTex(src) + '</span>'
  }
}
// LaTeX 命令 → 可读文本（逐层解析 \frac{a}{b}、上标下标、常用符号）
function cleanTex(src) {
  let s = String(src || '')
  const frac = (m, a, b) => '(' + cleanTex(a) + '/' + cleanTex(b) + ')'
  s = s.replace(/\dfrac{([^{}]*)}{([^{}]*)}/g, frac)
  s = s.replace(/\frac{([^{}]*)}{([^{}]*)}/g, frac)
  s = s.replace(/\sqrt{([^{}]*)}/g, '√($1)')
  s = s.replace(/^{?([^{}s]+)}?/g, (m, a) => a === '2' ? '²' : a === '3' ? '³' : ('^' + a))
  s = s.replace(/_{?([^{}s]+)}?/g, (m, a) => '_' + a)
  const sym = { '\\times': '×', '\\div': '÷', '\\approx': '≈', '\\leq': '≤', '\\geq': '≥', '\\neq': '≠', '\\pm': '±', '\\cdot': '·', '\\le': '≤', '\\ge': '≥', '\\ne': '≠', '\\rightarrow': '→', '\\Rightarrow': '⇒', '\\infty': '∞', '\\%': '%', '\\ ': ' ' }
  for (const k in sym) s = s.split(k).join(sym[k])
  return s.replace(/[{}]/g, '')
}
const KXMARK = '@@KX@'

// 渲染 markdown + LaTeX 数学公式为 HTML
export function renderMd(t) {
  const chunks = []
  let s = String(t || '')
  const put = (html) => {
    const id = KXMARK + chunks.length + '@@'
    chunks.push(html)
    return id
  }
  // 块级公式 $$...$$ 和 \[...\]
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (m, c) => put(katexHtml(c, true)))
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (m, c) => put(katexHtml(c, true)))
  // 行内公式 \(...\)
  s = s.replace(/\\\(([^)]+?)\\\)/g, (m, c) => put(katexHtml(c, false)))
  // 行内公式 $...$
  s = s.replace(/(?<!\$)\$([^$\n]+?)\$(?!\$)/g, (m, c) => put(katexHtml(c, false)))
  // v3.8.213：把 Markdown 管道表格（GFM）转成真实 HTML 表格（marked 默认未启用 GFM 表格时兜底）
  s = s.replace(/(^|\n)(\|[^\n]+\|(?:\n\|[^\n]+\|)+)/g, (m, lead, block) => {
    const rows = block.split('\n').filter((l) => l.trim())
    if (rows.length < 2) return m
    const parseRow = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
    const headCells = parseRow(rows[0])
    // 第二行若全是 --- 分隔行则跳过
    let bodyStart = 1
    const isSep = (l) => /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(String(l).trim())
    if (rows.length > 1 && isSep(rows[1])) bodyStart = 2
    const thead = '<thead><tr>' + headCells.map((c) => '<th>' + (c || '&nbsp;') + '</th>').join('') + '</tr></thead>'
    const tbody = '<tbody>' + rows.slice(bodyStart).map((l) => '<tr>' + parseRow(l).map((c) => '<td>' + (c || '&nbsp;') + '</td>').join('') + '</tr>').join('') + '</tbody>'
    return (lead || '') + '<table>' + thead + tbody + '</table>'
  })
  let html = ''
  try {
    html = marked.parse(s)
  } catch (e) {
    html = String(s).replace(/\n/g, '<br>')
  }
  html = html.replace(new RegExp('@@KX@(\\d+)@@', 'g'), (m, id) => chunks[Number(id)])
  // 表格外包一层可横向滚动容器（防止宽表格撑破手机屏幕）
  html = html.replace(/<table>([\s\S]*?)<\/table>/g, '<div class="table-scroll"><table>$1</table></div>')
  // ECharts 统计图块：[ECHARTS]{option json}[/ECHARTS] → .gen-chart 容器（前端挂载 ECharts 渲染）
  html = html.replace(/\[ECHARTS\]\s*(\{[\s\S]*?\})\s*\[\/ECHARTS\]/g, (m, json) => {
    const clean = json.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    try { JSON.parse(clean) } catch (e) { return '' }
    return '<div class="gen-chart" data-echarts="' + json + '"></div>'
  })
  // SVG 图形块：```svg ... ``` → 渲染为内联 <svg>（图形推理/几何/统计图展示）
  html = html.replace(/<pre><code class="language-svg">([\s\S]*?)<\/code><\/pre>/g, (m, inner) => {
    let svg = inner.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    svg = sanitizeSvg(svg) // 对齐 figEnhance 白名单净化（剥 script/foreignObject/image/style/on* /危险URL）
    if (!svg) return ''
    svg = svg.replace(/<svg[\s\S]*?<\/svg>/gi, (blk) => normalizeSvg(blk)) // 零裁切：补 viewBox / 按内容自适应画布边界
    return '<div class="gen-svg">' + svg + '</div>'
  })
  // 给代码块包裹"复制"容器：<pre><code>...</code></pre> → div.code-wrap + button.code-copy
  html = html.replace(
    /<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/g,
    (m, inner) =>
      '<div class="code-wrap"><button class="code-copy" type="button" aria-label="复制代码">⧉ 复制</button><pre><code>' +
      inner +
      '</code></pre></div>'
  )
  // 裸 TeX 兜底：把没被 $ 包裹的 \frac / 常用命令转成可读内容（保证零失误）
  html = html.replace(/\\frac{([^{}]+)}{([^{}]+)}/g, (m, a, b) => katexHtml('\\frac{' + a + '}{' + b + '}', false))
  html = html.replace(/\\dfrac{([^{}]+)}{([^{}]+)}/g, (m, a, b) => katexHtml('\\dfrac{' + a + '}{' + b + '}', false))
  html = html.replace(/\\sqrt{([^{}]+)}/g, (m, a) => katexHtml('\\sqrt{' + a + '}', false))
  // 裸符号兜底：\times → × 等（未进公式、直接写在正文里的命令）
  const TEX_SYM = { '\\times': '×', '\\div': '÷', '\\approx': '≈', '\\leq': '≤', '\\geq': '≥', '\\neq': '≠', '\\pm': '±', '\\cdot': '·', '\\rightarrow': '→', '\\Rightarrow': '⇒', '\\infty': '∞', '\\le': '≤', '\\ge': '≥', '\\ne': '≠', '\\%': '%', '\\ ' : ' ' }
  html = html.replace(/\\times|\\div|\\approx|\\leq|\\geq|\\neq|\\pm|\\cdot|\\rightarrow|\\Rightarrow|\\infty|\\le|\\ge|\\ne|\\%/g, (m) => TEX_SYM[m] || m)
  // 安全加固（批次3.1）：整体 DOMPurify 白名单净化——剥 script/iframe/object/embed/link/meta/style 与 on* / javascript: 注入
  if (purify && typeof purify.sanitize === 'function') html = purify.sanitize(html, {
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    ADD_ATTR: ['viewBox', 'target'],
    ADD_TAGS: ['annotation', 'semantics', 'math', 'mrow', 'mi', 'mo', 'mn', 'mfrac', 'msqrt', 'msup', 'msub', 'mtext', 'mspace', 'munder', 'mover', 'munderover', 'merror', 'mpadded', 'mphantom', 'mfenced'],
    ALLOW_DATA_ATTR: true
    })
  // 关键内容自动着色：回复中的「正确答案 / 秒杀 / 陷阱 / 复盘」等强调句染强调色（其余正文保持黑/白），突出每次回复的关键信息
  html = html.replace(/<strong>([^<]*?(?:【正确答案】|正确答案|秒杀|陷阱|复盘|易错点|要点|结论)[^<]*?)<\/strong>/g, '<span class="k-ans"><strong>$1</strong></span>')
  return html
}
