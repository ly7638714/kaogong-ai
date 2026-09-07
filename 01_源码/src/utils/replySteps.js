// replySteps.js —— 对话分步解析（v3.8.190）：识别 AI 输出的固定小节结构
const RE_HEAD = /^##\s*(考点|题干拆解|解题步骤|干扰项|一句话小结|小结|解析|复盘)\s*$/m
export function hasStepHeadings(t) { return RE_HEAD.test(String(t || '')) }
export function countSteps(t) {
  const s = String(t || '')
  return (s.match(/^\s*(?:\d+\.|（\d+）)\s/gm) || []).length
}
export function listSections(t) {
  const s = String(t || '')
  const out = []
  const m = s.match(/^##\s*([^\n]+)$/gm) || []
  m.forEach((h) => out.push(h.replace(/^##\s*/, '').trim()))
  return out
}
