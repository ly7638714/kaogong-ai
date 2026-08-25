import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ImageRun
} from 'docx'
import { store } from '../store'
import { aiPolish } from '../api'
import { collectChat } from './chat'
import { renderMd } from './renderMd'
import { showToast } from './toast'
import katex from 'katex'

export function stripMd(t) {
  return String(t || '')
    .replace(/\*\*/g, '')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^>\s*/gm, '')
    .replace(/^[-*+]\s+/gm, '· ')
    .replace(/^\s*[-|\s]+\s*$/gm, '')
    .replace(/\|/g, ' ｜ ')
    .replace(/^\s*##+/gm, '')
}
export function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function getImgDim(src) {
  return new Promise((res) => {
    const im = new Image()
    im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight })
    im.onerror = () => res({ w: 300, h: 200 })
    im.src = src
  })
}
async function imgRun(src) {
  const d = await getImgDim(src)
  const maxW = 600
  const scale = Math.min(1, maxW / d.w)
  return new ImageRun({
    data: src.split(',')[1],
    transformation: { width: Math.round(d.w * scale), height: Math.round(d.h * scale) }
  })
}
// 把 LaTeX 公式渲染成 PNG dataURL（用 KaTeX→SVG→canvas→PNG，供 Word 嵌图，不用源码）
let _svgImage = null
function texToPng(tex, display) {
  return new Promise((resolve) => {
    try {
      if (!_svgImage) _svgImage = new Image()
      const svg = katex.renderToString(tex, {
        throwOnError: false,
        displayMode: !!display,
        output: 'svg',
        strict: false
      })
      const svgUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
      _svgImage.onload = () => {
        const w = _svgImage.naturalWidth || 300
        const h = _svgImage.naturalHeight || 40
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        const g = c.getContext('2d')
        g.fillStyle = '#ffffff'
        g.fillRect(0, 0, w, h)
        g.drawImage(_svgImage, 0, 0, w, h)
        try {
          resolve('data:image/png;base64,' + c.toDataURL('image/png').split(',')[1])
        } catch (e) {
          resolve(null)
        }
      }
      _svgImage.onerror = () => resolve(null)
      _svgImage.src = svgUrl
    } catch (e) {
      resolve(null)
    }
  })
}
function downloadBlob(blob, n) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = n
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}
function downloadText(text, n, mime) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: mime || 'text/plain;charset=utf-8' }))
  a.download = n
  a.click()
}

function pdfHtml(title, items) {
  const CSS =
    'body{font-family:"Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif;margin:0;color:#222;line-height:1.75;font-size:13px}h1{text-align:center;font-size:24px;color:#16324f;border-bottom:3px solid #2f6fb3;padding-bottom:12px;margin-top:6px}.meta{text-align:center;color:#667;font-size:12px;margin-bottom:22px}.msg{margin:12px 0;padding:12px 16px;border-radius:10px;page-break-inside:avoid;box-shadow:0 1px 3px rgba(0,0,0,.06)}.u{background:#f2f7fd;border-left:4px solid #2f6fb3}.a{background:#f5faf5;border-left:4px solid #2e7d32}.role{font-weight:bold;margin-bottom:6px;font-size:14px}.u .role{color:#2f6fb3}.a .role{color:#2e7d32}pre,code{white-space:pre-wrap;word-break:break-word;font-family:inherit}img{max-width:70%;height:auto;border:1px solid #ddd;border-radius:6px;margin-top:6px}table{border-collapse:collapse;width:100%;font-size:12px;margin:8px 0}th,td{border:1px solid #b9c6d2;padding:6px 8px;text-align:left}th{background:#eef3f8;color:#16324f}h2{color:#16324f;border-left:4px solid #2f6fb3;padding-left:8px;margin:18px 0 8px}@page{size:A4;margin:14mm 13mm}@media print{body{margin:0}}'
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
function printPdf(title, items) {
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
function mdToParagraphs(md) {
  const ps = []
  const lines = String(md || '').split('\n')
  // 块级公式 $$...$$ 先抽出来
  const formulas = []
  let s = lines.join('\n')
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (m, c) => formulas.length + '\u0000' + (formulas.push({ tex: c, display: true }) - 1) + '\u0001')
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (m, c) => formulas.length + '\u0000' + (formulas.push({ tex: c, display: true }) - 1) + '\u0001')
  for (const line of s.split('\n')) {
    const t = line.trim()
    if (!t) continue
    // 行内公式 $...$ 转成公式占位
    const parts = t.split(/(\$[^$\n]+?\$)/g)
    for (const part of parts) {
      if (!part) continue
      const mi = part.match(/^\$([^$]+)\$$/)
      if (mi) {
        formulas.push({ tex: mi[1], display: false })
        ps.push({ formula: formulas.length - 1 })
      } else {
        const p = { text: stripMd(part) }
        if (!ps.length || ps[ps.length - 1].text === undefined) ps.push(p)
        else ps[ps.length - 1].text += p.text
      }
    }
  }
  return { ps, formulas }
}

