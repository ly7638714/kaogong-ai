// cloudSync.js —— 多端“安全合并云同步”
// 网页 / iPad / 安卓共用同一份 WebDAV 文件；同步时先把云端拉下来与本机做集合级合并，
// 避免“后打开的一端整包覆盖另一端”。xc_cfg（含 API Key / WebDAV 密码）与纯本机 UI 键不同步。
/* global btoa */
import { store } from '../store'
import { collectAll } from './dataBackup'

export const SYNC_STATE_KEY = 'xc_sync_state'
const LOCAL_ONLY_KEYS = new Set([
  'xc_auth', 'xc_auth_verify', 'xc_errlog', 'xc_global_fab',
  'xc_chat_tools', 'xc_chat_draft', 'xc_recent_qs', 'xc_onboarded',
  'xc_guided', 'xc_guides_off', 'xc_draft_fab_on', 'xc_draft_opacity',
  'xc_draft_mode', 'xc_draft_size', 'xc_draft_mini_pos', 'xc_weak_toast',
  'xc_wq_due_tip', 'xc_pdf_tree', 'xc_pdf_tree_name', 'xc_pdf_online_order',
  'xc_native_tree', 'xc_native_tree_name', 'xc_tts_migrated', 'xc_wq_subj_v1',
  'xc_sync_state'
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

export function syncScopeFromBackup(obj) {
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
  return base.toLowerCase().endsWith('.json') ? base.slice(0, -5) + '.sync.json' : base + '.sync.json'
}

export function readSyncState() {
  try {
    const s = JSON.parse(localStorage.getItem(SYNC_STATE_KEY) || 'null') || {}
    return { auto: !!s.auto, last: Number(s.last) || 0, base: s.base && typeof s.base === 'object' ? s.base : {} }
  } catch (e) {
    return { auto: false, last: 0, base: {} }
  }
}

export function saveSyncState(p) {
  try {
    localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({
      auto: !!p.auto,
      last: Number(p.last) || Date.now(),
      lastStat: String(p.lastStat || '').slice(0, 300),
      base: p.base || {}
    }))
  } catch (e) {}
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

export function mergeArrays(localArr, remoteArr, key = '') {
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
      : lt === nt && (!hasTime(old) && hasTime(item))
        ? item
        : fromRemote && JSON.stringify(item).length > JSON.stringify(old).length
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

function deepMergeValue(key, lv, rv, depth = 0) {
  if (lv === rv) return lv
  const la = Array.isArray(lv) || (typeof lv === 'string' && rawIsArray(lv))
  const ra = Array.isArray(rv) || (typeof rv === 'string' && rawIsArray(rv))
  if (la && ra) {
    try {
      const a = typeof lv === 'string' ? JSON.parse(lv) : lv
      const b = typeof rv === 'string' ? JSON.parse(rv) : rv
      const m = mergeArrays(a, b, key)
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
        out[k] = k in out ? deepMergeValue(key + '.' + k, out[k], bv, depth + 1) : bv
      }
      return JSON.stringify(out)
    } catch (e) { return lv }
  }
  return null // 标量冲突由 mergeSyncData 用基线裁决
}

export function mergeSyncData(localData, remoteData, baseline = {}) {
  const local = localData || {}
  const remote = remoteData || {}
  const base = baseline || {}
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)])
  const out = {}
  for (const k of keys) {
    if (!shouldSyncKey(k)) continue
    const lv = k in local ? local[k] : null
    const rv = k in remote ? remote[k] : null
    if (lv == null) { out[k] = rv; continue }
    if (rv == null) { out[k] = lv; continue }
    const merged = deepMergeValue(k, lv, rv, 0)
    if (merged != null) { out[k] = merged; continue }
    // 标量：本机没改且云端改了 → 用云端；两边都改或只有本机改 → 用本机，防自动覆盖正在学习的新数据。
    const localChanged = lv !== base[k]
    const remoteChanged = rv !== base[k]
    out[k] = !localChanged && remoteChanged ? rv : lv
  }
  return out
}

function fingerprint(data) {
  return JSON.stringify(sortedJson(data))
}

function writeMerged(data) {
  let n = 0
  for (const k in data) {
    if (!shouldSyncKey(k)) continue
    try { if (localStorage.getItem(k) !== String(data[k])) { localStorage.setItem(k, data[k]); n++ } } catch (e) {}
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

function authHdrs(user, pass) {
  const b64 = (s) => {
    try { return btoa(unescape(encodeURIComponent(s))) } catch (e) { return '' }
  }
  const h = { 'Content-Type': 'application/json' }
  if (user || pass) h.Authorization = 'Basic ' + b64(user + ':' + pass)
  return h
}

export async function runCloudSync() {
  const w = (store.cfg && store.cfg.webdav) || {}
  if (!w.url || !w.url.trim()) throw new Error('请先填写 WebDAV 地址')
  if (!w.pass) throw new Error('请填写 WebDAV 密码/应用密码')
  const url = cloudSyncUrl()
  const hdrs = authHdrs(w.user, w.pass)
  let remoteRaw = null
  let http = 0
  const getRes = await fetch(url, { method: 'GET', headers: hdrs })
  http = getRes.status
  if (getRes.ok) remoteRaw = await getRes.json()
  else if (getRes.status !== 404) throw new Error('读取云端失败 HTTP ' + getRes.status)

  const localAll = collectAll()
  const local = syncScopeFromBackup(localAll)
  const remote = remoteRaw ? syncScopeFromBackup(remoteRaw) : {}
  const state = readSyncState()
  const merged = mergeSyncData(local, remote, state.base)
  const changed = writeMerged(merged)

  const sameAsRemote = remoteRaw ? fingerprint(syncScopeFromBackup(remoteRaw)) === fingerprint(merged) : false
  let putTs = remoteRaw && remoteRaw.t ? Number(remoteRaw.t) : 0
  if (!sameAsRemote) {
    const body = { app: 'xingce', v: 3, kind: 'cloud-sync', t: Date.now(), data: merged }
    const putRes = await fetch(url, { method: 'PUT', headers: hdrs, body: JSON.stringify(body) })
    if (!putRes.ok) throw new Error('上传云端失败 HTTP ' + putRes.status)
    putTs = body.t
  }
  saveSyncState({ auto: state.auto, last: putTs, lastStat: '已同步 ' + new Date(putTs).toLocaleString(), base: scalarBaseline(merged) })
  return { ok: true, changed: changed > 0, ts: putTs, http }
}
