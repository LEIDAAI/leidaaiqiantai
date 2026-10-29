/* =====================================================
 * 报告文档渲染器（自 index.html L10205-L10612 原样迁移）
 * Hero 头图 + 核心结论 + 章节卡片 + KPI 指标卡（右栏预览与导出 HTML 同构）
 * ===================================================== */
import { escapeHtml } from './common'
import { inlineMd, renderMarkdownBody, parseTableRow } from './markdown'

export const REPORT_KEYWORDS = ['选品报告', '调研报告', '分析报告', '市场报告', '竞品报告', '研究报告', '选品建议']

function parseMdTableRows(tl: string[]): { headers: string[]; rows: string[][] } | null {
  if (tl.length < 3) return null
  const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())
  const headers = cells(tl[0])
  if (headers.length < 2) return null
  const rows: string[][] = []
  for (let k = 1; k < tl.length; k++) {
    if (/^\s*\|?[\s:|-]+\|?\s*$/.test(tl[k])) continue
    const cs = cells(tl[k])
    if (cs.length !== headers.length) return null
    rows.push(cs)
  }
  return rows.length ? { headers, rows } : null
}

function renderKpiGrid(t: { headers: string[]; rows: string[][] }): string {
  let html = '<div class="rd-kpi-cap">' + t.headers.map(h => inlineMd(h)).join('<span> · </span>') + '</div><div class="rd-kpi-grid">'
  t.rows.forEach(r => {
    html += '<div class="rd-kpi"><div class="k-label">' + inlineMd(r[0]) + '</div><div class="k-value">' + inlineMd(r[1]) + '</div></div>'
  })
  return html + '</div>'
}

// 章节正文增强：2 列小表格（无图片、2~8 行）→ KPI 指标卡；其余走通用 Markdown 渲染（fullTables 不折叠）
function enhanceReportBody(md: string): string {
  const src = String(md || '')
  if (!src.trim()) return ''
  const lines = src.split('\n')
  const kpiBlocks: string[] = []
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    if (/^\s*\|.*\|\s*$/.test(lines[i])) {
      let j = i
      const tl: string[] = []
      while (j < lines.length && /^\s*\|.*\|\s*$/.test(lines[j])) { tl.push(lines[j]); j++ }
      const t = parseMdTableRows(tl)
      const hasImg = tl.some(l => /!\[|<img/i.test(l))
      // 首列平均字数过长的 2 列表（如长关键词清单）不适合 KPI 卡，保留绿头表格
      const firstColAvg = t ? t.rows.reduce((s, r) => s + String(r[0]).length, 0) / t.rows.length : 0
      if (t && t.headers.length === 2 && t.rows.length >= 2 && t.rows.length <= 8 && !hasImg && firstColAvg <= 12) {
        out.push('', '\u0000KPI' + kpiBlocks.length + '\u0000', '')
        kpiBlocks.push(renderKpiGrid(t))
      } else {
        out.push(tl.join('\n'))
      }
      i = j; continue
    }
    out.push(lines[i]); i++
  }
  let body = renderMarkdownBody(out.join('\n'), { fullTables: true })
  kpiBlocks.forEach((h, k) => {
    const ph = '\u0000KPI' + k + '\u0000'
    const reP = new RegExp('<p class="md-p">\\s*' + ph + '\\s*</p>')
    body = reP.test(body) ? body.replace(reP, () => h) : body.replace(ph, () => h)
  })
  return body
}

export interface ReportDoc { html: string; title: string; toc: Array<{ id: string; title: string }>; time: string }

