// 数学公式渲染工具：先把公式用占位符保护，避免被 marked 破坏，再回填 KaTeX
import katex from 'katex'
import { marked } from 'marked'

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
  const sym = { '\times': '×', '\div': '÷', '\approx': '≈', '\leq': '≤', '\geq': '≥', '\neq': '≠', '\pm': '±', '\cdot': '·', '\le': '≤', '\ge': '≥', '\ne': '≠', '\rightarrow': '→', '\Rightarrow': '⇒', '\infty': '∞', '\times': '×', '\%': '%', '\ ' : ' ' }
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
    svg = svg.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+\s*=\s*"[^"]*"/gi, '').replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    if (!/<svg[\s\S]*?<\/svg>/i.test(svg)) return ''
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
  return html
}
