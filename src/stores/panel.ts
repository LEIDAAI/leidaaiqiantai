/* =====================================================
 * 右栏面板状态：结果标签 / 商品表 / 对话表格详情 / 报告预览
 * 对应原 index.html 的右栏 DOM 操控逻辑，收进响应式 store。
 * ===================================================== */
import { reactive, computed } from 'vue'
import {
  appState, saveConversationReport, saveConversationProducts, getConversationProducts,
  getConversationViewMode, setConversationViewMode, currentResultConversationId,
  hasVisitedPreview, markVisitedPreview, ACTIVE_RESULT_TAB_KEY
} from './state'
import { flashToast, fmtN } from '../utils/common'
import {
  PRODUCT_EXPORT_HEADERS, PRODUCT_FIELD_KEYS, productField, offerRowKey, offerSortValue,
  fmtDateOnly, fmtYen, chatflowProductsToOffers, fieldNameForKeys, productValue, companyTypeText
} from '../utils/productFields'
import {
  mdTablesRegistry, MD_NUM_HEAD_RE, MD_TABLE_VISIBLE_ROWS, mdCellHtml
} from '../utils/markdown'
import { exportTableToXlsx, exportMdTableToXlsx, ImgCell } from '../utils/excel'
import { renderReportDoc, REPORT_KEYWORDS } from '../utils/reportDoc'

/* ==================== 商品预览摘要卡（中栏五条卡片，原 productPreviewHtml） ==================== */
export const productPreviews = reactive(new Map<string, {
  convId: string; products: any[]; totalCount: number; query: string; messageId: string; resultKey: string; obsUrl: string
}>())

export function productPreviewHtml(sample: any, products: any[], convId: string, totalCount: number): string {
  // list 只有摘要或部分字段时，从已取得的 OBS 明细补齐，保证卡片有真实标题和图片。
  const byId = new Map(products.map((p: any) => [String(p['商品ID'] || p.offerId || ''), p]))
  const samples = Array.isArray(sample) ? sample.map((p: any) => {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return null
    const id = p['商品ID'] || p.offerId || p.id
    return id && byId.get(String(id)) || null
  }).filter(Boolean) : []
  const normalized = (samples.length ? samples : products).slice(0, 5)
  const total = products.length
  const key = 'product-preview-' + Date.now() + '-' + Math.random().toString(36).slice(2)
  productPreviews.set(key, {
    convId, products, totalCount: products.length,
    query: appState.currentResultQuery || appState.currentExportQuery || '',
    messageId: appState.currentResultMessageId || '', resultKey: appState.currentResultKey || '',
    obsUrl: String((appState.lastPayloadNode && appState.lastPayloadNode.obsUrl) || '')
  })
  const cards = normalized.map(p => {
    const image = String(p['商品主图'] || '').trim()
    const title = String(p['商品标题'] || '--')
    const price = p['批发价']
    const sold = p['近30天件数']
    return '<div class="dld-sample-item">' + (image.startsWith('https://') || image.startsWith('http://') ? '<img src="' + image + '" loading="lazy" referrerpolicy="no-referrer" alt="">' : '')
      + '<div><div class="dld-sample-title">' + title + '</div><div class="dld-sample-meta"><span class="price">¥' + String(price ?? '--') + '</span><span>30天销 ' + String(sold ?? '--') + '件</span></div></div></div>'
  }).join('')
  const head = '<div class="dld-sample-head">'
    + '<span class="dsh-title"><span class="dsh-ic">📦</span>商品推荐</span>'
    + '<span class="dsh-count">共 ' + total + ' 条</span>'
    + '</div>'
  const btn = '<button type="button" class="dld-products-more" data-preview-key="' + key + '">'
    + '查看完整商品列表 <span class="more-arrow">→</span>'
    + '</button>'
  return '<div class="dld-sample-list">' + head + cards + btn + '</div>'
}

