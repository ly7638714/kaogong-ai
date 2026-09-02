<template>
  <div class="trial-gate">
    <div class="trial-card">
      <div class="trial-logo">🎓</div>
      <h1 class="trial-title">行测名师AI小助理</h1>
      <p class="trial-sub">体验版 · 名额有限</p>

      <template v-if="expired">
        <div class="trial-state expired">
          <div class="trial-emoji">⏰</div>
          <h2>本次体验已结束</h2>
          <p>感谢参与试用！体验期已于 {{ expiresText }} 截止，当前版本暂不可继续使用。</p>
          <p class="trial-note">如需继续使用，请关注后续正式版发布。</p>
        </div>
      </template>

      <template v-else-if="!unlocked">
        <div class="trial-state">
          <p class="trial-tip">请输入体验邀请码解锁使用（每个体验者使用自己的 API Key）</p>
          <input
            v-model="code"
            class="trial-input"
            type="text"
            placeholder="请输入邀请码"
            @keyup.enter="doUnlock"
            autocomplete="off"
          />
          <button class="trial-btn" :disabled="busy" @click="doUnlock">{{ busy ? '验证中…' : '解锁进入' }}</button>
          <p v-if="err" class="trial-err">邀请码不正确，请重新输入</p>
          <p class="trial-expire">体验截止时间：{{ expiresText }}</p>
        </div>
      </template>

      <template v-else>
        <div class="trial-state ok">
          <div class="trial-emoji">✅</div>
          <h2>解锁成功</h2>
          <p>正在进入应用…</p>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { trialExpired, trialLocked, trialUnlock, trialExpiresText } from '../utils/trial'

const code = ref('')
const err = ref(false)
const busy = ref(false)
const unlocked = ref(false)
const expired = ref(false)
const expiresText = trialExpiresText()

function doUnlock() {
  if (busy.value) return
  busy.value = true
  err.value = false
  setTimeout(() => {
    const r = trialUnlock(code.value)
    busy.value = false
    if (r.ok) {
      unlocked.value = true
      setTimeout(() => { location.reload() }, 600)
    } else if (r.reason === 'expired') {
      expired.value = true
    } else {
      err.value = true
    }
  }, 200)
}

onMounted(() => {
  expired.value = trialExpired()
  unlocked.value = !trialLocked()
})
</script>

<style scoped>
.trial-gate {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(1200px 600px at 50% -10%, #1e3a8a 0%, #0f172a 55%, #020617 100%);
  font-family: -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  color: #e2e8f0;
  padding: 20px;
  box-sizing: border-box;
}
.trial-card {
  width: 100%;
  max-width: 400px;
  background: rgba(15, 23, 42, 0.82);
  border: 1px solid rgba(96, 165, 250, 0.25);
  border-radius: 20px;
  padding: 34px 30px 28px;
  text-align: center;
  box-shadow: 0 24px 80px rgba(2, 6, 23, 0.6);
  box-sizing: border-box;
}
.trial-logo { width: 72px; height: 72px; border-radius: 16px; margin-bottom: 14px; display: flex; align-items: center; justify-content: center; font-size: 40px; background: linear-gradient(135deg,#1e3a8a,#2563eb); }
.trial-title { margin: 0 0 4px; font-size: 22px; font-weight: 700; letter-spacing: 0.5px; }
.trial-sub { margin: 0 0 22px; font-size: 13px; color: #7aa2e8; }
.trial-state h2 { margin: 10px 0 8px; font-size: 18px; }
.trial-state p { margin: 6px 0; font-size: 14px; line-height: 1.6; color: #cbd5e1; }
.trial-tip { font-size: 13px !important; color: #94a3b8 !important; margin-bottom: 14px !important; }
.trial-input {
  width: 100%;
  box-sizing: border-box;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid rgba(96, 165, 250, 0.35);
  background: rgba(2, 6, 23, 0.6);
  color: #f1f5f9;
  font-size: 16px;
  text-align: center;
  letter-spacing: 2px;
  outline: none;
  margin-bottom: 12px;
}
.trial-input:focus { border-color: #60a5fa; }
.trial-btn {
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}
.trial-btn:disabled { opacity: 0.6; cursor: default; }
.trial-err { color: #f87171 !important; font-size: 13px !important; margin-top: 10px !important; }
.trial-expire { font-size: 12px !important; color: #64748b !important; margin-top: 16px !important; }
.trial-emoji { font-size: 44px; line-height: 1; }
.trial-note { color: #94a3b8 !important; }
.expired h2 { color: #fbbf24; }
</style>
