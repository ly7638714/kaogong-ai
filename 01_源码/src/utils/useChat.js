// ===== 共用对话核心（useChat composable）=====
// 主对话 ChatPage 与书内对话 BookChat 共用同一套：流式发送/停止/重试/复制/存错题/思考折叠
import { ref } from 'vue'
import { store, saveWqs } from '../store'
import { activeCfg, chatStream, supportsVision, detectBanKuai } from '../api'
import { renderMd } from '../utils/renderMd'
import { showToast } from '../utils/toast'

export function useChat(opts) {
  // opts: { messages?, sysFor, hasImg?, onBeforeSend?, onAfterMsg?, onBuildHistory?, onAfterDone? }
  // messages: 可选外部 ref（默认本地）；这样主对话可把 store.msgs 传进来，书内用本地 list
  const list = opts.messages && opts.messages.value && Array.isArray(opts.messages.value)
    ? opts.messages
    : ref([])
  const busy = ref(false)
  const box = ref(null) // 滚动容器（可选）
  let abortCtrl = null

  function plain(m) {
    if (!m) return ''
    if (typeof m.content === 'string') return m.content
    return (m.content && m.content.text) || ''
  }
  async function scroll() {
    if (!box.value) return
    box.value.scrollTop = box.value.scrollHeight
  }
  function addMsg(m) {
    if (!m.t) m.t = Date.now()
    list.value.push(m)
    if (opts.onAfterMsg) opts.onAfterMsg(m)
    scroll()
  }
  function stop() {
    if (abortCtrl) {
      try {
        abortCtrl.abort()
      } catch (e) {}
    }
  }
  // 发送：hasImg 决定用文字/视觉模型；sysFor 生成 system prompt
  async function send(textTemplate) {
    if (busy.value) return
    const txt = String(textTemplate == null ? '' : textTemplate).trim()
    if (!txt) {
      showToast('请输入想问的问题', 'info')
      return
    }
    const hasImg = !!(opts.hasImg && opts.hasImg())
    const c = activeCfg(hasImg)
    if (!c || !c.key) {
      addMsg({ role: 'assistant', content: '⚠️ 尚未配置' + (hasImg ? '视觉' : '文字') + '模型 API Key。\n\n请点击右上角「⚙️设置」→ 相关模型 → 填入 Key（如 DeepSeek）并保存后即可提问。' })
      showToast('请先在设置配置模型 API Key', 'error')
      return
    }
    if (hasImg && !supportsVision(c)) {
      addMsg({ role: 'assistant', content: '⚠️ 当前视觉模型不支持识图，请换可识图模型或删图改用文字。' })
      return
    }
    if (opts.onBeforeSend) opts.onBeforeSend({ txt, hasImg })
    addMsg({ role: 'user', content: hasImg ? { text: txt, imgs: (opts.currentImgs ? opts.currentImgs() : []) } : txt })
    busy.value = true
    abortCtrl = new AbortController()
    let sys = ''
    try {
      sys = (opts.sysFor && opts.sysFor(txt)) || ''
    } catch (e) {}
    const live = { text: '', think: '', thinkOpen: false }
    addMsg({ role: 'assistant', content: live, live: true })
    try {
      // 历史：优先用调用方自定义构建（支持图片/裁剪等），否则默认简化
      let history = []
      if (opts.onBuildHistory) {
        history = opts.onBuildHistory(list.value)
      } else {
        history = list.value
          .filter((x) => !x.live)
          .map((x) => ({ role: x.role, content: plain(x) }))
          .filter((x) => x.content)
          .slice(-(opts.historyLimit || 20))
      }
      const full = await chatStream(
        [{ role: 'system', content: sys }, ...history],
        c,
        (d) => {
          if (d.type === 'think') live.think = d.think
          else live.text = d.text
          live.thinkOpen = false
          scroll()
        },
        abortCtrl.signal
      )
      list.value[list.value.length - 1] = { role: 'assistant', content: full }
      if (opts.onAfterDone) opts.onAfterDone(full)
    } catch (e) {
      const last = list.value.length ? list.value[list.value.length - 1] : null
      const partial = (last && last.content && last.content.text) || ''
      if (e.name === 'AbortError') {
        list.value[list.value.length - 1] = { role: 'assistant', content: partial || '⏹ 已停止生成。', stopped: true }
      } else {
        list.value[list.value.length - 1] = { role: 'assistant', content: partial || '❌ 请求失败：' + e.message, err: true }
      }
    } finally {
      busy.value = false
      abortCtrl = null
      scroll()
    }
  }
  function retryLast() {
    const last = list.value[list.value.length - 1]
    if (!last || !last.err) return
    list.value.pop()
    let q = ''
    for (let i = list.value.length - 1; i >= 0; i--) if (list.value[i].role === 'user') { q = plain(list.value[i]); break }
    if (q) send(q)
  }
  async function copyMsg(i) {
    const m = list.value[i]
    const t = plain(m)
    if (!t) return
    try { await navigator.clipboard.writeText(t) } catch (e) {}
    showToast('已复制', 'success')
  }
  function saveWrong() {
    const u = [...list.value].reverse().find((x) => x.role === 'user')
    if (!u) { showToast('请先提出一个问题', 'info'); return }
    const q = plain(u)
    const bk = detectBanKuai(q) || (opts.defaultShelf) || '判断推理'
    store.wqs.unshift({ id: Date.now(), subject: bk, question: q, answer: '', reasons: [], time: new Date().toLocaleString(), at: Date.now(), wrongCount: 1, correctStreak: 0, mastery: 0, digested: false })
    saveWqs()
    showToast('✅ 已存入错题本（' + bk + '）', 'success')
  }
  function md(t) {
    return renderMd(t)
  }
  return { list, busy, box, send, stop, retryLast, copyMsg, saveWrong, md, plain }
}
