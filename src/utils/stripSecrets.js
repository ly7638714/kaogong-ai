// 密钥脱敏（批次3.2）：备份/同步前把 key/pass/secret/token 字段打码，结构保留、密钥不泄露
export function stripSecrets(obj) {
  if (!obj || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map((v) => (v && typeof v === 'object' ? stripSecrets(v) : v))
  const out = {}
  for (const k of Object.keys(obj)) {
    const v = obj[k]
    if (/^(key|pass|secret|token|pwd|apikey|api_key|authorization)$/i.test(k) && typeof v === 'string') {
      out[k] = v && v.length ? '***' : v
    } else if (v && typeof v === 'object') {
      out[k] = stripSecrets(v)
    } else {
      out[k] = v
    }
  }
  return out
}
