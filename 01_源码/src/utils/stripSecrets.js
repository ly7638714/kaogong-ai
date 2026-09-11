// 密钥脱敏：备份 / 云同步前把 key/pass/secret/token 字段打码，结构保留、密钥不落盘。
// v2 加固：除“字段名”外，再按“值特征”兜底识别常见密钥前缀，防止密钥被误写进别的键名后外泄。
// 注意：兜底只认 sk-/ghp_/glpat- 等强特征前缀，绝不使用“长十六进制”这类宽松规则，
// 否则会误伤设备 ID、题目哈希等合法数据。

// 字段名命中即打码（先归一化：转小写并去掉 _ - . 空格）
const SECRET_FIELD_NAMES = new Set([
  'key', 'keys', 'apikey', 'apisecret', 'secretkey',
  'pass', 'passwd', 'password', 'pwd',
  'secret', 'clientsecret',
  'token', 'accesstoken', 'refreshtoken', 'privatetoken', 'idtoken',
  'authorization', 'auth', 'bearer', 'credential', 'credentials'
])

export function isSecretField(name) {
  const n = String(name || '').toLowerCase().replace(/[\s_.-]/g, '')
  if (!n) return false
  if (SECRET_FIELD_NAMES.has(n)) return true
  // 兜底：以 token/secret/password/passwd/credential 结尾的字段名
  return /(token|secret|password|passwd|credential)$/.test(n)
}

const SECRET_PREFIX = '(?:sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{15,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|eyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{4,})'
const SECRET_VALUE_RE = new RegExp('^' + SECRET_PREFIX + '$')
const SECRET_IN_TEXT_RE = new RegExp(SECRET_PREFIX, 'g')
const SECRET_PROBE_RE = new RegExp(SECRET_PREFIX)

// 是否“整值”就是一个强特征密钥
export function looksLikeSecret(value) {
  if (typeof value !== 'string') return false
  const v = value.trim()
  if (v.length < 16 || v.length > 4096) return false
  return SECRET_VALUE_RE.test(v)
}

// 文本里是否出现强特征密钥（用于快速跳过无关数据）
export function containsSecretLike(text) {
  return typeof text === 'string' && text.length > 0 && SECRET_PROBE_RE.test(text)
}

// 把文本中出现的强特征密钥替换为 ***
export function maskSecretText(text) {
  if (typeof text !== 'string' || !text) return text
  return text.replace(SECRET_IN_TEXT_RE, '***')
}

export function stripSecrets(obj) {
  if (!obj || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map((v) => stripSecrets(v))
  const out = {}
  for (const k of Object.keys(obj)) {
    const v = obj[k]
    if (typeof v === 'string' && isSecretField(k)) {
      out[k] = v && v.length ? '***' : v
    } else if (typeof v === 'string' && looksLikeSecret(v)) {
      out[k] = '***'
    } else if (v && typeof v === 'object') {
      out[k] = stripSecrets(v)
    } else {
      out[k] = v
    }
  }
  return out
}

// 值级兜底清洗：字段名不动，仅替换“整值就是强特征密钥”的字符串。
// 用于非 xc_cfg 的其它数据键，防止密钥被误写进别的键名。
export function scrubSecretValues(value) {
  if (typeof value === 'string') return looksLikeSecret(value) ? '***' : value
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((v) => scrubSecretValues(v))
  const out = {}
  for (const k of Object.keys(value)) {
    const v = value[k]
    if (typeof v === 'string' && looksLikeSecret(v)) out[k] = '***'
    else if (v && typeof v === 'object') out[k] = scrubSecretValues(v)
    else out[k] = v
  }
  return out
}
