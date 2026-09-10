// apiBalance.js —— 平台余额查询（仅接官方明确开放的接口；不开放的平台返回后台入口）

function baseOf(url) {
  try {
    const u = new URL(String(url || ''))
    return u.origin
  } catch (e) {
    return ''
  }
}

function numText(v) {
  if (v == null || v === '') return ''
  const n = Number(v)
  return Number.isFinite(n) ? String(n) : String(v)
}

export const BALANCE_PROVIDERS = {
  ds: {
    label: 'DeepSeek',
    dashboard: 'https://platform.deepseek.com/usage',
    url(cfg) { return baseOf(cfg && cfg.url) || 'https://api.deepseek.com' },
    path: '/user/balance',
    parse(j) {
      const list = (j && j.balance_infos) || []
      if (!list.length) return ''
      return list.map((x) => `${numText(x.total_balance)} ${x.currency || ''}`.trim()).join(' / ')
    }
  },
  sf: {
    label: '硅基流动',
    dashboard: 'https://cloud.siliconflow.cn/account/ak',
    url(cfg) { return baseOf(cfg && cfg.url) || 'https://api.siliconflow.cn/v1' },
    path: '/user/info',
    parse(j) {
      const d = (j && (j.data || j)) || {}
      const v = d.totalBalance ?? d.balance ?? d.availableBalance ?? d.chargeBalance
      return v == null ? '' : `${numText(v)} 元`
    }
  },
  kimi: {
    label: 'Kimi / Moonshot',
    dashboard: 'https://platform.moonshot.cn/console/info',
    url(cfg) { return baseOf(cfg && cfg.url) || 'https://api.moonshot.cn/v1' },
    path: '/users/me/balance',
    parse(j) {
      const d = (j && (j.data || j)) || {}
      const v = d.available_balance ?? d.availableBalance ?? d.balance
      return v == null ? '' : `${numText(v)} 元`
    }
  },
  openai: { label: 'OpenAI', dashboard: 'https://platform.openai.com/usage', unsupported: true },
  zhipu: { label: '智谱 AI', dashboard: 'https://open.bigmodel.cn/usercenter/apikeys', unsupported: true },
  qwen: { label: '阿里百炼', dashboard: 'https://bailian.console.aliyun.com/', unsupported: true },
  dash: { label: '阿里百炼', dashboard: 'https://bailian.console.aliyun.com/', unsupported: true },
  doubao: { label: '火山方舟 / 豆包', dashboard: 'https://console.volcengine.com/ark', unsupported: true },
  gemini: { label: 'Google Gemini', dashboard: 'https://aistudio.google.com/', unsupported: true },
  local: { label: '本地模型', dashboard: '', unsupported: true, localFree: true },
  custom: { label: '自定义 / 中转站', dashboard: '', unsupported: true }
}

export function providerBalanceMeta(provider) {
  return BALANCE_PROVIDERS[String(provider || '').trim()] || {
    label: String(provider || '自定义').trim() || '自定义',
    dashboard: '',
    unsupported: true
  }
}

export async function queryProviderBalance(cfg, opts = {}) {
  const provider = String((cfg && cfg.prov) || '').trim()
  const meta = providerBalanceMeta(provider)
  if (!cfg || !cfg.key) return { ok: false, provider, label: meta.label, dashboard: meta.dashboard, msg: '未配置 API Key' }
  if (meta.unsupported) return { ok: false, provider, label: meta.label, dashboard: meta.dashboard, msg: meta.localFree ? '本地模型无需余额' : '平台未开放余额接口，请到后台查看' }
  const fetchImpl = opts.fetchImpl || fetch
  const url = String(meta.url(cfg) || '').replace(/\/+$/, '') + meta.path
  try {
    const r = await fetchImpl(url, { headers: { Authorization: 'Bearer ' + cfg.key, Accept: 'application/json' } })
    const txt = await r.text()
    let j = null
    try { j = JSON.parse(txt) } catch (e) {}
    if (!r.ok) {
      const m = (j && j.error && (j.error.message || j.error.code)) || (j && j.message) || ('HTTP ' + r.status)
      return { ok: false, provider, label: meta.label, dashboard: meta.dashboard, msg: String(m).slice(0, 120) }
    }
    const text = meta.parse(j || {})
    return text
      ? { ok: true, provider, label: meta.label, dashboard: meta.dashboard, text, at: Date.now() }
      : { ok: false, provider, label: meta.label, dashboard: meta.dashboard, msg: '接口已返回，但未识别到余额字段' }
  } catch (e) {
    return { ok: false, provider, label: meta.label, dashboard: meta.dashboard, msg: '查询失败：' + String((e && e.message) || e).slice(0, 100) }
  }
}

export default { BALANCE_PROVIDERS, providerBalanceMeta, queryProviderBalance }
