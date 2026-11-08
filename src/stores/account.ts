/* =====================================================
 * 账号状态 + 后端数据接入（原 bootstrapDld）
 * ===================================================== */
import { reactive, computed } from 'vue'
import { DLD } from '../api'
import { appState, Account, SessionItem, ACCOUNT_KEY, writeConvIdMap, readCachedSessions, writeCachedSessions, hasCachedMessages } from './state'
import { formatRelativeTime, flashToast } from '../utils/common'
import { parseAgentOpening } from './opening'

export const accountState = reactive({
  // 单账号制（2026-11-08 拍板：删除主子账号概念）——积分、会员期、订单全部归属当前登录账号
  accounts: [
    { id: 'main-001', name: '雷达用户', role: 'main', roleLabel: '', avatar: '🏬', phone: '176****6666', shop: '', lastActive: '刚刚' }
  ] as Account[],
  currentAccountId: 'main-001',
  sessionsByAccount: {
    'main-001': []
  } as Record<string, SessionItem[]>,
  memberDetailLoaded: false,
  accountSwitching: false
})

export const currentAccount = computed<Account>(() =>
  accountState.accounts.find(a => a.id === accountState.currentAccountId) || accountState.accounts[0]
)

export function sessionsFor(accountId?: string): SessionItem[] {
  const key = accountId || accountState.currentAccountId
  if (!accountState.sessionsByAccount[key]) accountState.sessionsByAccount[key] = []
  return accountState.sessionsByAccount[key]
}

// 账号事件订阅（chat store 注入：会话列表变更后落盘/通知）
let _onAccountSwitched: ((id: string) => void) | null = null
let _onConversationsLoaded: ((list: SessionItem[], skipSelect?: boolean) => void) | null = null
export function setAccountEvents(handlers: {
  onAccountSwitched?: (id: string) => void
  onConversationsLoaded?: (list: SessionItem[], skipSelect?: boolean) => void
}) {
  _onAccountSwitched = handlers.onAccountSwitched || _onAccountSwitched
  _onConversationsLoaded = handlers.onConversationsLoaded || _onConversationsLoaded
}
export function notifyConversationsLoaded(list: SessionItem[], skipSelect?: boolean) {
  // 历史会话本地持久化：每次列表变更都落盘（以 sessionsByAccount 为准），
  // 刷新 / 重开浏览器 / 接口失败时从 localStorage 恢复，历史对话不再丢失。
  const persistKey = accountState.currentAccountId
  writeCachedSessions(persistKey, accountState.sessionsByAccount[persistKey] || list || [])
  if (_onConversationsLoaded) _onConversationsLoaded(list, skipSelect)
}

export function maskPhone(p: string): string {
  return String(p || '').replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2')
}

