// ===== AnkiConnect 本地 API（需 Anki 桌面版开启并安装 AnkiConnect 插件）=====
export async function ankiAddNote(front, back, subject) {
  const body = {
    action: 'addNote',
    version: 6,
    params: {
      note: {
        deckName: '行测AI',
        modelName: 'Basic',
        fields: { Front: String(front || '').slice(0, 1000), Back: String(back || '') },
        tags: ['行测', String(subject || '')]
      }
    }
  }
  const res = await fetch('http://127.0.0.1:8765', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error('AnkiConnect 连接失败 HTTP ' + res.status)
  const d = await res.json()
  if (d.error) throw new Error(String(d.error).slice(0, 120))
  return d.result
}