// 报告专用渲染器：Hero 头图 + 核心结论 + 章节卡片 + KPI 指标卡
export function renderReportDoc(raw: string): ReportDoc {
  let text = String(raw)
  let heroTitle = ''
  text = text.replace(/^#\s+(.+)$/m, (_m, t) => { heroTitle = t; return '' })
  if (!heroTitle) {
    const m = text.match(/^#{1,4}\s*(.+)$/m)
    if (m) { heroTitle = m[1]; text = text.replace(m[0], '') }
  }
  heroTitle = (heroTitle || '选品报告').replace(/\[(?:chart|search|tool|think|web)\]/gi, '').replace(/[`*>#]/g, '').trim().slice(0, 60) || '选品报告'
  const lines = text.split('\n')
  const sections: Array<{ title: string; lines: string[] }> = []
  const prelude: string[] = []
  let cur: { title: string; lines: string[] } | null = null
  for (let i = 0; i < lines.length; i++) {
    const m2 = lines[i].match(/^#{2}\s+(.+)$/)
    if (m2) {
      cur = { title: m2[1].replace(/`/g, '').trim(), lines: [] }
      sections.push(cur)
    } else if (cur) {
      cur.lines.push(lines[i])
    } else {
      prelude.push(lines[i])
    }
  }
  const timeStr = new Date().toLocaleString('zh-CN', { hour12: false })
  let html = '<div class="rd-hero"><span class="rd-hero-badge">DIANLEIDA · AI 选品报告</span>'
    + '<h1>' + inlineMd(heroTitle) + '</h1>'
    + '<div class="rd-hero-sub">生成时间 ' + timeStr + ' · 基于实时市场数据自动生成</div></div>'
  const toc: Array<{ id: string; title: string }> = []
  const preHtml = enhanceReportBody(prelude.join('\n'))
  if (preHtml.trim()) html += '<div class="rd-conclusion"><div class="rd-con-title">📌 核心结论</div>' + preHtml + '</div>'
  sections.forEach((sec, i) => {
    const sid = 'rdsec' + (i + 1)
    toc.push({ id: sid, title: sec.title })
    html += '<div class="rd-section" id="' + sid + '"><div class="rd-sec-head" data-title="' + escapeHtml(sec.title) + '">'
      + '<span class="rd-sec-no">' + String(i + 1).padStart(2, '0') + '</span>'
      + '<h2>' + inlineMd(sec.title) + '</h2></div>'
      + '<div class="rd-sec-body">' + enhanceReportBody(sec.lines.join('\n')) + '</div></div>'
  })
  if (!sections.length && !preHtml.trim()) {
    html += '<div class="rd-section"><div class="rd-sec-body">' + enhanceReportBody(text) + '</div></div>'
  }
  return { html, title: heroTitle, toc, time: timeStr }
}

