// 批次7·S1教学卡检索（含板块归一化）：按板块+题干信号词检索相关卡，注入对话与解析
import { CARDS, normalizePlate } from './cards-index'

export function retrieveCards(plate, question, limit = 4) {
  const q = String(question || '')
  if (!q) return []
  const p = normalizePlate(plate)
  const pool = CARDS.filter((c) => c.plate === p)
  const scored = pool.map((c) => ({
    c,
    s:
      (c.type && q.includes(c.type) ? 3 : 0) +
      c.signs.reduce((n, s) => n + (q.includes(s) ? 2 : 0), 0) +
      c.traps.reduce((n, s) => n + (q.includes(s) ? 1 : 0), 0)
  }))
  return scored
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.c)
}

export function renderCards(cards) {
  if (!cards || !cards.length) return ''
  return (
    '\n【本题型方法卡（严格按卡内步骤与术语作答，与教学保持同一口径）】\n' +
    cards
      .map(
        (c) =>
          `▸ ${c.type}（来源:${c.source}）\n  识别:${c.signs.join(' / ')}\n  步骤:${c.steps.join(' → ')}` +
          (c.formula ? `\n  公式:${c.formula}` : '') +
          `\n  陷阱:${c.traps.join('；')}` +
          (c.example ? `\n  例:${c.example.q.slice(0, 80)} 答案${c.example.answer}（${c.example.path.slice(0, 60)}）` : '') +
          (c.tip ? `\n  秒杀:${c.tip}` : '')
      )
      .join('\n') +
    '\n'
  )
}
