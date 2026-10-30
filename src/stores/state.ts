/* =====================================================
 * 全局应用状态：收编原 index.html 的 window.__dld* 全局变量
 * （Vue 化要求：不留全局，统一收进响应式 store）
 * ===================================================== */
import { reactive } from 'vue'

export const ACCOUNT_KEY = 'dld_current_account'
export const LAST_OPEN_CONV_KEY = 'dld_last_open_conversation_v1'
export const PRODUCT_CACHE_KEY = 'dld_products_by_conversation_v1'
export const REPORT_CACHE_KEY = 'dld_reports_by_conversation_v1'
export const CONV_ID_MAP_KEY = 'dld_conv_id_map_v1'
export const ACTIVE_RESULT_TAB_KEY = 'dld_active_result_tab_v1'
export const VIEW_MODE_KEY = 'dld_view_mode_v1'
export const CONV_GROUP_KEY = 'dld_conv_groups'

export interface RunningTask {
  runId: string | null
  startedAt: number
  stopped: boolean
  abortController: AbortController
  cancelStream?: () => void
  finishRun?: () => void
  offersLoading?: boolean
}

export interface Account {
  id: string
  name: string
  role: 'main' | 'sub'
  roleLabel: string
  avatar: string
  phone: string
  shop: string
  lastActive: string
}

export interface SessionItem {
  id: string
  convId?: string
  appCode?: string
  title: string
  tag?: string
  roundCount?: number
  time: string
  timestamp: number
  draft?: boolean
  pinned?: boolean
  snippet?: string
}

export const appState = reactive({
  // 数据接入
  dldMember: null as any,
  dldApps: [] as any[],
  dldConversations: [] as any[],
  dldObsMeta: null as any,
  // 运行态共享（原 window 全局）
  activeConversationId: '' as string,        // __dldActiveConversationId
  currentResultQuery: '' as string,          // __dldCurrentResultQuery
  currentExportQuery: '' as string,          // __dldCurrentExportQuery
  currentResultMessageId: '' as string,      // __dldCurrentResultMessageId
  currentResultKey: '' as string,            // __dldCurrentResultKey
  currentAnswer: '' as string,               // __dldCurrentAnswer
  lastPayloadNode: null as any,              // __lastPayloadNode
  lastReport: null as any,                   // __lastReport
  remoteReport: null as any,                 // __dldRemoteReport
  autoReport: null as any,                   // __dldAutoReport（静默补检索状态）
  hasRealOffers: false,                      // __hasRealOffers
  productResultTabs: {} as Record<string, { payload: any; offers: any[]; title: string }>,   // __productResultTabs
  // 右栏
  initialPreviewGuard: true,                 // __initialPreviewGuard
  reportZoom: 1,                             // __reportZoom
  reportSrcdocCache: {} as Record<string, string>,  // __dldReportSrcdocCache
  // 积分
  totalCoins: 1000,
  currentModel: 'gpt-5.6' as string
})

export const MODELS: Record<string, { name: string; tier: string; coinPerKInput: number; coinPerKOutput: number; baseCoins: number }> = {
  'gpt-5.6': { name: 'GPT-5.6', tier: 'fast', coinPerKInput: 2, coinPerKOutput: 6, baseCoins: 5 },
  'deepseek-v4': { name: 'DeepSeek-V4', tier: 'standard', coinPerKInput: 1, coinPerKOutput: 4, baseCoins: 3 },
  'claude-opus': { name: 'Claude-Opus', tier: 'pro', coinPerKInput: 8, coinPerKOutput: 24, baseCoins: 15 }
}
export const currentModelDef = () => MODELS[appState.currentModel] || MODELS['gpt-5.6']

// 计算单次对话消耗（只算积分）
export function computeCost(text: string, attachCount: number, model = currentModelDef()): { coins: number } {
  const inputTokens = Math.ceil(text.length * 1.4 + attachCount * 800)
  const outputTokens = 380 + Math.floor(Math.random() * 420)
  const toolCalls = 1 + (attachCount > 0 ? 1 : 0)
  const coins = Math.ceil(
    model.baseCoins
    + inputTokens / 1000 * model.coinPerKInput
    + outputTokens / 1000 * model.coinPerKOutput
    + toolCalls * 2
  )
  return { coins }
}

/* ==================== 会话级本地缓存 ==================== */
export function readConversationViewModes(): Record<string, string> {
  try {
    const value = JSON.parse(localStorage.getItem(VIEW_MODE_KEY) || '{}')
    return value && typeof value === 'object' ? value : {}
  } catch (e) { return {} }
}
export function getConversationViewMode(conversationId: any): string {
  if (!conversationId) return ''
  const mode = readConversationViewModes()[String(conversationId)]
  return mode === 'report' || mode === 'table' ? mode : ''
}
export function setConversationViewMode(conversationId: any, mode: string) {
  if (!conversationId || (mode !== 'report' && mode !== 'table')) return
  try {
    const all = readConversationViewModes()
    all[String(conversationId)] = mode
    localStorage.setItem(VIEW_MODE_KEY, JSON.stringify(all))
  } catch (e) {}
}

export function currentResultConversationId(): string {
  return String(appState.activeConversationId || appState.currentResultKey?.split(':')[0] || '')
}

