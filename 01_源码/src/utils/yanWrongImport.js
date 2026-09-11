import { extractChoices, answerLetter } from './quiz'

const QUESTION_HINT = /(这段文字|文中|作者|下列|最适合|主要说明|意在|标题|填入|接下来|理解正确|概括|主旨|关键词|划线|第\s*\d+\s*句|最可能|主要强调)/
const STOP_GRAM = /^(?:一个|一种|一些|这个|那个|这些|那些|我们|他们|它们|可以|需要|应该|不是|而是|因为|所以|如果|以及|通过|对于|关于|其中|同时|此外|然而|但是|不过|因此|可见|首先|其次|最后|进行|具有|成为|实现|发展|问题|方面|过程|情况|方式|能够|可能|主要|重要|进一步)/

function cleanText(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

function splitSentences(text) {
  return cleanText(text)
    .replace(/(^|\n)\s*第\s*\d+\s*句\s*[:：]\s*/g, '$1')
    .split(/(?<=[。！？!?；;])|\n+/)
    .map((s) => s.replace(/^[（(]?\d+[）)、.．:：]\s*/, '').trim())
    .filter((s) => s.length >= 4)
}

function parseWrongText(raw) {
  const text = cleanText(raw).replace(/(^|[\s。！？!?；;])([A-D])\s+(?=\S)/g, '$1$2. ')
  if (!text) return { sentences: [], question: '', options: [], title: '' }
  const options = extractChoices(text)
  const lines = text.split(/\n+/)
  const firstOpt = lines.findIndex((line) => /^\s*[*_`]*\s*[A-D][.、．:：]\s*/.test(line))
  let stem = firstOpt >= 0 ? lines.slice(0, firstOpt).join('\n').trim() : text
  let title = ''
  if (stem.includes('【题目】')) {
    const parts = stem.split(/【题目】/)
    const head = (parts[0] || '').replace(/【片段阅读材料】/g, '').trim()
    const tail = parts.slice(1).join('【题目】')
    stem = head + '\n' + tail
  } else {
    stem = stem.replace(/【片段阅读材料】/g, '').trim()
  }
  const rawLines = stem.split(/\n+/).map((x) => x.trim()).filter(Boolean)
  if (rawLines.length > 1 && rawLines[0].length <= 28 && !/[。！？!?；;]/.test(rawLines[0]) && /^第\s*\d+\s*句/.test(rawLines[1])) {
    title = rawLines.shift()
  }
  stem = rawLines.join('\n')
  let material = stem
  let question = ''
  const segs = splitSentences(stem)
  let qi = -1
  for (let i = segs.length - 1; i >= 0; i--) {
    if (QUESTION_HINT.test(segs[i])) { qi = i; break }
  }
  if (qi >= 0) {
    material = segs.slice(0, qi).join('')
    question = segs.slice(qi).join('')
  }
  const sentences = splitSentences(material)
  return { sentences, question: cleanText(question), options, title }
}

function topGrams(sentences) {
  const text = sentences.join('').replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '')
  const count = new Map()
  for (let n = 2; n <= 6; n++) {
    for (let i = 0; i + n <= text.length; i++) {
      const g = text.slice(i, i + n)
      if (STOP_GRAM.test(g)) continue
      if (/^(.)\1+$/.test(g)) continue
      count.set(g, (count.get(g) || 0) + 1)
    }
  }
  return [...count.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] * b[0].length - a[1] * a[0].length)
    .map(([g]) => g)
}

function guessRole(sentence, i, total) {
  const s = String(sentence || '')
  if (/然而|但是|不过|事实上|其实|相反/.test(s)) return '转折立论：先呈现旧认知/局限，再亮出真实观点'
  if (/因此|所以|可见|总之|归根结底|最终/.test(s)) return '结论总结：收束全文，重申/升华中心'
  if (/应当|应该|需要|必须|要求|对策|措施|关键在于/.test(s)) return '对策措施：针对前文问题提出可执行做法'
  if (/例如|比如|调查|数据显示|研究表明|举例/.test(s)) return '例证支撑：用例子证明前文观点或补充细节'
  if (/因为|由于|原因|根源/.test(s)) return '原因分析：解释问题、现象或观点产生的原因'
  if (i === 0) return '背景引入：交代对象或现象，为后文铺垫'
  if (i === total - 1) return '结论总结：收束全文，重申/升华中心'
  return '过渡衔接：承上启下，把前文引向新话题'
}

function guessStructure(sentences) {
  const text = sentences.join('')
  if (/然而|但是|不过|事实上|其实/.test(text)) return '转折结构：转折词前是铺垫，转折后为重点'
  if (/因此|所以|可见|总之/.test(text)) return '因果结构：原因/现象在前，结论在后'
  if (/应当|应该|需要|必须|对策|措施/.test(text)) return '问题—对策结构：先摆问题，后给对策，对策是重心'
  if (/同时|此外|另一方面|与此同时/.test(text)) return '并列结构：多个方面无主次，主旨需全部兼顾'
  return '总分结构：首句总起观点，后文分述支撑'
}

export function isYanWrong(wq) {
  const s = String((wq && (wq.subject || wq.plate)) || '')
  const sub = String((wq && (wq.subx || wq.sub || wq.variant)) || '')
  return /言语理解|片段阅读|篇章阅读|逻辑填空|语句表达|中心理解|细节判断/.test(s + ' ' + sub)
}

export function buildYanTrainingFromWrong(wq) {
  const raw = String((wq && (wq.question || wq.q || wq.stem)) || '')
  const parsed = parseWrongText(raw)
  if (!parsed.sentences.length) return { ok: false, error: '这道错题没有可用的完整文段' }
  if (parsed.options.length < 2) return { ok: false, error: '这道错题缺少完整选项，无法按原题复练' }
  const grams = topGrams(parsed.sentences)
  const theme = grams[0] || parsed.title || '核心话题'
  const keywords = grams.slice(0, 4)
  const roles = parsed.sentences.map((s, i) => guessRole(s, i, parsed.sentences.length))
  const last = parsed.sentences[parsed.sentences.length - 1] || ''
  const question = parsed.question || '这段文字主要强调（　）。'
  const paper = {
    id: 'wrong_' + String((wq && wq.id) || Date.now()),
    sourceWrong: true,
    domain: '错题联动',
    title: parsed.title || String((wq && (wq.subx || wq.subject)) || '言语理解错题'),
    theme,
    keywords,
    structureLabel: guessStructure(parsed.sentences),
    sentences: parsed.sentences,
    roles,
    mainIdea: last,
    intent: question || last,
    signal: (parsed.sentences.join('').match(/然而|但是|不过|因此|所以|应当|应该|需要|同时|此外|例如|比如/g) || []).slice(0, 5).join('、'),
    difficulty: 'entry',
    difficultyT: '📌 错题原题',
    sentCount: parsed.sentences.length,
    charCount: parsed.sentences.join('').length,
    hiddenMeta: false,
    obscure: false,
    levelRange: '错题原文'
  }
  const answer = answerLetter((wq && wq.answer) || '') || String((wq && wq.answer) || '').match(/[A-D]/i)?.[0]?.toUpperCase() || ''
  const questionOut = {
    mode: 'imported',
    kind: 'imported',
    q: question,
    options: parsed.options.slice(0, 4),
    answer,
    seed: 0,
    explain: String((wq && (wq.explain || wq.analysis)) || ''),
    tip: '先用原题复练，再切到四步拆解：主题词 → 句子功能 → 行文结构 → 主旨意图。',
    modeInfo: { k: 'imported', t: '📌 错题原题复练', d: '由错题集言语理解错题完整导入' },
    modeT: '📌 错题原题复练',
    imported: true
  }
  return { ok: true, paper, question: questionOut }
}

export default { isYanWrong, buildYanTrainingFromWrong }
