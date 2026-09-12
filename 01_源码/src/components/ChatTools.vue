<script setup>
// v3.8.195 6B·ChatPage 拆分：工具抽屉区（快捷入口/模式切换/历史工具）子组件
import { toRefs, ref } from 'vue'
import ZhentiPdfLib from './ZhentiPdfLib.vue'
const props = defineProps({ ctx: { type: Object, required: true } })
const pdfLibShow = ref(false)
const trainPickShow = ref(false)
const utilsOpen = ref(false)
const TRAIN_MODULES = [
  { id: 'single', ic: '⚡', name: '单题快练', c: '#34d399', tag: '专项速刷：选板块和题型逐题突破，答完即批、错题入库。', pts: ['本地/离线可用', '答错钉同考点', '自动进“出题集”可二刷'] },
  { id: 'ai', ic: '🎲', name: 'AI 整卷出题', c: '#5cc8ff', tag: '按真实卷面结构 AI 智能组卷：模块、题量、难度、补短都能调。', pts: ['断点续出 / 只补失败', '仿真答题卡模式', '成绩单多格式导出'] },
  { id: 'import', ic: '📂', name: '导入材料', c: '#fbbf24', tag: '把本地真题/讲义（图片、PDF、Word、txt、tex）识别成可做题。', pts: ['OCR 后先“预览校对”再入库', '可一键存入错题本'] },
  { id: 'wrong', ic: '📚', name: '错题集组卷', c: '#fb7185', tag: '从错题本组卷二刷：只看未复盘、按错次优先，针对性重做。', pts: ['联动今日复习中枢', '不会重复入库'] },
  { id: 'zhenti', ic: '📋', name: '真题快练', c: '#a78bfa', tag: '真题库快速练：选年份卷和板块，AI 负责判题与解析。', pts: ['支持按年份/板块选题'] },
  { id: 'morning', ic: '🌅', name: '晨练包', c: '#f97316', tag: '一键 15 题晨练组合卷，资料、常识与错题二刷一次完成。', pts: ['完成联动看板“晨练”打卡'] },
  { id: 'weekRedo', ic: '📅', name: '每周重做', c: '#22d3ee', tag: '把本周到期和反复出错的题重新组卷，按规则再卷一遍。', pts: ['到期与复错优先'] }
]
function startTrainModule(id) {
  trainPickShow.value = false
  utilsOpen.value = false
  openExam.value(id)
}
function startOffline() {
  utilsOpen.value = false
  examOffline.value = true
  openExam.value('single')
}
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
  openSolid,
  openDataTrain,
  openYanTrain,
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
            <button class="btn btn-pri tb-btn train-launch" title="统一入口：先选模块，再进入对应训练配置" @click="trainPickShow = true">🎯 训练中心</button>
            <button class="btn btn-gh tb-btn" title="📴 离线练习：无 Key / 断网也能做。图推/数量/政治/资料 用本地确定性生成器（零额度、唯一解质检）出题，随做随批" @click="startOffline()">📴 离线练习</button>
          </div>
          <div class="train-utils">
            <button class="btn btn-gh tb-btn util-toggle" :aria-expanded="utilsOpen" @click="utilsOpen = !utilsOpen">
              🧰 专项工具 <span class="util-caret">{{ utilsOpen ? '▴' : '▾' }}</span>
            </button>
            <div v-if="utilsOpen" class="util-panel">
              <div class="util-group">
                <span class="util-group-t">🧪 能力诊断</span>
                <div class="util-group-items">
                  <button class="btn btn-gh tb-btn" @click="utilsOpen = false; train('diag')">📊 学习诊断</button>
                  <button class="btn btn-pri tb-btn pulse" title="针对错题最多的薄弱板块一键出题" @click="utilsOpen = false; trainWeak()">🎯 攻克薄弱</button>
                  <button class="btn btn-gh tb-btn" title="每板块10道固定真题校准能力值" @click="utilsOpen = false; openAnchor()">📐 锚点自测</button>
                </div>
              </div>
              <div class="util-group">
                <span class="util-group-t">🧩 专项训练</span>
                <div class="util-group-items">
                  <button class="btn btn-gh tb-btn" title="立体图推训练：3D旋转查看 + 三视图/展开图/切面/补缺 + AI出题" @click="utilsOpen = false; openSolid()">🧊 立体图推</button>
                  <button class="btn btn-gh tb-btn" title="资料分析四层能力训练：判题型→找数据→选公式→速算估算" @click="utilsOpen = false; openDataTrain()">📊 资料速算</button>
                  <button class="btn btn-gh tb-btn" title="片段阅读结构四步拆解：主题词→句子功能→行文结构→主旨意图" @click="utilsOpen = false; openYanTrain()">📖 片段结构</button>
                </div>
              </div>
              <div class="util-group">
                <span class="util-group-t">📚 学习资源</span>
                <div class="util-group-items">
                  <button class="btn btn-gh tb-btn" title="本地真题PDF卷库" @click="utilsOpen = false; pdfLibShow = true">📄 真题PDF库</button>
                  <button class="btn btn-gh tb-btn" title="对话功能使用说明书" @click="utilsOpen = false; guideShow = true">📖 使用说明书</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div v-if="trainPickShow" class="ov show train-pick-ov" @click.self="trainPickShow = false">
        <div class="pnl train-pick-pnl">
          <div class="pnl-top">
            <button class="pnl-top-b" @click="trainPickShow = false">← 返回</button>
            <span class="pnl-top-t">🎯 训练中心 · 按需选择</span>
          </div>
          <div class="tp-tip">同一个入口进入后按需选择：专项速刷、整卷模考、导入真题、复盘错题，或完成晨练/周重做。</div>
          <div class="tp-grid">
            <button v-for="m in TRAIN_MODULES" :key="m.id" class="tp-card" :style="{ borderColor: m.c + '88', background: 'linear-gradient(135deg,' + m.c + '1a, rgba(255,255,255,0.015))' }" @click="startTrainModule(m.id)">
              <span class="tp-head">
                <span class="tp-ic" :style="{ color: m.c, background: m.c + '22' }">{{ m.ic }}</span>
                <span class="tp-name" :style="{ color: m.c }">{{ m.name }}</span>
                <span class="tp-arrow">›</span>
              </span>
              <span class="tp-desc">{{ m.tag }}</span>
              <span class="tp-pts"><span v-for="p in m.pts" :key="p" class="tp-pt">{{ p }}</span></span>
            </button>
          </div>
        </div>
      </div>
      <ZhentiPdfLib v-if="pdfLibShow" @close="pdfLibShow = false" />
</template>