/* ==================== 右栏面板状态 ==================== */
export const panel = reactive({
  collapsed: (() => { try { return localStorage.getItem('dld_right_collapsed') === '1' } catch (e) { return false } })(),
  panelEmpty: true,
  previewOpenedThisSession: false,
  // 结果标签（原 .right-tabs 下的 DOM 标签 → 数据化）
  resultTabs: [] as Array<{ key: string; type: 'report' | 'table' | 'product'; title: string; payload: any }>,
  activeResultKey: '',
  // 商品预览视图
  productPreviewVisible: false,
  skeletonVisible: false,   // 右栏表格加载骨架屏
  previewTitle: '',
  previewMeta: '',
  summary: { total: 0, minP: 0, maxP: 0, topOrders: 0 },
  // 商品表分页状态（原 window.__offerPager）
  offerPager: {
    full: [] as any[],
    page: 1,
    size: 50,
    totalCount: 0,
    metaTime: '',
    queryTitle: '',
    selected: new Set<string>()
  },
  offerViewMode: (() => { try { return localStorage.getItem('dld_offer_view') === 'card' ? 'card' : 'list' } catch (e) { return 'list' } })(),
  // 排序状态
  offerSort: { key: '', dir: 'asc' as 'asc' | 'desc' },
  // 对话表格详情（原 __mdTabs / __mdPager / __mdPreviewTid）
  mdTabs: [] as string[],
  mdActiveTid: '',
  mdPagers: {} as Record<string, { page: number; size: number }>,
  mdPrevTabName: '',
  // 报告预览
  reportView: {
    visible: false,
    title: '选品报告',
    metaHtml: '',
    mode: 'none' as 'none' | 'local' | 'remote' | 'empty',
    localReport: null as any,   // { title, html, toc, raw, time, resultKey }
    remoteUrl: '' as string,
    remoteSrcdoc: '' as string,
    zoom: 1
  }
})

// ==================== 结果标签 ====================
export function registerResultPreview(type: 'report' | 'table' | 'product', payload: any, title: string, key?: string) {
  const seqBox = panel as any
  key = key || (String(type) + ':' + Date.now() + '-' + (++seqBox._seq))
  if (payload && typeof payload === 'object') payload.resultKey = key
  const existing = panel.resultTabs.find(t => t.key === key)
  if (existing) {
    existing.title = title || existing.title
    existing.payload = payload
  } else {
    panel.resultTabs.push({ key, type, payload, title: title || '预览结果' })
  }
  return { key, tab: existing }
}
// 给 reactive 补一个非响应式序号
;(panel as any)._seq = 0

export function removeResultTab(key: string) {
  const idx = panel.resultTabs.findIndex(t => t.key === key)
  if (idx < 0) return
  const removed = panel.resultTabs[idx]
  panel.resultTabs.splice(idx, 1)
  if (removed.type === 'product') delete appState.productResultTabs[removed.key]
  // 关闭当前标签后激活相邻标签
  if (panel.activeResultKey === key) {
    if (!panel.resultTabs.length) { setRightEmpty(true) }
    else {
      const next = panel.resultTabs[Math.min(idx, panel.resultTabs.length - 1)]
      activateResultPreview(next.key)
    }
  }
}

export function activateResultPreview(key: string, options: { restore?: boolean } = {}) {
  const item = panel.resultTabs.find(t => t.key === key)
  if (!item) return
  panel.activeResultKey = key
  if (!options.restore) {
    try { localStorage.setItem(ACTIVE_RESULT_TAB_KEY + ':' + currentResultConversationId(), key) } catch (e) {}
    setConversationViewMode(currentResultConversationId(), item.type === 'report' ? 'report' : 'table')
  }
  if (item.type === 'report') openReportView(item.payload)
  else if (item.type === 'table') viewMdTableFull(item.payload.tid, true)
  else if (item.type === 'product') renderConversationProducts(item.payload, item.key)
}

export function ensureProductResultTab(resultKey: string, title: string, options: { activate?: boolean } = {}) {
  if (!resultKey) return null
  let tab = panel.resultTabs.find(t => t.key === resultKey && t.type === 'product')
  if (!tab) {
    tab = { key: resultKey, type: 'product', payload: null, title: title || '选品结果' }
    panel.resultTabs.push(tab)
  }
  tab.title = '📊 ' + String(title || '选品结果')
  if (options.activate !== false) panel.activeResultKey = resultKey
  return tab
}

