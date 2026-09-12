<script setup>
// v3.8.195 6B·ChatPage 拆分：工具抽屉区（快捷入口/模式切换/历史工具）子组件
import { toRefs, ref } from 'vue'
import ZhentiPdfLib from './ZhentiPdfLib.vue'
const props = defineProps({ ctx: { type: Object, required: true } })
const pdfLibShow = ref(false)
const trainPickShow = ref(false)
const utilsOpen = ref(false)
const PRIMARY_MODULE = { id: 'oneclick', ic: '🎯', name: 'AI 真题模拟', c: '#5cc8ff', tag: '一键生成真题级整卷模拟题，系统自动选快模型、质检、唯一答案校验和失败修复，出完直接开做。', pts: ['无需设置', '真题级质量', '出完即可作答'] }
const TRAIN_GROUPS = [
  { key: 'special', title: '专项突破', items: [
    { id: 'single', ic: '⚡', name: '专项刷题', c: '#34d399', tag: '选板块和题型逐题突破，答完即批、错题入库。', pts: ['按板块专项', '答错进错题本', '可二刷'] },
    { id: 'offline', ic: '📴', name: '离线练习', c: '#94a3b8', tag: '图推、数量、政治、资料等本地确定性题，无 Key 也能刷。', pts: ['零额度', '离线可用'] },
    { id: 'zhenti', ic: '📋', name: '真题快练', c: '#a78bfa', tag: '按年份和板块练历年真题，AI 判题与解析。', pts: ['年份卷', '按板块筛选'] }
  ] },
  { key: 'review', title: '复习巩固', items: [
    { id: 'wrong', ic: '📚', name: '错题重练', c: '#fb7185', tag: '把错题按板块、题型和错次重新组卷。', pts: ['按错次优先', '未复盘优先'] },
    { id: 'morning', ic: '🌅', name: '晨练包', c: '#f97316', tag: '15 题晨练组合，资料、常识与错题二刷一次完成。', pts: ['自动组合'] },
    { id: 'weekRedo', ic: '📅', name: '每周重做', c: '#22d3ee', tag: '把本周到期和反复出错的题重新组卷。', pts: ['到期优先'] }
  ] }
]
function startTrainModule(id) {
  trainPickShow.value = false
  utilsOpen.value = false
  if (id === 'offline') { startOffline(); return }
  openExam.value(id)
}
function startOffline() {
  utilsOpen.value = false
  examOffline.value = true
  openExam.value('single')
}
function startOneClickQuiz() {
  trainPickShow.value = false
  utilsOpen.value = false
  openExam.value('ai', { autoStart: true })
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
            <button class="btn btn-pri tb-btn train-launch" title="统一刷题入口：AI真题模拟、专项提升、真题复习都在这里" @click="trainPickShow = true">🚀 开始刷题</button>
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
                  <button class="btn btn-gh tb-btn" title="导入图片、PDF、Word 等题目材料，校对后组卷或存入错题本" @click="utilsOpen = false; openExam('import')">📂 导入题目/材料</button>
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
            <span class="pnl-top-t">🚀 刷题中心</span>
          </div>
          <div class="tp-tip">想直接刷题就点 AI 真题模拟；需要专项提升、真题资料或错题复习时，再从下面选择。</div>
          <button class="tp-card" style="width:100%;margin-bottom:14px;border-width:2px" :style="{ borderColor: PRIMARY_MODULE.c + 'aa', background: 'linear-gradient(135deg,' + PRIMARY_MODULE.c + '26, rgba(255,255,255,0.02))' }" @click="startOneClickQuiz()">
            <span class="tp-head">
              <span class="tp-ic" :style="{ color: PRIMARY_MODULE.c, background: PRIMARY_MODULE.c + '22' }">{{ PRIMARY_MODULE.ic }}</span>
              <span class="tp-name" :style="{ color: PRIMARY_MODULE.c, fontSize: 'calc(16px * var(--ui-fs-scale, 1))' }">{{ PRIMARY_MODULE.name }}</span>
              <span class="tp-arrow">›</span>
            </span>
            <span class="tp-desc" style="font-size:calc(13px * var(--ui-fs-scale, 1))">{{ PRIMARY_MODULE.tag }}</span>
            <span class="tp-pts"><span v-for="p in PRIMARY_MODULE.pts" :key="p" class="tp-pt">{{ p }}</span></span>
          </button>
          <div v-for="g in TRAIN_GROUPS" :key="g.key" style="margin-top:12px">
            <div style="font-weight:700;font-size:calc(13px * var(--ui-fs-scale,1));color:var(--text2);margin:0 0 7px">{{ g.title }}</div>
            <div class="tp-grid">
            <button v-for="m in g.items" :key="m.id" class="tp-card" :style="{ borderColor: m.c + '88', background: 'linear-gradient(135deg,' + m.c + '1a, rgba(255,255,255,0.015))' }" @click="startTrainModule(m.id)">
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
      </div>
      <ZhentiPdfLib v-if="pdfLibShow" @close="pdfLibShow = false" />
</template>
