/* =====================================================
 * 轻量 Markdown 渲染 + 表格抽取 + 报告文档渲染（自 index.html 原样迁移）
 * renderMarkdown / renderTablesOnly / renderReportDoc 是纯函数，原样搬移不重写。
 * ===================================================== */
import { escapeHtml } from './common'

// 中栏表格超出该行数后折叠，底部显示"查看更多"
export const MD_TABLE_VISIBLE_ROWS = 5
// 数字列识别：表头含价格/销量/订单等关键词的列右对齐
export const MD_NUM_HEAD_RE = /(价|销量|订单|件数|销售额|佣金|利润|评分|库存|数量|点击|转化)/

/* —— 对话表格注册表：中栏气泡迷你表与右栏完整预览共用（原 window.__mdTables） —— */
export interface MdTableRecord {
  tid: string
  headers: string[]
  rows: string[][]
  title: string
}
export const mdTablesRegistry = {
  seq: 0,
  tables: {} as Record<string, MdTableRecord>
}

// 行内 Markdown：图片 → 链接 → 加粗 → 行内代码
export function inlineMd(s: string): string {
  if (!s) return ''
  // 图片 ![alt](url)
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, url) =>
    '<img class="md-img" src="' + escapeHtml(url) + '" alt="' + escapeHtml(alt) + '" loading="lazy" onerror="this.style.display=\'none\'">')
  // 链接 [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, txt, url) =>
    '<a class="md-link" href="' + escapeHtml(url) + '" target="_blank" rel="noopener">' + inlineMd(txt) + '</a>')
  // 加粗 **text**
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  // 行内代码 `code`
  s = s.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')
  // <br> 保留
  return s
}

// 解析表格行 → 单元格 HTML 数组
export function parseTableRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  return s.split('|').map(c => inlineMd(c.trim()))
}

// 数字列识别：返回 ' class="num-col"' 或 ''
export function mdColCls(h: string): string {
  return MD_NUM_HEAD_RE.test(String(h || '')) ? ' class="num-col"' : ''
}

// 保留原表头与数据行，保证商品列表和 Excel 导出列完全一致。
export function mdStripLinkCol(headers: string[], rows: string[][]): { headers: string[]; rows: string[][] } {
  return { headers: headers || [], rows: rows || [] }
}

// 单元格 → td：含图片且有文字的视为"商品信息"单元格，包成图左文右结构；纯图单元格走轻量分支
export function mdCellHtml(c: string, h: string): string {
  const cls = mdColCls(h)
  const idx = String(c).indexOf('<img')
  if (idx === -1) return '<td' + cls + '>' + c + '</td>'
  const end = String(c).indexOf('>', idx)
  const imgTag = end > idx ? String(c).slice(idx, end + 1) : ''
  if (!imgTag || imgTag.indexOf('class="md-img"') === -1) return '<td' + cls + '>' + c + '</td>'
  const rest = (String(c).slice(0, idx) + String(c).slice(end + 1)).trim()
  // 纯图单元格：不包 md-cell-prod 宽容器（其 min/max-width 会把只有 44px 小图的列撑到 190px+）
  if (!rest) return '<td' + cls + '>' + imgTag + '</td>'
  return '<td' + cls + '><div class="md-cell-prod">' + imgTag + '<div class="prod-txt">' + rest + '</div></div></td>'
}

interface MdPart { type: 'text' | 'think'; content: string }

