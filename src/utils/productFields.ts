/* =====================================================
 * 商品字段别名映射 + 展示格式化（自 index.html L9937-L10118 原样迁移）
 * 后端商品字段名不统一，PRODUCT_FIELD_KEYS 是数据兼容层，
 * 必须整体使用，不许按单一字段名重写。
 * ===================================================== */
import { escapeHtml, fmtN } from './common'

// 展示字段 35 列及顺序（不含"商品链接/店铺链接/主图链接"——导出时按 38 列规范补回这三列）
export const PRODUCT_TABLE_HEADERS = [
  '序号', '商品主图', '商品标题', '商品类目', '商品ID', '上架时间', '批发价', '起批量', 'sku数量',
  '近30天订单数', '近30天件数', '近30天销售额', '24H揽收率', '48H揽收率', '7日订单增长率', '7日采购集中率', '复购率', '代发价',
  '跨境服务', '权益保障', '面单支持', '商品标识', '商品货号', '包装信息', '供货类型', '店铺名称', '诚信通年限',
  '店铺48H履约率', '店铺回头率', '店铺响应率', '综合服务', '所在地', '公司类型', '卖家会员类型', '卖家服务'
]

// 导出字段 38 列 = 展示 35 列 + 商品链接（第 4 列）+ 店铺链接 + 主图链接（末尾）
export const PRODUCT_EXPORT_HEADERS = PRODUCT_TABLE_HEADERS.slice(0, 3).concat(['商品链接'], PRODUCT_TABLE_HEADERS.slice(3), ['店铺链接', '主图链接'])
export const PRODUCT_EXPORT_EXTRA_HEADERS: string[] = []

export const PRODUCT_FIELD_KEYS: Record<string, string[]> = {
  image: ['商品主图', 'mainImageUrl', 'image', 'imageUrl', 'picUrl'], title: ['商品标题', 'title', 'offerTitle', 'subject'],
  detailUrl: ['商品链接', 'detailUrl', 'offerUrl', 'productUrl', 'url'], category: ['商品类目', 'levelName', 'category', 'categoryName'],
  offerId: ['商品ID', 'offerId', 'id'], createTime: ['上架时间', 'offerCreateTime', 'createTime'],
  price: ['批发价', 'price'], quantity: ['起批量', 'quantityBegin', 'startQuantity'], unit: ['unit', '单位'],
  skuCount: ['sku数量', 'skuCount'], orders30: ['近30天订单数', 'orderCount30d', 'bookedCount30d', 'daiXiaoBookedCount30', 'sales'],
  items30: ['近30天件数', 'itemCount30d', 'saleQuantity30d', 'saleCount30d'], amount30: ['近30天销售额', 'salesVolume30d', 'salesAmount30d', 'amount30d', 'saleAmount30d'],
  collect24: ['24H揽收率', 'offerLgt24h', 'collectRate24h', 'receiveRate24h'], collect48: ['48H揽收率', 'offerLgt48h', 'collectRate48h', 'receiveRate48h'],
  growth7: ['7日订单增长率', 'bookedCount7dGrowthRate', 'orderGrowth7d', 'orderGrowthRate7d'], concentration7: ['7日采购集中率', 'purchaseRate7d', 'purchaseConcentration7d'],
  repurchase: ['复购率', 'offerRepurchaseRate', 'repurchaseRate'], consignPrice: ['代发价', 'consignPrice'],
  crossBorder: ['跨境服务', 'kjServices', 'crossBorderService', 'crossBorder', 'isKj', 'supplyType', 'offerSupplyType'], rights: ['权益保障', 'buyerProtections', 'rightsProtection'],
  waybill: ['面单支持', 'faceToFaceSupportStatus', 'waybillSupport'], tag: ['商品标识', 'titleTags', 'isNew', 'status', 'include', 'productTag'], info: ['商品货号', '商品信息', 'itemNo'], packaging: ['包装信息', 'packageStatus'],
  supply: ['供货类型', 'supplyType', 'offerSupplyType', 'supplyMode'], shopName: ['店铺名称', 'company', 'supplier', 'shopName', 'companyName'], shopUrl: ['店铺链接', 'shopUrl', 'storeUrl', 'shopLink'],
  trustYears: ['诚信通年限', 'trustYears', 'chengxintongYears', 'memberYears'], fulfillment48: ['店铺48H履约率', 'fulfillmentRate48h', 'shopFulfillmentRate48h', 'fulfillment48hRate'],
  shopReturn: ['店铺回头率', 'shopReturnRate', 'returnRate', 'repeatPurchaseRate'], shopResponse: ['店铺响应率', 'shopResponseRate', 'responseRate', 'responseSpeed'],
  service: ['综合服务', 'compositeNewScore', 'serviceScore', 'comprehensiveService', 'comprehensiveScore'], location: ['所在地', 'location', 'address'], province: ['province', 'shipProvince', '省份'], city: ['city', 'shipCity', '城市'],
  companyType: ['公司类型', 'companyType', 'businessType'], sellerMember: ['卖家会员类型', 'shiLiType', 'sellerMemberType', 'memberType'], sellerService: ['卖家服务', 'certificateNameList', 'buyerProtections', 'sellerService', 'sellerServiceTags'],
  imageUrl: ['主图链接', 'image', 'mainImageUrl', 'imageUrl', 'picUrl']
}

