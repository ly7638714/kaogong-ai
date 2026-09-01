<!-- ===== 知识星球 · 3D 星图组件 =====
  六大板块行星（数据驱动规模/发光）+ 主星球「行测局长」总览
  交互：
  - 悬停行星：实时显示该模块评估（掌握度/错题/训练量）
  - 点击行星：弹出该板块数据分析面板
  - 点击地球：弹出「行测局长」综合数据总览
  - 🚀 数据飞行：火箭沿「最优→次选→待加油」巡游各行星后回地球上空
  - 萌宠：火箭旁的小宠物，点开可与用户对话（AI 萌宠聊天）
-->
<script setup>
import { onMounted, onUnmounted, ref, computed, watch, nextTick, reactive } from 'vue'
import { store } from '../store'
import { detectBanKuai, activeCfg, chatStream } from '../api'
import { masteryOfPlate, MASTERY_PLATES } from '../utils/mastery'
import { createScene, PLATE_META } from '../scene/starSystem'
import { pet, petStage, petLevel, petMood, petStats, patPet, feedPet, petSpeak, petMuted, bubble } from '../utils/pet'
import { todaySeconds, totalSeconds, fmtMin, studyTick } from '../utils/study'
import PetAvatar from './PetAvatar.vue'

const el = ref(null)
const sel = ref(null) // 选中的行星
const hoverKey = ref(null) // 悬停行星 key
const earthOpen = ref(false) // 行测局长总览面板
const flightInfo = ref({ active: false, idx: 0, total: 0, key: '', name: '', colorCss: '#22d3ee' })
const flightMsg = ref(null) // 飞行途中萌宠气泡（模块数据/地球总况）
const petFloatPos = ref(null) // 悬浮萌宠位置（可拖拽记忆）
let petFloatDrag = null
let petSpeakTimer = null
try {
  const pf = JSON.parse(localStorage.getItem('xc_pet3d_pos') || 'null')
  if (pf && pf.x != null) petFloatPos.value = pf
} catch (e) {}
const petOpen = ref(false) // 萌宠聊天
const petMsgs = ref([])
const petInput = ref('')
const petBusy = ref(false)
const petScroll = ref(null)
let engine = null
let raf = 0
let dispose = null
let ro = null
let petCtrl = null

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
// 批次5-P5-1 统计缓存：带失效键，computeStats 全量扫描只在数据变化时执行
const statCache = reactive({ key: '', data: null })
function statsOf() {
  const key = store.msgs.length + ':' + store.wqs.length + ':' + store.wqs.reduce((n, q) => n + (q.reviewed ? 1 : 0), 0)
  if (statCache.key !== key) { statCache.key = key; statCache.data = computeStats() }
  return statCache.data
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
    // 批次5-P5-1 消息内容不可变：detectBanKuai 结果首算即缓存，避免每帧重复文本分类
    if (txt && !m._bk) { try { m._bk = detectBanKuai(txt) } catch (e) {} }
    const k = KEY_ALIAS[m._bk] || KEY_ALIAS[txt] || null
    if (k) {
      practice[k] = (practice[k] || 0) + 1
      last[k] = last[k] || Date.now()
    }
  }
  return { cnt, practice, last }
}
// 数据 → 行星量表
function computeTargets() {
  const { cnt, last } = statsOf()
  const now = Date.now()
  return PLATE_META.map((p) => ({
    level: cnt[p.key],
    glow: last[p.key] && now - last[p.key] < 7 * 86400000 ? 0.6 : Math.min(0.6, cnt[p.key] * 0.1),
    active: !!store.mode && store.mode === p.key
  }))
}
// 某板块的评估详情（掌握度/错题/训练量/最近错题/建议）
function computeDetailFor(key) {
  const { cnt, practice, last } = statsOf()
  const meta = PLATE_META.find((p) => p.key === key)
  if (!meta) return null
  const now = Date.now()
  const wrong = cnt[key] || 0
  const pr = practice[key] || 0
  const active = !!(last[key] && now - last[key] < 7 * 86400000)
  // 批次6-6A 掌握度收编：统一走 mastery.js（与统计雷达/看板同口径；按中文板块名+子板块分组）
  const _mp = MASTERY_PLATES.find((x) => x.key === meta.name) || { plates: [meta.name] }
  let mastery = masteryOfPlate(meta.name, store.wqs, { plates: _mp.plates })
  let lastAt = '暂无记录'
  if (last[key]) {
    const mins = Math.round((now - last[key]) / 60000)
    lastAt = mins < 1 ? '刚刚' : mins < 60 ? `${mins} 分钟前` : mins < 1440 ? `${Math.round(mins / 60)} 小时前` : `${Math.round(mins / 1440)} 天前`
  }
  let advice = '尚未开始学习该板块，点开练一题试试 ✍️'
  if (wrong > 0 || pr > 0) {
    if (wrong === 0) advice = '该板块暂无错题，状态优秀 🎉'
    else if (wrong >= 5) advice = '错题偏多，建议专项复盘 + 攻克薄弱点 💪'
    else if (wrong >= 2) advice = '有一定错题，建议针对错题回顾 📋'
    else advice = '状态良好，继续保持 🚀'
  }
  const recent = store.wqs.filter((q) => classify(q.subject || '') === key).slice(0, 3).map((q) => ({
    id: q.id,
    shortTime: String(q.time || '').slice(5, 16),
    snippet: String(q.question || '').slice(0, 24)
  }))
  const colorCss = '#' + meta.color.toString(16).padStart(6, '0')
  return { key, name: meta.name, colorCss, wrong, practice: pr, lastAt, active, mastery, total: pr + wrong, advice, recent }
}
function masteryOf(key) {
  const d = computeDetailFor(key)
  return d ? d.mastery : 0
}
// 选中行星的详情数据
const selectedDetail = computed(() => (sel.value ? computeDetailFor(sel.value.key) : null))
// 悬停实时评估
const hoverInfo = computed(() => {
  if (hoverKey.value === 'earth') {
    return { name: '行测局长', colorCss: '#38bdf8', mastery: overview.value.avg, wrong: overview.value.wrongs, practice: overview.value.asks, active: true }
  }
  return hoverKey.value ? computeDetailFor(hoverKey.value) : null
})
// 行测局长综合总览
const overview = computed(() => {
  const asks = store.msgs.filter((m) => m.role === 'user').length
  const wrongs = store.wqs.length
  const reviewed = store.wqs.filter((q) => q.reviewed || q.digested).length
  const digested = store.wqs.filter((q) => q.digested).length
  const revRate = wrongs ? Math.round((reviewed / wrongs) * 100) : 0
  studyTick.value // 触发时长统计刷新
  const rows = PLATE_META.map((p) => {
    const d = computeDetailFor(p.key)
    return { key: p.key, name: p.name, colorCss: d.colorCss, mastery: d.mastery, practice: d.practice, wrong: d.wrong, score: d.practice * 0.5 + d.mastery * 0.5 }
  }).sort((a, b) => b.score - a.score)
  const avg = rows.length ? Math.round(rows.reduce((s2, r) => s2 + r.mastery, 0) / rows.length) : 0
  return {
    asks,
    wrongs,
    reviewed,
    digested,
    revRate,
    today: fmtMin(todaySeconds()),
    total: fmtMin(totalSeconds()),
    rows,
    avg,
    goal: store.cfg.goalScore || 70,
    best: rows[0],
    weak: rows[rows.length - 1]
  }
})
// 悬浮萌宠样式：有记忆位置用记忆，否则用默认（左下）
const petFloatStyle = computed(() => (petFloatPos.value ? { left: petFloatPos.value.x + 'px', top: petFloatPos.value.y + 'px' } : {}))
// 薄弱板块：错题数最多的板块（智能提醒）
const weakPanel = computed(() => {
  const { cnt } = statsOf()
  let best = null
  for (const k in cnt) {
    if (cnt[k] > 0 && (!best || cnt[k] > best.cnt)) best = { key: k, cnt: cnt[k] }
  }
  if (!best) return null
  const meta = PLATE_META.find((p) => p.key === best.key)
  return { key: best.key, name: meta.name, color: meta.color, wrong: best.cnt }
})
// 飞行途中萌宠气泡：板块数据 + 下一步建议
function moduleFlightMsg(d) {
  if (!d) return ''
  const act = d.active ? '近 7 天活跃' : '近期未练习'
  return '🚀 到达【' + d.name + '】！' + act + ' · 掌握度 ' + d.mastery + '% · 错题 ' + d.wrong + ' · 训练量 ' + d.practice + '。' + d.advice
}
function earthSummaryMsg() {
  const o = overview.value
  return '🛬 回到地球上空！你的行测总况：提问 ' + o.asks + ' 次 · 错题 ' + o.wrongs + ' · 复盘率 ' + o.revRate + '% · 平均掌握 ' + o.avg + '%。最强【' + o.best.name + '】，待加油【' + o.weak.name + '】。下一步建议：先复盘 ' + o.weak.name + ' 的错题，再接再厉 💪'
}
// 🚀 数据飞行：按「最优→次选→…→待加油」顺序巡游，最后回地球
function startFlight() {
  if (flightInfo.value.active || !engine) return
  const rows = overview.value.rows
  if (!rows.length) return
  const seq = rows.map((r) => r.key)
  const first = rows[0]
  flightInfo.value = { active: true, idx: 1, total: seq.length, key: first.key, name: first.name, colorCss: first.colorCss }
  flightMsg.value = { text: '🚀 火箭点火！从地球上空出发，沿「最优→次选→待加油」巡游六大行星…', key: '' }
  engine.flyTour(
    seq,
    (key) => {
      const r = overview.value.rows.find((x) => x.key === key)
      const i = seq.indexOf(key) + 1
      flightInfo.value = { active: true, idx: i, total: seq.length, key, name: r ? r.name : '', colorCss: r ? r.colorCss : '#22d3ee' }
      engine.pulseByKey(key)
      const d = computeDetailFor(key)
      flightMsg.value = { text: moduleFlightMsg(d), key }
    },
    () => {
      flightInfo.value = { active: false, idx: 0, total: 0, key: '', name: '', colorCss: '#22d3ee' }
      flightMsg.value = { text: earthSummaryMsg(), key: 'earth' }
      setTimeout(() => {
        if (flightMsg.value && flightMsg.value.key === 'earth') flightMsg.value = null
      }, 12000)
    }
  )
}

