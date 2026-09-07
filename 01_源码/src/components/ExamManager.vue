<script setup>
// ExamManager.vue —— 多考试倒计时管理弹窗（v3.8.69）
// 列出全部考试（国考内置不可删），支持新增 / 编辑 / 删除 / 设为当前。
// 通过 store.uiCtx.examMgr 控制显隐；数据全部走 store 管理方法 → 持久化于 xc_cfg。
import { ref, computed } from 'vue'
import { store, getActiveExam, addExam, updateExam, removeExam, setActiveExam } from '../store'
import { showToast } from '../utils/toast'

const COLOR_PRESETS = ['#ff5c7c', '#5cc8ff', '#ffb454', '#7ee787', '#c792ea', '#ff8a65', '#4dd0e1', '#f06292']

const editingId = ref(null) // null = 新增；否则为正在编辑的考试 id
const form = ref({ name: '', date: '', color: COLOR_PRESETS[0] })

const exams = computed(() => store.cfg.exams || [])
const activeId = computed(() => store.cfg.activeExamId)

function daysLeft(dateStr) {
  try {
    const d = new Date(dateStr)
    if (isNaN(d)) return null
    return Math.max(0, Math.ceil((d - Date.now()) / 86400000))
  } catch (e) { return null }
}
function fmtDate(s) {
  try {
    const d = new Date(s)
    if (isNaN(d)) return s || '未设置'
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日'
  } catch (e) { return s || '未设置' }
}

function openAdd() {
  editingId.value = null
  form.value = { name: '', date: '', color: COLOR_PRESETS[0] }
}
function openEdit(ex) {
  editingId.value = ex.id
  form.value = { name: ex.name, date: ex.date, color: ex.color || COLOR_PRESETS[0] }
}
function cancelEdit() {
  editingId.value = null
  form.value = { name: '', date: '', color: COLOR_PRESETS[0] }
}
function save() {
  const name = (form.value.name || '').trim()
  if (!name) { showToast('请填写考试名称', 'error'); return }
  if (!form.value.date) { showToast('请选择考试日期', 'error'); return }
  if (editingId.value) {
    updateExam(editingId.value, { name, date: form.value.date, color: form.value.color })
    showToast('已保存', 'success')
  } else {
    addExam({ name, date: form.value.date, color: form.value.color })
    showToast('已添加考试', 'success')
  }
  cancelEdit()
}
function onRemove(ex) {
  if (ex.builtin) { showToast('国考为内置考试，不可删除', 'error'); return }
  if (!confirm(`确定删除「${ex.name}」？该考试倒计时将移除。`)) return
  removeExam(ex.id)
  showToast('已删除', 'info')
}
function onSetActive(ex) {
  setActiveExam(ex.id)
}
function close() {
  store.uiCtx.examMgr = false
}
</script>

