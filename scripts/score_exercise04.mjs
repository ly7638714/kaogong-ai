// score_exercise04.mjs —— 练习04 判分器：粘贴 AI 答案串即出分（含去争议口径）
// 用法: node scripts/score_exercise04.mjs "BDCBDBADABDBCACDCCCC"（忽略非 A-D 字母）
// 参考答案来自《2025花生片段阅读600题-解析》练习04（已 OCR 核对）；争议题=17/18(教材与主流口径不一致)
const KEY = ['D','D','B','C','D','B','A','D','A','B','D','C','B','C','A','D','D','C','B','D']
const CONTROVERSY = new Set([17, 18])
const arg = (process.argv[2] || '').toUpperCase().replace(/[^A-D]/g, '')
if (arg.length < 20) { console.log('需要 ≥20 个 A-D 字母；已给 ' + arg.length + ' 个'); process.exit(1) }
const ans = arg.slice(0, 20).split('')
let correct = 0, wrong = [], controversyWrong = 0
for (let i = 0; i < 20; i++) {
  const ok = ans[i] === KEY[i]
  if (ok) correct++
  else if (CONTROVERSY.has(i + 1)) controversyWrong++
  else wrong.push((i + 1) + '(AI' + ans[i] + '/答' + KEY[i] + ')')
}
const hardN = 20 - CONTROVERSY.size
const hardCorrect = correct - (CONTROVERSY.has(0) ? 0 : 0)
console.log('参考答案:', KEY.join(''))
console.log('AI作答  :', ans.join(''))
console.log('全对率: ' + correct + '/20 = ' + (correct / 20 * 100).toFixed(0) + '%')
console.log('硬性错题(非争议):', wrong.length ? wrong.join(' ') : '无')
console.log('争议题错误(17/18): ' + controversyWrong + ' 道')
console.log('去争议正确率: ' + correct + '/' + hardN + ' = ' + (correct / hardN * 100).toFixed(1) + '%')