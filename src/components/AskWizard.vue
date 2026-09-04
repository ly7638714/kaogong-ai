<script setup>
// AskWizard —— 四步发题向导：①板块 ②细分 ③题型/知识点 ④提问意图
// 数据源：plateMatrix.PLATE_TREE（六大板块→细分→题型）+ askModes.ASK_MODES（意图）
// 用法：确认后 emit confirm({ plate, sub, type, mode })，父级写入 pendingPlate 并在 runChat 注入定向系统提示
import { ref, computed } from 'vue'
import { PLATE_TREE } from '../data/plateMatrix'
import { ASK_MODES, MODE_MAP } from '../data/askModes'

const emit = defineEmits(['close', 'confirm'])

const plate = ref('')
const sub = ref('')
const type = ref('')
const mode = ref('solve')

const plates = computed(() => Object.keys(PLATE_TREE))
const subs = computed(() => (plate.value && PLATE_TREE[plate.value]) ? Object.keys(PLATE_TREE[plate.value]) : [])
const types = computed(() => (plate.value && sub.value && PLATE_TREE[plate.value][sub.value]) ? PLATE_TREE[plate.value][sub.value] : [])

function pickPlate(p) { plate.value = p; sub.value = ''; type.value = '' }
function pickSub(s) { sub.value = s; type.value = '' }
function pickType(t) { type.value = t }
function pickMode(m) { mode.value = m }
function reset() { plate.value = ''; sub.value = ''; type.value = ''; mode.value = 'solve' }
function confirmNow() {
  if (!plate.value) return
  emit('confirm', { plate: plate.value, sub: sub.value, type: type.value, mode: mode.value || 'solve' })
}
const pathLabel = computed(() => {
  if (!plate.value) return ''
  const m = MODE_MAP[mode.value]
  return plate.value + (sub.value ? ' · ' + sub.value : '') + (type.value ? ' · ' + type.value : '') + ' · ' + (m ? m.label : mode.value)
})
</script>

<template>
  <div class="ov show wz-ov" @click.self="emit('close')">
    <div class="pnl wz-pnl">
      <div class="pnl-top wz-top">
        <button class="pnl-top-b" @click="emit('close')">← 返回</button>
        <span class="pnl-top-t">🧭 四步发题向导</span>
        <span class="wz-tip">先定位，再提问，AI 按你的路径精准作答</span>
      </div>
      <div class="wz-steps">
        <div class="wz-step" :class="{ on: plate }"><i>1</i>板块</div>
        <div class="wz-step" :class="{ on: sub }"><i>2</i>细分</div>
        <div class="wz-step" :class="{ on: type }"><i>3</i>题型/知识点</div>
        <div class="wz-step" :class="{ on: true }"><i>4</i>意图</div>
      </div>
      <div class="wz-body">
        <!-- ① 板块 -->
        <div class="wz-sec" :class="{ show: !plate }">
          <div class="wz-h">① 属于哪个板块？</div>
          <div class="wz-chips wz-plates">
            <button v-for="p in plates" :key="p" class="wz-chip wz-p" :class="{ on: plate === p }" @click="pickPlate(p)">{{ p }}</button>
          </div>
        </div>
        <!-- ② 细分 -->
        <div v-if="plate" class="wz-sec show">
          <div class="wz-h">② 具体细分 <button class="wz-back" @click="reset()">↺ 重选板块</button></div>
          <div class="wz-chips">
            <button v-for="s in subs" :key="s" class="wz-chip" :class="{ on: sub === s }" @click="pickSub(s)">{{ s }}</button>
          </div>
        </div>
        <!-- ③ 题型/知识点 -->
        <div v-if="plate && sub" class="wz-sec show">
          <div class="wz-h">③ 题型 / 知识点（可跳过） <button class="wz-back" @click="pickPlate(plate)">↺ 重选细分</button></div>
          <div class="wz-chips wz-types">
            <button v-for="t in types" :key="t" class="wz-chip wz-type" :class="{ on: type === t }" @click="pickType(t)">{{ t }}</button>
          </div>
        </div>
        <!-- ④ 意图 -->
        <div v-if="plate" class="wz-sec show">
          <div class="wz-h">④ 你想让 AI 怎么答？</div>
          <div class="wz-modes">
            <button v-for="m in ASK_MODES" :key="m.key" class="wz-mode" :class="{ on: mode === m.key }" @click="pickMode(m.key)">
              <span class="wz-m-t">{{ m.label }}</span>
              <span class="wz-m-d">{{ m.desc }}</span>
            </button>
          </div>
        </div>
      </div>
      <div class="wz-foot">
        <button class="btn btn-gh" @click="reset()">↺ 重置</button>
        <button class="btn btn-pri wz-go" :disabled="!plate" @click="confirmNow()">
          ✓ 按此路径去提问{{ pathLabel ? '（' + pathLabel + '）' : '' }}
        </button>
      </div>
    </div>
  </div>
</template>