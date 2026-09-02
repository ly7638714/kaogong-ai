<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { on as evOn, off as evOff } from '../utils/events'
import { store, getActiveExam, setActiveExam } from '../store'
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
// 当前激活考试（多考试倒计时：切换后只看该考试的独立倒计时）
const activeExam = computed(() => getActiveExam())
// 显示"年月日"文本（天 小时 分 秒）
function countdown() {
  const act = getActiveExam()
  const target = new Date((act && act.date) || store.cfg.examDate || '2026-11-29').getTime()
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
// ===== 考试切换下拉（Teleport 到 body，避免被 .exam-bar 的 overflow:hidden 裁切）=====
const showExams = ref(false)
const exBtn = ref(null)
const popStyle = ref({})
const exams = computed(() => store.cfg.exams || [])
function daysLeft(dateStr) {
  try {
    const d = new Date(dateStr)
    if (isNaN(d)) return null
    return Math.max(0, Math.ceil((d - Date.now()) / 86400000))
  } catch (e) { return null }
}
function toggleExams() {
  showExams.value = !showExams.value
  if (showExams.value && exBtn.value) {
    const r = exBtn.value.getBoundingClientRect()
    popStyle.value = { top: (r.bottom + 8) + 'px', left: Math.max(8, r.left) + 'px' }
  }
}
function pickExam(id) { setActiveExam(id); showExams.value = false }
function openMgr() { showExams.value = false; store.uiCtx.examMgr = true }
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
      <button ref="exBtn" class="eb-exam-btn" :title="'切换考试（当前：' + (activeExam ? activeExam.name : '考试') + '）'" @click="toggleExams()">
        <span class="eb-dot" :style="{ background: activeExam ? activeExam.color : '#5cc8ff' }"></span>
        <span class="eb-lbl">{{ activeExam ? activeExam.name : '考试' }}倒计时</span>
        <span class="eb-caret" :class="{ up: showExams }">▾</span>
      </button>
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

  <!-- 考试切换下拉（Teleport 到 body，避免被 .exam-bar overflow:hidden 裁切） -->
  <Teleport to="body">
    <div v-if="showExams" class="eb-pop-mask" @click="showExams = false"></div>
    <div v-if="showExams" class="eb-exam-pop" :style="popStyle">
      <div class="eb-pop-hd">选择考试（各自独立倒计时）</div>
      <button
        v-for="ex in exams" :key="ex.id"
        class="eb-pop-it" :class="{ on: activeExam && ex.id === activeExam.id }"
        @click="pickExam(ex.id)"
      >
        <span class="eb-dot" :style="{ background: ex.color }"></span>
        <span class="eb-pop-name">{{ ex.name }}</span>
        <span class="eb-pop-d">剩 {{ daysLeft(ex.date) }} 天</span>
        <span v-if="activeExam && ex.id === activeExam.id" class="eb-pop-check">✓</span>
      </button>
      <button class="eb-pop-mgr" @click="openMgr()">⚙️ 管理考试（添加/编辑/删除）</button>
    </div>
  </Teleport>
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
.eb-count { position: relative; }
/* 考试切换按钮 */
.eb-exam-btn {
  display: flex; align-items: center; gap: 5px; cursor: pointer;
  background: transparent; border: none; padding: 2px 4px; border-radius: 8px;
  color: var(--text2); font: inherit; font-size: 12px;
}
.eb-exam-btn:hover { background: rgba(255, 255, 255, 0.06); }
.eb-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; box-shadow: 0 0 6px currentColor; }
.eb-caret { font-size: 9px; opacity: 0.6; transition: transform 0.15s; }
.eb-caret.up { transform: rotate(180deg); }
/* 下拉面板（已 Teleport 到 body，用 fixed + 内联 top/left 定位） */
.eb-exam-pop {
  position: fixed; z-index: 1200;
  width: 248px; max-width: 78vw;
  background: #0d1726; border: 1px solid rgba(120, 200, 255, 0.28);
  border-radius: 12px; box-shadow: 0 18px 48px rgba(0, 0, 0, 0.55);
  padding: 8px; display: flex; flex-direction: column; gap: 4px;
}
.eb-pop-hd { font-size: 11px; color: var(--text3); padding: 2px 6px 4px; }
.eb-pop-it {
  display: flex; align-items: center; gap: 8px; cursor: pointer;
  background: rgba(255, 255, 255, 0.03); border: 1px solid transparent;
  border-radius: 8px; padding: 7px 8px; color: var(--text2); font-size: 12.5px; text-align: left;
}
.eb-pop-it:hover { background: rgba(255, 255, 255, 0.08); }
.eb-pop-it.on { border-color: rgba(80, 200, 255, 0.5); background: rgba(80, 200, 255, 0.1); }
.eb-pop-name { flex: 1; font-weight: 600; color: var(--text1); }
.eb-pop-d { font-size: 11px; color: var(--text3); }
.eb-pop-check { color: var(--hud-cyan); font-weight: 700; }
.eb-pop-mgr {
  margin-top: 2px; cursor: pointer; border: 1px dashed rgba(80, 200, 255, 0.4);
  background: rgba(80, 200, 255, 0.06); color: #bfe9ff; border-radius: 8px;
  padding: 8px; font-size: 12px;
}
.eb-pop-mgr:hover { background: rgba(80, 200, 255, 0.14); }
.eb-pop-mask { position: fixed; inset: 0; z-index: 1100; }
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
