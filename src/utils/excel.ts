/* =====================================================
 * 零依赖 XLSX 导出（ZIP + OOXML，1688 橙色主题样式）
 * 自 index.html L9483-L9854 原样迁移，只加类型。
 * ===================================================== */
import { PRODUCT_TABLE_HEADERS } from './productFields'

const XLSX_CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    t[n] = c >>> 0
  }
  return t
})()

function crc32(u8: Uint8Array): number {
  let c = 0xFFFFFFFF
  for (let i = 0; i < u8.length; i++) c = XLSX_CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

// 极简字节写出器：按需拼接 u16/u32/字节数组
function xlsxByteWriter() {
  const parts: Uint8Array[] = []
  let len = 0
  return {
    u16(v: number) { parts.push(new Uint8Array([v & 0xFF, (v >>> 8) & 0xFF])); len += 2 },
    u32(v: number) { parts.push(new Uint8Array([v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF])); len += 4 },
    bytes(a: Uint8Array) { parts.push(a); len += a.length },
    done() { const out = new Uint8Array(len); let p = 0; parts.forEach(x => { out.set(x, p); p += x.length }); return out }
  }
}

interface ZipEntry { name: string; data: Uint8Array | string }

// 打包 ZIP：全部 stored（不压缩），实现最简且 Excel/WPS 兼容
function buildXlsxZip(entries: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder()
  const local = xlsxByteWriter(), central = xlsxByteWriter()
  const now = new Date()
  const dTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF
  const dDate = ((((now.getFullYear() - 1980) & 0x7F) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF
  let offset = 0
  entries.forEach(e => {
    const data = e.data instanceof Uint8Array ? e.data : enc.encode(e.data)
    const name = enc.encode(e.name)
    const crc = crc32(data)
    local.u32(0x04034B50); local.u16(20); local.u16(0x0800); local.u16(0)
    local.u16(dTime); local.u16(dDate); local.u32(crc); local.u32(data.length); local.u32(data.length)
    local.u16(name.length); local.u16(0); local.bytes(name); local.bytes(data)
    central.u32(0x02014B50); central.u16(20); central.u16(20); central.u16(0x0800); central.u16(0)
    central.u16(dTime); central.u16(dDate); central.u32(crc); central.u32(data.length); central.u32(data.length)
    central.u16(name.length); central.u16(0); central.u16(0); central.u16(0); central.u16(0)
    central.u32(0); central.u32(offset); central.bytes(name)
    offset += 30 + name.length + data.length
  })
  const cd = central.done()
  const end = xlsxByteWriter()
  end.u32(0x06054B50); end.u16(0); end.u16(0)
  end.u16(entries.length); end.u16(entries.length)
  end.u32(cd.length); end.u32(offset); end.u16(0)
  const tail = end.done(), head = local.done()
  const out = new Uint8Array(head.length + cd.length + tail.length)
  out.set(head, 0); out.set(cd, head.length); out.set(tail, head.length + cd.length)
  return out
}

function xlsxXmlEscape(s: any): string {
  return String(s == null ? '' : s)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function xlsxColLetter(n: number): string { // 0-based → A/B/.../AA...
  let s = ''
  for (let x = n + 1; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + (x - 1) % 26) + s
  return s
}

// 列宽按内容估算（中文按 2 个字符宽），再按字段类型限制范围
function xlsxColWidth(texts: string[], minWidth?: number, maxWidth?: number): number {
  let max = 0
  texts.forEach(t => String(t || '').split('\n').forEach(line => {
    let w = 0
    for (const ch of line) w += ch.charCodeAt(0) > 255 ? 2 : 1
    if (w > max) max = w
  }))
  return Math.min(Math.max(max + 2, minWidth == null ? 8 : minWidth), maxWidth == null ? 45 : maxWidth)
}

function xlsxColumnWidth(header: string, texts: string[]): number {
  const compact = new Set(['序号', '上架时间', '批发价', '起批量', 'sku数量', '近30天订单数', '近30天件数', '近30天销售额', '24H揽收率', '48H揽收率', '7日订单增长率', '7日采购集中率', '复购率', '代发价', '店铺48H履约率', '店铺回头率', '店铺响应率', '综合服务'])
  const medium = new Set(['商品ID', '商品类目', '店铺名称', '诚信通年限', '所在地', '公司类型', '卖家会员类型', '商品货号'])
  const wide = new Set(['商品标题', '包装信息', '供货类型', '商品标识', '卖家服务'])
  const links = new Set(['商品链接', '店铺链接', '主图链接'])
  if (compact.has(header)) return xlsxColWidth(texts, 8, 14)
  if (medium.has(header)) return xlsxColWidth(texts, 12, 24)
  if (wide.has(header)) return xlsxColWidth(texts, 14, 30)
  if (links.has(header)) return xlsxColWidth(texts, 16, 28)
  if (header === '商品主图') return 12
  return xlsxColWidth(texts, 10, 24)
}

// 单元格 → 内联字符串（inlineStr，免 sharedStrings 部件）
function xlsxCellXml(r: number, c: number, v: any, style: number): string {
  const text = xlsxXmlEscape(v).replace(/\n/g, '&#10;')
  return '<c r="' + xlsxColLetter(c) + r + '" s="' + style + '" t="inlineStr"><is><t xml:space="preserve">' + text + '</t></is></c>'
}

// 工作表：冻结首行 + 表头筛选 + 自适应列宽
function buildSheetXml(headers: string[], rows: string[][], imgRows: Set<number> | null, anchoredCols: number[] | null, hasDrawing: boolean): string {
  const widths: number[] = []
  for (let c = 0; c < headers.length; c++) widths.push(xlsxColumnWidth(headers[c], [headers[c]].concat(rows.map(r => r[c]))))
  // 图片列列宽：保底 12（容纳 84px 图 + 偏移），并硬上限 14
  ;(anchoredCols || []).forEach(c => { widths[c] = Math.min(Math.max(widths[c] || 8, 12), 14) })
  const cols = '<cols>' + widths.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join('') + '</cols>'
  const headRow = '<row r="1" ht="26" customHeight="1">' + headers.map((h, c) => xlsxCellXml(1, c, h, 1)).join('') + '</row>'
  const bodyRows = rows.map((r, ri) => '<row r="' + (ri + 2) + '"' + (imgRows && imgRows.has(ri + 2) ? ' ht="50" customHeight="1"' : '') + '>'
    + headers.map((h, c) => xlsxCellXml(ri + 2, c, r[c], ri % 2 ? 3 : 2)).join('') + '</row>').join('')
  const lastCell = xlsxColLetter(headers.length - 1) + (rows.length + 1)
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    + '<sheetFormatPr defaultRowHeight="20"/>'
    + cols
    + '<sheetData>' + headRow + bodyRows + '</sheetData>'
    + '<autoFilter ref="A1:' + lastCell + '"/>'
    + (hasDrawing ? '<drawing r:id="rIdDrw1"/>' : '')
    + '</worksheet>'
}

// 识别图片格式并读取像素尺寸：Excel 仅可靠支持 jpeg/png
function xlsxImgInfo(u8: Uint8Array): { ext: string; w: number; h: number } | null {
  if (u8.length > 24 && u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4E && u8[3] === 0x47) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
    return { ext: 'png', w: dv.getUint32(16), h: dv.getUint32(20) }
  }
  if (u8.length > 9 && u8[0] === 0xFF && u8[1] === 0xD8) {
    let off = 2
    while (off + 9 < u8.length) {
      if (u8[off] !== 0xFF) { off++; continue }
      const marker = u8[off + 1]
      if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
        return { ext: 'jpg', w: (u8[off + 7] << 8) | u8[off + 8], h: (u8[off + 5] << 8) | u8[off + 6] }
      }
      off += 2 + ((u8[off + 2] << 8) | u8[off + 3])
    }
  }
  return null
}

interface PreparedImage { bytes: Uint8Array; ext: string; w: number; h: number }

// 嵌入前压缩：降采样到最长边 ≤240px、重编码 JPEG q0.78；白底填充避免透明 PNG 转 JPEG 发黑
async function xlsxPrepareImage(bytes: Uint8Array, info: { ext: string; w: number; h: number } | null): Promise<PreparedImage | null> {
  const decode = async (blob: Blob) => {
    try {
      const bmp = await createImageBitmap(blob)
      const dim = { w: bmp.width, h: bmp.height }
      return { bmp, dim }
    } catch (e) { return null }
  }
  const toJpeg = async (bmp: ImageBitmap, w: number, h: number) => {
    const cv = document.createElement('canvas')
    cv.width = w; cv.height = h
    const ctx = cv.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(bmp, 0, 0, w, h)
    const blob = await new Promise<Blob | null>(res => cv.toBlob(res, 'image/jpeg', 0.78))
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null
  }
  try {
    if (info) {
      // jpg/png：已足够小（<40KB 且 ≤260px）直接用原字节，避免重复编码损失画质
      if (bytes.length < 40960 && Math.max(info.w, info.h) <= 260) return { bytes, ext: info.ext, w: info.w, h: info.h }
      const dec = await decode(new Blob([bytes as any], { type: info.ext === 'png' ? 'image/png' : 'image/jpeg' }))
      if (!dec) return { bytes, ext: info.ext, w: info.w, h: info.h }
      const scale = Math.min(240 / Math.max(dec.dim.w, dec.dim.h), 1)
      const w = Math.max(1, Math.round(dec.dim.w * scale)), h = Math.max(1, Math.round(dec.dim.h * scale))
      const out = await toJpeg(dec.bmp, w, h)
      if (dec.bmp.close) dec.bmp.close()
      // 重编码没变小就用原字节
      if (out && out.length && out.length < bytes.length) return { bytes: out, ext: 'jpg', w, h }
      return { bytes, ext: info.ext, w: info.w, h: info.h }
    }
    // 非 jpg/png（webp/avif 等）：canvas 能解码就转 JPEG 嵌入，不能则返回 null 走 URL 兜底
    const dec = await decode(new Blob([bytes as any]))
    if (!dec) return null
    const scale = Math.min(240 / Math.max(dec.dim.w, dec.dim.h), 1)
    const w = Math.max(1, Math.round(dec.dim.w * scale)), h = Math.max(1, Math.round(dec.dim.h * scale))
    const out = await toJpeg(dec.bmp, w, h)
    if (dec.bmp.close) dec.bmp.close()
    return out && out.length ? { bytes: out, ext: 'jpg', w, h } : null
  } catch (e) {
    return info ? { bytes, ext: info.ext, w: info.w, h: info.h } : null
  }
}

// 拉取单张图片字节：CORS/超时/无法解码一律返回 null，由调用方降级为 URL 文字
async function xlsxFetchImg(url: string): Promise<PreparedImage | null> {
  try {
    const abs = new URL(url, location.href).href.replace(/^http:/, 'https:')
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch(abs, { mode: 'cors', credentials: 'omit', signal: ctrl.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    return await xlsxPrepareImage(bytes, xlsxImgInfo(bytes))
  } catch (e) { return null }
}

// 绘图层：每张图 oneCellAnchor 锚定所在单元格，等比缩放适配 84x60px 盒子（1px = 9525 EMU）
function buildDrawingXml(images: Array<PreparedImage & { col: number; row: number; relId: number }>): string {
  const EMU = 9525, BOXW = 84, BOXH = 60
  const pics = images.map((im, i) => {
    const scale = Math.min(BOXW / im.w, BOXH / im.h, 1)
    const cx = Math.max(1, Math.round(im.w * scale)) * EMU, cy = Math.max(1, Math.round(im.h * scale)) * EMU
    return '<xdr:oneCellAnchor>'
      + '<xdr:from><xdr:col>' + im.col + '</xdr:col><xdr:colOff>47625</xdr:colOff><xdr:row>' + (im.row + 1) + '</xdr:row><xdr:rowOff>76200</xdr:rowOff></xdr:from>'
      + '<xdr:ext cx="' + cx + '" cy="' + cy + '"/>'
      + '<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="' + (i + 2) + '" name="图片 ' + (i + 1) + '"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>'
      + '<xdr:blipFill><a:blip r:embed="rId' + im.relId + '"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>'
      + '<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>'
      + '</xdr:pic><xdr:clientData/></xdr:oneCellAnchor>'
  }).join('')
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + pics + '</xdr:wsDr>'
}

function buildDrawingRelsXml(images: Array<{ relId: number; ext: string }>): string {
  const rels = images.map((im, i) =>
    '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image' + (i + 1) + '.' + im.ext + '"/>'
  ).join('')
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels + '</Relationships>'
}

function buildSheetRelsXml(): string {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rIdDrw1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>'
    + '</Relationships>'
}

// 样式表：0默认 / 1绿底白字粗体表头 / 2白底数据行 / 3淡绿斑马纹行
function buildStylesXml(): string {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<fonts count="3">'
    + '<font><sz val="11"/><color theme="1"/><name val="微软雅黑"/><charset val="134"/></font>'
    + '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="微软雅黑"/><charset val="134"/></font>'
    + '<font><sz val="10"/><color rgb="FF3C4652"/><name val="微软雅黑"/><charset val="134"/></font>'
    + '</fonts>'
    + '<fills count="5">'
    + '<fill><patternFill patternType="none"/></fill>'
    + '<fill><patternFill patternType="gray125"/></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FF00A83E"/><bgColor indexed="64"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFE9F7EE"/><bgColor indexed="64"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill>'
    + '</fills>'
    + '<borders count="2">'
    + '<border><left/><right/><top/><bottom/><diagonal/></border>'
    + '<border><left style="thin"><color rgb="FFBFE7CB"/></left><right style="thin"><color rgb="FFBFE7CB"/></right><top style="thin"><color rgb="FFBFE7CB"/></top><bottom style="thin"><color rgb="FFBFE7CB"/></bottom><diagonal/></border>'
    + '</borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="4">'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    + '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    + '<xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>'
    + '<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>'
    + '</cellXfs>'
    + '<cellStyles count="1"><cellStyle name="常规" xfId="0" builtinId="0"/></cellStyles>'
    + '</styleSheet>'
}

export interface ImgCell { row: number; col: number; url: string }

// 组装并下载 .xlsx：headers/rows 为纯文本二维数组；imgCells [{row,col,url}]（row 为 0 基数据行）嵌真图，拉取失败自动降级为 URL 文字
export async function exportTableToXlsx(headers: string[], rows: string[][], filename: string, sheetTitle: string, imgCells?: ImgCell[]): Promise<void> {
  const name = String(sheetTitle || '数据').replace(/[\\/?*[\]:]/g, ' ').trim() || '数据'
  // 并发拉取图片（上限 200 张，防止卡死）；失败项回填 URL 文字
  const imgs = (imgCells || []).slice(0, 200)
  const fetched = await Promise.all(imgs.map(ic => xlsxFetchImg(ic.url)))
  const okImgs: Array<PreparedImage & { row: number; col: number; relId: number }> = []
  fetched.forEach((r, i) => { if (r) okImgs.push(Object.assign({ row: imgs[i].row, col: imgs[i].col, relId: okImgs.length + 1 }, r)) })
  if (okImgs.length < imgs.length) {
    const failMap: Record<number, Record<number, string>> = {}
    imgs.forEach((ic, i) => { if (!fetched[i]) (failMap[ic.row] = failMap[ic.row] || {})[ic.col] = ic.url })
    rows = rows.map((r, ri) => failMap[ri] ? r.map((v, c) => failMap[ri][c] ? failMap[ri][c] : v) : r)
  }
  const hasImg = okImgs.length > 0
  const ctDefaults = '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + (hasImg && okImgs.some(im => im.ext === 'jpg') ? '<Default Extension="jpg" ContentType="image/jpeg"/>' : '')
    + (hasImg && okImgs.some(im => im.ext === 'png') ? '<Default Extension="png" ContentType="image/png"/>' : '')
  const files: ZipEntry[] = [
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + ctDefaults
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + (hasImg ? '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : '')
      + '</Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + '</Relationships>' },
    { name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + '<sheets><sheet name="' + xlsxXmlEscape(name.slice(0, 28)) + '" sheetId="1" r:id="rId1"/></sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
      + '</Relationships>' },
    { name: 'xl/styles.xml', data: buildStylesXml() },
    { name: 'xl/worksheets/sheet1.xml', data: buildSheetXml(headers, rows,
        hasImg ? new Set(okImgs.map(im => im.row + 2)) : null,
        hasImg ? Array.from(new Set(okImgs.map(im => im.col))) : null,
        hasImg) }
  ]
  if (hasImg) {
    okImgs.forEach((im, i) => files.push({ name: 'xl/media/image' + (i + 1) + '.' + im.ext, data: im.bytes }))
    files.push({ name: 'xl/drawings/drawing1.xml', data: buildDrawingXml(okImgs) })
    files.push({ name: 'xl/drawings/_rels/drawing1.xml.rels', data: buildDrawingRelsXml(okImgs) })
    files.push({ name: 'xl/worksheets/_rels/sheet1.xml.rels', data: buildSheetRelsXml() })
  }
  const blob = new Blob([buildXlsxZip(files) as any], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 3000)
}

// 富文本单元格 → {text, img, link}：__mdTables.rows 存的是 inlineMd 渲染后的 HTML，故 HTML 优先、Markdown 兜底。
export function xlsxCellParts(html: any): { text: string; img: string; link: string } {
  const s = String(html == null ? '' : html)
  const htmlImg = s.match(/<img[^>]*\ssrc="([^"]*)"/i)
  const mdImg = s.match(/!\[\]\(([^)]+)\)/)
  const htmlLink = s.match(/<a[^>]*\shref="([^"]*)"/i)
  const mdLink = s.match(/\[[^\]]*\]\((https?:\/\/[^)]+)\)/i)
  const text = s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/gi, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim()
  return {
    text,
    img: htmlImg ? htmlImg[1] : (mdImg ? mdImg[1] : ''),
    link: htmlLink ? htmlLink[1] : (mdLink ? mdLink[1] : '')
  }
}

