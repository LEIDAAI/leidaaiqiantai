<script setup lang="ts">
/* =====================================================
 * 右侧结果预览面板（原 index.html 右栏 DOM 还原）
 * 结构：折叠按钮 / 结果标签 / 空态 / right-body（报告 / 商品表 / 对话表格详情）
 * ===================================================== */
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import {
  panel, offerPageRows, activateResultPreview, removeResultTab, setCollapsed,
  setOfferPage, setOfferSize, jumpToOfferPage, toggleRowCheck, checkAllPage,
  setOfferViewMode, sortMdTable, exportPreviewXlsx, exportCurrentMdTable,
  closeReportView, closeMdTab, activateMdTab
} from '../stores/panel'
import { mdTablesRegistry, mdCellHtml, MD_NUM_HEAD_RE } from '../utils/markdown'
import { REPORT_SCROLL_CSS, buildStandaloneReportHtml, downloadReportHtml } from '../utils/reportDoc'
import { flashToast, escapeHtml, fmtN } from '../utils/common'
import {
  PRODUCT_FIELD_KEYS, productField, productValue, fieldNameForKeys, offerRowKey,
  fmtDateOnly, fmtYen, companyTypeText, categoryLast, categoryFull
} from '../utils/productFields'

/* ==================== 面板壳 ==================== */
function onCollapseClick() { setCollapsed(!panel.collapsed) }

const tabName = (t: { type: string; title: string }) =>
  t.type === 'report' ? '📄 ' + t.title : (t.type === 'table' ? '📋 ' + t.title : t.title)

/* ==================== 商品表（列表 / 卡片双模式） ==================== */
const previewTableEl = ref<HTMLTableElement | null>(null)
const offerCardsEl = ref<HTMLElement | null>(null)
const checkAllEl = ref<HTMLInputElement | null>(null)
const isCardMode = computed(() => panel.offerViewMode === 'card')
const offerPage = computed(() => offerPageRows.value)

const textCell = (v: any) => escapeHtml(String(v == null || v === '' ? '--' : v))
const linkCell = (label: string, href: string) =>
  href ? '<a href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(label) + '</a>' : '--'
const normUrl = (u: any) => { const s = String(u == null ? '' : u).trim(); return (!s || s === '--') ? '' : s }
function makeVal(o: any) {
  return (keys: string[], fallback?: any) => {
    const fieldName = fieldNameForKeys(keys)
    const value = fieldName ? productField(o, fieldName) : productValue(o, keys)
    return value === '--' ? (fallback == null ? '--' : String(fallback)) : String(value)
  }
}
function shopBadgesHtml(o: any, val: ReturnType<typeof makeVal>) {
  const trustYearsTxt = val(PRODUCT_FIELD_KEYS.trustYears)
  const companyTypeTxt = companyTypeText(productField(o, 'companyType'))
  const trustBadgeTxt = trustYearsTxt !== '--'
    ? (/^诚/.test(trustYearsTxt) ? trustYearsTxt : '诚' + trustYearsTxt.replace(/^诚信通\s*/, ''))
    : trustYearsTxt
  return (trustBadgeTxt && trustBadgeTxt !== '--' ? '<span class="shop-badge sb-trust" title="诚信通年限">' + escapeHtml(trustBadgeTxt) + '</span>' : '') +
    (companyTypeTxt && companyTypeTxt !== '--' ? '<span class="shop-badge sb-type" title="公司类型">' + escapeHtml(companyTypeTxt) + '</span>' : '')
}
function locationOf(o: any, val: ReturnType<typeof makeVal>) {
  const locationRaw = val(PRODUCT_FIELD_KEYS.location)
  return locationRaw === '--' ? [val(PRODUCT_FIELD_KEYS.province), val(PRODUCT_FIELD_KEYS.city)].filter(x => x !== '--').join(' ') || '--' : locationRaw
}
// 复制操作按钮（列表 / 卡片共用）
function copyActionsHtml(rawTitle: string, linkUrl: string) {
  return '<span class="offer-copy-actions">' +
    '<button type="button" class="offer-copy-btn" data-copy-kind="title" data-copy-value="' + escapeHtml(rawTitle) + '" title="复制标题" aria-label="复制标题" data-tip="复制标题"><span class="copy-icon" aria-hidden="true"></span></button>' +
    '<button type="button" class="offer-copy-btn link-copy" data-copy-kind="link" data-copy-value="' + escapeHtml(linkUrl) + '" title="复制链接" aria-label="复制链接" data-tip="复制链接"' + (!linkUrl ? ' disabled' : '') + '><span class="link-icon" aria-hidden="true"></span></button>' +
    '</span>'
}
// 详情字段条目 → pd-item HTML（条目结构：[字段名, 原始值, 展示值?, 悬停全文?]）
function detailItemsHtml(fields: any[][]) {
  return fields.map(f => {
    const disp = f[2] != null ? f[2] : f[1]
    const fullTxt = f[3] != null ? f[3] : f[1]
    return '<div class="pd-item" title="' + escapeHtml(f[0] + '：' + fullTxt) + '"><span class="pd-k">' + f[0] + '</span><span class="pd-v">' + textCell(disp) + '</span></div>'
  }).join('')
}
function commonDetailFields(o: any, val: ReturnType<typeof makeVal>, offerId: any) {
  const categoryRaw = val(PRODUCT_FIELD_KEYS.category)
  return [
    ['商品类目', categoryRaw, categoryLast(categoryRaw), categoryFull(categoryRaw)],
    ['商品ID', val(PRODUCT_FIELD_KEYS.offerId, offerId)],
    ['代发价', val(PRODUCT_FIELD_KEYS.consignPrice)],
    ['24H揽收率', val(PRODUCT_FIELD_KEYS.collect24)],
    ['48H揽收率', val(PRODUCT_FIELD_KEYS.collect48)],
    ['7日订单增长率', val(PRODUCT_FIELD_KEYS.growth7)],
    ['7日采购集中率', val(PRODUCT_FIELD_KEYS.concentration7)],
    ['商品标识', val(PRODUCT_FIELD_KEYS.tag)],
    ['商品货号', val(PRODUCT_FIELD_KEYS.info)],
    ['包装信息', val(PRODUCT_FIELD_KEYS.packaging)],
    ['供货类型', val(PRODUCT_FIELD_KEYS.supply)],
    ['店铺48H履约率', val(PRODUCT_FIELD_KEYS.fulfillment48)],
    ['店铺回头率', val(PRODUCT_FIELD_KEYS.shopReturn)],
    ['店铺响应率', val(PRODUCT_FIELD_KEYS.shopResponse)],
    ['综合服务', val(PRODUCT_FIELD_KEYS.service)],
    ['所在地', locationOf(o, val)],
    ['卖家会员类型', val(PRODUCT_FIELD_KEYS.sellerMember)],
    ['卖家服务', val(PRODUCT_FIELD_KEYS.sellerService)]
  ]
}

