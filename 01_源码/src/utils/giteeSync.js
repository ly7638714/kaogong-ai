// giteeSync.js —— Gitee 私人仓库自动互通（国内网页/iPad/安卓均可直连，不需要 GitHub）
// Gitee API 允许浏览器跨域；同步文件仍放在用户自己的私人仓库，学习数据不公开。
/* global btoa, atob, FormData */
import { store, saveCfg } from '../store'
import { collectAll, restoreAll } from './dataBackup'
import { applyLocalMerge, hydrateStoreFromPlan, readSyncState, saveSyncState, syncBaseline, makeCloudEnvelope, cloudEnvelopeMeta, syncDataHash, syncDeviceInfo } from './cloudSync'

const GE_API = 'https://gitee.com/api/v5'
const DEFAULT_REPO = 'xingce-ai-cloud-sync'
const SYNC_FILE = 'xingce-sync.json'

function geCfg() {
  if (!store.cfg.gitee) store.cfg.gitee = { token: '', repo: '' }
  return store.cfg.gitee
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
    throw new Error('Gitee 云端文件解码失败，请删除私人仓库里的 ' + SYNC_FILE + ' 后再同步', { cause: e })
  }
}

function repoSlug(raw) {
  const s = String(raw || '').trim().replace(/^https?:\/\/gitee\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '')
  return s.split('/').filter(Boolean)
}

function friendlyGiteeStatus(status, text) {
  const msg = text ? String(text).slice(0, 260) : 'Gitee HTTP ' + status
  if (status === 401) return 'Gitee 私人令牌无效或已过期，请到 Gitee「设置 → 安全设置 → 私人令牌」重新生成后填写'
  if (status === 403) return 'Gitee 请求被拒绝（可能令牌权限不足或触发频率限制）：请使用带 projects/repository 写权限的私人令牌后重试'
  if (status === 404) return 'Gitee 仓库/同步文件不存在：第一次同步会自动创建私人仓库 ' + DEFAULT_REPO + '；若仍 404 请检查填写的“用户名/仓库名”'
  if (status === 422) return 'Gitee 已拒绝写入：请检查私人令牌权限，并把仓库保持为“私有”'
  return msg
}

async function geFetch(path, options = {}) {
  const g = geCfg()
  const token = String(g.token || '').trim()
  if (!token) throw new Error('请先填写 Gitee 私人令牌')
  const { query, form, ...opts } = options
  const params = { access_token: token }
  if (query) Object.assign(params, query)
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(String(v)))
    .join('&')
  const init = Object.assign({}, opts, { headers: {} })
  if (form) {
    // Gitee API v5 的创建/更新接口要求表单字段，而不是 JSON body。
    const fd = new FormData()
    fd.set('access_token', token)
    for (const [k, v] of Object.entries(form)) {
      if (v === undefined || v === null) continue
      fd.set(k, String(v))
    }
    init.body = fd
  }
  let res
  try {
    res = await fetch(GE_API + path + '?' + qs, init)
  } catch (e) {
    throw new Error('Gitee 网络连接失败，请检查网络后重试', { cause: e })
  }
  let text = ''
  try {
    text = await res.text()
  } catch (e) { /* 空响应/连接中断时不抛 JSON 解析错误 */ }
  let json = null
  const bodyText = String(text || '').trim()
  if (bodyText) {
    try { json = JSON.parse(bodyText) } catch (e) { /* 部分错误响应是 HTML/空页面 */ }
  }
  if (res.ok) return { json, status: res.status, text: bodyText }
  const apiMsg = json && json.message ? String(json.message) : ''
  const raw = apiMsg || (bodyText && !/^\s*</.test(bodyText) ? bodyText : '')
  const err = new Error(friendlyGiteeStatus(res.status, raw))
  err.status = res.status
  err.is404 = res.status === 404
  throw err
}

