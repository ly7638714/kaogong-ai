// auth.js —— 本地账号注册 / 登录（localStorage 本地保护门，无后端）
// ---------------------------------------------------------------------------
// 设计目标：用户要求「登录才可以使用本项目」，且希望用邮箱 + 验证码直接登录。
// 本项目是纯前端 PWA、无服务器，因此实现为「本地保护门」：
//   · 账号 = 邮箱（QQ、Gmail 等任意邮箱）或 用户名（可选，用于密码登录）；
//   · 登录方式 = ①密码登录（邮箱/用户名 + 密码，兼容旧账号） ②验证码登录（邮箱 + 6 位验证码，免密）；
//   · 注册 = 填邮箱 → 发送验证码 → 校验通过即注册并登录（可另设密码）。
// 验证码发送（零第三方、真实到邮箱）：
//   · 纯前端无法直接调 SMTP 自动发信（需服务器/第三方），本项目方案 = 生成验证码后用
//     用户自己的邮箱客户端发送（mailto 一键打开邮件客户端，验证码邮件已填好，点发送即
//     真实到达收件箱）；页面同时显示验证码作为兜底，流程永远可完成。
//   · 已取消手机号登录（手机短信需后端短信服务商，纯前端无法实现）。
// 安全：密码 SHA-256 加盐哈希；账号/会话/验证码只存本机，不上传。
// 清除站点数据或换浏览器会丢失账号（学习数据不受影响），用「重置本地账号」可恢复入口。
// ---------------------------------------------------------------------------
import { reactive } from 'vue'

const KEY = 'xc_auth'
const VERIFY_KEY = 'xc_auth_verify'
const SESSION_DAYS = 7
const TAB_SESSION_MS = 8 * 3600 * 1000 // 不勾「记住我」：8 小时后需重登
const CODE_TTL = 5 * 60 * 1000 // 验证码 5 分钟有效

export const authState = reactive({ ready: false, ok: false, user: '', enabled: true })

function read() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || '{}')
    return {
      users: Array.isArray(d.users) ? d.users : [],
      session: d.session || null,
      enabled: d.enabled !== false
    }
  } catch (e) {
    return { users: [], session: null, enabled: true }
  }
}
function write(d) {
  try { localStorage.setItem(KEY, JSON.stringify(d)) } catch (e) {}
}
function readVerify() {
  try { return JSON.parse(localStorage.getItem(VERIFY_KEY) || 'null') } catch (e) { return null }
}
function writeVerify(v) {
  try { localStorage.setItem(VERIFY_KEY, JSON.stringify(v)) } catch (e) {}
}
function clearVerify() {
  try { localStorage.removeItem(VERIFY_KEY) } catch (e) {}
}
function randSalt() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}
function newId() {
  return 'u_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
}

// SHA-256 加盐哈希（浏览器 / Node 均可）；crypto.subtle 不可用时回退纯 JS FNV-1a
export async function hashPass(u, p, salt) {
  const s = `${u}::${p}::${salt}`
  const enc = new TextEncoder().encode(s)
  try {
    if (globalThis.crypto && globalThis.crypto.subtle) {
      const buf = await globalThis.crypto.subtle.digest('SHA-256', enc)
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
    }
  } catch (e) { /* fall through */ }
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (const b of enc) {
    h1 = Math.imul(h1 ^ b, 16777619) >>> 0
    h2 = Math.imul(h2 ^ b, 2166136261) >>> 0
  }
  return 'fnv_' + h1.toString(16) + h2.toString(16)
}

// 识别账号类型：email=QQ/任意邮箱（含 @） / phone=11 位手机号 / name=用户名
export function accountKind(acc) {
  const s = String(acc || '').trim()
  if (!s) return 'empty'
  if (/@/.test(s)) return 'email'
  if (/^1[3-9]\d{9}$/.test(s)) return 'phone'
  return 'name'
}
export function accountLabel(acc) {
  const k = accountKind(acc)
  return k === 'email' ? '邮箱' : k === 'phone' ? '手机号' : '用户名'
}

// 按 用户名 / 邮箱 / 手机号 任一匹配用户
export function findUser(d, acc) {
  const s = String(acc || '').trim()
  if (!s) return null
  return d.users.find((x) => x.u === s || x.email === s || x.phone === s) || null
}
export function userDisplay(user) {
  if (!user) return ''
  return user.u || user.email || user.phone || user.id || ''
}

export function authHasUsers() {
  return read().users.length > 0
}

