// batchReview.js —— AI 批量复盘（深化，纯函数可单测）
// 把「当前筛选错题」批量交给 AI 做逐题复盘：每题输出 错因/一句话修正/今日动作。
// 为控制单次回复体量与可解析性，默认逐题请求（最多 BATCH_MAX 题），解析行格式：
//  第N题 | 错因 | 一句话修正 | 今日动作
export const BATCH_MAX = 20
export function capStem(t, n = 320) {
  return String(t || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n)
}
export function batchReviewSys() {
  return '你是公考行测督学教练。请针对下面这道错题做「一句话批量复盘」，严格只输出一行，用竖线分 4 段：\n' +
    '第N题 | 错因 | 一句话修正 | 今日动作\n' +
    '要求：错因具体到"错在哪一步/哪个点"（不要只写"粗心"）；一句话修正是下次看到同类题先做的动作；今日动作是一条 5-20 字可执行动作（如"重做1道削弱题""背下这组近义词""限时40秒重算"）。若信息不足就基于题干与正确答案推断，不要编造题目里没有的选项。'
}
export function batchReviewUser(q, idx) {
  const L = []
  L.push('第' + (idx + 1) + '题【' + (q.subject || '未分类') + (q.variant || q.subx ? '·' + String(q.variant || q.subx || '') : '') + '】')
  L.push('题干：' + capStem(q.question || q.q || q.stem || ''))
  const opts = Array.isArray(q.options) && q.options.length ? q.options.map((o) => (o.k || '') + '. ' + String(o.t || '').replace(/<[^>]+>/g, ' ')).join('  ') : ''
  if (opts) L.push('选项：' + opts)
  if (q.answer) L.push('正确答案：' + q.answer)
  if ((q.reasons || []).length) L.push('我的错因标签：' + q.reasons.join('、'))
  if (q.wrongCount > 1) L.push('累计错 ' + q.wrongCount + ' 次' + (q.reviewStats && q.reviewStats.e ? '（复错 ' + q.reviewStats.e + ' 次）' : ''))
  return L.join('\n')
}
// 解析一行结果：第N题 | 错因 | 修正 | 动作；解析失败返回 null
export function parseBatchLine(line) {
  const s = String(line || '').trim()
  if (!s) return null
  const m = s.match(/^\s*第?\s*(\d{1,3})\s*[题.、:：|-]\s*(.*)$/)
  let rest = m ? m[2] : s
  rest = rest.replace(/^\s*[|:：、.-]\s*/, '')
  const segs = String(rest || '').split('|').map((x) => x.trim())
  if (segs.length < 2) return null
  return {
    idx: m ? parseInt(m[1], 10) - 1 : -1,
    reason: segs[0] || '',
    fix: segs[1] || '',
    action: segs[2] || ''
  }
}
// 从整段模型回复解析多行（行首含"第N题"优先；兜底按行数顺序）
export function parseBatchText(rawText, count) {
  const out = []
  const lines = String(rawText || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  let fallback = 0
  lines.forEach((l) => {
    if (/^```/.test(l)) return
    const p = parseBatchLine(l)
    if (!p) return
    let i = p.idx >= 0 && p.idx < count ? p.idx : fallback
    if (i >= count) i = fallback
    if (i < count) out.push({ idx: i, reason: p.reason, fix: p.fix, action: p.action })
    fallback++
  })
  return out
}
// 导出用的“原题完整信息”：题干+选项+答案+错因+秒杀+笔记+解析；SVG/图占位标注（应用内可看原图/复刻）
export function qFullMd(q) {
  if (!q) return ''
  const L = []
  let text = String(q.question || q.q || q.stem || '').trim()
  text = text
    .replace(/```svg[\s\S]*?```/g, '> 【本题含图形/标注图(SVG)：请到应用错题详情查看原图/复刻】')
    .replace(/<svg[\s\S]*?<\/svg>/g, '【本题含 SVG 图】')
    .replace(/\[ECHARTS\][\s\S]*?\/\]/g, '【本题含统计图】')
    .trim()
  L.push(text)
  if (Array.isArray(q.options) && q.options.length) {
    L.push('')
    L.push(q.options.map((o) => String((o && o.k) || '') + '. ' + String((o && o.t) || o || '').replace(/<[^>]+>/g, ' ').trim()).join('\n'))
  }
  if (q.answer) L.push('', '**正确答案：**' + q.answer)
  if ((q.reasons || []).length) L.push('**错因标签：**' + q.reasons.join('、'))
  if (q.method) L.push('**秒杀：**' + q.method)
  if (q.note) L.push('**笔记/思路：**' + q.note)
  if (q.explain || q.analysis) L.push('**解析：**' + String(q.explain || q.analysis || '').replace(/<[^>]+>/g, ' ').trim())
  return L.join('\n')
}
export function batchReviewMd(rows, qs) {
  const L = ['# 🤖 AI 批量复盘报告', '', '共 ' + rows.length + ' 题 · 生成时间：' + new Date().toLocaleString() + ' · 每题含完整原题', '']
  rows.forEach((r) => {
    const q = qs[r.idx]
    if (!q) return
    L.push('## 第' + (r.idx + 1) + '题 · ' + (q.subject || '未分类') + (q.time ? ' · ' + q.time : ''))
    L.push('')
    L.push(qFullMd(q))
    L.push('')
    L.push('### 🤖 AI 复盘')
    L.push('- **错因**：' + (r.reason || '—'))
    L.push('- **一句话修正**：' + (r.fix || '—'))
    L.push('- **今日动作**：' + (r.action || '—'))
    L.push('')
  })
  return L.join('\n')
}
export default { BATCH_MAX, batchReviewSys, batchReviewUser, parseBatchText, parseBatchLine, batchReviewMd }

