import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, ImageRun } from 'docx'
import { store } from '../store'
import { aiPolish } from '../api'
import { collectChat } from './chat'
import { renderMd } from './renderMd'

export function stripMd(t){ return String(t||'').replace(/\*\*/g,'').replace(/\*([^*]+)\*/g,'$1').replace(/`([^`]*)`/g,'$1').replace(/^#{1,6}\s*/gm,'').replace(/^>\s*/gm,'').replace(/^[-*+]\s+/gm,'· ').replace(/^\s*[-|\s]+\s*$/gm,'').replace(/\|/g,' ｜ ').replace(/^\s*##+/gm,'') }
export function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
function getImgDim(src){ return new Promise(res=>{ const im=new Image(); im.onload=()=>res({w:im.naturalWidth,h:im.naturalHeight}); im.onerror=()=>res({w:300,h:200}); im.src=src }) }
async function imgRun(src){ const d=await getImgDim(src); const maxW=600; const scale=Math.min(1,maxW/d.w); return new ImageRun({ data:src.split(',')[1], transformation:{ width:Math.round(d.w*scale), height:Math.round(d.h*scale) } }) }
function downloadBlob(blob,n){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=n; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),5000) }
function downloadText(text,n,mime){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type:mime||'text/plain;charset=utf-8'})); a.download=n; a.click() }

function pdfHtml(title, items){
 const CSS='body{font-family:"Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif;margin:36px;color:#222;line-height:1.7}h1{text-align:center;font-size:22px;border-bottom:2px solid #333;padding-bottom:10px}.meta{text-align:center;color:#888;font-size:12px;margin-bottom:20px}.msg{margin:10px 0;padding:10px 14px;border-radius:8px;page-break-inside:avoid}.u{background:#eef4fb;border-left:4px solid #2f6fb3}.a{background:#f4f9f4;border-left:4px solid #2e7d32}.role{font-weight:bold;margin-bottom:4px}.u .role{color:#2f6fb3}.a .role{color:#2e7d32}pre,code{white-space:pre-wrap;word-break:break-word;font-family:inherit}img{max-width:60%;height:auto;border:1px solid #ddd;border-radius:4px;margin-top:6px}table{border-collapse:collapse;width:100%;font-size:12px;margin:8px 0}th,td{border:1px solid #999;padding:6px 8px;text-align:left}th{background:#f0f0f0}@media print{body{margin:14mm}}'
 let h='<html><head><meta charset="utf-8"><title>'+escHtml(title)+'</title><style>'+CSS+'</style></head><body>'
 h+='<h1>'+escHtml(title)+'</h1><div class="meta">导出时间：'+escHtml(new Date().toLocaleString())+'</div>'
 for(const it of items){
  if(it.type==='msg'){ h+='<div class="msg '+(it.role==='user'?'u':'a')+'"><div class="role">'+(it.role==='user'?'🙋 我':'🤖 AI')+'</div><div class="md">'+renderMd(it.text)+'</div>'; for(const s of it.imgs||[])h+='<div class="im"><img src="'+s+'"></div>'; h+='</div>' }
  else if(it.type==='table'){ h+='<table>'; if(it.head)h+='<tr>'+it.head.map(c=>'<th>'+escHtml(c)+'</th>').join('')+'</tr>'; for(const r of it.rows)h+='<tr>'+r.map(c=>'<td>'+escHtml(c)+'</td>').join('')+'</tr>'; h+='</table>' }
  else if(it.type==='h') h+='<h2>'+escHtml(it.text)+'</h2>'
 }
 h+='</body></html>'; return h
}
function printPdf(title, items){ const w=window.open('','_blank'); if(!w){ alert('浏览器拦截了弹窗，请允许'); return } w.document.write(pdfHtml(title,items)); w.document.close(); setTimeout(()=>{ w.focus(); w.print() },600) }
function mdToParagraphs(md){ const ps=[]; for(const line of String(md||'').split('\n')){ const t=line.trim(); if(!t)continue; if(/^#{1,3}\s/.test(t))ps.push({heading:t.replace(/^#{1,3}\s*/,'')}); else ps.push({text:stripMd(t)}) } return ps }

export function getPayload(type){
 if(type==='wrong'){ if(!store.wqs.length)return null; const head=['#','板块','题目','答案','错因','时间']; const rows=store.wqs.map((q,i)=>[String(i+1),q.subject||'',(q.question||'').slice(0,120),q.answer||'',(q.reasons||[]).join('、'),q.time||'']); return { title:'行测 · 错题集', items:[{type:'table',head,rows}], plain:store.wqs.map((q,i)=>(i+1)+'. 【'+(q.subject||'')+'】'+(q.question||'')+' 答案:'+(q.answer||'')+' 错因:'+((q.reasons||[]).join('、'))).join('\n') } }
 const c=collectChat(); if(!c.length)return null
 if(type==='review'){ const last=c[c.length-1],prev=c[c.length-2]||last; return { title:'行测 · 单题复盘', items:[{type:'h',text:'题目（用户提问）'},{type:'msg',role:'user',text:prev.role==='user'?prev.text:last.text,imgs:prev.role==='user'?prev.imgs:[]},{type:'h',text:'AI 复盘解析'},{type:'msg',role:'ai',text:last.role==='ai'?last.text:'',imgs:last.role==='ai'?last.imgs:[]}], plain:'【题目】'+((prev.role==='user'?prev.text:last.text))+((prev.imgs&&prev.imgs.length)?'\n[含图片]':'')+'\n\n【AI解析】'+(last.role==='ai'?last.text:'') } }
 const cItems=[],cParts=[]; c.forEach(it=>{ cItems.push({type:'msg',role:it.role,text:it.text,imgs:it.imgs}); cParts.push(((it.role==='user'?'【我】':'【AI】')+it.text)) })
 return { title:'行测 AI 问答 · 对话记录', items:cItems, plain:cParts.join('\n\n') }
}
export async function doExport(type, format, polish){
 const pay=getPayload(type); if(!pay){ alert('暂无可导出的内容'); return }
 if(polish){ const md=await aiPolish(pay.plain); if(!md){ alert('AI 整理失败'); return } const t2=pay.title+'（AI整理版）'; if(format==='pdf'){ printPdf(t2,[{type:'msg',role:'ai',text:md}]) } else { exportMdDocx(t2, md) } return }
 if(format==='pdf'){ printPdf(pay.title, pay.items) } else { exportItemsDocx(pay.title, pay.items) }
}
async function exportItemsDocx(title, items){
 const paragraphs=[], tables=[]
 for(const it of items){ if(it.type==='h')paragraphs.push({heading:it.text}); else if(it.type==='msg')paragraphs.push({heading:it.role==='user'?'🙋 我':'🤖 AI', text:it.text, imgs:it.imgs}); else if(it.type==='table')tables.push([it.head].concat(it.rows)) }
 try{ const blob=await buildDocx({title,paragraphs,tables}); downloadBlob(blob,title+'.docx') }catch(e){ downloadText(pdfHtml(title,items), title+'.doc', 'application/msword') }
}
async function exportMdDocx(title, md){ const paragraphs=mdToParagraphs(md); try{ const blob=await buildDocx({title,paragraphs}); downloadBlob(blob,title+'.docx') }catch(e){ downloadText(pdfHtml(title,[{type:'msg',role:'ai',text:md}]), title+'.doc','application/msword') } }
async function buildDocx({title,paragraphs,tables}){
 const kids=[]
 kids.push(new Paragraph({heading:HeadingLevel.TITLE,alignment:AlignmentType.CENTER,children:[new TextRun({text:title,bold:true,size:36})]}))
 kids.push(new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text:'导出时间：'+new Date().toLocaleString(),size:18,color:'888888'})]}))
 kids.push(new Paragraph({children:[new TextRun('')]}))
 if(paragraphs)for(const p of paragraphs){ if(p.heading)kids.push(new Paragraph({heading:HeadingLevel.HEADING_2,children:[new TextRun({text:p.heading,bold:true,size:28})]})); if(p.text)kids.push(new Paragraph({children:[new TextRun({text:p.text,size:22})]})); if(p.imgs)for(const src of p.imgs){ try{ kids.push(new Paragraph({children:[await imgRun(src)]})) }catch(e){} } }
 if(tables)for(const tb of tables){ const rows=tb.map(r=>new TableRow({children:r.map(c=>new TableCell({children:[new Paragraph({children:[new TextRun({text:String(c),size:20})]})]}))})); kids.push(new Table({rows,width:{size:100,type:WidthType.PERCENTAGE}})); kids.push(new Paragraph({children:[new TextRun('')]})) }
 return await Packer.toBlob(new Document({sections:[{children:kids}]}))
}
export function exportWrongTxt(){ if(!store.wqs.length){ alert('暂无错题'); return } const txt='行测错题集\n'+store.wqs.map((q,i)=>(i+1)+'.【'+(q.subject||'')+'】\n题目：'+(q.question||'')+'\n答案：'+(q.answer||'')+'\n错因：'+((q.reasons||[]).join('、'))+'\n时间：'+(q.time||'')+'\n').join('\n'); downloadText(txt,'行测错题集.txt') }

// ===== Markdown 导出（新增）=====
function mdCell(v){ return String(v==null?'':v).replace(/\|/g,'\\|').replace(/\n/g,' ') }
function itemsToMd(title, items){
 const L=[]; L.push('# '+title); L.push(''); L.push('> 导出时间：'+new Date().toLocaleString()); L.push('')
 for(const it of items){
  if(it.type==='h'){ L.push(''); L.push('## '+it.text); L.push('') }
  else if(it.type==='table'){
    const head=it.head||[]; const rows=it.rows||[]
    if(!head.length){ continue }
    L.push('| '+head.map(mdCell).join(' | ')+' |'); L.push('| '+head.map(()=>'---').join(' | ')+' |')
    for(const r of rows){ L.push('| '+r.map(mdCell).join(' | ')+' |') }
    L.push('')
  }
  else if(it.type==='msg'){
    L.push('**'+(it.role==='user'?'🙋 我':'🤖 AI')+'**'); L.push('')
    String(it.text||'').split('\n').forEach(ln=>L.push(ln)); L.push('')
    for(const s of it.imgs||[]) L.push('![图片]('+s+')')
  }
 }
 return L.join('\n')
}
// 按 payload 导出 markdown（错题/对话/复盘通用）
export function exportDataMd(type){
 const pay=getPayload(type); if(!pay){ alert('暂无可导出的内容'); return }
 const md=itemsToMd(pay.title, pay.items)
 downloadText(md, pay.title+'.md', 'text/markdown;charset=utf-8')
}
// 直接导出错题集 markdown（含复盘字段，比通用表更友好）
export function exportWrongMd(){
 if(!store.wqs.length){ alert('暂无错题'); return }
 const L=[]; L.push('# 行测·错题集'); L.push(); L.push('> 导出时间：'+new Date().toLocaleString()); L.push()
 store.wqs.forEach((q,i)=>{
  L.push((i+1)+'. **【'+(q.subject||'未分类')+'】** '+(q.reviewed?'✅已复盘':'⏳待复盘')); L.push('')
  L.push('   题目：'+(q.question||'')); L.push('')
  if(q.answer)L.push('   - ✅ 正确答案：'+q.answer)
  if(q.reasons&&q.reasons.length)L.push('   - 🔍 错因：'+q.reasons.join('、'))
  if(q.method)L.push('   - ⚡ 秒杀规律：'+q.method)
  if(q.note)L.push('   - 📝 笔记：'+String(q.note).replace(/\n/g,'\n     '))
  L.push('   - 🕒 '+q.time)
  L.push('')
 })
 downloadText(L.join('\n'), '行测错题集.md', 'text/markdown;charset=utf-8')
}
export function exportDataAuto(type, format){
 if(format==='md'){ exportDataMd(type); return }
 doExport(type, format, false)
}