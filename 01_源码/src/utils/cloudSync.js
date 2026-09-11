// cloudSync.js —— 多端“安全合并云同步”
// 网页 / iPad / 安卓共用同一份 WebDAV 文件；同步时先把云端拉下来与本机做集合级合并，
// 避免“后打开的一端整包覆盖另一端”。xc_cfg（含 API Key / WebDAV 密码）与纯本机 UI 键不同步。
import { store } from '../store'
import { collectAll, restoreAll } from './dataBackup'
import { webdavSyncUrl, wdAuthHeaders, webdavGet, webdavPutFile } from './webdav'
import { WRONG_DELETED_KEY, filterDeletedWrongs, parseWrongDeleted } from './wrongDelete'

export const SYNC_STATE_KEY = 'xc_sync_state'
const LOCAL_ONLY_KEYS = new Set([
  'xc_auth', 'xc_auth_verify', 'xc_errlog', 'xc_global_fab',
  'xc_chat_tools', 'xc_chat_draft', 'xc_recent_qs', 'xc_onboarded',
  'xc_guided', 'xc_guides_off', 'xc_draft_fab_on', 'xc_draft_opacity',
  'xc_draft_mode', 'xc_draft_size', 'xc_draft_mini_pos', 'xc_weak_toast',
  'xc_wq_due_tip', 'xc_pdf_tree', 'xc_pdf_tree_name', 'xc_pdf_online_order',
  'xc_native_tree', 'xc_native_tree_name', 'xc_tts_migrated', 'xc_wq_subj_v1',
  'xc_sync_state', 'xc_sync_device_id'
])
const LOCAL_ONLY_PREFIXES = [
  'xc_pet_pos_', 'xc_music_pos_', 'xc_pet_panel_pos_', 'xc_draft_mini_pos_'
]

export function shouldSyncKey(k) {
  if (!String(k || '').startsWith('xc_')) return false
  if (k === 'xc_cfg') return false
  if (LOCAL_ONLY_KEYS.has(k)) return false
  if (LOCAL_ONLY_PREFIXES.some((p) => String(k).startsWith(p))) return false
  return true
}

function normalizeSyncValue(k, raw) {
  if (k === 'xc_tasks' && typeof raw === 'string') {
    try {
      const obj = JSON.parse(raw)
      if (obj && typeof obj === 'object' && !Array.isArray(obj) && typeof obj.items === 'string') {
        const arr = JSON.parse(obj.items)
        if (Array.isArray(arr)) {
          obj.items = arr
          return JSON.stringify(obj)
        }
      }
    } catch (e) { /* 保持原值，避免破坏非标准旧备份 */ }
  }
  return raw
}

export function syncScopeFromBackup(obj) {
  const src = obj && obj.data && typeof obj.data === 'object' ? obj.data : obj
  if (!src || typeof src !== 'object') return {}
  const out = {}
  for (const k in src) if (shouldSyncKey(k)) out[k] = normalizeSyncValue(k, src[k])
  return out
}

function rawScopeFromBackup(obj) {
  const src = obj && obj.data && typeof obj.data === 'object' ? obj.data : obj
  if (!src || typeof src !== 'object') return {}
  const out = {}
  for (const k in src) if (shouldSyncKey(k)) out[k] = src[k]
  return out
}

export function cloudSyncUrl() {
  const w = (store.cfg && store.cfg.webdav) || {}
  const base = String(w.url || '').trim()
  if (!base) throw new Error('请先填写 WebDAV 地址')
  return webdavSyncUrl(base)
}

export function readSyncState() {
  try {
    const s = JSON.parse(localStorage.getItem(SYNC_STATE_KEY) || 'null') || {}
    return {
      auto: !!s.auto,
      last: Number(s.last) || 0,
      kind: s.kind === 'gh' || s.kind === 'ge' ? s.kind : 'wd',
      lastStat: String(s.lastStat || '').slice(0, 300),
      lastAction: String(s.lastAction || ''),
      at: Number(s.at) || Number(s.last) || 0,
      localT: Number(s.localT) || 0,
      remoteT: Number(s.remoteT) || 0,
      baseHash: String(s.baseHash || ''),
      remoteDevice: s.remoteDevice && typeof s.remoteDevice === 'object' ? s.remoteDevice : null,
      base: s.base && typeof s.base === 'object' ? s.base : {}
    }
  } catch (e) {
    return { auto: false, last: 0, kind: 'wd', lastStat: '', lastAction: '', at: 0, localT: 0, remoteT: 0, baseHash: '', remoteDevice: null, base: {} }
  }
}

