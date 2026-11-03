/* =====================================================
 * 专家 · 技能 · MCP 面板状态
 * ===================================================== */
import { reactive, watch } from 'vue'

export type ExpertTab = 'expert' | 'skill' | 'mcp'

export interface ExpertItem {
  id: string
  name: string
  desc: string
  tags: string[]
  platform: string
  category: string
  source: 'official' | 'user'
  instructions?: string
  references?: string[]
  categoryLabel?: string
  usageCount?: number
  capabilities?: string[]
  prompts?: string[]
  caseTitle?: string
  caseHeaders?: string[]
  caseRows?: string[][]
  caseMetrics?: { label: string; value: string }[]
  caseConclusion?: string
  caseImage?: string
  wordLibraryIds?: string[]
  productLibraryIds?: string[]
}

export interface SkillItem {
  id: string
  name: string
  desc: string
  tags: string[]
  source: 'official' | 'user'
  instructions?: string
  references?: string[]
  categoryLabel?: string
  version?: string
  downloadCount?: number
  author?: string
  tools?: string[]
  steps?: string[]
  outputExample?: string
  scenario?: string
}

export const wordLibraries = [
  { id: 'w1', name: '家居收纳核心词库', detail: '收纳盒、抽屉分隔、桌面整理、storage organizer' },
  { id: 'w2', name: 'Ozon 俄语长尾词库', detail: 'органайзер、держатель телефона、для кухни' },
  { id: 'w3', name: '亚马逊瑜伽与健身词库', detail: 'yoga mat、non slip、home workout、fitness' },
]
export const productLibraries = [
  { id: 'p1', name: '1688 家居潜力商品池', detail: '36 款 · 折叠收纳箱、抽屉分隔板、厨房置物架' },
  { id: 'p2', name: 'Ozon 手机配件对标库', detail: '24 款 · 桌面支架、车载支架、磁吸底座' },
  { id: 'p3', name: 'Temu 家居竞品库', detail: '48 款 · 收纳、清洁、厨房小工具' },
]

export interface McpService {
  id: string
  name: string
  url: string
  desc: string
  protocol: string
  auth: string
  tools: string[]
  enabled: boolean
}

