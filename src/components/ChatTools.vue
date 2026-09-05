<script setup>
// v3.8.195 6B·ChatPage 拆分：工具抽屉区（快捷入口/模式切换/历史工具）子组件
import { toRefs } from 'vue'
const props = defineProps({ ctx: { type: Object, required: true } })
const {
  isNarrow,
  toolsCollapsed,
  toggleTools,
  store,
  MODE_NAMES,
  modeOpen,
  modeIcon,
  modeName,
  MODE_GROUPS,
  setMode,
  train,
  trainPlate,
  plates,
  openExam,
  examOffline,
  openAnchor,
  saveCfg,
  openSolid,
  openDataTrain,
  trainWeak,
  guideShow
} = toRefs(props.ctx)
</script>

<template>
      <div class="chat-tools">
        <div class="chat-tools-hd">
          <span class="cth-t">{{ isNarrow ? '🎯 训练' : '🛠️ 训练工具' }}</span>
          <button class="cth-btn" @click="toggleTools()">{{ toolsCollapsed ? '▾ 展开' : '▴ 收起' }}</button>
        </div>
        <div v-if="!toolsCollapsed && isNarrow" class="chat-tools-ov" @click="toggleTools()"></div>
        <div v-show="!toolsCollapsed" class="chat-tools-bd">
          <div class="mode-pick">
            <button class="mode-pick-btn" :title="'当前模式：' + MODE_NAMES[store.mode] + '，点击切换专项模式'" @click.stop="modeOpen = !modeOpen">
              <span class="mp-ic">{{ modeIcon(store.mode) }}</span>
              <span class="mp-name">{{ modeName(store.mode) }}</span>
              <span class="mp-arrow">{{ modeOpen ? '▴' : '▾' }}</span>
            </button>
            <div v-if="modeOpen" class="mode-pop" @click.self="modeOpen = false">
              <div v-for="g in MODE_GROUPS" :key="g.k" class="mp-group">
                <div class="mp-group-t">{{ g.t }}</div>
                <div class="mp-group-items">
                  <button v-for="m in g.items" :key="m" class="mp-item" :class="{ on: store.mode === m }" @click="setMode(m); modeOpen = false">
                    <span class="mp-item-ic">{{ modeIcon(m) }}</span>
                    <span class="mp-item-t">{{ modeName(m) }}</span>
                    <span v-if="store.mode === m" class="mp-check">✓</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div class="train-bar">
        <span class="tb-l">🎯 智能训练</span>
        <select v-model="trainPlate" class="tb-sel" title="当前智能训练/出题板块">
          <option v-for="p in plates" :key="p" :value="p">{{ p }}</option>
        </select>
        <button class="btn btn-gh tb-btn" title="单题快练（原模拟出题）：选板块随机出1题，即时批改·可再来一题·错题入库" @click="openExam('single')">⚡ 单题快练</button>
        <button class="btn btn-gh tb-btn" title="📴 离线练习：无 Key / 断网也能做。图推/数量/政治/资料 用本地确定性生成器（零额度、唯一解质检）出题，随做随批" @click="examOffline = true; openExam('single')">📴 离线练习</button>
        <button class="btn btn-pri tb-btn" title="🌅 每日晨练包：资料速算5 + 常识速测5 + 错题未复盘二刷5，一键15题组合卷" @click="openExam('morning')">🌅 晨练包</button>
        <button class="btn btn-gh tb-btn" title="📐 锚点自测：每板块10道固定真题校准能力值（累计作答100题后解锁）" @click="openAnchor()">📐 锚点自测</button>
        <button class="btn btn-gh tb-btn" title="🎲 AI 整卷出题：真实卷面结构·自选模块/题量/难度/补短·断点续出·成绩单多格式导出（导入材料/错题组卷/真题快练等在考场配置页内切换）" @click="openExam('ai')">🎲 AI 整卷出题</button>
        
        <button class="btn btn-gh tb-btn" @click="train('diag')">📊 学习诊断</button>
            <button
              class="btn tb-btn"
              :class="store.cfg.examMode ? 'btn-pri' : 'btn-gh'"
              title="考场计时：开启后每次提问按问数限时（1 问=1 分钟），AI 回复后统计用时；关闭则不打扰"
              @click="store.cfg.examMode = !store.cfg.examMode; saveCfg()"
            >{{ store.cfg.examMode ? '⏱ 计时开' : '⏱ 计时关' }}</button>
            <button class="btn btn-gh tb-btn" title="立体图推训练：3D旋转查看 + 三视图/展开图/切面/补缺 + AI出题" @click="openSolid()">🧊 立体图推</button>
            <button class="btn btn-gh tb-btn" title="资料分析四层能力训练：判题型→找数据→选公式→速算估算（LY四层能力，本地零额度）" @click="openDataTrain()">📊 资料速算</button>
            <button class="btn btn-pri tb-btn pulse" title="针对错题最多的薄弱板块一键出题" @click="trainWeak()">🎯 攻克薄弱</button>
            <button class="btn btn-gh tb-btn" title="对话功能使用说明书：如何按板块/场景高效提问" @click="guideShow = true">📖 使用说明书</button>
          </div>
        </div>
      </div>
</template>
