// giteeSync.js —— Gitee 私人仓库自动互通（国内网页/iPad/安卓均可直连，不需要 GitHub）
// Gitee API 允许浏览器跨域；同步文件仍放在用户自己的私人仓库，学习数据不公开。
/* global btoa, atob */
import { store, saveCfg } from '../store'
import { collectAll } from './dataBackup'
import { applyLocalMerge, readSyncState, saveSyncState, syncBaseline } from './cloudSync'

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
  const msg = text || 'Gitee HTTP ' + status
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
  const params = { access_token: token }
  const { query, ...opts } = options
  if (query) Object.assign(params, query)
  const qs = Object.entries(params).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(String(v))).join('&')
  const headers = { 'Content-Type': 'application/json' }
  let res
  try {
    res = await fetch(GE_API + path + '?' + qs, Object.assign({}, opts, { headers }))
  } catch (e) {
    throw new Error('Gitee 网络连接失败，请检查网络后重试', { cause: e })
  }
  let json = null
  try { json = await res.json() } catch (e) { /* 部分错误响应无 JSON */ }
  if (res.ok) return { json, status: res.status }
  const raw = json && json.message ? String(json.message) : ''
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
        body: JSON.stringify({
          name,
          description: '行测AI学习数据自动互通（私人）',
          private: true,
          auto_init: true
        })
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
  try {
    const r = await geFetch('/repos/' + repo + '/contents/' + SYNC_FILE, {
      query: { ref: branch }
    })
    const obj = r.json || {}
    const parsed = JSON.parse(b64DecodeUtf8(obj.content))
    return { obj: parsed, sha: obj.sha }
  } catch (e) {
    if (e.is404) return null
    throw e
  }
}

async function writeRemote(repo, branch, content, sha) {
  const payload = {
    content: b64EncodeUtf8(content),
    message: '行测AI自动互通 ' + new Date().toLocaleString(),
    branch
  }
  if (sha) payload.sha = sha
  try {
    await geFetch('/repos/' + repo + '/contents/' + SYNC_FILE, {
      method: sha ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    })
  } catch (e) {
    // 个别 Gitee 版本只开放 POST 新建/更新；带 sha 更新遇到 404/405/422 时自动改用 POST 重试。
    if (!sha || (e.status !== 404 && e.status !== 405 && e.status !== 422)) throw e
    await geFetch('/repos/' + repo + '/contents/' + SYNC_FILE, {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  }
}

export async function runGiteeSync() {
  const g = geCfg()
  if (!g.token || !String(g.token).trim()) throw new Error('请先填写 Gitee 私人令牌')
  const repoInfo = await ensurePrivateRepo()
  const remoteFile = await readRemote(repoInfo.full, repoInfo.branch)
  const remoteRaw = remoteFile ? remoteFile.obj : null
  const state = readSyncState()
  const plan = applyLocalMerge(collectAll(), remoteRaw, state.base)
  const body = { app: 'xingce', v: 3, kind: 'cloud-sync', t: Date.now(), data: plan.merged }
  let putTs = remoteRaw && remoteRaw.t ? Number(remoteRaw.t) : 0
  if (!plan.sameAsRemote) {
    await writeRemote(repoInfo.full, repoInfo.branch, JSON.stringify(body), remoteFile ? remoteFile.sha : '')
    putTs = body.t
  }
  saveSyncState({
    kind: 'ge',
    auto: state.auto,
    last: putTs,
    lastStat: '已同步 ' + new Date(putTs).toLocaleString(),
    base: syncBaseline(plan.merged)
  })
  return { ok: true, changed: plan.changed > 0, ts: putTs, repo: repoInfo.full, created: repoInfo.created }
}
