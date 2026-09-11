// githubSync.js —— GitHub 私人仓库自动互通
// 坚果云 dav.jianguoyun.com 对浏览器有跨域限制（会报 Failed to fetch），
// GitHub API 支持 CORS，适合网页 / iPad / 安卓直接用同一 Token 互通。
/* global btoa, atob */
import { store, saveCfg } from '../store'
import { collectAll, restoreAll } from './dataBackup'
import { applyLocalMerge, hydrateStoreFromPlan, readSyncState, saveSyncState, syncBaseline, makeCloudEnvelope, cloudEnvelopeMeta, syncDataHash, syncDeviceInfo, syncOverview } from './cloudSync'

const GH_API = 'https://api.github.com'
const DEFAULT_REPO = 'xingce-ai-cloud-sync'
const SYNC_FILE = 'xingce-sync.json'

function ghCfg() {
  if (!store.cfg.github) store.cfg.github = { token: '', repo: '' }
  return store.cfg.github
}

function b64EncodeUtf8(str) {
  try {
    const bytes = new TextEncoder().encode(str)
    let bin = ''
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
    return btoa(bin)
  } catch (e) {
    return btoa(unescape(encodeURIComponent(str)))
  }
}

function b64DecodeUtf8(str) {
  const clean = String(str || '').replace(/\s+/g, '')
  try {
    const bin = atob(clean)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new TextDecoder().decode(bytes)
  } catch (e) {
    try { return decodeURIComponent(escape(atob(clean))) } catch (e) { /* fallthrough */ }
    throw new Error('GitHub 云端文件解码失败', { cause: e })
  }
}

function ghHdrs(extra) {
  const g = ghCfg()
  const h = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  }
  if (String(g.token || '').trim()) h.Authorization = 'Bearer ' + String(g.token).trim()
  if (extra) Object.assign(h, extra)
  return h
}

async function ghFetch(path, options = {}) {
  const g = ghCfg()
  const token = String(g.token || '').trim()
  if (!token) throw new Error('请先填写 GitHub Token')
  const h = ghHdrs(options.body ? { 'Content-Type': 'application/json' } : {})
  let res
  try {
    res = await fetch(GH_API + path, Object.assign({}, options, { headers: h }))
  } catch (e) {
    throw new Error('GitHub 网络连接失败，请检查网络后重试', { cause: e })
  }
  if (res.ok) {
    let json = null
    try { json = await res.json() } catch (e) { /* 部分响应无正文 */ }
    return { json, status: res.status }
  }
  let msg = 'GitHub HTTP ' + res.status
  try {
    const j = await res.json()
    if (j && j.message) msg = String(j.message)
    if (j && j.errors && j.errors.length) {
      msg += '（' + j.errors.map((x) => x.message || x.code || '').filter(Boolean).join('；') + '）'
    }
  } catch (e) { /* 保留默认 */ }
  if (res.status === 401) msg = 'GitHub Token 无效或已过期，请重新填写'
  if (res.status === 403 && /rate/i.test(msg)) msg = 'GitHub 请求频率过高，请稍后再同步'
  const err = new Error(msg)
  err.status = res.status
  err.is404 = res.status === 404
  throw err
}

function repoSlug(raw) {
  const s = String(raw || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\/+$/, '')
  return s.split('/').filter(Boolean)
}

async function ensurePrivateRepo() {
  const g = ghCfg()
  const parts = repoSlug(g.repo)
  let owner = ''
  let name = DEFAULT_REPO
  if (parts.length === 2) { owner = parts[0]; name = parts[1] }
  else if (parts.length === 1) name = parts[0]
  if (!name) name = DEFAULT_REPO
  if (!owner) {
    const me = await ghFetch('/user')
    owner = me.json && me.json.login
  }
  if (!owner) throw new Error('无法识别 GitHub 用户名，请检查 Token')
  const full = owner + '/' + name
  let created = false
  try {
    const existing = await ghFetch('/repos/' + full)
    const repo = existing.json || {}
    if (repo.private === false) throw new Error('该同步仓库是公开仓库，学习数据不能公开。请换一个私人仓库名，或删除同名公开仓库后重试')
  } catch (e) {
    if (!e.is404) throw e
    try {
      await ghFetch('/user/repos', {
        method: 'POST',
        body: JSON.stringify({
          name,
          description: '行测AI学习数据自动互通（私人）',
          private: true,
          auto_init: true
        })
      })
      created = true
    } catch (e) {
      throw new Error('自动创建私人仓库失败：' + (e.message || e) + '（可改为填写 owner/repo 使用已有私人仓库）', { cause: e })
    }
  }
  if (g.repo !== full) {
    g.repo = full
    try { saveCfg() } catch (e) {}
  }
  return { full, created }
}

async function readGitHubRemote(repo) {
  try {
    const r = await ghFetch('/repos/' + repo + '/contents/' + SYNC_FILE)
    const obj = r.json || {}
    let parsed = null
    try {
      const text = b64DecodeUtf8(obj.content)
      parsed = JSON.parse(text)
    } catch (e) {
      // 自动自愈：云端文件损坏时直接覆盖重建，不再要求用户手动删除
      return { obj: null, sha: obj.sha, corrupted: true }
    }
    return { obj: parsed, sha: obj.sha }
  } catch (e) {
    if (e.is404) return null
    throw e
  }
}

