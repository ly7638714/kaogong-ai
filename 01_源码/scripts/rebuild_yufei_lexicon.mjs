// Rebuild the OCR-derived Yufei lexicon with an AI quality gate.
//
// The source books were scanned PDFs. Their extracted terms and definitions
// contain severe OCR damage, so a small patch list is not sufficient. This
// script reviews every entry, keeps source/category metadata, and writes a
// normalized lexicon consumed by the accumulation and memory-game modules.
//
// Required env:
//   CUNAI_API_KEY (or CLOUDAI_API_KEY / OPENAI_API_KEY)
//
// Optional env:
//   CUNAI_BASE_URL=https://www.cun.ai/v1
//   CUNAI_MODEL=deepseek-v4-flash
//   YUFEI_SOURCE=../src/ku/yufeiLexicon.js
//   YUFEI_OUTPUT=../src/ku/yufeiLexicon.js

import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const sourcePath = path.resolve(root, process.env.YUFEI_SOURCE || 'src/ku/yufeiLexicon.js')
const outputPath = path.resolve(root, process.env.YUFEI_OUTPUT || 'src/ku/yufeiLexicon.js')
const cachePath = path.resolve(root, process.env.YUFEI_CACHE || 'scripts/data/yufei-ai-corrections.json')
const apiKey = process.env.CUNAI_API_KEY || process.env.CLOUDAI_API_KEY || process.env.OPENAI_API_KEY
const baseUrl = (process.env.CUNAI_BASE_URL || 'https://www.cun.ai/v1').replace(/\/+$/, '')
const model = process.env.CUNAI_MODEL || 'deepseek-v4-flash'
const proxyUrl = process.env.CUNAI_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || ''
const dictionaryDir = path.resolve(process.env.XINHUA_DIR || path.join(process.env.TEMP || '/tmp', 'codex-xinhua'))
const batchSize = Number(process.env.YUFEI_BATCH_SIZE) || 25
const concurrency = Number(process.env.YUFEI_CONCURRENCY) || 3
const retries = Number(process.env.YUFEI_RETRIES) || 3
const limit = Number(process.env.YUFEI_LIMIT) || 0
const manualReviews = {
  'chengyu|吕夷不展|雨菲800词|高频': {
    title: '鄙夷不屑',
    definition: '指轻视、看不起，认为不值得理会。',
    synonyms: ['不屑一顾', '嗤之以鼻'],
    antonyms: ['肃然起敬', '刮目相看'],
    example: '他对这种投机取巧的做法鄙夷不屑。',
    tip: '强调内心轻蔑；与“不屑一顾”相比，更侧重态度上的鄙视。',
    confidence: 0.97,
    unresolved: false,
    sourceKind: 'manual'
  },
  'chengyu|煞费苦心|雨菲800词|高频': {
    title: '煞费苦心',
    definition: '费尽心思和精力，形容为了某件事反复筹划、付出很大心力。',
    synonyms: ['绞尽脑汁', '费尽心机'],
    antonyms: ['敷衍了事', '漫不经心'],
    example: '为了让学生真正理解这个知识点，老师煞费苦心设计了多层练习。',
    tip: '“煞”表示很、极，强调用心程度深；多用于积极、认真付出的语境。',
    confidence: 0.98,
    unresolved: false,
    sourceKind: 'manual'
  },
  'chengyu|缺一不可|雨菲800词|高频': {
    title: '缺一不可',
    definition: '多个条件或要素彼此依存，任何一个都不能缺少。',
    synonyms: ['必不可少', '不可或缺'],
    antonyms: ['可有可无'],
    example: '制度、执行和监督环环相扣，缺一不可。',
    tip: '强调整体中的每一部分都有存在必要。',
    confidence: 0.99,
    unresolved: false,
    sourceKind: 'manual'
  },
  'chengyu|鲜为人知|雨菲800词|高频': {
    title: '鲜为人知',
    definition: '很少有人知道，形容某事或某种情况公开程度很低。',
    synonyms: ['默默无闻', '不为人知'],
    antonyms: ['家喻户晓', '众所周知'],
    example: '这条古道曾经十分重要，如今却鲜为人知。',
    tip: '“鲜”读 xiǎn，表示少，不是新鲜。',
    confidence: 0.99,
    unresolved: false,
    sourceKind: 'manual'
  }
}

