// Permanent-deletion tombstones for wrong questions.
//
// A normal splice is not enough: sync intentionally unions local and remote
// collections, so a removed question can reappear from an older cloud copy.
// Tombstones are small, syncable records that tell every device to keep the
// question deleted even when it still exists in another collection.

export const WRONG_DELETED_KEY = 'xc_wq_deleted'

function normalizeQuestion(q) {
  return String((q && (q.question || q.q || q.stem)) || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, '')
    .trim()
}

export function wrongQHash(q) {
  const s = normalizeQuestion(q)
  if (!s) return ''
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return 'q' + h.toString(36)
}

export function wrongSyncId(q) {
  if (!q || typeof q !== 'object') return ''
  const id = q.id ?? q.qid ?? q.key ?? q.refId
  if (id != null && id !== '') return String(id)
  return wrongQHash(q)
}

export function parseWrongDeleted(raw) {
  try {
    const arr = JSON.parse(String(raw || '[]'))
    return Array.isArray(arr) ? arr.filter((x) => x && (x.id || x.qhash)) : []
  } catch (e) {
    return []
  }
}

export function loadWrongDeleted() {
  try {
    return parseWrongDeleted(localStorage.getItem(WRONG_DELETED_KEY))
  } catch (e) {
    return []
  }
}

export function saveWrongDeleted(list) {
  try {
    localStorage.setItem(WRONG_DELETED_KEY, JSON.stringify(Array.isArray(list) ? list.slice(0, 1000) : []))
  } catch (e) {}
}

export function addWrongDeleted(q, now = Date.now()) {
  const id = wrongSyncId(q)
  const qhash = wrongQHash(q)
  if (!id && !qhash) return loadWrongDeleted()
  const list = loadWrongDeleted()
  if (!list.some((x) => x.id === id || x.qhash === qhash)) {
    list.push({ id, qhash, t: Number(now) || Date.now() })
    saveWrongDeleted(list)
  }
  return list
}

export function filterDeletedWrongs(wqs, deletedRaw) {
  const deleted = Array.isArray(deletedRaw) ? deletedRaw : parseWrongDeleted(deletedRaw)
  if (!deleted.length) return Array.isArray(wqs) ? wqs.slice() : []
  return (Array.isArray(wqs) ? wqs : []).filter((q) => {
    const id = wrongSyncId(q)
    const hash = wrongQHash(q)
    return !deleted.some((x) => x.id === id || (x.qhash && x.qhash === hash))
  })
}

export default {
  WRONG_DELETED_KEY,
  wrongQHash,
  wrongSyncId,
  parseWrongDeleted,
  loadWrongDeleted,
  saveWrongDeleted,
  addWrongDeleted,
  filterDeletedWrongs
}
