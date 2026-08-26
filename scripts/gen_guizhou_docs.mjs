// 贵州省考模拟卷 → docx / tex / typ / pdf 本地生成脚本（纯本地排版，含题干内嵌 Markdown 表格渲染）
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import os from 'os'
import { spawn } from 'child_process'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType } from 'docx'

const ROOT = 'E:\\公务员备考资料\\行测\\kaogong-review-skill-main'
const OUT = join(ROOT, '用户复盘导出文件', '贵州省考模拟卷')
mkdirSync(OUT, { recursive: true })

const DATA = JSON.parse(readFileSync(join(OUT, '_data.json'), 'utf8'))
const QS = DATA.qs
const TOTAL = QS.length

const groups = []
const map = new Map()
QS.forEach((q, i) => {
  const subj = q.subject || '未分类'
  if (!map.has(subj)) { map.set(subj, []); groups.push(subj) }
  map.get(subj).push({ ...q, no: i + 1 })
})

const now = new Date()
const nowStr = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`

const escHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const escTex = (s) => String(s ?? '').replace(/([\\{}_$&%#])/g, '\\$1').replace(/~/g, '\\textasciitilde{}').replace(/\^/g, '\\textasciicircum{}')
const escTyp = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/#/g, '\\#').replace(/_/g, '\\_').replace(/\[/g, '\\[').replace(/\]/g, '\\]')
const texMath = (s) => String(s ?? '')
  .replace(/≈/g, () => '$\\approx$').replace(/≤/g, () => '$\\leq$').replace(/≥/g, () => '$\\geq$')
  .replace(/×/g, () => '$\\times$').replace(/÷/g, () => '$\\div$').replace(/→/g, () => '$\\rightarrow$').replace(/∶/g, () => ':').replace(/①/g, () => '（1）').replace(/②/g, () => '（2）').replace(/③/g, () => '（3）').replace(/④/g, () => '（4）').replace(/⑤/g, () => '（5）')
const escTexM = (s) => texMath(escTex(s))
const stripMd = (s) => String(s ?? '').replace(/\*\*/g, '').replace(/\*([^*]+)\*/g, '$1').replace(/`([^`]*)`/g, '$1').replace(/^#{1,6}\s*/gm, '').replace(/^>\s*/gm, '').trim()

// 将文本按行拆成「文本行 / 内嵌 Markdown 表格」块
function splitBlocks(text) {
  const lines = String(text ?? '').split('\n')
  const blocks = []
  let i = 0
  while (i < lines.length) {
    const t = lines[i].trim()
    if (/^\|.*\|\s*$/.test(t) && /^\|[\s:|-]+\|\s*$/.test((lines[i + 1] || '').trim())) {
      const parseRow = (ln) => ln.trim().replace(/^\||\|\s*$/g, '').split('|').map((c) => c.trim())
      const rows = [parseRow(t)]
      i++
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i].trim())) { rows.push(parseRow(lines[i].trim())); i++ }
      blocks.push({ type: 'table', rows })
    } else {
      if (t) blocks.push({ type: 'line', text: t })
      i++
    }
  }
  return blocks
}