async function ensurePrivateRepo() {
  const g = geCfg()
  const parts = repoSlug(g.repo)
  let owner = ''
  let name = DEFAULT_REPO
  if (parts.length === 2) { owner = parts[0]; name = parts[1] }
  else if (parts.length === 1) name = parts[0]
  if (!owner) {
    const me = await geFetch('/user')
    owner = me.json && (me.json.login || me.json.name)
  }
  if (!owner) throw new Error('无法识别 Gitee 用户名，请检查私人令牌')
  const full = owner + '/' + name
  let created = false
  let repo = null
  try {
    const existing = await geFetch('/repos/' + full)
    repo = existing.json || {}
    if (repo.private === false) throw new Error('该 Gitee 仓库是公开仓库，学习数据不能公开。请换一个私人仓库名，或删除同名公开仓库后重试')
  } catch (e) {
    if (!e.is404) throw e
    try {
      const made = await geFetch('/user/repos', {
        method: 'POST',
        form: {
          name,
          description: '行测AI学习数据自动互通（私人）',
          private: true,
          auto_init: true
        }
      })
      repo = made.json || {}
      created = true
    } catch (e2) {
      throw new Error('自动创建 Gitee 私人仓库失败：' + (e2.message || e2) + '（可改为填写 用户名/仓库名 使用已有私人仓库）', { cause: e2 })
    }
  }
  if (g.repo !== full) {
    g.repo = full
    try { saveCfg() } catch (e) {}
  }
  return { full, created, branch: (repo && repo.default_branch) || 'master' }
}

async function readRemote(repo, branch) {
  let meta = null
  try {
    const r = await geFetch('/repos/' + repo + '/contents/' + SYNC_FILE, {
      query: { ref: branch }
    })
    meta = r.json || {}
  } catch (e) {
    if (e.is404) return null
    throw e
  }
  if (Array.isArray(meta)) {
    // Gitee 对“文件不存在”的 contents 请求有时会返回 200 + []，而不是 404。
    if (!meta.length) return null
    throw new Error('Gitee 云端同步文件元信息格式异常，请稍后再试')
  }
  if (!meta || !meta.sha) {
    const why = meta && meta.message ? String(meta.message) : ''
    throw new Error('Gitee 云端同步文件元信息读取失败' + (why ? '：' + why : '，请稍后再试'))
  }
  let rawText = ''
  if (meta.content) {
    try {
      rawText = b64DecodeUtf8(meta.content)
    } catch (e) {
      return { obj: null, sha: meta.sha, unreadable: true }
    }
  } else {
    // Gitee contents API 对较大文件不返回 content，改走 raw 下载接口读取全文。
    try {
      const raw = await geFetch('/repos/' + repo + '/raw/' + SYNC_FILE, {
        query: { ref: branch }
      })
      rawText = raw.text || ''
    } catch (e) {
      return { obj: null, sha: meta.sha, unreadable: true }
    }
  }
  if (!String(rawText || '').trim()) {
    return { obj: null, sha: meta.sha, unreadable: true }
  }
  let parsed = null
  try {
    parsed = JSON.parse(rawText)
  } catch (e) {
    return { obj: null, sha: meta.sha, unreadable: true }
  }
  return { obj: parsed, sha: meta.sha }
}

async function writeRemote(repo, branch, content, sha) {
  const baseForm = {
    content: b64EncodeUtf8(content),
    message: '行测AI自动互通 ' + new Date().toLocaleString(),
    branch
  }
  const path = '/repos/' + repo + '/contents/' + SYNC_FILE
  const send = (method, extra = {}) => geFetch(path, {
    method,
    form: Object.assign({}, baseForm, extra)
  })
  if (!sha) return send('POST')
  try {
    return await send('PUT', { sha })
  } catch (e) {
    if (e.status !== 404 && e.status !== 409 && e.status !== 422) throw e
    // 内容版本冲突时取最新 sha 重试一次，避免用户明明成功却看到失败提示。
    try {
      const fresh = await geFetch('/repos/' + repo + '/contents/' + SYNC_FILE, {
        query: { ref: branch }
      })
      const freshSha = fresh.json && fresh.json.sha
      if (freshSha && freshSha !== sha) return await send('PUT', { sha: freshSha })
    } catch { /* 重试失败时交给下方统一提示 */ }
    throw new Error('Gitee 同步文件更新冲突，请再次点击「立即同步」重试；若仍失败，请到 Gitee 删除仓库里的 ' + SYNC_FILE + ' 后重新开启自动互通', { cause: e })
  }
}