<template>
  <Teleport to="body">
    <div v-if="store.uiCtx.examMgr" class="em-ov" @click.self="close">
      <div class="em-pnl">
        <div class="em-head">
          <div class="em-title">📅 考试管理</div>
          <div class="em-sub">管理你的国考 / 省考 / 事业单位等考试，各自独立倒计时、数据互不冲突</div>
          <button class="em-x" @click="close" aria-label="关闭">×</button>
        </div>

        <!-- 考试列表 -->
        <div class="em-list">
          <div v-for="ex in exams" :key="ex.id" class="em-row" :class="{ on: ex.id === activeId }">
            <span class="em-dot" :style="{ background: ex.color }"></span>
            <div class="em-info">
              <div class="em-name">
                {{ ex.name }}
                <span v-if="ex.builtin" class="em-tag">内置</span>
                <span v-if="ex.id === activeId" class="em-tag act">当前</span>
              </div>
              <div class="em-meta">{{ fmtDate(ex.date) }} · 剩 {{ daysLeft(ex.date) }} 天</div>
            </div>
            <div class="em-acts">
              <button v-if="ex.id !== activeId" class="em-b em-set" @click="onSetActive(ex)">设为当前</button>
              <button class="em-b" @click="openEdit(ex)">✎ 编辑</button>
              <button class="em-b em-del" :disabled="ex.builtin" :title="ex.builtin ? '国考内置不可删' : '删除'" @click="onRemove(ex)">🗑</button>
            </div>
          </div>
          <div v-if="!exams.length" class="em-empty">暂无考试，点击下方「＋ 添加考试」开始</div>
        </div>

        <!-- 新增 / 编辑表单 -->
        <div class="em-form">
          <div class="em-form-hd">{{ editingId ? '✎ 编辑考试' : '＋ 添加考试' }}</div>
          <div class="em-grid">
            <label class="em-fld">
              <span>考试名称</span>
              <input v-model="form.name" type="text" maxlength="20" placeholder="如：省考 / 事业单位 / 江苏A卷" />
            </label>
            <label class="em-fld">
              <span>笔试日期</span>
              <input v-model="form.date" type="date" />
            </label>
          </div>
          <div class="em-fld">
            <span>标识颜色</span>
            <div class="em-colors">
              <button
                v-for="c in COLOR_PRESETS" :key="c"
                class="em-color" :class="{ on: form.color === c }"
                :style="{ background: c }" @click="form.color = c" :aria-label="c"
              ></button>
            </div>
          </div>
          <div class="em-form-btns">
            <button class="btn btn-gh" @click="openAdd()" v-if="editingId">＋ 新增</button>
            <button class="btn btn-gh" @click="cancelEdit()" v-if="editingId">取消编辑</button>
            <button class="btn btn-pri" @click="save()">{{ editingId ? '保存修改' : '添加考试' }}</button>
          </div>
        </div>

        <button class="em-add-line" @click="openAdd()" v-if="!editingId">＋ 添加考试</button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.em-ov {
  position: fixed; inset: 0; z-index: 9000;
  background: rgba(2, 8, 18, 0.62);
  backdrop-filter: blur(3px);
  display: flex; align-items: center; justify-content: center;
  padding: 18px;
}
.em-pnl {
  width: min(560px, 96vw);
  max-height: 90vh; overflow-y: auto;
  background: var(--glass-dark, #0c1626);
  border: 1px solid rgba(120, 200, 255, 0.22);
  border-radius: 16px;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.55);
  padding: 18px 18px 16px;
  color: var(--text1, #eaf2ff);
}
.em-head { position: relative; padding-right: 30px; }
.em-title { font-size: 17px; font-weight: 700; }
.em-sub { font-size: 12px; color: var(--text3, #8aa0bd); margin-top: 4px; line-height: 1.5; }
.em-x {
  position: absolute; top: -2px; right: -4px;
  width: 28px; height: 28px; border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.05); color: var(--text2, #b9c8de);
  font-size: 18px; line-height: 1; cursor: pointer;
}
.em-x:hover { background: rgba(255, 92, 124, 0.18); color: #fff; }

.em-list { margin: 14px 0 6px; display: flex; flex-direction: column; gap: 8px; }
.em-row {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; border-radius: 10px;
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid rgba(255, 255, 255, 0.07);
}
.em-row.on { border-color: rgba(120, 200, 255, 0.5); background: rgba(80, 200, 255, 0.08); }
.em-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; box-shadow: 0 0 8px currentColor; }
.em-info { flex: 1; min-width: 0; }
.em-name { font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
.em-tag {
  font-size: 10px; padding: 1px 6px; border-radius: 999px;
  background: rgba(255, 255, 255, 0.1); color: var(--text3, #8aa0bd);
}
.em-tag.act { background: rgba(80, 200, 255, 0.25); color: #bfe9ff; }
.em-meta { font-size: 11.5px; color: var(--text3, #8aa0bd); margin-top: 2px; }
.em-acts { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.em-b {
  font-size: 11.5px; padding: 4px 9px; border-radius: 8px; cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.05); color: var(--text2, #b9c8de);
}
.em-b:hover { background: rgba(255, 255, 255, 0.12); color: #fff; }
.em-set { border-color: rgba(80, 200, 255, 0.4); color: #bfe9ff; }
.em-del:disabled { opacity: 0.3; cursor: not-allowed; }
.em-del:not(:disabled):hover { background: rgba(255, 92, 124, 0.2); color: #ffd2dc; }
.em-empty { font-size: 12.5px; color: var(--text3, #8aa0bd); text-align: center; padding: 14px 0; }

.em-form { margin-top: 12px; padding: 14px; border-radius: 12px; background: rgba(255, 255, 255, 0.04); border: 1px dashed rgba(255, 255, 255, 0.12); }
.em-form-hd { font-size: 13.5px; font-weight: 700; margin-bottom: 10px; color: var(--hud-cyan, #5cc8ff); }
.em-grid { display: flex; gap: 12px; flex-wrap: wrap; }
.em-fld { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--text3, #8aa0bd); flex: 1; min-width: 160px; }
.em-fld input[type="text"], .em-fld input[type="date"] {
  background: rgba(0, 0, 0, 0.28); border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px; padding: 8px 10px; color: var(--text1, #eaf2ff); font-size: 13px;
}
.em-fld input:focus { outline: none; border-color: rgba(80, 200, 255, 0.6); }
.em-colors { display: flex; gap: 8px; flex-wrap: wrap; }
.em-color { width: 26px; height: 26px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; }
.em-color.on { border-color: #fff; box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.4); }
.em-form-btns { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; flex-wrap: wrap; }
.em-add-line {
  width: 100%; margin-top: 10px; padding: 10px; border-radius: 10px; cursor: pointer;
  border: 1px dashed rgba(80, 200, 255, 0.4); background: rgba(80, 200, 255, 0.06);
  color: #bfe9ff; font-size: 13px;
}
.em-add-line:hover { background: rgba(80, 200, 255, 0.12); }
</style>
