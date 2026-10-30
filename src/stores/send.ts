/* =====================================================
 * 发送链路（原 send() 函数 + SSE 事件状态机，L7464-L8703）
 * ===================================================== */
import { DLD, streamState } from '../api'
import {
  appState, currentModelDef, computeCost, LAST_OPEN_CONV_KEY, ACTIVE_RESULT_TAB_KEY,
  saveConversationProducts, readConversationProducts, PRODUCT_CACHE_KEY,
  getConversationProducts, readConvIdMap, writeConvIdMap, currentResultConversationId
} from './state'
import {
  chatState, ChatMessage, makeMessage, ensureView, activeView,
  stopTask, syncOfficialConversationTitle, migrateDraftCaches
} from './chat'
import {
  accountState, currentAccount, sessionsFor
} from './account'
import {
  panel, renderOffers, registerResultPreview, ensureProductResultTab, activateResultPreview,
  productPreviewHtml, renderConversationProducts, openProductPreviewCard,
  buildReportDoneCard, renderReportLinkCard, openRemoteReportView, setRightEmpty, openPreviewPanel,
  isReportAnswer, buildLastReport
} from './panel'
import { modals, openWallet } from './modals'
import { flashToast } from '../utils/common'
import {
  parseNestedJson, getWorkflowOutputs, getAnswerEnvelope, loadObsProducts,
  dldIsChitchat, dldHasProductWord, dldLqGet, dldLqSet
} from '../utils/workflow'
import { chatflowProductsToOffers } from '../utils/productFields'
import { renderAiAnswerHtml, extractProductJson, extractSearchKw, setReportHooks } from '../utils/markdown'
import { extract1688Id, generateMockProductData } from '../utils/ali1688Mock'

// —— 报告渲染钩子注入（避免 markdown ↔ panel 循环依赖） ——
setReportHooks({
  isReportAnswer,
  buildLastReport,
  buildReportDoneCard: (rp: any) => buildReportDoneCard(rp || appState.lastReport)
})

// 每条流式消息的定时器（非响应式）
interface MsgTimers {
  statusTimer?: ReturnType<typeof setInterval>
  analyzeTimer?: ReturnType<typeof setInterval>
  rotTimer?: ReturnType<typeof setInterval>
  azFlushTimer?: ReturnType<typeof setTimeout>
  sbTimer?: ReturnType<typeof setTimeout>
}
const msgTimers = new Map<string, MsgTimers>()

const AZ_STEPS = [
  { key: 'plan', label: '理解需求', desc: '正在解析您的选品条件', kw: /理解|需求|规划|任务|目标|思路|意图|understand|user is asking|request|goal|intent/i },
  { key: 'search', label: '检索数据', desc: '正在检索 1688 商品库', kw: /检索|搜索|查询|调用|选品|1688|采集|获取|search|tool|retriev|fetch|look up|collect/i },
  { key: 'judge', label: '分析对比', desc: '正在核对销量与复购表现', kw: /筛选|过滤|对比|评估|分析|价格|销量|转化|竞争|维度|filter|compar|evaluat|analyz|rank|score|criteria|sales|review/i },
  { key: 'build', label: '生成结果', desc: '正在汇总分析结果', kw: /整理|汇总|生成|输出|报告|表格|结论|推荐|编制|summar|organi|format|table|report|final|conclusion|recommend|present/i }
]
// 工作流节点名 → 阶段映射
const AZ_NODE_MAP = [
  { idx: 0, kw: /输入|开始|意图|理解|解析|分类|路由|接入/i },
  { idx: 1, kw: /检索|搜索|查询|工具|调用|采集|获取|插件|数据源|1688|api/i },
  { idx: 2, kw: /分析|对比|筛选|评估|排序|评分|推理|模型|llm|代码|计算|处理/i },
  { idx: 3, kw: /生成|汇总|输出|回复|渲染|报告|结果|结束|模板|整理/i }
]
function mapNodeToStage(title: string): number {
  for (const m of AZ_NODE_MAP) { if (m.kw.test(title)) return m.idx }
  return -1
}
// 各阶段轮播动作文案
const AZ_ACTIONS = [
  ['解析选品需求中', '识别关键词与筛选条件', '提取价格区间与起批量要求', '确认时间周期与排序偏好'],
  ['正在检索 1688 商品库', '按类目匹配候选商品', '拉取商品基础信息与主图', '采集销量与价格数据'],
  ['计算销量趋势与复购率', '对比批发价与代发价区间', '校验发货时效与买家保障', '评估店铺综合服务能力'],
  ['按综合指标排序商品', '生成选品对比表格', '整理分析结论与建议']
]
// 时长格式化：1 分钟内显示「12.3s」，超过显示「1分23秒」
const fmtDur = (ms: number) => ms < 60000
  ? ((ms / 1000).toFixed(1).replace(/\.0$/, '')) + 's'
  : Math.floor(ms / 60000) + '分' + Math.round((ms % 60000) / 1000) + '秒'
// 从推理文本推断当前阶段：取关键词最后命中位置最大的阶段
function inferStage(txt: string): number {
  let best = 0, pos = -1
  AZ_STEPS.forEach((s, i) => {
    const m = s.kw.exec(txt)
    if (m) { const p = txt.lastIndexOf(m[0]); if (p > pos) { pos = p; best = i } }
  })
  return best
}
const IDLE_HINTS = [
  '正在检索 1688 商品库…',
  '正在核对销量与复购表现…',
  '正在汇总分析结果…',
  '数据量较大，仍在努力处理中，请稍候…'
]

// 剥离 <think>…</think> 与未闭合的 <think>…，只保留可见正文
function visibleAnswer(s: string): string {
  let t = s.replace(/<think>[\s\S]*?<\/think>/g, '')
  const i = t.indexOf('<think>')
  if (i >= 0) t = t.slice(0, i)
  return t
}
const inThink = (s: string) => s.includes('<think>') && s.lastIndexOf('<think>') > s.lastIndexOf('</think>')