export function saveSyncState(p) {
  try {
    const prev = readSyncState()
    const src = p && typeof p === 'object' ? p : {}
    const remoteDevice = src.remoteDevice === null
      ? null
      : src.remoteDevice && typeof src.remoteDevice === 'object'
        ? src.remoteDevice
        : prev.remoteDevice
    localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({
      kind: src.kind === 'gh' || src.kind === 'ge' ? src.kind : (src.kind === 'wd' ? 'wd' : prev.kind),
      auto: src.auto === undefined ? prev.auto : !!src.auto,
      last: Number(src.last === undefined ? prev.last : src.last) || 0,
      lastStat: String(src.lastStat === undefined ? prev.lastStat : src.lastStat || '').slice(0, 300),
      lastAction: String(src.lastAction === undefined ? prev.lastAction : src.lastAction || ''),
      at: Number(src.at === undefined ? prev.at : src.at) || 0,
      localT: Number(src.localT === undefined ? prev.localT : src.localT) || 0,
      remoteT: Number(src.remoteT === undefined ? prev.remoteT : src.remoteT) || 0,
      baseHash: String(src.baseHash === undefined ? prev.baseHash : src.baseHash || ''),
      remoteDevice,
      base: src.base && typeof src.base === 'object' ? src.base : prev.base
    }))
  } catch (e) {}
}

// 设备标识只留在本机，用于让用户在网页端/手机端之间辨认“最新一版是谁写的”。
export function syncDeviceInfo() {
  let id = ''
  try {
    id = localStorage.getItem('xc_sync_device_id') || ''
    if (!id) {
      id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
      localStorage.setItem('xc_sync_device_id', id)
    }
  } catch (e) {
    id = id || 'dev_unknown'
  }
  const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : ''
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
  const android = /Android/i.test(ua)
  const ios = /iPhone|iPad|iPod/i.test(ua)
  const label = android ? '安卓端' : ios ? 'iOS/iPad 端' : mobile ? '手机端' : '网页/桌面端'
  return { id, label }
}

export function makeCloudEnvelope(data) {
  return { app: 'xingce', v: 3, kind: 'cloud-sync', t: Date.now(), device: syncDeviceInfo(), data }
}

export function cloudEnvelopeMeta(raw) {
  const d = raw && raw.device && typeof raw.device === 'object' ? raw.device : {}
  return {
    t: Number(raw && raw.t) || 0,
    deviceId: String(d.id || ''),
    deviceLabel: String(d.label || '其他设备')
  }
}

function hashString(s) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return 'h' + h.toString(36)
}

function sortedJson(v) {
  if (v == null || typeof v !== 'object') return v
  if (Array.isArray(v)) return v.map(sortedJson)
  const o = {}
  Object.keys(v).sort().forEach((k) => { o[k] = sortedJson(v[k]) })
  return o
}

function itemKey(it) {
  if (!it || typeof it !== 'object') return hashString(String(it == null ? '' : it))
  const id = it.id ?? it.key ?? it.qid ?? it.refId ?? it.paperId ?? it.k ?? it.uid
  if (id != null && id !== '') return 'id:' + String(id)
  return hashString(JSON.stringify(sortedJson(it)))
}

function timeOf(it) {
  if (!it || typeof it !== 'object') return 0
  for (const f of ['t', 'ts', 'at', 'updatedAt', 'savedAt', 'created', 'start', 'dueAt', 'last']) {
    const v = it[f]
    if (typeof v === 'number' && isFinite(v) && v > 1e8) return v
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return new Date(v).getTime() || 0
    if (typeof v === 'string' && /^\d{10,13}$/.test(v)) return Number(v)
  }
  if (typeof it.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(it.date)) return new Date(it.date).getTime() || 0
  return 0
}

