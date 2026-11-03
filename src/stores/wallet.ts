/* =====================================================
 * 积分中心 / 积分明细数据（原 wallet + ledger 逻辑）
 * ===================================================== */
import { reactive } from 'vue'
import { appState, nowString, pad } from './state'
import { flashToast } from '../utils/common'

export interface BuyRecord {
  id: string; pkg: string; amount: number; time: string
  type?: 'plan' | 'pack'          // 订单类型：套餐订购 / 积分加油包
  status?: 'paid' | 'refunded'    // 订单状态（负数为退款单）
  pay?: string                    // 支付方式
  paid?: number | null            // 实付金额（元）
  orig?: number | null            // 订单原价（元）
  disc?: number | null            // 优惠金额（元）
  createdAt?: string              // 创建时间
}
export interface ConsumeRecord { title: string; conv: string; coins: number; time: string }

export const walletState = reactive({
  // 【对接说明】后端暂未提供充值/消耗流水接口，暂用本地演示数据
  buyLedger: [
    { id: 'dld20261016093241206', pkg: '基础版（月付）', amount: 5600, time: '2026-10-16 09:32:41', type: 'plan', status: 'paid', pay: '支付宝', paid: 99, orig: 199, disc: 100, createdAt: '2026-10-16 09:32:33' },
    { id: 'dld20260914140527831', pkg: '高级版（年付）', amount: 22000, time: '2026-09-14 14:05:27', type: 'plan', status: 'paid', pay: '微信支付', paid: 2870, orig: 3588, disc: 718, createdAt: '2026-09-14 14:05:18' },
    { id: 'dld20260824102015842', pkg: '常用包', amount: 2000, time: '2026-08-24 10:20:15', type: 'pack', status: 'paid', pay: '微信支付', paid: 168, orig: null, disc: null, createdAt: '2026-08-24 10:20:09' },
    { id: 'dld20260822184110673', pkg: '体验包', amount: 500, time: '2026-08-22 18:41:10', type: 'pack', status: 'paid', pay: '支付宝', paid: 45, orig: null, disc: null, createdAt: '2026-08-22 18:41:04' },
    { id: 'dld20260818091542291', pkg: '—', amount: -200, time: '2026-08-18 09:15:42', type: 'pack', status: 'refunded', pay: '支付宝', paid: null, orig: null, disc: null, createdAt: '2026-08-18 09:15:42' }
  ] as BuyRecord[],
  consumeLedger: [
    { title: '帮我找一下近30天的连衣裙爆款，要价格和销量对比表', conv: '近30天连衣裙爆款价格', coins: -20, time: '2026-10-31 10:12:36' },
    { title: '夏季防晒衣现在哪些是热销款？帮我做个选品分析', conv: '夏季防晒衣热销选品', coins: -20, time: '2026-10-30 16:44:02' },
    { title: '推荐几款厨房收纳好物，最好带销量数据', conv: '厨房收纳好物推荐', coins: -25, time: '2026-10-29 09:38:51' },
    { title: '宠物用品这个类目帮我分析一下，重点看狗窝和猫爬架', conv: '宠物用品类目分析', coins: -20, time: '2026-10-28 15:20:14' },
    { title: '母婴用品热销榜单整理一下，要 top20', conv: '母婴用品热销榜单', coins: -30, time: '2026-10-27 11:05:47' },
    { title: '秋冬男装外套的流行趋势是什么？帮我盘一盘', conv: '秋冬男装外套趋势', coins: -20, time: '2026-10-26 14:52:29' },
    { title: '帮我出一份家居香薰的选品报告，侧重性价比', conv: '家居香薰选品报告', coins: -25, time: '2026-10-24 10:31:08' },
    { title: '户外露营装备有哪些蓝海机会？帮我挖掘一下', conv: '户外露营装备挖掘', coins: -20, time: '2026-10-23 08:47:55' },
    { title: '美妆工具类目的蓝海词帮我分析下', conv: '美妆工具蓝海词分析', coins: -20, time: '2026-10-18 17:23:41' },
    { title: '汽车内饰爆品帮我盘点一下，要带价格带分布', conv: '汽车内饰爆品盘点', coins: -35, time: '2026-10-15 13:09:26' },
    { title: '数码配件的价格带怎么分布的？帮我分析', conv: '数码配件价格带分析', coins: -20, time: '2026-10-08 19:40:13' },
    { title: '健康食品类目帮我调研一下，侧重跨境电商', conv: '健康食品类目调研', coins: -20, time: '2026-10-03 12:28:07' }
  ] as ConsumeRecord[],
  pageSize: 10,
  blockPages: { buy: 1, consume: 1 } as Record<string, number>,
  // 套餐（演示；接口就绪后由 getMemberVerObj 真数据替换）
  billingCycle: 'monthly' as 'monthly' | 'yearly',
  currentPackage: '基础版',
  expiresAt: '2026-11-13',
  usedCoins: 4696,
  packages: [
    { name: '基础版', coins: 5600, price: 99, yearlyPrice: 949, compareMonthly: 179, saving: 239, limits: ['图片/视频并发：10 / 1 个任务', '约每月生成 1,400 张图片或 373 条视频', '每月约查询 74 次或生成 31 份报告'], featured: false, features: ['1688 分销选品：Top10 爆款清单输出', '拿货价定位：价格分布与销量对比', '一件代发工厂筛选：源头工厂直连', '商品资源监测：同行价格与起订量跟踪', '六大场景技能：推荐 / 选品上架 / 店铺运营 / 评论分析', '多文件选品分析：一键生成报告（单任务）', '跨平台支持：1688 / OZON / 亚马逊 / TEMU'] },
    { name: '高级版', coins: 22000, price: 299, yearlyPrice: 2870, compareMonthly: 589, saving: 718, limits: ['图片/视频并发：30 / 10 个任务', '约每月生成 5,500 张图片或 1,466 条视频', '每月约查询 293 次或生成 122 份报告'], featured: true, features: ['1688 分销选品：Top10 爆款清单输出', '拿货价定位：价格分布与销量对比', '一件代发工厂筛选：源头工厂直连', '商品资源监测：同行价格与起订量跟踪', '六大场景技能：推荐 / 选品上架 / 店铺运营 / 评论分析', '多文件选品分析：批量上传一键出报告', '支持批量任务并行处理'] },
    { name: '团队版', coins: 52500, price: 499, yearlyPrice: 4788, compareMonthly: 999, saving: 7180, limits: ['每席位同时创建：图片 50 / 视频 25 个任务', '约每月生成 13,125 张图片或 3,500 条视频', '支持团队成员协同管理'], featured: false, features: ['1688 分销选品：Top10 爆款清单输出', '拿货价定位：价格分布与销量对比', '一件代发工厂筛选：源头工厂直连', '商品资源监测：同行价格与起订量跟踪', '六大场景技能：推荐 / 选品上架 / 店铺运营 / 评论分析', '多文件选品分析：批量上传一键出报告', '团队席位协同与批量任务'] }
  ] as Array<{ name: string; coins: number; price: number | null; yearlyPrice: number; compareMonthly: number; saving: number; limits: string[]; features: string[]; featured: boolean; selected?: boolean }>,
  packageTip: '当前套餐信息以账号实际权益为准',
  buyRange: { start: '', end: '' },
  orderType: '' as '' | 'plan' | 'pack',   // 订单类型筛选：全部 / 套餐订购 / 加油包
  orderStatus: '' as '' | 'paid' | 'refunded', // 订单状态筛选：全部 / 支付成功 / 已退款
  consumeRange: { start: '', end: '' },
  consumeChip: '7d'
})

