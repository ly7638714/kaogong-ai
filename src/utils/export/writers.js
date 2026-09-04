import { renderMd } from '../renderMd'
import { escHtml } from './docx'
import { showToast } from '../toast'

export function downloadBlob(blob, n) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = n
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}


// v3.8.182 PDF 截图式打印：把一组渲染好的 PNG(dataURL) 排成多页打印
export function printImages(title, pages) {
  const w = window.open('', '_blank')
  if (!w) throw new Error('浏览器拦截了新窗口，请允许弹窗后重试')
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>' + String(title || '导出').replace(/[<>&"]/g, '') + '</title>' +
    '<style>@page{size:A4;margin:10mm}body{margin:0;background:#fff;text-align:center}.pg{page-break-after:always}.pg img{max-width:100%;height:auto;display:block;margin:0 auto}</style></head><body>' +
    (pages || []).map((src, i) => '<div class="pg"><img src="' + src + '" alt="p' + (i + 1) + '"/></div>').join('') +
    '</body></html>'
  w.document.open()
  w.document.write(html)
  w.document.close()
  setTimeout(() => { try { w.focus(); w.print() } catch (e) {} }, 600)
}

export function downloadText(text, n, mime) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: mime || 'text/plain;charset=utf-8' }))
  a.download = n
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}


export function pdfHtml(title, items) {
  const CSS =
    '@page{size:A4;margin:16mm 14mm 18mm;@bottom-center{content:"第 " counter(page) " 页 / 共 " counter(pages) " 页";font-size:9px;color:#7a8a9a;}@top-right{content:"行测名师AI小助理";font-size:9px;color:#9aa7b4;}}' +
    'html{-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font-family:"Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif;margin:0;color:#222;line-height:1.8;font-size:13px}' +
    'h1{text-align:center;font-size:23px;color:#16324f;border-bottom:3px solid #2f6fb3;padding-bottom:12px;margin:4px 0 4px}' +
    '.meta{text-align:center;color:#667;font-size:12px;margin-bottom:20px}' +
    '.msg{margin:14px 0;padding:12px 16px;border-radius:10px;page-break-inside:avoid;box-shadow:0 1px 3px rgba(0,0,0,.06);border:1px solid #e3eaf1}' +
    '.u{background:#f2f7fd;border-left:4px solid #2f6fb3}.a{background:#fbfdf8;border-left:4px solid #4c8c4a}' +
    '.role{font-weight:bold;margin-bottom:6px;font-size:14px;color:#16324f}' +
    '.md p{margin:6px 0}.md h2,.md h3{margin:10px 0 6px;color:#16324f}' +
    'pre,code{white-space:pre-wrap;word-break:break-word;font-family:Consolas,"Microsoft YaHei",monospace;font-size:12px;background:#f4f6f8;border-radius:4px;padding:1px 4px}pre{padding:8px;border:1px solid #e3eaf1}' +
    'blockquote{margin:8px 0;padding:6px 12px;border-left:4px solid #f0b429;background:#fffaf0;color:#5b4a26;border-radius:0 6px 6px 0}' +
    'img{max-width:82%;height:auto;border:1px solid #d5dde5;border-radius:6px;margin-top:6px}' +
    'table{border-collapse:collapse;width:100%;font-size:12px;margin:8px 0;page-break-inside:avoid}th,td{border:1px solid #b9c6d2;padding:6px 8px;text-align:left}th{background:#eef3f8;color:#16324f}' +
    'h2{color:#16324f;border-left:4px solid #2f6fb3;padding-left:8px;margin:20px 0 8px;page-break-after:avoid}' +
    '@media print{body{margin:0}}'
  let h =
    '<html><head><meta charset="utf-8"><title>' + escHtml(title) + '</title><style>' + CSS + '</style></head><body>'
  h += '<h1>' + escHtml(title) + '</h1><div class="meta">导出时间：' + escHtml(new Date().toLocaleString()) + '</div>'
  for (const it of items) {
    if (it.type === 'msg') {
      h +=
        '<div class="msg ' +
        (it.role === 'user' ? 'u' : 'a') +
        '"><div class="role">' +
        (it.role === 'user' ? '🙋 我' : '🤖 AI') +
        '</div><div class="md">' +
        renderMd(it.text) +
        '</div>'
      for (const s of it.imgs || []) h += '<div class="im"><img src="' + s + '"></div>'
      h += '</div>'
    } else if (it.type === 'table') {
      h += '<table>'
      if (it.head) h += '<tr>' + it.head.map((c) => '<th>' + escHtml(c) + '</th>').join('') + '</tr>'
      for (const r of it.rows) h += '<tr>' + r.map((c) => '<td>' + escHtml(c) + '</td>').join('') + '</tr>'
      h += '</table>'
    } else if (it.type === 'h') h += '<h2>' + escHtml(it.text) + '</h2>'
  }
  h += '</body></html>'
  return h
}

export function printPdf(title, items) {
  const w = window.open('', '_blank')
  if (!w) {
    showToast('浏览器拦截了弹窗，请允许', 'error')
    return
  }
  w.document.write(pdfHtml(title, items))
  w.document.close()
  setTimeout(() => {
    w.focus()
    w.print()
  }, 600)
}
