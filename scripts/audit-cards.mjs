// 卡片内容质量门禁：查重复话术/查缺真实举例（仅做审计，不会改内容）
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const here = path.dirname(fileURLToPath(import.meta.url))
const kbDir = path.resolve(process.cwd(), '01_源码/src/kb')
const files = fs.readdirSync(kbDir).filter((f) => /^cards-.+\.js$/.test(f))

const cards = []
for (const f of files) {
  const text = fs.readFileSync(path.join(kbDir, f), 'utf8')
  const blocks = text.split(/\{\s*\n?\s*id:/).slice(1)
  for (const b of blocks) {
    const id = (b.match(/^\s*'([^']+)'/) || [])[1]
    const type = (b.match(/type:\s*'([^']+)'/) || [])[1] || ''
    const tip = (b.match(/tip:\s*'([^']+)'/) || [])[1] || ''
    const detail = (b.match(/detail:\s*'([^']+)'/) || [])[1] || ''
    const exq = (b.match(/example:\s*\{\s*q:\s*'([^']+)'/) || [])[1] || ''
    const optsRaw = (b.match(/opts:\s*\[([^\]]*)\]/) || [])[1] || ''
    const opts = optsRaw ? optsRaw.split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean) : []
    const realOpts = opts.filter((o) => o && !/…|略|…$|\?{3,}/.test(o) && !/^['"ABCDabcd]['"]?$/.test(o))
    if (id) cards.push({ id, file: f, type, tip, detail, exq, opts, realOpts })
  }
}

const byTip = {}
const byDetail = {}
const dupTips = []
const dupDetails = []
for (const c of cards) {
  if (c.tip) byTip[c.tip] = (byTip[c.tip] || []).concat(c.id)
  if (c.detail) byDetail[c.detail] = (byDetail[c.detail] || []).concat(c.id)
}
for (const [k, v] of Object.entries(byTip)) if (v.length > 1) dupTips.push({ key: k, ids: v.map((x) => x.replace(/^['"]|['"]$/g, '')) })
for (const [k, v] of Object.entries(byDetail)) if (v.length > 1) dupDetails.push({ key: k, ids: v.map((x) => x.replace(/^['"]|['"]$/g, '')) })

const noRealExample = cards.filter((c) => !c.realOpts.length || !c.exq)
const hasPlaceholderOption = cards.filter((c) => c.opts.length && c.opts.some((o) => /…|略|\?{3,}/.test(o)))

console.log('总卡片数：' + cards.length)
console.log('重复 tip：' + dupTips.length)
console.log('重复 detail：' + dupDetails.length)
console.log('缺真实举例（无题干或仅A/B/C/D占位）：' + noRealExample.length)
console.log('含…/略占位选项的卡：' + hasPlaceholderOption.length)
console.log('\n缺真实举例示例：')
noRealExample.slice(0, 40).forEach((c) => console.log('  ' + c.id + ' | ' + c.type + ' | 题干=' + (c.exq ? c.exq.slice(0, 40) : '无')))
console.log('\n含占位选项的卡（前 30）：')
hasPlaceholderOption.slice(0, 30).forEach((c) => console.log('  ' + c.id + ' | ' + c.type))
