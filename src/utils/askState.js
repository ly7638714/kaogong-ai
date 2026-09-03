// askState —— 换题/追问状态机（P0-1b，纯函数）：问题指纹 + 相邻轮次关系判定 + 上下文锁定

// 生成问题指纹：板块+细分+题干主干（去掉常见虚词/请求词后的前若干字）
const TRIM = /^(请|帮我|麻烦|给|我|这|那|就|再|还|是|要|想|问|把|做|选|讲|解|析|看|对|改|出|来|一|下)/g
export function questionFp(probe, text) {
  const t = String(text || '').replace(/\s+/g, '').replace(TRIM, '').slice(0, 24)
  return (probe.plate6 || '?') + '|' + (probe.sub || '?') + '|' + t
}

// 判定本轮与上一轮的关系
// kind: followup(追问同一题) / newQ(新题/换题) / refresh(同主题换问法) / unknown(证据不足)
export function classifyTurn(prev, cur, opts = {}) {
  if (!prev || !cur) return { kind: 'unknown', samePlate: false, sameSub: false, sameText: false }
  const samePlate = !!(prev.plate6 && prev.plate6 === cur.plate6)
  const sameSub = !!(prev.sub && prev.sub === cur.sub)
  const prevT = String(prev.text || '').replace(/\s+/g, '')
  const curT = String(cur.text || '').replace(/\s+/g, '')
  const sameText = prevT === curT
  const curLen = curT.length
  const short = curLen > 0 && curLen <= (opts.shortLen || 14)
  const ref = /^(那|它|其|第二|第[一二三四五六七八九十百]+|下一|上一|上面|刚才|这个|那道|本题|该题|此|再来|换|变式|类似的)/.test(curT)
  const looksQ = /(意在|旨在|主旨|主要|中心|削弱|加强|支持|属于|不属于|符合|同比|增速|增长率|增长量|比重|平均|下列|哪[项个]|为什么错|怎么解|如何|求)/.test(curT) && curLen >= 10
  let kind
  if (!cur.plate6 && !cur.text) kind = 'unknown'
  else if (cur.plate6 && !samePlate && curLen > 6 && !sameText) kind = 'newQ'
  else if (samePlate && cur.sub && !sameSub) kind = 'newQ'
  else if (looksQ && !sameText) kind = 'newQ'
  else if (ref && (samePlate || short || !cur.plate6)) kind = 'followup'
  else if (short && samePlate) kind = 'followup'
  else kind = samePlate ? 'refresh' : 'unknown'
  return { kind, samePlate, sameSub, sameText }
}

// 综合：给上一轮与当前 probe，输出本轮应锁定的板块/细分与关系
export function nextContext(prev, cur, opts) {
  const r = classifyTurn(prev, cur, opts)
  const plate6 = (r.kind === 'followup' && prev && prev.plate6) ? prev.plate6 : (cur && cur.plate6) || (prev && prev.plate6) || ''
  const sub = (r.kind === 'followup' && prev && prev.sub) ? prev.sub : (cur && cur.sub) || ''
  return { kind: r.kind, plate6, sub, keepPrev: r.kind === 'followup' }
}