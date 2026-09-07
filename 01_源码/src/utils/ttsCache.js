// TTS 音频缓存（IndexedDB）：同一文本+引擎+音色+语速 只合成一次，命中直接播放缓存音频
// 目的：大幅减少 TTS 重复请求——智谱真人 TTS 按次收费，重复朗读同一段内容不再重复扣费
/* global indexedDB */
const DB = 'xc_tts_cache'
const STORE = 'audio'
const MAX = 260 // 容量上限：超过删最旧
let dbp = null

function open() {
  if (dbp) return dbp
  dbp = new Promise((res, rej) => {
    try {
      const rq = indexedDB.open(DB, 1)
      rq.onupgradeneeded = () => { rq.result.createObjectStore(STORE) }
      rq.onsuccess = () => res(rq.result)
      rq.onerror = () => rej(rq.error)
    } catch (e) { rej(e) }
  })
  return dbp
}
// 生成缓存 key（djb2 哈希 + 长度，够用且无依赖）
export function ttsCacheKey(engine, voice, rate, pitch, text) {
  const s = String(engine || '') + '|' + String(voice || '') + '|' + String(rate || '') + '|' + String(pitch || '') + '|' + String(text || '')
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return 'k' + h.toString(36) + '_' + s.length
}
// 读取缓存：{ bytes: ArrayBuffer, mime } 或 null
export async function ttsCacheGet(key) {
  try {
    const db = await open()
    return await new Promise((res) => {
      const rq = db.transaction(STORE).objectStore(STORE).get(key)
      rq.onsuccess = () => res(rq.result || null)
      rq.onerror = () => res(null)
    })
  } catch (e) { return null }
}
// 写入缓存（超容量删最旧）
export async function ttsCacheSet(key, bytes, mime) {
  try {
    const db = await open()
    const tx = db.transaction(STORE, 'readwrite')
    const os = tx.objectStore(STORE)
    const count = await new Promise((res) => { const c = os.count(); c.onsuccess = () => res(c.result) })
    if (count >= MAX) {
      // 删最旧一条（游标第一条）
      await new Promise((res) => {
        const cur = os.openCursor()
        cur.onsuccess = () => { if (cur.result) { cur.result.delete(); res() } else res() }
        cur.onerror = () => res()
      })
    }
    os.put({ key, bytes, mime }, key)
  } catch (e) { /* 缓存失败不影响朗读 */ }
}
// 清空缓存（设置页可手动清）
export async function ttsCacheClear() {
  try {
    const db = await open()
    await new Promise((res) => { const rq = db.transaction(STORE, 'readwrite').objectStore(STORE).clear(); rq.onsuccess = () => res(); rq.onerror = () => res() })
  } catch (e) {}
}
export async function ttsCacheCount() {
  try {
    const db = await open()
    return await new Promise((res) => { const c = db.transaction(STORE).objectStore(STORE).count(); c.onsuccess = () => res(c.result); c.onerror = () => res(0) })
  } catch (e) { return 0 }
}