function offerRowHtml(o: any, i: number): string {
  const offerId = o.offerId || o.id || ''
  const created = (o.offerCreateTime || o.beginOfferCreateTime || '').toString().slice(0, 16).replace('T', ' ')
  const booked30 = o.bookedCount30d ?? o.bookedCount ?? o.recentOrders ?? 0
  const saleCount = o.saleCount30d ?? o.saleCount ?? 0
  const thumb = o.imageUrl || o.picUrl || o.image || ''
  const chkId = escapeHtml(offerRowKey(o))
  const val = makeVal(o)
  const detailUrl = normUrl(val(PRODUCT_FIELD_KEYS.detailUrl, o.detailUrl || o.offerUrl || o.url))
  const shopUrl = normUrl(val(PRODUCT_FIELD_KEYS.shopUrl))
  const titleText = val(PRODUCT_FIELD_KEYS.title, o.title || o.offerTitle || o.name || ('商品 #' + (offerId || i + 1)))
  const titleCell = (detailUrl || shopUrl) ? linkCell(titleText, detailUrl || shopUrl) : escapeHtml(titleText)
  const priceText = val(PRODUCT_FIELD_KEYS.price, o.price != null ? o.price : null)
  const qty = val(PRODUCT_FIELD_KEYS.quantity, o.startQuantity || o.beginStartQuantity || null)
  const shopNameText = val(PRODUCT_FIELD_KEYS.shopName)
  const badges = shopBadgesHtml(o, val)
  const shopNameCell =
    '<div class="shop-line">' +
      (badges ? '<span class="shop-badges">' + badges + '</span>' : '') +
      '<span class="shop-name" title="' + escapeHtml(shopNameText) + '">' + (shopUrl ? linkCell(shopNameText, shopUrl) : escapeHtml(shopNameText)) + '</span>' +
    '</div>'
  const tagParts = [val(PRODUCT_FIELD_KEYS.tag), val(PRODUCT_FIELD_KEYS.supply)].filter(t => t !== '--').slice(0, 3)
  const infoCell =
    '<div class="pi-cell">' +
      (thumb
        ? '<img src="' + escapeHtml(thumb) + '" loading="lazy" referrerpolicy="no-referrer" onerror="this.outerHTML=\'📦\'">'
        : '<div class="pi-noimg">📦</div>') +
      '<div class="pi-main">' +
        '<div class="pi-title-row"><div class="pi-title" title="' + escapeHtml(titleText) + '">' + titleCell + '</div>' + copyActionsHtml(titleText, detailUrl || shopUrl) + '</div>' +
        (tagParts.length ? '<div class="pi-tags">' + tagParts.map(t => '<span>' + escapeHtml(t) + '</span>').join('') + '</div>' : '') +
      '</div>' +
      (thumb ? '<div class="pi-zoom"><img src="' + escapeHtml(thumb) + '" referrerpolicy="no-referrer" alt=""></div>' : '') +
    '</div>'
  const main =
    '<tr class="product-main" data-offer-id="' + escapeHtml(offerId) + '" data-conv-id="' + escapeHtml(o.convId || '') + '">' +
      '<td class="chk-cell"><input type="checkbox" class="row-chk" data-chk-id="' + chkId + '" title="勾选后可导出"></td>' +
      '<td class="idx-cell">' + (i + 1) + '</td>' +
      '<td>' + infoCell + '</td>' +
      '<td class="time-cell"><span class="offer-date">' + textCell(fmtDateOnly(val(PRODUCT_FIELD_KEYS.createTime, created))) + '</span></td>' +
      '<td>' + (priceText === '--' ? '--' : '¥' + priceText) + '</td>' +
      '<td>' + textCell(qty) + '</td>' +
      '<td>' + textCell(val(PRODUCT_FIELD_KEYS.orders30, booked30)) + '</td>' +
      '<td>' + textCell(val(PRODUCT_FIELD_KEYS.items30, saleCount)) + '</td>' +
      '<td>' + textCell(fmtYen(val(PRODUCT_FIELD_KEYS.amount30))) + '</td>' +
      '<td>' + textCell(val(PRODUCT_FIELD_KEYS.repurchase)) + '</td>' +
      '<td>' + shopNameCell + '</td>' +
      '<td class="exp-td"><button type="button" class="exp-btn">详情 ▾</button></td>' +
    '</tr>'
  // 详情行：其余字段键值网格（默认隐藏；展开即当前行全部字段）
  const detailFields = [
    ['上架时间', fmtDateOnly(val(PRODUCT_FIELD_KEYS.createTime, created))],
    ['30天销售额', fmtYen(val(PRODUCT_FIELD_KEYS.amount30))]
  ].concat(commonDetailFields(o, val, offerId) as any)
  const detail =
    '<tr class="product-detail" style="display:none">' +
      '<td colspan="12"><div class="pd-grid">' + detailItemsHtml(detailFields) + '</div></td>' +
    '</tr>'
  return main + detail
}

