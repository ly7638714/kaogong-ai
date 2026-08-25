<script setup>
import { onMounted, onUnmounted, ref, computed, watch } from 'vue'
import { store } from '../store'
import { detectBanKuai } from '../api'
import { createScene, PLATE_META } from '../scene/starSystem'

const el = ref(null)
const sel = ref(null) // 选中的行星数据
let engine = null
let raf = 0
let dispose = null

// 把一个自然语言板块名 → PLATE_META.key
const KEY_ALIAS = {
  逻辑判断: 'luoji',
  判断推理: 'luoji',
  逻辑: 'luoji',
  类比推理: 'luoji',
  定义判断: 'luoji',
  图形推理: 'luoji',
  数字推理: 'luoji',
  言语理解: 'zhanggong',
  言语: 'zhanggong',
  资料: 'ziliao',
  资料分析: 'ziliao',
  资料分析计算: 'ziliao',
  数量: 'shuliang',
  数量关系: 'shuliang',
  常识: 'changshi',
  常识判断: 'changshi',
  政治: 'zhengzhi',
  政治理论: 'zhengzhi'
}
function classify(text) {
  const bk = detectBanKuai(text)
  return KEY_ALIAS[bk] || KEY_ALIAS[text] || null
}
// 统计六大板块数据
function computeStats() {
  const cnt = { luoji: 0, zhanggong: 0, ziliao: 0, shuliang: 0, changshi: 0, zhengzhi: 0 }
  const practice = { luoji: 0, zhanggong: 0, ziliao: 0, shuliang: 0, changshi: 0, zhengzhi: 0 }
  const last = {}
  store.wqs.forEach((q) => {
    const k = classify(q.subject || '')
    if (k) {
      cnt[k]++
      last[k] = last[k] || Date.now()
    }
  })
  for (let i = store.msgs.length - 1; i >= 0; i--) {
    const m = store.msgs[i]
    const c = m && m.content
    const txt = typeof c === 'string' ? c : (c && c.text) || ''
    const k = classify(txt)
    if (k) {
      practice[k] = (practice[k] || 0) + 1
      last[k] = last[k] || Date.now()
    }
  }
  return { cnt, practice, last }
}
// 数据 → 行星量表
function computeTargets() {
  const { cnt, last } = computeStats()
  const now = Date.now()
  return PLATE_META.map((p) => ({
    level: cnt[p.key],
    glow: last[p.key] && now - last[p.key] < 7 * 86400000 ? 0.6 : Math.min(0.6, cnt[p.key] * 0.1),
    active: !!store.mode && store.mode === p.key
  }))
}
// 选中行星的详情数据
const selectedDetail = computed(() => {
  if (!sel.value) return null
  const { cnt, practice, last } = computeStats()
  const meta = PLATE_META.find((p) => p.key === sel.value.key)
  const now = Date.now()
  const active = last[sel.value.key] && now - last[sel.value.key] < 7 * 86400000
  let mastery = 0
  if (cnt[sel.value.key] > 0) mastery = Math.min(100, Math.round(100 - cnt[sel.value.key] * 8))
  const pr = practice[sel.value.key] || 0
  // 上次练习时间
  let lastAt = '暂无记录'
  if (last[sel.value.key]) {
    const mins = Math.round((now - last[sel.value.key]) / 60000)
    lastAt = mins < 1 ? '刚刚' : mins < 60 ? `${mins} 分钟前` : mins < 1440 ? `${Math.round(mins / 60)} 小时前` : `${Math.round(mins / 1440)} 天前`
  }
  return {
    key: meta.key,
    name: meta.name,
    color: meta.color,
    wrong: cnt[sel.value.key] || 0,
    practice: pr,
    lastAt,
    active,
    mastery,
    total: pr + (cnt[sel.value.key] || 0)
  }
})

// 薄弱板块：错题数最多的板块（智能提醒）
const weakPanel = computed(() => {
  const { cnt } = computeStats()
  let best = null
  for (const k in cnt) {
    if (cnt[k] > 0 && (!best || cnt[k] > best.cnt)) best = { key: k, cnt: cnt[k] }
  }
  if (!best) return null
  const meta = PLATE_META.find((p) => p.key === best.key)
  return { key: best.key, name: meta.name, color: meta.color, wrong: best.cnt }
})

