// TTS 音频缓存（IndexedDB）：同一文本+引擎+音色+语速 只合成一次，命中直接播放缓存音频
// 目的：大幅减少 TTS 重复请求——真人 TTS 按字符收费，重复朗读同一段内容不再重复扣费。
// v2：改为 LRU（命中刷新使用时间）+ 条数/总字节双上限，保证常用内容不被误淘汰。
/* global indexedDB */
const DB = 'xc_tts_cache'
const STORE = 'audio'
const MAX = 400 // 条数上限
const MAX_BYTES = 200 * 1024 * 1024 // 缓存总大小上限（约 200MB），超出淘汰最久未用
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
// 读取缓存：{ bytes: ArrayBuffer, mime } 或 null；命中时刷新 LRU 使用时间
export async function ttsCacheGet(key) {
  try {
    const db = await open()
    return await new Promise((res) => {
      const tx = db.transaction(STORE, 'readwrite')
      const os = tx.objectStore(STORE)
      const rq = os.get(key)
      rq.onsuccess = () => {
        const v = rq.result || null
        if (v) { try { os.put(Object.assign({}, v, { at: Date.now() }), key) } catch (e) {} }
        res(v)
      }
      rq.onerror = () => res(null)
    })
  } catch (e) { return null }
}
// 写入缓存（写入后按 LRU 淘汰超额部分）
export async function ttsCacheSet(key, bytes, mime) {
  try {
    const db = await open()
    await new Promise((res) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put({ key, bytes, mime, at: Date.now(), size: (bytes && bytes.byteLength) || 0 }, key)
      tx.oncomplete = () => res()
      tx.onerror = () => res()
      tx.onabort = () => res()
    })
    await evictOld(db)
  } catch (e) { /* 缓存失败不影响朗读 */ }
}
function collectMeta(db) {
  return new Promise((res) => {
    const out = []
    try {
      const tx = db.transaction(STORE, 'readonly')
      const cur = tx.objectStore(STORE).openCursor()
      cur.onsuccess = () => {
        const c = cur.result
        if (c) {
          const v = c.value || {}
          out.push({ key: c.key, at: Number(v.at) || 0, size: Number(v.size) || 0 })
          c.continue()
        } else res(out)
      }
      cur.onerror = () => res(out)
    } catch (e) { res(out) }
  })
}
// LRU 淘汰：按最近使用时间从旧到新删，直到条数与总字节都回到上限内
async function evictOld(db) {
  const metas = await collectMeta(db)
  let total = metas.reduce((s, m) => s + m.size, 0)
  if (metas.length <= MAX && total <= MAX_BYTES) return
  metas.sort((a, b) => a.at - b.at)
  const kill = []
  let count = metas.length
  for (const m of metas) {
    if (count <= MAX && total <= MAX_BYTES) break
    kill.push(m.key)
    count--
    total -= m.size
  }
  if (!kill.length) return
  await new Promise((res) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      const os = tx.objectStore(STORE)
      for (const k of kill) { try { os.delete(k) } catch (e) {} }
      tx.oncomplete = () => res()
      tx.onerror = () => res()
      tx.onabort = () => res()
    } catch (e) { res() }
  })
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
