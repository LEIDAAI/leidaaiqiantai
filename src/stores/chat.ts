/* =====================================================
 * 会话与消息状态（对应原 CONV_VIEWS / RUNNING_TASKS / 会话侧栏逻辑）
 * ===================================================== */
import { reactive, computed } from 'vue'
import { DLD } from '../api'
import {
  appState, RunningTask, SessionItem, LAST_OPEN_CONV_KEY, PRODUCT_CACHE_KEY, CONV_ID_MAP_KEY,
  readConversationProducts, readConvIdMap, writeConvIdMap, saveConversationProducts,
  getConversationProducts, readCachedMessages, writeCachedMessages, deleteCachedMessages,
  hasCachedMessages, renameCachedMessages
} from './state'
import {
  accountState, currentAccount, sessionsFor, notifyConversationsLoaded
} from './account'
import { agentOpening } from './opening'
import { flashToast, formatRelativeTime } from '../utils/common'
import { dldLqGet, dldLqSet } from '../utils/workflow'
import { REPORT_CACHE_KEY, getConversationReports, readConversationReports, getConversationViewMode } from './state'
import { expertState, type ExpertItem, type SkillItem } from './expert'

export interface MsgAttachment { name: string; size: number; ext: string; type: string; icon: string; url?: string }

export interface Ali1688ProductData {
  product: {
    title: string
    images: string[]
    price: string
    moq: string
    attributes: Array<{ label: string; value: string }>
  }
  reviews: {
    rating: number
    count: number
    keywords: string[]
    samples: Array<{ user: string; content: string; rating: number; time: string }>
  }
  shop: {
    name: string
    level: string
    transactionData: string
    mainCategory: string
  }
  hotSKUs: Array<{
    spec: string
    price: string
    sales: number
    stock: number
  }>
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string            // 用户原文 / AI 原始回答
  createdAt: number | null
  /* —— AI 流式状态机 —— */
  phase: 'pending' | 'streaming' | 'done' | 'error' | 'stopped'
  statusText: string         // · 正在执行 / · 流式中 / · 已连接 / · 已完成 / · 失败 / · 已停止 / · 生成报告中
  liveText: string           // 流式可见文本（截断后）
  liveStatus: null | { text: string; elapsed: number }
  analyze: null | {
    stepIdx: number
    customStage: boolean
    stageText: string
    subKw: string
    elapsed: number
    hint: boolean
    done: boolean
    doneText: string
  }
  reportTask: null | { step: number; note: string; failed?: string }
  skeleton: null | { pct: number | null; eta: string; indeterminate: boolean }
  finalHtml: string          // 完成后的富文本
  productPreview: string     // 五条商品预览卡 HTML
  costBar: null | { title: string; coins: number }
  memRounds: number
  suggest: null | Array<{ q: string; t: string; ic: string }>
  suggestLoading: boolean
  errorText: string
  attachments: MsgAttachment[]
  hidden: boolean            // 报告去重时隐藏自动补发轮次
  query: string              // 重新发起用（AI 消息记录对应提问）
  reportCardHtml: string     // 历史恢复的报告卡片
  showAnalyzeDone: null | { kw: string }  // 历史恢复静态"搜索分析完成"卡
  ali1688Product: null | Ali1688ProductData  // 1688商品分析数据
}

export interface ConvView {
  key: string
  convId: string
  loaded: boolean
  loading: boolean
  messages: ChatMessage[]
  explicitNew: boolean       // 显式"＋新建对话"：发送时不自动续接上次会话
}

export const chatState = reactive({
  views: {} as Record<string, ConvView>,
  activeConvKey: '',
  runningTasks: {} as Record<string, RunningTask>,
  chatTitle: '新建对话',
  draftSeq: 0,
  lastQuery: '',
  searchQuery: '',
  inputText: '',
  attaches: [] as Array<MsgAttachment & { file: File }>,
  /* Composer 浮窗选择的电商专家 / 技能（随消息发送后清空） */
  selectedExpert: null as ExpertItem | null,
  selectedSkill: null as SkillItem | null,
  /* 移动端会话列表抽屉开关 */
  mobileSidebar: false,
  leftCollapsed: (() => { try { return localStorage.getItem('dld_left_collapsed') === '1' } catch (e) { return false } })(),
  leftWidth: (() => { const n = Number(localStorage.getItem('dld_left_width')); return n && !chatStateLeftGuard() ? n : 0 })(),
  rightWidth: (() => { const n = Number(localStorage.getItem('dld_right_width')); return n || 0 })()
})
function chatStateLeftGuard() { return false }

