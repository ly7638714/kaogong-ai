import { parseQuiz } from '../src/utils/quiz.js'
const sample = `### 📝 题目
某市近年来通过数字化手段提升基层治理效能。然而，一些地方出现"数字形式主义"，干部忙于留痕疏于留心。究其根源，并非技术本身之过，而是把数字化手段当成了目的。事实上，数字化只是基层治理的"加速器"，而非"方向盘"。
这段文字意在强调（　）。
A. 数字技术是提升基层治理效能的重要抓手
B. 数字形式主义的根源在于考核机制不科学
C. 基层治理应弱化数字技术，回归传统走访
D. 基层治理数字化需警惕形式主义，以人为本
【正确答案】D
### ✅ 答案解析
D正确：主旨句"以人为本才是标尺"同义替换。A扩大（把局部当全部）；B偷换根源；C过度引申。
### 🎯 考点
中心理解 · 高频
### ⚡ 秒杀规律
转折+结论定位主旨，干扰项看"偷换/扩大/过度"
### 📊 难度自评
真题级：长材料+2强干扰，达标
### 🧠 命题人设计说明
出题意图：考"转折后主旨+对策倾向"。A用"重要抓手"偷换"以人为本"（扩大范围）；B把"目的错位"偷换成"考核不科学"（偷换根源）；C是过度引申（极端化）。反套路点：正确项不以"对策词"面目出现，而是价值判断句。`
const q = parseQuiz(sample)
console.log('answer:', q.answer)
console.log('explain 是否含 设计说明:', q.explain.includes('命题人设计说明') || q.explain.includes('出题意图'))
console.log('designer:', q.designer ? q.designer.slice(0, 60) : 'EMPTY')
console.log('designer 长度:', q.designer.length)
console.log('stem 含问法:', q.stem.includes('这段文字意在强调'))
// liveVisible 模拟（复制逻辑）
const REVEAL_RE = /【正确答案】|###\s*✅?\s*(答案解析|解析|答案详解)|正确答案\s*[:：]|^答案\s*[:：]/m
const liveVisible = (t) => { const s = String(t || ''); const i = s.search(REVEAL_RE); return i >= 0 ? s.slice(0, i) : s }
const half = sample.slice(0, 300)
console.log('--- 流式前半段（无答案标记）---')
console.log('liveVisible 截断点存在答案?:', liveVisible(half).includes('正确答案'))
const full = liveVisible(sample)
console.log('--- 流式完整（应只到选项 D）---')
console.log('含正确答案:', full.includes('正确答案'), '| 含解析:', full.includes('答案解析'), '| 含设计说明:', full.includes('命题人设计说明'))
console.log('结尾:', full.trim().slice(-30))
