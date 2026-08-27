/* global btoa */
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
import { aiPolish, chatOnce, activeCfg } from '../api'
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
  // 仅支持 dataURL；http(s) 图片等非 data 前缀抛错，交由调用方 try/catch 跳过该图，避免产出无效 ImageRun
  const parts = String(src || '').split(',')
  if (!/^data:/.test(String(src)) || !parts[1]) throw new Error('imgRun: 非 dataURL 图片')
  return new ImageRun({
    data: parts[1],
    transformation: { width: Math.round(d.w * scale), height: Math.round(d.h * scale) }
  })
}
// 把 LaTeX 公式渲染成 PNG dataURL（用 KaTeX→SVG→canvas→PNG，供 Word 嵌图，不用源码）
function texToPng(tex, display) {
  return new Promise((resolve) => {
    try {
      const im = new Image() // 每次新建，避免并发导出互相覆盖 onload/src
      const svg = katex.renderToString(tex, {
        throwOnError: false,
        displayMode: !!display,
        output: 'svg',
        strict: false
      })
      const svgUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
      im.onload = () => {
        const w = im.naturalWidth || 300
        const h = im.naturalHeight || 40
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        const g = c.getContext('2d')
        g.fillStyle = '#ffffff'
        g.fillRect(0, 0, w, h)
        g.drawImage(im, 0, 0, w, h)
        try {
          resolve('data:image/png;base64,' + c.toDataURL('image/png').split(',')[1])
        } catch (e) {
          resolve(null)
        }
      }
      im.onerror = () => resolve(null)
      im.src = svgUrl
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
export function downloadText(text, n, mime) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: mime || 'text/plain;charset=utf-8' }))
  a.download = n
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
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
  // 块级公式 $...$ 先抽出来
  const formulas = []
  let s = lines.join('\n')
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (m, c) => formulas.length + '\u0000' + (formulas.push({ tex: c, display: true }) - 1) + '\u0001')
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (m, c) => formulas.length + '\u0000' + (formulas.push({ tex: c, display: true }) - 1) + '\u0001')
  const ls = s.split('\n')
  for (let i = 0; i < ls.length; i++) {
    const t = ls[i].trim()
    if (!t) continue
    // Markdown 表格：| 表头 | + |---| 分隔行 + 数据行 → docx 原生表格
    if (/^\|.*\|\s*$/.test(t) && /^\|[\s:|-]+\|\s*$/.test((ls[i + 1] || '').trim())) {
      const parseRow = (ln) => ln.trim().replace(/^\||\|\s*$/g, '').split('|').map((c) => stripMd(c.trim()))
      const rows = [parseRow(t)]
      i++ // 跳过分隔行
      while (i < ls.length && /^\|.*\|\s*$/.test(ls[i].trim())) {
        rows.push(parseRow(ls[i].trim()))
        i++
      }
      ps.push({ table: rows })
      continue
    }
    // 行内公式 $...$ 转成公式占位
    const parts = t.split(/(\$[^$\n]+?\$)/g)
    for (const part of parts) {
      if (!part) continue
      const mi = part.match(/^\$([^$]+)\$/)
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
      if (p.table && p.table.length) {
        const rows = p.table.map(
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


// ===== 图推/几何 SVG → PNG 嵌入导出（md/pdf/doc 都能看到图）=====
function splitSvg(text) {
  const parts = []
  const re = /(```svg[\s\S]*?```)/g
  let last = 0, m
  const s = String(text || '')
  while ((m = re.exec(s))) {
    if (m.index > last) parts.push({ type: 'text', v: s.slice(last, m.index) })
    parts.push({ type: 'svg', v: m[1] })
    last = m.index + m[0].length
  }
  if (last < s.length) parts.push({ type: 'text', v: s.slice(last) })
  return parts.length ? parts : [{ type: 'text', v: s }]
}
async function svgToPngDataUrl(svgMarkup) {
  const body = String(svgMarkup || '').replace(/^```svg\s*/i, '').replace(/```\s*$/, '').trim()
  if (!/<svg[\s\S]*<\/svg>/i.test(body)) return ''
  // 原始 SVG data-URI 兜底（canvas 不可用时也能看图）
  let rawSvgUri = ''
  try {
    const bytes = new TextEncoder().encode(body)
    let bin = ''
    bytes.forEach((b) => { bin += String.fromCharCode(b) })
    rawSvgUri = 'data:image/svg+xml;base64,' + btoa(bin)
  } catch (e) {}
  try {
    const wm = body.match(/width="?(\d+(?:\.\d+)?)"?/), hm = body.match(/height="?(\d+(?:\.\d+)?)"?/)
    const w = wm ? Math.max(1, Math.round(parseFloat(wm[1]))) : 300
    const h = hm ? Math.max(1, Math.round(parseFloat(hm[1]))) : 200
    const img = new Image()
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('svg')) ; img.src = rawSvgUri })
    const cv = document.createElement('canvas')
    cv.width = w; cv.height = h
    const ctx = cv.getContext('2d')
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    return cv.toDataURL('image/png') || rawSvgUri
  } catch (e) { return rawSvgUri }
}
async function textWithImg(text) {
  // 题干/选项文本：普通文字折叠空白，```svg 块转 PNG 并返回 imgs
  const imgs = []
  let out = ''
  for (const p of splitSvg(text)) {
    if (p.type === 'text') { out += ' ' + p.v.replace(/^#{1,6}\s*/gm, '').replace(/\s+/g, ' ').trim() }
    else {
      const png = await svgToPngDataUrl(p.v)
      if (png) { out += ' ![图形](' + png + ') '; imgs.push(png) }
      else out += ' [图形] '
    }
  }
  return { out: out.trim(), imgs }
}
// 每题导出内容（SVG→PNG 图片版，用于 md/pdf/doc）
async function qLinesImg(qq, i, ms) {
  const m = ms[i] || {}
  const L = []
  const imgs = []
  const st = await textWithImg(qq.stem)
  L.push('【' + (i + 1) + '题 · ' + (qq.subject || '未分类') + '】')
  L.push('题干：' + st.out)
  imgs.push(...st.imgs)
  const opts = []
  for (const o of (qq.options || [])) {
    const r = await textWithImg(o.t)
    opts.push(o.k + '. ' + r.out)
    imgs.push(...r.imgs)
  }
  if (opts.length) L.push('选项：' + opts.join('　'))
  const un = m.blank || (m.timeout && !m.pick)
  L.push('我的答案：' + (m.pick ? m.pick : m.timeout ? '超时未答' : '未作答') + (un ? '' : '　正确答案：' + (qq.answer || '—') + '　' + (m.ok ? '✅ 正确' : '❌ 错误')))
  const ana = qq.explain || qq.analysis || ''
  if (ana && !un) L.push('解析：' + String(ana).replace(/\s+/g, ' ').trim())
  return { lines: L, imgs }
}

// ===== 模拟组卷 / 试卷导出：整卷排版导出 Word / PDF / Markdown / LaTeX =====
// paper: { name, questions:[{subject,stem,options,answer,explain,analysis}] }
// marks: 每题的 { ok, pick, timeout }
// meta:  { score, rate, sec, moduleStats:[{subject,total,ok}] }
export async function exportPaper(paper, marks, meta, format, polish) {
  const ms = marks || []
  const isBlank = (i) => { const m = ms[i] || {}; return !!(m.blank || (m.timeout && !m.pick)) }
  // 未答题导出为空白卷：去掉答案与解析（保留题干/选项，供二刷），所有格式统一生效
  const qs = ((paper && paper.questions) || []).map((qq, i) => (isBlank(i) ? { ...qq, answer: '', explain: '', analysis: '' } : qq))
  if (!qs.length) { showToast('暂无题目可导出', 'info'); return }
  const hasSvg = qs.some((qq) => /`svg/.test(String(qq.stem || '')) || (qq.options || []).some((o) => /`svg/.test(String(o.t || ''))))
  const title = '模拟组卷 · ' + (paper.name || '试卷') + '（' + new Date().toLocaleDateString() + '）'
  const stat = meta || { score: 0, rate: 0, sec: 0, moduleStats: [] }

  // 每题内容块
  function qLines(qq, i) {
    const m = ms[i] || {}
    const L = []
    const stem = String(qq.stem || '').replace(/^#{1,6}\s*/gm, '').replace(/\s+/g, ' ').trim()
    L.push('【' + (i + 1) + '题 · ' + (qq.subject || '未分类') + '】')
    L.push('题干：' + stem)
    const opts = (qq.options || []).map((o) => o.k + '. ' + o.t).join('　')
    if (opts) L.push('选项：' + opts)
    const un = m.blank || (m.timeout && !m.pick)
    L.push('我的答案：' + (m.pick ? m.pick : m.timeout ? '超时未答' : '未作答') + (un ? '' : '　正确答案：' + (qq.answer || '—') + '　' + (m.ok ? '✅ 正确' : '❌ 错误')))
    const ana = qq.explain || qq.analysis || ''
    if (ana) L.push('解析：' + String(ana).replace(/\s+/g, ' ').trim())
    return L
  }

  // ===== AI 智能排版：先让 AI 梳理考点/错因/秒杀规律，再按所选格式导出 =====
  if (polish) {
    const polished = await aiPolishPaper({ ...paper, questions: qs }, marks, meta)
    if (!polished) return
    const pTitle = title + '（AI排版）'
    if (format === 'md') { downloadText(polished, pTitle + '.md', 'text/markdown;charset=utf-8'); showToast('✅ 已导出 AI 排版 Markdown', 'success'); return }
    if (format === 'tex') { downloadText(mdToTex(polished), pTitle + '.tex', 'application/x-tex;charset=utf-8'); showToast('✅ 已导出 AI 排版 LaTeX', 'success'); return }
    if (format === 'typ') { downloadText(mdToTyp(polished), pTitle + '.typ', 'text/plain;charset=utf-8'); showToast('✅ 已导出 AI 排版 Typst', 'success'); return }
    if (format === 'pdf') { printPdf(pTitle, [{ type: 'msg', role: 'ai', text: polished }]); return }
    await exportMdDocx(pTitle, polished)
    return
  }
  if (format === 'typ') {
    downloadText(typFromPaper({ ...paper, questions: qs }, marks, meta), title + '.typ', 'text/plain;charset=utf-8')
    showToast('✅ 已导出 Typst 源文件（可用 Typst/typst.app 编译为 PDF）', 'success')
    return
  }

  if (format === 'md') {
    let md = '# ' + title + '\n\n> 导出时间：' + new Date().toLocaleString() + '\n\n'
    md += '## 📄 成绩概览\n\n| 总题数 | 答对 | 正确率 | 总用时 |\n|---|---|---|---|\n| ' + qs.length + ' | ' + stat.score + ' | ' + stat.rate + '% | ' + Math.round((stat.sec || 0) / 60) + '分' + (stat.sec || 0) % 60 + '秒 |\n\n'
    if (stat.moduleStats && stat.moduleStats.length) {
      md += '## 📊 板块统计\n\n| 板块 | 题数 | 答对 | 正确率 |\n|---|---|---|---|\n'
      stat.moduleStats.forEach((s) => { md += '| ' + s.subject + ' | ' + s.total + ' | ' + s.ok + ' | ' + (s.total ? Math.round((s.ok / s.total) * 100) : 0) + '% |\n' })
      md += '\n'
    }
    for (const [qi, qq] of qs.entries()) { const ql = await qLinesImg(qq, qi, ms); md += '## ' + ql.lines.join('\n\n') + '\n\n---\n\n' }
    downloadText(md, title + '.md', 'text/markdown;charset=utf-8')
    showToast('✅ 已导出整卷 Markdown', 'success')
    return
  }

  if (format === 'tex') {
    const esc = (s) => String(s || '').replace(/([\\{}_$&%#])/g, '\\$1').replace(/~/g, '\\textasciitilde{}').replace(/\^/g, '\\textasciicircum{}')
    let tx = '\\\\documentclass[12pt,a4paper]{article}\n\\\\usepackage[UTF8]{ctex}\n\\\\usepackage{geometry}\n\\\\geometry{left=2cm,right=2cm,top=2.2cm,bottom=2.2cm}\n\\\\usepackage{enumitem}\n\\\\usepackage{longtable}\n\\\\usepackage{xcolor}\n\\\\usepackage{titlesec}\n\\\\begin{document}\n\n'
    tx += '\\\\begin{center}\n{\\\\LARGE\\\\bfseries ' + esc(title) + '}\\\\\\\\[4pt]\n{\\\\small 导出时间：' + esc(new Date().toLocaleString()) + '}\n\\\\end{center}\n\n'
    tx += '\\\\section*{成绩概览}\n总题数：' + qs.length + '　答对：' + stat.score + '　正确率：' + stat.rate + '\\%　总用时：' + Math.round((stat.sec || 0) / 60) + '分' + (stat.sec || 0) % 60 + '秒\n\n'
    if (stat.moduleStats && stat.moduleStats.length) {
      tx += '\\\\section*{板块统计}\n\\\\begin{longtable}{|l|c|c|c|}\n\\\\hline\n板块 & 题数 & 答对 & 正确率\\\\\\\\ \\\\hline\n'
      stat.moduleStats.forEach((s) => { tx += s.subject + ' & ' + s.total + ' & ' + s.ok + ' & ' + (s.total ? Math.round((s.ok / s.total) * 100) : 0) + '\\%\\\\\\\\ \\\\hline\n' })
      tx += '\\\\end{longtable}\n\n'
    }
    qs.forEach((qq, i) => {
      const L = qLines(qq, i)
      tx += '\\\\section*{' + esc(L[0]) + '}\n\\\\begin{quote}\n'
      for (let k = 1; k < L.length; k++) tx += esc(L[k]) + '\\\\\\\\\n'
      tx += '\\\\end{quote}\n\n'
    })
    tx += '\\\\end{document}\n'
    downloadText(tx, title + '.tex', 'application/x-tex;charset=utf-8')
    showToast('✅ 已导出整卷 LaTeX（可用 TeX Live / Overleaf 编译）', 'success')
    return
  }

  // docx / pdf：复用现有排版管线
  const items = []
  items.push({ type: 'h', text: '📄 成绩概览' })
  items.push({ type: 'table', head: ['总题数', '答对', '正确率', '总用时'], rows: [[String(qs.length), String(stat.score), stat.rate + '%', Math.round((stat.sec || 0) / 60) + '分' + (stat.sec || 0) % 60 + '秒']] })
  if (stat.moduleStats && stat.moduleStats.length) {
    items.push({ type: 'h', text: '📊 板块统计' })
    items.push({ type: 'table', head: ['板块', '题数', '答对', '正确率'], rows: stat.moduleStats.map((s) => [s.subject, String(s.total), String(s.ok), (s.total ? Math.round((s.ok / s.total) * 100) : 0) + '%']) })
  }
  for (const [qi, qq] of qs.entries()) {
    const m = ms[qi] || {}
    const ql = await qLinesImg(qq, qi, ms)
    items.push({ type: 'h', text: '第' + (qi + 1) + '题 · ' + (qq.subject || '未分类') + (m.ok ? ' ✅' : ' ❌') })
    items.push({ type: 'msg', role: 'a', text: ql.lines.join('\n') })
  }
  if (format === 'pdf') printPdf(title, items)
  else if (hasSvg) {
    // docx 无法内嵌图片：含 SVG 图形题的卷子降级导出 .doc（pdfHtml 会把 markdown 图片渲染成 <img>）
    downloadText(pdfHtml(title, items), title + '.doc', 'application/msword')
    showToast('含图形题，已导出兼容 Word 的 .doc（含图片）', 'info')
  } else {
    try {
      const blob = await buildDocx({ title, paragraphs: itemsToParagraphs(items), tables: itemsToTables(items) })
      downloadBlob(blob, title + '.docx')
      showToast('✅ 已导出整卷 Word', 'success')
    } catch (e) {
      downloadText(pdfHtml(title, items), title + '.doc', 'application/msword')
      showToast('Word 生成失败，已降级导出 .doc', 'info')
    }
  }
}
// items → docx 段落/表格（供整卷导出复用）
function itemsToParagraphs(items) {
  const ps = []
  for (const it of items) {
    if (it.type === 'h') ps.push({ heading: it.text })
    else if (it.type === 'msg') {
      ps.push({ heading: it.role === 'user' ? '🙋 我' : '🧩 题目' })
      String(it.text || '').split('\n').forEach((ln) => ps.push({ text: stripMd(ln) }))
    }
  }
  return ps
}
function itemsToTables(items) {
  const ts = []
  for (const it of items) if (it.type === 'table') ts.push([it.head].concat(it.rows))
  return ts
}


// ===== AI 智能排版：整卷 → 高质量复习文档 =====
export async function aiPolishPaper(paper, marks, meta) {
  const c = activeCfg(false)
  if (!c || !c.key) { showToast('AI 排版需要文字模型 API Key，请先在设置配置', 'error'); return null }
  const qs = (paper && paper.questions) || []
  const ms = marks || []
  if (!qs.length) { showToast('暂无题目可排版', 'info'); return null }
  let src = '【成绩】共 ' + qs.length + ' 题 · 答对 ' + (meta && meta.score != null ? meta.score : 0) + ' · 正确率 ' + (meta && meta.rate != null ? meta.rate : 0) + '%\n\n'
  qs.forEach((qq, i) => {
    const m = ms[i] || {}
    src += '第' + (i + 1) + '题 [' + (qq.subject || '未分类') + '] ' + ((m.blank || (m.timeout && !m.pick)) ? '未作答' : (m.ok ? '做对' : '做错')) + '\n'
    src += '题干：' + String(qq.stem || '').replace(/^#{1,6}\s*/gm, '').trim() + '\n'
    src += '选项：' + (qq.options || []).map((o) => o.k + '. ' + o.t).join('　') + '\n'
    const un = m.blank || (m.timeout && !m.pick)
    src += '我的答案：' + (m.pick ? m.pick : m.timeout ? '超时未答' : '未作答') + (un ? '（未作答）' : '　正确答案：' + (qq.answer || '—')) + '\n'
    const ana = qq.explain || qq.analysis || ''
    if (ana && !un) src += '解析：' + String(ana).replace(/\s+/g, ' ').trim() + '\n'
    src += '\n'
  })
  const prompt =
    '你是公考行测学习笔记排版专家。把下面这份"整卷作答记录"重新排版成一份适合复习/打印的高质量文档（Markdown），要求：\n' +
    '1. 开头给【卷面总结】：总题数/答对/正确率 + 一句话整体评价。\n' +
    '2. 每题按固定结构输出：**第N题 · 板块（✅/❌）** → **考点**（一句话）→ **题干** → **选项** → **我的答案 / 正确答案** → **错因**（做错题给 1-2 句具体错因；做对题写"保持"）→ **秒杀规律**（一句话）。\n' +
    '3. 做错的题用 > 引用块突出，方便二刷；语言精炼专业，用标准 Markdown（标题/加粗/列表/引用）。\n' +
    '4. 不遗漏任何一题，不编造题干与解析，解析以原记录为准。\n\n作答记录：\n' + String(src).slice(0, 12000)
  try {
    return await chatOnce(c, [{ role: 'system', content: '你是公考行测学习笔记排版专家，输出规范 Markdown。' }, { role: 'user', content: prompt }], 4000)
  } catch (e) {
    showToast('AI 排版失败：' + e.message, 'error')
    return null
  }
}

// Markdown → LaTeX（AI 排版结果转 TeX 源文件）
function mdToTex(md) {
  const esc = (s) => String(s || '').replace(/([\\{}_$&%#])/g, '\\$1').replace(/~/g, '\\textasciitilde{}').replace(/\^/g, '\\textasciicircum{}')
  let tx = '\\documentclass[12pt,a4paper]{article}\n\\usepackage[UTF8]{ctex}\n\\usepackage{geometry}\n\\geometry{left=2cm,right=2cm,top=2.2cm,bottom=2.2cm}\n\\usepackage{xcolor}\n\\usepackage{longtable}\n\\begin{document}\n\n'
  const ls = String(md || '').split('\n')
  for (let i = 0; i < ls.length; i++) {
    const t = ls[i].trim()
    if (!t) continue
    // Markdown 表格 → longtable
    if (/^\|.*\|\s*$/.test(t) && /^\|[\s:|-]+\|\s*$/.test((ls[i + 1] || '').trim())) {
      const parseRow = (ln) => ln.trim().replace(/^\||\|\s*$/g, '').split('|').map((c) => esc(c.trim()))
      const rows = [parseRow(t)]
      i++
      while (i < ls.length && /^\|.*\|\s*$/.test(ls[i].trim())) { rows.push(parseRow(ls[i].trim())); i++ }
      const cols = Math.max(1, rows[0].length)
      tx += '\\begin{longtable}{|' + 'l|'.repeat(cols) + '}\n\\hline\n'
      rows.forEach((r) => { tx += r.join(' & ') + '\\\\ \\hline\n' })
      tx += '\\end{longtable}\n\n'
      continue
    }
    if (/^##\s+/.test(t)) tx += '\\section*{' + esc(t.replace(/^##\s+/, '')) + '}\n'
    else if (/^###\s+/.test(t)) tx += '\\subsection*{' + esc(t.replace(/^###\s+/, '')) + '}\n'
    else if (/^>\s*/.test(t)) tx += '\\begin{quote}\n' + esc(t.replace(/^>\s*/, '')) + '\n\\end{quote}\n'
    else if (/^\*\*(.+?)\*\*/.test(t)) tx += '\\textbf{' + esc(t.replace(/^\*\*(.+?)\*\*/, '$1')) + '}\n\n'
    else if (/^[-*+]\s+/.test(t)) tx += '\\begin{itemize}\\item ' + esc(t.replace(/^[-*+]\s+/, '')) + '\\end{itemize}\n'
    else tx += esc(t.replace(/\*\*/g, '')) + '\\\\\n'
  }
  tx += '\\end{document}\n'
  return tx
}

// Markdown → Typst（AI 排版结果转 Typst 源文件）
function mdToTyp(md) {
  const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/#/g, '\\#').replace(/_/g, '\\_')
  let t = '#set page("a4", margin: 2cm)\n#set text(font: ("Microsoft YaHei", "Noto Sans CJK SC"), size: 11pt)\n\n'
  const ls = String(md || '').split('\n')
  for (let i = 0; i < ls.length; i++) {
    const s = ls[i].trim()
    if (!s) { t += '\n'; continue }
    // Markdown 表格 → Typst #table
    if (/^\|.*\|\s*$/.test(s) && /^\|[\s:|-]+\|\s*$/.test((ls[i + 1] || '').trim())) {
      const parseRow = (ln) => ln.trim().replace(/^\||\|\s*$/g, '').split('|').map((c) => '[' + esc(c.trim()) + ']')
      const rows = [parseRow(s)]
      i++
      while (i < ls.length && /^\|.*\|\s*$/.test(ls[i].trim())) { rows.push(parseRow(ls[i].trim())); i++ }
      const cols = Math.max(1, rows[0].length)
      t += '#table(columns: ' + cols + ', stroke: 0.5pt, ' + rows.map((r) => r.join(', ')).join(', ') + ')\n\n'
      continue
    }
    if (/^##\s+/.test(s)) t += '== ' + esc(s.replace(/^##\s+/, '')) + '\n'
    else if (/^###\s+/.test(s)) t += '=== ' + esc(s.replace(/^###\s+/, '')) + '\n'
    else if (/^>\s*/.test(s)) t += esc(s.replace(/^>\s*/, '')) + '\n'
    else t += esc(s) + '\n'
  }
  return t
}

// 整卷（未排版）→ Typst 源文件
function typFromPaper(paper, marks, meta) {
  const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/#/g, '\\#').replace(/_/g, '\\_')
  const qs = (paper && paper.questions) || []
  const ms = marks || []
  const tSec = (meta && meta.sec) || 0
  let t = '#set page("a4", margin: 2cm)\n#set text(font: ("Microsoft YaHei", "Noto Sans CJK SC"), size: 11pt)\n\n'
  t += '#align(center)[#text(size: 18pt, weight: "bold")[' + esc(paper && paper.name) + ']]\n\n'
  t += '导出时间：' + new Date().toLocaleString() + '\n\n'
  t += '== 成绩概览\n'
  t += '#table(columns: 4, stroke: 0.5pt, [*总题数*], [*答对*], [*正确率*], [*总用时*], [' + qs.length + '], [' + ((meta && meta.score) || 0) + '], [' + ((meta && meta.rate) || 0) + '%], [' + Math.round(tSec / 60) + '分' + tSec % 60 + '秒])\n\n'
  if (meta && meta.moduleStats && meta.moduleStats.length) {
    t += '== 板块统计\n'
    t += '#table(columns: 4, stroke: 0.5pt, [*板块*], [*题数*], [*答对*], [*正确率*], '
    meta.moduleStats.forEach((s, idx) => { t += (idx ? ', ' : '') + '[' + esc(s.subject) + '], [' + s.total + '], [' + s.ok + '], [' + (s.total ? Math.round((s.ok / s.total) * 100) : 0) + '%]' })
    t += ')\n\n'
  }
  qs.forEach((qq, i) => {
    const m = ms[i] || {}
    t += '== 第' + (i + 1) + '题 · ' + esc(qq.subject || '未分类') + ' ' + (m.ok ? '✅' : '❌') + '\n'
    t += '*题干*：' + esc(String(qq.stem || '').replace(/^#{1,6}\s*/gm, '').trim()) + '\n\n'
    const opts = (qq.options || []).map((o) => o.k + '. ' + o.t).join('　')
    if (opts) t += '*选项*：' + esc(opts) + '\n\n'
    t += '*我的答案*：' + (m.pick ? m.pick : m.timeout ? '超时未答' : '未作答') + '　*正确答案*：' + esc(qq.answer || '—') + '\n\n'
    const ana = qq.explain || qq.analysis || ''
    if (ana) t += '*解析*：' + esc(String(ana).replace(/\s+/g, ' ').trim()) + '\n\n'
  })
  return t
}
