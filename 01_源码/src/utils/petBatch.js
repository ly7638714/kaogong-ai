// petBatch.js —— 萌宠批量收题：把今天对话里发过的截图/图片错题整理进错题集
import { store, addWrong, saveWqs } from '../store'
import { activeCfg, supportsVision, chatOnce } from '../api/client'
import { figCfg, readQuestionFromImage } from '../api/figEnhance'
import { parseQuiz, extractChoices, answerLetter } from './quiz'
import { pickWrongSource } from './wrongPick'
import { detectBanKuai } from '../api/detect'

function todayStr(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function cleanImg(img) {
  return String(img || '').startsWith('data:') ? img : ''
}

function msgText(m) {
  if (!m) return ''
  return typeof m.content === 'string' ? m.content : String((m.content && m.content.text) || '')
}

function explainFrom(reply) {
  let t = String(reply || '').replace(/<[^>]+>/g, ' ').trim()
  const i = t.search(/(?:^|\n)\s*(?:【?解析|答案解析|答案详解|讲解)[^。\n]{0,12}[:：]?/i)
  if (i >= 0) {
    t = t.slice(i).replace(/^[\s\S]*?[:：]\s*/, '')
  } else {
    t = t.replace(/^(?:正确答案|参考答案|正确选项|答案)\s*[:：为是]?\s*[A-D]\s*[。；;,]?\s*/i, '')
  }
  return t.slice(0, 1800)
}

function rawToQuiz(text) {
  const raw = String(text || '').replace(/<[^>]+>/g, ' ').trim()
  if (!raw) return null
  const q = parseQuiz(raw)
  if (q) return q
  const opts = extractChoices(raw)
  if (!opts.length) return { stem: raw, options: [], answer: '' }
  const m = raw.match(/([A-D])[.、．:：]/)
  const stem = m ? raw.slice(0, m.index).trim() : raw
  return { stem, options: opts, answer: answerLetter(raw) || '' }
}

function parseJsonFrom(raw) {
  let s = String(raw || '').replace(/```(?:json)?/gi, '').trim()
  const m = s.match(/\{[\s\S]*\}/)
  if (m) {
    try { return JSON.parse(m[0]) } catch (e) {}
  }
  return null
}

const READ_IMAGE_PROMPT =
  '你是公考行测题目录入助手。请把这张截图里的行测题目完整提取出来：题干和问法逐字保留，A/B/C/D 四个选项完整列出，图中明显标注的标准答案如有则填 A-D，没有就留空。不要写解析，不要额外文字。只输出 JSON：{"stem":"...","options":["A. ...","B. ...","C. ...","D. ..."],"answer":"A-D 或空"}'

async function ocrImage(dataUrl, hint = '') {
  const c = activeCfg(true)
  if (c && c.key && supportsVision(c)) {
    const content = [
      { type: 'text', text: READ_IMAGE_PROMPT + (hint ? '\n\n用户补充：' + hint.slice(0, 300) : '') },
      { type: 'image_url', image_url: { url: dataUrl } }
    ]
    const reply = await chatOnce(c, [{ role: 'user', content }], 1600, 60000)
    const j = parseJsonFrom(reply)
    if (j && j.stem) return { text: j.stem + '\n\n' + (j.options || []).join('\n') }
    return { text: String(reply || '').trim() }
  }
  if (figCfg()) {
    const r = await readQuestionFromImage(dataUrl, hint)
    if (r && r.ok) return { text: String(r.text || '') }
  }
  return null
}

function nextAssistantIdx(msgs, from) {
  for (let i = from + 1; i < msgs.length; i++) {
    const m = msgs[i]
    if (!m || m.role !== 'assistant' || m.err || m.stopped) continue
    return i
  }
  return -1
}

export async function petBatchCollectTodayWrong() {
  const msgs = Array.isArray(store.msgs) ? store.msgs : []
  const today = todayStr()
  const rounds = []
  const seen = new Set()
  const todayMsgs = msgs
    .map((m, i) => ({ m, i }))
    .filter((x) => x.m && x.m.t && todayStr(new Date(Number(x.m.t))) === today)
  for (let k = 0; k < todayMsgs.length; k++) {
    const u = todayMsgs[k].m
    if (u.role !== 'user') continue
    const aiIdx = nextAssistantIdx(msgs, todayMsgs[k].i)
    const src = aiIdx >= 0 ? pickWrongSource(msgs, aiIdx) : pickWrongSource(msgs, todayMsgs[k].i)
    if (!src || ((!src.q || src.q.length < 12) && !src.imgs.length)) continue
    // 只收“截图/图片错题”：纯文字聊出来的出题卡、概念问答不归本功能
    if (!src.imgs.length && src.source !== 'ocr') continue
    const img = cleanImg((src.imgs || [])[0])
    const hashKey = (src.q || '').slice(0, 60) + '|' + (img || '').slice(0, 80)
    if (seen.has(hashKey)) continue
    seen.add(hashKey)
    rounds.push({
      src,
      img,
      typed: String(u.content && u.content.text || ''),
      aiText: aiIdx >= 0 ? msgText(msgs[aiIdx]) : ''
    })
  }
  if (!rounds.length) {
    return { ok: true, count: 0, total: 0, msg: '🐾 今天还没找到截图/图片错题。先在对话里发几张错题截图，我就能帮你批量收进错题集。' }
  }
  let added = 0
  let skipped = 0
  let failed = 0
  for (let i = 0; i < rounds.length; i++) {
    const r = rounds[i]
    let raw = String(r.src.q || '').trim()
    if (r.img && (raw.length < 15 || !extractChoices(raw).length)) {
      try {
        const ocr = await ocrImage(r.img, r.typed)
        if (ocr && ocr.text) raw = ocr.text.trim()
      } catch (e) {}
    }
    let qz = rawToQuiz(raw)
    if (!qz && r.img) qz = { stem: '（截图题目，见原图，建议配置视觉模型补充文字）', options: [], answer: '' }
    if (!qz || (qz.stem.length < 15 && !r.img)) {
      failed++
      continue
    }
    const opts = (qz.options || []).map((o) => {
      const k = String((o && o.k) || o || '')
      const t = String((o && o.t) || o || '')
      return k ? k + '. ' + t : t
    })
    const question = String(qz.stem || '').trim() + (opts.length ? '\n\n' + opts.join('\n') : '')
    if (question.length < 15 && !r.img) {
      failed++
      continue
    }
    const subject = detectBanKuai(question) || detectBanKuai(r.typed) || '判断推理'
    const aiAnswer = answerLetter(r.aiText)
    const answer = qz.answer || aiAnswer
    const explain = explainFrom(r.aiText)
    const wq = {
      id: Date.now() + '_' + Math.floor(Math.random() * 100000),
      subject,
      question: question || '（截图题目，见原图）',
      imgs: r.img ? [r.img] : [],
      answer: answer ? '正确答案 ' + answer : '',
      your: '',
      reasons: ['对话中发图提问的错题（萌宠批量整理）'],
      explain,
      note: answer ? '已自动提取对话回复中的正确答案' : '由今日对话截图批量整理，答案如未识别请复核后补填',
      time: new Date().toLocaleString(),
      at: Date.now(),
      wrongCount: 1,
      correctStreak: 0,
      mastery: 0,
      digested: false
    }
    const res = addWrong(wq, { chatWrong: true, silent: true })
    if (res.ok && !res.dup) added++
    else if (res.dup) skipped++
    else failed++
  }
  saveWqs()
  let msg = '🐾 今天找到 ' + rounds.length + ' 条截图/图片错题，成功加入错题集 ' + added + ' 条'
  if (skipped) msg += '（' + skipped + ' 条已在错题集，自动跳过）'
  if (failed) msg += '（' + failed + ' 条内容不完整未加入）'
  msg += '。去错题集里核对题目和答案吧～'
  return { ok: true, count: added, total: rounds.length, msg }
}

export function petTodayScreenshotTip() {
  const msgs = Array.isArray(store.msgs) ? store.msgs : []
  const today = todayStr()
  const n = msgs.filter((m) => m && m.role === 'user' && m.t && todayStr(new Date(Number(m.t))) === today &&
    ((m.content && Array.isArray(m.content.imgs) && m.content.imgs.length) || (m._curImgRead && m._curImgRead.length))).length
  return n
}
