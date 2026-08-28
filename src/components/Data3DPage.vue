<template>
  <div class="data3d-page">
    <div class="d3d-top">
      <div class="d3d-title">🌌 3D 学习数据驾驶舱</div>
      <div class="d3d-cards">
        <div class="d3d-card"><b>{{ stats.q }}</b><span>总提问</span></div>
        <div class="d3d-card"><b>{{ stats.w }}</b><span>错题数</span></div>
        <div class="d3d-card"><b>{{ revRate }}%</b><span>复盘率</span></div>
        <div class="d3d-card"><b>{{ todayMin }}</b><span>今日学习</span></div>
        <div class="d3d-card"><b>{{ totalMin }}</b><span>累计学习</span></div>
      </div>
    </div>
    <div class="d3d-stage">
      <CosmosScene :active="store.tab === '3d'" :active-tab="'3d'" />
    </div>
    <div class="d3d-foot">🖱 点击行星=板块分析 · 点击地球=行测局长总览 · 右下🚀数据飞行+萌宠 · 拖动旋转 · 滚轮缩放</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { store } from '../store'
import CosmosScene from './CosmosScene.vue'
import { todaySeconds, totalSeconds, fmtMin, studyTick } from '../utils/study'

// 总数据面板
const stats = computed(() => ({
  q: store.msgs.filter((m) => m.role === 'user' && /分析|讲解|题目/.test(String((m.content && m.content.text) || m.content || ''))).length,
  w: store.wqs.length
}))
const revRate = computed(() => (store.wqs.length ? Math.round((store.wqs.filter((q) => q.reviewed || q.digested).length / store.wqs.length) * 100) : 0))
const todayMin = computed(() => { studyTick.value; return fmtMin(todaySeconds()) })
const totalMin = computed(() => { studyTick.value; return fmtMin(totalSeconds()) })
</script>

<style scoped>
.data3d-page {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px 8px;
  overflow: hidden;
}
.d3d-top {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.d3d-title {
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 1px;
  background: linear-gradient(90deg, var(--hud-cyan), #a78bfa);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.d3d-cards {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.d3d-card {
  min-width: 74px;
  padding: 5px 14px;
  border-radius: 12px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  text-align: center;
}
.d3d-card b {
  display: block;
  font-size: 16px;
  color: var(--hud-cyan);
  font-family: var(--font-hud);
}
.d3d-card span {
  font-size: 11px;
  color: var(--text3);
}
.d3d-stage {
  position: relative;
  flex: 1;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid var(--glass-border);
  background: radial-gradient(circle at 50% 35%, #0a1f33, #04070f 65%);
}
/* 让内嵌 3D 画布铺满本页（覆盖其 fixed 定位） */
.d3d-stage :deep(.cosmos-bg) {
  position: absolute;
  inset: 0;
  border-radius: 16px;
}
/* 3D 页所有 HUD 改为相对舞台(absolute)定位：面板在左侧、飞行停靠在右侧，
   既不被顶部搜索栏遮挡（close 可点），也不互相挡按钮 */
.d3d-stage :deep(.planet-card) {
  position: absolute;
  left: 14px;
  right: auto;
  top: 14px;
  bottom: auto;
}
.d3d-stage :deep(.earth-panel) {
  position: absolute;
  left: 14px;
  right: auto;
  top: 14px;
  bottom: auto;
}
.d3d-stage :deep(.legend) {
  position: absolute;
  bottom: 14px;
  left: 14px;
}
.d3d-stage :deep(.weak-bar) {
  position: absolute;
  bottom: 14px;
  right: 14px;
}
.d3d-stage :deep(.hover-tip) {
  position: absolute;
  bottom: 46px;
  left: 50%;
  transform: translateX(-50%);
}
.d3d-stage :deep(.fly-status) {
  position: absolute;
  bottom: 78px;
  left: 50%;
  transform: translateX(-50%);
}
.d3d-stage :deep(.fly-speech) {
  position: absolute;
  bottom: 132px;
  left: 50%;
  transform: translateX(-50%);
}
.d3d-stage :deep(.fly-dock) {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 9;
}
.d3d-stage :deep(.pet-float3d) {
  left: 16px;
  top: 62%;
}
.d3d-stage :deep(.pet-chat) {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
}
.d3d-foot {
  text-align: center;
  font-size: 11.5px;
  color: var(--text3);
  line-height: 1.6;
}
@media (max-width: 640px) {
  .d3d-title { font-size: 13px; }
  .d3d-card { min-width: 60px; padding: 4px 8px; }
}
</style>
