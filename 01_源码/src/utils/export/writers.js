import { renderMd } from '../renderMd'
import { escHtml } from './docx'
import { showToast } from '../toast'
import { isNativeHost } from '../platform' // 自建原生宿主(方案乙)：文件导出走 xcnative 公共 Download
import { exportDone } from '../exportFeedback'
/* global atob */

// Blob → base64（原生宿主保存二进制文件用）
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => { const r = fr.result; resolve(String(r).slice(String(r).indexOf(',') + 1)) }
    fr.onerror = () => reject(new Error('读取文件失败'))
    fr.readAsDataURL(blob)
  })
}
function hostSaveResult(r, name) {
  if (r.ok) {
    try { exportDone({ kind: 'file', title: '📄 文件已导出', name: r.name || name, where: r.where || 'Download/行测AI导出', uri: r.uri, mime: 'application/octet-stream' }) } catch (e) {}
  } else { try { showToast('导出失败：' + (r.error || '未知'), 'error') } catch (e) {} }
}

export async function downloadBlob(blob, n) {
  if (isNativeHost() && window.xcnative) {
    try {
      const b64 = await blobToBase64(blob)
      const r = JSON.parse(window.xcnative.saveBinary(n, b64, blob.type || 'application/octet-stream') || '{}')
      hostSaveResult(r, n)
      return
    } catch (e) { try { showToast('导出失败：' + e.message, 'error') } catch (_) {} }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = n
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}



// ===== 手机端“真 PDF 文件”导出（v3.8.217）：把 PNG 页面合成 JPEG 图片版 PDF，纯 JS 无字体嵌入，WPS/浏览器可开 =====
function b64ToBytes(b64) {
  const bin = atob(String(b64 || ''))
  const u8 = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
  return u8
}
function pngToJpeg(pngDataUrl) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const cv = document.createElement('canvas')
        cv.width = img.naturalWidth || img.width || 800; cv.height = img.naturalHeight || img.height || 1100
        const g = cv.getContext('2d')
        g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height)
        g.drawImage(img, 0, 0, cv.width, cv.height)
        resolve({ dataUrl: cv.toDataURL('image/jpeg', 0.92), w: cv.width, h: cv.height })
      } catch (e) { resolve(null) }
    }
    img.onerror = () => resolve(null)
    img.src = pngDataUrl
  })
}

