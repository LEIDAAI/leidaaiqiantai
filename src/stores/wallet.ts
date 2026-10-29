/* =====================================================
 * 积分中心 / 积分明细数据（原 wallet + ledger 逻辑）
 * ===================================================== */
import { reactive } from 'vue'
import { appState, nowString, pad } from './state'
import { flashToast } from '../utils/common'

export interface BuyRecord { id: string; pkg: string; amount: number; time: string }
export interface ConsumeRecord { title: string; conv: string; coins: number; time: string }

export const walletState = reactive({
  // 【对接说明】后端暂未提供充值/消耗流水接口，暂用本地演示数据
  buyLedger: [
    { id: 'dld20260824102015842', pkg: '常用包', amount: 2000, time: '2026-08-24 10:20:15' },
    { id: 'dld20260822184110673', pkg: '体验包', amount: 500, time: '2026-08-22 18:41:10' },
    { id: 'dld20260818091542291', pkg: '—', amount: -200, time: '2026-08-18 09:15:42' }
  ] as BuyRecord[],
  consumeLedger: [
    { title: '帮我找一下近30天的连衣裙爆款，要价格和销量对比表', conv: '近30天连衣裙爆款价格', coins: -20, time: '2026-09-21 10:12:36' },
    { title: '夏季防晒衣现在哪些是热销款？帮我做个选品分析', conv: '夏季防晒衣热销选品', coins: -20, time: '2026-09-20 16:44:02' },
    { title: '推荐几款厨房收纳好物，最好带销量数据', conv: '厨房收纳好物推荐', coins: -25, time: '2026-09-19 09:38:51' },
    { title: '宠物用品这个类目帮我分析一下，重点看狗窝和猫爬架', conv: '宠物用品类目分析', coins: -20, time: '2026-09-18 15:20:14' },
    { title: '母婴用品热销榜单整理一下，要 top20', conv: '母婴用品热销榜单', coins: -30, time: '2026-09-17 11:05:47' },
    { title: '秋冬男装外套的流行趋势是什么？帮我盘一盘', conv: '秋冬男装外套趋势', coins: -20, time: '2026-09-16 14:52:29' },
    { title: '帮我出一份家居香薰的选品报告，侧重性价比', conv: '家居香薰选品报告', coins: -25, time: '2026-09-15 10:31:08' },
    { title: '户外露营装备有哪些蓝海机会？帮我挖掘一下', conv: '户外露营装备挖掘', coins: -20, time: '2026-09-15 08:47:55' },
    { title: '美妆工具类目的蓝海词帮我分析下', conv: '美妆工具蓝海词分析', coins: -20, time: '2026-09-10 17:23:41' },
    { title: '汽车内饰爆品帮我盘点一下，要带价格带分布', conv: '汽车内饰爆品盘点', coins: -35, time: '2026-09-08 13:09:26' },
    { title: '数码配件的价格带怎么分布的？帮我分析', conv: '数码配件价格带分析', coins: -20, time: '2026-09-05 19:40:13' },
    { title: '健康食品类目帮我调研一下，侧重跨境电商', conv: '健康食品类目调研', coins: -20, time: '2026-09-01 12:28:07' }
  ] as ConsumeRecord[],
  pageSize: 10,
  blockPages: { buy: 1, consume: 1 } as Record<string, number>,
  // 套餐（演示；接口就绪后由 getMemberVerObj 真数据替换）
  packages: [
    { name: '体验包', coins: 500, price: 9.9 },
    { name: '常用包', coins: 2000, price: 29.9, selected: true },
    { name: '专业包', coins: 10000, price: 99 }
  ] as Array<{ name: string; coins: number; price: number | null; selected?: boolean }>,
  packageTip: '演示价格，正式版接入支付',
  buyRange: { start: '', end: '' },
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

export function confirmPay(pkg: { name: string; coins: number; price: number | null }) {
  if (!pkg) return
  appState.totalCoins += pkg.coins
  walletState.buyLedger.unshift({
    id: makeOrderId(),
    pkg: pkg.name,
    amount: pkg.coins,
    time: nowString()
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
    if (item.amount < 0) return false
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
