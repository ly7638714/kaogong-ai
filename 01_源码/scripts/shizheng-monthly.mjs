// 时政月度更新脚本：把联网采集的时政卡集 md → 积累页可导入的 Obsidian 格式
// ============================================================
// 月度工作流（每月1次，约15分钟）：
//  1. 联网检索当月时政（搜索词模板）：
//     「YYYY年M月 中央经济工作会议/政治局会议 要点」「YYYY 重大科技成就 盘点」
//     「YYYY年 新法施行 清单」「YYYY 重大体育赛事 中国冠军」
//     来源优先级：新华网 > 政府网 > 部委官网 > 权威媒体
//  2. 把要点整理进 03_资料/6_常识判断/时政卡集*.md（沿用【考点】【易错】【考法】三段式）
//  3. node scripts/shizheng-monthly.mjs  → 生成 时政SRS导入_YYYY-MM.md
//  4. 应用内：设置 → 💾数据 → 📥导入笔记(.md) → 选生成的文件 → 积累页SRS即可复习
// ============================================================
import fs from 'fs'
import path from 'path'

const dir = '../03_资料/6_常识判断'
const files = fs.readdirSync(dir).filter(f => f.startsWith('时政卡集') && f.endsWith('.md')).sort()
if (!files.length) { console.log('未找到时政卡集文件'); process.exit(1) }
const src = files[files.length - 1]
const raw = fs.readFileSync(path.join(dir, src), 'utf-8')

// 解析卡集：## 事件名 → 事件块（保留考点行，剥掉来源链接行）
const events = []
let cur = null
for (const line of raw.split('\n')) {
  const h = line.match(/^##\s+(.+)/)
  if (h) { cur = { title: h[1].trim().replace(/^一、|二、|三、|四、|五、|六、|七、|八、|九、|十、/, ''), facts: [] }; events.push(cur); continue }
  if (!cur) continue
  if (/^\s*来源[:：]/.test(line) || line.startsWith('---')) continue
  if (/^\s*[-*]\s|^\s*\d+[.、]\s|^\s*[【○●◆]/.test(line) || line.trim()) {
    const t = line.replace(/^\s*[-*]\s*/, '').trim()
    if (t && !t.startsWith('【易错】') && !t.startsWith('【考法】')) cur.facts.push(t.replace(/^\[考点\]\s*/, ''))
  }
}
// 生成导入md：每个事件一条笔记，正文=考点精简行
let out = '---\ntags: [时政, 常识判断]\n---\n\n'
let count = 0
for (const ev of events) {
  if (!ev.facts.length) continue
  out += '# ' + ev.title + '\n'
  ev.facts.forEach((f) => { if (f.length > 4) out += f + '\n' })
  out += '\n'
  count++
}
const stamp = new Date().toISOString().slice(0, 7)
const outFile = path.join(dir, '时政SRS导入_' + stamp + '.md')
fs.writeFileSync(outFile, out, 'utf-8')
console.log('✅ 已生成 ' + outFile)
console.log('   事件 ' + count + ' 个，来源 ' + src)
console.log('   下一步：设置→💾数据→📥导入笔记(.md)→选该文件→积累页SRS复习')
