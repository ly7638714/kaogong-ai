// useAi.js —— 统一 AI 调用封装（批次6-6A）：未配 Key 判断 + busy + toast + 成本归因
import { ref } from 'vue'
import { activeCfg } from '../api'
import { showToast } from './toast'

export function useAi(_kind = 'chat', { busyRef } = {}) {
  const busy = busyRef || ref(false)
  async function run(fn, { keyHint = '文字模型', cfgKey = false, onError } = {}) {
    if (busy.value) return null
    const c = activeCfg(cfgKey)
    if (!c || !c.key) {
      showToast('请先在设置配置' + keyHint + ' API Key', 'error')
      return null
    }
    busy.value = true
    try {
      return await fn(c)
    } catch (e) {
      const msg = String((e && e.message) || '请求失败')
      if (onError) onError(e, msg)
      else showToast(msg, 'error')
      return null
    } finally {
      busy.value = false
    }
  }
  return { busy, run }
}
