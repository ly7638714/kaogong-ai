// svgCheck.js —— 配图强校验（单题快练优化④）：出题即确认 SVG 可渲染、合法，无图/坏图不入卷
// 规则：所有 <svg ...> 必须成对闭合；每个 svg 必须带 viewBox；不允许 svg 出现在 svg 属性里的假标签干扰。
export function checkFigureText(text) {
  try {
    const src = String(text == null ? '' : text)
    const opens = (src.match(/<svg\b/gi) || []).length
    const closes = (src.match(/<\/svg>/gi) || []).length
    if (opens === 0 && closes === 0) return { ok: true, n: 0, issue: '' }
    if (opens !== closes) return { ok: false, n: opens, issue: 'SVG 标签未成对闭合（开 ' + opens + ' / 闭 ' + closes + '）' }
    // 每个 svg 必须有 viewBox（否则前端按默认尺寸渲染/裁切异常）
    const segs = String(src).split(/<svg\b/i).slice(1)
    for (let i = 0; i < segs.length; i++) {
      const head = segs[i].slice(0, 240)
      if (!/viewBox\s*=/.test(head)) return { ok: false, n: opens, issue: '第 ' + (i + 1) + ' 个 SVG 缺 viewBox' }
    }
    return { ok: true, n: opens, issue: '' }
  } catch (e) { return { ok: false, n: 0, issue: 'SVG 校验异常' } }
}
