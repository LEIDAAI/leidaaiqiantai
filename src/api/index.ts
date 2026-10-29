/* =====================================================
 * 店雷达 API 客户端（自 index.html L8705-L8945 原样迁移）
 * baseURL:  import.meta.env.VITE_API_BASE_URL
 * 认证:     X-AI-Access-Token（.env 配置，原硬编码 '123456'）
 * 约定:     所有接口返回 { code, msg, result }
 * ===================================================== */

export const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://192.168.1.14/dld'
const TOKEN = import.meta.env.VITE_API_TOKEN || '123456'

const HEADERS: Record<string, string> = {
  'X-AI-Access-Token': TOKEN,
  'Accept': 'application/json'
}

export interface ApiResponse<T = any> {
  code?: number
  msg?: string
  message?: string
  result?: T
  [k: string]: any
}

export interface StreamCallbacks {
  signal?: AbortSignal
  onHeaders?: (h: { conversationId: string | null; requestId: string | null }) => void
  onEvent?: (eventName: string, payload: any) => void
  onDone?: (payload: any) => void
  onError?: (payload: any) => void
  cancel?: (cancelFn: () => void) => void
}

// 流式运行期共享状态：workflow_finished 缓存（可能多个、部分 obsUrl 为空），
// 发送方每次发起前重置，onEvent 处理器向其 push，流结束时 stream() 内部读取。
// （原实现挂 window.__dldWorkflowFinishedEvents，此处收进模块状态，不再留全局。）
export const streamState = {
  workflowFinishedEvents: [] as any[]
}

// ===== 通用 fetch 封装（JSON） =====
export async function request(method: string, path: string, opts: {
  body?: any
  headers?: Record<string, string>
  retry?: boolean
} = {}): Promise<ApiResponse> {
  const url = BASE_URL + path
  const maxAttempts = opts.retry === false ? 1 : 3
  let r!: Response
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const init: RequestInit = {
      method,
      headers: { ...HEADERS, ...(opts.headers || {}) },
      credentials: 'omit',
      mode: 'cors'
    }
    if (opts.body !== undefined) {
      ;(init.headers as Record<string, string>)['Content-Type'] = 'application/json;charset=UTF-8'
      init.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)
    }
    try {
      r = await fetch(url, init)
    } catch (e) {
      if (attempt >= maxAttempts) throw e
      await new Promise(resolve => setTimeout(resolve, 300 * attempt))
      continue
    }
    if (r.status >= 500 && attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 300 * attempt))
      continue
    }
    break
  }
  // 401/403 直接抛错（token 失效）
  if (r.status === 401 || r.status === 403) {
    throw new Error('Access-Token 鉴权失败（HTTP ' + r.status + '）')
  }
  const text = await r.text()
  let data: any
  try { data = JSON.parse(text) } catch (e) {
    throw new Error('接口返回非 JSON：HTTP ' + r.status + '，前 80 字符 = ' + text.slice(0, 80))
  }
  if (data && typeof data === 'object' && 'code' in data && data.code !== 0 && data.code !== 200) {
    throw new Error(data.msg || ('业务错误 code=' + data.code))
  }
  return data
}