/* ==================== 商品表渲染（原 renderOffers / renderOfferPage） ==================== */
export function resetRightPreview() {
  // 先清内容标记再关视图
  appState.hasRealOffers = false
  appState.lastReport = null
  panel.productPreviewVisible = false
  closeMdTablePreview()
  closeReportView()
  panel.resultTabs = []
  panel.activeResultKey = ''
  appState.productResultTabs = {}
  panel.offerPager.full = []
  panel.offerPager.page = 1
  panel.offerPager.selected.clear()
  panel.previewTitle = ''
  panel.previewMeta = ''
  panel.summary = { total: 0, minP: 0, maxP: 0, topOrders: 0 }
}

export function setRightEmpty(empty: boolean) {
  // 首次进入期间忽略历史会话发出的"恢复预览"事件，保持右侧真正为空且收起
  if (!empty && appState.initialPreviewGuard) return
  const wasEmpty = panel.panelEmpty
  panel.panelEmpty = !!empty
  if (empty) {
    resetRightPreview()
    setCollapsed(true)
  } else if (wasEmpty) setCollapsed(false)
}

export function setCollapsed(collapsed: boolean) {
  panel.collapsed = collapsed
  try { localStorage.setItem('dld_right_collapsed', collapsed ? '1' : '0') } catch (e) {}
}

export function openPreviewPanel() {
  if (appState.initialPreviewGuard) return
  panel.previewOpenedThisSession = true
  // 记忆：当前会话曾经打开过右栏预览，下次进入该会话时自动恢复展开
  const id = useActiveConvId()
  if (id) markVisitedPreview(id)
  if (panel.panelEmpty) {
    if (!appState.hasRealOffers && !appState.lastReport) { setCollapsed(false); return }
    setRightEmpty(false)
  } else setCollapsed(false)
}

// 活跃会话 id 由 chat store 注入（避免循环依赖）
let _activeConvIdGetter: () => string = () => ''
export function setActiveConvIdGetter(fn: () => string) { _activeConvIdGetter = fn }
function useActiveConvId() { return _activeConvIdGetter() }

// 切回曾展开过右栏的会话时自动恢复展开
export function restorePreviewIfVisited(convId: string) {
  if (!convId || !hasVisitedPreview(convId)) return
  if (panel.collapsed) setCollapsed(false)
  // 若右栏当前为空态（无可恢复内容），挂一个轮询：等真实内容到达后自动解除空态
  if (panel.panelEmpty) {
    let tries = 0
    const t = setInterval(() => {
      tries++
      if (appState.hasRealOffers || appState.lastReport) {
        clearInterval(t)
        panel.previewOpenedThisSession = true
        if (panel.panelEmpty) setRightEmpty(false)
        else setCollapsed(false)
      } else if (tries > 30) { clearInterval(t) }
    }, 200)
  }
}

export function restoreRightAfterViewClose() {
  if (appState.hasRealOffers) return
  setRightEmpty(true)
}