// 渲染非 think 的 Markdown 正文（表格 / 图片 / 链接 / 加粗 / 标题 / 引用 / 列表）
export function renderMarkdownBody(src: string, opts: { fullTables?: boolean } = {}): string {
  let lines = String(src || '').replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // 空行
    if (/^\s*$/.test(line)) { i++; continue }

    // 标题
    const hm = line.match(/^(#{1,4})\s+(.*)$/)
    if (hm) {
      const lvl = hm[1].length
      out.push('<h' + (lvl + 2) + ' class="md-h' + lvl + '">' + inlineMd(hm[2]) + '</h' + (lvl + 2) + '>')
      i++; continue
    }

    // 引用
    if (/^>\s?/.test(line)) {
      const quote: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      out.push('<blockquote class="md-quote">' + inlineMd(quote.join(' ')) + '</blockquote>')
      continue
    }

    // 表格
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:-]+\|[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      const tableRows: string[][] = []
      // 表头
      tableRows.push(parseTableRow(line))
      i += 2 // 分隔行
      // 数据行
      while (i < lines.length && lines[i].includes('|') && !/^\s*$/.test(lines[i])) {
        if (/^\s*\|?[\s:-]+\|[\s:|-]+\|?\s*$/.test(lines[i])) { i++; continue }
        tableRows.push(parseTableRow(lines[i]))
        i++
      }
      // 入口剔除「商品链接」列（与 renderTablesOnly 同口径）
      const strippedMd = mdStripLinkCol(tableRows[0], tableRows.slice(1))
      const mdHeaders = strippedMd.headers
      const mdDataRows = strippedMd.rows
      const mdTotal = mdDataRows.length
      let mdShown = mdDataRows
      let moreBtn = ''
      let tid = ''
      // 报告视图（fullTables）：完整展示所有行，不折叠、不注册详情
      if (mdTotal > MD_TABLE_VISIBLE_ROWS && !opts.fullTables) {
        mdShown = mdDataRows.slice(0, MD_TABLE_VISIBLE_ROWS)
        mdTablesRegistry.seq += 1
        tid = String(mdTablesRegistry.seq)
        mdTablesRegistry.tables[tid] = { tid, headers: mdHeaders, rows: mdDataRows, title: '对话表格详情' }
        moreBtn = '<div class="md-more-btn" data-view-table="' + tid + '">查看更多 · 共 ' + mdTotal + ' 条数据</div>'
      }
      const thead = '<thead><tr>' + mdHeaders.map(c => '<th' + mdColCls(c) + '>' + c + '</th>').join('') + '</tr></thead>'
      const tbody = '<tbody>' + mdShown.map(r => '<tr>' + r.map((c, ci) => mdCellHtml(c, mdHeaders[ci])).join('') + '</tr>').join('') + '</tbody>'
      out.push('<div class="md-table-wrap"><table class="md-table"' + (moreBtn ? ' data-tid="' + tid + '"' : '') + '>' + thead + tbody + '</table>' + moreBtn + '</div>')
      continue
    }

    // 无序列表
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push('<li>' + inlineMd(lines[i].replace(/^[-*]\s+/, '')) + '</li>')
        i++
      }
      out.push('<ul class="md-ul">' + items.join('') + '</ul>')
      continue
    }

    // 有序列表
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push('<li>' + inlineMd(lines[i].replace(/^\d+\.\s+/, '')) + '</li>')
        i++
      }
      out.push('<ol class="md-ol">' + items.join('') + '</ol>')
      continue
    }

    // 普通段落（连续非空非格式行合并）
    const para: string[] = []
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,4}\s|>\s?|[-*]\s|\d+\.\s)/.test(lines[i]) && !(lines[i].includes('|') && i + 1 < lines.length && /^\s*\|?[\s:-]+\|[\s:|-]+\|?\s*$/.test(lines[i + 1]))) {
      para.push(lines[i])
      i++
    }
    if (para.length) out.push('<p class="md-p">' + inlineMd(para.join('<br>')) + '</p>')
  }
  return out.join('')
}

// 轻量 Markdown → HTML 渲染（支持 think 折叠、表格、图片、链接、加粗、标题、引用、列表）
export function renderMarkdown(raw: any): string {
  if (!raw) return ''
  const text = String(raw)

  // 1) 提取 <think> 内容 → 折叠区域
  let parts: MdPart[] = []
  const thinkRe = /<think>([\s\S]*?)<\/think>/g
  let m: RegExpExecArray | null
  let lastIdx = 0
  while ((m = thinkRe.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push({ type: 'text', content: text.slice(lastIdx, m.index) })
    parts.push({ type: 'think', content: m[1] })
    lastIdx = m.index + m[0].length
  }
  if (lastIdx < text.length) parts.push({ type: 'text', content: text.slice(lastIdx) })
  if (parts.length === 0) parts = [{ type: 'text', content: text }]

  const htmlParts = parts.map(p => {
    if (p.type === 'think') {
      const inner = p.content.replace(/<!--[^>]*-->/g, '').trim()
      if (!inner) return ''
      return '<details class="md-think"><summary>💭 AI 思考过程</summary><div class="md-think-body">' + escapeHtml(inner).replace(/\n/g, '<br>') + '</div></details>'
    }
    return renderMarkdownBody(p.content)
  })
  return htmlParts.join('')
}

/* ==================== 商品 JSON 块提取（L9891-L9936） ==================== */
// 去除 <think> 块（含未闭合的尾部 think），返回剩余正文
export function stripThinkBlocks(text: any): string {
  return String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*$/g, '')
}