export function getPayload(type) {
  if (type === 'wrong') {
    if (!store.wqs.length) return null
    // 按板块分组
    const groups = {}
    store.wqs.forEach((q) => {
      const s = q.subject || '未分类'
      if (!groups[s]) groups[s] = []
      groups[s].push(q)
    })
    const items = []
    const plain = []
    const keys = Object.keys(groups)
    let gi = 0
    keys.forEach((s) => {
      gi++
      items.push({ type: 'h', text: '📁 板块 ' + gi + ' · ' + s + '（' + groups[s].length + ' 题）' })
      plain.push('【板块' + gi + ' · ' + s + '】')
      groups[s].forEach((q, qi) => {
        const line = []
        line.push(gi + '.' + (qi + 1) + '. 【' + (q.subject || '未分类') + '】' + (q.reviewed ? ' ✅已复盘' : ' ⏳待复盘'))
        line.push('题目：' + (q.question || ''))
        if (q.answer) line.push('答案：' + q.answer)
        if (q.reasons && q.reasons.length) line.push('错因：' + q.reasons.join('、'))
        if (q.method) line.push('秒杀：' + q.method)
        if (q.note) line.push('笔记：' + q.note)
        line.push('时间：' + (q.time || ''))
        plain.push('  · ' + line.join('  '))
        // 原题图 + 全部复盘字段作为一个内容块
        let b = line.join('\n')
        if ((q.imgs || []).length) b += '\n[见下方原题截图]'
        items.push({ type: 'msg', role: 'user', text: b, imgs: (q.imgs || []) })
      })
      plain.push('')
    })
    return {
      title: '行测 · 错题集（按板块整理）',
      items,
      plain: plain.join('\n')
    }
  }
  if (type === 'kb') {
    if (!store.myMem.length && !store.notes.length) return null
    const items = []
    const plain = []
    const groups = {}
    store.myMem.forEach((m) => {
      const t = m.type || '其他'
      if (!groups[t]) groups[t] = []
      groups[t].push(m.text)
    })
    if (store.notes.length) {
      groups['📝 导入笔记'] = store.notes.map((n) => (n.title || '笔记') + '：' + String(n.body || '').trim())
    }
    Object.keys(groups).forEach((t) => {
      items.push({ type: 'h', text: '📚 ' + t + '（' + groups[t].length + ' 条）' })
      plain.push('【' + t + '】')
      groups[t].forEach((txt) => {
        items.push({ type: 'msg', role: 'user', text: txt })
        plain.push('· ' + txt)
      })
      plain.push('')
    })
    return { title: '行测 · 知识库积累（我的记忆库）', items, plain: plain.join('\n') }
  }

  const c = collectChat()
  if (!c.length) return null
  if (type === 'review') {
    const last = c[c.length - 1],
      prev = c[c.length - 2] || last
    return {
      title: '行测 · 单题复盘',
      items: [
        { type: 'h', text: '题目（用户提问）' },
        {
          type: 'msg',
          role: 'user',
          text: prev.role === 'user' ? prev.text : last.text,
          imgs: prev.role === 'user' ? prev.imgs : []
        },
        { type: 'h', text: 'AI 复盘解析' },
        {
          type: 'msg',
          role: 'ai',
          text: last.role === 'ai' ? last.text : '',
          imgs: last.role === 'ai' ? last.imgs : []
        }
      ],
      plain:
        '【题目】' +
        (prev.role === 'user' ? prev.text : last.text) +
        (prev.imgs && prev.imgs.length ? '\n[含图片]' : '') +
        '\n\n【AI解析】' +
        (last.role === 'ai' ? last.text : '')
    }
  }
  const cItems = [],
    cParts = []
  c.forEach((it) => {
    cItems.push({ type: 'msg', role: it.role, text: it.text, imgs: it.imgs })
    cParts.push((it.role === 'user' ? '【我】' : '【AI】') + it.text)
  })
  return { title: '行测 AI 问答 · 对话记录', items: cItems, plain: cParts.join('\n\n') }
}
export async function doExport(type, format, polish) {
  const pay = getPayload(type)
  if (!pay) {
    showToast('暂无可导出的内容', 'info')
    return
  }
  if (polish) {
    const md = await aiPolish(pay.plain)
    if (!md) {
      showToast('AI 整理失败', 'error')
      return
    }
    const t2 = pay.title + '（AI整理版）'
    // 收集原题截图（若 payload 带图），AI 排版后一并导出，避免丢图
    const allImgs = []
    for (const it of pay.items || []) if (it.imgs && it.imgs.length) allImgs.push(...it.imgs)
    if (format === 'pdf') {
      const items = [{ type: 'msg', role: 'ai', text: md }, ...(allImgs.length ? [{ type: 'msg', role: 'user', text: '（原题截图）', imgs: allImgs }] : [])]
      printPdf(t2, items)
    } else {
      // Markdown 与 docx：AI 正文后附原图
      const fullMd = md + (allImgs.length ? '\n\n## 原题截图\n' + allImgs.map((s) => '![图片](' + s + ')').join('\n\n') : '')
      if (format === 'md') {
        downloadText('# ' + t2 + '\n\n' + fullMd, t2 + '.md', 'text/markdown;charset=utf-8')
        showToast('已导出 AI 整理版 Markdown', 'success')
      } else {
        exportMdDocx(t2, fullMd)
      }
    }
    return
  }
  if (format === 'pdf') {
    printPdf(pay.title, pay.items)
  } else {
    exportItemsDocx(pay.title, pay.items)
  }
}
async function exportItemsDocx(title, items) {
  const paragraphs = [],
    tables = [],
    formulas = []
  for (const it of items) {
    if (it.type === 'h') paragraphs.push({ heading: it.text })
    else if (it.type === 'msg') {
      paragraphs.push({ heading: it.role === 'user' ? '🙋 我' : '🤖 AI' })
      // 文本可能含 $...$ 公式，拆成普通段+公式段（公式渲染成图，不用源码）
      const parsed = mdToParagraphs(it.text)
      for (const seg of parsed.ps) {
        if (seg.formula != null) {
          const f = parsed.formulas[seg.formula]
          const idx = formulas.length
          formulas.push(f || { tex: '', display: false })
          paragraphs.push({ formula: idx })
        } else {
          paragraphs.push(seg)
        }
      }
      if (it.imgs && it.imgs.length) paragraphs.push({ imgs: it.imgs })
    } else if (it.type === 'table') tables.push([it.head].concat(it.rows))
  }
  try {
    const blob = await buildDocx({ title, paragraphs, tables, formulas })
    downloadBlob(blob, title + '.docx')
  } catch (e) {
    downloadText(pdfHtml(title, items), title + '.doc', 'application/msword')
  }
}
async function exportMdDocx(title, md) {
  const { ps: paragraphs, formulas } = mdToParagraphs(md)
  try {
    const blob = await buildDocx({ title, paragraphs, formulas })
    downloadBlob(blob, title + '.docx')
  } catch (e) {
    downloadText(pdfHtml(title, [{ type: 'msg', role: 'ai', text: md }]), title + '.doc', 'application/msword')
  }
}
async function buildDocx({ title, paragraphs, tables, formulas }) {
  const kids = []
  kids.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: title, bold: true, size: 36 })]
    })
  )
  kids.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: '导出时间：' + new Date().toLocaleString(), size: 18, color: '888888' })]
    })
  )
  kids.push(new Paragraph({ children: [new TextRun('')] }))
  if (paragraphs)
    for (const p of paragraphs) {
      if (p.heading)
        kids.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: p.heading, bold: true, size: 28 })]
          })
        )
      if (p.formula != null && formulas && formulas[p.formula]) {
        // 公式渲染成 PNG 图片嵌入（不用 tex 源码）
        const f = formulas[p.formula]
        try {
          const png = await texToPng(f.tex, f.display)
          if (png) {
            kids.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [await imgRun(png)] }))
          } else {
            kids.push(new Paragraph({ children: [new TextRun({ text: stripMd(f.tex), size: 22, italics: true })] }))
          }
        } catch (e) {}
      }
      if (p.text) kids.push(new Paragraph({ children: [new TextRun({ text: p.text, size: 22 })] }))
      if (p.imgs)
        for (const src of p.imgs) {
          try {
            kids.push(new Paragraph({ children: [await imgRun(src)] }))
          } catch (e) {}
        }
    }
  if (tables)
    for (const tb of tables) {
      const rows = tb.map(
        (r) =>
          new TableRow({
            children: r.map(
              (c) =>
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(c), size: 20 })] })] })
            )
          })
      )
      kids.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }))
      kids.push(new Paragraph({ children: [new TextRun('')] }))
    }
  return await Packer.toBlob(new Document({ sections: [{ children: kids }] }))
}
export function exportWrongTxt() {
  if (!store.wqs.length) {
    showToast('暂无错题', 'info')
    return
  }
  const txt =
    '行测错题集\n' +
    store.wqs
      .map(
        (q, i) =>
          i +
          1 +
          '.【' +
          (q.subject || '') +
          '】\n题目：' +
          (q.question || '') +
          '\n答案：' +
          (q.answer || '') +
          '\n错因：' +
          (q.reasons || []).join('、') +
          '\n时间：' +
          (q.time || '') +
          '\n'
      )
      .join('\n')
  downloadText(txt, '行测错题集.txt')
  showToast('已导出 TXT', 'success')
}

