<script setup>
// R4：错题模块子组件（从 WrongPage.vue 对应模板逐字搬入）
// 父组件通过 ctx 注入全部依赖；模板保持与 WrongPage 完全一致，仅把状态/方法从 ctx 暴露到本组件作用域。
import { toRefs } from 'vue'

const props = defineProps({ ctx: { type: Object, required: true } })

const {
  reasonModal,
  renameInput
} = toRefs(props.ctx)

</script>

<template>
  <div v-if="reasonModal" class="ov show" style="z-index: 330" @click.self="reasonModal = null">
    <div class="pnl" style="max-width: 480px">
      <template v-if="reasonModal.mode === 'reasons'">
        <h3>🤖 AI 找到新的错因</h3>
        <p style="margin-bottom: 8px">这道题当前已有 <b>{{ reasonModal.old.length }}</b> 条旧错因，AI 结合你的作答与解析归纳出 <b>{{ reasonModal.neu.length }}</b> 条新错因：</p>
        <div class="rv-group"><b>旧错因：</b><span v-for="r in reasonModal.old" :key="r" class="chip on">{{ r }}</span></div>
        <div class="rv-group"><b>AI 新错因：</b><span v-for="r in reasonModal.neu" :key="r" class="chip ai-chip">{{ r }}</span></div>
        <p style="font-size: 12px; color: var(--text3); margin-top: 6px">选择「用新替换旧」会删除旧错因并改用 AI 新错因；「保留合并」新旧并存；「取消」不改动错因（答案/秒杀/笔记仍会填入）。</p>
        <div class="pnl-btns">
          <button class="btn btn-pri" @click="reasonModal.resolve('replace')">✅ 用新替换旧</button>
          <button class="btn btn-gh" @click="reasonModal.resolve('merge')">➕ 保留合并</button>
          <button class="btn btn-gh" @click="reasonModal.resolve('cancel')">✖ 取消</button>
        </div>
      </template>
      <template v-else>
        <h3>✎ 修改错因</h3>
        <div class="fld">
          <label>原错因</label>
          <input :value="reasonModal.r" disabled />
        </div>
        <div class="fld">
          <label>改为</label>
          <input v-model="renameInput" placeholder="输入新的错因表述" @keydown.enter.prevent="reasonModal.resolve(renameInput)" />
        </div>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="reasonModal = null">取消</button>
          <button class="btn btn-pri" @click="reasonModal.resolve(renameInput)">✅ 保存</button>
        </div>
      </template>
    </div>
  </div>
</template>