export const productValue = (p: any, keys: string[]): any => {
  for (const key of keys) {
    const value = p && p[key]
    if (value === undefined || value === null || value === '' || value === -1 || value === '-1') continue
    if (Array.isArray(value) && value.length === 0) continue
    return value
  }
  return '--'
}

export const SHILI_TYPE_LABELS: Record<string, string> = { Power: '实力商家', superFactory: '超级工厂', ytqj: '诚信通' }
export const SUPPLY_TYPE_LABELS: Record<string, string> = { '1': '跨境卖家', '2': '内贸卖家' }
const PERCENT_FIELD_NAMES = new Set(['collect24', 'collect48', 'growth7', 'repurchase', 'fulfillment48', 'shopReturn', 'shopResponse'])
const MULTIPLE_FIELD_NAMES = new Set(['concentration7'])
const DECIMAL_FIELD_NAMES = new Set(['price', 'amount30', 'consignPrice', 'service'])
export const FIELD_NAME_BY_HEADER: Record<string, string> = {
  '近30天销售额': 'amount30',
  '批发价': 'price',
  '代发价': 'consignPrice',
  '24H揽收率': 'collect24',
  '48H揽收率': 'collect48',
  '7日订单增长率': 'growth7',
  '7日采购集中率': 'concentration7',
  '复购率': 'repurchase',
  '店铺48H履约率': 'fulfillment48',
  '店铺回头率': 'shopReturn',
  '店铺响应率': 'shopResponse',
  '诚信通年限': 'trustYears',
  '综合服务': 'service'
}

const toDisplayNumber = (value: any): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const text = String(value == null ? '' : value).replace(/[¥￥,]/g, '').trim()
  const match = text.match(/-?\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : null
}

export const formatProductValue = (name: string, value: any): any => {
  if (value === undefined || value === null || value === '' || value === false || value === '--' || value === '-' || value === -1 || value === '-1' || value === '-1%') return '--'
  if (Array.isArray(value)) return value.filter(v => v !== '--' && v !== '-' && v !== false && v != null && v !== '').join('、') || '--'
  const numeric = toDisplayNumber(value)
  if (PERCENT_FIELD_NAMES.has(name) && numeric !== null) {
    const hasPercent = /%/.test(String(value))
    const percent = hasPercent ? numeric : (Math.abs(numeric) <= 1 ? numeric * 100 : numeric)
    return Math.round(percent) + '%'
  }
  if (name === 'trustYears' && numeric !== null) return Math.round(numeric) + '年'
  if (MULTIPLE_FIELD_NAMES.has(name) && numeric !== null) return Math.round(numeric) + '倍'
  if (name === 'service' && numeric !== null) return Math.round(numeric)
  if (DECIMAL_FIELD_NAMES.has(name) && numeric !== null) return numeric.toFixed(2)
  return Array.isArray(value) ? value.join('、') || '--' : String(value)
}

