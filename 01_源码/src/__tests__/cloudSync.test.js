import { describe, it, expect } from 'vitest'
import { applyLocalMerge, hydrateStoreFromPlan, mergeArrays, mergeSyncData, shouldSyncKey, syncScopeFromBackup, makeCloudEnvelope, cloudEnvelopeMeta, syncDataHash, syncOverview, saveSyncState } from '../utils/cloudSync'
import { webdavFileUrl, webdavSyncUrl, describeWebdavHttp } from '../utils/webdav'
import { store } from '../store'

const testMem = new Map()
globalThis.localStorage = {
  getItem: (k) => (testMem.has(k) ? testMem.get(k) : null),
  setItem: (k, v) => testMem.set(k, String(v)),
  removeItem: (k) => testMem.delete(k),
  key: (i) => [...testMem.keys()][i] ?? null,
  get length() { return testMem.size }
}

describe('cloudSync 多端安全合并', () => {
  it('远端/本机不同集合都保留，不整包覆盖', () => {
    const a = [{ id: 1, t: 1690000000100, stem: 'A' }, { id: 2, t: 1690000000200, stem: 'B' }]
    const b = [{ id: 3, t: 1690000000300, stem: 'C' }]
    const m = mergeArrays(a, b)
    expect(m.map((x) => x.id)).toEqual([1, 2, 3])
  })

  it('同 id 按更新时间取新，且远端只新增项不丢', () => {
    const a = [{ id: 'q1', t: 1690000000100, answer: 'A' }]
    const b = [{ id: 'q1', t: 1690000000300, answer: 'B' }, { id: 'q2', t: 1690000000400, answer: 'C' }]
    const m = mergeArrays(a, b)
    expect(m.find((x) => x.id === 'q1').answer).toBe('B')
    expect(m.some((x) => x.id === 'q2')).toBe(true)
  })

  it('本机无未上传改动时，同 id 同时间戳优先采用云端新版本', () => {
    const time = 1690000000100
    const local = [{ id: 'q1', t: time, question: '网页旧题面' }]
    const remote = [{ id: 'q1', t: time, question: '手机新题面' }]
    expect(mergeArrays(local, remote, 'xc_wqs', false)[0].question).toBe('网页旧题面')
    expect(mergeArrays(local, remote, 'xc_wqs', true)[0].question).toBe('手机新题面')
    const merged = mergeSyncData({ xc_wqs: JSON.stringify(local) }, { xc_wqs: JSON.stringify(remote) }, {}, { preferRemote: true })
    expect(JSON.parse(merged.xc_wqs)[0].question).toBe('手机新题面')
  })

  it('只同步学习数据，不同步 cfg/本机 UI/密钥类键', () => {
    expect(shouldSyncKey('xc_msgs')).toBe(true)
    expect(shouldSyncKey('xc_cfg')).toBe(false)
    expect(shouldSyncKey('xc_auth')).toBe(false)
    expect(shouldSyncKey('xc_pet_pos_d')).toBe(false)
    const scoped = syncScopeFromBackup({ data: { xc_msgs: '[]', xc_cfg: '{}', xc_pet_pos_d: '{}', xc_pet: '{}' } })
    expect(Object.keys(scoped).sort()).toEqual(['xc_msgs', 'xc_pet'])
  })

  it('同步时修复 xc_tasks 里被二次序列化的任务数组', () => {
    const legacy = JSON.stringify({ date: '2026-09-07', items: JSON.stringify([{ k: 'p', done: false }]) })
    const scoped = syncScopeFromBackup({ data: { xc_tasks: legacy } })
    const parsed = JSON.parse(scoped.xc_tasks)
    expect(Array.isArray(parsed.items)).toBe(true)
    expect(parsed.items).toHaveLength(1)
  })

  it('本机未修改且云端更新时，标量采用云端；本机也改了则本机优先', () => {
    const base = { xc_mode: 'all' }
    const local = { xc_mode: 'all' }
    const remote = { xc_mode: 'luoji' }
    expect(mergeSyncData(local, remote, base).xc_mode).toBe('luoji')
    expect(mergeSyncData({ xc_mode: 'tutu' }, remote, base).xc_mode).toBe('tutu')
  })

  it('远端空数组/空对象也能把本机已有项带去云端', () => {
    const local = { xc_msgs: JSON.stringify([{ id: 'm1', t: 1690000000100, role: 'user' }]) }
    const remote = { xc_msgs: JSON.stringify([]) }
    const merged = mergeSyncData(local, remote, {})
    expect(JSON.parse(merged.xc_msgs)).toHaveLength(1)
  })

  it('错题永久删除墓碑会过滤本地与云端旧记录', () => {
    const local = {
      xc_wqs: JSON.stringify([]),
      xc_wq_deleted: JSON.stringify([{ id: 'w1', qhash: 'q1', t: 1690000000100 }])
    }
    const remote = {
      xc_wqs: JSON.stringify([{ id: 'w1', question: '已经删除的旧题', t: 1690000000000 }])
    }
    const merged = mergeSyncData(local, remote, {})
    expect(JSON.parse(merged.xc_wqs)).toEqual([])
    expect(JSON.parse(merged.xc_wq_deleted)).toHaveLength(1)
  })

  it('applyLocalMerge 下载远端后把两端集合安全合并并写回本机', () => {
    testMem.clear()
    testMem.set('xc_msgs', JSON.stringify([{ id: 'm1', t: 1690000000100, role: 'user', text: '本机' }]))
    const backup = {
      data: {
        xc_msgs: JSON.stringify([{ id: 'm2', t: 1690000000300, role: 'assistant', text: '云端' }]),
        xc_cfg: '{"webdav":{"pass":"secret"}}'
      }
    }
    const plan = applyLocalMerge({ data: { xc_msgs: testMem.get('xc_msgs') } }, backup, {})
    const localItems = JSON.parse(JSON.parse(JSON.stringify(localStorage.getItem('xc_msgs'))))
    expect(localItems.map((x) => x.id)).toEqual(['m1', 'm2'])
    expect(plan.sameAsRemote).toBe(false)
    expect(localStorage.getItem('xc_cfg')).toBeNull()
  })

  it('同步合并后把对话记录回填到界面（此前只回填错题，导致“另一端对话没同步”）', () => {
    testMem.clear()
    const local = { id: 'm1', t: 1690000000100, role: 'user', content: '本机消息' }
    const remote = { id: 'm2', t: 1690000000200, role: 'assistant', content: '云端消息' }
    testMem.set('xc_msgs', JSON.stringify([local]))
    const backup = { data: { xc_msgs: JSON.stringify([remote]) } }
    const plan = applyLocalMerge({ data: { xc_msgs: testMem.get('xc_msgs') } }, backup, {})
    store.msgs = []
    hydrateStoreFromPlan(plan)
    expect(store.msgs.map((m) => m.id)).toEqual(['m1', 'm2'])
  })

  it('坚果云根地址/目录地址自动补齐成可写的 JSON 文件地址', () => {
    expect(webdavFileUrl('https://dav.jianguoyun.com/dav/')).toBe('https://dav.jianguoyun.com/dav/xingce-ai.json')
    expect(webdavFileUrl('https://dav.jianguoyun.com/dav')).toBe('https://dav.jianguoyun.com/dav/xingce-ai.json')
    expect(webdavFileUrl('https://dav.jianguoyun.com/dav/我的行测/')).toBe('https://dav.jianguoyun.com/dav/我的行测/xingce-ai.json')
    expect(webdavFileUrl('https://dav.jianguoyun.com/dav/行测AI备份.json')).toBe('https://dav.jianguoyun.com/dav/行测AI备份.json')
    expect(webdavSyncUrl('https://dav.jianguoyun.com/dav/行测AI备份.json')).toBe('https://dav.jianguoyun.com/dav/行测AI备份.sync.json')
  })

  it('404 上传/下载会给出中文修复指引，401 提示应用密码', () => {
    expect(describeWebdavHttp(404, 'PUT')).toContain('坚果云模板')
    expect(describeWebdavHttp(401, 'GET')).toContain('应用密码')
    expect(describeWebdavHttp(409, 'PUT')).toContain('冲突')
  })

  it('版本信封携带本机设备信息，并可判断本机是否有未上传改动', () => {
    testMem.clear()
    testMem.set('xc_mode', 'fast')
    const env = makeCloudEnvelope({ xc_mode: 'fast' })
    expect(env.device.id).toBeTruthy()
    expect(cloudEnvelopeMeta(env).deviceLabel).toBe('网页/桌面端')
    saveSyncState({ kind: 'ge', baseHash: syncDataHash(env), localT: env.t, remoteT: env.t })
    expect(syncOverview().dirty).toBe(false)
    testMem.set('xc_mode', 'luoji')
    expect(syncOverview().dirty).toBe(true)
  })
})
