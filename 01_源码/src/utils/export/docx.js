import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, ImageRun } from 'docx'
import katex from 'katex'
import { downloadText, downloadBlob, pdfHtml } from './writers'

// 自拆分前 export.js 纯还原（6B R1 丢失，docx 图片尺寸用）
function getImgDim(src) {
  return new Promise((res) => {
    const im = new Image()
    im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight })
    im.onerror = () => res({ w: 300, h: 200 })
    im.src = src
  })
}

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

export function mdToParagraphs(md) {
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

export async function buildDocx({ title, paragraphs, tables, formulas }) {
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

export async function exportItemsDocx(title, items) {
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

export async function exportMdDocx(title, md) {
  const { ps: paragraphs, formulas } = mdToParagraphs(md)
  try {
    const blob = await buildDocx({ title, paragraphs, formulas })
    downloadBlob(blob, title + '.docx')
  } catch (e) {
    downloadText(pdfHtml(title, [{ type: 'msg', role: 'ai', text: md }]), title + '.doc', 'application/msword')
  }
}

// items → docx 段落/表格（供整卷导出复用）
export function itemsToParagraphs(items) {
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

export function itemsToTables(items) {
  const ts = []
  for (const it of items) if (it.type === 'table') ts.push([it.head].concat(it.rows))
  return ts
}