export const fieldNameForKeys = (keys: string[]): string => Object.keys(PRODUCT_FIELD_KEYS).find(name => PRODUCT_FIELD_KEYS[name] === keys) || ''

export const productField = (p: any, name: string): any => {
  if (name === 'detailUrl' && !(p && (p.detailUrl || p.offerUrl || p.productUrl || p.url))) {
    const id = productValue(p, PRODUCT_FIELD_KEYS.offerId)
    return id !== '--' ? 'https://detail.1688.com/offer/' + id + '.html' : '--'
  }
  const fieldName = FIELD_NAME_BY_HEADER[name] || name
  const value = productValue(p, PRODUCT_FIELD_KEYS[fieldName] || [name])
  if (fieldName === 'packaging') {
    if (typeof value === 'string' && value && value !== '--' && /[^0-9,、]/.test(value)) return value
    const labels: Record<string, string> = { '1': '未披露', '2': '仅披露重量', '3': '完整件重尺' }
    const values = Array.isArray(value) ? value : [value]
    const mapped = values.map((v: any) => labels[String(v)]).filter(Boolean)
    return mapped.length ? mapped.join('、') : '--'
  }
  if (fieldName === 'companyType') return value === 1 || value === '1' ? '贸易商' : value === 2 || value === '2' ? '工厂' : formatProductValue(fieldName, value)
  if (fieldName === 'sellerMember') { const allowed = ['实力商家', '超级工厂']; const values = (Array.isArray(value) ? value : [value]).map((v: any) => SHILI_TYPE_LABELS[v] || v).filter((v: any) => allowed.includes(v)); return values.length ? values.join('、') : '--' }
  if (fieldName === 'supply' || fieldName === 'crossBorder') return formatProductValue(fieldName, Array.isArray(value) ? value.map((v: any) => SUPPLY_TYPE_LABELS[v] || v) : (SUPPLY_TYPE_LABELS[value] || value))
  if (name === 'tag') {
    const normalizedTag = p && typeof p['商品标识'] === 'string' ? p['商品标识'] : ''
    if (normalizedTag && normalizedTag !== '--') return normalizedTag
    const source = p && p.raw && typeof p.raw === 'object' ? p.raw : p
    const flagLabels: Record<string, string> = { '289794': '新品', '591618': '超级新品', '670594': '人气新品', '670722': '首发新品', '290562': '镇店之宝', '1803842': '定制', '4306497': '1688严选' }
    const tags: string[] = []
    if (Array.isArray(source?.titleTags)) source.titleTags.forEach((t: any) => { const label = flagLabels[String(t)]; if (label && !tags.includes(label)) tags.push(label) })
    if ((source?.isNew === 1 || source?.isNew === true || source?.isNew === '1') && !tags.includes('新品')) tags.push('新品')
    if (tags.length) return formatProductValue(fieldName, tags)
    return formatProductValue(fieldName, value)
  }
  return formatProductValue(fieldName, value)
}

export const productText = (p: any, keys: string[]): string => {
  const fieldName = fieldNameForKeys(keys)
  const value = fieldName ? productField(p, fieldName) : productValue(p, keys)
  return String(Array.isArray(value) ? value.join('、') : value).replace(/\|/g, '/').replace(/\r?\n/g, ' ')
}

export const productUrl = (p: any, keys: string[]): string => {
  const value = productValue(p, keys)
  if (value !== '--') return String(value).trim()
  const id = productValue(p, PRODUCT_FIELD_KEYS.offerId)
  return id !== '--' && keys === PRODUCT_FIELD_KEYS.detailUrl ? 'https://detail.1688.com/offer/' + id + '.html' : ''
}