function hasTime(it) { return timeOf(it) > 0 }

export function mergeArrays(localArr, remoteArr, key = '', preferRemote = false) {
  const l = Array.isArray(localArr) ? localArr : []
  const r = Array.isArray(remoteArr) ? remoteArr : []
  const map = new Map()
  const seq = []
  const add = (item, fromRemote) => {
    if (item == null) return
    const k = itemKey(item)
    const old = map.get(k)
    if (!old) {
      map.set(k, item)
      seq.push(item)
      return
    }
    const lt = timeOf(old), nt = timeOf(item)
    const choose = nt > lt
      ? item
      : lt === nt && (preferRemote || (!hasTime(old) && hasTime(item)) || (fromRemote && JSON.stringify(item).length > JSON.stringify(old).length))
        ? item
        : old
    map.set(k, choose)
    const idx = seq.indexOf(old)
    if (idx >= 0) seq[idx] = choose
  }
  l.forEach((x) => add(x, false))
  r.forEach((x) => add(x, true))
  if (key === 'xc_msgs' && seq.length > 1) {
    const timed = seq.filter(hasTime).length / seq.length
    if (timed > 0.75) {
      seq.sort((a, b) => timeOf(a) - timeOf(b))
    }
  }
  return seq
}

function rawIsArray(v) {
  const s = String(v == null ? '' : v).trim()
  return s.startsWith('[')
}

function rawIsObject(v) {
  const s = String(v == null ? '' : v).trim()
  return s.startsWith('{')
}

function deepMergeValue(key, lv, rv, depth = 0, preferRemote = false) {
  if (lv === rv) return lv
  const la = Array.isArray(lv) || (typeof lv === 'string' && rawIsArray(lv))
  const ra = Array.isArray(rv) || (typeof rv === 'string' && rawIsArray(rv))
  if (la && ra) {
    try {
      const a = typeof lv === 'string' ? JSON.parse(lv) : lv
      const b = typeof rv === 'string' ? JSON.parse(rv) : rv
      const m = mergeArrays(a, b, key, preferRemote)
      return JSON.stringify(m)
    } catch (e) { return lv }
  }
  const lo = lv != null && (typeof lv === 'object' || rawIsObject(lv))
  const ro = rv != null && (typeof rv === 'object' || rawIsObject(rv))
  if (lo && ro && depth < 2) {
    try {
      const a = typeof lv === 'string' ? JSON.parse(lv) : lv
      const b = typeof rv === 'string' ? JSON.parse(rv) : rv
      const out = { ...a }
      for (const k in b) {
        const bv = b[k]
        out[k] = k in out ? deepMergeValue(key + '.' + k, out[k], bv, depth + 1, preferRemote) : bv
      }
      return JSON.stringify(out)
    } catch (e) { return lv }
  }
  return null // 标量冲突由 mergeSyncData 用基线裁决
}

function parseArrayValue(v) {
  try {
    const arr = JSON.parse(String(v || '[]'))
    return Array.isArray(arr) ? arr : []
  } catch (e) {
    return []
  }
}