function offerCardHtml(o: any, i: number): string {
  const offerId = o.offerId || o.id || ''
  const thumb = o.imageUrl || o.picUrl || o.image || ''
  const chkId = escapeHtml(offerRowKey(o))
  const val = makeVal(o)
  const detailUrl = normUrl(val(PRODUCT_FIELD_KEYS.detailUrl, o.detailUrl || o.offerUrl || o.url))
  const shopUrl = normUrl(val(PRODUCT_FIELD_KEYS.shopUrl))
  const rawTitle = val(PRODUCT_FIELD_KEYS.title, o.title || o.offerTitle || o.name || ('商品 #' + (offerId || i + 1)))
  const title = escapeHtml(rawTitle)
  const shopName = escapeHtml(val(PRODUCT_FIELD_KEYS.shopName))
  const priceText = val(PRODUCT_FIELD_KEYS.price, o.price != null ? o.price : null)
  const qty = val(PRODUCT_FIELD_KEYS.quantity, o.startQuantity || o.beginStartQuantity || null)
  const booked30 = o.bookedCount30d ?? o.bookedCount ?? o.recentOrders ?? 0
  const saleCount = o.saleCount30d ?? o.saleCount ?? 0
  const repurchase = val(PRODUCT_FIELD_KEYS.repurchase)
  const badges = shopBadgesHtml(o, val)
  const imgLink = detailUrl || shopUrl
  return '<div class="offer-card">' +
    '<div class="oc-img-wrap">' +
      (thumb
        ? (imgLink
            ? '<a href="' + escapeHtml(imgLink) + '" target="_blank" rel="noopener noreferrer" style="position:absolute;inset:0;display:block"><img src="' + escapeHtml(thumb) + '" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.opacity=.25"></a>'
            : '<img src="' + escapeHtml(thumb) + '" loading="lazy" referrerpolicy="no-referrer" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" onerror="this.style.opacity=.25">')
        : '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:34px">📦</div>') +
      '<label class="oc-chk"><input type="checkbox" class="row-chk" data-chk-id="' + chkId + '" title="勾选后可导出"></label>' +
      '<span class="oc-idx">' + (i + 1) + '</span>' +
    '</div>' +
    '<div class="oc-body">' +
      '<div class="oc-title-row">' +
        (imgLink
          ? '<a class="oc-title" href="' + escapeHtml(imgLink) + '" target="_blank" rel="noopener noreferrer" title="' + title + '">' + title + '</a>'
          : '<div class="oc-title">' + title + '</div>') +
        copyActionsHtml(rawTitle, imgLink) +
      '</div>' +
      '<div class="oc-price-row"><span class="oc-price">' + (priceText === '--' ? '--' : priceText) + '</span><span class="oc-qty">起批 ' + (qty === '--' ? '--' : qty) + '</span></div>' +
      '<div class="oc-metrics-row"><span>30天订单 <b>' + escapeHtml(String(booked30)) + '</b></span><span>30天件数 <b>' + escapeHtml(String(saleCount)) + '</b></span></div>' +
      '<div class="oc-sales-row"><span>30天销售额</span><span class="oc-sales-val">' + fmtYen(val(PRODUCT_FIELD_KEYS.amount30)) + '</span></div>' +
      '<div class="oc-date-row"><span>上架时间 <b class="oc-date">' + fmtDateOnly(val(PRODUCT_FIELD_KEYS.createTime)) + '</b></span><span>复购率 <b class="oc-repur">' + escapeHtml(repurchase) + '</b></span></div>' +
      '<div class="oc-shop">' +
        (badges ? '<span class="shop-badges">' + badges + '</span>' : '') +
        '<span class="shop-name" title="' + shopName + '">' + (shopUrl ? '<a href="' + escapeHtml(shopUrl) + '" target="_blank" rel="noopener noreferrer">' + shopName + '</a>' : shopName) + '</span>' +
      '</div>' +
      '<button type="button" class="oc-exp-btn">详情 ▾</button>' +
      '<div class="oc-detail"><div class="pd-grid">' + detailItemsHtml(commonDetailFields(o, val, offerId)) + '</div></div>' +
    '</div>' +
  '</div>'
}

const listRowsHtml = computed(() => offerPage.value.rows.map((o: any, i: number) => offerRowHtml(o, offerPage.value.start + i)).join(''))
const cardRowsHtml = computed(() => offerPage.value.rows.map((o: any, i: number) => offerCardHtml(o, offerPage.value.start + i)).join(''))

// 预览 meta 文案（随当前页更新）
const previewMetaHtml = computed(() => {
  const p = panel.offerPager
  if (!p.metaTime) return ''
  const start = offerPage.value.start
  const end = start + offerPage.value.rows.length
  return '执行时间 · ' + p.metaTime + ' · 共 <strong>' + fmtN(p.totalCount || offerPage.value.totalRows) + '</strong> 条 · 当前展示 ' + fmtN(start + 1) + '–' + fmtN(end) + ' 条'
})

