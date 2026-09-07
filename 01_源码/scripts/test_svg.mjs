import { renderMd } from '../src/utils/renderMd.js'
const md = '题目说明\n\n```svg\n<svg width="520" height="140">\n  <g transform="translate(10,10)"><rect x="10" y="40" width="40" height="40" fill="#22d3ee"/></g>\n  <g transform="translate(120,10)"><circle cx="30" cy="60" r="30" fill="#fbbf24"/></g>\n</svg>\n```\n\nA. 图形1 B. 图形2'
const h = renderMd(md)
console.log('含 .gen-svg:', h.includes('class="gen-svg"'))
console.log('含内联 svg:', h.includes('<svg width'))
console.log('含 script 残留:', h.includes('<script'))