// ===== SSE 流式（发起问答专用） =====
// 注意：必须用 fetch + ReadableStream 手写解析（POST 流），不能换 EventSource。
// 结束判定依赖事件名 + 流关闭 + 闲置超时三者，缺一不可。
export async function stream(path: string, body: any, callbacks: StreamCallbacks = {}): Promise<void> {
  const url = BASE_URL + path
  const init: RequestInit = {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
    credentials: 'omit',
    mode: 'cors',
    body: JSON.stringify(body)
  }
  if (callbacks.signal) init.signal = callbacks.signal
  let r!: Response
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      r = await fetch(url, init)
    } catch (e) {
      if (attempt >= 3 || (callbacks.signal && callbacks.signal.aborted)) throw e
      await new Promise(resolve => setTimeout(resolve, 400 * attempt))
      continue
    }
    if (r.status >= 500 && attempt < 3) {
      await new Promise(resolve => setTimeout(resolve, 400 * attempt))
      continue
    }
    break
  }
  const ct = (r.headers.get('Content-Type') || '').toLowerCase()
  const conversationId = r.headers.get('X-AI-Conversation-Id')
  const requestId = r.headers.get('X-AI-Request-Id')
  if (callbacks.onHeaders) callbacks.onHeaders({ conversationId, requestId })
  // 流式失败兜底：服务端把异常包成 JSON 返回（非 text/event-stream），需解析为错误抛出
  if (ct.indexOf('text/event-stream') === -1) {
    const text = await r.text()
    let payload: any
    try { payload = JSON.parse(text) } catch { payload = { msg: text.slice(0, 200) } }
    const msg = (payload && (payload.msg || payload.message || (payload.result && payload.result.msg))) || ('流式请求失败 HTTP ' + r.status)
    if (callbacks.onError) callbacks.onError(payload)
    throw new Error(msg)
  }
  const reader = r.body!.getReader()
  let cancelled = false
  if (callbacks.cancel) callbacks.cancel(() => {
    cancelled = true
    try { reader.cancel() } catch (e) {}
  })
  const decoder = new TextDecoder('utf-8')
  let buf = ''
  let streamDone = false
  let staleTimer: ReturnType<typeof setTimeout> | null = null
  let timedOut = false
  let firstByteSeen = false
  // 2000 条商品工具处理耗时较长；以流的持续活动为准，不用无结果的 EOF 冒充成功。
  const STALE_MS = 180000
  // 首包超时：正常情况下后端 1~2 秒内就会吐出 ping/workflow_started。
  // 后端流处理线程被卡死时会只建会话不发事件（表现为 UI 无限"正在执行"），
  // 25 秒收不到首包即快速失败并给出明确提示，不再傻等 3 分钟。
  const FIRST_BYTE_MS = 25000
  const finish = (payload: any) => {
    if (streamDone || cancelled) return
    streamDone = true
    if (staleTimer) clearTimeout(staleTimer)
    if (callbacks.onDone) callbacks.onDone(payload)
  }
  const resetStale = () => {
    if (staleTimer) clearTimeout(staleTimer)
    staleTimer = setTimeout(() => {
      timedOut = true
      try { reader.cancel() } catch (e) {}
    }, firstByteSeen ? STALE_MS : FIRST_BYTE_MS)
  }
  resetStale()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!firstByteSeen) { firstByteSeen = true; resetStale() }
      resetStale()
      buf += decoder.decode(value, { stream: true })
      // SSE: 以空行分隔事件，事件内 \n 分隔行
      let idx: number
      while ((idx = buf.search(/\r?\n\r?\n/)) !== -1) {
        const evt = buf.slice(0, idx)
        const separator = buf.slice(idx).match(/^\r?\n\r?\n/)![0]
        buf = buf.slice(idx + separator.length)
        const lines = evt.split(/\r?\n/)
        let eventName: string = 'message'
        const dataParts: string[] = []
        for (const line of lines) {
          if (line.startsWith('event:')) eventName = line.slice(6).trim()
          else if (line.startsWith('data:')) dataParts.push(line.slice(5).replace(/^ /, ''))
        }
        const dataStr = dataParts.join('\n').trim()
        if (!dataStr) continue
        let payload: any
        try { payload = JSON.parse(dataStr) } catch { payload = dataStr }
        // Dify 风格：事件名内嵌在 JSON 的 event 字段（SSE 层只有 ping 带 event: 行）
        // 事件名以 JSON 内嵌 event 字段优先，其次 SSE 层 event: 行，最后默认 message。
        if (payload && typeof payload === 'object' && payload.event) {
          eventName = payload.event
        } else if (!eventName) {
          eventName = 'message'
        }
        if (callbacks.onEvent) callbacks.onEvent(eventName, payload)
        const t = String(eventName || '').toLowerCase()
        if (t === 'ping') continue
        if (t === 'workflow_finished') {
          // 先记录完成事件；等 SSE 结束后统一选择带非空 obsUrl 的完成事件，避免空事件覆盖有效结果。
          continue
        }
        if (t === 'done' || t === 'message_end' || t === 'agent_message_end' || t === 'close') {
          finish(payload)
          return
        }
        if (t === 'error') { if (callbacks.onError) callbacks.onError(payload); throw new Error('SSE error') }
      }
    }
    if (cancelled) return
    if (streamState.workflowFinishedEvents.length) {
      finish(streamState.workflowFinishedEvents[streamState.workflowFinishedEvents.length - 1])
      return
    }
    throw new Error(timedOut
      ? (firstByteSeen ? '选品服务长时间未返回数据，已终止等待' : 'AI 服务连接超时：后端已接收请求但持续无响应（流处理可能阻塞），请稍后重试；若反复出现请联系后端重启服务')
      : '选品服务提前断开，未收到完成事件')
  } finally {
    // 取消/异常路径也要清掉超时定时器，避免停止后 onDone 被延迟触发
    if (staleTimer) clearTimeout(staleTimer)
  }
}

