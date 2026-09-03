// kbFlow —— KB 流程头抽取与总览判定（S1：分层注入，防整板块长文稀释）
// 每板块 KB 顶部第一段通常是“答题流程/底层逻辑”，是全板块精华；命中次级小节(##/【…】/**)即截断
const SUB_HEAD = /\n#{1,3}\s|\n【[^】]{2,24}】|\n\*\*/
export function kbFlowHead(kbText, limit = 420) {
  const s = String(kbText || '')
  if (!s.trim()) return ''
  const cut = s.search(SUB_HEAD)
  let h = (cut > 8 ? s.slice(0, cut) : s).replace(/\s+/g, ' ').trim()
  if (h.length > limit) h = h.slice(0, limit) + '…'
  return h
}

// 问“板块方法总览/怎么学/体系全貌”等 → 给整块 KB；否则只给流程头
export function isMethodOverview(q) {
  return /(方法总览|讲讲.*方法|这类题怎么(做|学)|体系|全貌|整体(讲|看)|方法论|目录|速查|框架)/.test(String(q || ''))
}