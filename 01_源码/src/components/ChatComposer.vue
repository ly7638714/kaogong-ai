<script setup>
// v3.8.196 6B·ChatPage 拆分：输入区+提问助手 子组件
import { toRefs, ref } from 'vue'
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
  stopGenerate
} = toRefs(props.ctx)

// 输入工具栏：纵向弹出（失焦自动收回为 »）
const toolsOpen = ref(false)
let toolsBlurTimer = null
function openTools() { clearTimeout(toolsBlurTimer); toolsOpen.value = true }
function scheduleCloseTools() { clearTimeout(toolsBlurTimer); toolsBlurTimer = setTimeout(() => { toolsOpen.value = false }, 240) }
function toggleTools() { clearTimeout(toolsBlurTimer); toolsOpen.value = !toolsOpen.value }
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
          <textarea
            v-model="text"
            rows="1"
            :placeholder="inputPh"
            @focus="openTools()"
            @blur="scheduleCloseTools()"
            @keydown.enter.exact.prevent="send()"
          ></textarea>
          <div v-if="toolsOpen" class="dock-more" @mousedown.prevent>
          <button class="ib-btn wz-open" :class="{ on: !!wzSel }" title="🧭 四步发题向导：发送前先选 板块→细分→题型→意图，AI 不再猜题、按你的路径精准作答" @click="wzOpen = true">🧭 发题向导</button>
          <button class="ib-btn" :class="{ on: store.cfg.ttsOn !== false }" :title="(store.cfg.ttsOn !== false ? '自动朗读已开启，点击关闭' : '自动朗读已关闭，点击开启')" @click="toggleTts()">{{ store.cfg.ttsOn !== false ? '🔊 朗读开' : '🔇 朗读关' }}</button>
          <button class="ib-btn" :style="{ color: recogOn ? 'var(--red)' : '' }" @click="toggleMic()">🎤 语音</button>
          <button class="ib-btn" @click="linkShow = !linkShow">🔗 链接</button>
          <button
            class="ib-btn qm"
            :class="{ on: quickMode }"
            :title="quickMode ? '⚡快答：用快模型秒回（简单/熟练题）；点击切回🧠深度' : '🧠深度：用思考模型更准（难题/文字截图题）；点击切到⚡快答'"
            @click="toggleQuickMode()"
          >{{ quickMode ? '⚡ 快答' : '🧠 深度' }}</button>
          <label class="ib-btn" style="display: flex; align-items: center; justify-content: center; cursor: pointer">
            📷 图片
            <input type="file" accept="image/*" style="display: none" @change="pickImage" />
          </label>
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