// 对话表格详情 → 导出 xlsx：严格按 38 列字段导出，并嵌入商品主图。
export async function exportMdTableToXlsx(t: { headers: string[]; rows: string[][]; title: string }): Promise<void> {
  if (!t) return
  const parts = t.rows.map(r => r.map(xlsxCellParts))
  const imgCells: ImgCell[] = []
  const headers = t.headers || PRODUCT_TABLE_HEADERS
  const imageCol = headers.indexOf('商品主图')
  parts.forEach((r, ri) => r.forEach((p, ci) => { if (p.img) imgCells.push({ row: ri, col: ci, url: p.img }) }))
  const exportRows = parts.map(r => {
    const row = r.map((p, ci) => {
      // 商品主图列不写 URL 文字：图片嵌入成功即纯图片展示；拉取失败时由 exportTableToXlsx 回填 URL 兜底
      if (ci === imageCol) return p.img ? '' : (p.text || '--')
      if (headers[ci] === '商品链接' && p.link) return p.link || p.text || '--'
      if (headers[ci] === '店铺链接' && p.link) return p.link
      if (headers[ci] === '主图链接' && p.link) return p.link
      return p.text || '--'
    })
    // 导出 38 列规范：展示表无"商品链接/店铺链接/主图链接"列 → 补齐
    if (!headers.includes('店铺链接')) {
      const titleIdx = headers.indexOf('商品标题')
      const shopNameIdx = headers.indexOf('店铺名称')
      const detailUrl = titleIdx >= 0 && r[titleIdx] ? (r[titleIdx].link || '') : ''
      const shopUrl = shopNameIdx >= 0 && r[shopNameIdx] ? (r[shopNameIdx].link || '') : ''
      const mainImg = imageCol >= 0 && r[imageCol] ? (r[imageCol].img || '') : ''
      if (!headers.includes('商品链接')) row.splice(3, 0, detailUrl || '--')
      row.push(shopUrl || '--', mainImg || '--')
    }
    return row
  })
  // 表头按同一规则补齐为 38 列（兼容三类历史表头）
  const exportHeaders = headers.includes('店铺链接')
    ? headers
    : (headers.includes('商品链接')
        ? headers.concat(['店铺链接', '主图链接'])
        : headers.slice(0, 3).concat(['商品链接'], headers.slice(3), ['店铺链接', '主图链接']))
  await exportTableToXlsx(exportHeaders, exportRows, (t.title || '对话表格详情') + '.xlsx', t.title || '对话表格详情', imgCells)
}
