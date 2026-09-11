<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { CARDS } from '../kb/cards-index'
import { chatOnce, activeCfg } from '../api'
import { renderMd } from '../utils/renderMd'
import { showToast } from '../utils/toast'

const props = defineProps({ initialTab: { type: String, default: 'logic' } })
const emit = defineEmits(['close'])
const md = (t) => renderMd(t || '')
const tab = ref(props.initialTab || 'logic')
const logicText = ref('')
const logicBusy = ref(false)
const logicOut = ref('')
const topics = computed(() => {
  const map = new Map()
  for (const c of CARDS || []) if (c && c.plate && !map.has(c.plate)) map.set(c.plate, c)
  return Array.from(map.entries()).map(([plate, c]) => ({ plate, card: c }))
})
const topic = ref(null)
const sceneIdx = ref(0)
const playing = ref(false)
let timer = null
const scenes = computed(() => {
  const c = topic.value && topic.value.card
  if (!c) return []
  return [
    { icon: '🎯', t: '考点', d: (c.plate || '') + ' · ' + (c.type || '知识卡') },
    { icon: '🔍', t: '怎么认', d: (c.signs || []).join('；') || '从问法和题干关键词定位题型' },
    { icon: '🪜', t: '怎么做', d: (c.steps || []).join(' → ') || (c.detail || '') },
    { icon: '⚠️', t: '别踩坑', d: (c.traps || []).join('；') || '注意主体、范围和力度比较' },
    { icon: '🧠', t: '记住这句', d: c.tip || '先识别题型，再套方法' }
  ]
})
const currentScene = computed(() => scenes.value[sceneIdx.value] || scenes.value[0] || null)
const progress = computed(() => (scenes.value.length ? ((sceneIdx.value + 1) / scenes.value.length) * 100 : 0))
function selectTopic(t) {
  topic.value = t
  sceneIdx.value = 0
  playing.value = false
  clearTimer()
  speak('开始学习：' + (t.card.type || t.plate))
}
function clearTimer() { if (timer) { clearInterval(timer); timer = null } }
function stopVoice() { try { if (window.speechSynthesis) window.speechSynthesis.cancel() } catch (e) {} }
function speak(text) {
  try {
    if (!window.speechSynthesis || !('SpeechSynthesisUtterance' in window)) return
    stopVoice()
    const u = new SpeechSynthesisUtterance(String(text || ''))
    u.lang = 'zh-CN'
    u.rate = 0.95
    window.speechSynthesis.speak(u)
  } catch (e) {}
}
function playScene() {
  if (!scenes.value.length) return
  const sc = scenes.value[sceneIdx.value]
  if (sc) speak(sc.t + '。' + sc.d)
}
function play() {
  if (!topic.value) { showToast('请先选一个学习主题', 'info'); return }
  playing.value = true
  clearTimer()
  playScene()
  timer = setInterval(() => {
    if (sceneIdx.value >= scenes.value.length - 1) {
      playing.value = false
      clearTimer()
      return
    }
    sceneIdx.value++
    playScene()
  }, 3600)
}
function pause() { playing.value = false; clearTimer(); stopVoice() }
function prev() { if (!scenes.value.length) return; sceneIdx.value = (sceneIdx.value - 1 + scenes.value.length) % scenes.value.length; stopVoice() }
function next() { if (!scenes.value.length) return; sceneIdx.value = (sceneIdx.value + 1) % scenes.value.length; stopVoice() }
async function translate() {
  const q = logicText.value.trim()
  if (!q) { showToast('请先粘贴一道逻辑判断题', 'info'); return }
  logicBusy.value = true
  logicOut.value = ''
  try {
    const c = activeCfg()
    if (!c || !c.key) throw new Error('请先配置文字模型')
    const sys = '你是行测逻辑判断名师，最擅长把抽象题干翻译成大白话。只讲结构，不空谈理论。'
    const user = '请帮我彻底读懂这道题，用考生能看懂的大白话拆解：\n\n' + q + '\n\n请按下面格式输出：\n① 题干大白话：分别说清“题干在讲什么”和“最后想证明什么”\n② 论证结构：结论 / 论据 / 隐藏前提，用箭头标出推理方向\n③ 题型判定：属于削弱/加强/前提/解释/推出/评价哪一类\n④ 选项速读：如果题干有选项，逐个用一句话翻译它的作用方向\n⑤ 秒杀抓手：看到这类题先抓哪两个词'
    const out = await chatOnce(c, [{ role: 'system', content: sys }, { role: 'user', content: user }], 1200)
    logicOut.value = out || '（无返回）'
  } catch (e) {
    logicOut.value = '生成失败：' + e.message
  } finally {
    logicBusy.value = false
  }
}
onUnmounted(() => { clearTimer(); stopVoice() })
</script>

