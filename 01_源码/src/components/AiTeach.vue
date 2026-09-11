<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { CARDS } from '../kb/cards-index'
import { chatOnce, activeCfg } from '../api'
import { renderMd } from '../utils/renderMd'
import { showToast } from '../utils/toast'
import { store, saveCfg } from '../store'
import { answerLetter } from '../utils/quiz'
import { pickGenCfg } from '../utils/fastMode'
import { buildPlainTranslationPrompt, sanitizePlainTranslation } from '../utils/plainTranslate'
import { speak, stopSpeak, primeTts, TTS_ENGINES } from '../utils/tts'
import AiLessonStage from './AiLessonStage.vue'

const props = defineProps({ initialTab: { type: String, default: 'logic' }, initialText: { type: String, default: '' }, initialAnswer: { type: String, default: '' } })
const emit = defineEmits(['close'])
const md = (t) => renderMd(t || '')
const tab = ref(props.initialTab || 'logic')
const logicText = ref(props.initialText || '')
const logicBusy = ref(false)
const logicOut = ref('')
const logicExpectedAnswer = ref(answerLetter(props.initialAnswer || '') || String(props.initialAnswer || '').trim())
const imageBusy = ref(false)
const wrongPick = ref('')
const fileInput = ref(null)
const panelRef = ref(null)
const wrongs = computed(() => (store.wqs || []).slice(0, 80))
const coursePlate = ref('all')
const courseTeacher = ref('all')
const courseKw = ref('')
const allTopics = computed(() => (CARDS || []).filter((c) => c && c.plate && c.type).map((c) => ({ plate: c.plate, card: c, id: c.id })))
const coursePlates = computed(() => [...new Set(allTopics.value.map((t) => t.plate))])
const courseTeachers = computed(() => [...new Set(allTopics.value.map((t) => t.card.source).filter(Boolean))])
const topics = computed(() => allTopics.value.filter((t) => {
  if (coursePlate.value !== 'all' && t.plate !== coursePlate.value) return false
  if (courseTeacher.value !== 'all' && t.card.source !== courseTeacher.value) return false
  const k = courseKw.value.trim()
  if (k && !JSON.stringify(t.card).includes(k)) return false
  return true
}))
const topic = ref(null)
const lesson = ref(null)
const lessonBusy = ref(false)
const sceneIdx = ref(0)
const playing = ref(false)
const transcriptOpen = ref(false)
const checkpointPick = ref('')
const checkpointOk = ref(false)
let playToken = 0
const LESSON_CACHE_KEY = 'xc_micro_lesson_cache_v1'
const LESSON_CACHE_VERSION = 1
const scenes = computed(() => (lesson.value && lesson.value.scenes) || [])
const currentScene = computed(() => scenes.value[sceneIdx.value] || null)
const progress = computed(() => (scenes.value.length ? ((sceneIdx.value + 1) / scenes.value.length) * 100 : 0))
const lessonTitle = computed(() => (lesson.value && lesson.value.title) || '未生成课程')

