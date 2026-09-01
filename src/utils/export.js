/* global btoa */
import { downloadText, downloadBlob, printPdf, pdfHtml } from './export/writers'
import { exportMdDocx, buildDocx, itemsToParagraphs, itemsToTables } from './export/docx'
export { downloadText, downloadBlob, printPdf, pdfHtml } from './export/writers'
export { stripMd, escHtml, mdToParagraphs, buildDocx, exportItemsDocx, exportMdDocx, itemsToParagraphs, itemsToTables } from './export/docx'
export { getPayload } from './export/payload'
export { wqsToObsidianMd, exportObsidianMd, copyObsidianWrong, parseMarkdownNotes, exportAnkiCsv, exportWrongTxt, exportWrongMd, exportDataMd, exportDataAuto, itemsToMd, doExport } from './export/obsidian'
import { chatOnce, activeCfg } from '../api'
import { showToast } from './toast'


















































































































































































































































































export async function splitSvg(text) {
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
async function qLinesImg(qq, i, ms, separate) {
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
  L.push('我的答案：' + (m.pick ? m.pick : m.timeout ? '超时未答' : '未作答'))
  if (!separate) {
    L.push('　正确答案：' + (qq.answer || '—') + '　' + (m.ok ? '✅ 正确' : '❌ 错误'))
    const ana = qq.explain || qq.analysis || ''
    if (ana && !un) L.push('解析：' + String(ana).replace(/\s+/g, ' ').trim())
  }
  return { lines: L, imgs }
}

// ===== 模拟组卷 / 试卷导出：整卷排版导出 Word / PDF / Markdown / LaTeX =====
// paper: { name, questions:[{subject,stem,options,answer,explain,analysis}] }
// marks: 每题的 { ok, pick, timeout }
// meta:  { score, rate, sec, moduleStats:[{subject,total,ok}] }
export async function exportPaper(paper, marks, meta, format, polish, separate) {
  const ms = marks || []
  const isBlank = (i) => { const m = ms[i] || {}; return !!(m.blank || (m.timeout && !m.pick)) }
  // 未答题导出为空白卷：去掉答案与解析（保留题干/选项，供二刷），所有格式统一生效
  const qs = ((paper && paper.questions) || []).map((qq, i) => (isBlank(i) ? { ...qq, answer: '', explain: '', analysis: '' } : qq))
  if (!qs.length) { showToast('暂无题目可导出', 'info'); return }
  const hasSvg = qs.some((qq) => /`svg/.test(String(qq.stem || '')) || (qq.options || []).some((o) => /`svg/.test(String(o.t || ''))))
  const title = '模拟组卷 · ' + (paper.name || '试卷') + '（' + new Date().toLocaleDateString() + '）'
  const stat = meta || { score: 0, rate: 0, sec: 0, moduleStats: [] }

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
    for (const [qi, qq] of qs.entries()) { const ql = await qLinesImg(qq, qi, ms, separate); md += '## ' + ql.lines.join('\n\n') + '\n\n---\n\n' }
    if (separate) {
      md += '## 🔑 参考答案' + '\n' + '\n' + qs.map((qq, i) => (i + 1) + '.' + (qq.answer || '—')).join('　')
      const anas = qs.map((qq, i) => { const ana = qq.explain || qq.analysis || ''; return ana ? '**【' + (i + 1) + '题】** ' + String(ana).replace(/\s+/g, ' ').trim() : '' }).filter(Boolean)
      if (anas.length) md += '\n\n' + '## 📖 解析' + '\n\n' + anas.join('\n\n')
    }
    downloadText(md, title + '.md', 'text/markdown;charset=utf-8')
    showToast('✅ 已导出整卷 Markdown', 'success')
    return
  }

  if (format === 'tex') {
    downloadText(buildPaperTex({ title, qs, stat: { ...stat, marks: ms }, separate }), title + '.tex', 'application/x-tex;charset=utf-8')
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
    const ql = await qLinesImg(qq, qi, ms, separate)
    items.push({ type: 'h', text: '第' + (qi + 1) + '题 · ' + (qq.subject || '未分类') + (m.ok ? ' ✅' : ' ❌') })
    items.push({ type: 'msg', role: 'a', text: ql.lines.join('\n') })
  }
  if (separate) {
    items.push({ type: 'h', text: '🔑 参考答案' })
    items.push({ type: 'p', text: qs.map((qq, i) => (i + 1) + '.' + (qq.answer || '—')).join('　') })
      const anas2 = qs.map((qq, i) => { const ana = qq.explain || qq.analysis || ''; return ana ? { type: 'p', text: '【' + (i + 1) + '题解析】' + String(ana).replace(/\s+/g, ' ').trim() } : null }).filter(Boolean)
    if (anas2.length) { items.push({ type: 'h', text: '📖 解析' }); items.push(...anas2) }
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

// ===== LaTeX 生成（可编译：正确单反斜杠 + ctex 中文 + 规范排版）=====
function texEsc(s) {
  return String(s || '')
    .replace(/\\/g, '\\BSLASHPLACEHOLDER')
    .replace(/([{}_$&%#~^])/g, '\\$1')
    .replace(/BSLASHPLACEHOLDER/g, '\\textbackslash{}')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
}
function inlineTex(s) {
  let out = texEsc(String(s || ''))
  out = out.replace(/\*\*(.+?)\*\*/g, '\\textbf{$1}')
  out = out.replace(/`([^`]+)`/g, '\\texttt{$1}')
  return out
}
// 整卷 → LaTeX 源文件（导出前可被单测/编译验证）
export function buildPaperTex({ title, qs, stat, separate }) {
  const st = stat || { score: 0, rate: 0, sec: 0, moduleStats: [], marks: [] }
  const ms = st.marks || []
  const qlist = qs || []
  let t = ''
  t += '\\documentclass[12pt,a4paper]{article}\n'
  t += '\\usepackage[UTF8]{ctex}\n'
  t += '\\usepackage{geometry}\n\\geometry{left=2cm,right=2cm,top=2.2cm,bottom=2.2cm}\n'
  t += '\\usepackage{booktabs}\n\\usepackage{longtable}\n\\usepackage{enumitem}\n\\usepackage{fancyhdr}\n'
  t += '\\pagestyle{fancy}\\fancyhf{}\\fancyhead[L]{\\small ' + texEsc(title) + '}\\fancyfoot[C]{\\small \\thepage}\n'
  t += '\\begin{document}\n\n'
  t += '\\begin{center}\n{\\LARGE\\bfseries ' + texEsc(title) + '}\\\\[4pt]\n{\\small 导出时间：' + texEsc(new Date().toLocaleString()) + '}\n\\end{center}\n\n'
  t += '\\section*{成绩概览}\n总题数：' + qlist.length + '　答对：' + (st.score || 0) + '　正确率：' + (st.rate || 0) + '\\%　总用时：' + Math.round((st.sec || 0) / 60) + '分' + ((st.sec || 0) % 60) + '秒\n\n'
  if (st.moduleStats && st.moduleStats.length) {
    t += '\\section*{板块统计}\n\\begin{longtable}{@{}lccr@{}}\\toprule\n板块 & 题数 & 答对 & 正确率\\\\ \\midrule\n'
    st.moduleStats.forEach((s) => { t += texEsc(s.subject) + ' & ' + s.total + ' & ' + s.ok + ' & ' + (s.total ? Math.round((s.ok / s.total) * 100) : 0) + '\\%\\\\\n' })
    t += '\\bottomrule\n\\end{longtable}\n\n'
  }
  qlist.forEach((qq, i) => {
    const m = ms[i] || {}
    t += '\\section*{第' + (i + 1) + '题 · ' + texEsc(qq.subject || '未分类') + '}\n'
    t += '\\textbf{题干：}' + texEsc(String(qq.stem || '').replace(/^#{1,6}\s*/gm, '').replace(/\s+/g, ' ').trim()) + '\n\n'
    const opts = (qq.options || []).map((o) => o.k + '. ' + String(o.t || '').replace(/\s+/g, ' ').trim())
    if (opts.length) t += '\\textbf{选项：}' + opts.map((o) => texEsc(o)).join('　') + '\n\n'
    t += '\\textbf{我的答案：}' + (m.pick ? m.pick : m.timeout ? '超时未答' : '未作答')
    if (!separate) {
      t += '　\\textbf{正确答案：}' + texEsc(qq.answer || '—') + '　' + (m.ok ? '正确' : '错误')
      const ana = qq.explain || qq.analysis || ''
      if (ana) t += '\n\n\\textbf{解析：}' + texEsc(String(ana).replace(/\s+/g, ' ').trim())
    }
    t += '\n\n'
  })
  t += '\\end{document}\n'
  return t
}
// Markdown → LaTeX（AI 排版结果转 TeX 源文件）
export function mdToTex(md) {
  const lines = String(md || '').split('\n')
  let t = ''
  t += '\\documentclass[12pt,a4paper]{article}\n\\usepackage[UTF8]{ctex}\n'
  t += '\\usepackage{geometry}\n\\geometry{left=2cm,right=2cm,top=2.2cm,bottom=2.2cm}\n'
  t += '\\usepackage{booktabs}\n\\usepackage{longtable}\n\\usepackage{enumitem}\n\\usepackage{xcolor}\n\\begin{document}\n\n'
  const para = []
  const flush = () => {
    if (!para.length) return
    let list = []
    const emitList = () => {
      if (!list.length) return
      t += '\\begin{itemize}[leftmargin=*,itemsep=1pt,topsep=2pt]\n' + list.map((x) => '\\item ' + x).join('\n') + '\n\\end{itemize}\n\n'
      list = []
    }
    for (const p of para) {
      if (p.item) list.push(p.item)
      else {
        emitList()
        t += p.quote ? '\\begin{quote}\n' + p.quote + '\n\\end{quote}\n\n' : p.text + '\n\n'
      }
    }
    emitList()
    para.length = 0
  }
  let i = 0
  while (i < lines.length) {
    const raw = lines[i]
    const s = raw.trim()
    i++
    if (!s) continue
    if (/^\|.*\|\s*$/.test(s) && i < lines.length && /^\|[\s:|-]+\|\s*$/.test(lines[i].trim())) {
      flush()
      const parseRow = (ln) => ln.trim().replace(/^\||\|\s*$/g, '').split('|').map((c) => texEsc(c.trim()))
      const rows = [parseRow(s)]
      i++
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i].trim())) { rows.push(parseRow(lines[i].trim())); i++ }
      const cols = Math.max(1, rows[0].length)
      t += '\\begin{longtable}{@{}' + 'l'.repeat(cols) + '@{}}\\toprule\n'
      rows.forEach((r, ri) => { t += r.join(' & ') + (ri === 0 ? '\\\\ \\midrule' : '\\\\') + '\n' })
      t += '\\bottomrule\n\\end{longtable}\n\n'
      continue
    }
    if (/^##\s+/.test(s)) { flush(); t += '\\section*{' + texEsc(s.replace(/^##\s+/, '')).trim() + '}\n\n'; continue }
    if (/^###\s+/.test(s)) { flush(); t += '\\subsection*{' + texEsc(s.replace(/^###\s+/, '')).trim() + '}\n\n'; continue }
    if (/^>\s*/.test(s)) { para.push({ quote: inlineTex(s.replace(/^>\s*/, '')) }); continue }
    if (/^\s*[-*+]\s+/.test(raw)) { para.push({ item: inlineTex(s.replace(/^\s*[-*+]\s+/, '')) }); continue }
    para.push({ text: inlineTex(s) })
  }
  flush()
  t += '\\end{document}\n'
  return t
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
