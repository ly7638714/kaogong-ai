import { store } from '../../store'
import { showToast } from '../toast'
import { getPayload } from './payload'
import { downloadText, printPdf } from './writers'
import { exportMdDocx, exportItemsDocx } from './docx'
import { aiPolish } from '../../api'

// ===== Obsidian 兼容：错题/复盘导出（frontmatter + callout + 标签 + 复选框）=====
export function wqsToObsidianMd(wqs) {
  const list = wqs || []
  const L = []
  const today = new Date().toISOString().slice(0, 10)
  L.push('---')
  L.push('title: 行测错题集 · 复盘')
  L.push('type: 复盘笔记')
  L.push('created: ' + today)
  L.push('source: 行测名师AI小助理')
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

// 按 payload 导出 markdown（错题/对话/复盘通用）
export function exportDataMd(type, template = 'full') {
  const pay = getPayload(type, template)
  if (!pay) {
    showToast('暂无可导出的内容', 'info')
    return
  }
  const md = itemsToMd(pay.title, pay.items)
  downloadText(md, pay.title + '.md', 'text/markdown;charset=utf-8')
  showToast('已导出 Markdown', 'success')
}

export function exportDataAuto(type, format, template = 'full') {

  if (format === 'md') {
    exportDataMd(type, template)
    return
  }
  doExport(type, format, false, template)
}


// ===== Markdown 导出（新增）=====
export function mdCell(v) {
  return String(v == null ? '' : v)
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ')
}

export function itemsToMd(title, items) {
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

// 主导出流程（自 export.js 迁移，消除循环依赖；含 AI 整理/题答分离）
export async function doExport(type, format, polish, template = 'full') {
  const pay = getPayload(type, template)
  if (!pay) {
    showToast('暂无可导出的内容', 'info')
    return
  }
  if (polish && template === 'full') {
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



























































































































































































































































































































































































































// ===== 图推/几何 SVG → PNG 嵌入导出（md/pdf/doc 都能看到图）=====