/* ==================== 后端数据接入（原 bootstrapDld） ==================== */
export async function bootstrapDld() {
  // 0. 恢复上次账号
  try {
    const saved = localStorage.getItem(ACCOUNT_KEY)
    if (saved && accountState.accounts.some(a => a.id === saved)) accountState.currentAccountId = saved
  } catch (e) {}

  // 1. 顶部账号信息
  try {
    const res = await DLD.getMemberDetail()
    const d = res.result || {}
    if (d.loginAccount) {
      const main = accountState.accounts[0]
      // 展示名：后端为空或为占位名时统一显示中性名
      main.name = (!d.loginAccount || d.loginAccount === '主账号') ? '雷达用户' : d.loginAccount
      main.phone = d.mobilePhone ? maskPhone(d.mobilePhone) : main.phone
      appState.dldMember = { ...appState.dldMember, ...d }
    }
  } catch (e) {
    console.debug('[DLD] getMemberDetail 失败 → 保留 mock：', (e as Error).message)
  }

  // 2. 积分余额
  try {
    const res = await DLD.getMemberLimit(0)
    const d = res.result || {}
    if (d.limitNum != null) {
      // 顶部胶囊与积分中心共用同一数据源 TOTAL_COINS，避免两处余额不一致
      const remain = Math.max(0, (d.limitNum || 0) - (d.usedNum || 0))
      appState.totalCoins = remain
    }
  } catch (e) {
    console.debug('[DLD] getMemberLimit 失败 → 保留 mock：', (e as Error).message)
  }

  // 3. 套餐信息
  try {
    const res = await DLD.getMemberVerObj()
    const d = res.result || {}
    appState.dldMember = { ...(appState.dldMember || {}), ...d }
  } catch (e) {
    console.debug('[DLD] getMemberVerObj 失败 → 保留演示套餐：', (e as Error).message)
  }

  // 4. 智能体列表
  try {
    const res = await DLD.chatApps()
    const list = res.result || []
    if (Array.isArray(list) && list.length) {
      appState.dldApps = list
    }
  } catch (e) {
    console.debug('[DLD] chatApps 失败：', (e as Error).message)
  }

  // 5. 会话列表：沿用已验证接口，并兼容 cursor 分页与不同响应包裹层。
  try {
    const allConversations: any[] = []
    let cursor: string | null = null
    for (let page = 0; page < 20; page += 1) {
      const res = await DLD.conversations(null, cursor, 20)
      const r = (res && res.result) || {}
      const list = Array.isArray(r.list) ? r.list : (Array.isArray(r.data) ? r.data : (Array.isArray(r.conversations) ? r.conversations : (Array.isArray(r) ? r : [])))
      allConversations.push(...list)
      const next = r.cursor || r.nextCursor || (r.data && (r.data.cursor || r.data.nextCursor)) || null
      if (!next || !list.length || next === cursor) break
      cursor = next
    }
    const list = allConversations
    appState.dldConversations = list
    if (list.length) {
      const roundsMap = (() => { try { return JSON.parse(localStorage.getItem('dld_conv_rounds_v1') || '{}') } catch (e) { return {} } })()
      const mapped: SessionItem[] = list.map((c: any) => ({
        id: c.conversationId || c.id,
        convId: c.conversationId || c.id,
        appCode: c.appCode || c.app_code,
        title: c.title || c.name || '(无标题)',
        tag: String(c.appCode || c.app_code || 'chat').slice(0, 8),
        roundCount: Number(c.messageCount || c.messagesCount || c.roundCount || c.turnCount || roundsMap[String(c.conversationId || c.id)] || 0) || 0,
        time: (c.lastMessageAt || c.last_message_at) ? formatRelativeTime(c.lastMessageAt || c.last_message_at) : '刚刚',
        timestamp: (c.lastMessageAt || c.last_message_at) ? new Date(c.lastMessageAt || c.last_message_at).getTime() : Date.now()
      })).filter((c: any) => c.id)
      const key = accountState.currentAccountId
      const localSessions = sessionsFor(key) || []
      // 合并本地持久化缓存（离线/接口失败期间创建的会话不丢）
      const cachedSessions = readCachedSessions(key)
      const localIds = new Set(localSessions.map((s: any) => String(s.id)))
      const mergedLocal = [...localSessions, ...cachedSessions.filter((c: any) => c && c.id && !localIds.has(String(c.id)))]
      const mappedIds = new Set(mapped.map(s => String(s.id)))
      // 服务端列表可能有短暂延迟：合并本地刚创建/刚完成的会话 + 有本地消息缓存的历史
      const localOnly = mergedLocal.filter((s: any) => s && s.id && !mappedIds.has(String(s.id)) && (s.draft || s.id === appState.activeConversationId || hasCachedMessages(String(s.id))))
      accountState.sessionsByAccount[key] = [...localOnly, ...mapped]
      // 会话列表落盘时同步写入会话ID持久化映射
      mapped.forEach(s => { if (s.convId) writeConvIdMap(String(s.id), String(s.convId)) })
      notifyConversationsLoaded(mapped, false)
    } else {
      // 服务端为空：恢复本地持久化会话（离线创建的历史不丢）
      const cached = readCachedSessions(accountState.currentAccountId)
      if (cached.length) {
        accountState.sessionsByAccount[accountState.currentAccountId] = cached
        notifyConversationsLoaded(cached, false)
      } else {
        notifyConversationsLoaded([], false)
      }
    }
  } catch (e) {
    console.debug('[DLD] conversations 失败：', (e as Error).message)
    // 接口失败：从本地持久化恢复会话列表兜底，历史对话不再丢失
    const cached = readCachedSessions(accountState.currentAccountId)
    if (cached.length) {
      accountState.sessionsByAccount[accountState.currentAccountId] = cached
      notifyConversationsLoaded(cached, false)
    } else {
      notifyConversationsLoaded([], false)
    }
  }

  // 6. 不在初始化时加载首页榜单，避免覆盖当前会话的真实商品结果。

  // 7. 子账号列表（已废弃：单账号制，2026-11-08 拍板删除主子账号概念，不再拉取 slaveList）
}

export { parseAgentOpening }
