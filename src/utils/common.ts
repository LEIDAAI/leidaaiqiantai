/* 全局通用小工具（自 index.html 原样迁移） */

// 全局 HTML 转义（renderOffers / renderMessageBubble 共用）
export function escapeHtml(s: any): string {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (ch: string) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[ch])
}

export function escapeAttr(s: any): string {
  return escapeHtml(s)
}

// ISO 时间 → 友好相对时间（L9101）
export function formatRelativeTime(iso: any): string {
  const t = new Date(iso).getTime()
  if (!t) return ''
  const diff = (Date.now() - t) / 1000
  if (diff < 60) return '刚刚'
  if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前'
  if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前'
  if (diff < 7 * 86400) return Math.floor(diff / 86400) + ' 天前'
  return new Date(iso).toISOString().slice(0, 10)
}

// 轻提示（全局）
export function flashToast(text: string): void {
  let el = document.getElementById('flashToast')
  if (!el) {
    el = document.createElement('div')
    el.id = 'flashToast'
    el.setAttribute('role', 'status')
    document.body.appendChild(el)
  }
  el.textContent = text
  el.classList.add('visible')
  clearTimeout((el as any)._t)
  ;(el as any)._t = setTimeout(() => { el!.classList.remove('visible') }, 1800)
}

export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

export function fmtN(n: any): string {
  return Number(n || 0).toLocaleString('zh-CN')
}

// 剪贴板写入：优先 Clipboard API，失败降级 execCommand（需在用户手势内调用）
export async function writeClipboard(text: string): Promise<boolean> {
  let ok = false
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try { await navigator.clipboard.writeText(text); ok = true } catch (e1) { ok = false }
  }
  if (!ok) {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    try { ok = document.execCommand('copy') } catch (e2) { ok = false }
    ta.remove()
  }
  return ok
}
