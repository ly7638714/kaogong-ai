// petProfile —— 萌宠个性化画像（P2，纯函数）：从错题本统计薄弱板块
export function weakPlates(wqs, top = 2) {
  const map = {}
  for (const q of wqs || []) { const p = (q && (q.plate || q.subject)) || '其他'; map[p] = (map[p] || 0) + 1 }
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, top).map(([plate, n]) => ({ plate, n }))
}

export function wrongTotal(wqs) { return Array.isArray(wqs) ? wqs.length : 0 }

// 组装给萌宠的一句话画像
export function profileLine(wqs, top = 2) {
  const weak = weakPlates(wqs, top)
  const total = wrongTotal(wqs)
  const parts = []
  if (total) parts.push('累计错题 ' + total + ' 道')
  if (weak.length) parts.push('薄弱板块：' + weak.map((x) => x.plate + '(错' + x.n + ')').join('、'))
  return parts.length ? parts.join('；') : ''
}