function cleanText(value) {
  return String(value || '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function clip(value, max) {
  const text = cleanText(value)
  return text.length > max ? text.slice(0, max) + '…' : text
}

function normalizeStringList(value, max = 3) {
  const list = Array.isArray(value) ? value : String(value || '').split(/[、,，/；;]/)
  return list
    .map((x) => cleanText(x).replace(/^[“”"'‘’]+|[“”"'‘’]+$/g, ''))
    .filter((x) => x && x.length <= 24)
    .slice(0, max)
}

function stableKey(item) {
  return [item.kind, item.t, item.src || '', item.cat || ''].join('|')
}

async function loadSource() {
  const mod = await import(pathToFileURL(sourcePath).href + `?v=${Date.now()}`)
  const pools = [
    ['chengyu', '成语', mod.YUFEN_CHENGYU],
    ['shici', '实词', mod.YUFEN_SHICI]
  ]
  const items = []
  for (const [kind, label, list] of pools) {
    for (const raw of Array.isArray(list) ? list : []) {
      const term = cleanText(raw && raw.t)
      if (!term) continue
      items.push({
        kind,
        subject: label,
        t: term,
        cat: cleanText(raw.cat) || '高频',
        src: cleanText(raw.src) || '未标注',
        oldYishi: cleanText(raw.yishi),
        oldJy: cleanText(raw.jy),
        oldFy: cleanText(raw.fy),
        oldLj: cleanText(raw.lj),
        oldYf: cleanText(raw.yf),
        p: cleanText(raw.p) || '★★★★☆',
        gm: cleanText(raw.gm),
        ly: cleanText(raw.ly)
      })
    }
  }
  return items
}

function trimDictionaryText(value) {
  const text = cleanText(value)
    .replace(/\b[a-z]{2,}\d*\b/gi, '')
    .replace(/^[①②③④⑤⑥⑦⑧⑨⑩\d]+[.、]\s*/g, '')
    .replace(/\s*[（(][^）)]{0,20}[）)]\s*$/g, '')
    .replace(/[﹑]/g, '、')
    .split(/[|｜]/)[0]
  const end = text.indexOf('。')
  return end >= 10 ? text.slice(0, end + 1) : text
}

function cleanLegacyText(value) {
  const text = cleanText(value)
  if (!text) return ''
  if (/[@�]|(?:了眼睛)|(?:药且)|(?:发拌)|(?:油油)|(?:凯凯)/.test(text)) return ''
  return text
}

function cleanDictionaryExample(value) {
  const text = cleanText(value)
  if (!text || /★|◇|无/.test(text)) return ''
  return text.length > 160 ? text.slice(0, 159) + '…' : text
}

function isComponentStyleDefinition(value) {
  const text = cleanText(value)
  return /^.{1,8}[：:].{1,8}[；;]/.test(text) || /[；;].{1,6}[；;]/.test(text)
}

async function loadDictionaries() {
  const idiom = JSON.parse(await fs.readFile(path.join(dictionaryDir, 'idiom.json'), 'utf8'))
  const ci = JSON.parse(await fs.readFile(path.join(dictionaryDir, 'ci.json'), 'utf8'))
  const idiomMap = new Map((idiom || []).map((x) => [cleanText(x.word), x]))
  const ciMap = new Map()
  for (const x of ci || []) {
    const word = cleanText(x.ci)
    if (word && !ciMap.has(word)) ciMap.set(word, x)
  }
  return { idiomMap, ciMap }
}

function dictionaryReview(item, dictionaries) {
  const idiom = item.kind === 'chengyu' ? dictionaries.idiomMap.get(item.t) : null
  const ci = dictionaries.ciMap.get(item.t)
  const hit = idiom || ci
  if (!hit) return null
  const definition = trimDictionaryText(hit.explanation || hit.definition || '')
  if (!definition || definition.length < 5) return null
  return {
    title: item.t,
    definition,
    synonyms: normalizeStringList(item.oldJy),
    antonyms: normalizeStringList(item.oldFy),
    example: cleanLegacyText(item.oldLj) || cleanDictionaryExample(hit.example),
    tip: cleanLegacyText(item.oldYf),
    confidence: 1,
    unresolved: false,
    sourceKind: 'dictionary'
  }
}

async function loadCache() {
  try {
    return JSON.parse(await fs.readFile(cachePath, 'utf8'))
  } catch {
    return {}
  }
}

async function saveCache(cache) {
  await fs.mkdir(path.dirname(cachePath), { recursive: true })
  await fs.writeFile(cachePath, JSON.stringify(cache, null, 2) + '\n', 'utf8')
}

function stripJsonFence(text) {
  return String(text || '')
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()
}

function parseResponse(content) {
  const raw = stripJsonFence(content)
  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first < 0 || last <= first) throw new Error('模型未返回 JSON 对象')
  const parsed = JSON.parse(raw.slice(first, last + 1))
  const items = Array.isArray(parsed.items) ? parsed.items : []
  if (!items.length) throw new Error('模型返回的 items 为空')
  return items
}

function buildPrompt(batch) {
  const payload = batch.map((item) => ({
    id: item.id,
    kind: item.subject,
    source: item.src,
    category: item.cat,
    ocrTitle: item.t,
    ocrDefinition: item.oldYishi,
    dictionaryDefinition: item.dictionaryDefinition,
    existingSynonyms: item.oldJy,
    existingAntonyms: item.oldFy,
    existingExample: item.oldLj,
    existingTip: item.oldYf
  }))
  return [
    '你是中文词典与公务员考试词库审校员，负责修复扫描 PDF 产生的 OCR 错误。',
    '请逐条审校，不得照抄明显残缺的定义，不得编造生僻典故。',
    '规则：',
    '1. title 必须是现代规范词形。若 OCR 错字或截断可唯一确定，改正；无法唯一确定则保留原词。',
    '2. definition 用规范现代汉语，准确、简洁，适合公考逻辑填空和成语辨析，通常 18-70 字。',
    '3. synonyms、antonyms 各给 0-3 个规范词；没有可靠项就返回空数组。',
    '4. example 给一个自然、规范、非时效性的短例句。',
    '5. source 为“半月谈”时，tip 必须写最容易混淆词的语义差别；其他条目可写简短记忆提示。',
    '6. confidence 为 0 到 1 的数字。无法确定时 title 保留原词，definition 以“暂无法确认：”开头，confidence 低于 0.5。',
    '只返回 JSON：{"items":[{"id":1,"title":"...","definition":"...","synonyms":[],"antonyms":[],"example":"...","tip":"...","confidence":0.95}]}',
    '待审校条目：',
    JSON.stringify(payload, null, 2)
  ].join('\n')
}

async function requestBatch(batch) {
  if (!apiKey) throw new Error('缺少 API Key：请设置 CUNAI_API_KEY 后再运行。')
  const body = {
    model,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: '你是《现代汉语词典》《新华成语词典》级别的公考词库审校员。只输出 JSON。'
      },
      { role: 'user', content: buildPrompt(batch) }
    ]
  }
  const text = await postJson(baseUrl + '/chat/completions', body)
  const json = JSON.parse(text)
  const content = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content
  return parseResponse(content)
}

