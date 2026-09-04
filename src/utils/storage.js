// storage.js —— 统一持久化层（批次6-6A）：key 注册表 + 安全读写 + 版本迁移 + Quota 降级
// 目标：全项目 55+ 个 xc_* key 的唯一入口，消除「多组件各持快照互相覆写」与静默丢数据。
export const KEYS = {
  CFG: 'xc_cfg', MSGS: 'xc_msgs', WQS: 'xc_wqs', MODE: 'xc_mode',
  MY_MEM: 'xc_my_mem', NOTES: 'xc_notes', PAPERS: 'xc_papers',
  PAPER_RESULTS: 'xc_paper_results', EP_PAPERS: 'xc_ep_papers',
  EP_QUIZCOL: 'xc_ep_quizcol', EP_RESULTS: 'xc_ep_results', QUIZ_COL: 'xc_quiz_col',
  ATTEMPTS: 'xc_attempts', // 作答事件流（35号批次1-B）：统一作答明细，驱动难度校准/薄弱点加权/Elo
  FLAG_QS: 'xc_flag_qs', // 疑题反馈（37号 正确性加固B）：用户认为有问题的题，用于降权/人工复核
  COST: 'xc_cost', SRS: 'xc_srs', STUDY: 'xc_study', PET: 'xc_pet',
  TASKS: 'xc_tasks', QUIZ_LOG: 'xc_quiz_log', DATA: 'xc_data',
  STREAK: 'xc_streak', WQ_REASONS: 'xc_wq_reasons', EXAM_INFO: 'xc_exam_info',
  THEME: 'xc_theme', THEME_PRESET: 'xc_theme_preset', ACCENT: 'xc_accent',
  AUTH: 'xc_auth', ERRLOG: 'xc_errlog', RECENT_QS: 'xc_recent_qs',
  CHAT_DRAFT: 'xc_chat_draft', CHAT_FAST_MODEL: 'xc_chat_fast_model',
  COST_BUDGET: 'xc_cost_budget', PAPER_MODE: 'xc_paper_mode',
  FAST_GEN_MODEL: 'xc_fast_gen_model', SHEET_MODE: 'xc_sheet_mode',
  SINGLE_PLATE: 'xc_single_plate', QUICK_MODE: 'xc_quick_mode',
  USE_FIG_GEN: 'xc_use_fig_gen', DT_KB_PROGRESS: 'xc_dt_kb_progress',
  LIB_READ: 'xc_lib_read', MUSIC_LIST: 'xc_music_list', MUSIC_VOL: 'xc_music_vol',
  MUSIC_LOOP: 'xc_music_loop', MUSIC_POS: 'xc_music_pos',
  PET_POS: 'xc_pet_pos', PET_PANEL_POS: 'xc_pet_panel_pos', PET_MUTED: 'xc_pet_muted',
  DRAFT_FAB_ON: 'xc_draft_fab_on', DRAFT_OPACITY: 'xc_draft_opacity',
  GLOBAL_FAB: 'xc_global_fab', CHAT_TOOLS: 'xc_chat_tools',
  BL_POS: 'xc_bl_pos', ONBOARDED: 'xc_onboarded', GUIDED: 'xc_guided',
  GUIDES_OFF: 'xc_guides_off',
  PENDING_PAPER: 'xc_pending_paper' // 组卷断点续出：完整性拦截/中途中断后保留的成功题草稿
}
export function safeGet(key, fallback) {
  try {
    const v = localStorage.getItem(key)
    if (v == null) return fallback
    const p = JSON.parse(v)
    // 类型校验：fallback 是数组而解析非数组 → 用 fallback（防脏数据）
    if (Array.isArray(fallback) && !Array.isArray(p)) return fallback
    return p
  } catch (e) { return fallback }
}
export function safeSet(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val))
    return true
  } catch (e) {
    // QuotaExceeded 降级：msgs 先裁到最近 30 条再试一次
    try {
      if (key === KEYS.MSGS && Array.isArray(val)) {
        localStorage.setItem(key, JSON.stringify(val.slice(-30).map((m) => ({ ...m, _slim: true }))))
        return true
      }
    } catch (e) {}
    try {
      import('./toast').then((t) => { if (t.showToast) t.showToast('存储空间不足：最新数据可能未保存，请及时导出备份', 'error') }).catch(() => {})
    } catch (e) {}
    return false
  }
}
// 版本迁移：按版本号顺序执行 MIGRATIONS，执行完写回版本号（首个真实迁移从 v2 开始）
const MIGRATIONS = {
  // 2: (msgs) => msgs.filter(...) // 示例：后续真实迁移在此追加
}
export function migrate(key, currentV) {
  try {
    const data = safeGet(key, null)
    const v = Number(localStorage.getItem(key + '_v') || 0)
    if (data == null || v >= currentV) return data
    let d = data
    for (let i = v + 1; i <= currentV; i++) {
      try { d = MIGRATIONS[i] ? MIGRATIONS[i](d) : d } catch (e) {}
    }
    try { localStorage.setItem(key + '_v', String(currentV)) } catch (e) {}
    safeSet(key, d)
    return d
  } catch (e) { return null }
}