// 允许外部暂停/恢复渲染（active=false 时停掉 RAF，避免 GPU 空转——防止臃肿坍塌）
const props = defineProps({ active: { type: Boolean, default: true } })
function renderStep() {
  if (props.active) {
    try {
      engine.render(computeTargets())
    } catch (e) {}
  }
  raf = requestAnimationFrame(renderStep)
}
onMounted(() => {
  try {
    engine = createScene(el.value)
    // 点击行星 → 显示数据 HUD + 聚焦
    engine.on('planetClick', (key) => {
      sel.value = PLATE_META.find((p) => p.key === key) || null
      engine.pulseByKey(key)
    })
    raf = requestAnimationFrame(renderStep)
    const onResize = () => {
      engine.resize(el.value.clientWidth, el.value.clientHeight)
    }
    window.addEventListener('resize', onResize)
    onResize()
    dispose = () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      engine.dispose()
      engine = null
    }
  } catch (e) {
    el.value.style.background = 'radial-gradient(circle at 50% 35%, #0a1f33, #04070f 65%)'
    console.warn('3D 场景初始化失败，已降级为 2D 背景', e)
  }
})
onUnmounted(() => {
  if (dispose) dispose()
})

// 板块 key → 行星 key（若相符）
const MODE2PLATE = {
  luoji: 'luoji',
  zhanggong: 'zhanggong',
  ziliao: 'ziliao',
  shuliang: 'shuliang',
  changshi: 'changshi',
  tutu: 'luoji',
  yanyu: 'zhanggong',
  leibi: 'luoji',
  dingyi: 'luoji',
  zhengzhi: 'zhengzhi'
}
// 切换板块 → 聚焦对应行星 + 脉冲
watch(
  () => store.mode,
  (m) => {
    const k = MODE2PLATE[m]
    if (k && engine) {
      engine.focusTo(k)
      setTimeout(() => engine && engine.pulseByKey(k), 350)
    }
  }
)
// 新提问消息 → 从所属行星发能量脉冲
let prevLen = store.msgs.length
watch(
  () => store.msgs.length,
  (n) => {
    const grew = n > prevLen
    if (grew && engine) {
      const last = store.msgs[n - 1]
      const c = last && last.content
      const txt = typeof c === 'string' ? c : (c && c.text) || ''
      if (last && last.role === 'user') {
        // 提问：从对应板块行星发能量脉冲
        const k = classify(txt)
        if (k) engine.pulseByKey(k)
      } else if (last && last.role === 'assistant') {
        // AI 回复完成：用最近一次提问归类，触发行星成长突进
        let k = null
        for (let i = n - 1; i >= 0; i--) {
          const m2 = store.msgs[i]
          if (m2 && m2.role === 'user') {
            const t2 = typeof m2.content === 'string' ? m2.content : (m2.content && m2.content.text) || ''
            k = classify(t2)
            break
          }
        }
        if (k) engine.bumpByKey(k)
      }
    }
    prevLen = n
  }
)
</script>

<template>
  <div ref="el" class="cosmos-bg"></div>
  <!-- 行星数据 HUD（点击行星弹出） -->
  <Transition name="hud">
    <div v-if="selectedDetail" class="planet-card hud-corner" :style="{ '--pc': '#' + selectedDetail.color.toString(16) }">
      <div class="pc-head">
        <span class="pc-dot" :style="{ background: '#' + selectedDetail.color.toString(16) }"></span>
        <span class="pc-name">{{ selectedDetail.name }}</span>
        <button class="pc-close" @click="sel = null">✕</button>
      </div>
      <div class="pc-row">
        <span class="pc-lbl">错题</span>
        <span class="pc-val glow-num">{{ selectedDetail.wrong }}</span>
        <span class="pc-lbl">掌握度</span>
        <span class="pc-val">{{ selectedDetail.mastery }}%</span>
      </div>
      <div class="pc-bar"><i :style="{ width: selectedDetail.mastery + '%', background: '#' + selectedDetail.color.toString(16) }"></i></div>
      <div class="pc-meta">
        <span class="pc-meta-item">训练量 <b class="pc-b">{{ selectedDetail.practice }}</b></span>
        <span v-if="selectedDetail.active" class="pc-meta-item">✦ 近 7 天活跃</span>
        <span class="pc-meta-item pc-dim">上次 {{ selectedDetail.lastAt }}</span>
      </div>
    </div>
  </Transition>
  <!-- 星图图例 HUD（左下角，点击聚焦该行星） -->
  <div class="legend">    <div
      v-for="p in PLATE_META"
      :key="p.key"
      class="lg-item"
      :title="p.name"
      @click="sel = { key: p.key }; engine && engine.focusTo(p.key)"
    >
      <span class="lg-dot" :style="{ background: '#' + p.color.toString(16) }"></span>
      <span class="lg-name">{{ p.name }}</span>
    </div>
  </div>
  <!-- 薄弱板块提醒（点击聚焦，可再次聚焦通配最弱板块） -->
  <Transition name="hud">
    <div v-if="weakPanel" class="weak-bar" @click="sel = { key: weakPanel.key }; engine && engine.focusTo(weakPanel.key)">
      <span class="wk-ic">🎯</span>
      <span class="wk-txt">优先攻克 <b :style="{ color: '#' + weakPanel.color.toString(16) }">{{ weakPanel.name }}</b></span>
      <span class="wk-wrong">错题 {{ weakPanel.wrong }}</span>
      <span class="wk-go">攻克 ›</span>
    </div>
  </Transition>