export const productLink = (label: string, url: string): string => url ? '[' + label + '](' + url + ')' : label

export const companyTypeText = (v: any): string => {
  const raw = productValue({ v }, ['v'])
  return raw === 1 || raw === '1' ? '贸易商' : raw === 2 || raw === '2' ? '工厂' : String(raw)
}

export function productJsonToMd(data: any): string {
  const lines = [
    '| ' + PRODUCT_TABLE_HEADERS.join(' | ') + ' |',
    '|' + PRODUCT_TABLE_HEADERS.map(() => '---').join('|') + '|'
  ]
  ;(data.products || []).forEach((p: any, i: number) => {
    const image = productUrl(p, PRODUCT_FIELD_KEYS.image)
    const title = productText(p, PRODUCT_FIELD_KEYS.title).slice(0, 42)
    const detailUrl = productUrl(p, PRODUCT_FIELD_KEYS.detailUrl)
    const shopName = productText(p, PRODUCT_FIELD_KEYS.shopName)
    const shopUrl = productUrl(p, PRODUCT_FIELD_KEYS.shopUrl)
    const price = productField(p, 'price')
    const qty = productField(p, 'quantity')
    const unit = productField(p, 'unit')
    const locationValue = productField(p, 'location')
    const location = locationValue !== '--' ? locationValue : [productField(p, 'province'), productField(p, 'city')].filter(v => v !== '--').join(' ') || '--'
    const imageCell = image ? '![](' + image + ')' : '--'
    const row = [
      i + 1, imageCell, productLink(title, detailUrl), productText(p, PRODUCT_FIELD_KEYS.category),
      productText(p, PRODUCT_FIELD_KEYS.offerId), productText(p, PRODUCT_FIELD_KEYS.createTime), price === '--' ? '--' : '¥' + price,
      qty === '--' ? '--' : String(qty) + (unit === '--' ? '' : unit), productText(p, PRODUCT_FIELD_KEYS.skuCount), productText(p, PRODUCT_FIELD_KEYS.orders30),
      productText(p, PRODUCT_FIELD_KEYS.items30), productText(p, PRODUCT_FIELD_KEYS.amount30), productText(p, PRODUCT_FIELD_KEYS.collect24),
      productText(p, PRODUCT_FIELD_KEYS.collect48), productText(p, PRODUCT_FIELD_KEYS.growth7), productText(p, PRODUCT_FIELD_KEYS.concentration7),
      productText(p, PRODUCT_FIELD_KEYS.repurchase), productText(p, PRODUCT_FIELD_KEYS.consignPrice), productText(p, PRODUCT_FIELD_KEYS.crossBorder),
      productText(p, PRODUCT_FIELD_KEYS.rights), productText(p, PRODUCT_FIELD_KEYS.waybill), productText(p, PRODUCT_FIELD_KEYS.tag),
      productText(p, PRODUCT_FIELD_KEYS.info), productField(p, 'packaging'), productText(p, PRODUCT_FIELD_KEYS.supply), shopUrl ? productLink(shopName, shopUrl) : shopName, productText(p, PRODUCT_FIELD_KEYS.trustYears),
      productText(p, PRODUCT_FIELD_KEYS.fulfillment48), productText(p, PRODUCT_FIELD_KEYS.shopReturn), productText(p, PRODUCT_FIELD_KEYS.shopResponse),
      productText(p, PRODUCT_FIELD_KEYS.service), location, companyTypeText(productField(p, 'companyType')), productText(p, PRODUCT_FIELD_KEYS.sellerMember),
      productText(p, PRODUCT_FIELD_KEYS.sellerService)
    ]
    lines.push('| ' + row.map(v => String(v).replace(/\|/g, '/').replace(/\r?\n/g, ' ')).join(' | ') + ' |')
  })
  return lines.join('\n')
}

