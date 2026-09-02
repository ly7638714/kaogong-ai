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
    }
  })
} else {
  app.mount('#app')
}