export function mergeSyncData(localData, remoteData, baseline = {}, opts = {}) {
  const local = localData || {}
  const remote = remoteData || {}
  const base = baseline || {}
  const localDeleted = parseWrongDeleted(local[WRONG_DELETED_KEY])
  const remoteDeleted = parseWrongDeleted(remote[WRONG_DELETED_KEY])
  const deleted = mergeArrays(localDeleted, remoteDeleted, WRONG_DELETED_KEY)
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)])
  const out = {}
  if (deleted.length || local[WRONG_DELETED_KEY] || remote[WRONG_DELETED_KEY]) out[WRONG_DELETED_KEY] = JSON.stringify(deleted)
  for (const k of keys) {
    if (!shouldSyncKey(k)) continue
    if (k === WRONG_DELETED_KEY) continue
    const lv = k in local ? local[k] : null
    const rv = k in remote ? remote[k] : null
    if (lv == null) { out[k] = rv; continue }
    if (rv == null) { out[k] = lv; continue }
    if (k === 'xc_wqs') {
      const merged = mergeArrays(parseArrayValue(lv), parseArrayValue(rv), k, !!opts.preferRemote)
      out[k] = JSON.stringify(filterDeletedWrongs(merged, deleted))
      continue
    }
    const merged = deepMergeValue(k, lv, rv, 0, !!opts.preferRemote)
    if (merged != null) { out[k] = merged; continue }
    // 标量：本机没改且云端改了 → 用云端；两边都改或只有本机改 → 用本机，防自动覆盖正在学习的新数据。
    const localChanged = lv !== base[k]
    const remoteChanged = rv !== base[k]
    out[k] = opts.preferRemote && !localChanged ? rv : (!localChanged && remoteChanged ? rv : lv)
  }
  return out
}

function fingerprint(data) {
  return JSON.stringify(sortedJson(data))
}

export function syncDataHash(dataOrEnvelope) {
  const scope = syncScopeFromBackup(dataOrEnvelope)
  return hashString(fingerprint(scope))
}

export function syncOverview() {
  const state = readSyncState()
  const currentHash = syncDataHash(collectAll())
  return {
    ...state,
    currentHash,
    known: !!state.baseHash,
    dirty: !!state.baseHash && currentHash !== state.baseHash
  }
}

function compactForStorage(key, raw) {
  if (key === 'xc_attempts') {
    try {
      const arr = JSON.parse(String(raw || '[]'))
      if (Array.isArray(arr) && arr.length > 2000) return JSON.stringify(arr.slice(-2000))
    } catch (e) {}
  }
  if (key === 'xc_msgs') {
    try {
      const arr = JSON.parse(String(raw || '[]'))
      if (!Array.isArray(arr)) return raw
      const keep = arr.slice(-120)
      const trimmed = keep.map((m, i) => {
        if (!m || typeof m !== 'object') return m
        if (i >= keep.length - 30) return m
        const x = { ...m }
        if (Array.isArray(x.imgs) && x.imgs.length) x.imgs = []
        if (x.img && String(x.img).startsWith('data:')) x.img = ''
        if (Array.isArray(x.content)) x.content = x.content.filter((c) => !(c && c.type === 'image_url'))
        return x
      })
      const out = JSON.stringify(trimmed)
      return out.length < String(raw).length ? out : raw
    } catch (e) {}
  }
  if (key === 'xc_wqs') {
    try {
      const arr = JSON.parse(String(raw || '[]'))
      if (!Array.isArray(arr)) return raw
      let changed = false
      const trimmed = arr.map((q, i) => {
        if (!q || typeof q !== 'object') return q
        const x = { ...q }
        if (Array.isArray(x.imgs) && x.imgs.length && i < arr.length - 80 && String(x.question || '').length > 80) {
          x.imgs = []
          changed = true
        }
        return x
      })
      const out = JSON.stringify(trimmed)
      return changed && out.length < String(raw).length ? out : raw
    } catch (e) {}
  }
  return raw
}

function setStorageValue(key, raw) {
  const value = String(raw == null ? '' : raw)
  try {
    localStorage.setItem(key, value)
    return { ok: true, compacted: false }
  } catch (e) {
    const compacted = compactForStorage(key, value)
    if (compacted !== value) {
      try {
        localStorage.setItem(key, compacted)
        return { ok: true, compacted: true }
      } catch (_) {}
    }
    return { ok: false, compacted: false }
  }
}

function writeMerged(data) {
  let n = 0
  let compacted = false
  for (const k in data) {
    if (!shouldSyncKey(k)) continue
    const raw = String(data[k] == null ? '' : data[k])
    if (localStorage.getItem(k) === raw) continue
    const r = setStorageValue(k, raw)
    if (r.ok) {
      n++
      if (r.compacted) compacted = true
    }
  }
  if (compacted) {
    import('./toast').then((t) => { if (t.showToast) t.showToast('已同步；本机空间紧张，已自动压缩历史图片/日志缓存，不影响错题正文', 'info') }).catch(() => {})
  }
  return n
}