// —— renderOffers：右栏商品表主入口 ——
export function renderOffers(list: any[], meta: any) {
  // 首次进入时忽略自动恢复的历史商品结果，右侧保持真正空态
  if (appState.initialPreviewGuard) {
    resetRightPreview()
    return
  }
  const total = (meta && meta.totalCount) || list.length || 0
  const pager = panel.offerPager
  pager.full = list.slice()
  pager.selected.clear() // 新一轮数据到达，旧勾选不再有效
  pager.page = 1
  pager.totalCount = total
  pager.queryTitle = String((meta && (meta.queryTitle || (meta.resultPayload && meta.resultPayload.query))) || appState.currentResultQuery || appState.currentExportQuery || '').trim()
  if (pager.queryTitle) appState.currentExportQuery = pager.queryTitle
  pager.metaTime = new Date().toLocaleString('zh-CN', { hour12: false })
  // —— 摘要卡片：全部由接口真实数据计算 ——
  const priceOf = (o: any) => {
    if (o.price != null) return Number(o.price)
    if (o.priceLow != null) return Number(o.priceLow)
    const m = String(o.priceRange || '').match(/[\d.]+/g)
    return m ? Number(m[0]) : null
  }
  const ordersOf = (o: any) => Number(o.bookedCount30d ?? o.bookedCount ?? o.recentOrders ?? 0)
  const prices = list.map(priceOf).filter((v): v is number => v != null && isFinite(v))
  panel.summary = {
    total,
    minP: prices.length ? Math.min(...prices) : 0,
    maxP: prices.length ? Math.max(...prices) : 0,
    topOrders: list.reduce((m, o) => Math.max(m, ordersOf(o)), 0)
  }
  const resultKey = meta && meta.resultKey ? String(meta.resultKey) : ''
  const queryTitle = String((meta && (meta.queryTitle || (meta.resultPayload && meta.resultPayload.query))) || pager.queryTitle || appState.currentResultQuery || appState.currentExportQuery || '选品结果').trim()
  if (resultKey) ensureProductResultTab(resultKey, queryTitle)
  panel.previewTitle = queryTitle + '（共 ' + total + ' 款）'
  if (!list.length) { updateOfferPage(); return }
  // 有真实商品数据才显示商品预览视图并解除右栏空态
  appState.hasRealOffers = true
  panel.productPreviewVisible = true
  setRightEmpty(false)
  updateOfferPage()
}

export const offerPageRows = computed(() => {
  const pager = panel.offerPager
  const full = pager.full
  const totalRows = full.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pager.size))
  const page = Math.min(Math.max(1, pager.page), totalPages)
  const start = (page - 1) * pager.size
  return { rows: full.slice(start, start + pager.size), start, totalPages, totalRows, page }
})

export function setOfferPage(p: number) { panel.offerPager.page = p }
export function setOfferSize(s: number) { panel.offerPager.size = s; panel.offerPager.page = 1 }
export function jumpToOfferPage(p: number) {
  const totalPages = Math.max(1, Math.ceil(panel.offerPager.full.length / panel.offerPager.size))
  panel.offerPager.page = Math.min(Math.max(1, p), totalPages)
}

export function toggleOfferSort(key: string) {
  const dir = panel.offerSort.key === key && panel.offerSort.dir === 'asc' ? 'desc' : 'asc'
  panel.offerSort = { key, dir }
  const d = dir === 'asc' ? 1 : -1
  panel.offerPager.full.sort((a, b) => (offerSortValue(a, key) - offerSortValue(b, key)) * d)
  panel.offerPager.page = 1
}

export function updateOfferPage() { /* 分页为 computed，占位保持调用面兼容 */ }

export function toggleRowCheck(key: string, checked: boolean) {
  if (checked) panel.offerPager.selected.add(key)
  else panel.offerPager.selected.delete(key)
}
export function checkAllPage(on: boolean) {
  const { rows } = offerPageRows.value
  rows.forEach(o => {
    const key = offerRowKey(o)
    if (on) panel.offerPager.selected.add(key)
    else panel.offerPager.selected.delete(key)
  })
}
export function setOfferViewMode(mode: 'list' | 'card') {
  panel.offerViewMode = mode
  try { localStorage.setItem('dld_offer_view', mode) } catch (e) {}
}

/* ==================== 对话表格详情（原 viewMdTableFull / activateMdTab / renderMdPage） ==================== */
export function viewMdTableFull(tid: string, restoring = false) {
  const t = mdTablesRegistry.tables[tid]
  if (!t) return
  const resultKey = 'table:' + tid
  if (!restoring) {
    const registered = registerResultPreview('table', { tid }, t.title || '对话表格详情', resultKey)
    if (registered) panel.activeResultKey = registered.key
  }
  if (!panel.mdPagers[tid]) panel.mdPagers[tid] = { page: 1, size: 50 }
  panel.mdTabs = [tid]
  panel.mdActiveTid = tid
  panel.mdPrevTabName = panel.mdPrevTabName || ''
  // 用户主动点击"查看更多"= 明确意图 + 会话内真实数据：解除首屏守卫并退出空态
  appState.initialPreviewGuard = false
  setRightEmpty(false)
  openPreviewPanel()
  // 右栏若处于折叠状态则自动展开
  if (panel.collapsed) setCollapsed(false)
}