export function readConversationReports(): Record<string, any[]> {
  try {
    const value = JSON.parse(localStorage.getItem(REPORT_CACHE_KEY) || '{}')
    return value && typeof value === 'object' ? value : {}
  } catch (e) { return {} }
}
export function saveConversationReport(conversationId: any, report: any) {
  if (!conversationId || !report || !report.title) return
  try {
    const all = readConversationReports()
    const key = String(conversationId)
    const reports = Array.isArray(all[key]) ? all[key] : []
    const id = String(report.persistKey || report.resultKey || ('report-' + Date.now()))
    const entry = Object.assign({}, report, { persistKey: id, savedAt: Date.now() })
    const index = reports.findIndex((item: any) => String(item.persistKey || item.resultKey || '') === id)
    if (index >= 0) reports[index] = entry; else reports.push(entry)
    all[key] = reports.slice(-20)
    localStorage.setItem(REPORT_CACHE_KEY, JSON.stringify(all))
  } catch (e) { console.warn('[DLD] 报告结果缓存失败：', (e as Error).message) }
}
export function getConversationReports(conversationId: any): any[] {
  if (!conversationId) return []
  const reports = readConversationReports()[String(conversationId)]
  return Array.isArray(reports) ? reports.filter((item: any) => item && item.title) : []
}

export function readConversationProducts(): Record<string, any> {
  try {
    const value = JSON.parse(localStorage.getItem(PRODUCT_CACHE_KEY) || '{}')
    return value && typeof value === 'object' ? value : {}
  } catch (e) { return {} }
}
export function saveConversationProducts(conversationId: any, payload: any, roundKey?: string) {
  if (!conversationId || !payload || !Array.isArray(payload.products) || !payload.products.length) return
  try {
    const all = readConversationProducts()
    const key = String(conversationId)
    const old = all[key]
    const rounds = Array.isArray(old && old.rounds) ? old.rounds : (old && old.products ? [{ products: old.products, count: old.count, savedAt: old.savedAt }] : [])
    const rid = String(roundKey || ('round-' + Date.now()))
    const prevSameRound = rounds.find((r: any) => String(r.roundKey || '') === rid)
    const entry = { roundKey: rid, query: payload.query || payload.title || appState.currentResultQuery || '', count: payload.count || payload.products.length, totalCount: payload.totalCount || payload.count || payload.products.length, obsUrl: String(payload.obsUrl || (prevSameRound && prevSameRound.obsUrl) || (old && old.obsUrl) || ''), products: payload.products, savedAt: Date.now() }
    const idx = rounds.findIndex((r: any) => String(r.roundKey || '') === rid)
    if (idx >= 0) rounds[idx] = entry; else rounds.push(entry)
    all[key] = { count: entry.count, products: entry.products, obsUrl: entry.obsUrl, rounds: rounds.slice(-20), savedAt: entry.savedAt }
    // localStorage 有容量上限。优先保住本会话最新结果，按最旧会话、最旧轮次逐步腾出空间。
    delete all[key].products
    const write = () => localStorage.setItem(PRODUCT_CACHE_KEY, JSON.stringify(all))
    try { write() } catch (quotaError: any) {
      if (quotaError.name !== 'QuotaExceededError') throw quotaError
      const otherKeys = Object.keys(all).filter(id => id !== key)
        .sort((a, b) => Number(all[a]?.savedAt || 0) - Number(all[b]?.savedAt || 0))
      let saved = false
      while (otherKeys.length && !saved) {
        delete all[otherKeys.shift()!]
        try { write(); saved = true } catch (e) { if ((e as any).name !== 'QuotaExceededError') throw e }
      }
      while (!saved && all[key].rounds.length > 1) {
        all[key].rounds.shift()
        try { write(); saved = true } catch (e) { if ((e as any).name !== 'QuotaExceededError') throw e }
      }
      if (!saved) {
        const latest = all[key].rounds[0]
        for (const limit of [1000, 200, 50, 10]) {
          if (latest.products.length <= limit) continue
          latest.products = latest.products.slice(0, limit)
          latest.count = latest.products.length
          try { write(); saved = true; break } catch (e) { if ((e as any).name !== 'QuotaExceededError') throw e }
        }
      }
      if (!saved) throw quotaError
    }
  } catch (e) { console.warn('[DLD] 商品结果缓存失败：', (e as Error).message) }
}
export function getConversationProducts(conversationId: any): any | null {
  if (!conversationId) return null
  const all = readConversationProducts()
  const value = all[String(conversationId)]
  if (!value) return null
  const rounds = Array.isArray(value.rounds) ? value.rounds.filter((r: any) => r && Array.isArray(r.products) && r.products.length) : []
  return rounds.length ? { ...value, products: rounds[rounds.length - 1].products, rounds } : (Array.isArray(value.products) && value.products.length ? value : null)
}

// 会话ID持久化映射：请求时按视图key兜底解析，追问必带同一会话ID
export function readConvIdMap(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(CONV_ID_MAP_KEY) || '{}') } catch (e) { return {} }
}
export function writeConvIdMap(key: string, convId: string) {
  try {
    const idMap = readConvIdMap()
    idMap[String(key)] = convId
    localStorage.setItem(CONV_ID_MAP_KEY, JSON.stringify(idMap))
  } catch (e) {}
}

// 已访问预览的会话集合（切回时自动展开右栏）
export function hasVisitedPreview(convId: string): boolean {
  if (!convId) return false
  try { return (JSON.parse(localStorage.getItem('dld_visited_previews_v1') || '[]')).includes(convId) }
  catch (e) { return false }
}
export function markVisitedPreview(convId: string) {
  try {
    const set = JSON.parse(localStorage.getItem('dld_visited_previews_v1') || '[]')
    if (!set.includes(convId)) set.push(convId)
    localStorage.setItem('dld_visited_previews_v1', JSON.stringify(set))
  } catch (e) {}
}

// 会话分组折叠状态
export function loadGroupState(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(CONV_GROUP_KEY) || '{}') } catch (e) { return {} }
}
export function saveGroupState(state: Record<string, boolean>) {
  try { localStorage.setItem(CONV_GROUP_KEY, JSON.stringify(state)) } catch (e) {}
}

export function pad(n: number): string { return String(n).padStart(2, '0') }
export function nowString(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