function scalarBaseline(data) {
  const base = {}
  for (const k in data) {
    const v = String(data[k] || '')
    if (!rawIsArray(v) && !rawIsObject(v)) base[k] = v
  }
  return base
}

export function syncBaseline(data) {
  return scalarBaseline(data || {})
}

// 云端下载后统一做“下载 → 安全合并 → 写回本机”，返回是否需要回传云端。
export function applyLocalMerge(localAll, remoteRaw, baseline = {}, opts = {}) {
  const local = syncScopeFromBackup(localAll)
  const remote = remoteRaw ? syncScopeFromBackup(remoteRaw) : {}
  const merged = mergeSyncData(local, remote, baseline, opts)
  const changed = writeMerged(merged)
  const rawRemote = remoteRaw ? rawScopeFromBackup(remoteRaw) : {}
  const sameAsRemote = remoteRaw ? fingerprint(rawRemote) === fingerprint(merged) : false
  return { local, remote, merged, changed, sameAsRemote }
}

export function hydrateStoreFromPlan(plan) {
  if (!plan || !plan.merged) return
  const m = plan.merged
  const parseArr = (k) => {
    if (!(k in m) || m[k] == null) return null
    try {
      const v = JSON.parse(m[k])
      return Array.isArray(v) ? v : null
    } catch (e) { return null }
  }
  // 对话记录：以前这里只回填错题——同步虽然已经把合并结果写进了 localStorage，
  // 但对话页用的还是内存里的旧数组（store.msgs），表现为「另一端的聊天记录没同步」。
  // 现在把主要集合一起回填到界面，同步完成后无需刷新即可看到。
  const msgs = parseArr('xc_msgs')
  if (msgs) store.msgs = msgs.slice(-200)
  const wqs = parseArr('xc_wqs')
  if (wqs) {
    try { store.wqs = filterDeletedWrongs(wqs, parseWrongDeleted(m[WRONG_DELETED_KEY])) }
    catch (e) { store.wqs = wqs }
  }
  const notes = parseArr('xc_notes')
  if (notes) store.notes = notes
  const mem = parseArr('xc_my_mem')
  if (mem) store.myMem = mem
  if (typeof m.xc_mode === 'string' && m.xc_mode) {
    try { store.mode = JSON.parse(m.xc_mode) } catch (e) { store.mode = m.xc_mode }
  }
}

export async function runCloudSync() {
  const w = (store.cfg && store.cfg.webdav) || {}
  if (!w.url || !w.url.trim()) throw new Error('请先填写 WebDAV 地址')
  if (!w.pass) throw new Error('请填写 WebDAV 密码/应用密码')
  const url = cloudSyncUrl()
  const hdrs = wdAuthHeaders(w.user, w.pass)
  let remoteRaw = null
  const getRes = await webdavGet(url, hdrs)
  if (getRes) remoteRaw = await getRes.json()

  const state = readSyncState()
  const remoteMeta = cloudEnvelopeMeta(remoteRaw)
  const preferRemote = !!remoteRaw && remoteMeta.t > state.remoteT && !syncOverview().dirty
  const plan = applyLocalMerge(collectAll(), remoteRaw, state.base, { preferRemote })
  hydrateStoreFromPlan(plan)
  let putTs = remoteRaw && remoteRaw.t ? Number(remoteRaw.t) : 0
  if (!plan.sameAsRemote) {
    const body = makeCloudEnvelope(plan.merged)
    await webdavPutFile(url, hdrs, JSON.stringify(body))
    putTs = body.t
  }
  const own = syncDeviceInfo()
  const finalTs = putTs || Date.now()
  saveSyncState({
    ...state,
    last: finalTs,
    lastAction: 'merge',
    at: Date.now(),
    localT: finalTs,
    remoteT: finalTs,
    remoteDevice: remoteMeta.t ? { id: remoteMeta.deviceId, label: remoteMeta.deviceLabel } : own,
    baseHash: syncDataHash(plan.merged),
    lastStat: '智能合并 ' + new Date(finalTs).toLocaleString(),
    base: scalarBaseline(plan.merged)
  })
  return { ok: true, changed: plan.changed > 0, ts: finalTs, direction: 'merge' }
}

