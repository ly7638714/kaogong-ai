// quizLog.js —— 出题历史数据记录（供 AI 持续学习，保证质量越来越好）
// 每道 AI 出的题，把「板块 / 题型 / 难度 / 生成尝试次数 / 各次质检失败原因 / 最终是否成功」记入本地
// （localStorage xc_quiz_log，上限 600 条）。统计后生成「历史质检学习提示」，注入出题提示词与 AI 质检
// 提示词——AI 每次出题前"看到"这类题过去常错在哪，主动规避 → 越出越好。
// 数据可导出（见 数据管理），未来可喂给大模型做微调训练。

const KEY = 'xc_quiz_log'
const MAX = 600

function read() {
  try { const d = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(d) ? d : [] } catch (e) { return [] }
}
function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX))) } catch (e) {}
}

// 记录一次出题尝试的结果
// e = { plate, variant, difficulty, ok, attempts, reasons:[...], src:'single'|'group' }
export function recordGenLog(e) {
  if (!e || !e.plate) return
  const list = read()
  list.push({
    t: Date.now(),
    plate: e.plate,
    variant: e.variant || '',
    difficulty: e.difficulty || '',
    ok: !!e.ok,
    attempts: Math.max(1, Number(e.attempts) || 1),
    reasons: Array.isArray(e.reasons) ? e.reasons.filter(Boolean).slice(0, 6) : [],
    src: e.src || 'single'
  })
  write(list)
}

// 统计某板块（可含题型）近期失败原因 top N
export function genLogStats(plate, variant, limit = 30) {
  const list = read().filter((x) => x.plate === plate && (!variant || x.variant === variant)).slice(-limit)
  const total = list.length
  const fail = list.filter((x) => !x.ok)
  const reasonMap = {}
  fail.forEach((x) => {
    ;(x.reasons || []).forEach((r) => {
      const key = String(r || '').slice(0, 40)
      reasonMap[key] = (reasonMap[key] || 0) + 1
    })
  })
  const top = Object.entries(reasonMap).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([r, n]) => r + '(' + n + '次)')
  const totalAttempts = list.reduce((a, x) => a + (x.attempts || 1), 0)
  return { total, fail: fail.length, topReasons: top, totalAttempts }
}

// 35号批次5(2/3)：某次出卷的质检汇总（出卷质量报告用）——统计 fromTs 之后的出题日志
// 返回 { gen, retried(曾重出题数), attempts(总生成次数), failed, reasonsTop }
export function recentGenStats(fromTs) {
  const list = read().filter((x) => !fromTs || (x.t || 0) >= fromTs)
  const gen = list.length
  const failed = list.filter((x) => !x.ok).length
  const retried = list.filter((x) => (x.attempts || 1) > 1).length
  const attempts = list.reduce((a, x) => a + (x.attempts || 1), 0)
  const reasonMap = {}
  list.filter((x) => !x.ok).forEach((x) => {
    ;(x.reasons || []).forEach((r) => { const k = String(r || '').slice(0, 40); reasonMap[k] = (reasonMap[k] || 0) + 1 })
  })
  const reasonsTop = Object.entries(reasonMap).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([r, n]) => r + '(' + n + '次)')
  return { gen, retried, attempts, failed, reasonsTop }
}

// 生成「历史质检学习提示」：注入出题/质检提示词，让 AI 规避过去常犯的错
export function genLogHint(plate, variant) {
  try {
    const s = genLogStats(plate, variant)
    if (!s.total) return ''
    const parts = []
    parts.push('【历史质检学习·' + (plate || '') + (variant ? '·' + variant : '') + '】近 ' + s.total + ' 次出题，失败 ' + s.fail + ' 次' + (s.totalAttempts > s.total ? '（共尝试 ' + s.totalAttempts + ' 次）' : '') + '。')
    if (s.topReasons.length) parts.push('常见失败原因：' + s.topReasons.join('、') + '。')
    parts.push('请主动规避上述问题，保证本题「唯一正确项·严格单选」，一次出对。')
    return parts.join('')
  } catch (e) { return '' }
}

// 清空出题历史（数据管理里可一键清）
export function clearGenLog() {
  try { localStorage.removeItem(KEY) } catch (e) {}
}
export function genLogSize() { return read().length }
export function exportGenLog() {
  try { return JSON.stringify(read(), null, 2) } catch (e) { return '' }
}
