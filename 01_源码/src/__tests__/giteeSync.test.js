/* global FormData */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { store } from '../store'
import { runGiteeSync } from '../utils/giteeSync'

const mem = new Map()
const calls = []

function resp(status, body = '') {
  const payload = typeof body === 'string' ? body : JSON.stringify(body)
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return payload
    }
  }
}

async function fakeFetch(url, init = {}) {
  calls.push({ url: String(url), init })
  const u = String(url)
  if (u.includes('/api/v5/user?')) return resp(200, { login: 'owner', name: 'owner' })
  if (u.includes('/contents/xingce-sync.json?')) {
    if (calls.filter((c) => c.url.includes('/contents/xingce-sync.json?')).length > 1) {
      return resp(200, {
        sha: 'abc123',
        content: Buffer.from(JSON.stringify({ app: 'xingce', v: 3, t: 1000, data: { xc_mode: 'remote' } })).toString('base64')
      })
    }
    return resp(404, { message: 'not found' })
  }
  if (u.includes('/api/v5/repos/owner/xingce-ai-cloud-sync?')) {
    return resp(200, { name: 'xingce-ai-cloud-sync', private: true, default_branch: 'master' })
  }
  return resp(200, {})
}

globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
  key: (i) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size
  }
}

describe('giteeSync Gitee API v5 表单协议', () => {
  beforeEach(() => {
    mem.clear()
    calls.length = 0
    store.cfg.gitee = { token: 'ge-test-token', repo: 'owner/xingce-ai-cloud-sync' }
  })

  afterEach(() => {
    delete globalThis.fetch
  })

  it('新建同步文件用 POST + FormData，不再发送 JSON body', async () => {
    mem.set('xc_mode', 'fast')
    globalThis.fetch = fakeFetch
    const r = await runGiteeSync()
    expect(r.ok).toBe(true)
    const post = calls.find((c) => c.init.method === 'POST' && c.url.includes('/contents/xingce-sync.json'))
    expect(post).toBeTruthy()
    expect(post.init.body).toBeInstanceOf(FormData)
    expect(post.init.body.get('access_token')).toBe('ge-test-token')
    expect(post.init.body.get('branch')).toBe('master')
    expect(post.init.body.get('message')).toContain('行测AI自动互通')
    expect(String(post.init.body.get('content')).length).toBeGreaterThan(10)
    expect(post.init.headers['Content-Type'] || post.init.headers['content-type']).toBeUndefined()
    expect(calls.every((c) => (c.init.headers['Content-Type'] || c.init.headers['content-type']) == null)).toBe(true)
  })

  it('更新已有同步文件用 PUT + 最新 sha', async () => {
    mem.set('xc_mode', 'local-new')
    globalThis.fetch = async (url, init = {}) => {
      calls.push({ url: String(url), init })
      const u = String(url)
      if (u.includes('/api/v5/user?')) return resp(200, { login: 'owner' })
      if (u.includes('/contents/xingce-sync.json?')) {
        return resp(200, {
          sha: 'abc123',
          content: Buffer.from(JSON.stringify({ app: 'xingce', v: 3, t: 1000, data: { xc_mode: 'remote' } })).toString('base64')
        })
      }
      if (u.includes('/api/v5/repos/owner/xingce-ai-cloud-sync?')) {
        return resp(200, { name: 'xingce-ai-cloud-sync', private: true, default_branch: 'master' })
      }
      return resp(200, {})
    }
    const r = await runGiteeSync()
    expect(r.ok).toBe(true)
    const put = calls.find((c) => c.init.method === 'PUT' && c.url.includes('/contents/xingce-sync.json'))
    expect(put).toBeTruthy()
    expect(put.init.body).toBeInstanceOf(FormData)
    expect(put.init.body.get('sha')).toBe('abc123')
    expect(put.init.body.get('access_token')).toBe('ge-test-token')
  })

  it('创建私人仓库也按 Gitee 表单字段提交', async () => {
    store.cfg.gitee.repo = ''
    globalThis.fetch = async (url, init = {}) => {
      calls.push({ url: String(url), init })
      const u = String(url)
      if (u.includes('/api/v5/user?')) return resp(200, { login: 'owner' })
      if (u.includes('/api/v5/user/repos?')) return resp(201, { name: 'xingce-ai-cloud-sync', private: true, default_branch: 'master' })
      if (u.includes('/contents/xingce-sync.json?')) {
        return init.method === 'POST' ? resp(201, {}) : resp(404, { message: 'not found' })
      }
      if (u.includes('/api/v5/repos/owner/xingce-ai-cloud-sync?')) return resp(404, { message: 'not found' })
      return resp(200, {})
    }
    const r = await runGiteeSync()
    expect(r.created).toBe(true)
    const made = calls.find((c) => c.init.method === 'POST' && c.url.includes('/api/v5/user/repos?'))
    expect(made).toBeTruthy()
    expect(made.init.body).toBeInstanceOf(FormData)
    expect(made.init.body.get('name')).toBe('xingce-ai-cloud-sync')
    expect(made.init.body.get('private')).toBe('true')
  })

  it('Gitee 对不存在文件返回 200+[] 时按新建文件处理', async () => {
    globalThis.fetch = async (url, init = {}) => {
      calls.push({ url: String(url), init })
      const u = String(url)
      if (u.includes('/api/v5/user?')) return resp(200, { login: 'owner' })
      if (u.includes('/contents/xingce-sync.json?')) {
        return init.method === 'POST' ? resp(201, {}) : resp(200, [])
      }
      if (u.includes('/api/v5/repos/owner/xingce-ai-cloud-sync?')) {
        return resp(200, { name: 'xingce-ai-cloud-sync', private: true, default_branch: 'master' })
      }
      return resp(200, {})
    }
    const r = await runGiteeSync()
    expect(r.ok).toBe(true)
    const post = calls.find((c) => c.init.method === 'POST' && c.url.includes('/contents/xingce-sync.json'))
    expect(post).toBeTruthy()
    expect(post.init.body).toBeInstanceOf(FormData)
    expect(post.init.body.get('branch')).toBe('master')
  })

  it('contents 不带 content 时自动走 Gitee raw 下载全文', async () => {
    globalThis.fetch = async (url, init = {}) => {
      calls.push({ url: String(url), init })
      const u = String(url)
      if (u.includes('/api/v5/user?')) return resp(200, { login: 'owner' })
      if (u.includes('/contents/xingce-sync.json?')) {
        return resp(200, { sha: 'abc123', content: '' })
      }
      if (u.includes('/raw/xingce-sync.json?')) {
        return resp(200, JSON.stringify({ app: 'xingce', v: 3, t: 123, data: { xc_mode: 'cloud' } }))
      }
      if (u.includes('/api/v5/repos/owner/xingce-ai-cloud-sync?')) {
        return resp(200, { name: 'xingce-ai-cloud-sync', private: true, default_branch: 'master' })
      }
      return resp(200, {})
    }
    const r = await runGiteeSync()
    expect(r.ok).toBe(true)
    expect(calls.some((c) => c.url.includes('/raw/xingce-sync.json?'))).toBe(true)
    expect(calls.some((c) => c.init.method === 'POST' || c.init.method === 'PUT')).toBe(false)
  })

  it('contents 与 raw 都读不到时自动用 sha 覆盖重建云端文件', async () => {
    globalThis.fetch = async (url, init = {}) => {
      calls.push({ url: String(url), init })
      const u = String(url)
      if (u.includes('/api/v5/user?')) return resp(200, { login: 'owner' })
      if (u.includes('/contents/xingce-sync.json?')) {
        return init.method === 'PUT' ? resp(200, {}) : resp(200, { sha: 'deadbeef', content: '' })
      }
      if (u.includes('/raw/xingce-sync.json?')) return resp(404, { message: 'not found' })
      if (u.includes('/api/v5/repos/owner/xingce-ai-cloud-sync?')) {
        return resp(200, { name: 'xingce-ai-cloud-sync', private: true, default_branch: 'master' })
      }
      return resp(200, {})
    }
    const r = await runGiteeSync()
    expect(r.ok).toBe(true)
    const put = calls.find((c) => c.init.method === 'PUT' && c.url.includes('/contents/xingce-sync.json'))
    expect(put).toBeTruthy()
    expect(put.init.body.get('sha')).toBe('deadbeef')
  })
})