// 单向上传：把当前设备的数据作为新版本覆盖云端。云端若能读到且比本机上次记录更新，先返回 needsConfirm 交给界面二次确认。
export async function runCloudUpload(options = {}) {
  const w = (store.cfg && store.cfg.webdav) || {}
  if (!w.url || !w.url.trim()) throw new Error('请先填写 WebDAV 地址')
  if (!w.pass) throw new Error('请填写 WebDAV 密码/应用密码')
  const url = cloudSyncUrl()
  const hdrs = wdAuthHeaders(w.user, w.pass)
  const getRes = await webdavGet(url, hdrs)
  let remoteRaw = null
  if (getRes) remoteRaw = await getRes.json()
  const state = readSyncState()
  const local = collectAll()
  const sameAsLocal = remoteRaw ? syncDataHash(remoteRaw) === syncDataHash(local) : false
  const meta = cloudEnvelopeMeta(remoteRaw)
  if (remoteRaw && !options.force && !sameAsLocal && (state.kind !== 'wd' || meta.t > state.remoteT)) {
    return { ok: false, needsConfirm: true, direction: 'upload', remoteT: meta.t, remoteDevice: meta.deviceLabel }
  }
  const body = makeCloudEnvelope(local.data)
  await webdavPutFile(url, hdrs, JSON.stringify(body))
  saveSyncState({
    ...state,
    last: body.t,
    lastAction: 'upload',
    at: Date.now(),
    localT: body.t,
    remoteT: body.t,
    remoteDevice: syncDeviceInfo(),
    baseHash: syncDataHash(body),
    lastStat: '已上传本机版本 ' + new Date(body.t).toLocaleString()
  })
  return { ok: true, changed: true, ts: body.t, direction: 'upload', remoteT: meta.t, remoteDevice: meta.deviceLabel }
}

// 单向下载：把云端当前版本完整写回本机。本机若有未上传修改，先返回 needsConfirm，避免误覆盖。
export async function runCloudDownload(options = {}) {
  const w = (store.cfg && store.cfg.webdav) || {}
  if (!w.url || !w.url.trim()) throw new Error('请先填写 WebDAV 地址')
  if (!w.pass) throw new Error('请填写 WebDAV 密码/应用密码')
  const url = cloudSyncUrl()
  const hdrs = wdAuthHeaders(w.user, w.pass)
  const getRes = await webdavGet(url, hdrs)
  if (!getRes) throw new Error('云端还没有同步文件；请先在任一设备点「⬆️ 上传本机」')
  const remoteRaw = await getRes.json()
  if (!remoteRaw || (!remoteRaw.data && !remoteRaw.app)) throw new Error('云端同步文件格式不对')
  const state = readSyncState()
  const local = collectAll()
  const remoteHash = syncDataHash(remoteRaw)
  const localHash = syncDataHash(local)
  const meta = cloudEnvelopeMeta(remoteRaw)
  if (localHash !== remoteHash && !options.force && (state.kind !== 'wd' || (state.baseHash && localHash !== state.baseHash))) {
    return { ok: false, needsConfirm: true, direction: 'download', remoteT: meta.t, remoteDevice: meta.deviceLabel }
  }
  const n = restoreAll(remoteRaw)
  saveSyncState({
    ...state,
    last: Date.now(),
    lastAction: 'download',
    at: Date.now(),
    localT: meta.t || Date.now(),
    remoteT: meta.t || Date.now(),
    remoteDevice: { id: meta.deviceId, label: meta.deviceLabel },
    baseHash: remoteHash,
    lastStat: '已下载云端版本 ' + new Date(meta.t || Date.now()).toLocaleString()
  })
  return { ok: true, changed: n > 0, ts: meta.t || Date.now(), direction: 'download', remoteT: meta.t, remoteDevice: meta.deviceLabel }
}