// 独立 HTML 导出的自包含样式（店雷达绿主题，与右栏预览同构）
export const REPORT_EXPORT_CSS = `
    * { box-sizing: border-box; }
    body { margin: 0; background: #F8F9FA; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif; color: #1F2D1F; }
    .report-doc { max-width: 900px; margin: 28px auto; background: #fff; border-radius: 14px; padding: 32px 40px 28px; box-shadow: 0 2px 18px rgba(0,135,60,.08); font-size: 14px; line-height: 1.9; }
    .rd-hero { position: relative; overflow: hidden; border-radius: 12px; padding: 32px 32px 26px; margin-bottom: 20px; background: linear-gradient(135deg, #006C30 0%, #00873C 50%, #00B050 100%); color: #fff; }
    .rd-hero::after { content: ''; position: absolute; right: -50px; top: -60px; width: 210px; height: 210px; border-radius: 50%; background: rgba(255,255,255,.10); }
    .rd-hero::before { content: ''; position: absolute; right: 120px; bottom: -70px; width: 160px; height: 160px; border-radius: 50%; background: rgba(255,255,255,.07); }
    .rd-hero-badge { position: relative; z-index: 1; display: inline-block; font-size: 11px; letter-spacing: 2px; background: rgba(255,255,255,.18); border: 1px solid rgba(255,255,255,.35); padding: 3px 12px; border-radius: 12px; margin-bottom: 12px; }
    .rd-hero h1 { position: relative; z-index: 1; margin: 0 0 10px; font-size: 26px; line-height: 1.4; font-weight: 800; color: #fff; }
    .rd-hero a { color: #fff; text-decoration: underline; }
    .rd-hero-sub { position: relative; z-index: 1; font-size: 12.5px; color: rgba(255,255,255,.88); }
    .rd-conclusion { background: linear-gradient(135deg, #F0F9F3, #E6F4EB); border-left: 6px solid #00873C; border-radius: 10px; padding: 16px 22px; margin-bottom: 20px; }
    .rd-con-title { font-size: 15px; font-weight: 800; color: #00873C; margin-bottom: 8px; }
    .rd-conclusion .md-p { margin: 6px 0; }
    .rd-section { background: #fff; border: 1px solid #E5E7EB; border-radius: 12px; padding: 20px 24px; margin-bottom: 16px; box-shadow: 0 2px 10px rgba(0,135,60,.05); page-break-inside: avoid; }
    .rd-sec-head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    .rd-sec-no { flex: none; width: 32px; height: 32px; border-radius: 10px; background: linear-gradient(135deg, #00B050, #00873C); color: #fff; font-size: 14px; font-weight: 800; display: flex; align-items: center; justify-content: center; }
    .rd-sec-head h2 { margin: 0; font-size: 18px; font-weight: 800; color: #0F3D22; line-height: 1.4; }
    .rd-sec-body > :first-child { margin-top: 0; }
    .rd-sec-body > :last-child { margin-bottom: 0; }
    .rd-kpi-cap { font-size: 12px; color: #7B858E; margin: 2px 0 10px; }
    .rd-kpi-cap span { color: #B9C2BF; }
    .rd-kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; margin: 12px 0; }
    .rd-kpi { background: #F7FBF8; border: 1px solid #E3EFE7; border-radius: 10px; padding: 13px 15px; }
    .rd-kpi .k-label { font-size: 12px; color: #6E7F76; margin-bottom: 5px; }
    .rd-kpi .k-value { font-size: 20px; font-weight: 800; color: #00873C; line-height: 1.3; word-break: break-all; }
    .report-doc h3, .report-doc .md-h1 { font-size: 18px; font-weight: 800; color: #0F3D22; margin: 20px 0 12px; padding-left: 11px; border-left: 5px solid #00B050; line-height: 1.4; }
    .report-doc h3:first-child, .report-doc .md-h1:first-child { margin-top: 0; }
    .report-doc h4, .report-doc .md-h2 { font-size: 16px; font-weight: 700; color: #0F3D22; margin: 18px 0 10px; padding-left: 9px; border-left: 4px solid #7FD3A0; }
    .report-doc h5, .report-doc h6, .report-doc .md-h3, .report-doc .md-h4 { font-size: 14.5px; font-weight: 700; color: #24352B; margin: 14px 0 8px; }
    .report-doc p { margin: 8px 0; }
    .report-doc strong { color: #00873C; }
    .report-doc a { color: #00873C; text-decoration: none; }
    .report-doc a:hover { text-decoration: underline; }
    .report-doc ul, .report-doc ol { margin: 10px 0; padding-left: 24px; }
    .report-doc li { margin: 6px 0; }
    .report-doc blockquote { margin: 12px 0; padding: 12px 18px; background: #F0F7F2; border-left: 4px solid #00B050; border-radius: 0 8px 8px 0; color: #3D5247; }
    .report-doc .md-ol { list-style: none; padding-left: 0; counter-reset: rstep; }
    .report-doc .md-ol li { counter-increment: rstep; position: relative; padding: 11px 14px 11px 46px; margin: 8px 0; background: #FAFDFB; border: 1px solid #E6F1EA; border-radius: 10px; }
    .report-doc .md-ol li::before { content: counter(rstep); position: absolute; left: 13px; top: 50%; transform: translateY(-50%); width: 22px; height: 22px; border-radius: 50%; background: linear-gradient(135deg, #00B050, #00873C); color: #fff; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
    .report-doc ul li::marker { color: #00B050; }
    .report-doc .md-table-wrap { margin: 14px 0; border: 1px solid #E1EAE4; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,135,60,.05); }
    .report-doc table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .report-doc .md-table th, .report-doc th { background: linear-gradient(135deg, #00873C, #00A34A); color: #fff; font-weight: 600; padding: 10px 13px; text-align: left; white-space: nowrap; border: none; }
    .report-doc .md-table td, .report-doc td { padding: 9px 13px; border: none; border-bottom: 1px solid #EDF2EF; vertical-align: top; }
    .report-doc .md-table tr:hover td { background: #F4FAF6; }
    .report-doc img { max-width: 100%; border-radius: 6px; }
    .report-doc .md-cell-prod { display: flex; align-items: center; gap: 9px; }
    .report-doc .md-cell-prod img { width: 44px; height: 44px; max-width: 44px; max-height: 44px; object-fit: cover; flex: none; }
    .report-doc code { background: #F0F7F2; color: #006C30; padding: 2px 6px; border-radius: 4px; font-size: 90%; }
    .rd-toc { position: fixed; left: calc(50% - 668px); top: 110px; width: 196px; font-size: 12.5px; }
    .rd-toc-title { font-weight: 800; color: #0F3D22; margin-bottom: 8px; padding-left: 6px; }
    .rd-toc a { display: block; color: #5B6B62; text-decoration: none; padding: 5px 10px; border-radius: 7px; margin: 1px 0; line-height: 1.5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rd-toc a:hover { background: #EAF6EF; color: #00873C; }
    .rd-toolbar { position: fixed; right: 26px; bottom: 26px; }
    .rd-toolbar button { cursor: pointer; border: none; border-radius: 22px; padding: 11px 20px; font-size: 13.5px; font-weight: 700; background: linear-gradient(135deg, #00B050, #00873C); color: #fff; box-shadow: 0 4px 14px rgba(0,135,60,.35); }
    .rd-toolbar button:hover { filter: brightness(1.06); }
    .report-footer { max-width: 900px; margin: 0 auto 34px; text-align: center; font-size: 12px; color: #909399; }
    @media (max-width: 1366px) { .rd-toc { display: none; } }
    @media print {
      body { background: #fff; }
      .rd-toc, .rd-toolbar { display: none; }
      .report-doc { max-width: none; margin: 0; box-shadow: none; padding: 8px 2px; }
      .rd-section { box-shadow: none; }
    }
  `