/** 把一组 PNG(dataURL) 页面拼成一个 .pdf Blob（A4 纵向，图片居中自适应）。 */
export async function pagesToPdfBlob(pngDataUrls) {
  const pages = []
  for (const p of pngDataUrls || []) { const j = await pngToJpeg(p); if (j) pages.push(j) }
  if (!pages.length) throw new Error('没有可导出的页面')
  const W = 595.28, H = 841.89, M = 24
  const enc = new TextEncoder()
  const seg = []
  const xref = []
  let cursor = 0
  const ascii = (s) => { const b = enc.encode(s); seg.push(b); cursor += b.length }
  const raw = (b) => { seg.push(b); cursor += b.length }
  const mark = () => { xref.push(cursor) }
  const n = pages.length
  ascii('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')
  // 1 Catalog, 2 Pages, 之后每页 3 个对象：page/content/image
  mark(); ascii('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
  mark();
  let kids = ''
  for (let k = 0; k < n; k++) kids += (3 + 3 * k) + ' 0 R '
  ascii('2 0 obj\n<< /Type /Pages /Kids [' + kids + '] /Count ' + n + ' >>\nendobj\n')
  for (let k = 0; k < n; k++) {
    const pageObj = 3 + 3 * k, contentObj = 4 + 3 * k, imgObj = 5 + 3 * k
    const p = pages[k]
    const scale = Math.min((W - 2 * M) / p.w, (H - 2 * M) / p.h)
    const dw = p.w * scale, dh = p.h * scale
    const x = (W - dw) / 2, y = (H - dh) / 2
    const content = 'q ' + dw.toFixed(2) + ' 0 0 ' + dh.toFixed(2) + ' ' + x.toFixed(2) + ' ' + y.toFixed(2) + ' cm /Im' + k + ' Do Q'
    mark(); ascii(pageObj + ' 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /Resources << /XObject << /Im' + k + ' ' + imgObj + ' 0 R >> >> /Contents ' + contentObj + ' 0 R >>\nendobj\n')
    const cBytes = enc.encode(content)
    mark(); ascii(contentObj + ' 0 obj\n<< /Length ' + cBytes.length + ' >>\nstream\n'); raw(cBytes); ascii('\nendstream\nendobj\n')
    const b64 = String(p.dataUrl).split(',')[1] || ''
    const jbytes = b64ToBytes(b64)
    mark(); ascii(imgObj + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + p.w + ' /Height ' + p.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jbytes.length + ' >>\nstream\n'); raw(jbytes); ascii('\nendstream\nendobj\n')
  }
  mark();
  const xrefStart = cursor
  ascii('xref\n0 ' + (2 + 3 * n) + '\n0000000000 65535 f \n')
  for (const off of xref) ascii(String(off).padStart(10, '0') + ' 00000 n \n')
  ascii('trailer\n<< /Size ' + (2 + 3 * n) + ' /Root 1 0 R >>\nstartxref\n' + xrefStart + '\n%%EOF')
  const total = seg.reduce((a, b) => a + b.length, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const b of seg) { out.set(b, at); at += b.length }
  return new Blob([out], { type: 'application/pdf' })
}

/** 原生宿主：把页面截图导出为真 .pdf 文件，保存后【自动拉起系统其它 APP 打开/分享】；桌面返回 false 由调用方走打印。 */
export async function exportPdfFile(title, pngDataUrls) {
  if (!isNativeHost() || !window.xcnative) return false
  try { showToast('🧾 正在合成 PDF…（' + (pngDataUrls || []).length + ' 页）', 'info') } catch (e) {}
  const blob = await pagesToPdfBlob(pngDataUrls)
  const b64 = await blobToBase64(blob)
  const safeName = (String(title || '导出').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)) + '.pdf'
  const r = JSON.parse(window.xcnative.saveBinary(safeName, b64, 'application/pdf') || '{}')
  if (!r.ok) { try { showToast('PDF 保存失败：' + (r.error || '未知'), 'error') } catch (e) {}; return false }
  try { showToast('✅ PDF 已生成，正在调起其它 APP…', 'success') } catch (e) {}
  try { exportDone({ kind: 'file', title: '📄 PDF 已导出', name: r.name || safeName, where: r.where || 'Download/行测AI导出', uri: r.uri, mime: 'application/pdf' }) } catch (e) {}
  setTimeout(() => { try { if (r.uri) window.xcnative.shareUri(r.uri, 'application/pdf', r.name || safeName) } catch (e) {} }, 300)
  return true
}

// v3.8.182 PDF 截图式打印：把一组渲染好的 PNG(dataURL) 排成多页打印
export function printImages(title, pages) {
  if (isNativeHost()) { try { showToast('手机端不支持系统打印：请在「导出面板」选 PDF 生成文件，或使用「📷 整卷截图分享」', 'info') } catch (e) {}; return }
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

export async function downloadText(text, n, mime) {
  if (isNativeHost() && window.xcnative) {
    try {
      const r = JSON.parse(window.xcnative.saveText(n, String(text)) || '{}')
      hostSaveResult(r, n)
      return
    } catch (e) { try { showToast('导出失败：' + e.message, 'error') } catch (_) {} }
  }
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
  if (isNativeHost()) { try { showToast('手机端不支持系统打印：请在「导出面板」选 PDF 生成文件，或使用「📷 整卷截图分享」', 'info') } catch (e) {}; return }
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