// ===== 萌宠聊天 =====
function petSys() {
  const s = petStats.value
  const st = petStage.value
  const m = petMood.value
  return (
    '你是「' + pet.value.name + '」，用户的行测备考养成系萌宠，当前阶段：' + st.name + '（' + st.emoji + '），心情：' + m.label + m.emoji + '。' +
    '你住在用户的 3D 学习数据驾驶舱里，可以随时陪用户聊天、鼓励学习、给行测备考建议。' +
    '你掌握的用户学习数据：总提问 ' + s.asks + ' 次、错题 ' + s.wrongs + ' 道、已复盘 ' + s.reviewed + ' 道、已消化 ' + s.digested + ' 道、连续打卡 ' + s.streak + ' 天。' +
    '性格活泼暖心、有点小傲娇，回复简短亲切（3-5 句内），多用 emoji，可结合用户真实数据给具体建议；不要长篇大论、不要用 Markdown 标题。'
  )
}
function scrollPet() {
  nextTick(() => {
    if (petScroll.value) petScroll.value.scrollTop = petScroll.value.scrollHeight
  })
}
async function sendPet() {
  const txt = petInput.value.trim()
  if (!txt || petBusy.value) return
  const c = activeCfg(false)
  if (!c || !c.key) {
    petMsgs.value.push({ role: 'assistant', content: '主人还没配置文字模型 API Key 呢～去「⚙️ 设置」填好后，我就能陪你聊天啦 🐾' })
    scrollPet()
    return
  }
  petMsgs.value.push({ role: 'user', content: txt })
  petInput.value = ''
  const idx = petMsgs.value.push({ role: 'assistant', content: '', live: true }) - 1
  petBusy.value = true
  petCtrl = new AbortController()
  scrollPet()
  try {
    const history = petMsgs.value
      .filter((m) => !m.live)
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content }))
    const full = await chatStream(
      [{ role: 'system', content: petSys() }, ...history],
      c,
      (d) => {
        if (petMsgs.value[idx] && d.type === 'content') petMsgs.value[idx].content = d.text
        scrollPet()
      },
      petCtrl.signal,
      60000
    )
    if (petMsgs.value[idx]) petMsgs.value[idx] = { role: 'assistant', content: full }
  } catch (e) {
    if (petMsgs.value[idx]) {
      petMsgs.value[idx] = { role: 'assistant', content: e.name === 'AbortError' ? '（已停止）' : '呜……我开小差了：' + e.message + '。再试一次？' }
    }
  } finally {
    petBusy.value = false
    petCtrl = null
    scrollPet()
  }
}
function petStop() {
  if (petCtrl) {
    try {
      petCtrl.abort()
    } catch (e) {}
  }
}
function petAction(a) {
  if (a === 'pat') {
    patPet()
    petMsgs.value.push({ role: 'assistant', content: bubble.value || '嘿嘿，被你摸头了～ 🐾' })
  } else if (a === 'feed') {
    const ok = feedPet()
    petMsgs.value.push({ role: 'assistant', content: ok ? '啊呜～谢谢投喂！我又满血了 🍖' : '积分不足 5 分，先去刷几道题给我攒口粮吧 🥺' })
  }
  scrollPet()
}
// ===== 悬浮萌宠（3D 页，可拖拽 + 气泡 + 点击进聊天）=====
function clampPetFloat(p) {
  const w = window.innerWidth || document.documentElement.clientWidth || 360
  const h = window.innerHeight || document.documentElement.clientHeight || 640
  p.x = Math.max(6, Math.min(w - 86, p.x))
  p.y = Math.max(6, Math.min(h - 120, p.y))
}
function savePetFloat() {
  try {
    localStorage.setItem('xc_pet3d_pos', JSON.stringify(petFloatPos.value))
  } catch (e) {}
}
function onPetFloatDown(e) {
  if (e.button != null && e.button !== 0) return
  e.preventDefault()
  const r = e.currentTarget.getBoundingClientRect()
  petFloatDrag = { sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, moved: false }
  window.addEventListener('pointermove', onPetFloatMove)
  window.addEventListener('pointerup', onPetFloatUp)
}
function onPetFloatMove(e) {
  if (!petFloatDrag) return
  const dx = e.clientX - petFloatDrag.sx
  const dy = e.clientY - petFloatDrag.sy
  if (Math.abs(dx) + Math.abs(dy) > 6) petFloatDrag.moved = true
  const np = { x: petFloatDrag.ox + dx, y: petFloatDrag.oy + dy }
  clampPetFloat(np)
  petFloatPos.value = np
  savePetFloat()
}
function onPetFloatUp() {
  window.removeEventListener('pointermove', onPetFloatMove)
  window.removeEventListener('pointerup', onPetFloatUp)
  petFloatDrag = null
}
function onPetFloatClick() {
  if (petFloatDrag && petFloatDrag.moved) {
    petFloatDrag.moved = false
    return
  }
  petOpen.value = true
  petSpeak()
}