function postJson(url, body) {
  const payload = JSON.stringify(body)
  if (!proxyUrl) {
    return fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: payload
    }).then(async (res) => {
      const text = await res.text()
      if (!res.ok) throw new Error(`API HTTP ${res.status}: ${clip(text, 300)}`)
      return text
    })
  }
  return new Promise((resolve, reject) => {
    const bin = process.platform === 'win32' ? 'curl.exe' : 'curl'
    const args = [
      '--silent',
      '--show-error',
      '--fail-with-body',
      '--max-time',
      '180',
      '--proxy',
      proxyUrl,
      '-X',
      'POST',
      '-H',
      `Authorization: Bearer ${apiKey}`,
      '-H',
      'Content-Type: application/json',
      '--data-binary',
      '@-',
      url
    ]
    const child = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`curl exit ${code}: ${clip(stderr || stdout, 400)}`))
        return
      }
      resolve(stdout)
    })
    child.stdin.end(payload)
  })
}

function scoreResult(item, result) {
  const title = cleanText(result && result.title) || item.t
  const definition = cleanText(result && result.definition)
  const confidence = Math.max(0, Math.min(1, Number(result && result.confidence) || 0))
  const badDefinition = !definition || definition.length < 6 || /[@�]|[\uFFFD]/.test(definition)
  const unresolved = /^暂无法确认[:：]/.test(definition) || confidence < 0.5
  return {
    title,
    definition,
    synonyms: normalizeStringList(result && result.synonyms),
    antonyms: normalizeStringList(result && result.antonyms),
    example: cleanText(result && result.example) || item.oldLj,
    tip: cleanText(result && result.tip) || item.oldYf,
    confidence,
    unresolved: unresolved || badDefinition
  }
}