export const activeView = computed<ConvView | null>(() => chatState.views[chatState.activeConvKey] || null)
export const isRunning = computed(() => !!chatState.runningTasks[chatState.activeConvKey])

export function makeMessage(partial: Partial<ChatMessage> & { role: 'user' | 'assistant'; content: string }): ChatMessage {
  // 必须返回 reactive 代理：send() 等处持有该引用并大量原地修改字段，
  // 若为裸对象则 push 进响应式数组后模板无法追踪变更（流式/错误态全部不渲染）。
  return reactive({
    id: partial.id || '',
    role: partial.role,
    content: partial.content,
    createdAt: partial.createdAt ?? null,
    phase: partial.phase || (partial.role === 'user' ? 'done' : 'pending'),
    statusText: partial.statusText || '· 正在执行',
    liveText: '',
    liveStatus: null,
    analyze: null,
    reportTask: null,
    skeleton: null,
    finalHtml: '',
    productPreview: '',
    costBar: null,
    memRounds: 0,
    suggest: null,
    suggestLoading: false,
    errorText: '',
    attachments: partial.attachments || [],
    hidden: false,
    query: partial.query || '',
    reportCardHtml: '',
    showAnalyzeDone: null,
    ali1688Product: null
  }) as ChatMessage
}

export function ensureView(key: string): ConvView {
  if (!chatState.views[key]) {
    chatState.views[key] = { key, convId: '', loaded: false, loading: false, messages: [], explicitNew: false }
  }
  return chatState.views[key]
}

/* ==================== 新建对话（原 showEmptyConversation） ==================== */
export function newConversation() {
  // 切回聊天视图（退出专家工作台）
  expertState.open = false
  // 并行模式：清理未发言的草稿（有消息或有本地缓存的草稿一律保留，防止历史丢失）
  Object.keys(chatState.views).forEach(k => {
    if (k.startsWith('draft-') && !chatState.runningTasks[k] && !chatState.views[k].messages.length && !hasCachedMessages(k)) delete chatState.views[k]
  })
  const key = 'draft-' + Date.now() + '-' + (++chatState.draftSeq)
  chatState.activeConvKey = key
  chatState.mobileSidebar = false
  chatState.selectedExpert = null
  chatState.selectedSkill = null
  // 左栏清理旧草稿条目：仅删除"无消息且无本地缓存"的草稿，有内容的保留
  const sessions = sessionsFor()
  for (let i = sessions.length - 1; i >= 0; i--) {
    const s = sessions[i]
    const hasMsg = !!(chatState.views[s.id] && chatState.views[s.id].messages.length) || hasCachedMessages(s.id)
    if (s.draft && s.id !== key && !hasMsg) sessions.splice(i, 1)
  }
  sessions.unshift({ id: key, convId: '', appCode: '1', title: '新建对话', tag: 'AI', time: '刚刚', timestamp: Date.now(), draft: true })
  const view = ensureView(key)
  view.explicitNew = true
  view.loaded = true
  chatState.chatTitle = '新建对话'
  notifyConversationsLoaded(sessions, true)
}

/* ==================== 会话切换 ==================== */
export function selectConversation(id: string, options: { restorePreview?: boolean } = {}) {
  if (options.restorePreview !== false) appState.initialPreviewGuard = false
  const previousConvKey = chatState.activeConvKey
  if (previousConvKey && previousConvKey !== id) {
    // 切换到另一条会话时，右侧结果与新会话重新隔离（由 panel.resetRightPreview 承担，App 层监听处理）
  }
  chatState.activeConvKey = id
  chatState.mobileSidebar = false
  try { localStorage.setItem(LAST_OPEN_CONV_KEY + ':' + currentAccount.value.id, String(id)) } catch (e) {}
  const sessions = sessionsFor()
  const target = sessions.find(s => s.id === id)
  if (!target) return
  if (target.title) chatState.chatTitle = target.title
  const view = ensureView(id)
  if (view.convId) appState.activeConversationId = view.convId
  // 已加载：直接恢复（流式缓冲不丢）
  if (view.loaded) return
  // 真实会话：拉历史
  if (target.convId) {
    loadRealMessages(target, view)
    return
  }
  // 无 convId 的草稿：优先恢复本地缓存消息（离线/接口失败场景），否则开场白空态
  const cachedDraft = readCachedMessages(id)
  if (cachedDraft.length) {
    view.messages = cachedDraft
    view.loaded = true
    return
  }
  view.loaded = true
}

