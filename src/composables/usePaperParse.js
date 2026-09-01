// usePaperParse —— ExamPanel 材料解析（批次6B R3-②b）
// 自 ExamPanel.vue 纯移动，未改动：图片/PDF/Word/txt 读取 + 文本转题 + 按卷面裁剪组卷
// 依赖（imgs/textFiles/modules/mixMode/pickGenC）由组件传入，保持函数体内行为与拆分前完全一致。
import { showToast } from '../utils/toast'
import { chatOnce } from '../api'

export const TEXT_SYS =
  '你是公考行测真题整理专家。把下面的文本/题目逐题整理成 JSON 数组，每题含 no/subject/stem/options/answer/analysis。要求：①题干与选项完整保留（含数字/图表数据/材料原文）；②按内容判断板块归属；③材料题/大题按小题拆分；④识别不清跳过、不编造。严格只输出 JSON 数组。'

export function usePaperParse({ imgs, textFiles, modules, mixMode, pickGenC }) {
  // ===== 材料导入（图片/PDF/Word/txt/tex）=====
  function onFiles(ev) {
    const files = Array.from(ev.target.files || [])
    for (const f of files) {
      const n = (f.name || '').toLowerCase()
      if (f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(n)) readImg(f)
      else if (/\.pdf$/i.test(n)) readPdf(f)
      else if (/\.(txt|tex|md|markdown)$/i.test(n)) readText(f)
      else if (/\.docx$/i.test(n)) readDocx(f)
      else showToast('暂不支持 ' + f.name, 'error')
    }
    ev.target.value = ''
  }
  function readImg(f) {
    const r = new FileReader()
    r.onload = (e) => imgs.value.push(e.target.result)
    r.readAsDataURL(f)
  }
  async function readPdf(f) {
    try {
      const buf = await f.arrayBuffer()
      const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist')
      GlobalWorkerOptions.workerSrc = './pdf.worker.min.mjs'
      const pdf = await getDocument({ data: buf }).promise
      const parts = []
      let imaged = 0
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p)
        // ① 优先提取文本层（精度远高于 OCR）
        try {
          const tc = await page.getTextContent()
          const t = (tc.items || []).map((it) => it.str || '').join(' ').replace(/\s+/g, ' ').trim()
          if (t && t.length > 40) { parts.push('【第' + p + '页】' + t); continue }
        } catch (e) {}
        // ② 无文本层 → 转图 OCR
        const vp = page.getViewport({ scale: 2 })
        const canvas = document.createElement('canvas')
        canvas.width = vp.width
        canvas.height = vp.height
        const ctx = canvas.getContext('2d')
        await page.render({ canvasContext: ctx, viewport: vp }).promise
        imgs.value.push(canvas.toDataURL('image/jpeg', 0.85))
        imaged++
      }
      if (parts.length) {
        textFiles.value.push({ name: f.name, text: parts.join('\n') })
        showToast('✅ 已解析 PDF（文本层优先，' + pdf.numPages + ' 页，识别更准）' + (imaged ? '；' + imaged + ' 页无文本转图片' : ''), 'success')
      } else if (imaged) {
        showToast('✅ 已解析 PDF（无文本层，转为图片识别 ' + imaged + ' 页）', 'success')
      }
    } catch (e) {
      showToast('PDF 解析失败：' + e.message, 'error')
    }
  }
  async function readText(f) {
    textFiles.value.push({ name: f.name, text: await f.text() })
    showToast('✅ 已读取 ' + f.name, 'success')
  }
  async function readDocx(f) {
    try {
      const buf = await f.arrayBuffer()
      const JSZip = (await import('jszip')).default
      const zip = await JSZip.loadAsync(buf)
      const xml = await zip.file('word/document.xml').async('string')
      const txt = xml
        .replace(/<w:p[^>]*>/g, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, '\n\n')
        .trim()
      textFiles.value.push({ name: f.name, text: txt })
      showToast('✅ 已读取 Word（' + txt.length + ' 字）', 'success')
    } catch (e) {
      showToast('Word 解析失败：' + e.message, 'error')
    }
  }
  function rmImg(i) { imgs.value.splice(i, 1) }
  function rmTxt(i) { textFiles.value.splice(i, 1) }

  function norm(qs) {
    return (qs || [])
      .map((x, i) => {
        const optsObj = x.options || {}
        let opts = Array.isArray(x.options)
          ? x.options.map((o, k) => ({ k: 'ABCD'[k] || 'A', t: typeof o === 'string' ? o : (o && o.t) }))
          : Object.keys(optsObj).map((k) => ({ k: k.toUpperCase(), t: optsObj[k] }))
        opts = opts.filter((o) => o.t).slice(0, 4)
        return {
          no: x.no || i + 1,
          subject: x.subject || '未分类',
          stem: x.stem || '',
          options: opts,
          answer: String(x.answer || '').toUpperCase(),
          analysis: x.analysis || ''
        }
      })
      .filter((x) => x.stem)
  }
  function shuffle(a) {
    const b = a.slice()
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[b[i], b[j]] = [b[j], b[i]]
    }
    return b
  }
  function applyConfig(qs) {
    let list = qs.slice()
    const subs = modules.value.filter((m) => ['图形推理', '定义判断', '类比推理', '逻辑判断'].includes(m.subject))
    const hasJudgeSub = subs.length > 0
    // 过滤：导入/错题的 subject 需命中卷面构成板块（判断推理子板块视为整体）
    list = list.filter((x) => {
      const s = x.subject || ''
      if (hasJudgeSub) return subs.some((m) => m.subject === s) || ['判断推理'].includes(s)
      return modules.value.some((m) => m.subject === s) || s === '判断推理' && modules.value.some((m) => m.subject === '判断推理')
    })
    // 题量裁剪：每板块最多取卷面题数
    const plan = {}
    modules.value.forEach((m) => { plan[m.subject] = m.count })
    if (hasJudgeSub) {
      subs.forEach((m) => { plan[m.subject] = m.count })
    }
    const picked = {}
    list = list.filter((x) => {
      const s = x.subject === '判断推理' ? (subs[0] && subs[0].subject) || '判断推理' : x.subject
      const cap = plan[s] != null ? plan[s] : 9999
      picked[s] = picked[s] || 0
      if (picked[s] >= cap) return false
      picked[s]++
      return true
    })
    if (mixMode.value === 'mix') list = shuffle(list)
    else {
      const order = modules.value.map((m) => m.subject)
      list.sort((a, b) => order.indexOf(a.subject) - order.indexOf(b.subject))
    }
    return list
  }
  async function textToQuestions(text) {
    const c = pickGenC()
    if (!c || !c.key) return
    try {
      const reply = await chatOnce(c, [{ role: 'system', content: TEXT_SYS }, { role: 'user', content: String(text).slice(0, 8000) }], 3000)
      const m = String(reply || '').match(/\[[\s\S]*\]/)
      return m ? norm(JSON.parse(m[0])) : []
    } catch (e) { return [] }
  }

  return { onFiles, readImg, readPdf, readText, readDocx, rmImg, rmTxt, norm, shuffle, applyConfig, textToQuestions }
}