export const expertState = reactive({
  open: false,
  activeTab: 'expert' as ExpertTab,
  // 电商专家
  expertSearch: '',
  expertSourceFilter: 'all' as 'all' | 'official' | 'user',
  expertCategoryFilter: 'all' as 'all' | '选品上架' | '店铺运营' | '商品管理' | '评论分析',
  expertPlatformFilter: 'all' as 'all' | '1688' | 'Ozon' | '亚马逊' | 'Temu',
  // 技能
  skillSearch: '',
  skillSourceFilter: 'all' as 'all' | 'official' | 'user',
  skillTypeFilter: 'all' as 'all' | '选品' | '评论分析' | '监控' | '比价' | 'Listing' | '趋势',
  // MCP
  mcpSearch: '',
  mcpStatusFilter: 'all' as 'all' | 'enabled' | 'disabled',
  installedSkillIds: [] as string[],
  storageError: '',
  // 数据
  experts: [
    { id: 'e1', name: '1688-1688分销选品', desc: '从1688分销选品，从海量货源中筛选（按搜索/热销）类目/款式/分销商，按品类筛选成交数据，输出Top {10} 选品。', tags: ['选品上架', '1688'], platform: '1688', category: '选品上架', source: 'official' as const },
    { id: 'e2', name: '1688-拿货价格定位', desc: '分析价格区间内 拿货（或溢价）在1688 的价格分布与销量的关系，帮助选品找到参考价位。', tags: ['选品上架', '1688'], platform: '1688', category: '选品上架', source: 'official' as const },
    { id: 'e3', name: '1688-一件代发工厂筛选', desc: '从源头工厂 搜索 按地域（公司）与起订量（{10}）筛选支持一件代发的源头工厂，并上传力推款。', tags: ['选品上架', '1688'], platform: '1688', category: '选品上架', source: 'official' as const },
    { id: 'e4', name: '1688-商品货源监测', desc: '按关键词/分类 按来源（或{爆款/花名}）商品，查找到 1688 上同款/相似商品的同行价格与起订量。', tags: ['选品上架', '1688'], platform: '1688', category: '选品上架', source: 'official' as const },
    { id: 'e5', name: 'Ozon-类目基础信息查询', desc: '从类目信息 查询 Ozon {目标类目} 类目的商品数、动销率与均价，评估市场饱和度。', tags: ['店铺运营', 'Ozon'], platform: 'Ozon', category: '店铺运营', source: 'official' as const },
    { id: 'e6', name: 'Ozon-关键词入局时机', desc: '按搜索量/增速 对比近 30/90 天 {关键词} 的搜索量与成交趋势，判断最佳入局窗口。', tags: ['选品上架', 'Ozon'], platform: 'Ozon', category: '选品上架', source: 'official' as const },
    { id: 'e7', name: 'Ozon-细分选品验证', desc: '按类目/品牌 针对搜索量/均价 {手机支架}，验证 Ozon 该品类的需求规模与价格竞争格局。', tags: ['选品上架', 'Ozon'], platform: 'Ozon', category: '选品上架', source: 'official' as const },
    { id: 'e8', name: 'Ozon-细分差评归因', desc: '按 {手机支架} 抓取 {手机支架} 类目头部商品的 {300} 条差评，按问题类型归纳并给出改进建议。', tags: ['评论分析', 'Ozon'], platform: 'Ozon', category: '评论分析', source: 'official' as const },
    { id: 'e9', name: '亚马逊-核心词挖掘', desc: '挖掘 {瑜伽垫} 核心搜索词，分析搜索量与竞争度，输出Top关键词列表。', tags: ['选品上架', '亚马逊'], platform: '亚马逊', category: '选品上架', source: 'official' as const },
    { id: 'e10', name: '亚马逊-ASIN解析', desc: '解析 {B0XXXXX} ASIN 的BSR排名、价格历史、Review趋势，评估产品竞争力。', tags: ['商品管理', '亚马逊'], platform: '亚马逊', category: '商品管理', source: 'official' as const },
    { id: 'e11', name: '亚马逊-类目热搜词', desc: '获取 {Kitchen} 类目热搜关键词，分析搜索趋势与季节性波动。', tags: ['选品上架', '亚马逊'], platform: '亚马逊', category: '选品上架', source: 'official' as const },
    { id: 'e12', name: 'Temu-家居热销榜', desc: '抓取 Temu 家居类目热销Top {50}，分析价格区间与评分分布。', tags: ['选品上架', 'Temu'], platform: 'Temu', category: '选品上架', source: 'official' as const },
    { id: 'e13', name: 'Temu-动销比飙升榜', desc: '监控 Temu 动销比飙升商品，发现潜力爆款。', tags: ['监控', 'Temu'], platform: 'Temu', category: '店铺运营', source: 'official' as const },
    { id: 'e14', name: 'Temu-1688比价', desc: '将 Temu 商品与1688同款进行比价，计算利润空间。', tags: ['比价', 'Temu', '1688'], platform: 'Temu', category: '选品上架', source: 'official' as const },
  ] as ExpertItem[],
  skills: [
    { id: 's1', name: '一键选品报告', desc: '输入关键词，自动生成包含市场分析、竞品对比、利润测算的完整选品报告', tags: ['选品', '一键复用'], source: 'official' as const, scenario: '选品与开发' },
    { id: 's2', name: '差评深度分析', desc: '抓取目标商品差评，按问题类型归纳并生成改进建议报告', tags: ['评论分析', '一键复用'], source: 'official' as const, scenario: '数据分析' },
    { id: 's3', name: '价格监控预警', desc: '设置目标价格区间，自动监控竞品价格变动并推送预警', tags: ['监控', '比价'], source: 'official' as const, scenario: '选品与开发' },
    { id: 's4', name: 'Listing优化建议', desc: '分析竞品Listing，生成标题、关键词、图片优化建议', tags: ['Listing', '选品'], source: 'official' as const, scenario: '产品运营' },
    { id: 's5', name: '趋势品类发现', desc: '基于搜索量增速与动销比，发现近期飙升的潜力品类', tags: ['趋势', '选品'], source: 'official' as const, scenario: '选品/热点' },
  ] as SkillItem[],
  mcpServices: [
    { id: 'm1', name: '店雷达开放MCP', url: 'https://radar.example.com/mcp', desc: '店雷达官方MCP服务，提供选品、评论、比价等工具', protocol: 'Streamable HTTP', auth: 'Bearer Token', tools: ['@选品榜单查询', '@评论抓取', '@货源比价', '@关键词挖掘'], enabled: true },
    { id: 'm2', name: '1688数据MCP', url: 'https://mcp.1688.example.com/api', desc: '1688平台数据接口，支持商品搜索、价格查询', protocol: 'Streamable HTTP', auth: 'API Key', tools: ['@商品搜索', '@价格查询', '@供应商信息'], enabled: true },
    { id: 'm3', name: 'Ozon数据MCP', url: 'https://mcp.ozon.example.com/api', desc: 'Ozon平台数据接口，支持类目查询、关键词分析', protocol: 'SSE', auth: 'Bearer Token', tools: ['@类目查询', '@关键词分析', '@商品详情'], enabled: false },
  ] as McpService[],
})