/* —— 勾选状态：以 selected 集合为唯一来源，渲染后同步回 DOM —— */
function syncSelectionDom() {
  const sel = panel.offerPager.selected
  previewTableEl.value?.querySelectorAll<HTMLInputElement>('input.row-chk').forEach(cb => {
    cb.checked = sel.has(cb.dataset.chkId || '')
  })
  offerCardsEl.value?.querySelectorAll<HTMLElement>('.offer-card').forEach(card => {
    const cb = card.querySelector<HTMLInputElement>('input.row-chk')
    if (cb) {
      cb.checked = sel.has(cb.dataset.chkId || '')
      card.classList.toggle('oc-picked', cb.checked)
    }
  })
  // 全选框：全选/半选状态（以本页行为准）
  const ids = [
    ...(previewTableEl.value?.querySelectorAll<HTMLInputElement>('input.row-chk') || []),
    ...(offerCardsEl.value?.querySelectorAll<HTMLInputElement>('input.row-chk') || [])
  ].map(cb => cb.dataset.chkId || '').filter(Boolean)
  const picked = ids.filter(id => sel.has(id)).length
  if (checkAllEl.value) {
    checkAllEl.value.checked = ids.length > 0 && picked === ids.length
    checkAllEl.value.indeterminate = picked > 0 && picked < ids.length
  }
}
watch([listRowsHtml, cardRowsHtml, isCardMode], () => nextTick(syncSelectionDom), { immediate: true, flush: 'post' })

const selCount = computed(() => panel.offerPager.selected.size)
function onCheckAllChange(e: Event) {
  checkAllPage((e.target as HTMLInputElement).checked)
  nextTick(syncSelectionDom)
}
function onRowChange(e: Event) {
  const cb = (e.target as HTMLElement).closest('input.row-chk') as HTMLInputElement | null
  if (!cb) return
  toggleRowCheck(cb.dataset.chkId || '', cb.checked)
  syncSelectionDom()
}

/* —— 列表"详情"按钮：展开/收起紧随其后的详情行 —— */
function onTbodyClick(e: MouseEvent) {
  const btn = (e.target as HTMLElement).closest('.exp-btn')
  if (!btn) return
  const tr = btn.closest('tr')
  const detail = tr && tr.nextElementSibling
  if (detail && detail.classList.contains('product-detail')) {
    const open = (detail as HTMLElement).style.display !== 'none'
    ;(detail as HTMLElement).style.display = open ? 'none' : ''
    btn.innerHTML = open ? '详情 ▾' : '收起 ▴'
  }
}
/* —— 卡片"详情"按钮：同一视觉行的所有卡片一起展开/收起（保持行对齐） —— */
function onCardsClick(e: MouseEvent) {
  const btn = (e.target as HTMLElement).closest('.oc-exp-btn')
  if (!btn) return
  const cardEl = btn.closest('.offer-card') as HTMLElement | null
  const detail = cardEl && cardEl.querySelector<HTMLElement>('.oc-detail')
  if (!detail || !cardEl) return
  const willOpen = detail.style.display !== 'block'
  const rowTop = Math.round(cardEl.getBoundingClientRect().top)
  const grid = offerCardsEl.value
  if (!grid) return
  grid.querySelectorAll<HTMLElement>('.offer-card').forEach(c => {
    if (Math.abs(Math.round(c.getBoundingClientRect().top) - rowTop) > 2) return
    const d = c.querySelector<HTMLElement>('.oc-detail')
    const b = c.querySelector<HTMLElement>('.oc-exp-btn')
    if (d) d.style.display = willOpen ? 'block' : ''
    if (b) b.innerHTML = willOpen ? '收起 ▴' : '详情 ▾'
  })
}

/* —— 主图悬停放大：靠近表格右边界时把浮层翻转到左侧 —— */
watch([listRowsHtml, isCardMode], () => {
  if (isCardMode.value) return
  nextTick(() => requestAnimationFrame(() => {
    const table = previewTableEl.value
    if (!table) return
    table.querySelectorAll<HTMLElement>('.pi-cell').forEach(cell => {
      const r = cell.getBoundingClientRect()
      cell.dataset.nearRight = (r.left + 230 > window.innerWidth - 16) ? '1' : '0'
    })
  }))
}, { flush: 'post' })

/* —— 标题复制按钮（列表 / 卡片共用，document 级委托） —— */
function onDocCopyClick(e: MouseEvent) {
  const btn = (e.target as HTMLElement).closest('.offer-copy-btn') as HTMLButtonElement | null
  if (!btn || btn.disabled) return
  e.preventDefault()
  e.stopPropagation()
  const value = btn.dataset.copyValue || ''
  if (!value) return
  const done = (ok: boolean) => {
    if (ok) {
      btn.classList.add('copied')
      btn.dataset.tip = btn.dataset.copyKind === 'link' ? '链接已复制' : '标题已复制'
      setTimeout(() => {
        btn.classList.remove('copied')
        btn.dataset.tip = btn.dataset.copyKind === 'link' ? '复制链接' : '复制标题'
      }, 1200)
      flashToast(btn.dataset.copyKind === 'link' ? '链接已复制' : '标题已复制')
    } else flashToast('复制失败，请重试')
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(value).then(() => done(true)).catch(() => done(false))
    return
  }
  const ta = document.createElement('textarea')
  ta.value = value; ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'
  document.body.appendChild(ta); ta.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch (err) {}
  ta.remove()
  done(ok)
}

/* —— 分页：窗口化页码 1 … cur-1 cur cur+1 … 末页 —— */
function pageButtons(cur: number, total: number): Array<{ p: number; ellipsisBefore: boolean }> {
  if (total <= 1) return []
  const wanted = new Set([1, total, cur - 1, cur, cur + 1])
  const pages = Array.from(wanted).filter(p => p >= 1 && p <= total).sort((a, b) => a - b)
  const out: Array<{ p: number; ellipsisBefore: boolean }> = []
  let prev = 0
  pages.forEach(p => { out.push({ p, ellipsisBefore: p - prev > 1 }); prev = p })
  return out
}
const offerPageBtns = computed(() => pageButtons(offerPage.value.page, offerPage.value.totalPages))
function stepOfferPage(d: number) { setOfferPage(offerPage.value.page + d) }
function doJumpOffer(e: Event) {
  const v = Number((e.target as HTMLInputElement).value)
  if (v) jumpToOfferPage(v)
}