export function activateMdTab(tid: string) {
  const t = mdTablesRegistry.tables[tid]
  if (!t) return
  if (!panel.mdPagers[tid]) panel.mdPagers[tid] = { page: 1, size: 50 }
  panel.mdActiveTid = tid
}

export function closeMdTab(tid: string) {
  const tabs = panel.mdTabs
  const pos = tabs.indexOf(tid)
  if (pos === -1) return
  tabs.splice(pos, 1)
  delete panel.mdPagers[tid]
  if (!tabs.length) { closeMdTablePreview(); return }
  if (panel.mdActiveTid === tid) activateMdTab(tabs[Math.min(pos, tabs.length - 1)])
}

export function closeMdTablePreview() {
  panel.mdTabs = []
  panel.mdActiveTid = ''
  // 静态占位骨架已移除：用户真正关闭可见的详情视图后，若无真实商品数据则回到空态收起
  if (panel.activeResultKey && panel.resultTabs.find(t => t.key === panel.activeResultKey && t.type === 'table')) {
    restoreRightAfterViewClose()
    if (panel.activeResultKey) {
      const idx = panel.resultTabs.findIndex(t => t.key === panel.activeResultKey)
      if (idx >= 0) panel.resultTabs.splice(idx, 1)
      panel.activeResultKey = ''
    }
  }
}

// 对话表格排序（数字列按数值，文本列按中文拼音序）
export function mdCellNum(txt: any): number {
  const s = String(txt == null ? '' : txt)
  const m = s.match(/-?[\d.]+/)
  if (!m) return NaN
  let n = Number(m[0])
  if (/亿/.test(s)) n *= 1e8
  else if (/万/.test(s)) n *= 1e4
  return n
}
export function mdCellCompare(a: any, b: any, isNumCol: boolean): number {
  if (isNumCol) {
    const x = mdCellNum(a), y = mdCellNum(b)
    return (isNaN(x) ? -Infinity : x) - (isNaN(y) ? -Infinity : y)
  }
  return String(a == null ? '' : a).trim().localeCompare(String(b == null ? '' : b).trim(), 'zh-CN')
}
export function sortMdTable(tid: string, colIndex: number, dir: 'asc' | 'desc') {
  const t = mdTablesRegistry.tables[tid]
  if (!t) return
  const isNumCol = MD_NUM_HEAD_RE.test(String(t.headers[colIndex] || ''))
  const d = dir === 'asc' ? 1 : -1
  t.rows.sort((a, b) => mdCellCompare(a[colIndex], b[colIndex], isNumCol) * d)
  if (panel.mdPagers[tid]) panel.mdPagers[tid].page = 1
}

/* ==================== 报告预览（原 openReportView / openRemoteReportView / closeReportView） ==================== */
export function openRemoteReportView(rp: any) {
  if (!rp) return
  if (!rp.resultKey) {
    const registered = registerResultPreview('report', Object.assign({}, rp, { remote: true }), rp.title || '选品决策报告')
    if (!registered) return
    activateResultPreview(registered.key)
    return
  }
  const rv = panel.reportView
  rv.title = '选品决策报告 · ' + rp.title
  rv.metaHtml = '生成时间 ' + (rp.time || '') + ' · 样本 <strong>' + Number(rp.count || 0).toLocaleString('zh-CN') + '</strong> 款 · <a href="' + rp.url + '" target="_blank">在新窗口打开</a>'
  rv.mode = 'remote'
  rv.remoteUrl = String(rp.url || '')
  rv.visible = true
  rv.zoom = 1
  panel.activeResultKey = rp.resultKey
  // 已读：清掉 Tab 徽标（标签名去掉 ●）
  const tab = panel.resultTabs.find(t => t.key === rp.resultKey)
  if (tab && tab.title.endsWith('●')) tab.title = tab.title.replace(/\s*●$/, '')
  // 与"表格详情"视图互斥
  closeMdTablePreview()
  appState.hasRealOffers = true
  openPreviewPanel()
}

