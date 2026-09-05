<script setup>
// v3.8.196 6B·ChatPage 拆分：输入区+提问助手 子组件
import { toRefs } from 'vue'
const props = defineProps({ ctx: { type: Object, required: true } })
const {
  ask,
  askShow,
  store,
  setDepth,
  DEPTH_LABEL,
  enhanceAskBtn,
  closeAssist,
  confirmPlate,
  applyChip,
  askWarn,
  forceSend,
  gotoFix,
  text,
  openAssist,
  wzSel,
  wizardModeLabel,
  wzCancel,
  left,
  fmtSec,
  limitShow,
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
</script>

<template>
      <!-- 🧭 提问助手（v3.8.76）：输入即识别板块/题型/意图，缺信息就轻轻提示，可一键结构化 -->
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
          <button class="aa-enh" title="把口语化/残缺的提问自动结构化（纯本地，不会编造题目数据）" @click="enhanceAskBtn()">✨ 增强提问</button>
          <button class="aa-off" title="关闭提问助手（关闭后本条不再出现）" @click="closeAssist()">✕</button>
        </div>
        <div v-for="(h, hi) in ask.hints" :key="hi" class="aa-hint">
          <span class="aa-hic">{{ h.ic }}</span><span>{{ h.t }}</span>
        </div>
        <div v-if="ask.lowConf && ask.candidates.length" class="aa-pick">
          <span class="aa-pk-t">是哪个板块？</span>
          <button v-for="c in ask.candidates" :key="c" class="aa-pk-b" @click="confirmPlate(c)">{{ c }}</button>
        </div>
        <div v-if="ask.chips.length" class="aa-chips">
          <button v-for="(c, ci) in ask.chips" :key="ci" class="aa-cp" :title="'插入：' + c.ins" @click="applyChip(c.ins)">{{ c.t }}</button>
        </div>
        <div v-if="askWarn" class="aa-warn">
          <span>⚠️ {{ askWarn }}</span>
          <button class="aa-wb pri" @click="forceSend()">仍要发送</button>
          <button class="aa-wb" @click="gotoFix()">去补充</button>
        </div>
      </div>
      <!-- 助手已关闭时的一键重开入口（仅在输入内容时出现，平时零打扰） -->
      <div v-else-if="store.cfg.askAssist === false && text.trim().length > 3" class="ask-assist">
        <div class="aa-row1">
          <button class="aa-enh" @click="openAssist()">🧭 开启提问助手（识别板块·题型，提示补全信息）</button>
        </div>
      </div>
      <div v-if="wzSel && wzSel.plate" class="wz-active">
        <span>🧭 <b>{{ wzSel.plate }}</b><template v-if="wzSel.sub"> · {{ wzSel.sub }}</template><template v-if="wzSel.type"> · {{ wzSel.type }}</template> · {{ wizardModeLabel(wzSel.mode) }}</span>
        <button class="wz-cancel" @click="wzCancel()">✕ 取消锁定</button>
      </div>
      <div class="input-bar">
        <div v-if="store.busy" class="stopwatch" :class="{ warn: left === 0 }">
          <span class="sw-ic">⏱</span>
          <span class="sw-num hud-num">{{ fmtSec(left) }}</span>
          <span class="sw-lbl">{{ left === 0 ? '超时' : '限 ' + fmtSec(limitShow) }}</span>
        </div>
        <div class="e-dock">
          <textarea
            v-model="text"
            rows="1"
            :placeholder="inputPh"
            @keydown.enter.exact.prevent="send()"
          ></textarea>
          <div class="dock-btns">
          <button class="ib-btn wz-open" :class="{ on: !!wzSel }" title="🧭 四步发题向导：发送前先选 板块→细分→题型→意图，AI 不再猜题、按你的路径精准作答" @click="wzOpen = true">🧭</button>
          <button class="ib-btn" :class="{ on: store.cfg.ttsOn !== false }" :title="(store.cfg.ttsOn !== false ? '自动朗读已开启，点击关闭' : '自动朗读已关闭，点击开启')" @click="toggleTts()">{{ store.cfg.ttsOn !== false ? '🔊' : '🔇' }}</button>
          <button class="ib-btn" :style="{ color: recogOn ? 'var(--red)' : '' }" @click="toggleMic()">🎤</button>
          <button class="ib-btn" @click="linkShow = !linkShow">🔗</button>
          <button
            class="ib-btn qm"
            :class="{ on: quickMode }"
            :title="quickMode ? '⚡快答：用快模型秒回（简单/熟练题）；点击切回🧠深度' : '🧠深度：用思考模型更准（难题/文字截图题）；点击切到⚡快答'"
            @click="toggleQuickMode()"
          >{{ quickMode ? '⚡ 快答' : '🧠 深度' }}</button>
          <label class="ib-btn" style="display: flex; align-items: center; justify-content: center; cursor: pointer">
            📷
            <input type="file" accept="image/*" style="display: none" @change="pickImage" />
          </label>
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