/* ==================== 历史消息加载（原 loadRealMessages） ==================== */
export async function loadRealMessages(target: SessionItem, view: ConvView) {
  if (!view) return
  if (view.loaded) return
  view.loading = true
  try {
    // 按 firstId 连续取历史页，合并后按时间排序
    const history: any[] = []
    const seen = new Set<string>()
    let firstId: string | null = null
    let res: any
    while (true) {
      res = await DLD.conversationMessages(target.convId!, firstId, 50)
      const page = res && res.result
      const rows = Array.isArray(page) ? page : (page && (page.data || page.messages)) || []
      if (!Array.isArray(rows)) break
      const fresh = rows.filter((m: any) => {
        const key = m.id || m.message_id || JSON.stringify(m)
        if (seen.has(key)) return false
        seen.add(key); return true
      })
      history.push(...fresh)
      const nextId = rows.length && (rows[rows.length - 1].id || rows[rows.length - 1].message_id)
      if (!page || !page.has_more || !fresh.length || !nextId || nextId === firstId) break
      firstId = nextId
    }
    // 历史请求期间该会话已发起新任务：保留流式内容
    if (chatState.runningTasks[target.id]) {
      view.loading = false
      view.loaded = true
      return
    }
    const messages = extractMessages(history.length ? history : ((res && res.result && (res.result.data || res.result.messages)) || []))
    // 记录视图的真实后端会话ID
    if (target.convId) { view.convId = target.convId; appState.activeConversationId = target.convId }
    target.roundCount = messages.filter(m => m.role === 'user').length
    try {
      const saved = JSON.parse(localStorage.getItem('dld_conv_rounds_v1') || '{}')
      saved[String(target.convId)] = target.roundCount
      localStorage.setItem('dld_conv_rounds_v1', JSON.stringify(saved))
    } catch (e) {}
    if (!messages.length) {
      // 服务端为空：优先回退本地缓存消息，避免历史"看似被删"
      const cachedEmpty = readCachedMessages(target.convId || target.id)
      if (cachedEmpty.length) {
        view.messages = cachedEmpty
        view.loaded = true
        view.loading = false
        return
      }
      view.messages = []
      view.loaded = true
      view.loading = false
      return
    }
    // 静态消息转换（含报告卡 / 商品预览卡 / 右栏标签恢复），由 historyRestore 完成重活
    const { buildHistoryMessages, restoreHistoryPanel } = await import('./historyRestore')
    const built = buildHistoryMessages(target, messages)
    view.messages = built
    view.loading = false
    view.loaded = true
    // 历史消息落盘：刷新/接口失败后仍可恢复
    writeCachedMessages(target.convId || target.id, built)
    restoreHistoryPanel(target, messages)
  } catch (e) {
    console.warn('[DLD] conversationMessages 失败：', (e as Error).message)
    // 接口失败：回退本地缓存消息兜底
    const cached = readCachedMessages(target.convId || target.id)
    if (cached.length) {
      view.messages = cached
      view.loaded = true
      view.loading = false
      return
    }
    view.loading = false
    view.loaded = false
    view.messages = [makeMessage({ role: 'assistant', content: '', errorText: (e as Error).message, phase: 'error', statusText: '· 失败' })]
  }
}

/* 解析 DLD / Dify 返回的 JSON 结构为统一消息数组（原 extractMessages/normalizeMessage） */
export function extractMessages(rows: any[]): ChatMessage[] {
  const out: ChatMessage[] = []
  rows.forEach((m: any) => out.push(...normalizeMessage(m)))
  return out
}
function normalizeMessage(m: any): ChatMessage[] {
  const toStr = (c: any) => {
    if (typeof c === 'string') return c
    if (c && Array.isArray(c)) return c.filter((x: any) => x.type === 'text').map((x: any) => x.text).join('\n')
    return c == null ? '' : JSON.stringify(c)
  }
  const ts = m.created_at || m.createdAt || m.timestamp || null
  const n = Number(ts)
  const createdAt = (ts && isFinite(n) && n > 0) ? (n > 1e12 ? n : n * 1000) : null
  const mid = m.id || m.message_id || ''
  const role = String(m.role || m.from || '').toLowerCase()
  const q = toStr(m.query || m.question || '')
  const a = toStr(m.answer || m.content || m.text || m.message || '')
  const list: ChatMessage[] = []
  if (role.includes('user') || role.includes('human')) {
    list.push(makeMessage({ id: mid, role: 'user', content: a || q, createdAt }))
  } else if (role.includes('assistant') || role.includes('ai')) {
    list.push(makeMessage({ id: mid, role: 'assistant', content: a || q, createdAt }))
  } else {
    // 问答记录结构：拆成 用户 + AI 两条
    if (q) list.push(makeMessage({ id: mid ? mid + '-q' : '', role: 'user', content: q, createdAt }))
    if (a) list.push(makeMessage({ id: mid ? mid + '-a' : '', role: 'assistant', content: a, createdAt: createdAt != null ? createdAt + 1 : null }))
  }
  return list
}