// ===== 业务接口 =====
export const DLD = {
  // 顶部账号胶囊
  getMemberDetail: () => request('POST', '/api/members/getMemberDetail'),
  // 顶部积分（type=0=选品库，1=导出，2=监控店铺... 视后端定义）
  getMemberLimit: (limitType: number, useLimit?: number, remarks?: string) =>
    request('POST', '/api/members/getMemberLimit', { body: { limitType, useLimit, remarks } }),
  // 套餐信息
  getMemberVerObj: () => request('GET', '/api/members/getMemberVerObj'),
  // 子账号列表（账号下拉）
  slaveList: () => request('POST', '/api/members/slaveList'),
  // Chatflow 列表（智能体切换）
  chatApps: () => request('GET', '/api/ai/chat/apps'),
  // 会话列表
  conversations: (appCode?: string | null, cursor?: string | null, limit = 20) => {
    const qs = new URLSearchParams()
    if (appCode) qs.set('appCode', appCode)
    if (cursor) qs.set('cursor', cursor)
    qs.set('limit', String(limit))
    return request('GET', '/api/ai/chat/conversations?' + qs.toString())
  },
  // 消息历史
  conversationMessages: (id: string, firstId?: string | null, limit = 20) => {
    const qs = new URLSearchParams()
    if (firstId) qs.set('firstId', firstId)
    qs.set('limit', String(limit))
    return request('GET', '/api/ai/chat/conversations/' + encodeURIComponent(id) + '/messages?' + qs.toString())
  },
  // 改会话标题
  renameConversation: (id: string, title: string) =>
    request('PUT', '/api/ai/chat/conversations/' + encodeURIComponent(id) + '/title', { body: { title } }),
  // 删会话
  deleteConversation: (id: string) =>
    request('DELETE', '/api/ai/chat/conversations/' + encodeURIComponent(id)),
  // 推荐追问（Dify 动态推荐词：/suggested，旧 /suggestions 后端 404 已弃用）
  messageSuggestions: (messageId: string) =>
    request('GET', '/api/ai/chat/messages/' + encodeURIComponent(messageId) + '/suggested'),
  // 发起问答（流式）
  sendMessageStream: (body: any, callbacks: StreamCallbacks) =>
    stream('/api/ai/chat/messages/stream', body, callbacks),
  // 停止生成
  stopRun: (requestId: string) =>
    request('POST', '/api/ai/chat/runs/' + encodeURIComponent(requestId) + '/stop'),
  // 选品库列表（带分页与筛选）
  offerSearchList: (params: any) =>
    request('POST', '/api/offerSearch/queryList', { body: params }),
  // 首页1688选品
  offerSearchHome: (params: any) =>
    request('POST', '/api/offerSearch/queryHomeOfferList', { body: params }),
  // 选品推荐
  offerSearchRecommend: (params: any) =>
    request('POST', '/api/offerSearch/recommend', { body: params })
}