// 组装独立完整报告 HTML（下载导出与右侧 iframe 分屏预览共用，保证所见即所得）
export function buildStandaloneReportHtml(rp: any, opts: { printBtn?: boolean } = {}): string {
  const toc = Array.isArray(rp.toc) && rp.toc.length
    ? '<nav class="rd-toc"><div class="rd-toc-title">📑 目录</div>'
      + rp.toc.map((t: any) => '<a href="#' + t.id + '">' + escapeHtml(t.title) + '</a>').join('') + '</nav>\n'
    : ''
  const printBtn = opts.printBtn === false
    ? ''
    : '<div class="rd-toolbar"><button onclick="window.print()">🖨 打印 / 存 PDF</button></div>\n'
  return '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n'
    + '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
    + '<title>' + escapeHtml(rp.title) + '</title>\n'
    + '<style>' + REPORT_EXPORT_CSS + '</style>\n</head>\n<body>\n'
    + toc
    + '<div class="report-doc">' + rp.html + '</div>\n'
    + printBtn
    + '<div class="report-footer">由店雷达 AI 生成 · ' + rp.time + '</div>\n'
    + '</body>\n</html>'
}

export function downloadReportHtml(rp: any) {
  if (!rp) return
  const safeTitle = rp.title.replace(/[\\/:*?"<>|]/g, '_')
  const page = buildStandaloneReportHtml(rp)
  const blob = new Blob(['\ufeff', page], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = safeTitle + '.html'
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}

// 报告文档注入的横向滚动增强样式
export const REPORT_SCROLL_CSS = [
  'html,body{overflow-x:auto!important;}',
  '.dld-hscroll{overflow-x:auto!important;-webkit-overflow-scrolling:touch;scrollbar-width:thin;}',
  '.dld-hscroll::-webkit-scrollbar{height:10px;}',
  '.dld-hscroll::-webkit-scrollbar-thumb{background:#c2ccd8;border-radius:6px;}',
  '.dld-hscroll::-webkit-scrollbar-track{background:#eef1f4;}',
  '.dld-hscroll table{max-width:none!important;}'
].join('\n')

export { parseTableRow }