/* ==================== 会话操作（置顶/重命名/删除） ==================== */
export function togglePin(target: SessionItem) {
  target.pinned = !target.pinned
}

export async function commitRename(target: SessionItem, v: string): Promise<boolean> {
  if (!v || v === target.title) return false
  try {
    if (target.convId) await DLD.renameConversation(target.convId, v)
  } catch (e) {
    window.alert('重命名失败：' + (e as Error).message)
    return false
  }
  target.title = v
  if (chatState.activeConvKey === target.id) chatState.chatTitle = v
  notifyConversationsLoaded(sessionsFor(), true)
  return true
}

export async function deleteConversation(target: SessionItem): Promise<boolean> {
  if (chatState.runningTasks[target.id]) {
    window.alert('该会话正在生成，请先停止并等待任务结束后再删除。')
    return false
  }
  try {
    if (target.convId) await DLD.deleteConversation(target.convId)
  } catch (e) {
    window.alert('删除失败：' + (e as Error).message)
    return false
  }
  try {
    const products = readConversationProducts()
    delete products[target.id]
    if (target.convId) delete products[target.convId]
    localStorage.setItem(PRODUCT_CACHE_KEY, JSON.stringify(products))
    const idMap = readConvIdMap()
    Object.keys(idMap).forEach(key => { if (key === target.id || idMap[key] === target.convId) delete idMap[key] })
    localStorage.setItem(CONV_ID_MAP_KEY, JSON.stringify(idMap))
  } catch (e) { console.warn('[DLD] 删除会话缓存清理失败：', (e as Error).message) }
  // 同步清理本地持久化的消息缓存
  deleteCachedMessages(target.id, target.convId)
  delete chatState.views[target.id]
  const sessions = sessionsFor()
  const idx = sessions.indexOf(target)
  if (idx >= 0) sessions.splice(idx, 1)
  notifyConversationsLoaded(sessions, true)
  if (!sessions.length) {
    newConversation()
    return true
  }
  selectConversation(sessions[0].id)
  return true
}

/* ==================== 停止任务（原 stopTask） ==================== */
export function stopTask(convKey: string) {
  const task = chatState.runningTasks[convKey]
  if (!task || (task as any).stopped) return
  ;(task as any).stopped = true
  if (task.abortController) task.abortController.abort()
  if (task.cancelStream) task.cancelStream()
  if (task.runId && DLD.stopRun) {
    DLD.stopRun(task.runId).catch(e => console.warn('[DLD] stopRun 失败：', (e as Error).message))
  }
  if (task.finishRun) task.finishRun()
  else {
    delete chatState.runningTasks[convKey]
  }
}

/* ==================== 会话搜索过滤 ==================== */
export function sessionBucket(s: SessionItem): string {
  if (s.pinned) return 'pinned'
  const now = new Date()
  const ts = s.timestamp ? new Date(s.timestamp) : null
  if (ts) {
    const diff = (now.getTime() - ts.getTime()) / 1000
    if (diff < 24 * 3600 && now.getDate() === ts.getDate()) return 'today'
    if (diff < 48 * 3600) return 'yesterday'
    const day = (now.getDay() + 6) % 7 // 周一=0
    const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - day)
    if (ts >= start) return 'thisWeek'
    return 'earlier'
  }
  const t = (s.time || '').toLowerCase()
  if (/刚刚|分钟|min|hour|小时前|^今天|^今早/.test(t)) return 'today'
  if (/昨天|yday/.test(t)) return 'yesterday'
  if (/天前/.test(t)) {
    const n = Number((t.match(/(\d+)\s*天前/) || [])[1] || 0)
    if (n <= 6) return 'thisWeek'
  }
  return 'earlier'
}

export const groupedSessions = computed(() => {
  const q = chatState.searchQuery.trim().toLowerCase()
  const list = sessionsFor().filter(s => {
    if (!q) return true
    const title = (s.title || '').toLowerCase()
    const meta = `${s.tag || ''} ${s.time || ''} ${s.roundCount || 0}`.toLowerCase()
    return title.includes(q) || meta.includes(q)
  })
  const groups: Record<string, SessionItem[]> = { pinned: [], today: [], yesterday: [], thisWeek: [], earlier: [] }
  list.forEach(s => groups[sessionBucket(s)].push(s))
  return groups
})

