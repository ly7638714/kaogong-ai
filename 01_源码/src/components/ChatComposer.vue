<script setup>
// v3.8.196 6B·ChatPage 拆分：输入区+提问助手 子组件
import { toRefs, ref, onBeforeUnmount } from 'vue'
const props = defineProps({ ctx: { type: Object, required: true } })
const {
  ask,
  askShow,
  store,
  setDepth,
  DEPTH_LABEL,
  closeAssist,
  text,
  openAssist,
  wzSel,
  wizardModeLabel,
  wzCancel,
  inputPh,
  send,
  wzOpen,
  toggleTts,
  toggleMic,
  quickMode,
  toggleQuickMode,
  pickImage,
  stopGenerate,
  imgs,
  linkShow,
  linkUrl,
  openLinkSmart,
  recogOn,
  nextTick,
  openExam,
  showToast
} = toRefs(props.ctx)

const COMMANDS = [
  { id: 'quiz', ic: '🎯', label: '出题', desc: '按当前板块出一道题', prompt: '帮我出一道当前板块的题，先别给答案。' },
  { id: 'multi', ic: '🧩', label: '多题', desc: '一次生成多道同主题题', prompt: '帮我出3道同一话题、同题型的题，按第1题到第3题编号，每道都给四个选项和【正确答案】，先别给解析。' },
  { id: 'compare', ic: '⚖️', label: '对比学习', desc: '同话题不同逻辑方向', prompt: '给我出2道同一话题下的对比题：第1题考因推果削弱，第2题考果推因削弱。两题正确项都设计为他因削弱，其余三个干扰项要强，做完后并排对比两题结构和干扰项。' },
  { id: 'translate', ic: '🧭', label: '翻译题干', desc: '用白话拆逻辑和结论', prompt: '请把这道题的题干用大白话翻译：先拆论据，再拆结论，最后说清选项和题干的关系。' },
  { id: 'review', ic: '📄', label: '复盘', desc: '按错因和规律复盘本题', prompt: '请带我复盘这道题：先让我自己找错因，再归纳规律、笔记和下次防坑动作。' },
  { id: 'import', ic: '📂', label: '导入材料', desc: '导入截图、PDF、题目', action: 'import' },
  { id: 'daily', ic: '🌅', label: '每日必刷', desc: '直接进入每日三大块', action: 'daily' }
]
const commandOpen = ref(false)
const sourceRef = ref(null)
function autoGrow() {
  const el = sourceRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(184, Math.max(58, el.scrollHeight)) + 'px'
}
function onComposerInput() {
  const s = String(text.value || '').replace(/^\s+/, '')
  commandOpen.value = /^\/[^\s]*$/.test(s)
  autoGrow()
}
function openCommands() {
  commandOpen.value = true
  nextTick.value(() => { const el = document.querySelector('.input-bar textarea'); if (el) el.focus() })
}
function pickCommand(c) {
  if (!c) return
  commandOpen.value = false
  if (c.action === 'import') { openExam.value('import'); return }
  if (c.action === 'daily') { openExam.value('morning', { autoStart: true }); return }
  text.value = c.prompt || ''
  if (c.id === 'multi' || c.id === 'compare') showToast.value('按题数分块计费；首次朗读后语音可缓存重读，不重复消耗 token', 'info')
  nextTick.value(() => { const el = sourceRef.value || document.querySelector('.input-bar textarea'); if (el) { el.focus(); autoGrow() } })
}

// 输入工具栏：纵向弹出（失焦自动收回为 »）
const toolsOpen = ref(false)
let toolsBlurTimer = null
function openTools() { clearTimeout(toolsBlurTimer); toolsOpen.value = true }
function scheduleCloseTools() { clearTimeout(toolsBlurTimer); toolsBlurTimer = setTimeout(() => { toolsOpen.value = false }, 240) }
function toggleTools() { clearTimeout(toolsBlurTimer); toolsOpen.value = !toolsOpen.value }
function clearDraft() {
  text.value = ''
  if (Array.isArray(imgs.value)) imgs.value.splice(0)
  linkShow.value = false
  linkUrl.value = ''
  try { localStorage.removeItem('xc_chat_draft') } catch (e) {}
  nextTick.value(() => autoGrow())
}
onBeforeUnmount(() => clearTimeout(toolsBlurTimer))
</script>