const extraSkills: SkillItem[] = [
  { id: 's6', name: '1688 源头工厂评分', desc: '对比起订量、交期、回购率与代发能力，筛出适合小单试销的供应商。', tags: ['选品', '比价', '1688'], source: 'official', scenario: '选品与开发' },
  { id: 's7', name: 'Ozon 俄语关键词拓展', desc: '围绕手机支架拓展俄语长尾词，按搜索热度与购买意图分组。', tags: ['Listing', '趋势', 'Ozon'], source: 'official', scenario: '产品运营' },
  { id: 's8', name: '亚马逊 ASIN 竞争诊断', desc: '结合排名、评论门槛和价格带，判断目标 ASIN 的切入空间。', tags: ['选品', '亚马逊'], source: 'official', scenario: '选品与开发' },
  { id: 's9', name: 'Temu 供货利润测算', desc: '拆解供货价、采购成本、包装及损耗，测算保本价格与毛利。', tags: ['比价', '选品', 'Temu'], source: 'official', scenario: '选品与开发' },
  { id: 's10', name: 'Ozon 类目机会雷达', desc: '对比动销率、搜索增速与卖家集中度，定位家居类目机会。', tags: ['趋势', '选品', 'Ozon'], source: 'official', scenario: '选品/热点' },
  { id: 's11', name: '跨平台同款比价', desc: '统一规格和币种口径，对比 1688 采购价与海外售价。', tags: ['比价', '监控', '1688', 'Temu'], source: 'official', scenario: '选品与开发' },
  { id: 's12', name: '亚马逊评论痛点地图', desc: '把瑜伽垫评论归纳为防滑、异味、厚度等主题，生成产品改进清单。', tags: ['评论分析', '亚马逊'], source: 'official', scenario: '数据分析' },
]
expertState.skills.push(...extraSkills)
export function skillDemo(item: SkillItem): SkillItem {
  const index = Math.max(0, Number(item.id.replace(/\D/g, '')) - 1) % 12
  const platform = item.tags.find(t => ['1688', 'Ozon', '亚马逊', 'Temu'].includes(t)) || ['1688', 'Ozon', 'Temu', '亚马逊'][index % 4]!
  const tool = `${platform}商品分析`
  const scene = item.tags[0]
  const output = scene === '评论分析' ? '主题 | 反馈占比 | 改进建议\n稳定性 | 42% | 加宽底座并做承重测试\n包装 | 28% | 双层缓冲包装\n交付：问题优先级清单、打样验收表' : scene === 'Listing' ? '标题：Adjustable Non-Slip Phone Stand for Desk\n关键词组：phone holder / foldable / adjustable\n主图建议：突出角度调节、底座防滑和折叠尺寸\n交付：标题 3 版、五点描述、关键词分组' : scene === '监控' || scene === '比价' ? '商品：折叠收纳箱加强款\n采购成本 ¥18.50 + 包装 ¥1.20 + 损耗 ¥0.60\n参考供货价 ¥29.90；单位毛利 ¥9.60；毛利率 32.1%\n预警条件：采购成本上涨超过 5%，或毛利率低于 25%' : scene === '趋势' ? '机会词：桌面收纳 / 可折叠 / 小户型\n近 30 天需求增速：+28.6%；动销率：67%\n推荐方向：小体积、可叠放、免安装\n交付：机会词 Top 10、类目分布、7 天验证计划' : `优先对象：${platform === 'Ozon' ? '桌面手机支架' : platform === '亚马逊' ? '防滑瑜伽垫' : '折叠收纳箱'}\n对比样本：24 款；建议试销：3 款\n优先行动：小单打样，验证材质、包装与使用稳定性\n验收指标：7 天点击率 ≥ 3.5%，售后率 ≤ 2%`
  return { version: `1.${index % 4 + 1}.0`, downloadCount: 1280 + index * 327, author: item.source === 'user' ? '我的工作室' : '雷达电商研究组', tools: [tool, index % 2 ? '评论归因' : '关键词趋势'], steps: ['输入目标商品、关键词及近 30 天时间范围。', `使用${tool}整理价格、销量与竞争样本，统一规格口径。`, `围绕「${item.tags[0]}」识别前三个机会或问题，并按优先级排序。`, '输出对比表、核心结论和下一步操作清单。'], outputExample: `${item.name} · 输出摘要\n${output}`, ...item }
}
/* 案例配图：内联 SVG（自包含，导出报告时可保留） */
function caseImageSvg(subject: string): string {
  const draw = subject === '桌面手机支架'
    ? `<rect x="330" y="240" width="150" height="240" rx="18" transform="rotate(-14 405 360)" fill="#2b3440"/><rect x="344" y="254" width="122" height="198" rx="10" transform="rotate(-14 405 360)" fill="#3d4856"/><rect x="272" y="452" width="256" height="24" rx="12" fill="#c9d2da"/><rect x="292" y="434" width="216" height="20" rx="8" fill="#dde4ea"/>`
    : subject === '防滑瑜伽垫'
      ? `<rect x="252" y="330" width="296" height="128" rx="64" fill="#3f9d6e"/><circle cx="302" cy="394" r="56" fill="#35875e"/><circle cx="302" cy="394" r="32" fill="#2f7a54"/><ellipse cx="472" cy="394" rx="76" ry="64" fill="#4cae7c"/><ellipse cx="472" cy="394" rx="48" ry="40" fill="#3f9d6e"/>`
      : `<rect x="282" y="222" width="236" height="136" rx="14" fill="#7fb3e8"/><rect x="282" y="222" width="236" height="34" rx="14" fill="#5e97cf"/><rect x="360" y="272" width="80" height="14" rx="7" fill="#eef4fb"/><rect x="266" y="350" width="268" height="146" rx="14" fill="#9cc6f0"/><rect x="266" y="350" width="268" height="36" rx="14" fill="#7fb3e8"/><rect x="352" y="396" width="96" height="13" rx="6" fill="#f2f7fd"/>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7f9fb"/><stop offset="1" stop-color="#e3e9ef"/></linearGradient><radialGradient id="glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffffff" stop-opacity=".9"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient></defs><rect width="800" height="600" fill="url(#bg)"/><circle cx="670" cy="100" r="170" fill="url(#glow)"/><circle cx="110" cy="520" r="150" fill="url(#glow)"/><ellipse cx="400" cy="514" rx="250" ry="32" fill="#cfd8e0" opacity=".5"/>${draw}<g font-family="'PingFang SC','Microsoft YaHei',sans-serif"><rect x="40" y="40" width="128" height="40" rx="20" fill="#00A83E" opacity=".92"/><text x="104" y="66" font-size="20" fill="#ffffff" text-anchor="middle">示例图片</text></g></svg>`
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}
export function expertDemo(item: ExpertItem): ExpertItem {
  const index = Math.max(0, Number(item.id.replace(/\D/g, '')) - 1) % 14
  const subject = item.platform === 'Ozon' ? '桌面手机支架' : item.platform === '亚马逊' ? '防滑瑜伽垫' : '折叠收纳箱'
  const review = item.category === '评论分析'
  return { usageCount: 1830 + index * 483, capabilities: [`${item.platform}市场与竞争分析`, review ? '评论主题聚类与问题定位' : '价格带与利润空间测算', '供应链筛选与行动清单'], prompts: [`请分析${item.platform}的${subject}，对比近 30 天需求、价格与竞争格局，推荐 3 个切入方向。`, `围绕${subject}完成「${item.name.split('-').slice(1).join('-') || item.name}」任务，给出指标对比表和 7 天执行计划。`], caseTitle: `${item.platform} · ${subject}${review ? '用户痛点洞察' : '选品机会评估'}`, caseHeaders: review ? ['问题类型', '反馈量', '占比', '改进建议'] : ['商品', item.platform === '1688' ? '拿货价' : '售价', '月销量', '毛利率', '建议'], caseMetrics: [{ label: review ? '评论样本' : '对比商品', value: review ? '300 条' : '48 款' }, { label: '需求环比', value: `+${18 + index}.6%` }, { label: '优先机会', value: '3 个' }], caseRows: review ? [['稳定性不足', '126 条', '42%', '加宽底座 · P0'], ['包装破损', '84 条', '28%', '双层防护 · P0'], ['材质质感', '54 条', '18%', '升级表面工艺 · P1']] : [[`${subject} · 基础款`, item.platform === '1688' ? '¥12.80' : item.platform === 'Ozon' ? '₽690' : '$12.99', '1,280', '24.6%', '小单测试'], [`${subject} · 加强款`, item.platform === '1688' ? '¥18.50' : item.platform === 'Ozon' ? '₽990' : '$18.99', '960', '31.2%', '优先推荐'], [`${subject} · 便携款`, item.platform === '1688' ? '¥9.60' : item.platform === 'Ozon' ? '₽490' : '$9.99', '2,160', '18.4%', '控制成本']], caseConclusion: review ? '先解决稳定性与运输包装，两类问题合计占反馈的 70%。建议先打样验证底座承重，再更新主图和安装说明。' : `建议优先验证${subject}加强款：需求增长明显，利润空间较好。首批选 3 家供应商各取样 10 件，完成质检与页面测试后再补货。`, caseImage: caseImageSvg(subject), ...item }
}
expertState.experts = expertState.experts.map(expertDemo)
expertState.skills = expertState.skills.map(skillDemo)