function pickPositiveNum(...args: any[]): number | null {
  for (const a of args) {
    const n = Number(a)
    if (Number.isFinite(n) && n > 0) return n
  }
  return null
}

// 对接 getMemberVerObj → 积分中心套餐
export function renderWalletPackagesFromMember() {
  const member = appState.dldMember
  // ① 当前套餐名
  const curName = member && (member.packageName || member.verName || (member.packageObj && (member.packageObj.name || member.packageObj.packageName)))
  if (curName) {
    walletState.packageTip = '当前套餐：' + curName + ' · 演示价格，正式版接入支付'
  }
  // ② 可购套餐列表
  if (!member || typeof member !== 'object') return
  const boxes = [member, member.result, member.data, member.memberVer, member.verObj]
  let list: any[] | null = null
  for (const box of boxes) {
    if (!box || typeof box !== 'object') continue
    for (const key of ['packageList', 'verList', 'packages', 'list', 'items', 'rows']) {
      const arr = box[key]
      if (Array.isArray(arr) && arr.length && arr.every((x: any) => x && typeof x === 'object')) { list = arr; break }
    }
    if (list) break
  }
  if (!list) return
  const cards = list.map((p: any, i: number) => {
    const name = p.name || p.packageName || p.verName || p.title || ('套餐' + (i + 1))
    const coins = pickPositiveNum(p.coins, p.limitNum, p.integral, p.coinNum, p.totalNum)
    if (coins == null) return null
    const price = pickPositiveNum(p.price, p.salePrice, p.payMoney, p.money)
    return { name, coins, price, selected: i === 0 }
  }).filter(Boolean)
  if (!cards || !cards.length) return
  walletState.packages = cards as any
}

export function makeOrderId(): string {
  const d = new Date()
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  let id: string
  do {
    id = `dld${stamp}${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`
  } while (walletState.buyLedger.some(item => item.id === id))
  return id
}

export function confirmPay(pkg: { name: string; coins: number; price: number | null; pay?: string }) {
  if (!pkg) return
  appState.totalCoins += pkg.coins
  const now = nowString()
  walletState.buyLedger.unshift({
    id: makeOrderId(),
    pkg: pkg.name,
    amount: pkg.coins,
    time: now,
    type: 'pack',
    status: 'paid',
    pay: pkg.pay || '支付宝',
    paid: pkg.price,
    orig: null,
    disc: null,
    createdAt: now
  })
  walletState.blockPages.buy = 1
  closeBuyConfirmAndToast(pkg.coins)
}
function closeBuyConfirmAndToast(coins: number) {
  flashToast(`充值成功，到账 ${coins.toLocaleString()} 积分`)
}

// 过滤后明细
export function filteredBuy(): BuyRecord[] {
  const { start, end } = walletState.buyRange
  return walletState.buyLedger.filter(item => {
    if (walletState.orderStatus === 'refunded') { if (item.amount >= 0) return false }
    else if (item.amount < 0) return false // 默认视图不展示退款单
    if (walletState.orderType && item.type !== walletState.orderType) return false
    const day = (item.time || '').slice(0, 10)
    if (start && day < start) return false
    if (end && day > end) return false
    return true
  })
}
export function filteredConsume(): ConsumeRecord[] {
  const { start, end } = walletState.consumeRange
  return walletState.consumeLedger.filter(item => {
    const day = (item.time || '').slice(0, 10)
    if (start && day < start) return false
    if (end && day > end) return false
    return true
  })
}