// 应用启动时调用一次：恢复会话（未过期）→ 通过登录门；否则回到登录门
export async function authInit() {
  const d = read()
  authState.enabled = d.enabled
  let cur = null
  if (d.session && d.session.exp > Date.now()) {
    cur = d.users.find((x) => x.id === d.session.id) || d.users.find((x) => x.u === d.session.u) || null
  }
  if (cur) {
    authState.ok = true
    authState.user = userDisplay(cur)
  } else {
    authState.ok = false
    authState.user = ''
  }
  authState.ready = true
  return authState
}
export function authCurrentUser() {
  const d = read()
  if (!d.session || d.session.exp <= Date.now()) return null
  return d.users.find((x) => x.id === d.session.id) || d.users.find((x) => x.u === d.session.u) || null
}

function makeSession(d, user, remember) {
  const exp = Date.now() + (remember ? SESSION_DAYS * 864e5 : TAB_SESSION_MS)
  write({ users: d.users, session: { id: user.id, exp }, enabled: d.enabled })
  authState.ok = true
  authState.user = userDisplay(user)
}

// ---------- 密码注册 / 登录（兼容旧用户名账号） ----------
export async function authRegister(u, p, opt = {}) {
  const d = read()
  const name = String(u || '').trim()
  const email = String(opt.email || '').trim().toLowerCase()
  const phone = String(opt.phone || '').trim()
  const needName = !email && !phone
  if (needName) {
    if (!/^[\w\u4e00-\u9fa5-]{2,20}$/.test(name)) return { ok: false, msg: '用户名需 2-20 位（中英文/数字/下划线/短横线）' }
  } else if (name && !/^[\w\u4e00-\u9fa5-]{2,20}$/.test(name)) {
    return { ok: false, msg: '用户名需 2-20 位（中英文/数字/下划线/短横线）' }
  }
  if (!p || String(p).length < 4) return { ok: false, msg: '密码至少 4 位' }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, msg: '邮箱格式不正确' }
  if (phone && !/^1[3-9]\d{9}$/.test(phone)) return { ok: false, msg: '手机号格式不正确' }
  const dup = d.users.find((x) => (name && x.u === name) || (email && x.email === email) || (phone && x.phone === phone))
  if (dup) return { ok: false, msg: '该账号已注册，请直接登录' }
  const salt = randSalt()
  const h = await hashPass(email || phone || name, String(p), salt)
  d.users.push({ id: newId(), u: name || '', email, phone, salt, h })
  write({ users: d.users, session: null, enabled: d.enabled })
  return { ok: true, user: d.users[d.users.length - 1] }
}

export async function authLogin(acc, p, remember = true) {
  const d = read()
  const user = findUser(d, acc)
  if (!user) return { ok: false, msg: '本机没有该账号：请先注册（本地账号仅存本机，跨设备/清除数据后需重新注册）' }
  const h = await hashPass(user.email || user.phone || user.u, String(p), user.salt)
  if (h !== user.h) return { ok: false, msg: '密码不正确' }
  makeSession(d, user, remember)
  return { ok: true }
}

// ---------- 验证码发送（EmailJS 真实发送 / 本地演示） ----------
// cfg = { emailJs: { serviceId, templateId, publicKey } }；forceDemo=true 强制本地演示码
export function sendVerifyCode(account, _cfg = {}) {
  // 说明：纯前端无法直接调 SMTP 自动发信（需服务器/第三方）。本项目「零第三方」方案 =
  // 生成验证码后用用户自己的邮箱客户端发送（mailto 一键打开邮件客户端，验证码邮件已填好，
  // 点发送即真实到达收件箱）；页面同时显示验证码作为兜底，流程永远可完成。
  const acc = String(account || '').trim()
  if (!acc) return { ok: false, msg: '请输入邮箱' }
  const kind = accountKind(acc)
  if (kind === 'phone') return { ok: false, msg: '已取消手机号登录，请使用邮箱（如 123@qq.com / xxx@gmail.com）' }
  if (kind !== 'email') return { ok: false, msg: '请输入邮箱（如 123@qq.com / xxx@gmail.com）' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(acc)) return { ok: false, msg: '邮箱格式不正确' }
  const code = String(Math.floor(100000 + Math.random() * 900000))
  const exp = Date.now() + CODE_TTL
  writeVerify({ account: acc, code, exp, channel: 'mailto' })
  const subject = encodeURIComponent('行测智能助教 · 登录验证码')
  const body = encodeURIComponent('你的行测智能助教登录验证码是 ' + code + '，5 分钟内有效。\n\n（如非本人操作请忽略本邮件）')
  const mailto = 'mailto:' + acc + '?subject=' + subject + '&body=' + body
  return {
    ok: true,
    sent: 'mailto',
    demo: true,
    code,
    mailto,
    msg: '验证码 ' + code + ' 已生成：点「📧 用我自己的邮箱发送」会打开你的邮件客户端，把这封验证码邮件真实发到 ' + acc + '（无需任何第三方服务）'
  }
}