// ===== Markdown 导出（新增）=====
function mdCell(v) {
  return String(v == null ? '' : v)
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ')
}
function itemsToMd(title, items) {
  const L = []
  L.push('# ' + title)
  L.push('')
  L.push('> 导出时间：' + new Date().toLocaleString())
  L.push('')
  for (const it of items) {
    if (it.type === 'h') {
      L.push('')
      L.push('## ' + it.text)
      L.push('')
    } else if (it.type === 'table') {
      const head = it.head || []
      const rows = it.rows || []
      if (!head.length) {
        continue
      }
      L.push('| ' + head.map(mdCell).join(' | ') + ' |')
      L.push('| ' + head.map(() => '---').join(' | ') + ' |')
      for (const r of rows) {
        L.push('| ' + r.map(mdCell).join(' | ') + ' |')
      }
      L.push('')
    } else if (it.type === 'msg') {
      L.push('**' + (it.role === 'user' ? '🙋 我' : '🤖 AI') + '**')
      L.push('')
      String(it.text || '')
        .split('\n')
        .forEach((ln) => L.push(ln))
      L.push('')
      for (const s of it.imgs || []) L.push('![图片](' + s + ')')
    }
  }
  return L.join('\n')
}
// 按 payload 导出 markdown（错题/对话/复盘通用）
export function exportDataMd(type) {
  const pay = getPayload(type)
  if (!pay) {
    showToast('暂无可导出的内容', 'info')
    return
  }
  const md = itemsToMd(pay.title, pay.items)
  downloadText(md, pay.title + '.md', 'text/markdown;charset=utf-8')
  showToast('已导出 Markdown', 'success')
}
// 按板块分组导出错题集 markdown（板块→题型；原题图紧跟二次整理，层级清晰）
export function exportWrongMd() {
  if (!store.wqs.length) {
    showToast('暂无错题', 'info')
    return
  }
  // 按板块分组，保持各板块内原顺序
  const groups = {}
  store.wqs.forEach((q) => {
    const s = q.subject || '未分类'
    if (!groups[s]) groups[s] = []
    groups[s].push(q)
  })
  const L = []
  L.push('# 行测 · 错题集（按板块整理）')
  L.push('')
  L.push('> 导出时间：' + new Date().toLocaleString())
  L.push('')
  L.push('## 📚 目录')
  let gIdx = 0
  for (const s of Object.keys(groups)) {
    gIdx++
    L.push('' + gIdx + '. 【' + s + '】' + groups[s].length + ' 题')
  }
  L.push('')
  // 未知板块放最后
  const keys = Object.keys(groups)
  keys.forEach((s, gi) => {
    const list = groups[s]
    L.push('---')
    L.push('')
    L.push('# ' + (gi + 1) + '. 📁 板块：' + s + '（' + list.length + ' 题）')
    L.push('')
    list.forEach((q, qi) => {
      L.push('### ' + (gi + 1) + '.' + (qi + 1) + ' ' + (q.reviewed ? '✅ 已复盘' : '⏳ 待复盘'))
      L.push('')
      L.push('**题目**：' + (q.question || ''))
      // 原题截图：紧跟题目
      if (q.imgs && q.imgs.length) {
        L.push('')
        L.push('**原题截图**：')
        q.imgs.forEach((im) => {
          L.push('')
          L.push('![原题](' + im + ')')
        })
      }
      L.push('')
      L.push('**二次整理**：')
      if (q.answer) L.push('  - ✅ 正确答案：' + q.answer)
      if (q.reasons && q.reasons.length) L.push('  - 🔍 错因：' + q.reasons.join('、'))
      if (q.method) L.push('  - ⚡ 秒杀规律：' + q.method)
      if (q.note) L.push('  - 📝 笔记：' + String(q.note).replace(/\n/g, '\n    '))
      L.push('  - 🕒 ' + q.time)
      L.push('')
    })
  })
  downloadText(L.join('\n'), '行测错题集.md', 'text/markdown;charset=utf-8')
  showToast('已导出错题集 Markdown（按板块分组）', 'success')
}
export function exportDataAuto(type, format) {
  if (format === 'md') {
    exportDataMd(type)
    return
  }
  doExport(type, format, false)
}