// 提取 Markdown 表格块 → [{ title, lines: [表头行, 数据行...] }]；表格名取其前最近的 Markdown 标题
export function extractMdTableBlocks(src: any): Array<{ title: string; lines: string[] }> {
  const lines = String(src || '').replace(/\r\n/g, '\n').split('\n')
  const isSep = (l: string) => /^\s*\|?[\s:-]+\|[\s:|-]+\|?\s*$/.test(l)
  const blocks: Array<{ title: string; lines: string[] }> = []
  let lastHeading = ''
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const hm = line.match(/^(#{1,4})\s+(.*)$/)
    if (hm) { lastHeading = hm[2].trim(); i++; continue }
    if (line.includes('|') && i + 1 < lines.length && isSep(lines[i + 1])) {
      const rows = [line]
      i += 2 // 表头 + 分隔行
      while (i < lines.length && lines[i].includes('|') && !/^\s*$/.test(lines[i])) {
        if (isSep(lines[i])) { i++; continue }
        rows.push(lines[i])
        i++
      }
      blocks.push({ title: lastHeading, lines: rows })
      lastHeading = '' // 一张表只领一次标题
      continue
    }
    i++
  }
  return blocks
}

// 是否包含 Markdown 表格（表格型回复判定）
export function hasMdTable(src: any): boolean {
  return extractMdTableBlocks(stripThinkBlocks(src)).length > 0
}

// 定位回复中第一个商品 JSON 块的起止位置（括号平衡扫描）
export function locateSchemaJsonBlock(src: string): { idx: number; end: number } | null {
  const match = /\{\s*"(?:schema_version|answer|obsUrl|totalCount|products)"\s*:/.exec(src)
  if (!match) return null
  const idx = match.index
  let depth = 0, end = -1, inStr = false, esc = false
  for (let i = idx; i < src.length; i += 1) {
    const ch = src[i]
    if (esc) { esc = false; continue }
    if (ch === '\\') { esc = true; continue }
    if (ch === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (ch === '{') depth += 1
    else if (ch === '}') { depth -= 1; if (depth === 0) { end = i + 1; break } }
  }
  return end > 0 ? { idx: idx, end: end } : null
}

// 清理后端 payload 包裹注释
export function cleanPayloadMarkers(str: any): string {
  return String(str || '').replace(/<!--\s*PAYLOAD_(?:START|END)\s*-->/g, '').trim()
}

// 剥离回复中的元信息 JSON 块，避免原始 JSON 文本显示在气泡里
export function stripProductJsonBlock(src: any): string {
  if (!src) return ''
  const range = locateSchemaJsonBlock(src)
  if (!range) return cleanPayloadMarkers(src)
  return cleanPayloadMarkers(src.slice(0, range.idx).trimEnd() + ' ' + src.slice(range.end))
}

export function extractProductJson(src: any): { text: string; count: number; products: any[] } | null {
  if (!src) return null
  const s = stripThinkBlocks(src)
  const range = locateSchemaJsonBlock(s)
  if (!range) return null
  const jsonStr = s.slice(range.idx, range.end)
  try {
    const obj = JSON.parse(jsonStr)
    // 兼容两代协议：旧版为 data.products 包裹；新版信封顶层即 products，人类可读文案在 answer 字段
    const data = obj && obj.data ? obj.data : obj
    const products = data && Array.isArray(data.products) ? data.products : null
    if (!products || !products.length) return null
    const prefixText = cleanPayloadMarkers(s.slice(0, range.idx))
    const innerText = obj && typeof obj.answer === 'string' ? obj.answer.trim() : ''
    return { text: prefixText || innerText, count: data.count || products.length, products }
  } catch (e) { return null }
}

// 表格型回复渲染：每张表注册到 mdTablesRegistry 供右栏全量预览；默认最多展示 5 行
export function renderTablesOnly(src: string): string {
  const blocks = extractMdTableBlocks(stripThinkBlocks(src))
  return blocks.map(b => {
    const tableRows = b.lines.map(parseTableRow)
    const stripped = mdStripLinkCol(tableRows[0], tableRows.slice(1))
    const headers = stripped.headers
    const dataRows = stripped.rows
    const total = dataRows.length
    mdTablesRegistry.seq += 1
    const tid = String(mdTablesRegistry.seq)
    mdTablesRegistry.tables[tid] = { tid, headers, rows: dataRows, title: b.title || '对话表格详情' }
    const shown = total > MD_TABLE_VISIBLE_ROWS ? dataRows.slice(0, MD_TABLE_VISIBLE_ROWS) : dataRows
    // 表头全部可排序（升降序、作用于全量数据而非当前 5 行）
    const thead = '<thead><tr>' + headers.map((c, i) => '<th class="sortable' + (MD_NUM_HEAD_RE.test(String(c)) ? ' num-col' : '') + '" data-sort-key="' + i + '" title="点击按本列排序">' + c + ' <span class="sort-indicator">⇕</span></th>').join('') + '</tr></thead>'
    const tbody = '<tbody>' + shown.map(r => '<tr>' + r.map((c, ci) => mdCellHtml(c, headers[ci])).join('') + '</tr>').join('') + '</tbody>'
    const btn = total ? '<div class="md-more-btn" data-view-table="' + tid + '">'
      + (total > MD_TABLE_VISIBLE_ROWS ? ('查看更多 · 共 ' + total + ' 条数据') : ('查看完整表格 · ' + total + ' 条数据')) + '</div>' : ''
    return '<div class="md-table-wrap"><table class="md-table" data-tid="' + tid + '">' + thead + tbody + '</table>' + btn + '</div>'
  }).join('')
}

/* ==================== AI 回答统一渲染入口（L10119-L10164） ==================== */
// 依赖注入：isReportAnswer / buildLastReport / buildReportDoneCard 由报告模块提供，
// 避免循环依赖（原实现靠 function 提升 + typeof 检查）。
let reportHooks: {
  isReportAnswer: (t: string) => boolean
  buildLastReport: (a: string) => any
  buildReportDoneCard: (rp: any) => string
} | null = null
export function setReportHooks(hooks: typeof reportHooks) { reportHooks = hooks }

// 从用户真实提问提取核心搜索词（只做纯文本前缀剥离与截断）
export const extractSearchKw = (q: any): string => {
  let t = String(q || '').trim()
  // 上下文兜底拼接的文本（如「外套，我想要300条」）：优先取第一段商品词
  const segs = t.split(/[，,]/)
  if (segs.length > 1 && /[\u4e00-\u9fa5]{2,}/.test(segs[0])) t = segs[0].trim()
  t = t.replace(/^(帮我|帮忙|请|麻烦|你好|您好|hi|hello)[，,、\s]*/i, '')
  t = t.replace(/^(我想|我要|想要|需要|给我|准备|打算)[，,、\s]*/i, '')
  t = t.replace(/^(看下|看看|看一下|找下|找找|找一下|搜下|搜搜|搜一下|查下|查查|查一下|推荐下|推荐一下|推荐|选下|选品|筛选|找|搜|查)[，,、\s]*/i, '')
  t = t.replace(/[？?！!。，,、\s]+/g, ' ').trim()
  if (t.length > 16) t = t.slice(0, 16)
  return t || '选品'
}

export function renderAiAnswerHtml(answer: any): string {
  const src = String(answer || '')
  // 报告指令 JSON（历史会话恢复场景）：live 链路已在 onDone 拦截并渲染卡片，此处只做友好兜底展示
  if (src.length < 400 && /^\{[\s\S]*"action"\s*:\s*"report"/.test(src.trim())) {
    let repTitle = ''
    try { const d = JSON.parse(src.trim()); repTitle = String(d && d.title || '').trim() } catch (e) {}
    const hint = repTitle
      ? '「' + repTitle + '」报告请求记录：此轮没有已保存的报告链接。'
      : '报告请求记录：此轮没有已保存的报告链接。'
    return renderMarkdown('_' + hint + '_')
  }
  // 报告类回复优先于商品 JSON：报告正文可能嵌有商品数据块，但刷新后仍必须恢复为报告卡片。
  if (reportHooks && reportHooks.isReportAnswer(src)) {
    reportHooks.buildLastReport(src)
    return reportHooks.buildReportDoneCard(null)
  }
  // 商品 JSON 只进入右栏数据通道，气泡仅显示摘要（兼容 message.answer 直接携带 JSON）。
  const pj = extractProductJson(src)
  if (pj) return pj.text ? renderMarkdown(pj.text) : ''
  // 3) 表格型回复：只渲染表格，"查看更多"在右栏预览完整数据
  if (hasMdTable(src)) {
    return renderTablesOnly(stripProductJsonBlock(src))
  }
  // 4) 普通回复：Markdown 渲染（剥离残留 JSON 块）
  const text = stripProductJsonBlock(src)
  return renderMarkdown(text)
}
