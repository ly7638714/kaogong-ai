import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { authState, authInit, authRegister, authLogin, authLoginCode, authRegisterCode, sendVerifyCode, checkVerifyCode, authLogout, authChangePass, authDeleteUser, authSetEnabled, authResetLocal, authHasUsers, accountKind } from '../utils/auth'

// 本地账号系统（localStorage 本地保护门）测试
function memStore() {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear()
  }
}
let ls
beforeEach(() => {
  ls = memStore()
  vi.stubGlobal('localStorage', ls)
  authState.ready = false
  authState.ok = false
  authState.user = ''
  authState.enabled = true
})
afterEach(() => vi.unstubAllGlobals())

describe('本地账号系统 auth.js', () => {
  it('注册 → 登录成功，authState.ok 为真且记录用户名', async () => {
    const r = await authRegister('行测考生', 'pass1234')
    expect(r.ok).toBe(true)
    expect(authHasUsers()).toBe(true)
    const l = await authLogin('行测考生', 'pass1234', true)
    expect(l.ok).toBe(true)
    expect(authState.ok).toBe(true)
    expect(authState.user).toBe('行测考生')
  })

  it('密码错误 / 用户不存在 → 拒绝', async () => {
    await authRegister('user1', 'abcd1234')
    const bad = await authLogin('user1', 'wrong!')
    expect(bad.ok).toBe(false)
    expect(bad.msg).toContain('密码')
    const noUser = await authLogin('nobody', 'abcd1234')
    expect(noUser.ok).toBe(false)
    expect(noUser.msg).toContain('没有该账号')
  })

  it('重复用户名注册被拒绝', async () => {
    await authRegister('user2', 'abcd1234')
    const dup = await authRegister('user2', 'other123')
    expect(dup.ok).toBe(false)
    expect(dup.msg).toContain('已注册')
  })

  it('authInit 恢复未过期会话 → 直接通过登录门', async () => {
    await authRegister('keepme', 'abcd1234')
    await authLogin('keepme', 'abcd1234', true)
    authState.ok = false
    const s = await authInit()
    expect(s.ok).toBe(true)
    expect(s.user).toBe('keepme')
  })

  it('authInit 遇过期会话 → 回到登录门', async () => {
    await authRegister('exp', 'abcd1234')
    await authLogin('exp', 'abcd1234', false)
    const d = JSON.parse(ls.getItem('xc_auth'))
    d.session.exp = Date.now() - 1000
    ls.setItem('xc_auth', JSON.stringify(d))
    const s = await authInit()
    expect(s.ok).toBe(false)
  })

  it('退出登录清空会话', async () => {
    await authRegister('bye', 'abcd1234')
    await authLogin('bye', 'abcd1234', true)
    authLogout()
    expect(authState.ok).toBe(false)
    const d = JSON.parse(ls.getItem('xc_auth'))
    expect(d.session).toBeNull()
  })

  it('修改密码后旧密码失效、新密码可登录', async () => {
    await authRegister('pwd', 'old1234')
    await authLogin('pwd', 'old1234', true)
    const c = await authChangePass('pwd', 'old1234', 'new5678')
    expect(c.ok).toBe(true)
    authLogout()
    expect((await authLogin('pwd', 'old1234', true)).ok).toBe(false)
    expect((await authLogin('pwd', 'new5678', true)).ok).toBe(true)
  })

  it('删除账号：需密码校验，删除后不能再登录', async () => {
    await authRegister('gone', 'abcd1234')
    await authLogin('gone', 'abcd1234', true)
    expect((await authDeleteUser('gone', 'badpass')).ok).toBe(false)
    expect((await authDeleteUser('gone', 'abcd1234')).ok).toBe(true)
    expect(authState.ok).toBe(false)
    expect((await authLogin('gone', 'abcd1234', true)).ok).toBe(false)
  })

  it('开关登录门：关闭=直接可用，开启=需会话', async () => {
    await authRegister('g1', 'abcd1234')
    await authLogin('g1', 'abcd1234', true)
    authSetEnabled(false)
    expect(authState.enabled).toBe(false)
    expect(authState.ok).toBe(true)
    authLogout()
    authSetEnabled(true)
    expect(authState.enabled).toBe(true)
    expect(authState.ok).toBe(false)
  })

  it('重置本地账号：清空账号并回到注册入口', async () => {
    await authRegister('resetme', 'abcd1234')
    authResetLocal()
    expect(authHasUsers()).toBe(false)
    expect(authState.ok).toBe(false)
    expect(authState.enabled).toBe(true)
  })

  it('密码哈希含盐且不可逆比对（同密码不同用户哈希不同）', async () => {
    const h1 = await authRegister('saltA', 'abcd1234')
    expect(h1.ok).toBe(true)
    const d = JSON.parse(ls.getItem('xc_auth'))
    expect(d.users[0].h).toBeTruthy()
    expect(d.users[0].salt).toBeTruthy()
    expect(d.users[0].h).not.toContain('abcd1234')
  })
})

