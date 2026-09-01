<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { on as evOn, off as evOff } from '../utils/events'
import { store } from '../store'
import { startAmbient, stopAmbient } from '../utils/ambient'

const now = ref(Date.now())
const amb = ref(false)
let timer = null

function tick() {
  now.value = Date.now()
}
function toggleAmb() {
  amb.value = !amb.value
  if (amb.value) startAmbient()
  else stopAmbient()
}
// 显示"年月日"文本（天 小时 分 秒）
function countdown() {
  const target = new Date(store.cfg.examDate || '2026-11-29').getTime()
  const diff = Math.max(0, target - now.value)
  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff % 86400000) / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)
  return {
    d,
    h,
    m,
    s,
    pad: (x) => String(x).padStart(2, '0')
  }
}
const plateNames = {
  all: '综合',
  luoji: '判断推理',
  leibi: '类比',
  dingyi: '定义判断',
  zhanggong: '言语理解',
  yanyu: '言语积累',
  tutu: '图形推理',
  ziliao: '资料分析',
  shuliang: '数量关系',
  zhengzhi: '政治理论',
  changshi: '常识判断'
}

// 今日任务进度（与看板打卡联动）
const tasks = ref([])
const doneCount = () => tasks.value.filter((t) => t.done).length
function refreshTasks() {
  try {
    const t = JSON.parse(localStorage.getItem('xc_tasks') || 'null')
    const d = new Date()
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    tasks.value = t && t.date === key ? (t.items || []) : []
  } catch (e) {
    tasks.value = []
  }
}
onMounted(() => {
  timer = setInterval(tick, 1000)
  refreshTasks()
  evOn('xc-task-change', refreshTasks)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
  stopAmbient()
  evOff('xc-task-change', refreshTasks)
})
</script>

<template>
  <div class="exam-bar">
    <div class="eb-item eb-count" title="距考试">
      <span class="eb-ic">⏳</span>
      <span class="eb-lbl">考试倒计时</span>
      <span class="eb-num hud-num">
        {{ countdown().pad(countdown().d) }}<em>天</em> {{ countdown().pad(countdown().h) }}<em>:</em>{{ countdown().pad(countdown().m) }}<em>:</em>{{ countdown().pad(countdown().s) }}
      </span>
    </div>
    <div class="eb-item" title="当前板块">
      <span class="eb-ic">📍</span>
      <span class="eb-lbl">{{ plateNames[store.mode] || '综合' }}</span>
    </div>
    <div v-if="tasks.length" class="eb-item" title="今日任务进度">
      <span class="eb-ic">📋</span>
      <span class="eb-lbl">今日</span>
      <span class="eb-num hud-num">{{ doneCount() }}/{{ tasks.length }}</span>
    </div>
    <div class="eb-item eb-amb" :class="{ on: amb }" title="考场氛围音（房间底噪/翻卷声）" @click="toggleAmb">
      <span class="eb-ic">{{ amb ? '🔊' : '🔇' }}</span>
      <span class="eb-lbl">{{ amb ? '氛围音开' : '氛围音' }}</span>
      <span v-if="amb" class="eb-wave"><i></i><i></i><i></i></span>
    </div>
    <div class="eb-scan" aria-hidden="true"></div>
  </div>
</template>

<style scoped>
.exam-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-shrink: 0;
  padding: 6px 16px 7px;
  background: rgba(6, 14, 26, 0.72);
  border-bottom: 1px solid rgba(80, 200, 255, 0.16);
  backdrop-filter: blur(10px);
  position: relative;
  overflow: hidden;
  font-size: 12px;
  color: var(--text2);
}
.eb-item {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.eb-ic { font-size: 13px; }
.eb-lbl { opacity: 0.7; }
.hud-num {
  font-family: var(--font-hud);
  color: var(--hud-cyan);
  font-weight: 700;
  letter-spacing: 0.5px;
  text-shadow: 0 0 8px rgba(34, 211, 238, 0.5);
}
.hud-num em {
  font-style: normal;
  color: var(--hud-gold);
  margin: 0 1px;
  font-family: inherit;
}
.eb-count .eb-num { font-size: 15px; }
.eb-amb {
  cursor: pointer;
  padding: 3px 8px;
  border: 1px solid transparent;
  border-radius: 999px;
  transition: all 0.2s;
}
.eb-amb:hover { border-color: rgba(80, 200, 255, 0.3); }
.eb-amb.on {
  border-color: rgba(34, 211, 238, 0.4);
  background: rgba(34, 211, 238, 0.1);
}
.eb-wave { display: flex; align-items: flex-end; gap: 2px; height: 10px; }
.eb-wave i {
  width: 2px;
  background: var(--hud-cyan);
  animation: ebWave 0.9s ease-in-out infinite;
}
.eb-wave i:nth-child(1) { height: 30%; animation-delay: 0s; }
.eb-wave i:nth-child(2) { height: 90%; animation-delay: 0.15s; }
.eb-wave i:nth-child(3) { height: 55%; animation-delay: 0.3s; }
@keyframes ebWave {
  0%, 100% { transform: scaleY(0.4); }
  50% { transform: scaleY(1); }
}
/* HUD 扫描线 */
.eb-scan {
  position: absolute;
  left: 0; right: 0; top: 0; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(34, 211, 238, 0.5), transparent);
  animation: ebScan 4s linear infinite;
  pointer-events: none;
}
@keyframes ebScan {
  0% { transform: translateY(0); opacity: 0; }
  10% { opacity: 1; }
  100% { transform: translateY(70px); opacity: 0; }
}
</style>