/* ==================== 发送 ==================== */
export async function send(regenerate = false, silent = false, silentUi: any = null) {
  const isSilent = Boolean(silent)
  if (!isSilent) appState.autoReport = null
  appState.initialPreviewGuard = false
  const text = chatState.inputText.trim()
  if (!text && chatState.attaches.length === 0) return

  // 1688商品链接/ID自动识别
  const productId = extract1688Id(text)
  if (productId) {
    // 确定目标会话 key
    let convKey = chatState.activeConvKey
    if (convKey && String(convKey).startsWith('draft-')) {
      try {
        const draftView = chatState.views[convKey]
        const hasDraftMsgs = !!(draftView && draftView.messages.length)
        const lastOpen = String(localStorage.getItem(LAST_OPEN_CONV_KEY + ':' + currentAccount.value.id) || '').trim()
        if (!hasDraftMsgs && draftView && !draftView.explicitNew && lastOpen && !lastOpen.startsWith('draft-')) {
          convKey = lastOpen
          chatState.activeConvKey = lastOpen
          writeConvIdMap(lastOpen, lastOpen)
        }
      } catch (e) {}
    }
    if (!convKey) {
      convKey = 'draft-' + Date.now() + '-' + (++chatState.draftSeq)
      chatState.activeConvKey = convKey
      ensureView(convKey)
    }

    const view = ensureView(convKey)
    view.loaded = true

    // 构建用户消息
    const userMsg = makeMessage({ role: 'user', content: text })
    view.messages.push(userMsg)

    // 清空输入
    chatState.inputText = ''

    // 创建AI消息并直接填充商品数据
    const ai = makeMessage({ role: 'assistant', content: '', phase: 'done', statusText: '· 已完成' })
    ai.ali1688Product = generateMockProductData(productId)
    view.messages.push(ai)

    // 滚动到底部
    scrollBottomCb()
    return
  }

  // 确定目标会话 key
  let convKey = chatState.activeConvKey
  // 刷新后直接在"新建对话"草稿里发言：自动续接上次会话（显式"＋新建对话"不受影响）
  if (convKey && String(convKey).startsWith('draft-')) {
    try {
      const draftView = chatState.views[convKey]
      const hasDraftMsgs = !!(draftView && draftView.messages.length)
      const lastOpen = String(localStorage.getItem(LAST_OPEN_CONV_KEY + ':' + currentAccount.value.id) || '').trim()
      if (!hasDraftMsgs && draftView && !draftView.explicitNew && lastOpen && !lastOpen.startsWith('draft-')) {
        convKey = lastOpen
        chatState.activeConvKey = lastOpen
        writeConvIdMap(lastOpen, lastOpen)
      }
    } catch (e) {}
  }
  if (!convKey) {
    convKey = 'draft-' + Date.now() + '-' + (++chatState.draftSeq)
    chatState.activeConvKey = convKey
    ensureView(convKey)
  }
  // 按会话隔离的运行锁
  if (chatState.runningTasks[convKey]) {
    flashToast('当前对话正在生成，请等待完成或先停止生成')
    return
  }
  const view = ensureView(convKey)
  const estimatedCost = computeCost(text, chatState.attaches.length).coins
  if (appState.totalCoins < estimatedCost) {
    openWallet()
    modals.walletRunsTip = `余额不足，本次预计需要 ${estimatedCost} 积分，请先充值。`
    return
  }
  const abortController = new AbortController()
  const task: any = { runId: null, startedAt: Date.now(), abortController, stopped: false }
  chatState.runningTasks[convKey] = task
  chatState.lastQuery = text
  const activeSession = sessionsFor().find(s => s.id === convKey)
  if (activeSession) { activeSession.roundCount = Number(activeSession.roundCount || 0) + 1 }
  // 导出文件名使用当前轮次原始提问
  appState.currentExportQuery = text
  appState.currentResultQuery = text
  // 上下文兜底：本轮无商品词且非闲聊时，拼接上一轮商品词后发送
  let outgoingText = text
  if (dldHasProductWord(text)) {
    dldLqSet(convKey, text)
  } else if (!dldIsChitchat(text)) {
    const lastQ = dldLqGet(convKey)
    if (lastQ) outgoingText = lastQ + '，' + text
  }
  view.loaded = true

  // 构建用户消息
  const attachSnap = chatState.attaches.map(a => ({ name: a.name, size: a.size, ext: a.ext, type: a.type, icon: a.icon }))
  const userMsg = makeMessage({ role: 'user', content: text || '(无文本，仅附件)', attachments: attachSnap })
  if (!isSilent) view.messages.push(userMsg)
  else if (silentUi && silentUi.insertUserAfter !== false) { /* 静默补检索：不加用户气泡 */ }

  // 发送后清空输入与附件
  const attachCount = chatState.attaches.length
  chatState.attaches = []
  chatState.inputText = ''

  // 静默补检索复用首轮报告气泡
  let ai: ChatMessage
  if (isSilent && silentUi && silentUi.ai) {
    ai = silentUi.ai
  } else {
    ai = makeMessage({ role: 'assistant', content: '', statusText: '· 正在执行' })
    view.messages.push(ai)
  }

  const isReportRequest = /报告|调研|研究|分析/.test(text) && /\d+\s*(条|款|个|件)?/.test(text)
  if (isReportRequest) {
    ai.reportTask = { step: 1, note: '正在准备报告所需的数据样本' }
  }

  // —— 流式运行期可变状态 ——
  let accAnswer = ''
  let responseMessageId: string | null = null
  let workflowFinished: any = null
  streamState.workflowFinishedEvents = [] // 兼容同一 SSE 中多条完成事件

  const setLiveStatus = (txt: string) => {
    ai.liveStatus = { text: txt, elapsed: ai.liveStatus?.elapsed || 0 }
  }
  let lastActivity = Date.now()
  let hintIdx = 0, idleTicks = 0
  const ensureLiveStatus = (initTxt: string) => {
    if (ai.liveStatus || ai.analyze || runEnded) return
    ai.analyze = null
    setLiveStatus(initTxt)
    const timers = getTimers(ai.id)
    const start = Date.now()
    if (timers.statusTimer) clearInterval(timers.statusTimer)
    timers.statusTimer = setInterval(() => {
      if (!ai.liveStatus) return
      ai.liveStatus.elapsed = Math.round((Date.now() - start) / 1000)
      if (Date.now() - lastActivity > 3500) {
        idleTicks++
        if (idleTicks % 4 === 1) {
          const txt = IDLE_HINTS[(hintIdx++) % IDLE_HINTS.length]
          ai.liveStatus = { text: txt, elapsed: ai.liveStatus.elapsed }
        }
      } else {
        idleTicks = 0
        ai.liveStatus = { text: '正在接收回复…', elapsed: ai.liveStatus.elapsed }
      }
    }, 1000)
  }
  const removeLiveStatus = () => {
    const timers = getTimers(ai.id)
    if (timers.statusTimer) { clearInterval(timers.statusTimer); timers.statusTimer = undefined }
    ai.liveStatus = null
  }
  function getTimers(id: string): MsgTimers {
    if (!msgTimers.has(id)) msgTimers.set(id, {})
    return msgTimers.get(id)!
  }

  // —— 分析进度卡 ——
  const applyStage = (idx: number) => {
    if (!ai.analyze) return
    ai.analyze.stepIdx = idx
    if (!ai.analyze.customStage) {
      const acts = AZ_ACTIONS[idx] || AZ_ACTIONS[0]
      ai.analyze.stageText = acts[0]
    }
  }
  const forceStage = (idx: number) => {
    if (!ai.analyze || idx <= ai.analyze.stepIdx) return
    applyStage(idx)
  }
  const showAnalyze = () => {
    if (ai.reportTask || ai.analyze) return
    removeLiveStatus()
    const kw = extractSearchKw(outgoingText || text)
    ai.analyze = {
      stepIdx: 0, customStage: false, stageText: AZ_ACTIONS[0][0], subKw: kw,
      elapsed: 0, hint: false, done: false, doneText: ''
    }
    const startTs = Date.now()
    const timers = getTimers(ai.id)
    let lastSignalTs = Date.now()
    ;(ai.analyze as any)._lastSignalTs = lastSignalTs
    ;(ai.analyze as any)._startTs = startTs
    ;(ai.analyze as any)._rotIdx = 0
    timers.analyzeTimer = setInterval(() => {
      const st: any = ai.analyze
      if (!st || st.done) return
      st.elapsed = Math.round((Date.now() - st._startTs) / 1000)
      // 30 秒预期管理
      if (!st.hint && Date.now() - st._startTs > 30000) st.hint = true
      // 计时兜底：超过 8 秒无任何真实信号 → 强制推进下一阶段
      if (st.stepIdx < AZ_STEPS.length - 1 && Date.now() - st._lastSignalTs > 8000) {
        forceStage(st.stepIdx + 1)
        st._lastSignalTs = Date.now()
      }
    }, 1000)
    // 阶段动作文案轮播：每 3s 切换一条
    timers.rotTimer = setInterval(() => {
      const st: any = ai.analyze
      if (!st || st.done) return
      const acts = AZ_ACTIONS[st.stepIdx] || AZ_ACTIONS[0]
      st._rotIdx = ((st._rotIdx || 0) + 1) % acts.length
      if (!st.customStage) st.stageText = acts[st._rotIdx]
    }, 3000)
  }
  const updateAnalyze = (thinkTxt: string) => {
    const st: any = ai.analyze
    if (!st || !thinkTxt) return
    st._lastSignalTs = Date.now()
    const timers = getTimers(ai.id)
    if (timers.azFlushTimer) return
    timers.azFlushTimer = setTimeout(() => {
      timers.azFlushTimer = undefined
      const st2: any = ai.analyze
      if (!st2) return
      const clean = String(thinkTxt).replace(/<!--[\s\S]*?-->/g, '')
      const idx = inferStage(clean.slice(-1200))
      if (idx > st2.stepIdx) forceStage(idx)
    }, 120)
  }
  const collapseAnalyze = () => {
    const st: any = ai.analyze
    if (st && !st.done) {
      st.done = true
      const total = Date.now() - st._startTs
      st.doneText = '选品分析完成 · ' + fmtDur(total)
      const timers = getTimers(ai.id)
      if (timers.analyzeTimer) { clearInterval(timers.analyzeTimer); timers.analyzeTimer = undefined }
      if (timers.rotTimer) { clearInterval(timers.rotTimer); timers.rotTimer = undefined }
    }
    // 完成态保留一行可回看
  }
  const discardAnalyze = () => {
    const timers = getTimers(ai.id)
    if (timers.azFlushTimer) { clearTimeout(timers.azFlushTimer); timers.azFlushTimer = undefined }
    if (timers.analyzeTimer) { clearInterval(timers.analyzeTimer); timers.analyzeTimer = undefined }
    if (timers.rotTimer) { clearInterval(timers.rotTimer); timers.rotTimer = undefined }
    ai.analyze = null
    ai.skeleton = null
  }
  const updateReportTask = (step: number, note: string) => {
    ai.analyze = null // 报告任务只保留一张专用卡
    if (!ai.reportTask) ai.reportTask = { step, note }
    else { ai.reportTask.step = step; ai.reportTask.note = note }
  }

  // —— 滚动回调（由 App 层注入，模块级 setScrollBottom） ——
  const scrollBottomSoon = () => {
    const timers = getTimers(ai.id)
    if (timers.sbTimer) return
    timers.sbTimer = setTimeout(() => { timers.sbTimer = undefined; scrollBottomCb() }, 120)
  }
  const bumpActivity = () => { lastActivity = Date.now() }

  // —— 流式增量（原 appendDelta） ——
  const appendDelta = (delta: string) => {
    if (!delta) return
    accAnswer += delta
    bumpActivity()
    // 负载到达信号：正文里出现商品 JSON → 直接推进"生成结果"末阶段
    if (/\{\s*"(?:schema_version|answer|obsUrl|totalCount|products)"\s*:/.test(accAnswer)) forceStage(3)
    // 分析阶段（think 未闭合）：推理内容实时进进度卡片
    if (inThink(accAnswer)) {
      if (isReportRequest) updateReportTask(1, '正在准备报告所需的数据样本')
      else showAnalyze()
      const ti = accAnswer.lastIndexOf('<think>')
      if (ti >= 0) updateAnalyze(accAnswer.slice(ti + 7))
      return
    }
    const vis = visibleAnswer(accAnswer)
    // 报告指令是前端协议，流式阶段不能闪现原始 JSON
    if (/\{\s*"action"\s*:\s*"report"/.test(vis)) { scrollBottomSoon(); return }
    if (!vis.trim()) { scrollBottomSoon(); return }
    collapseAnalyze()
    // 截断点二选一：① 商品 JSON 载荷开始 ② markdown 表格开始
    const jsonMatch = /\{\s*"(?:schema_version|answer|obsUrl|totalCount|products)"\s*:/.exec(vis)
    let jsonIdx = jsonMatch ? jsonMatch.index : -1
    if (jsonIdx < 0) {
      const partial = /\{\s*"[A-Za-z_]{0,16}$/.exec(vis)
      if (partial) jsonIdx = partial.index
    }
    const tableIdx = vis.search(/^[ \t]*\|/m)
    const isPayload = jsonIdx >= 0 && (tableIdx < 0 || jsonIdx < tableIdx)
    const cutIdx = isPayload ? jsonIdx : tableIdx
    if (cutIdx >= 0) {
      const before = vis.slice(0, cutIdx)
      if (ai.liveText !== before) ai.liveText = before
      removeLiveStatus()
      // 预期条数：从正文"共 N 件/条/个/款"提取；已接收：JSON 按去重商品链接数 / 表格按数据行数
      const totalMatches = before.match(/共\s*[\d,]+\s*(?:件|条|个|款)/g)
      const expected = totalMatches ? parseInt(totalMatches[totalMatches.length - 1].replace(/[^\d]/g, ''), 10) || 0 : 0
      const got = isPayload
        ? new Set(accAnswer.match(/detail\.1688\.com\/offer\/\d+/g) || []).size
        : Math.max(0, ((vis.slice(cutIdx).match(/^[ \t]*\|.+/gm) || []).length) - 2)
      if (!ai.skeleton) {
        ai.skeleton = { pct: null, eta: '', indeterminate: true }
      }
      if (expected > 0) {
        const pct = Math.min(98, Math.round(got / expected * 100))
        ai.skeleton.indeterminate = false
        ai.skeleton.pct = Math.max(4, pct)
        ai.skeleton.eta = pct >= 98 ? '即将完成…' : '已完成约 ' + pct + '%'
      } else {
        ai.skeleton.indeterminate = true
        ai.skeleton.eta = ''
      }
    } else {
      if (ai.liveText !== vis) ai.liveText = vis
    }
    scrollBottomSoon()
  }

  let runEnded = false
  const finishRun = (preserveAutoReport = false) => {
    delete chatState.runningTasks[convKey]
    if (!preserveAutoReport) appState.autoReport = null
    const timers = getTimers(ai.id)
    if (timers.sbTimer) { clearTimeout(timers.sbTimer); timers.sbTimer = undefined }
  }
  const showError = (msg: string) => {
    runEnded = true
    ai.phase = 'error'
    ai.statusText = '· 失败'
    if (ai.reportTask) {
      ai.reportTask.failed = String(msg || '服务连接超时，请稍后重试')
    } else {
      ai.errorText = msg
    }
    removeLiveStatus()
    discardAnalyze()
  }

  // ── 草稿转正式会话（原 adoptConversation） ──
  const adoptConversation = (conversationId: string) => {
    if (!conversationId) return
    writeConvIdMap(convKey, conversationId)
    const sess = sessionsFor().find(s => s.id === convKey)
    if (sess && !sess.convId) sess.convId = conversationId
    if (convId || convKey === conversationId) return
    const title = text.slice(0, 24) + (text.length > 24 ? '…' : '')
    // 先迁移注册表与视图缓冲（draft-xxx → conversationId）
    migrateDraftCaches(convKey, conversationId)
    const v = chatState.views[convKey]
    if (v) { delete chatState.views[convKey]; v.key = conversationId; v.convId = conversationId; chatState.views[conversationId] = v }
    if (task) { delete chatState.runningTasks[convKey]; chatState.runningTasks[conversationId] = task }
    if (chatState.activeConvKey === convKey) {
      chatState.activeConvKey = conversationId
      try { localStorage.setItem(LAST_OPEN_CONV_KEY + ':' + currentAccount.value.id, String(conversationId)) } catch (e) {}
    }
    const key = currentAccount.value.id
    const list = sessionsFor(key)
    const newList = list.filter(s => s.id !== convKey && !s.draft)
    newList.unshift({ id: conversationId, convId: conversationId, appCode, title, tag: appCode, time: '刚刚', timestamp: Date.now() })
    accountState.sessionsByAccount[key] = newList
    convKey = conversationId
    view.key = conversationId
    // 消息对象里的 ai.id 不变，msgTimers 仍可用
    if (chatState.activeConvKey === conversationId) chatState.chatTitle = title
  }

  let convIdFromHeader: string | null = null
  if (task) task.finishRun = finishRun
  const activeSess = sessionsFor().find(s => s.id === convKey)
  let convId = activeSess && activeSess.convId ? activeSess.convId : ''
  if (!convId) {
    try {
      const idMap = readConvIdMap()
      convId = idMap[String(convKey)] || ''
      if (convId && activeSess) activeSess.convId = convId
    } catch (e) {}
  }
  // 兜底：当前视图已加载真实历史且仍是活跃会话时，复用该后端会话ID
  if (!convId && !String(convKey).startsWith('draft-') && appState.activeConversationId
      && String(appState.activeConversationId) === String(chatState.activeConvKey)) {
    convId = String(appState.activeConversationId)
    if (activeSess) activeSess.convId = convId
    writeConvIdMap(String(convKey), convId)
  }
  const appCode = (appState.dldApps[0] && appState.dldApps[0].appCode) || '1'
  const clientRequestId = 'dld-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)

  // 报告指令提取（原 extractReportDirective）
  const extractReportDirective = (raw: string): any => {
    const s = String(raw || '')
    const keyIdx = s.lastIndexOf('"action"')
    if (keyIdx < 0 || !/^"action"\s*:\s*"report"/.test(s.slice(keyIdx, keyIdx + 40))) return null
    const objStart = s.lastIndexOf('{', keyIdx)
    if (objStart < 0) return null
    let depth = 0, inStr = false, esc = false, end = -1
    for (let i = objStart; i < s.length; i++) {
      const ch = s[i]
      if (esc) { esc = false; continue }
      if (ch === '\\') { esc = true; continue }
      if (ch === '"') inStr = !inStr
      if (inStr) continue
      if (ch === '{') depth += 1
      else if (ch === '}') { depth -= 1; if (depth === 0) { end = i; break } }
    }
    if (end <= objStart) return null
    try {
      const parsed = JSON.parse(s.slice(objStart, end + 1))
      return parsed && parsed.action === 'report' ? parsed : null
    } catch (e) { return null }
  }

  // 查询完成后补拉结构化商品（原 loadOffersForQuery）
  const loadOffersForQuery = async (query: string, convKey2: string, options: any = {}) => {
    const q = String(query || '').trim()
    if (!q) return
    const tsk = chatState.runningTasks[convKey2]
    if (tsk) tsk.offersLoading = true
    const queryBody = {
      pageIndex: 1,
      pageSize: 20,
      sortField: 'saleQuantity30d',
      sortType: 'desc',
      query: { keyWord: q, sourceType: 1, cycle: 30 }
    }
    try {
      let res: any
      let lastError: any
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          res = await DLD.offerSearchList(queryBody)
          break
        } catch (error) {
          lastError = error
          if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 800))
        }
      }
      if (!res) throw lastError || new Error('商品列表接口无响应')
      const result = (res && res.result) || {}
      const rawList = Array.isArray(result.list) ? result.list : []
      const titleText = (item: any) => String(item.title || item.subject || '').toLowerCase()
      const coreQuery = q
        .replace(/近?\d+天|上架|跨境|热销|爆款|新品|新款|推荐|帮我找|搜索|查找|找/g, '')
        .replace(/[，。；、,.;：:！？!?\s]+/g, '')
        .trim()
        .toLowerCase()
      let matchedList = coreQuery ? rawList.filter((item: any) => titleText(item).includes(coreQuery)) : rawList
      const adaptOffer = (o: any) => {
        if (!o || typeof o !== 'object') return o
        const st = Array.isArray(o.shiLiType) ? o.shiLiType : []
        return {
          ...o,
          saleCount30d: o.saleCount30d ?? o.saleQuantity30d ?? o.saleCount ?? 0,
          bookedCount30d: o.bookedCount30d ?? o.bookedCount ?? 0,
          isFactory: o.isFactory != null ? !!o.isFactory : st.includes('superFactory'),
          isPower: o.isPower != null ? !!o.isPower : st.includes('Power'),
          imageUrl: o.imageUrl || o.picUrl || o.image || ''
        }
      }
      matchedList = matchedList.map(adaptOffer)
      if (matchedList.length) {
        const fullRoundKey = options.roundKey || responseMessageId || ('round-' + q)
        saveConversationProducts(convKey2, {
          products: matchedList, count: matchedList.length, totalCount: matchedList.length,
          query: q, conversationId: convKey2, messageId: fullRoundKey
        }, fullRoundKey)
      }
      // 右侧正在展示报告时，任何商品补拉都不得抢屏
      const reportShowing = panel.reportView.visible && panel.reportView.mode !== 'none'
      if (matchedList.length && !options.skipRender && !reportShowing) {
        renderOffers(matchedList, { ...result, totalCount: matchedList.length, resultKey: options.resultKey || '', resultPayload: { products: matchedList, count: matchedList.length, query: q, conversationId: appState.activeConversationId || convKey2, messageId: options.roundKey || '' }, queryTitle: q })
      }
    } catch (e) {
      console.warn('[DLD] 查询商品展示失败：', (e as Error).message)
    } finally {
      const currentTask = chatState.runningTasks[convKey2]
      if (currentTask) currentTask.offersLoading = false
    }
  }

  try {
    // 发送瞬间立即显示分析卡
    if (!isReportRequest) showAnalyze()
    await DLD.sendMessageStream({
      appCode,
      conversationId: convId || '',
      clientRequestId,
      query: outgoingText,
      fileIds: []
    }, {
      signal: task && task.abortController ? task.abortController.signal : undefined,
      cancel: cancelStream => {
        const currentTask: any = chatState.runningTasks[convKey]
        if (currentTask) currentTask.cancelStream = cancelStream
      },
      onHeaders: ({ conversationId, requestId }) => {
        convIdFromHeader = conversationId
        adoptConversation(conversationId || '')
        const currentTask: any = chatState.runningTasks[convKey]
        if (currentTask) {
          currentTask.runId = requestId || null
          if (currentTask.stopped && currentTask.runId && DLD.stopRun) {
            DLD.stopRun(currentTask.runId).catch(e => console.warn('[DLD] stopRun 失败：', (e as Error).message))
          }
        }
        ai.statusText = '· 流式中'
      },
      onEvent: (eventName, payload) => {
        const t = String(eventName || '').toLowerCase()
        if (payload && typeof payload === 'object') {
          responseMessageId = payload.message_id || payload.messageId || (payload.data && payload.data.message_id) || responseMessageId
        }
        // 会话ID兜底：从首个携带 conversation_id 的 SSE 事件提取
        if (!convId && !convIdFromHeader && payload && typeof payload === 'object' && payload.conversation_id) {
          convIdFromHeader = payload.conversation_id
          adoptConversation(payload.conversation_id)
        }
        if (t === 'connected') { ai.statusText = '· 已连接'; ensureLiveStatus('已连接，正在理解需求…'); return }
        if (t === 'error') { showError(typeof payload === 'string' ? payload : (payload && payload.message) || '流式错误'); return }
        if (t === 'agent_thought' || t === 'workflow_started' || t === 'node_started') {
          if (isReportRequest) updateReportTask(1, '正在准备报告所需的数据样本')
          else showAnalyze()
          if (payload && typeof payload === 'object') {
            const nodeTitle = String(payload.title || (payload.data && payload.data.title) || payload.node_title || '').trim()
            if (nodeTitle) {
              const mapped = mapNodeToStage(nodeTitle)
              if (mapped >= 0) {
                forceStage(mapped)
              } else if (ai.analyze && nodeTitle.length >= 4 && !/^(agent|ai|workflow|node|llm|chat)$/i.test(nodeTitle)) {
                ai.analyze.customStage = true
                ai.analyze.stageText = nodeTitle.slice(0, 30)
              }
              const st: any = ai.analyze
              if (st) st._lastSignalTs = Date.now()
            }
            const thoughtTxt = [payload.thought, payload.observation ? String(payload.observation).slice(0, 200) : '']
              .filter(Boolean).join('\n')
            if (thoughtTxt) { updateAnalyze(thoughtTxt); const st: any = ai.analyze; if (st) st._lastSignalTs = Date.now() }
          }
          return
        }
        if (t === 'workflow_finished') {
          streamState.workflowFinishedEvents.push(payload)
          workflowFinished = payload
          if (payload && typeof payload === 'object') { const st: any = ai.analyze; if (st) st._lastSignalTs = Date.now() }
          return
        }
        if (t === 'node_finished') {
          const st: any = ai.analyze
          if (st) st._lastSignalTs = Date.now()
          return
        }
        // 文本事件：把 answer / delta / text 字段作为增量
        let delta: any = null
        if (payload && typeof payload === 'object') {
          delta = payload.answer ?? payload.delta ?? payload.text ?? payload.content ?? null
          if (!delta && payload.data && typeof payload.data === 'object') {
            delta = payload.data.text ?? payload.data.answer ?? null
          }
          if (Array.isArray(delta)) {
            delta = delta.filter((c: any) => c && (c.type === 'text' || c.type === 'message')).map((c: any) => c.text || c.message || '').join('')
          }
        } else if (typeof payload === 'string') {
          delta = payload
        }
        if (delta) appendDelta(delta)
      },
      onDone: async (endPayload) => {
        runEnded = true
        removeLiveStatus()
        // 报告指令分支
        let directive = extractReportDirective(accAnswer)
        if (!directive) directive = extractReportDirective(String(accAnswer || '').replace(/\\"/g, '"'))
        if (!directive) {
          try {
            const whole = JSON.parse(String(accAnswer || ''))
            if (whole && whole.action === 'report') directive = whole
          } catch (e) {}
        }
        const pendingAutoReport = appState.autoReport
        if (directive) {
          let repTitle = String(directive.title || '').trim() || String(appState.currentResultQuery || '').trim() || '选品报告'
          if (!repTitle || /^(生成|做|来份|帮我生成)?(一份)?(选品|决策|商品|跨境)?(分析)?报告$/.test(repTitle) || /^生成报告/.test(repTitle)) {
            const convTitle = String(chatState.chatTitle || '').trim()
            const cleaned = convTitle
              .replace(/(分析报告|选品报告|决策报告|商品分析|的?报告|分析|选品)/g, '')
              .replace(/^(帮我|请|我要|我想要|来份|生成|做)/, '')
              .trim()
            if (cleaned) repTitle = cleaned
          }
          if (!repTitle) repTitle = '选品报告'
          // OBS 链接依次回退：本轮运行态 → 会话商品缓存顶层 → 任一轮次缓存
          let repObs = (appState.lastPayloadNode && appState.lastPayloadNode.obsUrl) || ''
          let cachedQuery = '', cachedCount = 0
          try {
            const cachedConv = getConversationProducts(convIdFromHeader || convKey || currentResultConversationId())
            if (cachedConv) {
              cachedQuery = String(cachedConv.query || '').trim()
              cachedCount = Number(cachedConv.count) || 0
              if (!repObs) repObs = String(cachedConv.obsUrl || '').trim()
              if (!repObs && Array.isArray(cachedConv.rounds)) {
                repObs = cachedConv.rounds.map((r: any) => String(r.obsUrl || '')).find(Boolean) || ''
              }
            }
          } catch (e) {}
          const reportSampleCount = Number(directive.pageSize || 0) || cachedCount
          if (!repObs) {
            // 缺样本时自动补一次检索
            const synthesized = /\d+\s*(条|个|款|件)/.test(repTitle)
              ? ('搜索' + repTitle + '商品')
              : (reportSampleCount
                ? ('搜索' + reportSampleCount + '款' + repTitle + '商品')
                : (repTitle && repTitle !== '选品报告' ? '搜索10款' + repTitle + '商品' : ''))
            const prevAttempt = (pendingAutoReport && Number(pendingAutoReport.attempt || 0)) || 0
            let searchQuery = String(directive.searchQuery || directive.query || directive.keyword || directive.search
              || cachedQuery || synthesized || appState.currentResultQuery || '').trim()
            if (searchQuery && pendingAutoReport && prevAttempt === 1) {
              searchQuery = '在1688搜索' + repTitle + '，按近30天销量排序，返回商品列表'
            }
            if (searchQuery && (!pendingAutoReport || prevAttempt < 2)) {
              const sampleN = reportSampleCount || Number(pendingAutoReport && pendingAutoReport.pageSize) || 10
              updateReportTask(1, '正在准备 ' + sampleN.toLocaleString('zh-CN') + ' 条「' + repTitle + '」样本')
              finishRun()
              appState.autoReport = { title: repTitle, pageSize: sampleN, searchQuery, attempt: prevAttempt + 1, ai }
              chatState.inputText = searchQuery
              send(false, true, appState.autoReport)
              return
            }
            ai.phase = 'done'
            ai.statusText = '· 已完成'
            ai.finalHtml = renderAiAnswerHtml(pendingAutoReport
              ? '报告样本检索连续未成功，自动生成已中止。请先手动发送一次商品搜索（如"搜索外套"），出结果后再对我说"生成报告"。'
              : '暂时没有可生成报告的检索结果。请先发送一次商品搜索（如"近30天销量最高的儿童书包"），成功后再对我说"生成报告"。')
            finishRun()
            scrollBottomCb()
            return
          }
          ai.statusText = '· 生成报告中'
          updateReportTask(3, '正在整合数据并生成报告')
          scrollBottomCb()
          try {
            // 官方报告接口：HTTP 恒为 200，业务码成功为 200，result 为纯字符串报告链接
            const reportEndpoints = [
              'https://yidong.dianleida.net:20007/dld/api/ai/chat/reports',
              'http://192.168.1.14/dld/api/ai/chat/reports'
            ]
            let reportData: any = null, reportErr = ''
            for (const endpoint of reportEndpoints) {
              try {
                const resp = await fetch(endpoint, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'X-AI-Access-Token': (import.meta as any).env.VITE_API_TOKEN || '123456' },
                  body: JSON.stringify({ obsUrl: repObs, title: repTitle })
                })
                const body = await resp.json()
                if (body && body.code === 200 && typeof body.result === 'string' && body.result) { reportData = body; break }
                reportErr = (body && body.msg) || ('code ' + (body && body.code))
                if (body && Number(body.code) >= 6000 && Number(body.code) < 7000) break
              } catch (err: any) { reportErr = err.message || String(err) }
            }
            if (!reportData) throw new Error(reportErr || '报告接口无响应')
            appState.remoteReport = { url: reportData.result, title: repTitle, count: 0, summary: '', time: new Date().toLocaleString('zh-CN', { hour12: false }), messageId: responseMessageId || '' }
            const reportResultKey = 'report:' + String(responseMessageId || ('generated-' + Date.now()))
            const remoteTab = registerResultPreview('report', Object.assign({}, appState.remoteReport, { remote: true }), repTitle || '选品决策报告', reportResultKey)
            if (remoteTab) appState.remoteReport.resultKey = remoteTab.key
            appState.remoteReport.persistKey = appState.remoteReport.resultKey || ('report-' + Date.now())
            appState.activeConversationId = convIdFromHeader || convKey
            const { saveConversationReport } = await import('./state')
            saveConversationReport(convIdFromHeader || convKey || currentResultConversationId(), Object.assign({}, appState.remoteReport, { remote: true }))
            // 报告链接登记到服务端：任何浏览器刷新都能找回
            try {
              fetch('/api/report-links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId: convIdFromHeader || convKey || currentResultConversationId(), messageId: appState.remoteReport.messageId || '', url: appState.remoteReport.url || '', title: appState.remoteReport.title || '', time: appState.remoteReport.time || '', savedAt: Date.now() }) }).catch(() => {})
            } catch (e) {}
            ai.statusText = '· 已完成'
            ai.reportTask = null
            ai.finalHtml = renderReportLinkCard(appState.remoteReport)
            // 积分消耗
            let repUsage: any = null
            if (endPayload && typeof endPayload === 'object') {
              const repMeta = endPayload.metadata || (endPayload.data && endPayload.data.metadata) || null
              repUsage = endPayload.usage || (endPayload.data && endPayload.data.usage) || (repMeta && repMeta.usage) || null
            }
            let repIn = 0, repOut = 0, repTotal = 0
            if (repUsage && typeof repUsage === 'object') {
              repIn = Number(repUsage.prompt_tokens ?? repUsage.input_tokens ?? repUsage.promptTokens ?? 0) || 0
              repOut = Number(repUsage.completion_tokens ?? repUsage.output_tokens ?? repUsage.completionTokens ?? 0) || 0
              repTotal = Number(repUsage.total_tokens ?? repUsage.totalTokens ?? 0) || 0
              if (!repTotal && (repIn || repOut)) repTotal = repIn + repOut
            }
            const repHasUsage = repTotal > 0
            const md = currentModelDef()
            const repCoins = repHasUsage ? Math.ceil(md.baseCoins + repIn / 1000 * md.coinPerKInput + repOut / 1000 * md.coinPerKOutput) : Math.ceil(md.baseCoins)
            const repCbTitle = repHasUsage
              ? `Token 用量：输入 ${repIn.toLocaleString()} · 输出 ${repOut.toLocaleString()}${repTotal ? ` · 合计 ${repTotal.toLocaleString()}` : ''} · 报告生成轮次`
              : 'Token 用量：报告生成轮次'
            appState.totalCoins = Math.max(0, appState.totalCoins - repCoins)
            ai.costBar = { title: repCbTitle, coins: repCoins }
            ai.memRounds = Math.max(1, view.messages.filter(mm => mm.role === 'user').length)
            if (remoteTab) activateResultPreview(remoteTab.key)
          } catch (e: any) {
            ai.statusText = '· 已完成'
            ai.finalHtml = renderAiAnswerHtml('报告生成失败：' + (e.message || String(e)) + '。请稍后重试，或联系管理员检查报告接口（reports）可用性。')
          }
          finishRun()
          scrollBottomCb()
          return
        }
        // 普通分支：将流式纯文本替换为渲染后的 HTML
        const finishedCandidates = streamState.workflowFinishedEvents.length ? streamState.workflowFinishedEvents : (workflowFinished ? [workflowFinished] : [])
        const workflowWithObs = finishedCandidates.find((item: any) => {
          const candidate = getWorkflowOutputs(item)
          const envelope = getAnswerEnvelope(candidate)
          return Boolean(envelope && envelope.obsUrl && envelope.obsUrl.trim())
        })
        workflowFinished = workflowWithObs || finishedCandidates[finishedCandidates.length - 1] || null
        const outputs = getWorkflowOutputs(workflowFinished) || {}
        const envelope = getAnswerEnvelope(outputs) || getAnswerEnvelope({ answer: accAnswer })
        const answer = envelope && typeof envelope.answer === 'string' ? envelope.answer : accAnswer
        const payloadEnv = envelope && envelope.payload && typeof envelope.payload === 'object' ? envelope.payload : envelope
        const obsUrl = payloadEnv && typeof payloadEnv.obsUrl === 'string' ? payloadEnv.obsUrl.trim() : ''
        const totalCount = Number((payloadEnv && payloadEnv.totalCount) || 0) || 0
        appState.currentAnswer = answer
        let pj: any = null
        if (obsUrl) {
          try {
            const resultRoundKey = responseMessageId || ('round-' + Date.now())
            const obsPayload = await loadObsProducts(obsUrl, totalCount, convIdFromHeader || convKey, resultRoundKey, appState.currentResultQuery || text, {
              getCurrentAnswer: () => appState.currentAnswer,
              getExportQuery: () => appState.currentExportQuery,
              getCurrentQuery: () => appState.currentResultQuery,
              saveConversationProducts,
              setObsMeta: (meta: any) => { appState.dldObsMeta = meta }
            })
            pj = { count: obsPayload.count, totalCount: obsPayload.totalCount || totalCount || obsPayload.products.length, products: obsPayload.products }
            appState.lastPayloadNode = { source: 'workflow_finished.data.outputs.answer.payload', obsUrl, totalCount, fetchedCount: obsPayload.products.length }
            // obsUrl 到手即刻写入本轮缓存
            try {
              const allProducts = readConversationProducts()
              const cacheKey = String(convIdFromHeader || convKey)
              const curConv = allProducts[cacheKey]
              if (curConv && obsUrl) {
                curConv.obsUrl = String(obsUrl)
                if (Array.isArray(curConv.rounds)) {
                  const rr = curConv.rounds.find((r: any) => String(r.roundKey || '') === String(resultRoundKey))
                  if (rr) rr.obsUrl = String(obsUrl)
                }
                localStorage.setItem(PRODUCT_CACHE_KEY, JSON.stringify(allProducts))
              }
            } catch (e) {}
          } catch (e: any) { showError(e.message || String(e)) }
        }
        // 静默补检索已取得 OBS 数据：跳过普通搜索的商品表格，继续报告指令
        if (isSilent && appState.autoReport && obsUrl) {
          const reportState = appState.autoReport
          ai.statusText = '· 正在生成报告'
          updateReportTask(2, '样本已准备完成，正在分析关键指标')
          finishRun(true)
          chatState.inputText = '生成报告'
          setTimeout(() => send(false, true, reportState), 250)
          return
        }
        if (!obsUrl && (answer || accAnswer)) {
          console.info('[DLD] 本轮为对话式回复（未触发检索），不请求数据')
        } else if (!obsUrl) {
          showError('Chatflow已完成，但没有返回obsUrl')
        }
        ai.phase = runEnded && ai.phase === 'error' ? 'error' : 'done'
        ai.statusText = runEnded && ai.phase === 'error' ? '· 失败' : '· 已完成'
        if (ai.phase === 'done') {
          if (answer || accAnswer || (pj && pj.products.length)) {
            const list = [payloadEnv && payloadEnv.list, payloadEnv && payloadEnv.products, envelope && envelope.list, outputs && outputs.list]
              .map(value => parseNestedJson(value)).find(value => Array.isArray(value) && value.length)
            if (pj && list) pj.sample = list.slice(0, 5)
            const stripJsonTail = (s: string) => {
              const m = /\{\s*"(?:schema_version|answer|obsUrl|totalCount|products)"\s*:[\s\S]*$/.exec(s)
              return m ? s.slice(0, m.index).trim() : s
            }
            const finalVisible = pj && pj.products.length
              ? stripJsonTail(String(answer || accAnswer))
                  .replace(/^[^\n]*(?:查看更多|结果已加载到右侧表格|检索完成)[^\n]*$/gm, '')
                  .replace(/\n{3,}/g, '\n\n').trim()
              : stripJsonTail(answer || accAnswer)
            ai.finalHtml = renderAiAnswerHtml(finalVisible)
              + (pj && pj.products.length ? productPreviewHtml(list, pj.products, convIdFromHeader || convKey, pj.products.length) : '')
          }
          // 完整结果已缓存；注册右侧结果标签（不激活、不抢当前报告焦点）
          if (pj && Array.isArray(pj.products) && pj.products.length) {
            const resultQuery = appState.currentResultQuery || text || ''
            const resultMessageId = responseMessageId || ('round-' + Date.now())
            saveConversationProducts(convIdFromHeader || convKey, { ...pj, totalCount: pj.products.length, query: resultQuery, conversationId: convIdFromHeader || convKey, messageId: resultMessageId }, resultMessageId)
            appState.activeConversationId = convIdFromHeader || convKey
            appState.currentResultMessageId = resultMessageId
            appState.currentResultKey = String((convIdFromHeader || convKey) + ':' + resultMessageId)
            try {
              const liveResultKey = String((convIdFromHeader || convKey) + ':' + resultMessageId)
              const livePayload = { ...pj, totalCount: pj.products.length, query: resultQuery, conversationId: convIdFromHeader || convKey, messageId: resultMessageId, obsUrl: String(obsUrl || '') }
              appState.productResultTabs[liveResultKey] = {
                payload: livePayload,
                offers: chatflowProductsToOffers(livePayload),
                title: resultQuery
              }
              ensureProductResultTab(liveResultKey, resultQuery, { activate: false })
            } catch (tabErr: any) { console.warn('[DLD] 商品结果标签注册失败：', tabErr.message) }
          }
          // 积分消耗
          let usage: any = null, msgId: any = responseMessageId
          if (endPayload && typeof endPayload === 'object') {
            const meta = endPayload.metadata || (endPayload.data && endPayload.data.metadata) || null
            usage = endPayload.usage || (endPayload.data && endPayload.data.usage) || (meta && meta.usage) || null
            msgId = endPayload.message_id || endPayload.messageId || (endPayload.data && (endPayload.data.message_id || endPayload.data.messageId)) || responseMessageId
          }
          let tkIn = 0, tkOut = 0, tkTotal = 0
          if (usage && typeof usage === 'object') {
            tkIn = Number(usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokens ?? 0) || 0
            tkOut = Number(usage.completion_tokens ?? usage.output_tokens ?? usage.completionTokens ?? 0) || 0
            tkTotal = Number(usage.total_tokens ?? usage.totalTokens ?? 0) || 0
            if (!tkTotal && (tkIn || tkOut)) tkTotal = tkIn + tkOut
          }
          const hasRealUsage = tkTotal > 0
          const md = currentModelDef()
          const costCoins = hasRealUsage
            ? Math.ceil(md.baseCoins + tkIn / 1000 * md.coinPerKInput + tkOut / 1000 * md.coinPerKOutput)
            : computeCost(text, attachCount).coins
          appState.totalCoins = Math.max(0, appState.totalCoins - costCoins)
          const cbTitle = hasRealUsage
            ? `Token 用量：输入 ${tkIn.toLocaleString()} · 输出 ${tkOut.toLocaleString()}${tkTotal ? ` · 合计 ${tkTotal.toLocaleString()}` : ''}`
            : `Token 用量：按 ${md.name} 档位估算`
          ai.costBar = { title: cbTitle, coins: costCoins }
          // 下一步建议：仅展示后端推荐追问接口返回的内容
          ai.suggestLoading = true
          ;(async () => {
            if (!msgId) { ai.suggest = null; ai.suggestLoading = false; return }
            let items: any = null
            try {
              const res = await DLD.messageSuggestions(msgId)
              const r = res && res.result
              if (Array.isArray(r)) items = r
              else if (r && Array.isArray(r.data)) items = r.data
              else if (r && Array.isArray(r.suggestions)) items = r.suggestions
              else if (r && Array.isArray(r.list)) items = r.list
            } catch (e) { console.warn('[DLD] 推荐追问接口失败 → 不展示建议：', (e as Error).message) }
            // 兼容三种返回结构
            const list2 = (Array.isArray(items) ? items : []).slice(0, 3).map((it: any) => {
              const text2 = typeof it === 'string' ? it : ((it && (it.text || it.content)) || '')
              const question = typeof it === 'string' ? it : ((it && (it.question || it.text || it.content || it.suggestion)) || '')
              const icon = (it && typeof it === 'object' && it.icon) ? String(it.icon) : ''
              return question ? { q: question, t: text2 || question, ic: icon } : null
            }).filter((x): x is { q: string; t: string; ic: string } => x !== null)
            ai.suggest = list2.length ? list2 : null
            ai.suggestLoading = false
            scrollBottomCb()
          })()
          // 记忆提示
          ai.memRounds = Math.max(1, view.messages.filter(mm => mm.role === 'user').length)
        }
        scrollBottomCb()
        // 静默补检索完成后（普通分支走不到这里），普通流程收尾
        if (!isSilent || !appState.autoReport) {
          appState.autoReport = null
          finishRun()
          // 首次会话完成后读取服务端正式标题
          if (!convId) syncOfficialConversationTitle(convIdFromHeader || convKey)
        }
      },
      onError: (payload) => {
        showError(typeof payload === 'string' ? payload : (payload && payload.message) || '流式错误')
        finishRun()
      }
    })
  } catch (e: any) {
    // 手动停止（abort/取消）：标记"已停止"并清理瞬时 UI
    if ((task && task.stopped) || (e && e.name === 'AbortError')) {
      runEnded = true
      ai.phase = 'stopped'
      ai.statusText = '· 已停止'
      removeLiveStatus()
      discardAnalyze()
    } else {
      showError(e.message || String(e))
      scrollBottomCb()
    }
    finishRun()
  }
}

/* ==================== 滚动钩子（App 层注入） ==================== */
let scrollBottomCb: () => void = () => {}
export function setScrollBottom(fn: () => void) { scrollBottomCb = fn }

export { openProductPreviewCard, activeView, panel, setRightEmpty, openPreviewPanel, extractProductJson }
