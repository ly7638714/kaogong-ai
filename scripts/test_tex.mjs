import { renderMd } from '../src/utils/renderMd.js'
const cases = [
  '裸公式：\\frac{3}{4} 与 \\frac{x+1}{x-1}',
  '符号：a \\times b \\div c \\approx d',
  '正常 $x^2$ 与 $$\\frac{1}{2}$$',
  '混合：\\frac{2}{5} 的概率，\\sqrt{9}=3'
]
for (const t of cases) {
  const h = renderMd(t)
  const hasRawFrac = h.includes('\\frac')
  const hasFallback = h.includes('tex-fallback') || h.includes('katex')
  console.log('raw-frac残留:', hasRawFrac, '| 已渲染/兜底:', hasFallback, '| ->', h.slice(0, 90).replace(/\n/g, ' '))
}