export async function runGitHubSync() {
  const g = ghCfg()
  if (!g.token || !String(g.token).trim()) throw new Error('请先填写 GitHub Token')
  const repoInfo = await ensurePrivateRepo()
  const remoteFile = await readGitHubRemote(repoInfo.full)
  const remoteRaw = remoteFile ? remoteFile.obj : null
  const state = readSyncState()
  const remoteMeta = cloudEnvelopeMeta(remoteRaw)
  const preferRemote = !!remoteRaw && remoteMeta.t > state.remoteT && !syncOverview().dirty
  const plan = applyLocalMerge(collectAll(), remoteRaw, state.base, { preferRemote })
  hydrateStoreFromPlan(plan)
  const body = makeCloudEnvelope(plan.merged)
  let putTs = remoteRaw && remoteRaw.t ? Number(remoteRaw.t) : 0
  if (!plan.sameAsRemote || (remoteFile && remoteFile.corrupted)) {
    const payload = {
      message: '行测AI自动互通 ' + new Date(body.t).toLocaleString(),
      content: b64EncodeUtf8(JSON.stringify(body))
    }
    if (remoteFile) payload.sha = remoteFile.sha
    await ghFetch('/repos/' + repoInfo.full + '/contents/' + SYNC_FILE, {
      method: 'PUT',
      body: JSON.stringify(payload)
    })
    putTs = body.t
  }
  const finalTs = putTs || Date.now()
  const own = syncDeviceInfo()
  saveSyncState({
    ...state,
    last: finalTs,
    lastAction: 'merge',
    at: Date.now(),
    localT: finalTs,
    remoteT: finalTs,
    remoteDevice: remoteMeta.t ? { id: remoteMeta.deviceId, label: remoteMeta.deviceLabel } : own,
    baseHash: syncDataHash(plan.merged),
    lastStat: 'GitHub 智能合并 ' + new Date(finalTs).toLocaleString(),
    base: syncBaseline(plan.merged)
  })
  return { ok: true, changed: plan.changed > 0, ts: finalTs, repo: repoInfo.full, created: repoInfo.created, direction: 'merge' }
}

export async function runGitHubUpload(options = {}) {
  const g = ghCfg()
  if (!g.token || !String(g.token).trim()) throw new Error('请先填写 GitHub Token')
  const repoInfo = await ensurePrivateRepo()
  const remoteFile = await readGitHubRemote(repoInfo.full)
  const remoteRaw = remoteFile && remoteFile.obj ? remoteFile.obj : null
  const state = readSyncState()
  const local = collectAll()
  const meta = cloudEnvelopeMeta(remoteRaw)
  const sameAsLocal = remoteRaw ? syncDataHash(remoteRaw) === syncDataHash(local) : false
  if (remoteRaw && !options.force && !sameAsLocal && (state.kind !== 'gh' || meta.t > state.remoteT)) {
    return { ok: false, needsConfirm: true, direction: 'upload', remoteT: meta.t, remoteDevice: meta.deviceLabel, repo: repoInfo.full }
  }
  const body = makeCloudEnvelope(local.data)
  const payload = {
    message: '行测AI上传本机版本 ' + new Date(body.t).toLocaleString(),
    content: b64EncodeUtf8(JSON.stringify(body))
  }
  if (remoteFile) payload.sha = remoteFile.sha
  await ghFetch('/repos/' + repoInfo.full + '/contents/' + SYNC_FILE, { method: 'PUT', body: JSON.stringify(payload) })
  saveSyncState({
    ...state,
    last: body.t,
    lastAction: 'upload',
    at: Date.now(),
    localT: body.t,
    remoteT: body.t,
    remoteDevice: syncDeviceInfo(),
    baseHash: syncDataHash(body),
    lastStat: 'GitHub 已上传本机版本 ' + new Date(body.t).toLocaleString()
  })
  return { ok: true, changed: true, ts: body.t, direction: 'upload', repo: repoInfo.full, created: repoInfo.created }
}

export async function runGitHubDownload(options = {}) {
  const g = ghCfg()
  if (!g.token || !String(g.token).trim()) throw new Error('请先填写 GitHub Token')
  const repoInfo = await ensurePrivateRepo()
  const remoteFile = await readGitHubRemote(repoInfo.full)
  if (!remoteFile || !remoteFile.obj) throw new Error('GitHub 云端还没有可用同步文件；请先在任一设备上传本机版本')
  const remoteRaw = remoteFile.obj
  const state = readSyncState()
  const local = collectAll()
  const remoteHash = syncDataHash(remoteRaw)
  const localHash = syncDataHash(local)
  const meta = cloudEnvelopeMeta(remoteRaw)
  if (localHash !== remoteHash && !options.force && (state.kind !== 'gh' || (state.baseHash && localHash !== state.baseHash))) {
    return { ok: false, needsConfirm: true, direction: 'download', remoteT: meta.t, remoteDevice: meta.deviceLabel, repo: repoInfo.full }
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
    lastStat: 'GitHub 已下载云端版本 ' + new Date(meta.t || Date.now()).toLocaleString()
  })
  return { ok: true, changed: n > 0, ts: meta.t || Date.now(), direction: 'download', repo: repoInfo.full }
}