// ===== Obsidian 兼容：错题/复盘导出（frontmatter + callout + 标签 + 复选框）=====
export function wqsToObsidianMd(wqs) {
  const list = wqs || []
  const L = []
  const today = new Date().toISOString().slice(0, 10)
  L.push('---')
  L.push('title: 行测错题集 · 复盘')
  L.push('type: 复盘笔记')
  L.push('created: ' + today)
  L.push('source: 行测AI问答助手')
  L.push('tags: [行测, 错题, 复盘]')
  L.push('---')
  L.push('')
  L.push('# 🧠 行测 · 错题与复盘')
  L.push('')
  L.push('> [!info] 概览')
  L.push('> 共 ' + list.length + ' 道错题 · 已复盘 ' + list.filter((q) => q.reviewed || q.digested).length + ' · 已消化 ' + list.filter((q) => q.digested).length)
  L.push('')
  const groups = {}
  list.forEach((q) => {
    const s = q.subject || '未分类'
    if (!groups[s]) groups[s] = []
    groups[s].push(q)
  })
  L.push('## 📚 目录')
  Object.keys(groups).forEach((s, i) => L.push((i + 1) + '. #' + s + '（' + groups[s].length + ' 题）'))
  L.push('')
  Object.keys(groups).forEach((s, gi) => {
    L.push('---')
    L.push('')
    L.push('## ' + (gi + 1) + '. 📁 ' + s)
    L.push('')
    groups[s].forEach((q, qi) => {
      L.push('### ' + (gi + 1) + '.' + (qi + 1) + ' ' + (q.digested ? '✅已消化' : q.reviewed ? '✅已复盘' : '⏳待复盘'))
      L.push('')
      L.push('> [!question] 题目')
      L.push('> ' + String(q.question || '').replace(/\n/g, '\n> '))
      if (q.imgs && q.imgs.length) {
        q.imgs.forEach((im) => L.push('> ![原题](' + im + ')'))
        L.push('')
      }
      L.push('- [x] 正确答案：' + (q.answer || '未填'))
      if (q.reasons && q.reasons.length) L.push('- [x] 错因：' + q.reasons.join('、'))
      if (q.method) L.push('- [x] ⚡ 秒杀：' + q.method)
      if (q.wrongCount && q.wrongCount > 1) L.push('- [ ] 已错 ' + q.wrongCount + ' 次 · 掌握 ' + (q.mastery || 0) + '%')
      if (q.note) {
        L.push('')
        L.push('> [!note] 复盘笔记')
        L.push('> ' + String(q.note).replace(/\n/g, '\n> '))
      }
      L.push('')
      L.push('`#错题 #' + s + '`')
      L.push('')
    })
  })
  return L.join('\n')
}

