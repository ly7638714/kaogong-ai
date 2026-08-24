// 数学公式渲染工具：先把公式用占位符保护，避免被 marked 破坏，再回填 KaTeX
import katex from 'katex'
import { marked } from 'marked'

function katexHtml(src, display){
  try{ return katex.renderToString(src, { throwOnError:false, displayMode:!!display, strict:false }) }
  catch(e){ return '<code>'+src+'</code>' }
}
const KXMARK='@@KX@'

// 渲染 markdown + LaTeX 数学公式为 HTML
export function renderMd(t){
  const chunks=[]
  let s=String(t||'')
  const put=(html)=>{ const id=KXMARK+(chunks.length)+'@@'; chunks.push(html); return id }
  // 块级公式 $$...$$ 和 \[...\]
  s=s.replace(/\$\$([\s\S]+?)\$\$/g, (m,c)=>put(katexHtml(c,true)))
  s=s.replace(/\\\[([\s\S]+?)\\\]/g, (m,c)=>put(katexHtml(c,true)))
  // 行内公式 \(...\)
  s=s.replace(/\\\(([^)]+?)\\\)/g, (m,c)=>put(katexHtml(c,false)))
  // 行内公式 $...$
  s=s.replace(/(?<!\$)\$([^$\n]+?)\$(?!\$)/g, (m,c)=>put(katexHtml(c,false)))
  let html=''
  try{ html=marked.parse(s) }catch(e){ html=String(s).replace(/\n/g,'<br>') }
  return html.replace(new RegExp('@@KX@(\\d+)@@','g'), (m,id)=>chunks[Number(id)])
}