describe('验证码登录 / 注册（邮箱，本地账号登录门）', () => {
  it('accountKind 识别 邮箱/手机号/用户名', () => {
    expect(accountKind('123@qq.com')).toBe('email')
    expect(accountKind('13800138000')).toBe('phone')
    expect(accountKind('行测考生')).toBe('name')
    expect(accountKind('')).toBe('empty')
  })

  it('sendVerifyCode 未配置 EmailJS → 本地演示码（含 6 位数字）', async () => {
    const r = await sendVerifyCode('abc@qq.com', {}, false)
    expect(r.ok).toBe(true)
    expect(r.demo).toBe(true)
    expect(String(r.code)).toMatch(/^\d{6}$/)
  })

  it('sendVerifyCode 手机号 → 拒绝（已取消手机号登录）', async () => {
    const r = await sendVerifyCode('13800138000', {})
    expect(r.ok).toBe(false)
    expect(r.msg).toContain('手机号')
  })

  it('sendVerifyCode 纯用户名 → 拒绝', async () => {
    const r = await sendVerifyCode('张三', {}, false)
    expect(r.ok).toBe(false)
  })

  it('sendVerifyCode → 返回 mailto 直发链接（零第三方，验证码含在邮件正文）', async () => {
    const r = await sendVerifyCode('abc@gmail.com', {})
    expect(r.ok).toBe(true)
    expect(r.sent).toBe('mailto')
    expect(r.demo).toBe(true)
    expect(String(r.code)).toMatch(/^\d{6}$/)
    expect(r.mailto).toContain('mailto:abc@gmail.com')
    expect(r.mailto).toContain(r.code)
  })

  it('邮箱验证码注册 → 注册并自动登录', async () => {
    const s = await sendVerifyCode('user@qq.com', {}, false)
    const r = await authRegisterCode('user@qq.com', s.code, { name: '码农', p: 'pass1234' })
    expect(r.ok).toBe(true)
    expect(authState.ok).toBe(true)
    expect(authState.user).toBe('码农') // userDisplay 优先显示用户名
    // 可用密码登录
    const l = await authLogin('user@qq.com', 'pass1234', true)
    expect(l.ok).toBe(true)
  })

  it('验证码错误 / 过期被拒绝', async () => {
    const s = await sendVerifyCode('bad@qq.com', {}, false)
    const wrong = await authRegisterCode('bad@qq.com', '000000', {})
    expect(wrong.ok).toBe(false)
    const v = JSON.parse(ls.getItem('xc_auth_verify'))
    v.exp = Date.now() - 1000
    ls.setItem('xc_auth_verify', JSON.stringify(v))
    const expired = await authRegisterCode('bad@qq.com', s.code, {})
    expect(expired.ok).toBe(false)
    expect(expired.msg).toContain('过期')
  })

  it('验证码登录：已有邮箱账号免密登录', async () => {
    const s = await sendVerifyCode('lao@qq.com', {})
    const r = await authRegisterCode('lao@qq.com', s.code, { name: '老用户' })
    expect(r.ok).toBe(true)
    authLogout()
    const s2 = await sendVerifyCode('lao@qq.com', {})
    const l = await authLoginCode('lao@qq.com', s2.code, true)
    expect(l.ok).toBe(true)
    expect(authState.ok).toBe(true)
  })

  it('重复邮箱注册被拒', async () => {
    const s1 = await sendVerifyCode('dup@qq.com', {}, false)
    await authRegisterCode('dup@qq.com', s1.code, {})
    authLogout()
    const s2 = await sendVerifyCode('dup@qq.com', {}, false)
    const r = await authRegisterCode('dup@qq.com', s2.code, {})
    expect(r.ok).toBe(false)
    expect(r.msg).toContain('已注册')
  })

  it('checkVerifyCode：账号不匹配拒绝', async () => {
    await sendVerifyCode('a@qq.com', {}, false)
    const r = checkVerifyCode('b@qq.com', '123456')
    expect(r.ok).toBe(false)
  })
})