export function exportObsidianMd() {
  if (!store.wqs.length) {
    showToast('暂无错题', 'info')
    return
  }
  downloadText(wqsToObsidianMd(store.wqs), '行测错题复盘-Obsidian.md', 'text/markdown;charset=utf-8')
  showToast('已导出 Obsidian 兼容 Markdown（可放入 Obsidian 库）', 'success')
}

export function copyObsidianWrong(q) {
  if (!q) return
  const md = wqsToObsidianMd([q])
  const done = () => showToast('已复制为 Obsidian 格式', 'success')
  const fail = () => showToast('复制失败', 'error')
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(md).then(done).catch(fail)
  } else {
    const ta = document.createElement('textarea')
    ta.value = md
    document.body.appendChild(ta)
    ta.select()
    try {
      document.execCommand('copy')
      done()
    } catch (e) {
      fail()
    }
    ta.remove()
  }
}

// ===== 导入 Obsidian/Markdown 笔记（解析 frontmatter + 一级标题分节）=====
export function parseMarkdownNotes(text, filename) {
  const notes = []
  const lines = String(text || '').split('\n')
  let tags = []
  let bodyStart = 0
  if (lines[0] && lines[0].trim() === '---') {
    let i = 1
    while (i < lines.length && lines[i].trim() !== '---') {
      const m = lines[i].match(/^tags\s*:\s*\[?\s*([^\]]*?)\s*\]?\s*$/)
      if (m) {
        tags = m[1]
          .split(/[,\s]+/)
          .map((x) => x.trim().replace(/^['"]|['"]$/g, ''))
          .filter(Boolean)
      }
      i++
    }
    bodyStart = i + 1
  }
  let cur = null
  const push = (n) => {
    if (n && (n.body.trim() || n.tags.length)) notes.push(n)
  }
  for (let li = bodyStart; li < lines.length; li++) {
    const line = lines[li]
    const h = line.match(/^#\s+(.+)/)
    if (h) {
      push(cur)
      cur = { title: h[1].trim(), body: '', tags: tags.slice(), time: new Date().toLocaleString() }
    } else if (cur) {
      cur.body += line + '\n'
    } else if (line.trim() && !cur) {
      cur = { title: (filename || '导入笔记').replace(/\.md$/i, ''), body: '', tags: tags.slice(), time: new Date().toLocaleString() }
      cur.body += line + '\n'
    }
  }
  push(cur)
  return notes
}

// ===== 错题 → Anki/闪卡 CSV（制表符分隔，可直接导入 Anki）=====
export function exportAnkiCsv() {
  if (!store.wqs.length) {
    showToast('暂无错题', 'info')
    return
  }
  const L = ['#separator:tab', '#html:false', '正面\t背面\t板块\t错因']
  store.wqs.forEach((q) => {
    const front = String(q.question || '').replace(/\t/g, ' ').replace(/\n+/g, '<br>')
    const back = ['答案：' + (q.answer || '未填'), q.method ? '秒杀：' + q.method : '']
      .filter(Boolean)
      .join('<br>')
    L.push(front + '\t' + back + '\t' + (q.subject || '未分类') + '\t' + (q.reasons || []).join('、'))
  })
  downloadText(L.join('\n'), '行测错题-Anki.csv', 'text/csv;charset=utf-8')
  showToast('已导出 Anki CSV（Anki→导入→选择此文件）', 'success')
}