export function chatflowProductsToOffers(pj: any): any[] {
  return (pj.products || []).map((p: any, i: number) => {
    const price = Number(productField(p, 'price')) || Number(productField(p, 'consignPrice')) || null
    const companyType = String(productField(p, 'companyType'))
    return {
      ...p,
      offerId: productField(p, 'offerId') !== '--' ? productField(p, 'offerId') : ('cf_' + (i + 1)),
      price: price,
      priceLow: price,
      priceHigh: price,
      startQuantity: Number(productField(p, 'quantity')) || undefined,
      imageUrl: productField(p, 'imageUrl') !== '--' ? productField(p, 'imageUrl') : productField(p, 'image'),
      bookedCount30d: Number(productField(p, 'orders30')) || 0,
      saleCount30d: Number(productField(p, 'items30')) || 0,
      detailUrl: productField(p, 'detailUrl'),
      shopUrl: productField(p, 'shopUrl'),
      shopName: productField(p, 'shopName'),
      isFactory: /工厂/.test(companyType),
      isPower: /实力/.test(companyType)
    }
  })
}

/* ==================== 商品表行辅助（自 index.html L10740-L10801 迁移） ==================== */
// 行唯一键：优先 offerId/id，兜底链接与标题（供跨页勾选、勾选导出使用）
export function offerRowKey(o: any): string {
  return String(o.offerId || o.id || o.offerUrl || o.url || o.title || o.offerTitle || o.name || '')
}

// 数据级排序取值：与列展示口径一致（价格取 price/priceLow/priceRange，订单/件数取 30 天口径）
export function offerSortValue(o: any, key: string): number {
  if (key === 'price') {
    if (o.price != null) return Number(o.price) || 0
    if (o.priceLow != null) return Number(o.priceLow) || 0
    const m = String(o.priceRange || '').match(/[\d.]+/)
    return m ? Number(m[0]) : 0
  }
  if (key === 'sales') return Number(o.bookedCount30d ?? o.bookedCount ?? o.recentOrders ?? 0) || 0
  if (key === 'count') return Number(o.saleCount30d ?? o.saleCount ?? 0) || 0
  // 上架时间：与列显示同口径（offerCreateTime → beginOfferCreateTime）；无时间的商品视为最小值
  if (key === 'time') {
    const s = String(o.offerCreateTime || o.beginOfferCreateTime || '')
    let t = Date.parse(s)
    if (isNaN(t)) t = Date.parse(s.replace(' ', 'T').replace(/-/g, '/'))
    return isNaN(t) ? -Infinity : t
  }
  return 0
}

// 上架时间仅保留年月日（兼容 2026-09-04 14:26:00、2026/9/4、毫秒时间戳）
export function fmtDateOnly(v: any): string {
  const s = String(v == null ? '' : v).trim()
  if (!s || s === '--') return s || '--'
  const m = s.match(/^(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})/)
  if (m) return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0')
  const n = Number(s)
  if (isFinite(n) && s !== '' && n > 1e12) {
    const d = new Date(n)
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  }
  return s
}

// 30天销售额统一加人民币符号（已有 ￥/¥ 前缀或非数值文案则不重复加）
export function fmtYen(v: any): string {
  const s = String(v == null ? '' : v).trim()
  if (!s || s === '--') return s || '--'
  return /^[￥¥]/.test(s) ? s : '¥' + s
}

// 商品类目：默认只展示最后一级
export function categoryLast(v: any): string {
  const s = String(v == null ? '' : v).trim()
  if (!s || s === '--') return s || '--'
  const parts = s.split(/[>＞﹥›]+/).map(x => x.trim()).filter(Boolean)
  return parts.length ? parts[parts.length - 1] : s
}

// 商品类目：完整路径（一级 > 二级 > 三级），供悬停提示
export function categoryFull(v: any): string {
  const s = String(v == null ? '' : v).trim()
  if (!s || s === '--') return s || '--'
  const parts = s.split(/[>＞﹥›]+/).map(x => x.trim()).filter(Boolean)
  return parts.length > 1 ? parts.join(' > ') : s
}

export { fmtN, escapeHtml }