export function openReportView(report?: any) {
  const rp = report || appState.lastReport
  if (rp && rp.remote) { openRemoteReportView(rp); return }
  const rv = panel.reportView
  if (rp) {
    rv.title = rp.title
    rv.metaHtml = '生成时间 ' + rp.time + ' · 正文约 <strong>' + (rp.raw || '').length + '</strong> 字 · AI 自动生成，可下载为独立 HTML 文件'
    rv.mode = 'local'
    rv.localReport = rp
    rv.visible = true
    rv.zoom = 1
    panel.activeResultKey = rp.resultKey || panel.activeResultKey
    const tab = panel.resultTabs.find(t => t.key === (rp.resultKey || ''))
    if (tab && tab.title.endsWith('●')) tab.title = tab.title.replace(/\s*●$/, '')
  } else {
    rv.title = '选品报告'
    rv.metaHtml = ''
    rv.mode = 'empty'
    rv.visible = true
  }
  closeMdTablePreview()
  appState.hasRealOffers = true
  openPreviewPanel()
}

export function closeReportView() {
  if (panel.reportView.visible) {
    panel.reportView.visible = false
    panel.reportView.mode = 'none'
    restoreRightAfterViewClose()
  }
}

/* ==================== 报告构建（原 buildLastReport / isReportAnswer / buildReportDoneCard / renderReportLinkCard） ==================== */
export function isReportAnswer(text: any): boolean {
  if (!text || text.length < 300) return false
  const hasStructure = /(^|\n)#{1,4}\s/.test(text) || /(^|\n)\|.+\|/.test(text) || /(^|\n)[-*]\s/.test(text)
  const hit = REPORT_KEYWORDS.some(k => text.indexOf(k) !== -1)
  return hasStructure && hit
}

export function buildLastReport(answer: string): any {
  // 每份报告保存独立快照，并以自身标签打开，避免后续报告覆盖先前预览。
  const plain = String(answer).replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*$/i, '').trim()
  const doc = renderReportDoc(plain)
  const report: any = { title: doc.title, html: doc.html, toc: doc.toc, raw: plain, time: doc.time, remote: false }
  const registered = registerResultPreview('report', report, report.title)
  if (registered) report.resultKey = registered.key
  report.persistKey = report.resultKey || ('report-' + Date.now())
  saveConversationReport(currentResultConversationId(), report)
  appState.lastReport = report
  return report
}

// "报告已生成"卡片：报告类回复完成后中栏不铺全文，点击卡片打开右栏报告预览
export function buildReportDoneCard(rp: any): string {
  const title = (rp && rp.title) || '选品报告'
  const words = rp && rp.raw ? rp.raw.length : 0
  const time = (rp && rp.time) || ''
  return '<div class="rd-done-card" data-result-key="' + String(rp && rp.resultKey || '') + '" role="button" title="点击在右侧预览完整报告">'
    + '<div class="rdc-ic">📊</div>'
    + '<div class="rdc-main">'
    +   '<div class="rdc-title">报告已生成 · ' + title + '</div>'
    +   '<div class="rdc-meta">生成时间 ' + time + ' · 正文约 <b>' + words + '</b> 字 · 已同步至右侧「选品报告」面板，可下载为独立 HTML</div>'
    + '</div>'
    + '<span class="rdc-btn">查看报告 →</span>'
    + '</div>'
}

// 远程报告链接卡片：本地报告服务生成的独立 HTML 报告，气泡内只出卡片+链接
export function renderReportLinkCard(rp: any): string {
  return '<div class="rd-done-card" data-report-url="' + String(rp && rp.url || '') + '" data-report-title="' + String(rp && rp.title || '选品决策报告') + '" data-report-time="' + String(rp && rp.time || '') + '" data-result-key="' + String(rp && rp.resultKey || '') + '" role="button" title="点击在右侧预览完整报告">'
    + '<div class="rdc-ic">📊</div>'
    + '<div class="rdc-main">'
    +   '<div class="rdc-title">选品决策报告已生成 · ' + (rp.title || '') + '</div>'
    +   '<div class="rdc-meta">' + (Number(rp && rp.count || 0) > 0 ? ('样本 ' + Number(rp.count).toLocaleString('zh-CN') + ' 款 · ') : '') + '生成时间 ' + (rp.time || '') + ' · 数据与结论详见报告正文</div>'
    + '</div>'
    + '<span class="rdc-btn">查看报告 →</span>'
    + '</div>'
}

