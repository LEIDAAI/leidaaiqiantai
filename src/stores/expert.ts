/* =====================================================
 * 专家 · 技能 · MCP 面板状态
 * ===================================================== */
import { reactive } from 'vue'

export type ExpertTab = 'expert' | 'connector' | 'skill' | 'mcp'

export interface ExpertItem {
  id: string
  name: string
  desc: string
  tags: string[]
  platform: string
  category: string
  source: 'official' | 'user'
}

export interface ConnectorItem {
  id: string
  name: string
  desc: string
  platform: string
  tools: string[]
}

export interface SkillItem {
  id: string
  name: string
  desc: string
  tags: string[]
  source: 'official' | 'user'
}

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
  // 连接器
  connectorSearch: '',
  connectorPlatformFilter: 'all' as 'all' | '1688' | 'Ozon' | '亚马逊' | 'Temu',
  // 技能
  skillSearch: '',
  skillSourceFilter: 'all' as 'all' | 'official' | 'user',
  skillTypeFilter: 'all' as 'all' | '选品' | '评论分析' | '监控' | '比价' | 'Listing' | '趋势',
  // MCP
  mcpSearch: '',
  mcpStatusFilter: 'all' as 'all' | 'enabled' | 'disabled',
  // 数据
  experts: [
    { id: 'e1', name: '1688-1688分销选品', desc: '从1688分销选品，从海量货源中筛选（按搜索/热销）类目/款式/分销商，按品类筛选成交数据，输出Top {10} 选品。', tags: ['选品上架', '1688'], platform: '1688', category: '选品上架', source: 'official' as const },
    { id: 'e2', name: '1688-拿货价格定位', desc: '分析价格区间内 拿货（或溢价）在1688 的价格分布与销量的关系，帮助选品找到参考价位。', tags: ['选品上架', '1688'], platform: '1688', category: '选品上架', source: 'official' as const },
    { id: 'e3', name: '1688-一件代发工厂筛选', desc: '从源头工厂 搜索 按地域（公司）与起订量（{10}）筛选支持一件代发的源头工厂，并上传力推款。', tags: ['选品上架', '1688'], platform: '1688', category: '选品上架', source: 'official' as const },
    { id: 'e4', name: '1688-商品货源监测', desc: '按关键词/分类 按来源（或{爆款/花名}）商品，查找到 1688 上同款/相似商品的同行价格与起订量。', tags: ['选品上架', '1688'], platform: '1688', category: '选品上架', source: 'official' as const },
    { id: 'e5', name: 'Ozon-类目基础信息查询', desc: '从类目信息 查询 Ozon {目标类目} 类目的商品数、动销率与均价，评估市场饱和度。', tags: ['店铺运营', 'Ozon'], platform: 'Ozon', category: '店铺运营', source: 'official' as const },
    { id: 'e6', name: 'Ozon-关键词入局时机', desc: '按搜索量/增速 对比近 30/90 天 {关键词} 的搜索量与成交趋势，判断最佳入局窗口。', tags: ['选品上架', 'Ozon'], platform: 'Ozon', category: '选品上架', source: 'official' as const },
    { id: 'e7', name: 'Ozon-信区选品验证', desc: '按类目/品牌 针对搜索量/均价 {手机支架}，验证 Ozon 该品类的需求规模与价格竞争格局。', tags: ['选品上架', 'Ozon'], platform: 'Ozon', category: '选品上架', source: 'official' as const },
    { id: 'e8', name: 'Ozon-信区差评归因', desc: '按 {手机支架} 抓取 {手机支架} 类目头部商品的 {300} 条差评，按问题类型归纳并给出改进建议。', tags: ['评论分析', 'Ozon'], platform: 'Ozon', category: '评论分析', source: 'official' as const },
    { id: 'e9', name: '亚马逊-核心词挖掘', desc: '挖掘 {瑜伽垫} 核心搜索词，分析搜索量与竞争度，输出Top关键词列表。', tags: ['选品上架', '亚马逊'], platform: '亚马逊', category: '选品上架', source: 'official' as const },
    { id: 'e10', name: '亚马逊-ASIN解析', desc: '解析 {B0XXXXX} ASIN 的BSR排名、价格历史、Review趋势，评估产品竞争力。', tags: ['商品管理', '亚马逊'], platform: '亚马逊', category: '商品管理', source: 'official' as const },
    { id: 'e11', name: '亚马逊-类目热搜词', desc: '获取 {Kitchen} 类目热搜关键词，分析搜索趋势与季节性波动。', tags: ['选品上架', '亚马逊'], platform: '亚马逊', category: '选品上架', source: 'official' as const },
    { id: 'e12', name: 'Temu-家居热销榜', desc: '抓取 Temu 家居类目热销Top {50}，分析价格区间与评分分布。', tags: ['选品上架', 'Temu'], platform: 'Temu', category: '选品上架', source: 'official' as const },
    { id: 'e13', name: 'Temu-动销比飙升榜', desc: '监控 Temu 动销比飙升商品，发现潜力爆款。', tags: ['监控', 'Temu'], platform: 'Temu', category: '店铺运营', source: 'official' as const },
    { id: 'e14', name: 'Temu-1688比价', desc: '将 Temu 商品与1688同款进行比价，计算利润空间。', tags: ['比价', 'Temu', '1688'], platform: 'Temu', category: '选品上架', source: 'official' as const },
  ] as ExpertItem[],
  connectors: [
    { id: 'c1', name: '@1688分销选品', desc: '从1688分销选品，从海量货源中筛选类目/款式/分销商', platform: '1688', tools: ['分销选品', '货源监测'] },
    { id: 'c2', name: '@Ozon类目查询', desc: '查询Ozon类目基础信息、商品数、动销率与均价', platform: 'Ozon', tools: ['类目查询', '关键词趋势'] },
    { id: 'c3', name: '@亚马逊ASIN解析', desc: '解析亚马逊ASIN的BSR排名、价格历史、Review趋势', platform: '亚马逊', tools: ['ASIN解析', '关键词挖掘'] },
    { id: 'c4', name: '@Temu热销榜', desc: '抓取Temu各品类热销榜单数据', platform: 'Temu', tools: ['热销榜', '动销比'] },
  ] as ConnectorItem[],
  skills: [
    { id: 's1', name: '一键选品报告', desc: '输入关键词，自动生成包含市场分析、竞品对比、利润测算的完整选品报告', tags: ['选品', '一键复用'], source: 'official' as const },
    { id: 's2', name: '差评深度分析', desc: '抓取目标商品差评，按问题类型归纳并生成改进建议报告', tags: ['评论分析', '一键复用'], source: 'official' as const },
    { id: 's3', name: '价格监控预警', desc: '设置目标价格区间，自动监控竞品价格变动并推送预警', tags: ['监控', '比价'], source: 'official' as const },
    { id: 's4', name: 'Listing优化建议', desc: '分析竞品Listing，生成标题、关键词、图片优化建议', tags: ['Listing', '选品'], source: 'official' as const },
    { id: 's5', name: '趋势品类发现', desc: '基于搜索量增速与动销比，发现近期飙升的潜力品类', tags: ['趋势', '选品'], source: 'official' as const },
  ] as SkillItem[],
  mcpServices: [
    { id: 'm1', name: '店雷达开放MCP', url: 'https://mcp.dianleida.net/mcp', desc: '店雷达官方MCP服务，提供选品、评论、比价等工具', protocol: 'Streamable HTTP', auth: 'Bearer Token', tools: ['@选品榜单查询', '@评论抓取', '@货源比价', '@关键词挖掘'], enabled: true },
    { id: 'm2', name: '1688数据MCP', url: 'https://mcp.1688.example.com/api', desc: '1688平台数据接口，支持商品搜索、价格查询', protocol: 'Streamable HTTP', auth: 'API Key', tools: ['@商品搜索', '@价格查询', '@供应商信息'], enabled: true },
    { id: 'm3', name: 'Ozon数据MCP', url: 'https://mcp.ozon.example.com/api', desc: 'Ozon平台数据接口，支持类目查询、关键词分析', protocol: 'SSE', auth: 'Bearer Token', tools: ['@类目查询', '@关键词分析', '@商品详情'], enabled: false },
  ] as McpService[],
})

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