const STORAGE_KEY = 'dld-expert-workspace-v1'
const text = (v: unknown): v is string => typeof v === 'string'
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(text)
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
function validItem(v: unknown): v is Record<string, unknown> {
  return record(v) && text(v.id) && text(v.name) && !!v.name.trim() && text(v.desc) && strings(v.tags) && v.source === 'user'
    && (v.instructions === undefined || text(v.instructions)) && (v.references === undefined || strings(v.references))
    && (v.categoryLabel === undefined || text(v.categoryLabel))
    && (v.wordLibraryIds === undefined || strings(v.wordLibraryIds)) && (v.productLibraryIds === undefined || strings(v.productLibraryIds))
    && (v.capabilities === undefined || strings(v.capabilities)) && (v.prompts === undefined || strings(v.prompts))
    && (v.tools === undefined || strings(v.tools)) && (v.steps === undefined || strings(v.steps))
    && (v.usageCount === undefined || typeof v.usageCount === 'number') && (v.downloadCount === undefined || typeof v.downloadCount === 'number')
    && (v.version === undefined || text(v.version)) && (v.author === undefined || text(v.author)) && (v.outputExample === undefined || text(v.outputExample))
    && (v.caseTitle === undefined || text(v.caseTitle)) && (v.caseConclusion === undefined || text(v.caseConclusion))
    && (v.caseHeaders === undefined || strings(v.caseHeaders)) && (v.caseImage === undefined || text(v.caseImage))
    && (v.caseRows === undefined || (Array.isArray(v.caseRows) && v.caseRows.every(strings)))
    && (v.caseMetrics === undefined || (Array.isArray(v.caseMetrics) && v.caseMetrics.every(m => record(m) && text(m.label) && text(m.value))))
}
export function validMcpUrl(value: string) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash } catch { return false }
}
function safeMcp(v: unknown): v is McpService {
  return record(v) && text(v.id) && text(v.name) && !!v.name.trim() && text(v.url) && validMcpUrl(v.url)
    && text(v.desc) && ['SSE', 'Streamable HTTP'].includes(String(v.protocol))
    && ['无认证', 'Bearer Token', 'API Key'].includes(String(v.auth)) && strings(v.tools) && typeof v.enabled === 'boolean'
}
try {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === null) {
    expertState.skills.push(skillDemo({ id: 'user-s-demo', name: '我的家居试销清单', desc: '按采购预算、毛利与包装体积筛选家居试销商品，输出首批补货清单。', tags: ['选品', '1688'], source: 'user', instructions: '1. 提供预算与目标类目。\n2. 对比采购成本、包装体积和利润。\n3. 输出 3 款首批试销商品及 7 天复盘指标。' }))
    expertState.experts.push(expertDemo({ id: 'user-e-demo', name: '我的 Ozon 手机配件顾问', desc: '为 Ozon 新店筛选桌面手机支架，关注稳定性、俄语长尾词和首批采购预算。', tags: ['Ozon', '选品'], platform: 'Ozon', category: '选品上架', source: 'user', references: ['s7', 's10'], wordLibraryIds: ['w2'], productLibraryIds: ['p2'] }))
    expertState.installedSkillIds = ['s1', 's4', 's7']
  }
  const raw: unknown = JSON.parse(saved || 'null')
  if (record(raw)) {
    if (Array.isArray(raw.experts)) expertState.experts.push(...raw.experts.filter(v => validItem(v) && text(v.platform) && text(v.category)) as unknown as ExpertItem[])
    if (Array.isArray(raw.skills)) expertState.skills.push(...raw.skills.filter(validItem) as unknown as SkillItem[])
    if (strings(raw.installedSkillIds)) expertState.installedSkillIds = raw.installedSkillIds.filter(id => expertState.skills.some(s => s.id === id))
    if (Array.isArray(raw.mcpServices) && raw.mcpServices.every(safeMcp)) expertState.mcpServices = raw.mcpServices.map(m => ({ id: m.id, name: m.name, url: m.url, desc: m.desc, protocol: m.protocol, auth: m.auth, tools: m.tools, enabled: m.enabled }))
  }
} catch { expertState.storageError = '本地数据无法读取，已使用默认数据。' }
watch(() => [expertState.experts, expertState.skills, expertState.installedSkillIds, expertState.mcpServices], () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      experts: expertState.experts.filter(e => e.source === 'user'), skills: expertState.skills.filter(s => s.source === 'user'),
      installedSkillIds: expertState.installedSkillIds,
      mcpServices: expertState.mcpServices.map(m => ({ id: m.id, name: m.name, url: m.url, desc: m.desc, protocol: m.protocol, auth: m.auth, tools: m.tools, enabled: m.enabled })),
    }))
    expertState.storageError = ''
  } catch { expertState.storageError = '本地保存失败，请检查浏览器存储空间；当前修改仅在本次会话有效。' }
}, { deep: true, immediate: !expertState.storageError })

export function openExpertPanel(tab?: ExpertTab) {
  if (tab) expertState.activeTab = tab
  expertState.open = true
}
export function closeExpertPanel() { expertState.open = false }
export function toggleExpertPanel(tab?: ExpertTab) {
  if (expertState.open && (!tab || expertState.activeTab === tab)) {
    expertState.open = false
  } else {
    openExpertPanel(tab)
  }
}