function stopNarration() { playToken++; try { stopSpeak() } catch (e) {} }
function sceneNarration(sc) { return sc ? sc.title + '。' + sc.body + (sc.points || []).join('；') : '' }
function lessonCacheKey(card) {
  return String((card && (card.id || card.type + '|' + card.plate)) || 'micro')
}
function readLessonCache() {
  try { return JSON.parse(localStorage.getItem(LESSON_CACHE_KEY) || '{}') || {} } catch (e) { return {} }
}
function getCachedLesson(card) {
  const hit = readLessonCache()[lessonCacheKey(card)]
  if (!hit || hit.v !== LESSON_CACHE_VERSION || !hit.lesson || !Array.isArray(hit.lesson.scenes)) return null
  return hit.lesson
}
function saveLessonCache(card, value) {
  try {
    const all = readLessonCache()
    all[lessonCacheKey(card)] = { v: LESSON_CACHE_VERSION, t: Date.now(), lesson: value }
    const rows = Object.entries(all).sort((a, b) => (b[1].t || 0) - (a[1].t || 0)).slice(0, 30)
    localStorage.setItem(LESSON_CACHE_KEY, JSON.stringify(Object.fromEntries(rows)))
  } catch (e) {}
}
function ensureCompleteScript(text) {
  const t = String(text || '').trim()
  if (!t) return ''
  return /[。！？…]$/.test(t) ? t : t + '。'
}
function localSceneScript(sc, card) {
  const base = ((sc && sc.body) || '') + ((sc && sc.points && sc.points.length) ? '。' + sc.points.join('；') : '')
  const points = (sc && sc.points) || []
  return ensureCompleteScript(
    '我们先看“' + ((sc && sc.title) || '这一段') + '”。' +
    base +
    (points.length > 1 ? '关键要抓住：' + points.slice(0, 3).join('、') + '。' : '') +
    '把这一步和“' + (card.type || '核心方法') + '”连起来，就能落到做题动作上。'
  )
}
function localLessonScripts(value, card) {
  return (value.scenes || []).map((sc) => localSceneScript(sc, card))
}
function sceneDigest(value) {
  return (value.scenes || []).map((s, i) => ({
    i: i + 1,
    type: s.type || 'flow',
    title: s.title || '',
    body: s.body || '',
    points: s.points || [],
    example: s.example || null,
    options: s.options || null,
    answer: s.answer || '',
    explain: s.explain || ''
  }))
}
async function buildLessonScripts(value, card) {
  const scenes = value.scenes || []
  if (!scenes.length) return []
  const sys = '你是资深行测名师和讲课稿撰稿人。你的任务不是写提纲，而是为整节动画微课一次性写完整、可直接朗读的教师讲课稿。只输出 JSON，不要 Markdown，不要解释。'
  const user = '请围绕下面的知识卡和微课场景，一次性生成每一幕的完整教学讲稿。\n' +
    '知识卡：' + JSON.stringify({ plate: card.plate, type: card.type, signs: card.signs, steps: card.steps, traps: card.traps, tip: card.tip, detail: card.detail, example: card.example }) + '\n' +
    '场景列表：' + JSON.stringify(sceneDigest(value)) + '\n' +
    '返回严格 JSON：{"scripts":["第1幕完整讲稿","第2幕完整讲稿",...]}。要求：scripts 数量必须等于场景数，顺序必须一致；每幕写成真正的老师讲课口播稿，先点明要解决的问题，再讲原理、具体动作、容易错在哪里，最后给一句记忆或动作提示；语言干练准确，短句为主，讲师感强，不要机械复述场景标题；例题场景要带学生走一遍判断路径；检查点场景只引导思考和停顿，不提前泄露答案；所有数字、年份、单位、专业词和逻辑关系必须保留；公式和符号要写成中文口语，例如“除以、根号、平方、推出、小于等于”；不能出现 Markdown、表格、代码、URL、舞台提示；绝不能截断，每幕都要完整收束。'
  const maxTokens = Math.min(7000, Math.max(2600, scenes.length * 420))
  const reply = await callText([{ role: 'system', content: sys }, { role: 'user', content: user }], maxTokens, 90000)
  const m = String(reply || '').match(/\{[\s\S]*\}/)
  const parsed = m ? JSON.parse(m[0]) : null
  const rows = parsed && Array.isArray(parsed.scripts) ? parsed.scripts : null
  if (!rows || rows.length !== scenes.length) throw new Error('AI 讲稿不完整')
  return rows.map((x, i) => ensureCompleteScript(String(x || '').trim() || localSceneScript(scenes[i], card)))
}
function lectureScript(sc) {
  const raw = sceneNarration(sc)
  if (store.cfg.microScriptOn === false) return raw
  const idx = scenes.value.indexOf(sc)
  const hit = lesson.value && lesson.value.scripts && lesson.value.scripts[idx]
  return hit && String(hit).trim() ? String(hit).trim() : raw
}
function waitSpeech(text) {
  return new Promise((resolve) => {
    let settled = false
    let fallback = null
    const finish = () => {
      if (settled) return
      settled = true
      if (fallback) clearTimeout(fallback)
      resolve()
    }
    const ms = Math.max(15000, Math.min(120000, String(text || '').length * 320))
    fallback = setTimeout(finish, ms)
    try {
      const p = speak(text, { scene: 'teacher', rate: Number(store.cfg.ttsRate) || 1, onEnd: finish, onError: finish })
      if (p && typeof p.catch === 'function') p.catch(finish)
    } catch (e) {
      finish()
    }
  })
}
async function callText(messages, maxTokens, timeoutMs) {
  const seen = new Set()
  const list = [pickGenCfg(), activeCfg()].filter((c) => {
    if (!c || !c.key) return false
    const k = (c.url || '') + '|' + (c.model || '') + '|' + (c.key || '').slice(0, 8)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  let last = null
  for (const c of list) {
    try {
      const out = await chatOnce(c, messages, maxTokens, timeoutMs)
      if (out && String(out).trim()) return String(out).trim()
      last = new Error('模型返回为空')
    } catch (e) { last = e }
  }
  throw last || new Error('未配置可用文字模型')
}
async function play() {
  if (!scenes.value.length) { showToast('先生成一节微课', 'info'); return }
  if (playing.value) return
  if (currentScene.value && currentScene.value.type === 'checkpoint' && !checkpointOk.value) { showToast('先完成这个检查点，再继续播放', 'info'); return }
  primeTts()
  playing.value = true
  const token = ++playToken
  while (playing.value && token === playToken) {
    const cur = currentScene.value
    if (!cur) break
    if (cur.type === 'checkpoint' && !checkpointOk.value) { playing.value = false; break }
    const text = lectureScript(cur)
    if (!playing.value || token !== playToken) break
    await waitSpeech(text)
    if (!playing.value || token !== playToken) break
    if (sceneIdx.value >= scenes.value.length - 1) { playing.value = false; break }
    sceneIdx.value++
  }
}
function pause() { playing.value = false; playToken++; try { stopSpeak() } catch (e) {} }
function gotoScene(i) {
  if (i < 0 || i >= scenes.value.length) return
  const resume = playing.value
  playing.value = false
  playToken++
  try { stopSpeak() } catch (e) {}
  sceneIdx.value = i
  checkpointPick.value = ''
  checkpointOk.value = false
  if (resume) play()
}
function prev() { gotoScene(sceneIdx.value - 1) }
function next() { gotoScene(sceneIdx.value + 1) }
function checkPoint(k) {
  const sc = currentScene.value
  checkpointPick.value = k
  checkpointOk.value = !!(sc && k === sc.answer)
  if (checkpointOk.value) {
    setTimeout(() => {
      if (sceneIdx.value >= scenes.value.length - 1) return
      sceneIdx.value++
      checkpointPick.value = ''
      checkpointOk.value = false
      play()
    }, 700)
  }
}
function selectTopic(t) {
  topic.value = t
  lesson.value = getCachedLesson(t.card)
  sceneIdx.value = 0
  playing.value = false
  checkpointPick.value = ''
  checkpointOk.value = false
  stopNarration()
  if (lesson.value) showToast('已读取本地缓存的完整微课讲稿', 'info')
}
function localLesson(card) {
  const plate = card.plate || '行测'
  const type = card.type || '核心方法'
  return {
    title: plate + ' · ' + type,
    scenes: [
      { type: 'hook', icon: '🎯', title: '这道题真正考什么', body: '不是背概念，而是识别命题结构。', points: ['识别信号：' + (card.signs || []).join('；'), '考试目标：把材料翻译成可判断的结构'] },
      { type: 'deep', icon: '🔬', title: '为什么这个方法成立', body: (card.detail || card.tip || '先找论据与结论的共同话题，再判断选项是连接、切断还是偷换。'), points: ['先看命题人改变哪一块', '再判断选项作用方向', '最后比较力度和范围'] },
      { type: 'flow', icon: '🧭', title: '读题先翻译，不先看选项', body: '先把题干压缩成“谁想让谁相信什么”。', points: ['找主体', '找结论', '找证据', '找隐藏前提'] },
      { type: 'process', icon: '🪜', title: '按步骤拆解', body: (card.steps || []).join(' → ') || '题型识别 → 结构还原 → 选项比较 → 回文验证', points: card.steps || [] },
      { type: 'example', icon: '📝', title: '跟着例题走一遍', body: '把方法放进真实题目里，才叫会。', example: card.example || { q: '示例题：先翻译结论与论据，再判断选项作用方向。', opts: ['A 只重复论据', 'B 建立论据与结论的联系', 'C 偷换主体', 'D 无关信息'], answer: 'B', path: 'B同时连接论据和结论，作用方向最直接。' } },
      { type: 'compare', icon: '⚖️', title: '比较选项，不比“谁更像”', body: '统一用主体、方向、范围、力度四把尺子。', points: ['主体是否一致', '方向是否对应', '范围是否偷换', '力度是否相当'] },
      { type: 'checkpoint', icon: '🧠', title: '停下来检查一下', body: '题干里最重要的第一步应该是什么？', options: [{ k: 'A', t: '先看哪个选项熟悉' }, { k: 'B', t: '先把结论和论据翻译出来' }], answer: 'B', explain: '先还原结构，才不会被熟悉词带跑。' },
      { type: 'trap', icon: '⚠️', title: '最容易错在哪里', body: (card.traps || []).join('；') || '主体偷换、范围扩大、方向反转、力度不足。', points: card.traps || [] },
      { type: 'summary', icon: '🧠', title: '把方法变成动作', body: card.tip || '先翻译题干，再做判断。', points: ['下次先复述结论', '再定位证据', '最后比较选项方向'] },
      { type: 'apply', icon: '🚀', title: '现在就应用', body: '把刚学的方法立刻用一道题检验。', points: ['去逻辑翻译', '去 AI 出题练同类题', '把方法加入记忆复习'] }
    ]
  }
}
async function buildLesson() {
  if (!topic.value) { showToast('先选一个学习主题', 'info'); return }
  lessonBusy.value = true
  sceneIdx.value = 0
  checkpointPick.value = ''
  checkpointOk.value = false
  const card = topic.value.card
  try {
    const sys = '你是行测动画微课导演。把知识卡设计成一节真正能教会考生的动画微课，不要PPT提纲。只输出 JSON。'
    const user = '请围绕：' + JSON.stringify({ plate: card.plate, type: card.type, signs: card.signs, steps: card.steps, traps: card.traps, tip: card.tip, detail: card.detail, example: card.example }) + '\n输出：{"title":"课程名","scenes":[...]}，共 9-11 个场景。每个场景字段：type(hook|deep|flow|process|example|compare|checkpoint|trap|summary|apply), icon, title, body, points(数组), example(可选对象{q,opts,answer,path}), options(可选数组{k,t}), answer(可选), explain(可选)。要求：必须包含至少1个deep深度讲解场景和至少1个example例题场景；例题优先使用提供知识卡里的 example，若没有则自行设计一个最小可验证例题并明确写出答案和路径；讲解要干练准确，不说空话；最后再放交互检查点、陷阱和实战动作。禁止只是复述知识卡字段。'
    const reply = await callText([{ role: 'system', content: sys }, { role: 'user', content: user }], 1800, 60000)
    const m = String(reply || '').match(/\{[\s\S]*\}/)
    const parsed = m ? JSON.parse(m[0]) : null
    const course = parsed && Array.isArray(parsed.scenes) && parsed.scenes.length ? parsed : localLesson(card)
    let scripts = null
    try {
      scripts = await buildLessonScripts(course, card)
    } catch (e) {
      scripts = localLessonScripts(course, card)
      showToast('AI 讲稿未能完整返回，已使用本地完整讲稿兜底', 'info')
    }
    course.scripts = scripts
    lesson.value = course
    saveLessonCache(card, course)
    if (!parsed) showToast('AI 课程未成稿，已使用本地高质量课程', 'info')
    else showToast('✅ 完整课程与全套教学讲稿已生成并缓存', 'success')
  } catch (e) {
    const fallback = localLesson(card)
    fallback.scripts = localLessonScripts(fallback, card)
    lesson.value = fallback
    saveLessonCache(card, fallback)
    showToast('已使用本地课程，零额度也能完整学习', 'info')
  } finally {
    lessonBusy.value = false
  }
}
async function recognizeImage(ev) {
  const f = ev.target.files && ev.target.files[0]
  ev.target.value = ''
  if (!f) return
  imageBusy.value = true
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result)
      r.onerror = reject
      r.readAsDataURL(f)
    })
    const c = activeCfg(true)
    if (!c || !c.key) throw new Error('请先配置可识图模型')
    const sys = '你是公考题目识别助手。逐字提取题目，识别不清用□标注，不编造。只输出 JSON：{"text":"完整题干和选项"}'
    const reply = await chatOnce(c, [{ role: 'system', content: sys }, { role: 'user', content: [{ type: 'text', text: '请识别这张题目截图。' }, { type: 'image_url', image_url: { url: dataUrl } }] }], 1800, 60000)
    const m = String(reply || '').match(/\{[\s\S]*\}/)
    const obj = m ? JSON.parse(m[0]) : null
    if (obj && obj.text) logicText.value = String(obj.text)
    else logicText.value = String(reply || '')
    showToast('✅ 已识别，可先校对再翻译', 'success')
  } catch (e) {
    showToast('识别失败：' + e.message, 'error')
  } finally { imageBusy.value = false }
}
function pickWrong() {
  const q = wrongs.value.find((x) => String(x.id) === String(wrongPick.value))
  if (!q) return
  logicText.value = String(q.question || '')
  logicExpectedAnswer.value = answerLetter(q.answer || '') || String(q.answer || '').trim()
  showToast('已把错题带入翻译，答案字段单独锁定', 'success')
}
async function translate() {
  const q = logicText.value.trim()
  if (!q) { showToast('请先粘贴题目、导入截图或从错题集选择', 'info'); return }
  logicBusy.value = true
  logicOut.value = ''
  try {
    const prompt = buildPlainTranslationPrompt(q, logicExpectedAnswer.value)
    const out = await callText([{ role: 'system', content: prompt.system }, { role: 'user', content: prompt.user }], 1400, 60000)
    const clean = sanitizePlainTranslation(out)
    logicOut.value = clean || '模型没有返回可用的白话翻译，请重试；本次不会用原解析或答案内容顶替。'
  } catch (e) { logicOut.value = '生成失败：' + e.message } finally { logicBusy.value = false }
}
function toggleFullscreen() {
  try {
    const el = panelRef.value || document.documentElement
    if (document.fullscreenElement) document.exitFullscreen()
    else el.requestFullscreen && el.requestFullscreen()
  } catch (e) {}
}
function goPractice() { emit('close'); window.dispatchEvent(new CustomEvent('xc-open-exam', { detail: { src: 'single' } })) }
function goWrong() { emit('close'); store.tab = 'wq' }
onUnmounted(() => { stopNarration() })
</script>

