// calcProtocol.js —— 数值题「可算必验」协议（深化，纯函数可单测）
// 数量关系 / 资料分析 解题型回复要求：先算式 → 代入 → 结果，另起一行输出
// 【验算】算式=数值 —— 与 verifyCalc.calcRecheck 的扫描格式对接，供本地复核。
export function calcVerifySys(plate6, query = '', intent = '') {
  const p = String(plate6 || '')
  if (p !== '数量关系' && p !== '资料分析') return ''
  const q = String(query || '')
  const it = String(intent || '')
  // 概念/定义类提问不要求验算
  if (/(是什么|什么意思|什么叫|定义|概念|区别|怎么区分)/.test(q)) return ''
  // 出题/秒杀等非完整数值求解也不强加
  if (/出题|出一道|让我做|直接选|只秒杀|一句话/.test(q) || it === '出题' || it === '概念' || it === '只秒杀') return ''
  return '\n【数值题·可算必验】本题属' + p + '，凡最终给出数值答案：① 先写出算式（只用数字与 + - × ÷ ( ) ，可用 ≈）；② 代入数据算出结果；③ 另起一行输出【验算】算式=数值（示例：【验算】120×3÷4=90）。若题干数据不足无法计算，明确说明缺哪个数据，不要硬算或编数。'
}
export default calcVerifySys