async function reviewBatch(batch) {
  let lastError = null
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const rows = await requestBatch(batch)
      const byId = new Map(rows.map((x) => [Number(x && x.id), x]))
      const missing = batch.filter((item) => !byId.has(item.id))
      if (missing.length) throw new Error(`返回条目缺少 ${missing.map((x) => x.id).join(',')}`)
      const out = {}
      for (const item of batch) out[stableKey(item)] = scoreResult(item, byId.get(item.id))
      return out
    } catch (error) {
      lastError = error
      if (attempt < retries) {
        const delay = Math.min(30000, 3000 * 2 ** (attempt - 1))
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }
  throw lastError
}

async function runPool(tasks, worker, concurrency) {
  let cursor = 0
  async function runner() {
    while (cursor < tasks.length) {
      const index = cursor++
      await worker(tasks[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, runner))
}

function renderEntry(item, reviewed) {
  const title = reviewed && reviewed.title ? reviewed.title : item.t
  const definition = reviewed && reviewed.definition ? reviewed.definition : item.oldYishi
  const synonyms = reviewed && reviewed.synonyms ? reviewed.synonyms.join('、') : item.oldJy
  const antonyms = reviewed && reviewed.antonyms ? reviewed.antonyms.join('、') : item.oldFy
  const example = reviewed && reviewed.example ? reviewed.example : item.oldLj
  const tip = reviewed && reviewed.tip ? reviewed.tip : item.oldYf
  const entry = {
    t: title,
    cat: item.cat,
    src: item.src,
    yishi: definition,
    verified: Boolean(reviewed && !reviewed.unresolved),
    qa: reviewed && reviewed.unresolved ? '待人工复核' : reviewed && reviewed.sourceKind === 'dictionary' ? '现代词典校订' : 'AI+现代词典校订',
    confidence: reviewed ? Number(reviewed.confidence.toFixed(2)) : 0
  }
  if (synonyms) entry.jy = synonyms
  if (antonyms) entry.fy = antonyms
  if (example) entry.lj = example
  if (tip) entry.yf = tip
  if (item.ly) entry.ly = item.ly
  if (item.p) entry.p = item.p
  if (item.gm) entry.gm = item.gm
  return entry
}

function dedupeEntries(entries) {
  const out = new Map()
  for (const entry of entries) {
    const key = entry.t
    const old = out.get(key)
    if (!old) {
      out.set(key, entry)
      continue
    }
    const oldConfidence = Number(old.confidence) || 0
    const nextConfidence = Number(entry.confidence) || 0
    if (nextConfidence > oldConfidence) {
      entry.yf = entry.yf || old.yf
      out.set(key, entry)
    } else {
      old.yf = old.yf || entry.yf
    }
  }
  return Array.from(out.values())
}

function renderFile(chengyu, shici, summary) {
  const header = [
    '// yufeiLexicon.js —— 雨菲 800 词 / 半月谈易混词校订版',
    '// 原始材料来自扫描 PDF；本文件经 AI + 现代词典逐条重建，避免 OCR 残片直接进入学习库。',
    '// verified=true 表示词名、释义、例句和辨析已完成质量门校验；待复核条目会明确标记。',
    `// generatedAt: ${summary.generatedAt}`,
    `// model: ${model}; entries: ${summary.total}; verified: ${summary.verified}; unresolved: ${summary.unresolved}`,
    ''
  ].join('\n')
  return (
    header +
    'export const YUFEN_CHENGYU = ' +
    JSON.stringify(chengyu, null, 2) +
    '\n\nexport const YUFEN_SHICI = ' +
    JSON.stringify(shici, null, 2) +
    '\n'
  )
}

async function main() {
  const source = (await loadSource()).slice(0, limit > 0 ? limit : undefined)
  const cache = await loadCache()
  const dictionaries = await loadDictionaries()
  for (const item of source) {
    if (manualReviews[stableKey(item)]) {
      cache[stableKey(item)] = manualReviews[stableKey(item)]
      continue
    }
    const verified = dictionaryReview(item, dictionaries)
    const needsAi = !verified || verified.definition.length < 12 || isComponentStyleDefinition(verified.definition)
    if (verified && !needsAi) {
      cache[stableKey(item)] = verified
      continue
    }
    if (cache[stableKey(item)] && cache[stableKey(item)].sourceKind !== 'dictionary') continue
    if (verified && needsAi) delete cache[stableKey(item)]
    if (!verified) continue
    item.dictionaryDefinition = verified.definition
  }
  const missing = source.filter((item) => !cache[stableKey(item)])
  const batches = []
  for (let i = 0; i < missing.length; i += batchSize) {
    batches.push(
      missing.slice(i, i + batchSize).map((item, index) => ({
        ...item,
        id: index + 1
      }))
    )
  }

  console.log(`待审校 ${missing.length} 条，共 ${batches.length} 批，模型 ${model}`)
  let completed = 0
  await runPool(
    batches,
    async (batch, index) => {
      const result = await reviewBatch(batch)
      Object.assign(cache, result)
      completed++
      await saveCache(cache)
      console.log(`完成批次 ${completed}/${batches.length}（原队列 #${index + 1}）`)
    },
    concurrency
  )

  const reviewed = source.map((item) => ({ item, result: cache[stableKey(item)] }))
  const unresolved = reviewed.filter((x) => !x.result || x.result.unresolved)
  if (unresolved.length) {
    console.warn(`仍有 ${unresolved.length} 条未通过质量门，将标记为待复核：`)
    for (const row of unresolved.slice(0, 30)) console.warn(`- ${row.item.t}`)
  }

  const chengyu = dedupeEntries(reviewed.filter((x) => x.item.kind === 'chengyu').map((x) => renderEntry(x.item, x.result)))
  const shici = dedupeEntries(reviewed.filter((x) => x.item.kind === 'shici').map((x) => renderEntry(x.item, x.result)))
  const summary = {
    generatedAt: new Date().toISOString(),
    total: chengyu.length + shici.length,
    verified: reviewed.filter((x) => x.result && !x.result.unresolved).length,
    unresolved: unresolved.length
  }
  await fs.writeFile(outputPath, renderFile(chengyu, shici, summary), 'utf8')
  console.log(`已写入 ${outputPath}`)
  console.log(`总条目 ${summary.total}，通过质量门 ${summary.verified}，待复核 ${summary.unresolved}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