/* ==================== 对话表格详情（md-full-table） ==================== */
// mdTablesRegistry 非响应式：用 mdVer 版本号驱动表格重渲染（排序等本地变更后自增）
const mdVer = ref(0)
const mdTable = computed(() => { void mdVer.value; return mdTablesRegistry.tables[panel.mdActiveTid] || null })
const mdPager = computed(() => panel.mdPagers[panel.mdActiveTid] || null)
const mdTotal = computed(() => mdTable.value ? mdTable.value.rows.length : 0)
const mdTotalPages = computed(() => {
  const p = mdPager.value
  if (!p || !mdTable.value) return 1
  return Math.max(1, Math.ceil(mdTable.value.rows.length / p.size))
})
const mdCurPage = computed(() => Math.min(Math.max(1, mdPager.value ? mdPager.value.page : 1), mdTotalPages.value))
const mdPageRowsHtml = computed(() => {
  const t = mdTable.value, p = mdPager.value
  if (!t || !p) return ''
  const start = (mdCurPage.value - 1) * p.size
  return t.rows.slice(start, start + p.size).map(r => '<tr>' + r.map((c, ci) => mdCellHtml(c, t.headers[ci])).join('') + '</tr>').join('')
})
const mdMetaHtml = computed(() => {
  const t = mdTable.value, p = mdPager.value
  if (!t || !p) return ''
  const total = t.rows.length
  if (total > p.size) {
    const start = (mdCurPage.value - 1) * p.size
    const end = start + Math.min(p.size, total - start)
    return '共 <strong>' + total + '</strong> 条数据 · 本页 ' + (start + 1) + '-' + end + ' 条 · 数据来自对话回复'
  }
  return '共 <strong>' + total + '</strong> 条数据 · 已展示全部 · 数据来自对话回复'
})
const mdExportName = computed(() => '📊 ' + ((mdTable.value && mdTable.value.title) || '对话表格详情') + '.xlsx')
const mdPageBtns = computed(() => pageButtons(mdCurPage.value, mdTotalPages.value))
const mdTableName = (tid: string) => String((mdTablesRegistry.tables[tid] && mdTablesRegistry.tables[tid].title) || '对话表格详情')
const mdSortState = ref<{ tid: string; col: number; dir: 'asc' | 'desc' }>({ tid: '', col: -1, dir: 'asc' })
function isNumHead(h: string) { return MD_NUM_HEAD_RE.test(String(h || '')) }
function onMdHeadClick(colIndex: number) {
  const tid = panel.mdActiveTid
  if (!tid || !mdTable.value) return
  const dir = (mdSortState.value.tid === tid && mdSortState.value.col === colIndex && mdSortState.value.dir === 'asc') ? 'desc' : 'asc'
  mdSortState.value = { tid, col: colIndex, dir }
  sortMdTable(tid, colIndex, dir)
  mdVer.value++
}
function stepMdPage(d: number) {
  const p = mdPager.value
  if (!p) return
  p.page = Math.min(Math.max(1, p.page + d), mdTotalPages.value)
}
function gotoMdPage(p: number) {
  const pager = mdPager.value
  if (pager) pager.page = p
}
function setMdSize(e: Event) {
  const p = mdPager.value
  if (!p) return
  p.size = Number((e.target as HTMLSelectElement).value) || 50
  p.page = 1
}
function onMdTabClick(e: MouseEvent) {
  const tab = (e.target as HTMLElement).closest('.md-tab') as HTMLElement | null
  if (!tab || !tab.dataset.tid) return
  if ((e.target as HTMLElement).closest('.md-tab-x')) { closeMdTab(tab.dataset.tid); return }
  if (tab.dataset.tid !== panel.mdActiveTid) activateMdTab(tab.dataset.tid)
}

/* ==================== 报告预览（local srcdoc / remote 代理抓取） ==================== */
const reportViewEl = ref<HTMLElement | null>(null)
const reportFrame = ref<HTMLIFrameElement | null>(null)
// srcdoc 缓存（替代原 window.__dldReportSrcdocCache）
const srcdocCache = new Map<string, string>()

function enhanceReportDoc() {
  const frame = reportFrame.value
  if (!frame) return
  try {
    const doc = frame.contentDocument
    if (!doc || !doc.body) return
    if (!doc.getElementById('dldReportScrollCss')) {
      const style = doc.createElement('style')
      style.id = 'dldReportScrollCss'
      style.textContent = REPORT_SCROLL_CSS
      ;(doc.head || doc.documentElement).appendChild(style)
    }
    doc.querySelectorAll('table').forEach(tbl => {
      const tblParent = tbl.parentElement
      if (tblParent && tblParent.classList && tblParent.classList.contains('dld-hscroll')) return
      const scrollWrap = doc.createElement('div')
      scrollWrap.className = 'dld-hscroll'
      tblParent!.insertBefore(scrollWrap, tbl)
      scrollWrap.appendChild(tbl)
    })
  } catch (e) { console.warn('[DLD] 报告滚动增强失败：', (e as Error).message) }
}
function applyReportZoom() {
  const z = panel.reportView.zoom || 1
  try {
    const b = reportFrame.value && reportFrame.value.contentDocument && reportFrame.value.contentDocument.body
    if (b) b.style.zoom = String(z)
  } catch (e) {}
}
const zoomLabel = computed(() => Math.round((panel.reportView.zoom || 1) * 100) + '%')
function clampZoom(z: number) { return Math.max(0.5, Math.min(2, Math.round(z * 10) / 10)) }
function zoomIn() { panel.reportView.zoom = clampZoom((panel.reportView.zoom || 1) + 0.1); applyReportZoom() }
function zoomOut() { panel.reportView.zoom = clampZoom((panel.reportView.zoom || 1) - 0.1); applyReportZoom() }
function zoomReset() { panel.reportView.zoom = 1; applyReportZoom() }