// ============ 1. HTML → PDF ============
function buildHtml() {
  const statsRows = groups.map((g) => `<tr><td>${escHtml(g)}</td><td style="text-align:center">${map.get(g).length}</td></tr>`).join('')
  const ansRows = QS.map((q, i) => `<tr><td style="text-align:center">${i + 1}</td><td style="text-align:center">${escHtml(q.answer)}</td><td>${escHtml(q.subject)}</td></tr>`).join('')
  const tableHtml = (rows) => `<table>${rows.map((r, ri) => `<tr>${r.map((c) => ri === 0 ? `<th>${escHtml(c)}</th>` : `<td>${escHtml(c)}</td>`).join('')}</tr>`).join('')}</table>`
  const stemHtml = (q) => {
    const blocks = splitBlocks(q.stem)
    return blocks.map((b) => b.type === 'table' ? tableHtml(b.rows) : `<div class="stemline">${escHtml(b.text)}</div>`).join('')
  }
  let qHtml = ''
  groups.forEach((g) => {
    const list = map.get(g)
    qHtml += `<h2>${escHtml(g)}（${list.length} 题）</h2>`
    list.forEach((q) => {
      qHtml += `<div class="q"><div class="stem"><span class="no">${q.no}.</span> ${stemHtml(q)}</div>`
      qHtml += `<div class="opts">${q.opts.map(([k, t]) => `<div class="opt"><span class="optk">${escHtml(k)}.</span> ${escHtml(t)}</div>`).join('')}</div></div>`
    })
  })
  let anaHtml = ''
  QS.forEach((q, i) => {
    anaHtml += `<div class="ana"><div class="anahead">第${i + 1}题【${escHtml(q.subject)}】<b>答案：${escHtml(q.answer)}</b></div>`
    anaHtml += `<div class="analine"><span class="tag">解析</span>${escHtml(q.analysis)}</div>`
    if (q.killer) anaHtml += `<div class="analine"><span class="tag killer">秒杀</span>${escHtml(q.killer)}</div>`
    anaHtml += `</div>`
  })
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><style>
@page { size: A4; margin: 12mm 11mm; }
* { box-sizing: border-box; }
body { font-family: "Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif; color: #1a1a1a; line-height: 1.75; font-size: 13px; margin: 0; }
.head { text-align: center; border-bottom: 3px solid #b02a2a; padding-bottom: 12px; margin-bottom: 12px; }
.head h1 { margin: 0 0 4px; font-size: 26px; color: #b02a2a; letter-spacing: 2px; }
.head .sub { color: #666; font-size: 12px; }
.meta { display: flex; justify-content: center; gap: 30px; margin: 10px 0 6px; font-size: 13px; }
.meta b { color: #b02a2a; }
.notice { border: 1px solid #e3c8c8; background: #fdf6f6; border-radius: 6px; padding: 8px 12px; font-size: 12px; color: #6b4b4b; margin-bottom: 14px; }
.notice ul { margin: 4px 0; padding-left: 18px; }
h2 { font-size: 16px; color: #fff; background: #b02a2a; padding: 5px 12px; border-radius: 4px; margin: 18px 0 10px; page-break-after: avoid; }
.q { margin: 0 0 12px; page-break-inside: avoid; }
.stem { font-weight: 600; }
.no { color: #b02a2a; font-weight: 700; margin-right: 4px; }
.stemline { display: inline; }
.opts { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 18px; margin: 5px 0 0 18px; }
.optk { color: #b02a2a; font-weight: 600; }
.q table { margin: 6px 0 6px 18px; width: calc(100% - 18px); }
.section-title { font-size: 18px; color: #b02a2a; border-left: 5px solid #b02a2a; padding-left: 10px; margin: 22px 0 10px; page-break-before: always; page-break-after: avoid; }
table { border-collapse: collapse; width: 100%; font-size: 12px; margin: 8px 0; }
th, td { border: 1px solid #d9c2c2; padding: 5px 8px; text-align: left; }
th { background: #f5e6e6; color: #8a2222; }
.ana { border: 1px solid #e5d5d5; border-radius: 6px; padding: 8px 12px; margin: 0 0 10px; page-break-inside: avoid; background: #fffdfd; }
.anahead { font-weight: 600; color: #8a2222; margin-bottom: 4px; }
.analine { margin: 2px 0; font-size: 12.5px; }
.tag { display: inline-block; background: #b02a2a; color: #fff; border-radius: 3px; font-size: 11px; padding: 0 6px; margin-right: 6px; }
.tag.killer { background: #c47a12; }
.anskey { page-break-before: always; }
</style></head><body>
<div class="head">
  <h1>${escHtml(DATA.name)}</h1>
  <div class="sub">依据贵州省考 110 题 / 120 分钟卷面结构 · 样卷展示</div>
  <div class="meta"><span>总题数 <b>${TOTAL}</b> 题</span><span>板块 <b>${groups.length}</b> 个</span><span>时限 <b>120</b> 分钟</span><span>导出时间 ${nowStr}</span></div>
</div>
<div class="notice"><b>作答须知：</b><ul>
<li>本样卷按六大模块组卷，覆盖政治理论、常识判断、言语理解、数量关系、判断推理、资料分析。</li>
<li>建议按 1 题 ≤ 1 分钟控制节奏，全卷 120 分钟内完成，培养考场时间感。</li>
<li>资料分析涉及表格数据，请结合表格作答；参考答案与解析附于卷末。</li>
</ul></div>
<h2>📊 卷面结构与板块分布</h2>
<table><tr><th>板块</th><th style="width:80px">题数</th></tr>${statsRows}</table>
<h2>一、试题部分</h2>
${qHtml}
<div class="anskey">
<h2 class="section-title">二、参考答案</h2>
<table><tr><th style="width:60px">题号</th><th style="width:70px">答案</th><th>板块</th></tr>${ansRows}</table>
</div>
<h2 class="section-title">三、解析与秒杀规律</h2>
${anaHtml}
</body></html>`
}

// ============ 2. DOCX ============
const cellPar = (text, bold) => new Paragraph({ children: [new TextRun({ text: String(text), bold: !!bold })] })
const qDocxTable = (rows) => new Table({
  rows: rows.map((r, ri) => new TableRow({ children: r.map((c) => new TableCell({ children: [cellPar(c, ri === 0)] })) })),
  width: { size: 100, type: WidthType.PERCENTAGE }
})

async function buildDocx() {
  const kids = []
  kids.push(new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, children: [new TextRun({ text: DATA.name, bold: true, size: 34, color: 'B02A2A' })] }))
  kids.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `依据贵州省考 110 题 / 120 分钟卷面结构 · 样卷展示 · 导出时间 ${nowStr}`, size: 18, color: '888888' })] }))
  kids.push(new Paragraph({ children: [new TextRun('')] }))
  kids.push(new Paragraph({ children: [new TextRun({ text: '作答须知：', bold: true, size: 22, color: 'B02A2A' })] }))
  ;['本样卷按六大模块组卷，覆盖政治理论、常识判断、言语理解、数量关系、判断推理、资料分析。', '建议按 1 题 ≤ 1 分钟控制节奏，全卷 120 分钟内完成，培养考场时间感。', '资料分析涉及表格数据，请结合表格作答；参考答案与解析附于卷末。'].forEach((t) => {
    kids.push(new Paragraph({ children: [new TextRun({ text: '· ' + t, size: 20 })] }))
  })
  kids.push(new Paragraph({ children: [new TextRun('')] }))
  kids.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: '卷面结构与板块分布', bold: true, size: 26, color: 'B02A2A' })] }))
  kids.push(new Table({
    rows: [new TableRow({ children: [new TableCell({ children: [cellPar('板块', true)] }), new TableCell({ children: [cellPar('题数', true)] })] }),
      ...groups.map((g) => new TableRow({ children: [new TableCell({ children: [cellPar(g)] }), new TableCell({ children: [cellPar(map.get(g).length)] })] }))]
    , width: { size: 100, type: WidthType.PERCENTAGE } }))
  kids.push(new Paragraph({ children: [new TextRun('')] }))
  kids.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: '一、试题部分', bold: true, size: 28, color: 'B02A2A' })] }))
  groups.forEach((g) => {
    kids.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: `${g}（${map.get(g).length} 题）`, bold: true, size: 24, color: '8A2222' })] }))
    map.get(g).forEach((q) => {
      const blocks = splitBlocks(q.stem)
      blocks.forEach((b, bi) => {
        if (b.type === 'table') {
          kids.push(qDocxTable(b.rows))
          kids.push(new Paragraph({ children: [new TextRun('')] }))
        } else {
          kids.push(new Paragraph({ spacing: { before: bi === 0 ? 120 : 0 }, indent: bi === 0 ? { left: 0 } : { left: 240 }, children: [new TextRun({ text: (bi === 0 ? `${q.no}. ` : '') + stripMd(b.text), bold: bi === 0, size: 22 })] }))
        }
      })
      q.opts.forEach(([k, t]) => {
        kids.push(new Paragraph({ indent: { left: 420 }, children: [new TextRun({ text: `${k}. ${stripMd(t)}`, size: 21 })] }))
      })
    })
  })
  kids.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: '二、参考答案', bold: true, size: 28, color: 'B02A2A' })] }))
  const ansRows = []
  for (let i = 0; i < QS.length; i += 7) {
    const chunk = QS.slice(i, i + 7)
    ansRows.push(new TableRow({ children: ['题号', ...chunk.map((_, j) => String(i + j + 1))].map((c) => new TableCell({ children: [cellPar(c, true)] })) }))
    ansRows.push(new TableRow({ children: ['答案', ...chunk.map((q) => q.answer)].map((c) => new TableCell({ children: [cellPar(c)] })) }))
  }
  kids.push(new Table({ rows: ansRows, width: { size: 100, type: WidthType.PERCENTAGE } }))
  kids.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: '三、解析与秒杀规律', bold: true, size: 28, color: 'B02A2A' })] }))
  QS.forEach((q, i) => {
    kids.push(new Paragraph({ spacing: { before: 100 }, children: [new TextRun({ text: `第${i + 1}题【${q.subject}】答案：${q.answer}`, bold: true, size: 21, color: '8A2222' })] }))
    kids.push(new Paragraph({ indent: { left: 240 }, children: [new TextRun({ text: '解析：' + stripMd(q.analysis), size: 20 })] }))
    if (q.killer) kids.push(new Paragraph({ indent: { left: 240 }, children: [new TextRun({ text: '⚡ 秒杀规律：' + stripMd(q.killer), size: 20, color: 'B05A00' })] }))
  })
  const buf = await Packer.toBuffer(new Document({ sections: [{ children: kids }] }))
  writeFileSync(join(OUT, '贵州省考模拟卷-样卷.docx'), buf)
  console.log('DOCX OK')
}

// ============ 3. LaTeX ============
function texTable(rows) {
  const cols = Math.max(1, rows[0].length)
  let t = '\\begin{longtable}{|' + 'l|'.repeat(cols) + '}\n\\hline\n'
  rows.forEach((r, ri) => { t += r.map((c) => (ri === 0 ? '\\textbf{' + escTexM(c) + '}' : escTexM(c))).join(' & ') + ' \\\\ \\hline\n' })
  t += '\\end{longtable}\n\n'
  return t
}
function buildTex() {
  let t = '\\documentclass[12pt,a4paper]{article}\n'
  t += '\\usepackage[UTF8]{ctex}\n'
  t += '\\usepackage[margin=2cm]{geometry}\n'
  t += '\\usepackage{xcolor}\n\\usepackage{colortbl}\n\\usepackage{longtable}\n\\usepackage{enumitem}\n'
  t += '\\usepackage{titlesec}\n\\definecolor{redmain}{RGB}{176,42,42}\n'
  t += '\\titleformat{\\section}{\\Large\\bfseries\\color{redmain}}{}{0em}{}\n'
  t += '\\titleformat{\\subsection}{\\large\\bfseries\\color{redmain}}{}{0em}{}\n'
  t += '\\begin{document}\n\n'
  t += '\\begin{center}{\\Huge\\bfseries\\color{redmain} ' + escTexM(DATA.name) + '}\\end{center}\n\n'
  t += '\\begin{center}\\small 依据贵州省考 110 题 / 120 分钟卷面结构 · 样卷展示 \\quad 导出时间：' + escTexM(nowStr) + '\\end{center}\n\n'
  t += '\\section*{卷面结构与板块分布}\n'
  t += '\\begin{longtable}{|l|c|}\\hline\n\\textbf{板块} & \\textbf{题数}\\\\\\hline\n'
  groups.forEach((g) => { t += escTexM(g) + ' & ' + map.get(g).length + ' \\\\\\hline\n' })
  t += '\\end{longtable}\n\n'
  t += '\\section*{一、试题部分}\n'
  groups.forEach((g) => {
    t += '\\subsection*{' + escTexM(g) + '（' + map.get(g).length + ' 题）}\n'
    map.get(g).forEach((q) => {
      const blocks = splitBlocks(q.stem)
      blocks.forEach((b, bi) => {
        if (b.type === 'table') t += texTable(b.rows)
        else if (bi === 0) t += '\\textbf{' + q.no + '. ' + escTexM(stripMd(b.text)) + '}\n\n'
        else t += escTexM(stripMd(b.text)) + '\\\\\n'
      })
      q.opts.forEach(([k, o]) => { t += '\\hspace*{1em}\\textbf{' + k + '.} ' + escTexM(stripMd(o)) + '\\\\\n' })
      t += '\\vspace{0.6em}\n'
    })
  })
  t += '\\newpage\n\\section*{二、参考答案}\n'
  t += '\\begin{longtable}{|c|c|l|}\\hline\n\\textbf{题号} & \\textbf{答案} & \\textbf{板块}\\\\\\hline\n'
  QS.forEach((q, i) => { t += (i + 1) + ' & \\textbf{' + escTexM(q.answer) + '} & ' + escTexM(q.subject) + ' \\\\\\hline\n' })
  t += '\\end{longtable}\n\n'
  t += '\\section*{三、解析与秒杀规律}\n'
  QS.forEach((q, i) => {
    t += '\\textbf{第' + (i + 1) + '题【' + escTexM(q.subject) + '】答案：' + escTexM(q.answer) + '}\n\n'
    t += '\\quad 解析：' + escTexM(stripMd(q.analysis)) + '\n\n'
    if (q.killer) t += '\\quad \\textcolor{redmain}{秒杀规律：' + escTexM(stripMd(q.killer)) + '}\n\n'
  })
  t += '\\end{document}\n'
  writeFileSync(join(OUT, '贵州省考模拟卷-样卷.tex'), t, 'utf8')
  console.log('TEX OK')
}

// ============ 4. Typst ============
function typTable(rows) {
  const cols = Math.max(1, rows[0].length)
  let t = '#table(columns: (' + (rows[0].map(() => '1fr').join(', ')) + '), stroke: 0.5pt, align: left, '
  rows.forEach((r, ri) => { r.forEach((c) => { t += (ri === 0 ? '[#text(weight: "bold")[' : '[') + escTyp(c) + ']], ' }) })
  t += ')\n\n'
  return t
}
function buildTyp() {
  let t = '#set page("a4", margin: 2cm)\n'
  t += '#set text(font: ("Microsoft YaHei", "Noto Sans CJK SC"), size: 11pt, lang: "zh")\n\n'
  t += '#align(center)[#text(size: 22pt, weight: "bold", fill: rgb("#b02a2a"))[' + escTyp(DATA.name) + ']]\n\n'
  t += '#align(center)[#text(size: 9.5pt, fill: rgb("#666666"))[依据贵州省考 110 题 / 120 分钟卷面结构 · 样卷展示　导出时间：' + escTyp(nowStr) + ']]\n\n'
  t += '== 卷面结构与板块分布\n'
  t += typTable([['板块', '题数'], ...groups.map((g) => [g, String(map.get(g).length)])])
  t += '== 一、试题部分\n'
  groups.forEach((g) => {
    t += '=== ' + escTyp(g) + '（' + map.get(g).length + ' 题）\n'
    map.get(g).forEach((q) => {
      const blocks = splitBlocks(q.stem)
      blocks.forEach((b, bi) => {
        if (b.type === 'table') t += typTable(b.rows)
        else if (bi === 0) t += '*' + q.no + '. ' + escTyp(stripMd(b.text)) + '*\n\n'
        else t += '  ' + escTyp(stripMd(b.text)) + '\n\n'
      })
      q.opts.forEach(([k, o]) => { t += '  #text(fill: rgb("#b02a2a"), weight: "bold")[' + k + '.] ' + escTyp(stripMd(o)) + '\n\n' })
    })
  })
  t += '#pagebreak()\n== 二、参考答案\n'
  t += typTable([['题号', '答案', '板块'], ...QS.map((q, i) => [String(i + 1), q.answer, q.subject])])
  t += '== 三、解析与秒杀规律\n'
  QS.forEach((q, i) => {
    t += '*第' + (i + 1) + '题【' + escTyp(q.subject) + '】答案：' + escTyp(q.answer) + '*\n\n'
    t += '  解析：' + escTyp(stripMd(q.analysis)) + '\n\n'
    if (q.killer) t += '  #text(fill: rgb("#c47a12"))[秒杀规律：' + escTyp(stripMd(q.killer)) + ']\n\n'
  })
  writeFileSync(join(OUT, '贵州省考模拟卷-样卷.typ'), t, 'utf8')
  console.log('TYP OK')
}

// ============ 5. PDF via headless Chrome CDP ============
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }
async function htmlToPdf(htmlPath, pdfPath) {
  const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  const PORT = 9400 + Math.floor(Math.random() * 200)
  const PROFILE = join(os.tmpdir(), 'cdp_guizhou_' + Date.now())
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, '--no-first-run', '--disable-gpu', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore', detached: true })
  chrome.unref()
  try {
    let ready = false
    for (let i = 0; i < 60; i++) {
      try { const r = await fetch('http://localhost:' + PORT + '/json/list'); if (r.ok) { ready = true; break } } catch (e) {}
      await sleep(250)
    }
    if (!ready) throw new Error('Chrome CDP 启动失败')
    const list = await (await fetch('http://localhost:' + PORT + '/json/list')).json()
    const tab = list.find((t) => t.type === 'page')
    const ws = new WebSocket(tab.webSocketDebuggerUrl)
    let msgId = 0
    const pending = new Map()
    ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
    const send = (method, params = {}) => new Promise((res) => { const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })) })
    await send('Page.enable'); await send('Runtime.enable')
    await send('Page.navigate', { url: htmlPath })
    await sleep(2600)
    const r = await send('Page.printToPDF', {
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<div style="font-size:8.5px;color:#999;width:100%;text-align:center;padding:6px 0;">贵州省考行测·全真模拟卷（样卷）</div>',
      footerTemplate: '<div style="font-size:8.5px;color:#999;width:100%;text-align:center;padding:4px 0;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'
    })
    writeFileSync(pdfPath, Buffer.from(r.result.data, 'base64'))
    ws.close()
    console.log('PDF OK')
  } finally {
    try { chrome.kill() } catch (e) {}
  }
}

// ============ 主流程 ============
async function main() {
  await buildDocx()
  buildTex()
  buildTyp()
  const html = buildHtml()
  const htmlPath = join(OUT, '_preview.html')
  writeFileSync(htmlPath, html, 'utf8')
  const pdfPath = join(OUT, '贵州省考模拟卷-样卷.pdf')
  await htmlToPdf('file:///' + htmlPath.split(/[\\/]/).map(encodeURIComponent).join('/'), pdfPath)
  console.log('ALL DONE ->', OUT)
}
main().catch((e) => { console.error('ERR', e); process.exit(1) })