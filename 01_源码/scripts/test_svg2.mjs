import { renderMd } from '../src/utils/renderMd.js'
const md = '```svg\n<svg width="520" height="140"><rect x="1" y="2" width="3" height="4"/></svg>\n```'
const h = renderMd(md)
console.log('output len:', h.length)
console.log('含 language-svg:', h.includes('language-svg'))
console.log('含 gen-svg:', h.includes('gen-svg'))
console.log('tail:', JSON.stringify(h.slice(0, 200)))