function loadRemoteReport(url: string) {
  const frame = reportFrame.value
  if (!frame || !url) return
  ;(frame as any).dataset.reportUrl = url
  frame.removeAttribute('srcdoc')
  frame.src = 'about:blank'
  const cached = srcdocCache.get(url)
  if (cached != null) { frame.srcdoc = cached; return }
  // 报告经本地代理（/api/proxy）同源加载：跨域直连时浏览器不允许注入滚动增强与缩放。
  // 相对资源用 <base> 指回原报告地址；代理失败时回退跨域直连（仅失去增强，不影响查看）。
  fetch('/api/proxy?url=' + encodeURIComponent(url))
    .then(res => { if (!res.ok) throw new Error('proxy ' + res.status); return res.text() })
    .then(html => {
      const baseTag = '<base href="' + escapeHtml(url) + '">'
      const styleTag = '<style id="dldReportScrollCss">' + REPORT_SCROLL_CSS + '</style>'
      const enhanced = /<head[^>]*>/i.test(html)
        ? html.replace(/<head[^>]*>/i, m => m + baseTag + styleTag)
        : baseTag + styleTag + html
      srcdocCache.set(url, enhanced)
      if ((frame as any).dataset.reportUrl === url) frame.srcdoc = enhanced
    })
    .catch(err => {
      console.warn('[DLD] 报告代理加载失败，回退直连：', err && err.message)
      if ((frame as any).dataset.reportUrl === url) frame.src = url
    })
}
function loadReportContent() {
  const rv = panel.reportView
  const frame = reportFrame.value
  if (!frame || !rv.visible) return
  if (rv.mode === 'local' && rv.localReport) {
    frame.removeAttribute('src')
    frame.srcdoc = buildStandaloneReportHtml(rv.localReport, { printBtn: false })
  } else if (rv.mode === 'remote' && rv.remoteUrl) {
    loadRemoteReport(rv.remoteUrl)
  }
}
watch(
  () => [panel.reportView.visible, panel.reportView.mode, panel.reportView.remoteUrl, panel.reportView.localReport],
  () => nextTick(loadReportContent),
  { immediate: true }
)
function onFrameLoad() { enhanceReportDoc(); applyReportZoom() }
function refreshReportPreview() {
  const rv = panel.reportView
  const frame = reportFrame.value
  if (!frame) return
  if (rv.mode === 'local' && rv.localReport) {
    frame.srcdoc = buildStandaloneReportHtml(rv.localReport, { printBtn: false })
  } else if (rv.mode === 'remote' && rv.remoteUrl) {
    srcdocCache.delete(rv.remoteUrl)
    loadRemoteReport(rv.remoteUrl)
  }
}
function onReportDownload() {
  if (panel.reportView.mode === 'local' && panel.reportView.localReport) downloadReportHtml(panel.reportView.localReport)
}
function onReportFullscreen() {
  const wrap = reportViewEl.value
  if (!wrap) return
  if (document.fullscreenElement) { document.exitFullscreen(); return }
  if (wrap.requestFullscreen) wrap.requestFullscreen().catch(() => {})
}

/* ==================== 生命周期 ==================== */
onMounted(() => {
  document.addEventListener('click', onDocCopyClick)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocCopyClick)
})
</script>

