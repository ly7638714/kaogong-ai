import { createApp } from 'vue'
import App from './App.vue'
import './styles.css'
import { load } from './store'
import { initErrorHandlers } from './utils/errorLog'
load()
const app = createApp(App)
initErrorHandlers(app)

// ===== 试用模式门禁（仅 --mode trial 构建生效）=====
// Vite 构建时把 import.meta.env.VITE_TRIAL_MODE 静态替换为真实值：
//  正式构建 → undefined → 该分支不可达，被 Rollup 树摇剔除，对正式产物零影响；
//  trial 构建 → 'true' → 走门禁逻辑（邀请码 + 到期锁定）。
if (import.meta.env.VITE_TRIAL_MODE === 'true') {
  import('./utils/trial').then(async ({ trialLocked, trialExpired }) => {
    if (trialLocked() || trialExpired()) {
      const { default: TrialGate } = await import('./components/TrialGate.vue')
      createApp(TrialGate).mount('#app')
    } else {
      app.mount('#app')
      // ===== 到期看门狗（仅试用版）：试用期一过，20 秒内自动锁定 =====
      // 覆盖"跨零点持续打开不关闭"的场景：到点后自动刷新，刷新后 trialExpired() 为真 → 显示已结束页
      const watchdog = () => {
        if (trialExpired()) { try { location.reload() } catch (e) {} }
      }
      setInterval(watchdog, 20000)
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) watchdog()
      })
      window.addEventListener('focus', watchdog)
    }
  })
} else {
  app.mount('#app')
}