/* ==================== 账号切换后重载会话 ==================== */
export function onAccountSwitched() {
  chatState.activeConvKey = ''
  const sessions = sessionsFor()
  if (!sessions.length) {
    newConversation()
    return
  }
  let lastId = ''
  try { lastId = localStorage.getItem(LAST_OPEN_CONV_KEY + ':' + accountState.currentAccountId) || '' } catch (e) {}
  const target = (lastId && sessions.find(s => String(s.id) === String(lastId) || String(s.convId || '') === String(lastId))) || sessions[0]
  if (target) selectConversation(target.id, { restorePreview: true })
}

// 首次进入：有历史会话时恢复上次打开的会话（刷新 / 重开浏览器后历史不丢），
// 无历史才落在无内容的工作台首页（hero）
export function initialSelect() {
  const sessions = sessionsFor()
  if (!sessions.length) { newConversation(); return }
  let lastId = ''
  try { lastId = localStorage.getItem(LAST_OPEN_CONV_KEY + ':' + accountState.currentAccountId) || '' } catch (e) {}
  const target = (lastId && sessions.find(s => String(s.id) === String(lastId) || String(s.convId || '') === String(lastId))) || sessions[0]
  if (target) { selectConversation(target.id, { restorePreview: true }); return }
  newConversation()
}

/* ==================== 首次会话正式标题刷新（原 syncOfficialConversationTitle） ==================== */
export async function syncOfficialConversationTitle(conversationId: string) {
  if (!conversationId || !DLD.conversations) return
  try {
    const res = await DLD.conversations(null, null, 20)
    const result = (res && res.result) || {}
    const remoteList = Array.isArray(result.list)
      ? result.list
      : (Array.isArray(result.data)
        ? result.data
        : (Array.isArray(result.conversations) ? result.conversations : (Array.isArray(result) ? result : [])))
    const remote = remoteList.find((item: any) => String(item.conversationId || item.id || '') === String(conversationId))
    if (!remote) return
    const officialTitle = String(remote.title || remote.name || '').trim()
    if (!officialTitle) return
    const key = accountState.currentAccountId
    const localList = sessionsFor(key)
    const existing = localList.find(item => String(item.id) === String(conversationId))
    if (existing) {
      existing.title = officialTitle
      existing.time = remote.lastMessageAt ? formatRelativeTime(remote.lastMessageAt) : existing.time
      existing.timestamp = remote.lastMessageAt ? new Date(remote.lastMessageAt).getTime() : existing.timestamp
      existing.draft = false
    } else {
      localList.unshift({ id: conversationId, convId: conversationId, appCode: remote.appCode, title: officialTitle, tag: String(remote.appCode || 'chat').slice(0, 8), time: remote.lastMessageAt ? formatRelativeTime(remote.lastMessageAt) : '刚刚', timestamp: remote.lastMessageAt ? new Date(remote.lastMessageAt).getTime() : Date.now() })
    }
    // 有本地消息缓存的草稿保留（离线创建的历史不丢）
    accountState.sessionsByAccount[key] = localList.filter(item => !item.draft || item.id === conversationId || hasCachedMessages(item.id))
    notifyConversationsLoaded(accountState.sessionsByAccount[key], true)
    if (chatState.activeConvKey === conversationId) chatState.chatTitle = officialTitle
  } catch (e) {
    console.warn('[DLD] 首次会话正式标题刷新失败，保留临时标题：', (e as Error).message)
  }
}

// 报告缓存迁移辅助（adoptConversation 用）
export function migrateDraftCaches(fromKey: string, toKey: string) {
  const draftProducts = getConversationProducts(fromKey)
  if (draftProducts) {
    saveConversationProducts(toKey, draftProducts)
    try {
      const allProducts = readConversationProducts()
      delete allProducts[String(fromKey)]
      localStorage.setItem(PRODUCT_CACHE_KEY, JSON.stringify(allProducts))
    } catch (e) {}
  }
  try {
    const allReports = readConversationReports()
    const src = allReports[String(fromKey)] || []
    if (src.length) {
      const dst = Array.isArray(allReports[String(toKey)]) ? allReports[String(toKey)] : []
      allReports[String(toKey)] = dst.concat(src).slice(-20)
      delete allReports[String(fromKey)]
      localStorage.setItem(REPORT_CACHE_KEY, JSON.stringify(allReports))
    }
  } catch (e) {}
  if (dldLqGet(fromKey)) { dldLqSet(toKey, dldLqGet(fromKey)); dldLqSet(fromKey, '') }
  writeConvIdMap(fromKey, toKey)
  // 消息缓存同步迁移（draft-xxx → conversationId）
  renameCachedMessages(fromKey, toKey)
}

export { getConversationViewMode, flashToast, agentOpening }
