// 知识卡全库审计脚本（复用）：检测 schema 完整性 / id 唯一 / 复制块(疑似错位或泛化) / 板块计数
import { pathToFileURL } from 'url'
import fs from 'fs'

const KB = 'E:/公务员备考资料/行测/kaogong-review-skill-main/01_源码/src/kb'
const FILES = ['cards-panduan', 'cards-yanyu', 'cards-ziliao', 'cards-shuliang', 'cards-changshi', 'cards-zhengzhi']

const ALL = { cards: [], memory: [] }
for (const f of FILES) {
  const mod = await import(pathToFileURL(KB + '/' + f + '.js').href)
  for (const c of mod.CARDS) { c._file = f; ALL.cards.push(c) }
  for (const m of mod.MEMORY) { ALL.memory.push({ ...m, _file: f }) }
}

const plates = [...new Set(ALL.cards.map(c => c.plate))]
const counts = {}
for (const p of plates) counts[p] = { cards: ALL.cards.filter(c => c.plate === p).length, mem: ALL.memory.filter(m => m.plate === p).length }

// schema 问题
const schemaIssues = []
const idMap = {}
for (const c of ALL.cards) {
  if (idMap[c.id]) schemaIssues.push('重复id: ' + c.id + ' @ ' + c._file)
  idMap[c.id] = true
  const need = ['id', 'plate', 'type', 'source']
  for (const k of need) if (!c[k]) schemaIssues.push(c.id + ' 缺 ' + k)
  if (!Array.isArray(c.signs) || c.signs.length < 3) schemaIssues.push(c.id + ' signs<3 (' + (c.signs||[]).length + ')')
  if (!Array.isArray(c.steps) || c.steps.length < 3) schemaIssues.push(c.id + ' steps<3 (' + (c.steps||[]).length + ')')
  if (!Array.isArray(c.traps) || c.traps.length < 3) schemaIssues.push(c.id + ' traps<3 (' + (c.traps||[]).length + ')')
  const ex = c.example
  if (!ex || !ex.q || !Array.isArray(ex.opts) || ex.opts.length < 2 || !ex.answer || !ex.path) schemaIssues.push(c.id + ' example 不完整')
  else {
    const letters = ex.opts.map(o => String(o).trim()[0]).join('')
    if (!letters.includes(String(ex.answer).trim()[0])) schemaIssues.push(c.id + ' answer 不在 opts: ' + ex.answer)
  }
}

// 复制块分析：steps 完全相同 & traps 完全相同
function sig(arr) { return Array.isArray(arr) ? JSON.stringify(arr) : '(非数组)' }
const stepGroups = {}, trapGroups = {}
for (const c of ALL.cards) {
  const sk = sig(c.steps); const tk = sig(c.traps)
  ;(stepGroups[sk] = stepGroups[sk] || []).push(c)
  ;(trapGroups[tk] = trapGroups[tk] || []).push(c)
}
const multiStep = Object.values(stepGroups).filter(g => g.length > 1)
const multiTrap = Object.values(trapGroups).filter(g => g.length > 1)

// 每卡：处于多少个多人 steps 块 / traps 块；块内不同 type 数
const cardBlock = {}
for (const g of multiStep) {
  const types = new Set(g.map(c => c.type))
  for (const c of g) {
    cardBlock[c.id] = cardBlock[c.id] || { stepBlocks: 0, stepBlockTypes: new Set(), trapBlocks: 0 }
    cardBlock[c.id].stepBlocks++
    for (const t of types) cardBlock[c.id].stepBlockTypes.add(t)
  }
}
for (const g of multiTrap) {
  const types = new Set(g.map(c => c.type))
  for (const c of g) {
    cardBlock[c.id] = cardBlock[c.id] || { stepBlocks: 0, stepBlockTypes: new Set(), trapBlocks: 0 }
    cardBlock[c.id].trapBlocks++
    for (const t of types) cardBlock[c.id].stepBlockTypes.add(t)
  }
}

const suspects = ALL.cards
  .filter(c => cardBlock[c.id])
  .map(c => ({
    id: c.id, file: c._file, plate: c.plate, type: c.type, source: c.source,
    signs: c.signs, steps: c.steps, traps: c.traps, example: c.example, tip: c.tip,
    stepBlocks: cardBlock[c.id].stepBlocks,
    trapBlocks: cardBlock[c.id].trapBlocks,
    typesInBlocks: [...cardBlock[c.id].stepBlockTypes].slice(0, 8)
  }))
  .sort((a, b) => (b.stepBlocks + b.trapBlocks) - (a.stepBlocks + a.trapBlocks))

const summary = {
  totalCards: ALL.cards.length,
  totalMemory: ALL.memory.length,
  counts,
  uniqueIds: Object.keys(idMap).length,
  schemaIssues: schemaIssues.length,
  schemaIssueSample: schemaIssues.slice(0, 30),
  multiStepBlockCount: multiStep.length,
  multiTrapBlockCount: multiTrap.length,
  maxSharedStep: Math.max(...multiStep.map(g => g.length), 0),
  suspectCards: suspects.length,
  suspectByFile: {},
  largestSuspectBlocks: multiStep.map(g => ({ len: g.length, types: [...new Set(g.map(c=>c.type))].slice(0,6), members: g.map(c=>c.id+'|'+c.type).slice(0,8) })).sort((a,b)=>b.len-a.len).slice(0, 20)
}
for (const s of suspects) summary.suspectByFile[s.file] = (summary.suspectByFile[s.file] || 0) + 1

const out = { summary, suspects }
fs.writeFileSync('E:/公务员备考资料/行测/kaogong-review-skill-main/_kb_audit.json', JSON.stringify(out, null, 1))
console.log(JSON.stringify(summary, null, 1))
console.log('---- 最大 steps 复制块 TOP10 ----')
for (const b of summary.largestSuspectBlocks.slice(0, 10)) {
  console.log('size=' + b.len + ' types=' + b.types.join('/') + '\n  ' + b.members.join('\n  '))
}
