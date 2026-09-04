// wrongText.js —— 错题文本渲染净化：先修复历史脏数据，再交给 renderMd 渲染
// ① 字面 \\n → 真换行（部分导入/导出把换行写成了反斜杠n，导致表格/围栏全部失效）
// ② 去掉空 svg 围栏与行内 ``` 残留（无图形的占位），避免把代码标记显示给用户
// ③ 去掉多余空行后交由 renderMd（表格/公式/SVG 由其统一渲染）
import { renderMd } from './renderMd'

export function normalizeRichText(t) {
  let s = String(t == null ? '' : t)
  s = s.replace(/\\n/g, '\n')
  s = s.replace(/```svg\s*```/g, '') // 空 svg 围栏
  s = s.replace(/```svg(?!\s*[\s\S]*?```)/g, '') // 无闭合的孤立 ```svg 标记（无内容图形占位）删除
  s = s.split('\n').map((l) => l.trimEnd()).join('\n')
  return s
}
export function richMd(t) {
  return renderMd(normalizeRichText(t))
}
// 保留图形与表格的清洗：只去掉“围栏外”的 HTML 标签，svg 围栏与表格换行原样保留
// （错题详情分卷、变式题干等仍需重新渲染的路径使用，避免压平表格 / 抹掉 svg）
export function cleanTextKeepFigures(t) {
  const s = normalizeRichText(t)
  const lines = s.split('\n')
  const out = []
  let inFence = false
  for (const l of lines) {
    const st = l.trim()
    const isFence = /^```/.test(st)
    if (isFence) inFence = !inFence
    if (inFence || isFence) { out.push(l); continue }
    if (st) out.push(l.replace(/<[^>]+>/g, '').replace(/[ \t]+/g, ' ').replace(/^ | $/g, ''))
    else out.push('')
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
// 纯文本预览：SVG/表格源码换成占位词，不把 ``` 记号露给用户
export function snippet(t, len) {
  let s = normalizeRichText(t)
  s = s.replace(/```svg[\s\S]*?```/g, '【图】')
  s = s.replace(/`{3,}/g, '')
  s = s.replace(/\s+/g, ' ').trim()
  return s.slice(0, Math.max(1, Number(len) || 60))
}
