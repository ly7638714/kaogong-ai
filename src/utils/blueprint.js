// blueprint.js —— 真题蓝本 RAG（35号批次5：默认关·设置项开启·零新增默认 API 调用）
// 检索源：public/zhenti/kpoint-index.json（构建脚本 scripts/buildZhentiIndex.mjs，3583 题骨架索引）。
// 用法：出题时按 (板块, 题型) 检索 2-3 道真题作 few-shot「只学结构不照抄」；并对生成题做 12 字连续重合检测（确定性零 API）。
// 红线：默认关（store.cfg.blueprintRag），开启后每次出题 +0.4~0.7k token，属可选 AI 功能需设置项可见（doc 35 §3.4/§6）。

const INDEX_URL = './zhenti/kpoint-index.json'
let _indexPromise = null
export function loadBlueprintIndex() {
  if (!_indexPromise) {
    _indexPromise = fetch(INDEX_URL).then((r) => { if (!r.ok) throw new Error('index load fail'); return r.json() }).catch((e) => { _indexPromise = null; throw e })
  }
  return _indexPromise
}
export function clearBlueprintIndexCache() { _indexPromise = null }

function normS(s) { return String(s || '').replace(/\s+/g, '').replace(/[【】（）()“”‘’《》，。、；：?!？.…·-]/g, '') }
// 变体→检索关键词（对齐常见题型名；命中不了就退化到板块内均匀抽样）
function keysOf(variant) { return String(variant || '').split(/[/、]|·/).map((x) => x.trim()).filter((x) => x.length >= 2) }

// 在索引里检索某板块的蓝本候选：score = 题型名精确/包含匹配优先，其次板块内按 (paper,n) 稳定抽样
export function retrieveBlueprint(index, plate, variant, count = 2, limit = 2000) {
  const idx = index && index.qs ? index.qs : []
  const list = idx.filter((q) => q.pl === plate).slice(0, limit)
  const ks = keysOf(variant)
  const scored = []
  list.forEach((q) => {
    let sc = 0
    const ty = String(q.ty || '')
    ks.forEach((k) => { if (ty === k) sc += 3; else if (ty.includes(k) || k.includes(ty)) sc += 2 })
    scored.push({ q, sc })
  })
  const hit = scored.filter((x) => x.sc > 0).sort((a, b) => b.sc - a.sc || a.q.p.localeCompare(b.q.p) || a.q.n - b.q.n)
  const rest = scored.filter((x) => x.sc === 0).sort((a, b) => a.q.p.localeCompare(b.q.p) || a.q.n - b.q.n)
  const pool = hit.length >= count ? hit : hit.concat(rest)
  const out = []
  for (let i = 0; i < Math.min(count, pool.length); i++) { const q = pool[i].q; out.push({ paper: q.p, n: q.n, plate: q.pl, s: q.s }) }
  return out
}

// few-shot 片段：只给骨架提示，明确禁止照抄
export function blueprintPrompt(plate, variant, entries) {
  const list = (entries || []).map((e, i) => (i + 1) + '.（' + e.paper + ' #' + e.n + '）' + String(e.s || '').slice(0, 130) + '…').join('\n')
  return '【真题蓝本（仅学命题结构，严禁照抄）】本考点近年真题参考骨架：\n' + list + '\n要求：只借鉴其考点切入、干扰项结构与问法骨架；素材/数字/场景/表述必须全新，题干与原题不得出现连续 12 字相同（程序会检测，违规判重出）。'
}

// 生成题干与蓝本重合检测：12 字连续片段命中即视为照抄（确定性，零 API）
export function copyIssue(generatedStem, entries) {
  const g = normS(generatedStem)
  if (!g || !entries || !entries.length) return null
  for (const e of entries) {
    const s = String(e.s || '').replace(/\s+/g, '')
    if (!s) continue
    const grams = new Set()
    for (let i = 0; i + 12 <= s.length; i++) grams.add(s.slice(i, i + 12))
    for (let i = 0; i + 12 <= g.length; i++) { if (grams.has(g.slice(i, i + 12))) return e.paper + '#' + e.n }
  }
  return null
}

export default { loadBlueprintIndex, retrieveBlueprint, blueprintPrompt, copyIssue, clearBlueprintIndexCache }