<template>
      <!-- 🧭 自动识别（v3.8.76+）：输入时只展示识别结果，不再要求手动补全 -->
      <div v-if="askShow" class="ask-assist">
        <div class="aa-row1">
          <span v-if="ask.plate.name" class="aa-chip" :class="{ low: ask.lowConf }" :title="'置信度 ' + Math.round(ask.plate.conf * 100) + '%'">
            {{ ask.plate.name }}<span v-if="ask.sub.name" class="aa-sub">·{{ ask.sub.name }}</span>
          </span>
          <span v-else class="aa-chip none">未识别板块</span>
          <span v-if="ask.plate.name" class="aa-bar" :title="'识别置信度 ' + Math.round(ask.plate.conf * 100) + '%'">
            <i :style="{ width: Math.round(ask.plate.conf * 100) + '%', background: ask.plate.conf >= 0.7 ? 'var(--green,#3ddc84)' : ask.plate.conf >= 0.4 ? '#f2c14e' : '#8b93a7' }"></i>
          </span>
          <span class="aa-intent">{{ ask.intent }}</span>
          <span class="aa-sp"></span>
          <span class="aa-depth" title="回答深度：详讲 / 简答 / 只给秒杀">
            <button v-for="d in ['detail', 'brief', 'flash']" :key="d" class="aa-dp" :class="{ on: (store.cfg.answerDepth || 'detail') === d }" @click="setDepth(d)">{{ DEPTH_LABEL[d] }}</button>
          </span>
          <button class="aa-off" title="关闭自动识别（关闭后本条不再出现）" @click="closeAssist()">✕</button>
        </div>
      </div>
      <!-- 助手已关闭时的一键重开入口（仅在输入内容时出现，平时零打扰） -->
      <div v-else-if="store.cfg.askAssist === false && text.trim().length > 3" class="ask-assist">
        <div class="aa-row1">
          <button class="aa-enh" @click="openAssist()">🧭 开启自动识别</button>
        </div>
      </div>
      <div v-if="wzSel && wzSel.plate" class="wz-active">
        <span>🧭 <b>{{ wzSel.plate }}</b><template v-if="wzSel.sub"> · {{ wzSel.sub }}</template><template v-if="wzSel.type"> · {{ wzSel.type }}</template> · {{ wizardModeLabel(wzSel.mode) }}</span>
        <button class="wz-cancel" @click="wzCancel()">✕ 取消锁定</button>
      </div>
      <div class="input-bar">
        <div class="e-dock">
          <div v-if="commandOpen" class="cmd-menu" @mousedown.prevent>
            <div class="cmd-hd"><b>/ 快捷指令</b><span>选择后可直接修改再发送</span></div>
            <button v-for="c in COMMANDS" :key="c.id" class="cmd-item" @click="pickCommand(c)">
              <span class="cmd-ic">{{ c.ic }}</span><span class="cmd-tx"><b>{{ c.label }}</b><em>{{ c.desc }}</em></span><span class="cmd-arrow">›</span>
            </button>
          </div>
          <div class="composer-main">
            <div class="composer-quickbar" aria-label="常用输入功能">
              <span>常用</span>
              <button v-for="c in COMMANDS.slice(0, 4)" :key="c.id" class="cq-btn" @click="pickCommand(c)">{{ c.ic }} {{ c.label }}</button>
            </div>
            <textarea
              ref="sourceRef"
              v-model="text"
              rows="2"
              :placeholder="inputPh"
              @input="onComposerInput"
              @focus="openTools()"
              @blur="scheduleCloseTools()"
              @keydown.enter.exact.prevent="send()"
            ></textarea>
          </div>
          <div v-if="toolsOpen" class="dock-more" @mousedown.prevent>
          <div class="dock-hd">
            <b>输入工具</b>
            <span>{{ quickMode ? '⚡ 快答' : '🧠 深度' }} · {{ store.cfg.ttsOn !== false ? '自动朗读' : '仅手动朗读' }}</span>
          </div>
          <div class="dock-sec">
            <span class="dock-sec-t">发题</span>
            <button class="ib-btn wz-open" :class="{ on: !!wzSel }" title="四步选板块→细分→题型→意图，发送前锁定答题路径" @click="wzOpen = true">🧭 发题向导</button>
            <button class="ib-btn" :class="{ on: commandOpen }" title="输入 / 可快速选择常用指令" @click="openCommands()">⌘ 快捷指令</button>
          </div>
          <div class="dock-sec">
            <span class="dock-sec-t">输入</span>
            <label class="ib-btn" title="上传题目截图，支持多图">
              📷 图片
              <input type="file" accept="image/*" multiple style="display: none" @change="pickImage" />
            </label>
            <button class="ib-btn" :class="{ on: linkShow }" title="自动读取剪贴板链接，回车即可把图片加入输入区" @click="openLinkSmart()">🔗 图片链接</button>
          </div>
          <div class="dock-sec">
            <span class="dock-sec-t">语音</span>
            <button class="ib-btn" :class="{ on: store.cfg.ttsOn !== false }" :aria-pressed="store.cfg.ttsOn !== false" :title="store.cfg.ttsOn !== false ? 'AI 回复会自动朗读，点击关闭' : '点击开启 AI 回复自动朗读'" @click="toggleTts()">{{ store.cfg.ttsOn !== false ? '🔊 朗读开' : '🔇 朗读关' }}</button>
            <button class="ib-btn" :class="{ on: recogOn }" :style="{ color: recogOn ? 'var(--red)' : '' }" :aria-pressed="recogOn" title="语音输入：把说的话识别成提问文字" @click="toggleMic()">🎤 语音输入</button>
          </div>
          <div class="dock-sec">
            <span class="dock-sec-t">模型</span>
            <button
              class="ib-btn qm"
              :class="{ on: quickMode }"
              :aria-pressed="quickMode"
              :title="quickMode ? '快答：简单题快速响应；切回深度可提升难题准确率' : '深度：难题更稳；切到快答可减少等待'"
              @click="toggleQuickMode()"
            >{{ quickMode ? '⚡ 快答' : '🧠 深度' }}</button>
          </div>
          <div class="dock-sec dock-sec-end">
            <button class="ib-btn dock-clear" title="清空输入文字、图片和链接" @click="clearDraft()">🧹 清空输入</button>
          </div>
          </div>
          <div class="dock-btns">
          <button class="ib-btn dock-toggle" :class="{ open: toolsOpen }" title="输入工具栏（展开/收起）" @mousedown.prevent="toggleTools()">»</button>
          </div>
          <button
            v-if="store.busy"
            class="ib-send stop"
            title="停止生成"
            @click="stopGenerate()"
          >⏹</button>
          <button v-else class="ib-send" @click="send()">➤</button>
        </div>
      </div>
</template>
