/* =====================================================
 * 工作流协议解析 + 商品规范化 + 上下文兜底（自 index.html 原样迁移）
 * ===================================================== */
import { SUPPLY_TYPE_LABELS, SHILI_TYPE_LABELS } from './productFields'
import { DLD } from '../api'

// 生产协议：商品元数据只能通过 workflow_finished.data.outputs.answer.payload 获取。
export function parseNestedJson(value: any, depth = 0): any {
  if (depth > 6 || value == null) return value
  if (typeof value === 'string') {
    const s = value.trim()
    if (!s || !/^[\[{]/.test(s)) return value
    try { return parseNestedJson(JSON.parse(s), depth + 1) } catch (e) { return value }
  }
  return value
}

export function getWorkflowOutputs(eventData: any): any | null {
  const outputs = eventData && eventData.data && eventData.data.outputs
  const parsed = parseNestedJson(outputs)
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
}

export function getAnswerEnvelope(outputs: any): any | null {
  if (!outputs || typeof outputs.answer !== 'string') return null
  const source = outputs.answer
  const candidates = [source, source.replace(/\\+"/g, '"')]

  // 最新生产协议：outputs.answer 本身是 JSON 字符串，商品元数据位于 envelope.payload。
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate.trim())
      if (!parsed || typeof parsed !== 'object') continue
      const payload = parsed && parsed.payload && typeof parsed.payload === 'object'
        ? parsed.payload
        : null
      if (payload && typeof payload.obsUrl === 'string') {
        return {
          ...parsed,
          obsUrl: payload.obsUrl,
          totalCount: Number(payload.totalCount || 0) || 0,
          count: Number(payload.count || 0) || 0
        }
      }
      // 扁平结构：真实后端 workflow_finished.data.outputs.answer 解析后 obsUrl 直接位于顶层
      if (typeof parsed.obsUrl === 'string' && parsed.obsUrl.trim()) {
        return {
          ...parsed,
          obsUrl: parsed.obsUrl,
          totalCount: Number(parsed.totalCount || 0) || 0,
          count: Number(parsed.count || 0) || 0
        }
      }
    } catch (e) {}
  }

  const urlStart = source.indexOf('https://obs.dianleida.net/')
  if (urlStart >= 0) {
    let urlEnd = urlStart
    while (urlEnd < source.length && !/["\\\s]/.test(source[urlEnd])) urlEnd += 1
    const metadataSource = source.replace(/\\+"/g, '"')
    const totalMatch = metadataSource.match(/totalCount[^0-9]{0,12}(\d+)/)
    const countMatch = metadataSource.match(/(?:^|[^A-Za-z])count[^0-9]{0,12}(\d+)/)
    return { obsUrl: source.slice(urlStart, urlEnd), totalCount: totalMatch ? Number(totalMatch[1]) : 0, count: countMatch ? Number(countMatch[1]) : 0 }
  }
  for (const src of candidates) {
    const marker = src.indexOf('"obsUrl"')
    if (marker < 0) continue
    let start = src.lastIndexOf('{', marker)
    while (start >= 0) {
      let depth = 0, inString = false, escaped = false
      for (let i = start; i < src.length; i += 1) {
        const ch = src[i]
        if (escaped) { escaped = false; continue }
        if (ch === '\\') { escaped = true; continue }
        if (ch === '"') { inString = !inString; continue }
        if (inString) continue
        if (ch === '{') depth += 1
        else if (ch === '}' && --depth === 0) {
          try {
            const parsed = JSON.parse(src.slice(start, i + 1))
            if (parsed && typeof parsed === 'object' && parsed.obsUrl) return parsed
          } catch (e) {}
          break
        }
      }
      start = src.lastIndexOf('{', start - 1)
    }
  }
  return null
}

export function normalizeProduct(raw: any, index: number): Record<string, any> {
  const source = raw && typeof raw === 'object' ? raw : {}
  const invalid = (value: any) => value == null || value === '' || value === false || value === -1 || value === '-1' || value === '-1%' || (Array.isArray(value) && value.length === 0)
  const first = (...keys: string[]) => {
    for (const key of keys) {
      const value = source[key]
      if (!invalid(value)) return value
    }
    return '--'
  }
  const list = (...keys: string[]) => {
    const value = first(...keys)
    if (Array.isArray(value)) return value.filter(v => !invalid(v))
    return invalid(value) || value === '--' ? [] : [value]
  }
  const parseList = (value: any) => {
    if (Array.isArray(value)) return value
    if (typeof value === 'string') {
      const text = value.trim()
      if (text.startsWith('[')) {
        try { const parsed = JSON.parse(text); if (Array.isArray(parsed)) return parsed } catch (e) {}
      }
      return text ? [text] : []
    }
    return value == null || value === '' ? [] : [value]
  }
  const uniqueText = (values: any[]) => [...new Set(values.flatMap(parseList).filter(v => !invalid(v) && v !== '--').map(String))]
  const companyType = first('companyType')
  const shiLiType = list('shiLiType')
  const supplyType = first('supplyType', 'offerSupplyType')
  const province = first('province', 'shipProvince')
  const city = first('city', 'shipCity')
  const offerId = first('offerId', 'id')
  const detailUrl = first('offerUrl', 'productUrl', 'url') !== '--'
    ? first('offerUrl', 'productUrl', 'url')
    : offerId !== '--' ? 'https://detail.1688.com/offer/' + offerId + '.html' : '--'
  const productTagLabels: Record<string, string> = { '289794': '新品', '591618': '超级新品', '670594': '人气新品', '670722': '首发新品', '290562': '镇店之宝', '1803842': '定制', '4306497': '1688严选' }
  const faceMaskLabels: Record<string, string> = { '441218': '淘宝', '386434': '抖音', '422914': '拼多多', '422978': '小红书', '386370': '快手', '441410': '京东' }
  const sellerCodeLabels: Record<string, string> = { '4057409': '安心购', '888777': '深度认证报告' }
  const packageLabelMap: Record<string, string> = { '1': '未披露', '2': '仅披露重量', '3': '完整件重尺' }
  const rightsTagLabels: Record<string, string> = { '1988226': '一件代发', '449154': '先采后付' }
  const tagValues = uniqueText([source.titleTags])
  const productTags = tagValues.map((value: string) => productTagLabels[value]).filter(Boolean)
  if (source.isNew === 1 || source.isNew === true || source.isNew === '1') productTags.push('新品')
  const titleTags = [...new Set(productTags)]
  const skuValue = first('skuCount')
  const itemNoValue = first('itemNo')
  const buyerProtectionLabels = uniqueText([source.buyerProtections])
  void buyerProtectionLabels
  const crossBorderLabel = [...new Set([...uniqueText([source.kjServices, source.crossBorderService]), ...(tagValues.includes('425858') ? ['跨境专供'] : [])])].join('、') || '--'
  const rightsLabel = [...new Set([...uniqueText([source.buyerProtections]), ...tagValues.map(value => rightsTagLabels[value]).filter(Boolean)])].join('、') || '--'
  const packageLabels = parseList(source.packageStatus).map(value => packageLabelMap[String(value).trim()]).filter(Boolean)
  const supplyLabel = Array.isArray(supplyType) ? supplyType.map(value => SUPPLY_TYPE_LABELS[value] || '').filter(Boolean).join('、') : (SUPPLY_TYPE_LABELS[supplyType] || '--')
  const faceSupport = uniqueText([source.faceToFaceSupport, source.faceToFaceSupportStatus, tagValues])
  const faceLabels = faceSupport.map(value => faceMaskLabels[value] || (/[^0-9]/.test(value) ? value : '')).filter(Boolean)
  const sellerServiceLabels = uniqueText([source.sellerService, source.sellerServiceTags, tagValues])
    .map(value => sellerCodeLabels[value] || (/[^0-9]/.test(value) ? value : '')).filter(Boolean)
  const companyTypeLabel = companyType === 1 || companyType === '1' ? '贸易商' : companyType === 2 || companyType === '2' ? '工厂' : '--'
  const memberLabels = shiLiType.map(value => SHILI_TYPE_LABELS[value] || '').filter(value => value === '实力商家' || value === '超级工厂')
  const sellerServices = [...new Set(sellerServiceLabels)]
  return {
    '序号': index + 1,
    '商品主图': first('image'),
    '商品标题': first('title', 'subject'),
    '商品链接': detailUrl,
    '商品类目': first('levelName'),
    '商品ID': offerId,
    '上架时间': first('offerCreateTime'),
    '批发价': first('price'),
    '起批量': first('quantityBegin', 'startQuantity'),
    'sku数量': skuValue,
    '近30天订单数': first('bookedCount30d'),
    '近30天件数': first('saleQuantity30d'),
    '近30天销售额': first('salesVolume30d'),
    '24H揽收率': first('offerLgt24h'),
    '48H揽收率': first('offerLgt48h'),
    '7日订单增长率': first('bookedCount7dGrowthRate'),
    '7日采购集中率': first('purchaseRate7d'),
    '复购率': first('offerRepurchaseRate'),
    '代发价': first('consignPrice'),
    '跨境服务': invalid(crossBorderLabel) ? supplyLabel : crossBorderLabel,
    '权益保障': rightsLabel,
    '面单支持': faceLabels.length ? [...new Set(faceLabels)].join('、') : '--',
    '商品标识': titleTags.length ? titleTags.join('、') : '--',
    '商品货号': itemNoValue !== '--' ? itemNoValue : '--',
    '包装信息': packageLabels.length ? packageLabels.join('、') : '--',
    '供货类型': supplyLabel,
    '店铺名称': first('company'),
    '诚信通年限': first('tpYear'),
    '店铺48H履约率': first('shopLgt48h'),
    '店铺回头率': first('shopRepurchaseRate'),
    '店铺响应率': first('wwResponseRate'),
    '综合服务': first('compositeNewScore'),
    '所在地': [province, city].filter(value => !invalid(value) && value !== '--').join(' ') || '--',
    '公司类型': companyTypeLabel,
    '卖家会员类型': memberLabels.length ? memberLabels.join('、') : '--',
    '卖家服务': sellerServices.length ? sellerServices.join('、') : '--',
    '店铺链接': first('shopUrl'),
    '主图链接': first('image'),
    raw: source
  }
}

// 拉取 OBS 商品明细并规范化（默认按近30天销售件数降序）
export async function loadObsProducts(obsUrl: string, totalCount: any, convId: string, roundKey: string, query: string, hooks: {
  getCurrentAnswer: () => string
  getExportQuery: () => string
  getCurrentQuery: () => string
  saveConversationProducts: (convId: string, payload: any, roundKey: string) => void
  setObsMeta: (meta: any) => void
}): Promise<any> {
  const response = await fetch(obsUrl, { method: 'GET', mode: 'cors', credentials: 'omit' })
  if (!response.ok) throw new Error('商品数据请求失败: HTTP ' + response.status)
  const raw = await response.json()
  const parsed = parseNestedJson(raw)
  const items = Array.isArray(parsed) ? parsed
    : (Array.isArray(parsed && parsed.products) ? parsed.products
      : (Array.isArray(parsed && parsed.list) ? parsed.list
        : (Array.isArray(parsed && parsed.data) ? parsed.data : null)))
  if (!items) throw new Error('obsUrl 返回的数据不是商品数组')
  const rawProducts = items.slice(0, 10000)
  // 默认按近30天销售件数降序（saleQuantity30d）；后端排序缺失时由前端兜底
  rawProducts.sort((a: any, b: any) => (Number(b && b.saleQuantity30d) || 0) - (Number(a && a.saleQuantity30d) || 0))
  const products = rawProducts.map((raw: any, index: number) => normalizeProduct(raw, index))
  const payload: any = {
    count: products.length,
    totalCount: Number(totalCount || 0),
    products,
    obsUrl
  }
  hooks.setObsMeta({ obsUrl, totalCount: Number(totalCount || 0), fetchedCount: items.length, renderedCount: products.length })
  payload.query = query || hooks.getCurrentQuery() || hooks.getExportQuery() || ''
  hooks.saveConversationProducts(convId, payload, roundKey)
  return payload
}

/* ── 上下文兜底（后端 Dify 会话映射修复前的临时方案）──
   每个会话记录最近一次带商品词的提问；追问（仅数量/排序等）时自动拼接上一轮商品词发送。 */
const DLD_LQ_KEY = 'dld_last_query_by_conv'
function dldLqMap(): Record<string, string> { try { return JSON.parse(localStorage.getItem(DLD_LQ_KEY) || '{}') } catch (e) { return {} } }
export function dldLqGet(k: string): string { return dldLqMap()[k] || '' }
export function dldLqSet(k: string, v: string) { try { const m = dldLqMap(); if (v) { m[k] = v } else { delete m[k] } localStorage.setItem(DLD_LQ_KEY, JSON.stringify(m)) } catch (e) {} }
export function dldIsChitchat(t: any): boolean { return /你是谁|你好|您好|谢谢|感谢|介绍一下|什么是|怎么用|帮助|能做什么/.test(t || '') }
export function dldHasProductWord(t: any): boolean {
  if (!t || dldIsChitchat(t)) return false
  const stripped = String(t)
    .replace(/\d+\s*(条|个|款|件|批)/g, '')
    .replace(/再来一批|重新(检索|搜索|查询?|找)|按.{0,6}(销量|价格|订单).{0,4}(排序|降序|升序)|销量(降序|排序)?|近\d+天/g, '')
    .replace(/我想要|我想看|我想|我要|给我|帮我找|帮我查|查一下|搜索|找一下|再来|换成/g, '')
    .replace(/[，,。.!！?？、\s\d]/g, '')
  return /[\u4e00-\u9fa5]{2,}/.test(stripped)
}

// 旧版 loadOffersForQuery 已随 chat store 迁移，此处仅保留 API 引用防抖
export { DLD }