<template>
  <div class="ov show at-ov" @click.self="emit('close')">
    <div ref="panelRef" class="pnl at-pnl">
      <div class="at-head">
        <button class="pnl-top-b" @click="emit('close')">← 返回知识库</button>
        <b class="at-title">🎬 AI 动画微课 · 学懂而不是看过</b>
        <button class="btn btn-gh" title="全屏观看动画" @click="toggleFullscreen()">⛶ 全屏</button>
        <button class="pc-close" @click="emit('close')">✕</button>
      </div>
      <div class="at-tabs">
        <button class="btn" :class="tab === 'logic' ? 'btn-pri' : 'btn-gh'" @click="tab = 'logic'">🧭 逻辑题干白话翻译</button>
        <button class="btn" :class="tab === 'video' ? 'btn-pri' : 'btn-gh'" @click="tab = 'video'">🎬 交互式动画微课</button>
      </div>

      <div v-if="tab === 'logic'" class="at-logic">
        <div class="at-logic-tools">
          <button class="btn btn-gh" :disabled="imageBusy" @click="fileInput && fileInput.click()">{{ imageBusy ? '⏳ 识别中' : '📷 导入题目截图' }}</button>
          <input ref="fileInput" type="file" accept="image/*" style="display:none" @change="recognizeImage" />
          <select v-model="wrongPick" class="tb-sel" @change="pickWrong()"><option value="">📋 从错题集选择</option><option v-for="q in wrongs" :key="q.id" :value="q.id">{{ (q.subject || '错题') + ' · ' + String(q.question || '').slice(0, 34) }}</option></select>
        </div>
        <div v-if="logicExpectedAnswer" class="at-locked">🔒 已带入错题集答案字段，但翻译模式只解释题干概念，不判断、不解释、不改写答案</div>
        <textarea v-model="logicText" rows="8" class="pv-edit" placeholder="粘贴逻辑判断题：题干 + 选项，或导入截图/从错题集选择。只翻译难懂概念和句意，不复述原解析"></textarea>
        <div class="at-logic-acts"><button class="btn btn-pri" :disabled="logicBusy" @click="translate()">{{ logicBusy ? '⏳ 正在翻译…' : '🧭 只翻译难懂概念' }}</button></div>
        <div v-if="logicOut" class="at-logic-out" v-html="md(logicOut)"></div>
      </div>

      <div v-else class="at-video">
        <div class="at-course-filters">
          <select v-model="coursePlate" class="tb-sel"><option value="all">全部板块</option><option v-for="p in coursePlates" :key="p" :value="p">{{ p }}</option></select>
          <select v-model="courseTeacher" class="tb-sel"><option value="all">全部老师/来源</option><option v-for="t in courseTeachers" :key="t" :value="t">{{ t }}</option></select>
          <input v-model="courseKw" class="pv-edit" placeholder="搜索知识点 / 题型 / 口诀 / 步骤…" />
          <span class="at-count">共 {{ topics.length }} / {{ allTopics.length }} 个知识点</span>
        </div>
        <div class="at-topics">
          <button v-for="t in topics" :key="t.id || t.plate + t.card.type" class="shelf-tab" :class="{ on: topic && topic.id === t.id }" @click="selectTopic(t)">{{ t.plate }} · {{ t.card.type }}<small v-if="t.card.source"> · {{ t.card.source }}</small></button>
        </div>
        <div v-if="topic" class="at-course-head">
          <div><b>{{ topic.card.type }}</b><span>{{ topic.card.tip }}<template v-if="lesson"> · {{ lesson.scripts && lesson.scripts.length ? '✅ 全套讲稿已缓存' : '⚠️ 未生成讲稿' }}</template></span></div>
          <button class="btn btn-pri" :disabled="lessonBusy" @click="buildLesson()">{{ lessonBusy ? '⏳ AI 一次性生成课程与讲稿…' : lesson ? '🔄 重新生成课程与讲稿' : '✨ 生成深度微课与讲稿' }}</button>
        </div>
        <template v-if="lesson">
          <div class="at-stage">
            <div class="at-stage-hd"><b>{{ lessonTitle }}</b><span>{{ sceneIdx + 1 }} / {{ scenes.length }}</span></div>
            <AiLessonStage :scene="currentScene" :playing="playing" :scene-index="sceneIdx" />
            <div v-if="currentScene && currentScene.type === 'checkpoint'" class="at-check">
              <button v-for="o in currentScene.options || []" :key="o.k" class="coach-opt" :class="{ on: checkpointPick === o.k, right: checkpointOk && checkpointPick === o.k, wrong: checkpointPick === o.k && !checkpointOk }" @click="checkPoint(o.k)"><b>{{ o.k }}</b><span>{{ o.t }}</span></button>
              <div v-if="checkpointPick" class="at-check-fb">{{ checkpointOk ? '✅ ' + currentScene.explain : '再想一步：先翻译结构，还是先看选项？' }}</div>
            </div>
            <div class="at-progress"><i :style="{ width: progress + '%' }"></i></div>
          </div>
          <div class="at-player">
            <button class="btn btn-gh" @click="prev()">⏮</button>
            <button v-if="!playing" class="btn btn-pri" @click="play()">▶ 播放</button>
            <button v-else class="btn btn-gh" @click="pause()">⏸ 暂停</button>
            <button class="btn btn-gh" @click="next()">⏭</button>
            <button class="btn btn-gh" @click="transcriptOpen = !transcriptOpen">{{ transcriptOpen ? '收起字幕' : '显示字幕' }}</button>
            <label class="at-ai-script"><input v-model="store.cfg.microScriptOn" type="checkbox" @change="saveCfg()" /> AI讲课稿</label>
            <select v-model="store.cfg.ttsMode" class="tb-sel" title="选择微课朗读音色引擎；与对话/萌宠共用全局语音设置" @change="saveCfg()">
              <option v-for="e in TTS_ENGINES" :key="e.id" :value="e.id">{{ e.name }}</option>
            </select>
            <span class="at-free">{{ lesson.scripts && lesson.scripts.length ? '✅ 全套讲稿已缓存 · 语音读完才进入下一幕' : '🔊 语音读完才进入下一幕' }}</span>
          </div>
          <div v-if="transcriptOpen" class="at-transcript"><div v-for="(s, i) in scenes" :key="i" :class="{ cur: i === sceneIdx }" @click="gotoScene(i)"><b>{{ i + 1 }}. {{ s.title }}</b><span>{{ s.body }}</span></div></div>
          <div class="at-actions">
            <button class="btn btn-gh" @click="tab = 'logic'; logicText = topic.card.type + '：' + (topic.card.detail || topic.card.tip || '')">🧭 用翻译拆这道题</button>
            <button class="btn btn-gh" @click="goPractice()">🎲 去 AI 出题练</button>
            <button class="btn btn-gh" @click="goWrong()">📋 去错题集复练</button>
          </div>
        </template>
        <div v-else class="at-empty">选一个板块主题，再点「生成深度微课与讲稿」。系统会一次生成全套教师讲稿并缓存，播放时直接读取，不再逐幕临时生成。</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.at-ov { z-index: 450; }