</template>

<style scoped>
.cosmos-bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  background: radial-gradient(circle at 50% 35%, #0a1f33, #04070f 65%);
}
.planet-card {
  position: fixed;
  top: 96px;
  right: 16px;
  z-index: 5;
  width: 188px;
  padding: 12px 14px;
  background: rgba(7, 15, 26, 0.82);
  border: 1px solid rgba(80, 200, 255, 0.3);
  border-radius: 12px;
  backdrop-filter: blur(12px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  color: var(--text);
  font-size: 13px;
}
.pc-head {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 9px;
}
.pc-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  box-shadow: 0 0 10px var(--pc, cyan);
}
.pc-name {
  font-weight: 700;
  flex: 1;
  letter-spacing: 0.5px;
}
.pc-close {
  background: none;
  border: none;
  color: var(--text2);
  cursor: pointer;
  font-size: 12px;
  padding: 2px 4px;
}
.pc-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}
.pc-lbl { color: var(--text3); font-size: 11px; }
.pc-val {
  font-family: var(--font-hud);
  font-weight: 800;
}
.glow-num {
  background: linear-gradient(135deg, #22d3ee, #818cf8);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.pc-bar {
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
  margin-bottom: 8px;
}
.pc-bar i {
  display: block;
  height: 100%;
  border-radius: 999px;
  box-shadow: 0 0 8px var(--pc, cyan);
  transition: width 0.5s ease;
}
.pc-foot { color: var(--text2); font-size: 11px; }
.pc-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  font-size: 11px;
  color: var(--text2);
}
.pc-meta-item { display: inline-flex; align-items: center; gap: 3px; }
.pc-b { color: var(--hud-cyan); font-family: var(--font-hud); }
.pc-dim { opacity: 0.8; }
.hud-enter-active, .hud-leave-active { transition: opacity 0.22s, transform 0.22s; }
.hud-enter-from, .hud-leave-to { opacity: 0; transform: translateX(12px); }
.legend {
  position: fixed;
  left: 16px;
  bottom: max(16px, env(safe-area-inset-bottom));
  z-index: 5;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  max-width: 46%;
  pointer-events: auto;
}
.lg-item {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 9px;
  border-radius: 999px;
  background: rgba(7, 15, 26, 0.7);
  border: 1px solid rgba(80, 200, 255, 0.2);
  backdrop-filter: blur(8px);
  cursor: pointer;
  transition: all 0.15s;
}
.lg-item:hover {
  border-color: rgba(80, 200, 255, 0.5);
  transform: translateY(-2px);
  background: rgba(11, 24, 38, 0.85);
}
.lg-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  box-shadow: 0 0 8px currentColor;
}
.lg-name { font-size: 11px; color: var(--text2); white-space: nowrap; }
@media (max-width: 520px) {
  .legend { max-width: 62%; }
  .lg-name { font-size: 10px; }
}
/* 薄弱板块提醒条（右下角） */
.weak-bar {
  position: fixed;
  right: 16px;
  bottom: max(16px, env(safe-area-inset-bottom));
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  border-radius: 12px;
  background: rgba(7, 15, 26, 0.82);
  border: 1px solid rgba(251, 191, 36, 0.35);
  backdrop-filter: blur(12px);
  box-shadow: 0 10px 36px rgba(0, 0, 0, 0.5);
  cursor: pointer;
  font-size: 12.5px;
  color: var(--text);
  transition: all 0.2s;
  max-width: 88%;
}
.weak-bar:hover {
  border-color: rgba(251, 191, 36, 0.7);
  transform: translateY(-2px);
}
.wk-ic { font-size: 15px; }
.wk-txt b { font-weight: 800; }
.wk-wrong { color: var(--text3); font-family: var(--font-hud); }
.wk-go { color: var(--hud-gold); font-weight: 700; margin-left: 2px; }
</style>
