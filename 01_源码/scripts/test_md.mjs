import { marked } from 'marked'
const md = '```svg\n<svg width="520" height="140"><rect x="1" y="2" width="3" height="4"/></svg>\n```'
console.log(marked.parse(md))