export async function runGiteeSync() {
  const g = geCfg()
  if (!g.token || !String(g.token).trim()) throw new Error('请先填写 Gitee 私人令牌')
  const repoInfo = await ensurePrivateRepo()
  const remoteFile = await readRemote(repoInfo.full, repoInfo.branch)
  const remoteRaw = remoteFile && remoteFile.obj ? remoteFile.obj : null
  const state = readSyncState()
  const plan = applyLocalMerge(collectAll(), remoteRaw, state.base)
  hydrateStoreFromPlan(plan)
  const body = makeCloudEnvelope(plan.merged)
  let putTs = remoteRaw && remoteRaw.t ? Number(remoteRaw.t) : 0
  // 云端文件无法解析时仍用最新 sha 覆盖重建，不让用户手动去仓库删文件。
  if (!plan.sameAsRemote || (remoteFile && remoteFile.unreadable)) {
    await writeRemote(repoInfo.full, repoInfo.branch, JSON.stringify(body), remoteFile ? remoteFile.sha : '')
    putTs = body.t
  }
  const finalTs = putTs || Date.now()
  const remoteMeta = cloudEnvelopeMeta(remoteRaw)
  const own = syncDeviceInfo()
  saveSyncState({
    ...state,
    kind: 'ge',
    last: finalTs,
    lastAction: 'merge',
    at: Date.now(),
    localT: finalTs,
    remoteT: finalTs,
    remoteDevice: remoteMeta.t ? { id: remoteMeta.deviceId, label: remoteMeta.deviceLabel } : own,
    baseHash: syncDataHash(plan.merged),
    lastStat: 'Gitee 智能合并 ' + new Date(finalTs).toLocaleString(),
    base: syncBaseline(plan.merged)
  })
  return { ok: true, changed: plan.changed > 0, ts: finalTs, repo: repoInfo.full, created: repoInfo.created, direction: 'merge' }
}

export async function runGiteeUpload(options = {}) {
  const g = geCfg()
  if (!g.token || !String(g.token).trim()) throw new Error('请先填写 Gitee 私人令牌')
  const repoInfo = await ensurePrivateRepo()
  const remoteFile = await readRemote(repoInfo.full, repoInfo.branch)
  const remoteRaw = remoteFile && remoteFile.obj ? remoteFile.obj : null
  const state = readSyncState()
  const local = collectAll()
  const meta = cloudEnvelopeMeta(remoteRaw)
  const sameAsLocal = remoteRaw ? syncDataHash(remoteRaw) === syncDataHash(local) : false
  if (remoteRaw && !options.force && !sameAsLocal && (state.kind !== 'ge' || meta.t > state.remoteT)) {
    return { ok: false, needsConfirm: true, direction: 'upload', remoteT: meta.t, remoteDevice: meta.deviceLabel, repo: repoInfo.full }
  }
  const body = makeCloudEnvelope(local.data)
  await writeRemote(repoInfo.full, repoInfo.branch, JSON.stringify(body), remoteFile ? remoteFile.sha : '')
  saveSyncState({
    ...state,
    kind: 'ge',
    last: body.t,
    lastAction: 'upload',
    at: Date.now(),
    localT: body.t,
    remoteT: body.t,
    remoteDevice: syncDeviceInfo(),
    baseHash: syncDataHash(body),
    lastStat: 'Gitee 已上传本机版本 ' + new Date(body.t).toLocaleString()
  })
  return { ok: true, changed: true, ts: body.t, direction: 'upload', repo: repoInfo.full, created: repoInfo.created }
}

export async function runGiteeDownload(options = {}) {
  const g = geCfg()
  if (!g.token || !String(g.token).trim()) throw new Error('请先填写 Gitee 私人令牌')
  const repoInfo = await ensurePrivateRepo()
  const remoteFile = await readRemote(repoInfo.full, repoInfo.branch)
  if (!remoteFile || !remoteFile.obj) throw new Error('Gitee 云端还没有可用同步文件；请先在任一设备上传本机版本')
  const remoteRaw = remoteFile.obj
  const state = readSyncState()
  const local = collectAll()
  const remoteHash = syncDataHash(remoteRaw)
  const localHash = syncDataHash(local)
  const meta = cloudEnvelopeMeta(remoteRaw)
  if (localHash !== remoteHash && !options.force && (state.kind !== 'ge' || (state.baseHash && localHash !== state.baseHash))) {
    return { ok: false, needsConfirm: true, direction: 'download', remoteT: meta.t, remoteDevice: meta.deviceLabel, repo: repoInfo.full }
  }
  const n = restoreAll(remoteRaw)
  saveSyncState({
    ...state,
    kind: 'ge',
    last: Date.now(),
    lastAction: 'download',
    at: Date.now(),
    localT: meta.t || Date.now(),
    remoteT: meta.t || Date.now(),
    remoteDevice: { id: meta.deviceId, label: meta.deviceLabel },
    baseHash: remoteHash,
    lastStat: 'Gitee 已下载云端版本 ' + new Date(meta.t || Date.now()).toLocaleString()
  })
  return { ok: true, changed: n > 0, ts: meta.t || Date.now(), direction: 'download', repo: repoInfo.full }
}
