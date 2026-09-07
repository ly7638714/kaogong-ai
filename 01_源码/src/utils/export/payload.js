import { store } from '../../store'
import { collectChat } from '../chat'

export function getPayload(type, template = 'full') {
  if (type === 'wrong') {
    if (!store.wqs.length) return null
    // 按板块分组
    const groups = {}
    store.wqs.forEach((q) => {
      const s = q.subject || '未分类'
      if (!groups[s]) groups[s] = []
      groups[s].push(q)
    })
    const items = []
    const plain = []
    const keys = Object.keys(groups)
    let gi = 0
    let wi = 0 // 全局题号，供「题答分离」区对应
    const ansItems = [] // 「题答分离」：答案/错因/秒杀/笔记集中到末尾
    const tpl = template || 'full'
    keys.forEach((s) => {
      gi++
      items.push({ type: 'h', text: '📁 板块 ' + gi + ' · ' + s + '（' + groups[s].length + ' 题）' })
      plain.push('【板块' + gi + ' · ' + s + '】')
      groups[s].forEach((q, qi) => {
        wi++
        const ansParts = []
        if (q.answer) ansParts.push('答案：' + q.answer)
        if (q.reasons && q.reasons.length) ansParts.push('错因：' + q.reasons.join('、'))
        if (q.method) ansParts.push('秒杀：' + q.method)
        if (q.note) ansParts.push('笔记：' + q.note)
        const line = []
        line.push(gi + '.' + (qi + 1) + '. 【' + (q.subject || '未分类') + '】' + (q.reviewed ? ' ✅已复盘' : ' ⏳待复盘'))
        line.push('题目：' + (q.question || ''))
        if (tpl === 'stems') {
          // 只题干：不输出任何答案/错因/秒杀/笔记/时间，适合纯重做自测
        } else {
          line.push(...ansParts)
          line.push('时间：' + (q.time || ''))
        }
        plain.push('  · ' + line.join('  '))
        // 原题图 + 全部复盘字段作为一个内容块
        let b = line.join('\n')
        if ((q.imgs || []).length) b += '\n[见下方原题截图]'
        items.push({ type: 'msg', role: 'user', text: b, imgs: (q.imgs || []) })
        if (tpl === 'separate' && ansParts.length) {
          ansItems.push({ type: 'msg', role: 'user', text: '【第' + wi + '题 · ' + (q.subject || '未分类') + '】\n' + ansParts.join('\n') })
        }
      })
      plain.push('')
    })
    if (tpl === 'separate' && ansItems.length) {
      items.push({ type: 'h', text: '🔑 参考答案与复盘（题答分离）' })
      items.push(...ansItems)
    }
    const tplName = tpl === 'stems' ? '只题干' : tpl === 'separate' ? '题答分离' : '按板块整理'
    return {
      title: '行测 · 错题集（' + tplName + '）',
      items,
      plain: plain.join('\n')
    }
  }
  if (type === 'kb') {
    if (!store.myMem.length && !store.notes.length) return null
    const items = []
    const plain = []
    const groups = {}
    store.myMem.forEach((m) => {
      const t = m.type || '其他'
      if (!groups[t]) groups[t] = []
      groups[t].push(m.text)
    })
    if (store.notes.length) {
      groups['📝 导入笔记'] = store.notes.map((n) => (n.title || '笔记') + '：' + String(n.body || '').trim())
    }
    Object.keys(groups).forEach((t) => {
      items.push({ type: 'h', text: '📚 ' + t + '（' + groups[t].length + ' 条）' })
      plain.push('【' + t + '】')
      groups[t].forEach((txt) => {
        items.push({ type: 'msg', role: 'user', text: txt })
        plain.push('· ' + txt)
      })
      plain.push('')
    })
    return { title: '行测 · 知识库积累（我的记忆库）', items, plain: plain.join('\n') }
  }

  const c = collectChat()
  if (!c.length) return null
  if (type === 'review') {
    const last = c[c.length - 1],
      prev = c[c.length - 2] || last
    return {
      title: '行测 · 单题复盘',
      items: [
        { type: 'h', text: '题目（用户提问）' },
        {
          type: 'msg',
          role: 'user',
          text: prev.role === 'user' ? prev.text : last.text,
          imgs: prev.role === 'user' ? prev.imgs : []
        },
        { type: 'h', text: 'AI 复盘解析' },
        {
          type: 'msg',
          role: 'ai',
          text: last.role === 'ai' ? last.text : '',
          imgs: last.role === 'ai' ? last.imgs : []
        }
      ],
      plain:
        '【题目】' +
        (prev.role === 'user' ? prev.text : last.text) +
        (prev.imgs && prev.imgs.length ? '\n[含图片]' : '') +
        '\n\n【AI解析】' +
        (last.role === 'ai' ? last.text : '')
    }
  }
  const cItems = [],
    cParts = []
  c.forEach((it) => {
    cItems.push({ type: 'msg', role: it.role, text: it.text, imgs: it.imgs })
    cParts.push((it.role === 'user' ? '【我】' : '【AI】') + it.text)
  })
  return { title: '行测 AI 问答 · 对话记录', items: cItems, plain: cParts.join('\n\n') }
}
