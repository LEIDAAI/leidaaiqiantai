/* 演示会话：用模拟数据展示 Trae 式消息交互（紧凑附件 chip + 任务卡片 + 分析结果）。
   借草稿会话机制创建，消息经 writeCachedMessages 落盘，刷新后自动恢复。 */
import { chatState, newConversation, ensureView, makeMessage } from './chat'
import type { MsgAttachment } from './chat'
import { notifyConversationsLoaded, sessionsFor } from './account'
import { writeCachedMessages } from './state'

const KB = 1024
const MB = 1024 * KB

const DEMO_TITLE = '多文件选品分析演示'

const DEMO_ATTACHMENTS: MsgAttachment[] = [
  { name: '竞品销售数据-10月.xlsx', size: 2.4 * MB, ext: 'XLSX', type: 'xls', icon: '' },
  { name: '家居收纳Top100榜单.xlsx', size: 1.8 * MB, ext: 'XLSX', type: 'xls', icon: '' },
  { name: '竞品主图合集.zip', size: 48.6 * MB, ext: 'ZIP', type: 'zip', icon: '' },
  { name: '用户评论导出.csv', size: 864 * KB, ext: 'CSV', type: 'txt', icon: '' },
  { name: '产品定价对比表.xlsx', size: 1.2 * MB, ext: 'XLSX', type: 'xls', icon: '' },
  { name: '主图参考-收纳箱01.jpg', size: 3.2 * MB, ext: 'JPG', type: 'img', icon: '' },
  { name: '主图参考-收纳箱02.jpg', size: 2.9 * MB, ext: 'JPG', type: 'img', icon: '' },
  { name: '详情页截图.png', size: 5.1 * MB, ext: 'PNG', type: 'img', icon: '' },
  { name: '物流成本测算.xlsx', size: 756 * KB, ext: 'XLSX', type: 'xls', icon: '' },
  { name: '竞品店铺清单.pdf', size: 4.7 * MB, ext: 'PDF', type: 'pdf', icon: '' },
  { name: '关键词搜索热度.csv', size: 1.1 * MB, ext: 'CSV', type: 'txt', icon: '' }
]

const DEMO_RESULT_HTML = `
<div class="ttc-r-sec">
  <h4>核心结论</h4>
  <p>建议优先上架 <b>折叠收纳箱</b>：毛利率 42.6% 为三个候选类目中最高，月搜索热度环比 +18.3%，头部竞品评分集中在 4.4 分以下，存在明显的品质升级空间。</p>
</div>
<div class="ttc-r-metrics">
  <div class="tr-metric"><div class="tr-metric-val">¥39.9</div><div class="tr-metric-lab">建议售价</div></div>
  <div class="tr-metric"><div class="tr-metric-val">42.6%</div><div class="tr-metric-lab">毛利率</div></div>
  <div class="tr-metric"><div class="tr-metric-val">3,200+</div><div class="tr-metric-lab">月销预估</div></div>
  <div class="tr-metric"><div class="tr-metric-val">1,500件</div><div class="tr-metric-lab">首单备货</div></div>
</div>
<div class="ttc-r-sec">
  <h4>类目对比</h4>
  <table class="ttc-r-table">
    <thead><tr><th>候选类目</th><th>毛利率</th><th>竞争度</th><th>结论</th></tr></thead>
    <tbody>
      <tr><td>折叠收纳箱</td><td>42.6%</td><td>中</td><td class="ok">优先上架</td></tr>
      <tr><td>真空压缩袋</td><td>36.1%</td><td>高</td><td class="mid">观察</td></tr>
      <tr><td>桌面置物架</td><td>28.4%</td><td>高</td><td class="no">暂缓</td></tr>
    </tbody>
  </table>
</div>
<div class="ttc-r-sec">
  <h4>行动建议</h4>
  <ul>
    <li>主图突出「加厚承重 + 可折叠」卖点，针对 4.4 分以下竞品的差评点做差异化</li>
    <li>首单 1,500 件分两批发运：海运 1,000 件 + 空运 500 件，补齐上架初期库存</li>
    <li>定价 ¥39.9 叠加 15% 优惠券，上线首两周集中投放冲类目新品榜</li>
  </ul>
</div>`

export function startDemoConversation() {
  // 已处于演示会话则不重复创建
  const cur = chatState.views[chatState.activeConvKey]
  if (cur && cur.messages.some(m => !!m.taskCard)) return

  newConversation()
  const key = chatState.activeConvKey
  const view = ensureView(key)
  view.explicitNew = false
  chatState.chatTitle = DEMO_TITLE
  const sessions = sessionsFor()
  const target = sessions.find(s => s.id === key)
  if (target) target.title = DEMO_TITLE

  const now = Date.now()
  view.messages.push(
    makeMessage({
      role: 'user',
      content: '帮我分析这 11 份竞品数据，找出最适合优先上架的家居收纳类目，测算利润并给出选品建议。',
      createdAt: now,
      attachments: DEMO_ATTACHMENTS.map(a => ({ ...a }))
    }),
    makeMessage({
      role: 'assistant',
      content: '已完成 11 份竞品数据的汇总分析，结论：优先上架折叠收纳箱，建议售价 ¥39.9，毛利率 42.6%。',
      createdAt: now + 1,
      phase: 'done',
      statusText: '· 已完成',
      taskCard: {
        title: '竞品数据分析与选品建议',
        steps: [
          { label: '解析上传文件', detail: '11 份 · 共 71MB' },
          { label: '清洗对齐数据', detail: '4,832 条 SKU' },
          { label: '检索市场行情', detail: '家居收纳类目' },
          { label: '竞品对比分析', detail: 'Top 100' },
          { label: '测算利润模型', detail: '含头程物流' },
          { label: '生成选品报告', detail: '' }
        ],
        thinking: [
          '11 份文件包含销售明细、榜单、评论与成本表，需先统一 SKU 口径再合并对齐',
          '家居收纳下有三个候选类目：折叠收纳箱、真空压缩袋、桌面置物架，逐一对比',
          '利润测算按海运头程 8 元/kg、平台佣金 15%、退货率 4% 估算',
          '优先推荐毛利率高且竞争度适中的类目，首单备货控制在安全库存范围内'
        ],
        stepMs: [1100, 1400, 1300, 1500, 1200, 1000],
        resultHtml: DEMO_RESULT_HTML
      }
    })
  )

  // 先落盘消息再落盘会话列表：writeCachedSessions 会过滤"无消息缓存的草稿"，
  // 顺序颠倒会导致演示会话条目被过滤、刷新后列表里找不到该会话。
  writeCachedMessages(key, JSON.parse(JSON.stringify(view.messages)))
  notifyConversationsLoaded(sessions, true)
}
