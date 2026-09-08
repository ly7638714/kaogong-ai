// dataTrainTips.js —— 资料速算「小技巧层」（v3.8.200，纯函数可单测）
// ① 三锁定高亮：给 时间词/指标词/单位（含%与万/亿单位）加粗定位
// ② 离线真实口径参考（来源|领域 → 真实公报数字样本，诚实标注非实时）
export function lockHighlights(mdText, on = true) {
  let t = String(mdText || '')
  if (!on) return t
  t = t.replace(/([0-9]{4}年|上半年|前三季度|全年|上年|去年)/g, (m) => '**' + m + '**')
  t = t.replace(/(同比|环比|增速|增长率|比重|占比|平均|产量|总值|增加值|收入|利润|总额|提高|回落|提高百分点|回落百分点)/g, (m) => '**' + m + '**')
  t = t.replace(/([0-9]+(?:\.[0-9]+)? ?%|[0-9]+(?:\.[0-9]+)? ?(?:万吨|亿吨|亿元|万人|万辆|万平方米|吨|万桶|万千瓦))/g, (m) => '**' + m + '**')
  return t
}
export function findLockWords(mdText) {
  const t = String(mdText || '')
  const time = (t.match(/([0-9]{4}年|上半年|前三季度|全年|上年|去年)/g) || []).slice(0, 3)
  const ind = (t.match(/(同比|环比|增速|增长率|比重|占比|平均|产量|总值|增加值|收入|利润|总额|提高|回落)/g) || []).slice(0, 4)
  const unit = (t.match(/([0-9]+(?:\.[0-9]+)? ?%|[0-9]+(?:\.[0-9]+)? ?(?:万吨|亿吨|亿元|万人|万辆|万平方米|吨|万桶|万千瓦))/g) || []).slice(0, 4)
  return { time, ind, unit }
}
// v3.8.256：只高亮“当前本题所需数据”，不再把材料里所有时间/指标/单位全加粗
function escRx(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
function wrapHit(t, rx, cls) {
  return String(t).replace(rx, '<span class="' + cls + '">$&</span>')
}
export function semanticLockHighlights(mdText, need = {}) {
  let t = String(mdText || '')
  // v3.8.257：不再从题干/解析里“捞数字”，只高亮题目源数据/口径/指标词
  const needNums = []
  ;(need.nums || []).forEach((s) => {
    const n = String(s == null ? '' : s).replace(/[,\s]/g, '')
    const numeric = n.replace(/[^0-9.]/g, '')
    if (/^\d+(?:\.\d+)?$/.test(numeric)) needNums.push(numeric)
  })
  if (needNums.length) {
    const uniq = Array.from(new Set(needNums))
    t = String(t).replace(/(\d[\d,]*(?:\.\d+)?\s?(?:%|万吨|亿吨|亿元|万人|万辆|万平方米|万公顷|万吨公里|亿吨公里|元|台|辆|件|人|户|个|千瓦时|公顷)?)/g, (m) => {
      const d = m.replace(/[^0-9.]/g, '')
      if (uniq.some((u) => d === u)) return '<span class="dt-lock-red">' + m + '</span>'
      return m
    })
  }
  const words = (need.words || [])
    .map((s) => String(s || '').trim()).filter(Boolean)
    .sort((a, b) => b.length - a.length)
  const seen = new Set()
  words.forEach((w) => {
    if (seen.has(w) || w.length < 2 || w.length > 28 || /[\n|]/.test(w) || /^[0-9.,%]+$/.test(w)) return
    seen.add(w)
    t = wrapHit(t, new RegExp('(?<![\\w\u4e00-\u9fa5])' + escRx(w) + '(?![\\w\u4e00-\u9fa5])', 'g'), 'dt-lock-red')
  })
  return t
}
export function smartLockHighlights(mdText, need = {}) {
  // 兼容旧调用：传 texts 时仍按旧规则抽取题干内的时间和数字，不用于新语义高亮
  const nx = Object.assign({}, need)
  if (!nx.words && need.texts) {
    nx.words = []
    ;(need.texts || []).forEach((s) => {
      ;(String(s).match(/(?:[0-9]{4}年(?:1—[0-9]{1,2}月|上半年|下半年|[0-9]季度)?)|(?:上半年|前三季度|下半年|上年|去年|同比|环比|增速|增长率|比重|占比|平均|产量|收入|零售额|增加值)/g) || []).forEach((w) => {
        if (!nx.words.includes(w)) nx.words.push(w)
      })
    })
  }
  delete nx.texts
  return semanticLockHighlights(mdText, nx)
}
export const REAL_REF = {
  '国家统计局 · 粮食': '真实参考（离线样本，非实时）：2024 年全国粮食总产量 70650 万吨、比上年增长 1.6%（国家统计局 2024 年统计公报口径）。',
  '国家统计局 · 烟酒': '真实参考（离线样本，非实时）：2024 年全国居民消费价格比上年上涨 0.2%；烟酒类消费价格同比窄幅波动（国家统计局公报口径）。',
  '国家统计局 · 食品饮料': '真实参考（离线样本，非实时）：2024 年社会消费品零售总额约 48.8 万亿元，食品类零售保持增长（国家统计局公报口径）。',
  '国家统计局 · 汽车': '真实参考（离线样本，非实时）：2024 年全国汽车销量约 3143.6 万辆，新能源渗透率持续提升（中汽协/国家统计局口径）。',
  '国家统计局 · 房地产': '真实参考（离线样本，非实时）：2024 年房地产开发投资下降；70 城新建商品住宅价格环比降幅收窄（国家统计局口径）。',
  '贵州省统计局 · 粮食': '真实参考（离线样本，非实时）：贵州省粮食产量近年稳定在 1100 万吨上下（贵州省统计年鉴口径）。',
  '贵州省统计局 · 进出口': '真实参考（离线样本，非实时）：贵州省近年进出口总额增长较快，其中一般贸易占比提升（贵阳海关/贵州省统计局口径）。',
  '广东省统计局 · 汽车': '真实参考（离线样本，非实时）：广东省汽车制造业增加值居全国前列，新能源汽车产量高速增长（广东省统计局口径）。'
}
export default { lockHighlights, smartLockHighlights, semanticLockHighlights, REAL_REF }
