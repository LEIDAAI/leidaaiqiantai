/* =====================================================
 * 历史会话恢复：消息 → 气泡数据 + 右栏报告/商品标签恢复
 * 对应原 loadRealMessages 内的渲染与恢复段（L4819-L5218）
 * ===================================================== */
import {
  chatState, ChatMessage, makeMessage
} from './chat'
import {
  appState, SessionItem, getConversationProducts, getConversationReports, saveConversationReport,
  saveConversationProducts, readConvIdMap, getConversationViewMode,
  ACTIVE_RESULT_TAB_KEY
} from './state'
import {
  panel, registerResultPreview, ensureProductResultTab, activateResultPreview,
  renderReportLinkCard, buildReportDoneCard, renderConversationProducts,
  productPreviewHtml
} from './panel'
import {
  renderAiAnswerHtml, extractProductJson, extractSearchKw, stripProductJsonBlock, stripThinkBlocks
} from '../utils/markdown'
import { chatflowProductsToOffers } from '../utils/productFields'
import { DLD } from '../api'
import { REPORT_SERVER } from '../env'
void REPORT_SERVER
void DLD

// 历史回复若是纯报告指令（无已保存链接）显示占位提示
function reportDirectiveHint(content: string): string | null {
  const src = String(content || '').trim()
  if (src.length < 400 && /^\{[\s\S]*"action"\s*:\s*"report"/.test(src)) {
    let repTitle = ''
    try { const d = JSON.parse(src); repTitle = String(d && d.title || '').trim() } catch (e) {}
    return repTitle ? '「' + repTitle + '」报告请求记录：此轮没有已保存的报告链接。' : '报告请求记录：此轮没有已保存的报告链接。'
  }
  return null
}

const isReportDirective = (content: any) => /"action"\s*:\s*"report"/.test(String(content || ''))

export function buildHistoryMessages(target: SessionItem, messages: ChatMessage[]): ChatMessage[] {
  const cachedReports = getConversationReports(target.convId).length
    ? getConversationReports(target.convId)
    : getConversationReports(target.id)

  return messages.map((m, i) => {
    const prev = messages[i - 1]
    if (m.role === 'user') return m
    // AI 消息
    const msg = makeMessage({ id: m.id, role: 'assistant', content: m.content, createdAt: m.createdAt, phase: 'done', statusText: '· 已完成' })
    msg.query = prev && prev.role === 'user' ? prev.content : ''
    // 报告指令轮：恢复为报告卡片
    if (isReportDirective(m.content)) {
      const report = findReportForMessage(cachedReports, m, messages)
      if (report) {
        const savedKey = String(report.persistKey || report.resultKey || report.messageId)
        const reportKey = savedKey.startsWith('report:') ? savedKey : 'report:' + savedKey
        msg.reportCardHtml = (report.remote && report.url ? renderReportLinkCard(Object.assign({ resultKey: reportKey }, report)) : buildReportDoneCard(Object.assign({ resultKey: reportKey }, report)))
        msg.hidden = false
      } else {
        const hint = reportDirectiveHint(m.content)
        msg.finalHtml = hint ? renderAiAnswerHtml('_' + hint + '_') : ''
        msg.reportCardHtml = ''
      }
      return msg
    }
    // 商品 JSON 回复：气泡显示摘要 + 五条预览卡
    if (extractProductJson(m.content)) {
      let historyAnswer = String(m.content || '')
      historyAnswer = historyAnswer
        .replace(/^[^\n]*(?:查看更多|结果已加载到右侧表格|检索完成)[^\n]*$/gm, '')
        .replace(/\n{3,}/g, '\n\n')
      const pj = extractProductJson(historyAnswer)
      if (pj) {
        msg.finalHtml = pj.text ? renderAiAnswerHtml(pj.text) : ''
        msg.showAnalyzeDone = prev && prev.role === 'user' ? { kw: extractSearchKw(prev.content) } : null
      } else {
        msg.finalHtml = renderAiAnswerHtml(historyAnswer)
      }
      return msg
    }
    msg.finalHtml = renderAiAnswerHtml(m.content)
    return msg
  })
}

function findReportForMessage(cachedReports: any[], m: ChatMessage, all: ChatMessage[]): any {
  let report = cachedReports.find(item => item.url && item.messageId &&
    (String(m.id) === String(item.messageId) || String(m.id) === String(item.messageId) + '-a'))
  if (report) return report
  // 兜底：按就近靠后原则挂同一份报告（报告链接登记在最后一轮消息 ID 上）
  const idx = all.indexOf(m)
  const pool = cachedReports
    .map(item => {
      const mid = String(item.messageId || '')
      const at = mid ? all.findIndex(x => String(x.id || '') === mid || String(x.id || '') === mid + '-a') : Number.MAX_SAFE_INTEGER
      return { item, at: at >= 0 ? at : Number.MAX_SAFE_INTEGER }
    })
    .filter(x => x.at >= idx)
    .sort((a, b) => a.at - b.at)
  return pool.length ? pool[0].item : null
}

/* —— 右栏标签与商品恢复（原 loadRealMessages 后半段） —— */
export async function restoreHistoryPanel(target: SessionItem, messages: ChatMessage[]) {
  const view = chatState.views[target.id]
  if (!view) return
  // 读取刷新前激活的结果标签
  let savedActiveResultKey = ''
  try { savedActiveResultKey = localStorage.getItem(ACTIVE_RESULT_TAB_KEY + ':' + String(target.convId)) || '' } catch (e) {}
  // 历史会话恢复报告
  let cachedReports = getConversationReports(target.convId).length
    ? getConversationReports(target.convId)
    : getConversationReports(target.id)
  if (!cachedReports.length) {
    try {
      const idMap = readConvIdMap()
      const mappedId = idMap[String(target.id)] || idMap[String(target.convId)] || ''
      if (mappedId) cachedReports = getConversationReports(mappedId)
    } catch (e) {}
  }
  // ① 全部报告先注册为右侧标签
  cachedReports.forEach((report, index) => {
    const savedReportKey = String(report.persistKey || report.resultKey || ('history-' + index))
    const reportKey = savedReportKey.startsWith('report:') ? savedReportKey : ('report:' + savedReportKey)
    registerResultPreview('report', report, report.title || '选品报告', reportKey)
  })
  // ② 跨浏览器兜底：报告链接登记到 8088 服务端，按消息 ID 精确找回
  const hasReportRound = messages.some(m => m && m.role === 'assistant' && isReportDirective(m.content))
  if (hasReportRound && cachedReports.length === 0) {
    try {
      const res = await fetch('/api/report-links?conversation_id=' + encodeURIComponent(String(target.convId)), { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        const links = Array.isArray(data && data.links) ? data.links : []
        links.forEach((l: any) => {
          if (!l || !l.url) return
          const entry = { title: l.title || '选品决策报告', url: l.url, time: l.time || '', messageId: l.messageId, remote: true, count: 0, summary: '', resultKey: 'report:' + l.messageId, persistKey: 'report:' + l.messageId }
          saveConversationReport(target.convId, entry)
          registerResultPreview('report', Object.assign({ resultKey: entry.resultKey }, entry), entry.title, entry.resultKey)
          // 回填气泡卡片
          const msg = view.messages.find(mm => mm.role === 'assistant' && (String(mm.id) === String(l.messageId) || String(mm.id) === String(l.messageId) + '-a'))
          if (msg) msg.reportCardHtml = renderReportLinkCard(Object.assign({ resultKey: entry.resultKey }, entry))
        })
      }
    } catch (e) {}
  }
  const savedViewMode = getConversationViewMode(target.convId) || getConversationViewMode(target.id)
  const preferReport = savedViewMode === 'report' || (!savedViewMode && (cachedReports.length > 0 || hasReportRound))
  // 商品结果恢复
  let cachedProducts = getConversationProducts(target.convId) || getConversationProducts(target.id)
  if (!cachedProducts) {
    try {
      const idMap = readConvIdMap()
      const mappedId = idMap[String(target.id)] || idMap[String(target.convId)] || ''
      if (mappedId) cachedProducts = getConversationProducts(mappedId)
    } catch (e) {}
  }
  // 缓存缺失时，从历史 AI 消息重建商品结果
  if (!cachedProducts) {
    const recoveredRounds: any[] = []
    messages.forEach((message, index) => {
      if (message.role !== 'assistant') return
      if (isReportDirective(message.content)) return
      const parsed = extractProductJson(message.content)
      if (!parsed || !Array.isArray(parsed.products) || !parsed.products.length) return
      const previousUser = messages.slice(0, index).reverse().find(item => item.role === 'user')
      const recoveredQuery = String(previousUser && previousUser.content || target.title || '选品结果').trim()
      const recoveredKey = String(message.id || ('history-round-' + index))
      const recoveredPayload = {
        products: parsed.products,
        count: parsed.count || parsed.products.length,
        query: recoveredQuery,
        conversationId: target.convId,
        messageId: recoveredKey
      }
      recoveredRounds.push({ roundKey: recoveredKey, query: recoveredQuery, count: recoveredPayload.count, products: parsed.products, savedAt: Date.now() })
      saveConversationProducts(target.convId, recoveredPayload, recoveredKey)
      // 回填五条预览卡到对应气泡
      const aiIndex = view.messages.findIndex(mm => mm.role === 'assistant' && mm.id === message.id)
      if (aiIndex >= 0 && view.messages[aiIndex]) {
        view.messages[aiIndex].showAnalyzeDone = view.messages[aiIndex].showAnalyzeDone || { kw: extractSearchKw(recoveredQuery) }
      }
    })
    if (recoveredRounds.length) {
      cachedProducts = {
        products: recoveredRounds[recoveredRounds.length - 1].products,
        count: recoveredRounds[recoveredRounds.length - 1].count,
        rounds: recoveredRounds
      }
    }
  }
  if (cachedProducts && cachedProducts.products && cachedProducts.products.length) {
    const previewRounds = Array.isArray(cachedProducts.rounds) && cachedProducts.rounds.length
      ? cachedProducts.rounds
      : [{ products: cachedProducts.products, count: cachedProducts.count, query: cachedProducts.query || target.title, roundKey: '' }]
    // 每轮结果回填到对应的 AI 气泡 + 注册右侧标签
    previewRounds.forEach((round: any, idx: number) => {
      const key = 'history-' + target.convId + '-' + (round.roundKey || idx)
      const roundTitle = round.query || round.title || ('第' + (idx + 1) + '轮结果')
      const roundPayload = {
        products: round.products,
        count: round.count,
        query: roundTitle,
        conversationId: target.convId,
        messageId: String(round.roundKey || idx),
        obsUrl: String(round.obsUrl || cachedProducts.obsUrl || '')
      }
      appState.productResultTabs[key] = { payload: roundPayload, offers: chatflowProductsToOffers(roundPayload), title: roundTitle }
      ensureProductResultTab(key, roundTitle, { activate: false })
      // 找到对应 AI 气泡回填预览卡（五条摘要）
      const roundKey = String(round.roundKey || '')
      const aiMessages = messages.filter(mm => mm.role === 'assistant')
      let aiIndex = roundKey ? aiMessages.findIndex(mm => String(mm.id || '') === roundKey || String(mm.id || '').includes(roundKey)) : -1
      if (aiIndex < 0) {
        const roundQuery = String(round.query || round.title || '').trim()
        const userIndex = roundQuery ? messages.findIndex(mm => mm.role === 'user' && String(mm.content || '').trim() === roundQuery) : -1
        if (userIndex >= 0) aiIndex = messages.slice(0, userIndex).filter(mm => mm.role === 'assistant').length
      }
      if (aiIndex < 0) aiIndex = Math.min(idx, messages.filter(mm => mm.role === 'assistant').length - 1)
      const aiMsg = view.messages.filter(mm => mm.role === 'assistant')[aiIndex]
      if (aiMsg && !aiMsg.reportCardHtml && !isReportDirective(aiMsg.content) && Array.isArray(round.products) && round.products.length) {
        aiMsg.productPreview = productPreviewHtml(round.sample, round.products, String(target.convId), round.totalCount || round.count)
      }
    })
    // 恢复最后激活的标签
    const latestRound = cachedProducts.rounds && cachedProducts.rounds[cachedProducts.rounds.length - 1]
    if (latestRound && !preferReport) {
      let activeKey = ''
      try { activeKey = localStorage.getItem(ACTIVE_RESULT_TAB_KEY + ':' + String(target.convId)) || '' } catch (e) {}
      const latestKey = 'history-' + target.convId + '-' + (latestRound.roundKey || cachedProducts.rounds.length - 1)
      const activeSuffix = activeKey ? String(activeKey).split(':').pop() : ''
      const restoredKey = activeKey && appState.productResultTabs[activeKey]
        ? activeKey
        : (activeSuffix ? Object.keys(appState.productResultTabs).find(key => key.endsWith('-' + activeSuffix) || key.endsWith(':' + activeSuffix)) : '')
      const selectedKey = restoredKey || latestKey
      const selectedItem = appState.productResultTabs[selectedKey]
      if (selectedItem && selectedItem.payload) {
        ensureProductResultTab(selectedKey, selectedItem.title || selectedItem.payload.query, { activate: true })
        renderConversationProducts(selectedItem.payload, selectedKey, { restore: true })
      }
    }
  }
  // 只按会话级最后观看模式恢复：报告和表格不再互相推断、抢占
  try {
    const latestReport = cachedReports[cachedReports.length - 1]
    const rawReportKey = latestReport && String(latestReport.persistKey || latestReport.resultKey || latestReport.messageId || '')
    const savedReportKey = rawReportKey && (rawReportKey.startsWith('report:') ? rawReportKey : 'report:' + rawReportKey)
    const chosenReportKey = savedActiveResultKey && panel.resultTabs.find(t => t.key === savedActiveResultKey)
      ? savedActiveResultKey : savedReportKey
    if (savedViewMode === 'table') {
      const productKey = appState.productResultTabs[savedActiveResultKey]
        ? savedActiveResultKey : Object.keys(appState.productResultTabs).filter(key => key.startsWith('history-' + target.convId + '-')).pop()
      const product = productKey ? appState.productResultTabs[productKey] : null
      if (product && productKey) {
        ensureProductResultTab(productKey, product.title, { activate: true })
        renderConversationProducts(product.payload, productKey, { restore: true })
      }
    } else if (chosenReportKey && panel.resultTabs.find(t => t.key === chosenReportKey)) {
      activateResultPreview(chosenReportKey, { restore: true })
    }
  } catch (e) {}
}