// 校验验证码：account 须与发送时一致且未过期
export function checkVerifyCode(account, code) {
  const v = readVerify()
  if (!v) return { ok: false, msg: '请先发送验证码' }
  if (v.account !== String(account || '').trim()) return { ok: false, msg: '验证码与账号不匹配，请重新发送' }
  if (Date.now() > v.exp) return { ok: false, msg: '验证码已过期，请重新发送' }
  if (String(code || '').trim() !== v.code) return { ok: false, msg: '验证码不正确' }
  return { ok: true, channel: v.channel }
}

// 验证码注册（免密可选）：account=邮箱或手机号；code=验证码；p=可选密码；name=可选用户名
export async function authRegisterCode(account, code, opt = {}) {
  const chk = checkVerifyCode(account, code)
  if (!chk.ok) return chk
  const kind = accountKind(account)
  if (kind === 'phone') return { ok: false, msg: '已取消手机号登录，请使用邮箱注册' }
  if (kind !== 'email') return { ok: false, msg: '请输入邮箱（如 123@qq.com / xxx@gmail.com）' }
  const email = String(account).trim().toLowerCase()
  const name = String(opt.name || '').trim()
  const p = String(opt.p || '')
  if (p && p.length < 4) return { ok: false, msg: '密码至少 4 位（可不设密码）' }
  const d = read()
  const dup = d.users.find((x) => x.email === email)
  if (dup) return { ok: false, msg: '该邮箱已注册，请直接登录' }
  const salt = randSalt()
  const h = p ? await hashPass(email || name, p, salt) : ''
  const user = { id: newId(), u: name, email, phone: '', salt, h }
  d.users.push(user)
  clearVerify()
  write({ users: d.users, session: null, enabled: d.enabled })
  makeSession(d, user, true)
  return { ok: true, user }
}

// 验证码登录（免密）：账号=邮箱
export async function authLoginCode(account, code, remember = true) {
  const chk = checkVerifyCode(account, code)
  if (!chk.ok) return chk
  const d = read()
  const user = findUser(d, account)
  if (!user) return { ok: false, msg: '本机没有该账号：请先注册（本地账号仅存本机，跨设备/清除数据后需重新注册）' }
  clearVerify()
  makeSession(d, user, remember)
  return { ok: true }
}

export function authLogout() {
  const d = read()
  write({ users: d.users, session: null, enabled: d.enabled })
  authState.ok = false
  authState.user = ''
}

export async function authChangePass(acc, oldP, newP) {
  const d = read()
  const user = findUser(d, acc)
  if (!user) return { ok: false, msg: '账号不存在' }
  if (user.h) {
    if (!oldP) return { ok: false, msg: '请输入原密码' }
    const oh = await hashPass(user.email || user.phone || user.u, String(oldP), user.salt)
    if (oh !== user.h) return { ok: false, msg: '原密码不正确' }
  }
  if (!newP || String(newP).length < 4) return { ok: false, msg: '新密码至少 4 位' }
  user.salt = randSalt()
  user.h = await hashPass(user.email || user.phone || user.u, String(newP), user.salt)
  write({ users: d.users, session: d.session, enabled: d.enabled })
  return { ok: true }
}

export async function authDeleteUser(acc, p) {
  const d = read()
  const user = findUser(d, acc)
  if (!user) return { ok: false, msg: '账号不存在' }
  if (user.h) {
    const h = await hashPass(user.email || user.phone || user.u, String(p || ''), user.salt)
    if (h !== user.h) return { ok: false, msg: '密码不正确' }
  }
  const isCur = d.session && (d.session.id === user.id || d.session.u === user.u)
  d.users = d.users.filter((x) => x.id !== user.id)
  write({ users: d.users, session: isCur ? null : d.session, enabled: d.enabled })
  if (isCur) {
    authState.ok = false
    authState.user = ''
  }
  return { ok: true }
}

// 开启/关闭登录门：关闭=任何人可用（authState.ok 置真），开启=需有效会话
export function authSetEnabled(v) {
  const d = read()
  d.enabled = !!v
  write(d)
  authState.enabled = !!v
  if (!d.enabled) {
    authState.ok = true
  } else if (!d.session || d.session.exp <= Date.now()) {
    authState.ok = false
  }
}

// 忘记密码 / 账号锁死的兜底：清空本机账号与会话（学习数据不受影响）
export function authResetLocal() {
  try { localStorage.removeItem(KEY) } catch (e) {}
  try { localStorage.removeItem(VERIFY_KEY) } catch (e) {}
  authState.ok = false
  authState.user = ''
  authState.enabled = true
}