<template>
  <div class="ov show at-ov" @click.self="emit('close')">
    <div class="pnl at-pnl">
      <div class="at-head">
        <button class="pnl-top-b" @click="emit('close')">← 返回知识库</button>
        <b class="at-title">🎬 AI 动画微课</b>
        <button class="pc-close" @click="emit('close')">✕</button>
      </div>
      <div class="at-tabs">
        <button class="btn" :class="tab === 'logic' ? 'btn-pri' : 'btn-gh'" @click="tab = 'logic'">🧭 逻辑题干白话翻译</button>
        <button class="btn" :class="tab === 'video' ? 'btn-pri' : 'btn-gh'" @click="tab = 'video'">🎬 各板块动画微课</button>
      </div>

      <div v-if="tab === 'logic'" class="at-logic">
        <div class="at-note">不会翻译题干，选项再多也没用。把一道逻辑判断题贴进来，先学会用大白话还原结论和论据。</div>
        <textarea v-model="logicText" rows="7" class="pv-edit" placeholder="粘贴逻辑判断题：题干 + 选项，可带答案"></textarea>
        <div class="at-logic-acts">
          <button class="btn btn-pri" :disabled="logicBusy" @click="translate()">{{ logicBusy ? '⏳ 正在翻译…' : '🧭 开始大白话翻译' }}</button>
        </div>
        <div v-if="logicOut" class="at-logic-out" v-html="md(logicOut)"></div>
      </div>

      <div v-else class="at-video">
        <div class="at-topics">
          <button v-for="t in topics" :key="t.plate" class="shelf-tab" :class="{ on: topic && topic.plate === t.plate }" @click="selectTopic(t)">{{ t.plate }} · {{ t.card.type }}</button>
        </div>
        <template v-if="topic">
          <div class="at-stage">
            <div v-if="currentScene" :key="sceneIdx" class="at-scene at-in">
              <div class="at-scene-i">{{ currentScene.icon }}</div>
              <div class="at-scene-t">{{ currentScene.t }}</div>
              <div class="at-scene-d">{{ currentScene.d }}</div>
            </div>
            <div class="at-progress"><i :style="{ width: progress + '%' }"></i></div>
          </div>
          <div class="at-player">
            <button class="btn btn-gh" @click="prev()">⏮</button>
            <button v-if="!playing" class="btn btn-pri" @click="play()">▶ 播放</button>
            <button v-else class="btn btn-gh" @click="pause()">⏸ 暂停</button>
            <button class="btn btn-gh" @click="next()">⏭</button>
            <span class="at-free">🔊 免费系统朗读 · 本地动画，零额度</span>
          </div>
        </template>
        <div v-else class="at-empty">选一个板块开始动画微课。内容来自本地名师方法卡，可免费反复看。</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.at-ov { z-index: 450; }
.at-pnl { width: min(900px, 96vw); max-height: 92vh; overflow: auto; padding: 12px 14px; }
.at-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.at-title { font-size: calc(17px * var(--ui-fs-scale, 1)); color: var(--accent); }
.at-tabs { display: flex; gap: 7px; flex-wrap: wrap; margin-bottom: 10px; }
.at-note { color: var(--text2); font-size: calc(12.5px * var(--ui-fs-scale, 1)); line-height: 1.7; margin-bottom: 8px; }
.at-logic textarea, .at-logic .pv-edit { width: 100%; resize: vertical; }
.at-logic-acts { margin: 8px 0; }
.at-logic-out { margin-top: 10px; border: 1px solid var(--glass-border); border-radius: 10px; padding: 10px 12px; background: var(--glass-bg); line-height: 1.85; font-size: calc(13px * var(--ui-fs-scale, 1)); }
.at-topics { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 10px; }
.at-stage { min-height: 230px; border: 1px solid var(--glass-border); border-radius: 14px; background: linear-gradient(135deg, rgba(34,211,238,.12), rgba(167,139,250,.1)); padding: 22px 18px 16px; display: flex; flex-direction: column; justify-content: center; }
.at-scene { text-align: center; }
.at-scene-i { font-size: 52px; margin-bottom: 6px; }
.at-scene-t { font-size: calc(18px * var(--ui-fs-scale, 1)); font-weight: 900; color: var(--accent); margin-bottom: 12px; }
.at-scene-d { max-width: 720px; margin: 0 auto; font-size: calc(15px * var(--ui-fs-scale, 1)); line-height: 1.9; color: var(--text); }
.at-in { animation: atIn .55s ease both; }
@keyframes atIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
.at-progress { height: 6px; border-radius: 4px; background: rgba(127,127,127,.2); overflow: hidden; margin-top: 14px; }
.at-progress i { display: block; height: 100%; background: linear-gradient(90deg,#22d3ee,#34d399); transition: width .3s; }
.at-player { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
.at-free { color: var(--text3); font-size: calc(12px * var(--ui-fs-scale, 1)); margin-left: auto; }
.at-empty { color: var(--text3); padding: 30px 0; text-align: center; }
@media (max-width: 640px) { .at-pnl { width: 100%; height: 100dvh; max-height: 100dvh; border-radius: 0; } .at-free { margin-left: 0; } }
</style>
