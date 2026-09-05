// wrongKnowledge.js —— 错题↔知识卡联动（R5，只读 kb）
import { retrieveCardsV2 } from '../kb/retrieveV2'

export function linkCardsOf(wq, limit = 3) {
  try {
    if (!wq) return []
    const plate = String(wq.subject || wq.plate || '')
    const stem = String(wq.question || wq.q || wq.stem || '')
    if (!plate || !stem.trim()) return []
    return retrieveCardsV2(plate, stem, limit)
  } catch (e) {
    return []
  }
}
export default linkCardsOf