/* ==================== 导出（原 exportPreviewXlsx） ==================== */
export async function exportPreviewXlsx(mode?: 'selected', convTitleFallback?: string) {
  const pager = panel.offerPager
  let exportList: any[] | null = null
  if (mode === 'selected') {
    const sel = pager.selected
    exportList = sel && sel.size ? pager.full.filter(o => sel.has(offerRowKey(o))) : []
    if (!exportList || !exportList.length) return
  }
  const sourceOffers = exportList || pager.full || []
  if (!sourceOffers.length) return
  const pickOfferUrl = (o: any, keys: string[]) => {
    if (!o) return ''
    for (const k of keys) { const v = o ? o[k] : null; if (typeof v === 'string' && /^https?:\/\//i.test(v)) return v }
    return ''
  }
  const imgCells: ImgCell[] = []
  const rows = sourceOffers.map((o, i) => PRODUCT_EXPORT_HEADERS.map((h): any => {
    if (h === '序号') return i + 1
    if (h === '商品主图') {
      const url = pickOfferUrl(o, ['商品主图', 'mainImageUrl', 'imageUrl', 'picUrl', 'image'])
      if (url) imgCells.push({ row: i, col: 1, url })
      return url ? '' : '--'
    }
    if (h === '商品链接') return pickOfferUrl(o, ['商品链接', 'detailUrl', 'offerUrl', 'productUrl', 'url']) || '--'
    if (h === '店铺链接') return pickOfferUrl(o, ['店铺链接', 'shopUrl', 'storeUrl', 'shopLink']) || '--'
    if (h === '主图链接') return pickOfferUrl(o, ['主图链接', 'mainImageUrl', 'imageUrl', 'picUrl', 'image']) || '--'
    if (h === '上架时间') return fmtDateOnly(productField(o, h))
    if (h === '30天销售额') return fmtYen(productField(o, h))
    return String(productField(o, h))
  }))
  // 文件名：对话标题 + 年月日时分秒
  const now = new Date()
  const p2 = (n: number) => String(n).padStart(2, '0')
  const ts = now.getFullYear() + p2(now.getMonth() + 1) + p2(now.getDate()) + p2(now.getHours()) + p2(now.getMinutes()) + p2(now.getSeconds())
  let convTitle = (convTitleFallback || '').trim()
  const pagerTitle = String(pager.queryTitle || '').trim()
  const promptTitle = pagerTitle || String(appState.currentExportQuery || '').trim()
  const exportTitle = (promptTitle || convTitle || '1688商品选品结果').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 50) || '1688商品选品结果'
  const fname = exportTitle + '_' + ts + '.xlsx'
  await exportTableToXlsx(PRODUCT_EXPORT_HEADERS, rows, fname, '1688商品选品结果', imgCells)
}

export async function exportCurrentMdTable() {
  const t = mdTablesRegistry.tables[panel.mdActiveTid]
  if (!t) return
  await exportMdTableToXlsx(t)
}

/* ==================== 会话商品结果渲染（原 renderConversationProducts） ==================== */
export function renderConversationProducts(payload: any, resultKey?: string, options: { restore?: boolean } = {}) {
  if (payload && Array.isArray(payload.products) && payload.products.length) {
    const offers = chatflowProductsToOffers(payload)
    const question = String(payload.query || payload.title || appState.currentResultQuery || appState.currentExportQuery || '选品结果').trim()
    const convScope = String(payload.conversationId || useActiveConvId() || 'current')
    const roundScope = String(payload.messageId || payload.resultKey || resultKey || 'round-' + question)
    const stableKey = String(resultKey || (convScope + ':' + roundScope)).slice(0, 200)
    const key = stableKey
    payload.query = question
    // 报告对接：当前展示的轮次若有 obsUrl，回填给"生成报告"指令使用
    const roundObsUrl = String(payload.obsUrl || '')
    if (roundObsUrl) {
      appState.lastPayloadNode = { source: 'result-round-cache', obsUrl: roundObsUrl }
    } else {
      try {
        const cachedConv = getConversationProducts(convScope)
        const hit = cachedConv && Array.isArray(cachedConv.rounds)
          ? cachedConv.rounds.filter((r: any) => r && r.obsUrl).pop()
          : (cachedConv && cachedConv.obsUrl ? { obsUrl: cachedConv.obsUrl } : null)
        if (hit) appState.lastPayloadNode = { source: 'result-round-cache', obsUrl: String(hit.obsUrl) }
      } catch (e) {}
    }
    appState.productResultTabs[key] = { payload, offers, title: question }
    if (!options.restore) {
      try { localStorage.setItem(ACTIVE_RESULT_TAB_KEY + ':' + String(convScope), key) } catch (e) {}
      setConversationViewMode(convScope, 'table')
    }
    // 确保右侧有商品标签并激活
    ensureProductResultTab(key, question, { activate: true })
    renderOffers(offers, { totalCount: offers.length, resultKey: key, resultPayload: payload, queryTitle: question })
    return true
  }
  // 当前轮没有可展示的商品时，保留用户已经打开的右侧预览。
  return false
}

/* ==================== 中栏"查看更多"商品卡片点击（原 document click 逻辑） ==================== */
export function openProductPreviewCard(key: string) {
  const data = productPreviews.get(key)
  if (!data) return
  appState.initialPreviewGuard = false
  setRightEmpty(false)
  openPreviewPanel()
  panel.skeletonVisible = true
  // 延迟渲染，让骨架屏有机会被用户看到
  setTimeout(() => {
    renderConversationProducts({ products: data.products, count: data.products.length, totalCount: data.totalCount, query: data.query || '', conversationId: data.convId || useActiveConvId() || '', messageId: data.messageId || '', obsUrl: String(data.obsUrl || '') }, data.resultKey || '')
    panel.skeletonVisible = false
  }, 250)
}

/* —— 报告卡片 / 商品预览卡点击事件委托（挂在 App 层） —— */
export function bindResultCardDelegation() {
  document.addEventListener('click', (event: Event) => {
    const target = event.target as HTMLElement
    // 报告卡片：凭 data-result-key 或 data-report-url 打开
    const reportCard = target.closest('.rd-done-card') as HTMLElement | null
    if (reportCard) {
      const rk = reportCard.dataset.resultKey
      if (rk && panel.resultTabs.find(t => t.key === rk)) { activateResultPreview(rk); return }
      const url = reportCard.dataset.reportUrl
      if (url) {
        const entry = { title: reportCard.dataset.reportTitle || '选品决策报告', url, time: reportCard.dataset.reportTime || '', remote: true, count: 0, resultKey: 'report:' + url }
        openRemoteReportView(entry)
      }
      return
    }
    // 商品预览卡"查看完整列表"
    const moreBtn = target.closest('.dld-products-more') as HTMLElement | null
    if (moreBtn && moreBtn.dataset.previewKey) {
      openProductPreviewCard(moreBtn.dataset.previewKey)
      return
    }
    // 中栏迷你表"查看更多"
    const mdMore = target.closest('.md-more-btn') as HTMLElement | null
    if (mdMore && mdMore.dataset.viewTable) {
      viewMdTableFull(mdMore.dataset.viewTable)
      return
    }
  })
}

/* —— 复制辅助 —— */
export function offerRowCellsForDetail(o: any) {
  const val = (keys: string[], fallback?: any) => {
    const fieldName = fieldNameForKeys(keys)
    const value = fieldName ? productField(o, fieldName) : productValue(o, keys)
    return value === '--' ? (fallback == null ? '--' : String(fallback)) : String(value)
  }
  return val
}

export { fmtN, mdCellHtml }