<template>
  <aside class="col-right" :class="{ 'panel-empty': panel.panelEmpty, 'collapsed': panel.collapsed }" id="rightPanel">
    <!-- 折叠 / 展开按钮 -->
    <button class="right-collapse-btn" :title="panel.collapsed ? '展开结果预览' : '折叠结果预览'" aria-label="折叠结果预览" @click="onCollapseClick">
      <span class="arrow">›</span>
    </button>

    <!-- 结果标签栏 -->
    <div class="right-tabs">
      <div v-for="t in panel.resultTabs" :key="t.key" class="right-tab" :class="{ active: t.key === panel.activeResultKey }"
        :data-result-key="t.key" :data-result-type="t.type" @click="activateResultPreview(t.key)">
        <span class="rt-name">{{ tabName(t) }}</span>
        <span class="x" @click.stop="removeResultTab(t.key)">×</span>
      </div>
    </div>

    <!-- 空态：内容全部删除后显示 -->
    <div class="right-empty" v-if="panel.panelEmpty">
      <div class="re-icon">📊</div>
      <div class="re-title">暂无预览内容</div>
      <div class="re-desc">发起选品查询后，报告和商品数据会显示在这里</div>
    </div>

    <div class="right-body" :class="{ 'report-mode': panel.reportView.visible, 'md-full-mode': panel.mdTabs.length > 0 }">
      <!-- HTML 选品报告视图：必须是 .right-body 直接子元素 -->
      <div class="report-view" id="reportView" v-if="panel.reportView.visible" ref="reportViewEl">
        <div class="report-toolbar">
          <div class="rp-filetab">
            <span class="rp-ft-ic">📄</span>
            <span class="rp-ft-name">{{ panel.reportView.title }}</span>
            <span class="rp-ft-close" title="关闭报告预览" role="button" aria-label="关闭报告预览" @click="closeReportView()">×</span>
          </div>
        </div>
        <div class="report-meta" v-html="panel.reportView.metaHtml"></div>
        <div class="report-frame-wrap" v-show="panel.reportView.mode !== 'empty'">
          <iframe ref="reportFrame" title="选品报告预览" sandbox="allow-scripts allow-same-origin allow-popups allow-modals allow-downloads" @load="onFrameLoad"></iframe>
          <div class="report-empty" v-show="false">
            <div class="re-ic">📄</div>
            <div class="re-t">暂无选品报告</div>
            <div>在对话中让 AI 生成选品 / 调研报告后，<br>这里会自动展示 HTML 版报告，并支持下载。</div>
          </div>
        </div>
        <div class="report-empty" v-if="panel.reportView.mode === 'empty'">
          <div class="re-ic">📄</div>
          <div class="re-t">暂无选品报告</div>
          <div>在对话中让 AI 生成选品 / 调研报告后，<br>这里会自动展示 HTML 版报告，并支持下载。</div>
        </div>
        <div class="report-statusbar" v-show="panel.reportView.mode !== 'empty'">
          <span class="rs-zoom">
            <button class="rs-btn" title="缩小" type="button" @click="zoomOut">−</button>
            <button class="rs-num" title="重置为 100%" type="button" @click="zoomReset">{{ zoomLabel }}</button>
            <button class="rs-btn" title="放大" type="button" @click="zoomIn">＋</button>
          </span>
          <span class="rs-spacer"></span>
          <button class="rs-btn" title="刷新预览" type="button" @click="refreshReportPreview">⟳</button>
          <button class="rs-btn" title="下载独立 HTML 文件" type="button" @click="onReportDownload">⤓</button>
          <button class="rs-btn" title="全屏预览" type="button" @click="onReportFullscreen">⛶</button>
        </div>
      </div>

      <!-- 商品预览视图：仅在接口返回真实商品数据后由 renderOffers 展示 -->
      <div id="productPreview" v-if="panel.productPreviewVisible">
        <h2 class="preview-h1">{{ panel.previewTitle }}</h2>
        <div class="preview-meta" v-html="previewMetaHtml"></div>

        <!-- 表格加载骨架屏：点击"查看更多"后短暂显示，增强加载感知 -->
        <div class="right-skeleton" v-if="panel.skeletonVisible">
          <div class="rs-summary-row">
            <div class="rs-pill"></div><div class="rs-pill"></div><div class="rs-pill"></div><div class="rs-pill"></div>
          </div>
          <div class="rs-table-wrap">
            <div class="rs-table-head">
              <div class="rs-th"></div><div class="rs-th"></div><div class="rs-th wide"></div><div class="rs-th"></div><div class="rs-th"></div>
            </div>
            <div class="rs-table-body">
              <div class="rs-row"><div class="rs-cell"></div><div class="rs-cell img"></div><div class="rs-cell wide"></div><div class="rs-cell"></div><div class="rs-cell"></div></div>
              <div class="rs-row"><div class="rs-cell"></div><div class="rs-cell img"></div><div class="rs-cell wide"></div><div class="rs-cell"></div><div class="rs-cell"></div></div>
              <div class="rs-row"><div class="rs-cell"></div><div class="rs-cell img"></div><div class="rs-cell wide"></div><div class="rs-cell"></div><div class="rs-cell"></div></div>
              <div class="rs-row"><div class="rs-cell"></div><div class="rs-cell img"></div><div class="rs-cell wide"></div><div class="rs-cell"></div><div class="rs-cell"></div></div>
              <div class="rs-row"><div class="rs-cell"></div><div class="rs-cell img"></div><div class="rs-cell wide"></div><div class="rs-cell"></div><div class="rs-cell"></div></div>
              <div class="rs-row"><div class="rs-cell"></div><div class="rs-cell img"></div><div class="rs-cell wide"></div><div class="rs-cell"></div><div class="rs-cell"></div></div>
            </div>
          </div>
        </div>

        <div class="summary-row" v-show="!panel.skeletonVisible">
          <div class="summary-pill"><span class="num">{{ fmtN(panel.summary.total) }}</span><span class="lbl">命中商品</span></div>
          <div class="summary-pill"><span class="num">¥{{ panel.summary.minP.toFixed(2) }}</span><span class="lbl">最低批发价</span></div>
          <div class="summary-pill"><span class="num">¥{{ panel.summary.maxP.toFixed(2) }}</span><span class="lbl">最高批发价</span></div>
          <div class="summary-pill"><span class="num">{{ fmtN(panel.summary.topOrders) }}</span><span class="lbl">Top1 近30天订单</span></div>
        </div>

        <div class="excel-block">
          <div class="excel-toolbar">
            <span class="name">📊 1688 商品选品结果.xlsx</span>
            <span class="spacer"></span>
            <div class="view-toggle" title="切换展示模式">
              <button type="button" class="vt-btn" :class="{ active: !isCardMode }" @click="setOfferViewMode('list')">☰ 列表</button>
              <button type="button" class="vt-btn" :class="{ active: isCardMode }" @click="setOfferViewMode('card')">▦ 图片</button>
            </div>
            <button type="button" class="pg-export-btn" title="仅导出勾选的商品" :disabled="!selCount" @click="exportPreviewXlsx('selected')">导出勾选 ({{ selCount }})</button>
            <button type="button" class="pg-export-btn primary" title="导出全部商品" @click="exportPreviewXlsx()">⤓ 导出全部</button>
            <span class="ic fullscreen-btn" title="全屏查看">⛶</span>
          </div>
          <div class="excel-wrap">
            <table class="preview-table" ref="previewTableEl" v-show="!isCardMode" @click="onTbodyClick" @change="onRowChange">
              <thead>
                <tr>
                  <th class="chk-cell" title="全选/取消本页"><input type="checkbox" ref="checkAllEl" @change="onCheckAllChange"></th>
                  <th style="width:52px">序号</th>
                  <th style="min-width:330px">商品信息</th>
                  <th>上架时间</th><th>批发价</th><th>起批量</th><th>近30天订单数</th><th>近30天件数</th><th>近30天销售额</th><th>复购率</th>
                  <th>店铺名称</th>
                  <th class="exp-head" style="width:72px">详情</th>
                </tr>
              </thead>
              <tbody v-html="listRowsHtml"></tbody>
            </table>
            <div class="offer-cards" ref="offerCardsEl" v-show="isCardMode" @click="onCardsClick" @change="onRowChange">
              <div v-if="!offerPage.totalRows" class="cards-empty">暂无商品数据</div>
              <div v-else v-html="cardRowsHtml"></div>
            </div>
          </div>

          <!-- 分页条：随数据量显示/隐藏（放 excel-wrap 外，垂直滚动表格时保持固定） -->
          <div class="table-pagination" v-show="offerPage.totalRows > 0">
            <span class="pg-total">共 {{ fmtN(offerPage.totalRows) }} 条</span>
            <span class="pg-size">
              <select :value="panel.offerPager.size" @change="setOfferSize(Number(($event.target as HTMLSelectElement).value))" title="每页条数">
                <option value="50">50条/页</option>
                <option value="100">100条/页</option>
              </select>
            </span>
            <span class="pg-nav">
              <button type="button" class="pg-btn pg-step" title="上一页" aria-label="上一页" :disabled="offerPage.page <= 1" @click="stepOfferPage(-1)">‹</button>
              <template v-for="b in offerPageBtns" :key="b.p">
                <span v-if="b.ellipsisBefore" class="pg-ellipsis">…</span>
                <button type="button" class="pg-btn pg-num" :class="{ active: b.p === offerPage.page }" @click="setOfferPage(b.p)">{{ b.p }}</button>
              </template>
              <button type="button" class="pg-btn pg-step" title="下一页" aria-label="下一页" :disabled="offerPage.page >= offerPage.totalPages" @click="stepOfferPage(1)">›</button>
            </span>
            <span class="pg-jump">前往 <input type="number" min="1" :max="offerPage.totalPages" :value="offerPage.page" @keyup.enter="doJumpOffer" @change="doJumpOffer" title="跳转到指定页，回车确认"> 页</span>
          </div>
        </div>
      </div>

      <!-- 对话表格完整数据视图（点击中栏表格"查看更多"时展示） -->
      <div class="md-preview-wrap" v-if="panel.mdTabs.length > 0">
        <div class="md-preview-toolbar">
          <div class="md-preview-tabs" @click="onMdTabClick">
            <span v-for="tid in panel.mdTabs" :key="tid" class="md-tab" :class="{ active: tid === panel.mdActiveTid }" :data-tid="tid">
              <span class="md-tab-t">📋 {{ mdTableName(tid) }}</span>
              <span class="md-tab-x" title="关闭此标签">×</span>
            </span>
          </div>
          <span class="md-preview-close" title="关闭全部表格标签，返回商品数据" @click="panel.mdTabs.slice().forEach(t => closeMdTab(t))">×</span>
        </div>
        <div class="md-preview-meta" v-html="mdMetaHtml"></div>
        <div class="excel-wrap md-preview-scroll" style="margin:0">
          <div class="excel-toolbar md-export-bar">
            <button class="md-export-btn" type="button" title="导出当前表格为 Excel（.xlsx）文件" @click="exportCurrentMdTable()">⤓ 导出 Excel</button>
            <span class="md-export-name">{{ mdExportName }}</span>
            <span class="spacer"></span>
          </div>
          <div class="md-table-clip">
            <table class="preview-table md-full-table">
              <thead>
                <tr>
                  <th v-for="(h, hi) in (mdTable ? mdTable.headers : [])" :key="hi" class="sortable" :class="{ 'num-col': isNumHead(h) }"
                    :title="'点击按本列排序'" @click="onMdHeadClick(hi)">
                    {{ h }} <span class="sort-indicator">{{ mdSortState.tid === panel.mdActiveTid && mdSortState.col === hi ? (mdSortState.dir === 'asc' ? '▲' : '▼') : '⇕' }}</span>
                  </th>
                </tr>
              </thead>
              <tbody v-html="mdPageRowsHtml"></tbody>
            </table>
          </div>
        </div>
        <!-- 分页条：对话表格详情专用（导出不受分页影响，始终全量） -->
        <div class="table-pagination" v-show="mdTotal > (mdPager ? mdPager.size : 50)">
          <span class="pg-total">共 {{ mdTotal }} 条 · 第 {{ mdCurPage }}/{{ mdTotalPages }} 页</span>
          <span class="pg-nav">
            <button type="button" class="pg-btn pg-step" :disabled="mdCurPage <= 1" @click="stepMdPage(-1)">‹ 上一页</button>
            <template v-for="b in mdPageBtns" :key="b.p">
              <span v-if="b.ellipsisBefore" class="pg-ellipsis">…</span>
              <button type="button" class="pg-btn pg-num" :class="{ active: b.p === mdCurPage }" @click="gotoMdPage(b.p)">{{ b.p }}</button>
            </template>
            <button type="button" class="pg-btn pg-step" :disabled="mdCurPage >= mdTotalPages" @click="stepMdPage(1)">下一页 ›</button>
          </span>
          <span class="spacer"></span>
          <span class="pg-size">每页
            <select :value="mdPager ? mdPager.size : 50" @change="setMdSize" title="每页条数">
              <option value="50">50 条</option>
              <option value="100">100 条</option>
            </select>
          </span>
        </div>
      </div>
    </div>
  </aside>
</template>