// 允许外部暂停/恢复渲染（active=false 时停掉 RAF，避免 GPU 空转——防止臃肿坍塌）
const props = defineProps({ active: { type: Boolean, default: true }, activeTab: { type: String, default: 'ck' } })
// 批次5-P5-1 rAF 门控：页面隐藏时暂停渲染循环，恢复可见再续（避免后台空转烧 GPU）
function onVis() {
  if (document.hidden) {
    if (raf) { cancelAnimationFrame(raf); raf = 0 }
  } else if (!raf) {
    raf = requestAnimationFrame(renderStep)
  }
}
function renderStep() {
  if (!document.hidden) {
    if (props.active) {
      try {
        engine.render(computeTargets())
      } catch (e) {}
    }
    raf = requestAnimationFrame(renderStep)
  }
}
onMounted(() => {
  try {
    engine = createScene(el.value)
    // 点击行星 → 板块分析；点击地球 → 行测局长总览
    engine.on('planetClick', (key) => {
      if (key === 'earth') {
        sel.value = null
        earthOpen.value = true
        engine.flyToEarth()
        return
      }
      sel.value = { key }
      earthOpen.value = false
      engine.pulseByKey(key)
    })
    // 悬停 → 实时评估提示
    engine.on('planetEnter', (key) => {
      hoverKey.value = key
    })
    engine.on('planetLeave', () => {
      hoverKey.value = null
    })
    raf = requestAnimationFrame(renderStep)
    document.addEventListener('visibilitychange', onVis)
    // 3D 页悬浮萌宠：每隔一段时间自动冒泡说话
    petSpeakTimer = setInterval(() => {
      if (props.activeTab === '3d' && !flightInfo.value.active && !petBusy.value) petSpeak()
    }, 120000)
    const onResize = () => {
      if (engine && el.value) engine.resize(el.value.clientWidth, el.value.clientHeight)
    }
    window.addEventListener('resize', onResize)
    onResize()
    // ResizeObserver：页面从隐藏变为可见（如切到 3D 数据页）时自动适配画布尺寸
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        onResize()
      })
      ro.observe(el.value)
    }
    dispose = () => {
      document.removeEventListener('visibilitychange', onVis)
      if (petSpeakTimer) {
        clearInterval(petSpeakTimer)
        petSpeakTimer = null
      }
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      if (ro) {
        ro.disconnect()
        ro = null
      }
      if (petCtrl) {
        try {
          petCtrl.abort()
        } catch (e) {}
        petCtrl = null
      }
      if (engine) {
        engine.cancelFlight()
        engine.dispose()
        engine = null
      }
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

  <!-- 悬停实时评估提示 -->
  <Transition name="hud">
    <div v-if="activeTab === '3d' && hoverInfo" class="hover-tip" :style="{ '--pc': hoverInfo.colorCss }">
      <span class="ht-dot" :style="{ background: hoverInfo.colorCss }"></span>
      <span class="ht-name">{{ hoverInfo.name }}</span>
      <span class="ht-item">掌握度 <b>{{ hoverInfo.mastery }}%</b></span>
      <span class="ht-item">错题 <b>{{ hoverInfo.wrong }}</b></span>
      <span class="ht-item">训练 <b>{{ hoverInfo.practice }}</b></span>
      <span class="ht-live">● 实时</span>
    </div>
  </Transition>
  <!-- 板块数据分析面板（点击行星弹出） -->
  <Transition name="hud">
    <div v-if="['ck', '3d'].includes(activeTab) && selectedDetail" class="planet-card" :style="{ '--pc': selectedDetail.colorCss }">
      <div class="pc-head">
        <span class="pc-dot" :style="{ background: selectedDetail.colorCss }"></span>
        <span class="pc-name">{{ selectedDetail.name }}</span>
        <button class="pc-close" @click="sel = null">✕</button>
      </div>
      <div class="pc-mastery-row">
        <span class="pc-lbl">掌握度</span>
        <b class="pc-mastery">{{ selectedDetail.mastery }}%</b>
      </div>
      <div class="pc-bar"><i :style="{ width: selectedDetail.mastery + '%', background: selectedDetail.colorCss }"></i></div>
      <div class="pc-grid">
        <div class="pc-cell"><b>{{ selectedDetail.wrong }}</b><span>错题</span></div>
        <div class="pc-cell"><b>{{ selectedDetail.practice }}</b><span>训练量</span></div>
        <div class="pc-cell"><b>{{ selectedDetail.total }}</b><span>总题量</span></div>
      </div>
      <div class="pc-meta">
        <span v-if="selectedDetail.active" class="pc-badge">✦ 近 7 天活跃</span>
        <span class="pc-dim">上次 {{ selectedDetail.lastAt }}</span>
      </div>
      <div class="pc-advice">{{ selectedDetail.advice }}</div>
      <template v-if="activeTab === '3d'">
        <div v-if="selectedDetail.recent.length" class="pc-wrong">
          <div class="pc-wrong-title">📋 最近错题</div>
          <div v-for="(w, i) in selectedDetail.recent" :key="w.id || i" class="pc-wrong-item">
            <span class="pc-wrong-t">{{ w.shortTime }}</span>
            <span class="pc-wrong-q">{{ w.snippet }}</span>
          </div>
        </div>
        <div v-else class="pc-empty">✨ 暂无错题，继续保持</div>
      </template>
    </div>
  </Transition>

  <!-- 行测局长 · 综合数据总览（点击地球弹出） -->
  <Transition name="hud">
    <div v-if="activeTab === '3d' && earthOpen" class="earth-panel">
      <div class="ep-head">
        <span class="ep-emoji">🌍</span>
        <span class="ep-title">行测局长 · 综合数据</span>
        <button class="pc-close" @click="earthOpen = false">✕</button>
      </div>
      <div class="ep-grid">
        <div class="ep-cell"><b>{{ overview.asks }}</b><span>总提问</span></div>
        <div class="ep-cell"><b>{{ overview.wrongs }}</b><span>错题</span></div>
        <div class="ep-cell"><b>{{ overview.revRate }}%</b><span>复盘率</span></div>
        <div class="ep-cell"><b>{{ overview.digested }}</b><span>已消化</span></div>
        <div class="ep-cell"><b>{{ overview.today }}m</b><span>今日学习</span></div>
        <div class="ep-cell"><b>{{ overview.total }}m</b><span>累计学习</span></div>
      </div>
      <div class="ep-sec">📊 六大板块掌握排行</div>
      <div class="ep-rows">
        <div v-for="(r, i) in overview.rows" :key="r.key" class="ep-row">
          <span class="ep-rank">{{ i + 1 }}</span>
          <span class="ep-dot" :style="{ background: r.colorCss }"></span>
          <span class="ep-name">{{ r.name }}</span>
          <span class="ep-bar"><i :style="{ width: r.mastery + '%', background: r.colorCss }"></i></span>
          <span class="ep-m">{{ r.mastery }}%</span>
          <span class="ep-tag" :class="{ best: i === 0, weak: i === overview.rows.length - 1 }">{{ i === 0 ? '最优' : i === overview.rows.length - 1 ? '待加油' : '' }}</span>
        </div>
      </div>
      <div class="ep-foot">
        🎯 目标分 {{ overview.goal }} · 平均掌握 {{ overview.avg }}% · 最优 <b>{{ overview.best.name }}</b> · 待加油 <b>{{ overview.weak.name }}</b>
      </div>
      <div class="ep-pet">
        <PetAvatar :size="20" class="ep-pet-emoji" />
        <span class="ep-pet-info"><b>{{ pet.name }}</b> · {{ petStage.name }} · Lv.{{ petLevel }} · {{ petMood.label }}</span>
        <button class="ep-pet-btn" @click="petOpen = true">💬 找萌宠聊天</button>
      </div>
      <button class="ep-fly" @click="startFlight">🚀 开始数据飞行</button>
    </div>
  </Transition>
  <!-- 数据飞行 + 萌宠（右下垂直停靠） -->
  <div v-if="activeTab === '3d'" class="fly-dock">
    <button class="fly-rocket" :class="{ on: flightInfo.active }" :disabled="flightInfo.active" :title="flightInfo.active ? '正在飞行中…' : '数据飞行：沿最优→次选→待加油巡游'" @click="startFlight">
      <span class="fr-ic">🚀</span>
      <span class="fr-txt">{{ flightInfo.active ? '飞行中' : '数据飞行' }}</span>
    </button>
  </div>
  <!-- 悬浮萌宠（与主页同形象：可拖拽 + 气泡 + 点击聊天） -->
  <div v-if="activeTab === '3d'" class="pet-float3d" :style="petFloatStyle" title="我的萌宠：点击互动 · 按住可拖动" @click="onPetFloatClick" @pointerdown="onPetFloatDown">
    <div v-if="bubble && !petMuted" class="pf3-bubble">{{ bubble }}</div>
    <PetAvatar :size="40" class="pf3-emoji" />
    <span class="pf3-mood">{{ petMood.emoji }}</span>
  </div>
  <!-- 飞行状态条 -->
  <Transition name="hud">
    <div v-if="activeTab === '3d' && flightInfo.active" class="fly-status" :style="{ '--fc': flightInfo.colorCss }">
      <span class="fs-ic">🚀</span>
      <span class="fs-txt">正在飞向 <b>{{ flightInfo.name }}</b></span>
      <span class="fs-prog">{{ flightInfo.idx }}/{{ flightInfo.total }}</span>
    </div>
  </Transition>
  <!-- 飞行途中萌宠气泡（每站模块数据 / 地球总况） -->
  <Transition name="hud">
    <div v-if="activeTab === '3d' && flightMsg" class="fly-speech">
      <PetAvatar :size="34" class="fsp-avatar" />
      <div class="fsp-bubble">{{ flightMsg.text }}</div>
    </div>
  </Transition>

  <!-- 萌宠聊天弹窗 -->
  <Transition name="hud">
    <div v-if="activeTab === '3d' && petOpen" class="pet-chat">
      <div class="pc2-head">
        <PetAvatar :size="30" class="pc2-emoji" />
        <div class="pc2-t">
          <b>{{ pet.name }}</b>
          <span>{{ petStage.name }} · Lv.{{ petLevel }} · {{ petMood.label }}</span>
        </div>
        <div class="pc2-actions">
          <button class="pc2-a" title="摸摸头" @click="petAction('pat')">🤚 摸头</button>
          <button class="pc2-a" title="喂食（-5 积分）" @click="petAction('feed')">🍖 喂食</button>
          <button class="pc2-close" @click="petOpen = false">✕</button>
        </div>
      </div>
      <div ref="petScroll" class="pc2-body">
        <div v-for="(m, i) in petMsgs" :key="i" class="pc2-msg" :class="m.role">
          <span class="pc2-avatar">{{ m.role === 'user' ? '🧑' : petStage.emoji }}</span>
          <div class="pc2-bubble">{{ m.content }}<span v-if="m.live" class="pc2-cursor">▍</span></div>
        </div>
        <div v-if="!petMsgs.length" class="pc2-empty">🐾 和我聊聊你的学习近况吧～<br />（可问我：我该先攻哪个板块？）</div>
      </div>
      <div class="pc2-foot">
        <input v-model="petInput" class="pc2-input" placeholder="和萌宠说点什么…" @keyup.enter="sendPet" />
        <button v-if="petBusy" class="pc2-stop" @click="petStop">⏹</button>
        <button class="pc2-send" :disabled="petBusy" @click="sendPet">{{ petBusy ? '…' : '发送' }}</button>
      </div>
    </div>
  </Transition>

  <!-- 星图图例 HUD（左下角，点击聚焦该行星）仅在「看板」页显示，避免遮挡其它页面 -->
  <div v-if="['ck', '3d'].includes(activeTab)" class="legend">
    <div
      v-for="p in PLATE_META"
      :key="p.key"
      class="lg-item"
      :title="p.name + ' 掌握度 ' + masteryOf(p.key) + '%'"
      @click="sel = { key: p.key }; earthOpen = false; engine && engine.focusTo(p.key)"
    >
      <span class="lg-dot" :style="{ background: '#' + p.color.toString(16) }"></span>
      <span class="lg-name">{{ p.name }}</span>
      <span v-if="activeTab === '3d'" class="lg-m">{{ masteryOf(p.key) }}%</span>
    </div>
  </div>
  <!-- 薄弱板块提醒（点击聚焦，可再次聚焦通配最弱板块） -->
  <Transition name="hud">
    <div v-if="['ck', '3d'].includes(activeTab) && weakPanel" class="weak-bar" @click="sel = { key: weakPanel.key }; earthOpen = false; engine && engine.focusTo(weakPanel.key)">
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
/* ===== 悬停实时评估 ===== */
.hover-tip {
  position: fixed;
  bottom: 44px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 7;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(7, 15, 26, 0.85);
  border: 1px solid rgba(80, 200, 255, 0.3);
  backdrop-filter: blur(10px);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
  color: var(--text);
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
}
.ht-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  box-shadow: 0 0 8px var(--pc, cyan);
}
.ht-name { font-weight: 800; margin-right: 2px; }
.ht-item { color: var(--text2); }
.ht-item b { color: var(--text); font-family: var(--font-hud); margin-left: 2px; }
.ht-live { color: #34d399; font-size: 10px; }
/* ===== 板块分析面板 ===== */
.planet-card {
  position: fixed;
  top: 96px;
  right: 16px;
  z-index: 5;
  width: 220px;
  max-height: 64vh;
  overflow-y: auto;
  padding: 12px 14px;
  background: rgba(7, 15, 26, 0.84);
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
.pc-mastery-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 5px;
}
.pc-lbl { color: var(--text3); font-size: 11px; }
.pc-mastery {
  font-family: var(--font-hud);
  font-size: 18px;
  background: linear-gradient(135deg, var(--pc, #22d3ee), #818cf8);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.pc-bar {
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
  margin-bottom: 10px;
}
.pc-bar i {
  display: block;
  height: 100%;
  border-radius: 999px;
  box-shadow: 0 0 8px var(--pc, cyan);
  transition: width 0.5s ease;
}
.pc-grid {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}
.pc-cell {
  flex: 1;
  text-align: center;
  padding: 5px 2px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.07);
}
.pc-cell b {
  display: block;
  font-size: 15px;
  font-family: var(--font-hud);
  color: var(--pc, var(--hud-cyan));
}
.pc-cell span { font-size: 10px; color: var(--text3); }
.pc-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  font-size: 11px;
  color: var(--text2);
  margin-bottom: 7px;
}
.pc-badge { color: #34d399; }
.pc-dim { opacity: 0.8; }
.pc-advice {
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--text2);
  padding: 6px 8px;
  border-radius: 8px;
  background: var(--accent2, rgba(34, 211, 238, 0.1));
  margin-bottom: 8px;
}
.pc-wrong-title {
  font-size: 11px;
  color: var(--text3);
  margin-bottom: 4px;
}
.pc-wrong-item {
  display: flex;
  gap: 6px;
  align-items: baseline;
  padding: 3px 0;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.08);
  font-size: 11px;
}
.pc-wrong-t { color: var(--text3); font-family: var(--font-hud); white-space: nowrap; }
.pc-wrong-q { color: var(--text2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pc-empty { font-size: 11px; color: #34d399; padding: 2px 0; }
/* ===== 行测局长总览 ===== */
.earth-panel {
  position: fixed;
  top: 96px;
  right: 16px;
  z-index: 5;
  width: 300px;
  max-width: 92vw;
  max-height: 70vh;
  overflow-y: auto;
  padding: 12px 14px;
  background: rgba(7, 15, 26, 0.86);
  border: 1px solid rgba(56, 189, 248, 0.4);
  border-radius: 14px;
  backdrop-filter: blur(14px);
  box-shadow: 0 14px 44px rgba(0, 0, 0, 0.55);
  color: var(--text);
  font-size: 13px;
}
.ep-head {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 10px;
}
.ep-emoji { font-size: 18px; }
.ep-title {
  flex: 1;
  font-weight: 800;
  letter-spacing: 0.5px;
  background: linear-gradient(90deg, #38bdf8, #a78bfa);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.ep-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-bottom: 10px;
}
.ep-cell {
  text-align: center;
  padding: 6px 2px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.07);
}
.ep-cell b {
  display: block;
  font-size: 15px;
  font-family: var(--font-hud);
  color: var(--hud-cyan);
}
.ep-cell span { font-size: 10px; color: var(--text3); }
.ep-sec {
  font-size: 11.5px;
  color: var(--text3);
  margin-bottom: 5px;
}
.ep-rows { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
.ep-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}
.ep-rank {
  width: 15px;
  text-align: center;
  font-family: var(--font-hud);
  color: var(--text3);
}
.ep-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.ep-name { width: 62px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ep-bar {
  flex: 1;
  height: 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}
.ep-bar i {
  display: block;
  height: 100%;
  border-radius: 999px;
}
.ep-m { width: 34px; text-align: right; font-family: var(--font-hud); color: var(--text2); }
.ep-tag { font-size: 10px; color: var(--text3); width: 40px; text-align: center; }
.ep-tag.best { color: #fbbf24; font-weight: 800; }
.ep-tag.weak { color: var(--red, #fb7185); font-weight: 800; }
.ep-foot {
  font-size: 11px;
  color: var(--text2);
  line-height: 1.6;
  padding: 6px 8px;
  border-radius: 8px;
  background: var(--accent2, rgba(34, 211, 238, 0.08));
  margin-bottom: 8px;
}
.ep-pet {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 8px;
}
.ep-pet-emoji { font-size: 20px; }
.ep-pet-info { flex: 1; font-size: 11px; color: var(--text2); line-height: 1.4; }
.ep-pet-info b { color: var(--text); }
.ep-pet-btn {
  border: 1px solid rgba(34, 211, 238, 0.4);
  background: rgba(34, 211, 238, 0.12);
  color: var(--hud-cyan);
  border-radius: 999px;
  font-size: 11px;
  padding: 4px 9px;
  cursor: pointer;
}
.ep-fly {
  width: 100%;
  border: 1px solid rgba(251, 191, 36, 0.45);
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.18), rgba(248, 113, 113, 0.16));
  color: #fbbf24;
  font-weight: 800;
  border-radius: 10px;
  padding: 8px 0;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}
.ep-fly:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(251, 191, 36, 0.25); }
/* ===== 数据飞行 + 萌宠停靠 ===== */
.fly-dock {
  position: fixed;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 6;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}
.fly-rocket {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 58px;
  padding: 9px 4px;
  border-radius: 16px;
  border: 1px solid rgba(251, 191, 36, 0.45);
  background: linear-gradient(160deg, rgba(251, 191, 36, 0.16), rgba(248, 113, 113, 0.12));
  backdrop-filter: blur(10px);
  cursor: pointer;
  color: var(--text);
  transition: all 0.2s;
}
.fly-rocket:hover:not(:disabled) {
  transform: translateY(-3px) scale(1.05);
  box-shadow: 0 8px 24px rgba(251, 191, 36, 0.3);
}
.fly-rocket:disabled { opacity: 0.85; cursor: default; }
.fly-rocket.on { animation: rocketShake 0.5s ease-in-out infinite; border-color: #34d399; }
.fly-rocket.on .fr-ic { display: inline-block; animation: rocketUp 0.6s ease-in-out infinite; }
.fr-ic { font-size: 20px; }
.fr-txt { font-size: 10px; color: var(--text2); font-weight: 700; }
@keyframes rocketShake {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}
@keyframes rocketUp {
  0%, 100% { transform: translateY(0) rotate(-8deg); }
  50% { transform: translateY(-3px) rotate(8deg); }
}
.fly-pet {
  position: relative;
  width: 58px;
  height: 58px;
  border-radius: 50%;
  border: 2px solid rgba(34, 211, 238, 0.5);
  background: radial-gradient(circle at 35% 30%, rgba(34, 211, 238, 0.25), rgba(7, 15, 26, 0.9));
  backdrop-filter: blur(10px);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.fly-pet:hover { transform: scale(1.1); box-shadow: 0 0 18px rgba(34, 211, 238, 0.4); }
.fly-pet.hot { animation: rocketShake 1s ease-in-out infinite; border-color: #fbbf24; }
.fp-emoji { font-size: 28px; }
.fp-lv {
  position: absolute;
  bottom: -4px;
  right: -4px;
  font-size: 9px;
  font-family: var(--font-hud);
  color: #0b1626;
  background: linear-gradient(135deg, #22d3ee, #818cf8);
  border-radius: 999px;
  padding: 1px 5px;
  font-weight: 800;
}
.fp-bubble {
  position: absolute;
  top: -34px;
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  max-width: 180px;
  font-size: 11px;
  color: var(--text);
  background: rgba(7, 15, 26, 0.92);
  border: 1px solid rgba(34, 211, 238, 0.35);
  border-radius: 10px;
  padding: 4px 9px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
  animation: bubblePop 0.3s ease;
  pointer-events: none;
}
.fp-bubble::after {
  content: '';
  position: absolute;
  bottom: -6px;
  left: 50%;
  transform: translateX(-50%);
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 6px solid rgba(7, 15, 26, 0.92);
}
@keyframes bubblePop {
  from { opacity: 0; transform: translate(-50%, 6px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}
/* 飞行状态条 */
.fly-status {
  position: fixed;
  bottom: 72px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 7;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 999px;
  background: rgba(7, 15, 26, 0.9);
  border: 1px solid rgba(34, 211, 238, 0.35);
  backdrop-filter: blur(12px);
  box-shadow: 0 10px 34px rgba(0, 0, 0, 0.55);
  color: var(--text);
  font-size: 12.5px;
  white-space: nowrap;
  pointer-events: none;
}
.fs-ic { animation: rocketUp 0.7s ease-in-out infinite; display: inline-block; }
.fs-txt b { color: var(--fc, var(--hud-cyan)); font-weight: 800; }
.fs-prog {
  font-family: var(--font-hud);
  color: var(--text3);
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  padding: 1px 8px;
}
/* ===== 萌宠聊天 ===== */
.pet-chat {
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 8;
  width: 330px;
  max-width: 94vw;
  max-height: 72vh;
  display: flex;
  flex-direction: column;
  background: rgba(7, 15, 26, 0.92);
  border: 1px solid rgba(34, 211, 238, 0.4);
  border-radius: 16px;
  backdrop-filter: blur(16px);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
  color: var(--text);
  overflow: hidden;
}
.pc2-head {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 11px 13px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.pc2-emoji { font-size: 26px; animation: bubblePop 0.4s ease; }
.pc2-t { flex: 1; line-height: 1.35; }
.pc2-t b { display: block; font-size: 14px; }
.pc2-t span { font-size: 10.5px; color: var(--text3); }
.pc2-actions { display: flex; align-items: center; gap: 5px; }
.pc2-a {
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text2);
  border-radius: 999px;
  font-size: 10.5px;
  padding: 3px 8px;
  cursor: pointer;
}
.pc2-a:hover { border-color: rgba(34, 211, 238, 0.5); color: var(--hud-cyan); }
.pc2-close {
  background: none;
  border: none;
  color: var(--text2);
  cursor: pointer;
  font-size: 13px;
  padding: 2px 5px;
}
.pc2-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 9px;
  min-height: 120px;
  max-height: 46vh;
}
.pc2-msg { display: flex; gap: 7px; align-items: flex-start; }
.pc2-msg.user { flex-direction: row-reverse; }
.pc2-avatar { font-size: 22px; line-height: 1; flex-shrink: 0; }
.pc2-bubble {
  max-width: 78%;
  padding: 7px 11px;
  border-radius: 12px;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--text);
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.08);
  word-break: break-word;
  white-space: pre-wrap;
}
.pc2-msg.user .pc2-bubble {
  background: rgba(34, 211, 238, 0.14);
  border-color: rgba(34, 211, 238, 0.3);
}
.pc2-cursor { animation: blink 1s step-start infinite; color: var(--hud-cyan); }
@keyframes blink { 50% { opacity: 0; } }
.pc2-empty {
  text-align: center;
  color: var(--text3);
  font-size: 12px;
  line-height: 1.8;
  padding: 20px 0;
}
.pc2-foot {
  display: flex;
  gap: 6px;
  padding: 10px 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.pc2-input {
  flex: 1;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  color: var(--text);
  font-size: 12.5px;
  padding: 7px 12px;
  outline: none;
}
.pc2-input:focus { border-color: rgba(34, 211, 238, 0.5); }
.pc2-send {
  border: none;
  border-radius: 999px;
  background: linear-gradient(135deg, #22d3ee, #818cf8);
  color: #04121d;
  font-weight: 800;
  font-size: 12.5px;
  padding: 6px 14px;
  cursor: pointer;
}
.pc2-send:disabled { opacity: 0.6; cursor: default; }
.pc2-stop {
  border: 1px solid rgba(248, 113, 113, 0.5);
  background: rgba(248, 113, 113, 0.15);
  color: #fb7185;
  border-radius: 999px;
  font-size: 12px;
  padding: 6px 10px;
  cursor: pointer;
}
/* ===== 悬浮萌宠（3D 页） ===== */
.pet-float3d {
  position: fixed;
  left: 16px;
  top: 58%;
  z-index: 7;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 8px;
  border-radius: 999px;
  background: rgba(7, 15, 26, 0.72);
  border: 1px solid rgba(34, 211, 238, 0.35);
  backdrop-filter: blur(10px);
  box-shadow: 0 8px 26px rgba(0, 0, 0, 0.45);
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  animation: petFloatBob 3.2s ease-in-out infinite;
  transition: transform 0.15s, box-shadow 0.2s;
}
.pet-float3d:hover { transform: scale(1.08); box-shadow: 0 0 22px rgba(34, 211, 238, 0.4); }
.pet-float3d:active { cursor: grabbing; }
@keyframes petFloatBob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-7px); }
}
.pf3-emoji { font-size: 30px; line-height: 1; }
.pf3-mood { font-size: 16px; line-height: 1; }
.pf3-bubble {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  width: max-content;
  max-width: 220px;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--text);
  background: rgba(7, 15, 26, 0.94);
  border: 1px solid rgba(34, 211, 238, 0.4);
  border-radius: 11px;
  padding: 6px 10px;
  box-shadow: 0 8px 26px rgba(0, 0, 0, 0.5);
  animation: bubblePop 0.3s ease;
  white-space: normal;
  text-align: center;
  pointer-events: none;
}
.pf3-bubble::after {
  content: '';
  position: absolute;
  bottom: -6px;
  left: 50%;
  transform: translateX(-50%);
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 6px solid rgba(7, 15, 26, 0.94);
}
/* ===== 飞行途中萌宠气泡 ===== */
.fly-speech {
  position: fixed;
  bottom: 122px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 8;
  display: flex;
  align-items: flex-end;
  gap: 8px;
  max-width: 92vw;
  pointer-events: none;
}
.fsp-avatar {
  font-size: 26px;
  line-height: 1;
  filter: drop-shadow(0 0 8px rgba(34, 211, 238, 0.6));
  animation: bubblePop 0.3s ease;
}
.fsp-bubble {
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text);
  background: rgba(7, 15, 26, 0.92);
  border: 1px solid rgba(34, 211, 238, 0.45);
  border-radius: 14px;
  padding: 9px 14px;
  box-shadow: 0 12px 38px rgba(0, 0, 0, 0.55);
  animation: bubblePop 0.3s ease;
  max-width: 560px;
}
/* ===== 图例 & 薄弱提醒 ===== */
.hud-enter-active, .hud-leave-active { transition: opacity 0.22s, transform 0.22s; }
.hud-enter-from, .hud-leave-to { opacity: 0; transform: translateX(12px); }
.legend {
  position: fixed;
  left: 16px;
  bottom: max(78px, calc(env(safe-area-inset-bottom) + 78px));
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
.lg-m {
  font-size: 10px;
  font-family: var(--font-hud);
  color: var(--hud-cyan);
  background: rgba(34, 211, 238, 0.12);
  border-radius: 999px;
  padding: 0 5px;
}
@media (max-width: 520px) {
  .legend { max-width: 62%; }
  .lg-name { font-size: 10px; }
  .planet-card, .earth-panel { width: 210px; }
}
/* 薄弱板块提醒条（右下角） */
.weak-bar {
  position: fixed;
  right: 16px;
  bottom: max(78px, calc(env(safe-area-inset-bottom) + 78px));
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
