/* =====================================================
 * 技能/专家视觉映射
 * 技能：按名称关键词分配独立图标 + 渐变配色（先匹配名称，再匹配标签/场景）
 * 专家：平台渐变底 + 类目角标图标
 * 供首页卡片、Composer 技能弹层、灵感广场/我的列表共用
 * ===================================================== */

const svg = (inner: string, size = 18) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`

interface VisualRule { keys: string[]; grad: string; icon: string }

/* 顺序即优先级：更具体的业务词放前面 */
const RULES: VisualRule[] = [
  { keys: ['利润', '测算', '成本'], grad: 'linear-gradient(135deg,#fb923c,#ea580c)', icon: svg('<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8"/><path d="M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01M8 18h6"/>') },
  { keys: ['监控', '预警', '监测'], grad: 'linear-gradient(135deg,#fbbf24,#f59e0b)', icon: svg('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>') },
  { keys: ['比价'], grad: 'linear-gradient(135deg,#38bdf8,#0284c7)', icon: svg('<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1z"/><path d="M7 21h10"/><path d="M12 3v18"/>') },
  { keys: ['差评', '评论', '痛点', '口碑'], grad: 'linear-gradient(135deg,#fb7185,#e11d48)', icon: svg('<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z"/><path d="M12 8v4"/><path d="M12 16h.01"/>') },
  { keys: ['工厂', '源头', '供货'], grad: 'linear-gradient(135deg,#2dd4bf,#0d9488)', icon: svg('<path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/><path d="M17 18h1M12 18h1M7 18h1"/>') },
  { keys: ['关键词', '词库', '长尾'], grad: 'linear-gradient(135deg,#818cf8,#4f46e5)', icon: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/><path d="M8 11h6M11 8v6"/>') },
  { keys: ['asin', '诊断', '竞争'], grad: 'linear-gradient(135deg,#22d3ee,#0891b2)', icon: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>') },
  { keys: ['listing', '标题'], grad: 'linear-gradient(135deg,#60a5fa,#2563eb)', icon: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h4"/>') },
  { keys: ['清单', '试销'], grad: 'linear-gradient(135deg,#a3e635,#65a30d)', icon: svg('<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8M13 12h8M13 18h8"/>') },
  { keys: ['类目'], grad: 'linear-gradient(135deg,#e879f9,#c026d3)', icon: svg('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>') },
  { keys: ['趋势', '机会', '飙升', '雷达', '发现'], grad: 'linear-gradient(135deg,#a78bfa,#7c3aed)', icon: svg('<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>') },
  { keys: ['报告', '选品', '分析'], grad: 'linear-gradient(135deg,#34d399,#059669)', icon: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 17v-3M12 17v-5M16 17v-2"/>') },
]
const FALLBACK: VisualRule = { keys: [], grad: 'linear-gradient(135deg,#00c853,#00913a)', icon: svg('<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>') }

function match(hay: string): VisualRule {
  for (const r of RULES) if (r.keys.some(k => hay.includes(k))) return r
  return FALLBACK
}

export function skillVisual(item: { name: string; tags?: string[]; scenario?: string }): { icon: string; grad: string } {
  /* 先按名称匹配（最准确的语义），再按标签与场景兜底 */
  const byName = match(String(item.name || '').toLowerCase())
  if (byName !== FALLBACK) return { icon: byName.icon, grad: byName.grad }
  const hay = `${item.name}|${(item.tags || []).join('|')}|${item.scenario || ''}`.toLowerCase()
  const r = match(hay)
  return { icon: r.icon, grad: r.grad }
}

/* 专家：平台渐变底色 */
const PLATFORM_GRADS: Record<string, string> = {
  '1688': 'linear-gradient(135deg,#ff9040,#ff6a00)',
  'Ozon': 'linear-gradient(135deg,#4d86ff,#005bff)',
  '亚马逊': 'linear-gradient(135deg,#ffb84d,#f08804)',
  'Temu': 'linear-gradient(135deg,#ff9450,#fb7701)',
}
export function platformGrad(p: string): string {
  return PLATFORM_GRADS[p] || FALLBACK.grad
}

/* 平台官方 logo（public/platforms/ 下，base 为 ./ 相对路径） */
const PLATFORM_LOGOS: Record<string, string> = {
  '1688': 'platforms/1688.png',
  'Ozon': 'platforms/ozon.png',
  'OZON': 'platforms/ozon.png',
  '亚马逊': 'platforms/amazon.png',
  'Temu': 'platforms/temu.png',
  'TEMU': 'platforms/temu.png',
}
export function platformLogo(p: string): string {
  const f = PLATFORM_LOGOS[p]
  return f ? import.meta.env.BASE_URL + f : ''
}

/* 专家：类目角标（小尺寸，叠在平台头像右下角） */
export function categoryIcon(category: string): string {
  const glyph = category.includes('评论')
    ? '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'
    : category.includes('店铺')
      ? '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>'
      : category.includes('商品')
        ? '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>'
        : category.includes('监控')
          ? '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>'
          : '<path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96 12 12.01l8.73-5.05"/><path d="M12 22.08V12"/>'
  return svg(glyph, 11)
}