.at-pnl { width: 100vw; height: 100dvh; max-height: none; overflow: auto; padding: 12px 18px; border-radius: 0; }
.at-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.at-title { font-size: calc(17px * var(--ui-fs-scale, 1)); color: var(--accent); }
.at-tabs { display: flex; gap: 7px; flex-wrap: wrap; margin-bottom: 10px; }
.at-logic-tools { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.at-locked { margin: 6px 0; padding: 7px 9px; border: 1px solid rgba(251,191,36,.45); background: rgba(251,191,36,.1); color: #fbbf24; border-radius: 8px; font-size: calc(12px * var(--ui-fs-scale, 1)); line-height: 1.6; }
.at-logic textarea, .at-logic .pv-edit { width: 100%; resize: vertical; }
.at-logic-acts { margin: 8px 0; }
.at-logic-out { margin-top: 10px; border: 1px solid var(--glass-border); border-radius: 10px; padding: 10px 12px; background: var(--glass-bg); line-height: 1.85; font-size: calc(13px * var(--ui-fs-scale, 1)); }
.at-topics { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 10px; }
.at-course-head { display: flex; align-items: center; gap: 10px; justify-content: space-between; margin-bottom: 10px; padding: 9px 11px; border: 1px solid var(--glass-border); border-radius: 10px; }
.at-course-head div { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.at-course-head span { color: var(--text3); font-size: calc(12px * var(--ui-fs-scale, 1)); }
.at-course-filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 8px; }
.at-course-filters .pv-edit { flex: 1; min-width: 190px; }
.at-count { color: var(--text3); font-size: calc(12px * var(--ui-fs-scale, 1)); }
.at-topics { max-height: 150px; overflow: auto; }
.at-topics small { opacity: .65; }
.at-teacher { position: relative; width: 126px; height: 128px; margin: 0 auto 8px; animation: teacherFloat 2.4s ease-in-out infinite; }
.at-teacher-head { position: absolute; left: 39px; top: 18px; width: 48px; height: 50px; border-radius: 45% 45% 48% 48%; background: #f3c7a7; border: 2px solid rgba(30,41,59,.35); z-index: 2; }
.at-teacher-hair { position: absolute; left: 35px; top: 8px; width: 56px; height: 33px; border-radius: 50% 50% 35% 35%; background: #263244; z-index: 3; }
.at-eye { position: absolute; top: 20px; width: 6px; height: 8px; border-radius: 50%; background: #263244; animation: teacherBlink 3.2s infinite; }
.at-eye.left { left: 11px; } .at-eye.right { right: 11px; }
.at-mouth { position: absolute; left: 18px; top: 34px; width: 12px; height: 7px; border-bottom: 2px solid #9f1239; border-radius: 0 0 12px 12px; animation: teacherTalk .45s ease-in-out infinite alternate; }
.at-teacher-body { position: absolute; left: 26px; top: 64px; width: 74px; height: 54px; border-radius: 22px 22px 10px 10px; background: linear-gradient(135deg, var(--robe), color-mix(in srgb, var(--robe) 65%, #fff)); border: 2px solid rgba(30,41,59,.3); }
.at-teacher-arm { position: absolute; top: 70px; width: 18px; height: 46px; border-radius: 12px; background: #f3c7a7; border: 2px solid rgba(30,41,59,.25); transform-origin: 50% 8px; z-index: 1; }
.at-teacher-arm.left { left: 14px; transform: rotate(20deg); animation: teacherArm 2.8s ease-in-out infinite; }
.at-teacher-arm.right { right: 14px; transform: rotate(-20deg); animation: teacherArm 2.8s ease-in-out infinite reverse; }
.at-teacher-badge { position: absolute; left: 48px; top: 75px; z-index: 4; color: #fff; background: rgba(15,23,42,.72); border-radius: 10px; padding: 2px 6px; font-size: calc(11px * var(--ui-fs-scale, 1)); }
.at-teacher-name { position: absolute; left: 0; right: 0; bottom: 0; text-align: center; color: var(--text3); font-size: calc(10.5px * var(--ui-fs-scale, 1)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@keyframes teacherFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
@keyframes teacherTalk { from { height: 3px; } to { height: 8px; } }
@keyframes teacherBlink { 0%,46%,50%,100% { transform: scaleY(1); } 48% { transform: scaleY(.12); } }
@keyframes teacherArm { 0%,100% { transform: rotate(20deg); } 50% { transform: rotate(42deg); } }
.at-stage { min-height: 320px; border: 1px solid var(--glass-border); border-radius: 14px; background: linear-gradient(135deg, rgba(34,211,238,.12), rgba(167,139,250,.1)); padding: 15px 18px; display: flex; flex-direction: column; }
.at-stage-hd { display: flex; justify-content: space-between; gap: 8px; color: var(--text2); font-size: calc(12px * var(--ui-fs-scale, 1)); }
.at-scene { flex: 1; display: flex; flex-direction: column; justify-content: center; text-align: center; padding: 18px 0; }
.at-scene-i { font-size: 52px; margin-bottom: 6px; }
.at-scene-t { font-size: calc(20px * var(--ui-fs-scale, 1)); font-weight: 900; color: var(--accent); margin-bottom: 12px; }
.at-scene-d { max-width: 760px; margin: 0 auto; font-size: calc(15px * var(--ui-fs-scale, 1)); line-height: 1.9; color: var(--text); }
.at-points { display: flex; flex-wrap: wrap; gap: 7px; justify-content: center; margin-top: 14px; }
.at-points span { border: 1px solid rgba(34,211,238,.32); background: rgba(34,211,238,.08); border-radius: 14px; padding: 4px 9px; font-size: calc(12px * var(--ui-fs-scale, 1)); }
.at-in { animation: atIn .55s ease both; }
@keyframes atIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
.at-progress { height: 6px; border-radius: 4px; background: rgba(127,127,127,.2); overflow: hidden; margin-top: 14px; }
.at-progress i { display: block; height: 100%; background: linear-gradient(90deg,#22d3ee,#34d399); transition: width .3s; }
.at-player { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
.at-ai-script { display: inline-flex; align-items: center; gap: 5px; color: var(--text2); font-size: calc(12.5px * var(--ui-fs-scale, 1)); }
.at-free { color: var(--text3); font-size: calc(12px * var(--ui-fs-scale, 1)); margin-left: auto; }
.at-check { max-width: 620px; margin: 14px auto 0; display: grid; gap: 8px; text-align: left; }
.at-check-fb { color: var(--text2); font-size: calc(12.5px * var(--ui-fs-scale, 1)); }
.at-transcript { max-height: 220px; overflow: auto; border: 1px solid var(--glass-border); border-radius: 10px; margin-top: 10px; }
.at-transcript div { padding: 8px 10px; display: flex; flex-direction: column; gap: 3px; cursor: pointer; border-bottom: 1px solid rgba(127,127,127,.1); }
.at-transcript div.cur { background: rgba(34,211,238,.1); }
.at-transcript span { color: var(--text3); font-size: calc(12px * var(--ui-fs-scale, 1)); }
.at-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
.at-empty { color: var(--text3); padding: 30px 0; text-align: center; }
.coach-opt { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; text-align: left; border: 1px solid var(--glass-border); background: var(--glass-bg); color: var(--text); border-radius: 9px; padding: 8px 10px; font: inherit; cursor: pointer; }
.coach-opt span { color: var(--text3); font-size: calc(12px * var(--ui-fs-scale, 1)); }
.coach-opt.on { border-color: var(--accent); background: rgba(34,211,238,.1); }
.coach-opt.right { border-color: #34d399; }
.coach-opt.wrong { border-color: #fb7185; }
@media (max-width: 640px) { .at-pnl { width: 100%; height: 100dvh; max-height: 100dvh; border-radius: 0; } .at-free { margin-left: 0; } .at-course-head { align-items: flex-start; flex-direction: column; } }
</style>
