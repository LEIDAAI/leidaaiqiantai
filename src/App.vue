<script setup lang="ts">
/* 三栏主布局：左会话 / 中对话 / 右预览 + 弹窗挂载 */
import { ref, computed, onMounted, onBeforeUnmount, defineAsyncComponent } from 'vue'
import Sidebar from './components/Sidebar.vue'
import ChatPane from './components/ChatPane.vue'
import RightPanel from './components/RightPanel.vue'
/* r77 代码分割：非首屏重组件（弹窗/专家广场/日期选择/登录页）异步按需加载，减小主 chunk */
const Modals = defineAsyncComponent(() => import('./components/Modals.vue'))
const ExpertPanel = defineAsyncComponent(() => import('./components/ExpertPanel.vue'))
import TopNavbar from './components/TopNavbar.vue'
import PromoBanner from './components/PromoBanner.vue'
const DateRangePicker = defineAsyncComponent(() => import('./components/DateRangePicker.vue'))
import { modals, openBuyConfirm, openUpgradeConfirm, openWallet, navigatePage } from './stores/modals'
import { openLogin } from './stores/auth'
import { walletState, filteredBuy, filteredConsume, type BuyRecord } from './stores/wallet'
import { appState, pad } from './stores/state'
import { currentAccount } from './stores/account'
import { flashToast } from './utils/common'
import { chatState, activeView } from './stores/chat'
import { panel, setCollapsed } from './stores/panel'
import { accountState } from './stores/account'
const LoginView = defineAsyncComponent(() => import('./components/LoginView.vue'))
import { authState } from './stores/auth'
const benefitsOpen = ref(false)

const workEl = ref<HTMLElement | null>(null)
const currentPlanPrice = (pkg: typeof walletState.packages[number]) => walletState.billingCycle === 'monthly' ? (pkg.price ?? 0) : pkg.yearlyPrice
/* ===================== 套餐升级（补差价） ===================== */
/* 档位：标准版 0 < 高级版 1 < 旗舰版 2（三档功能一致，仅每月积分不同） */
const PLAN_TIER: Record<string, number> = { '标准版': 0, '高级版': 1, '旗舰版': 2 }
const cycleText = (c: 'monthly' | 'yearly') => c === 'monthly' ? '月付' : '年付'
/* 当前套餐剩余天数（不足 1 天按 0 计） */
function remainingDays(): number {
  const ms = new Date(walletState.expiresAt.replace(/-/g, '/')).getTime() - Date.now()
  return Math.max(0, Math.floor(ms / 864e5))
}
/* 当前周期总天数：月付按剩余天+已过天估算（演示口径），年付按 365 */
function cycleTotalDays(): number {
  return walletState.currentCycle === 'yearly' ? 365 : 31
}
/* 套餐实际支付价：按指定周期取月付/年付实价 */
function planPriceOf(name: string, cycle: 'monthly' | 'yearly'): number {
  const p = walletState.packages.find(x => x.name === name)
  if (!p) return 0
  return cycle === 'monthly' ? (p.price ?? 0) : p.yearlyPrice
}
/* 补差价（v0.2 口径，按剩余天数折算）：
 * 同周期 = (目标价 − 原档价) × 剩余天数 ÷ 周期天数；
 * 月→年 = 目标年价 − 原月价 × 剩余天数 ÷ 当期天数，年付今天起算一年；
 * 返回 -1 表示拦截（降级 / 年付转月付：到期后再切换）。 */
function upgradeDelta(pkg: typeof walletState.packages[number]): number {
  if ((PLAN_TIER[pkg.name] ?? -1) < (PLAN_TIER[walletState.currentPackage] ?? 99)) return -1
  const target = planPriceOf(pkg.name, walletState.billingCycle)
  const rest = remainingDays()
  if (walletState.currentCycle === walletState.billingCycle) {
    return Math.round(Math.max(0, (target - planPriceOf(walletState.currentPackage, walletState.currentCycle)) * rest / cycleTotalDays()) * 100) / 100
  }
  if (walletState.currentCycle === 'yearly') return -1 // 年付 → 月付：到期后再切换
  // 月→年：剩余月付价值折抵，年付从今天起算 365 天
  return Math.round(Math.max(0, target - planPriceOf(walletState.currentPackage, 'monthly') * rest / cycleTotalDays()) * 100) / 100
}
function openPackage(pkg: typeof walletState.packages[number]) {
  const curName = walletState.currentPackage
  if (!authState.logged) { openLogin('购买套餐'); return }
  // 同档：进入续费确认（v0.2 场景 01/04：从当前到期日顺延，不提前发下期积分）
  if (pkg.name === curName) {
    openUpgradeConfirm({
      curName: `${curName}（${cycleText(walletState.currentCycle)}）`,
      curPrice: planPriceOf(curName, walletState.currentCycle),
      name: `${pkg.name}（${cycleText(walletState.billingCycle)}）· 续费`,
      fullPrice: planPriceOf(pkg.name, walletState.billingCycle),
      price: 0, coins: pkg.coins, pay: '微信支付',
      expiresAt: walletState.expiresAt, orderType: 'upgrade',
      targetCycle: walletState.billingCycle, targetExpiresAt: walletState.expiresAt,
      cycleChanged: false, renewOnly: true
    })
    return
  }
  if (PLAN_TIER[pkg.name] != null && PLAN_TIER[curName] != null) {
    const delta = upgradeDelta(pkg)
    if (delta < 0) { flashToast('套餐降级或年付转月付需到期后切换，到期日：' + walletState.expiresAt); return }
    // 月→年：到期日 = 今天 + 365 天（新锚点）；同周期升级到期日不变
    let newExpiry = walletState.expiresAt
    const cycleChanged = walletState.currentCycle !== walletState.billingCycle
    if (cycleChanged) {
      const d = new Date(Date.now() + 365 * 864e5)
      newExpiry = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    openUpgradeConfirm({
      curName: `${curName}（${cycleText(walletState.currentCycle)}）`,
      curPrice: planPriceOf(curName, walletState.currentCycle),
      name: `${pkg.name}（${cycleText(walletState.billingCycle)}）`,
      fullPrice: planPriceOf(pkg.name, walletState.billingCycle),
      price: delta, coins: pkg.coins, pay: '微信支付',
      expiresAt: newExpiry, orderType: 'upgrade',
      targetCycle: walletState.billingCycle, targetExpiresAt: newExpiry,
      cycleChanged
    })
    return
  }
  openBuyConfirm({ ...pkg, price: currentPlanPrice(pkg), coins: pkg.coins })
}
let sidebarObserver: ResizeObserver | null = null

/* 跟随侧栏实际尺寸，包括折叠动画和拖动。 */
function syncSidebarWidth() {
  const el = workEl.value?.querySelector<HTMLElement>('.col-left')
  if (el) {
    document.documentElement.style.setProperty('--sidebar-w', el.getBoundingClientRect().right + 'px')
  }
}

/* ===================== 三栏拖动（原 bindHorizontalDrag） ===================== */
const MID_MIN = 360
let dragging: { handle: HTMLElement; start: number; width: number; dir: string } | null = null

function getViewportAvailable(): number {
  const resizers = document.querySelectorAll('.col-left-resizer, .col-mid-resizer, .col-right-resizer')
  let resizerWidth = 0
  resizers.forEach(el => { resizerWidth += (el as HTMLElement).offsetWidth || 0 })
  return (workEl.value?.clientWidth || window.innerWidth) - resizerWidth
}

function setLeftWidth(px: number) {
  const min = 180, max = 360
  const w = Math.max(min, Math.min(max, Math.round(px)))
  if (chatState.leftCollapsed) chatState.leftCollapsed = false
  chatState.leftWidth = w
  try { localStorage.setItem('dld_left_width', String(w)) } catch (e) {}
}
function setRightWidth(px: number) {
  const min = 320
  const w = Math.max(min, Math.round(px))
  chatState.rightWidth = w
  try { localStorage.setItem('dld_right_width', String(w)) } catch (e) {}
}

function onDragStart(e: MouseEvent, target: 'left' | 'right') {
  e.preventDefault()
  const handle = e.target as HTMLElement
  const start = e.clientX
  if (target === 'right' && panel.collapsed) setCollapsed(false)
  dragging = {
    handle,
    start,
    width: target === 'left'
      ? (document.querySelector('.col-left') as HTMLElement)?.getBoundingClientRect().width || 0
      : (document.querySelector('.col-right') as HTMLElement)?.getBoundingClientRect().width || 0,
    dir: target
  }
  handle.classList.add('dragging')
  document.body.style.userSelect = 'none'
}
function onDragMove(e: MouseEvent) {
  if (!dragging) return
  const rawDelta = e.clientX - dragging.start
  if (dragging.dir === 'left') {
    const right = (document.querySelector('.col-right') as HTMLElement)?.getBoundingClientRect().width || 0
    const winAvail = getViewportAvailable() - right
    const max = Math.max(180, winAvail - MID_MIN)
    setLeftWidth(Math.max(180, Math.min(max, dragging.width + rawDelta)))
  } else {
    const left = (document.querySelector('.col-left') as HTMLElement)?.getBoundingClientRect().width || 0
    const winAvail = getViewportAvailable() - left
    const max = Math.max(320, winAvail - MID_MIN)
    setRightWidth(Math.max(320, Math.min(max, dragging.width - rawDelta)))
  }
}
function onDragUp() {
  if (!dragging) return
  dragging.handle.classList.remove('dragging')
  dragging = null
  document.body.style.userSelect = ''
  syncSidebarWidth()
}
onMounted(() => {
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', onDragUp)
  syncSidebarWidth()
  const sidebar = workEl.value?.querySelector('.col-left')
  sidebarObserver = new ResizeObserver(syncSidebarWidth)
  if (sidebar) sidebarObserver.observe(sidebar)
  window.addEventListener('resize', syncSidebarWidth)
  applyConsumeRange('7d') // 消耗明细默认近7天
})
onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragUp)
  window.removeEventListener('resize', syncSidebarWidth)
  sidebarObserver?.disconnect()
})

const leftStyle = computed(() => {
  if (chatState.leftWidth) return { width: chatState.leftWidth + 'px' }
  return {}
})
const rightStyle = computed(() => {
  if (chatState.rightWidth) return { width: chatState.rightWidth + 'px', marginLeft: '0' }
  return {}
})
/* 首页态：chat 页且会话为空 —— 中央渲染 hero + 底部输入区（预览栏隐藏，会话栏常显） */
const chatHero = computed(() => modals.page === 'chat' && (!activeView.value || activeView.value.messages.length === 0))

/* ===================== 个人中心子页：订单中心 / 消耗明细（由弹窗改为页面） ===================== */
const fmtDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const CONSUME_CHIPS = [
  { key: 'today', label: '今天' },
  { key: '7d', label: '7天' },
  { key: '30d', label: '30天' }
]
function applyConsumeRange(key: string) {
  const end = new Date()
  const start = new Date(end)
  if (key === '7d') start.setDate(start.getDate() - 6)
  else if (key === '30d') start.setDate(start.getDate() - 29)
  walletState.consumeRange.start = fmtDay(start)
  walletState.consumeRange.end = fmtDay(end)
  walletState.consumeChip = key
}
function onChip(key: string) { applyConsumeRange(key); walletState.blockPages.consume = 1 }
function onConsumeRangeChange() { walletState.consumeChip = ''; walletState.blockPages.consume = 1 }
// 分页（computed 内只做显示层 clamp，写回 state 由点击处理负责）
// 个人信息页展示名：后端返回空或占位名时统一显示中性名
const profileName = computed(() => {
  const n = currentAccount.value?.name || ''
  return !n || n === '主账号' ? '雷达用户' : n
})
/* 套餐卡按钮状态辅助 */
function isCurrentPlan(pkg: typeof walletState.packages[number]): boolean {
  return authState.logged && pkg.name === walletState.currentPackage
}
/* 注销账号（2026-11-08 拍板，场景 34）：二次确认后清账户全部资产并退出登录。
 * 演示环境执行前端登出 + 本地数据清空提示；真实接入时调用服务端注销接口。 */
const deleteAccountOpen = ref(false)
const deleteAccountConfirmText = ref('')
function confirmDeleteAccount() {
  if (deleteAccountConfirmText.value !== '注销') { flashToast('请输入"注销"以确认'); return }
  deleteAccountOpen.value = false
  deleteAccountConfirmText.value = ''
  try { localStorage.removeItem('dld_auth_v1'); localStorage.removeItem('dld_reg_v1'); localStorage.removeItem('dld_welcome_gift_v1') } catch (e) {}
  import('./stores/auth').then(m => m.logout())
  flashToast('账号已注销（演示），资产已清除')
}
const buyFiltered = computed(() => filteredBuy())
const buyPage = computed(() => {
  const list = buyFiltered.value
  const total = Math.max(1, Math.ceil(list.length / walletState.pageSize))
  const cur = Math.min(Math.max(walletState.blockPages.buy || 1, 1), total)
  return {
    total, cur, count: list.length,
    coins: list.reduce((s, x) => s + (x.amount > 0 ? x.amount : 0), 0).toLocaleString(),
    slice: list.slice((cur - 1) * walletState.pageSize, cur * walletState.pageSize)
  }
})
const consumeFiltered = computed(() => filteredConsume())
/* 订单详情抽屉 */
const orderDetail = ref<BuyRecord | null>(null)
function orderTypeName(t?: string) { return t === 'plan' ? '套餐订购' : t === 'upgrade' ? '套餐升级' : '积分加油包' }
function orderDuration(item: BuyRecord) {
  // 口径统一：积分包与弹窗一致，购买起 365 天有效；不再显示“长期有效”
  if (item.type === 'pack') return '365 天有效'
  return /年付/.test(item.pkg) ? '12 个月' : '1 个月'
}
function fmtMoney(n: number | null | undefined) { return n == null ? '—' : '¥' + n.toFixed(2) }
async function copyOrderId(id: string) {
  try { await navigator.clipboard.writeText(id); flashToast('订单编号已复制') }
  catch { flashToast('复制失败，请手动选择复制') }
}
const consumePage = computed(() => {
  const list = consumeFiltered.value
  const total = Math.max(1, Math.ceil(list.length / walletState.pageSize))
  const cur = Math.min(Math.max(walletState.blockPages.consume || 1, 1), total)
  return {
    total, cur, count: list.length,
    coins: list.reduce((s, x) => s + Number(x.coins || 0), 0).toLocaleString(),
    slice: list.slice((cur - 1) * walletState.pageSize, cur * walletState.pageSize)
  }
})
function setBuyPage(p: number) { walletState.blockPages.buy = p }
function setConsumePage(p: number) { walletState.blockPages.consume = p }
</script>

<template>
  <div class="app-container">
    <!-- r76：活动通栏 Banner（首次注册送100积分），关闭后会话内不再出现 -->
    <PromoBanner />
    <!-- 全局固定顶部导航栏（所有页面常显吸顶） -->
    <TopNavbar />
    <div class="work" ref="workEl">
      <!-- 左：导航（所有页面常显） -->
      <Sidebar :style="leftStyle" />
      <div class="col-left-resizer" @mousedown="onDragStart($event, 'left')"></div>
      <!-- 移动端：会话抽屉打开时的遮罩 -->
      <button v-if="chatState.mobileSidebar" class="mobile-mask" aria-label="关闭会话列表" @click="chatState.mobileSidebar = false"></button>

      <!-- 中：对话内容 / 专家·技能发现页 -->
      <ChatPane v-if="modals.page === 'chat'" />
      <ExpertPanel v-else-if="modals.page === 'experts' || modals.page === 'skills'" />
      <main v-else-if="modals.page === 'pricing'" class="pricing-page">
        <header class="page-heading"><div><h1>{{ authState.logged ? '个人中心' : '套餐购买' }}</h1><p>{{ authState.logged ? '个人账号' : '登录后即可购买' }}</p></div></header>
        <section v-if="authState.logged" class="current-plan"><div><span class="plan-crown">♛</span><strong>{{ walletState.currentPackage }}（{{ walletState.currentCycle === 'monthly' ? '月付' : '年付' }}）</strong><small>套餐到期时间：{{ walletState.expiresAt }}</small></div><button class="page-secondary" @click="openWallet()">购买积分包</button><div class="balance-meter"><div><span>剩余积分</span><strong>{{ appState.totalCoins.toLocaleString() }}</strong></div><div class="balance-track"><i :style="{ width: Math.max(4, (appState.totalCoins / (appState.totalCoins + walletState.usedCoins)) * 100) + '%' }"></i></div><small>{{ walletState.usedCoins.toLocaleString() }}（已使用）</small></div></section>
        <section v-else class="current-plan"><div><strong>登录后查看账户积分与当前套餐</strong><small>可先浏览套餐，登录后即可购买</small></div><button class="page-secondary" @click="openWallet()">登录后增购积分包</button></section>
        <section class="account-content">
          <aside class="account-menu">
            <div class="account-menu-caption">个人中心</div>
            <button @click="navigatePage('account')">个人信息</button>
            <div class="account-menu-caption">套餐管理</div>
            <button class="active" @click="modals.page = 'pricing'">套餐购买</button>
            <button @click="navigatePage('orders')">订单中心</button>
            <button @click="navigatePage('consume')">消耗明细</button>
          </aside>
          <div class="account-details">
            <h2>套餐购买<small>选择适合的积分套餐</small></h2>
        <div class="billing-row"><div class="billing-switch"><button :class="{ active: walletState.billingCycle === 'monthly' }" @click="walletState.billingCycle = 'monthly'">月付</button><button :class="{ active: walletState.billingCycle === 'yearly' }" @click="walletState.billingCycle = 'yearly'">年付 <b>8折</b></button></div><!-- 隐藏：权益对比入口（待恢复）<button class="benefit-link" @click="benefitsOpen = !benefitsOpen">套餐权益对比 {{ benefitsOpen ? '⌄' : '›' }}</button> --></div>
        <div v-if="benefitsOpen" class="benefit-compare"><strong>套餐权益对比</strong><span>各档功能完全一致，仅每月发放积分不同；积分可在全部功能中通用</span></div>
        <div class="pricing-grid"><article v-for="pkg in walletState.packages" :key="pkg.name" class="pricing-plan" :class="{ featured: pkg.featured, current: authState.logged && pkg.name === walletState.currentPackage }"><div v-if="pkg.featured" class="plan-ribbon">最受欢迎</div><div class="plan-name"><span>♛</span>{{ pkg.name }}<b v-if="walletState.billingCycle === 'yearly'">{{ pkg.name === '标准版' ? '8折' : pkg.name === '高级版' ? '6.1折' : '4.3折' }}</b></div><div class="plan-price">¥ {{ currentPlanPrice(pkg).toLocaleString() }} <small>/ {{ walletState.billingCycle === 'monthly' ? '月' : '年' }}</small><del>¥ {{ (walletState.billingCycle === 'monthly' ? pkg.compareMonthly : pkg.compareMonthly * 12).toLocaleString() }}/{{ walletState.billingCycle === 'monthly' ? '月' : '年' }}</del></div><div class="plan-renew">{{ walletState.billingCycle === 'monthly' ? `次月续费 ¥${pkg.price ?? 0}/月，到期手动续费` : `相比月付省下 ¥${pkg.saving}/年` }}</div><div class="plan-credits">{{ walletState.billingCycle === 'monthly' ? '每月' : '每月发放' }} <strong>{{ pkg.coins.toLocaleString() }}</strong> 积分{{ walletState.billingCycle === 'monthly' ? '，有效期 1 个月，不结转' : `，12 个月有效 · 不结转 · 共 ${(pkg.coins * 12).toLocaleString()} 积分` }}</div><button class="page-primary plan-action" @click="openPackage(pkg)">{{ !authState.logged ? '登录后购买' : isCurrentPlan(pkg) ? (walletState.billingCycle === walletState.currentCycle ? '续费当前套餐 ¥' + (planPriceOf(pkg.name, walletState.billingCycle)) : '转' + (walletState.billingCycle === 'yearly' ? '年付' : '月付') + '，补 ¥' + upgradeDelta(pkg)) : walletState.billingCycle === 'yearly' ? (PLAN_TIER[pkg.name] > PLAN_TIER[walletState.currentPackage] ? '补差价，立即升级' : '到期切换，预付 ¥' + currentPlanPrice(pkg)) : (PLAN_TIER[pkg.name] > PLAN_TIER[walletState.currentPackage] ? '立即开通' : '到期切换，预付 ¥' + currentPlanPrice(pkg)) }}</button><ul class="plan-limits"><li v-for="limit in pkg.features" :key="limit">{{ limit }}</li></ul></article></div><p class="pricing-note">套餐价格与权益请以账户结算信息为准。</p>
          </div>
        </section>
      </main>
      <!-- 个人中心区块：个人信息 / 套餐购买 / 订单中心 / 消耗明细（套餐购买页复用同一左侧子导航，当前项高亮） -->
      <main v-else class="account-page">
        <header class="page-heading"><div><h1>个人中心</h1><p>个人账号</p></div></header>
        <section v-if="authState.logged" class="current-plan"><div><span class="plan-crown">♛</span><strong>{{ walletState.currentPackage }}（{{ walletState.currentCycle === 'monthly' ? '月付' : '年付' }}）</strong><small>套餐到期时间：{{ walletState.expiresAt }}</small></div><button class="page-secondary" @click="openWallet()">购买积分包</button><div class="balance-meter"><div><span>剩余积分</span><strong>{{ appState.totalCoins.toLocaleString() }}</strong></div><div class="balance-track"><i :style="{ width: Math.max(4, (appState.totalCoins / (appState.totalCoins + walletState.usedCoins)) * 100) + '%' }"></i></div><small>{{ walletState.usedCoins.toLocaleString() }}（已使用）</small></div></section>
        <section class="account-content">
          <aside class="account-menu">
            <div class="account-menu-caption">个人中心</div>
            <button :class="{ active: modals.page === 'account' }" @click="navigatePage('account')">个人信息</button>
            <div class="account-menu-caption">套餐管理</div>
            <button @click="modals.page = 'pricing'">套餐购买</button>
            <button :class="{ active: modals.page === 'orders' }" @click="navigatePage('orders')">订单中心</button>
            <button :class="{ active: modals.page === 'consume' }" @click="navigatePage('consume')">消耗明细</button>
          </aside>
          <div class="account-details">
            <template v-if="modals.page === 'account'">
              <h2>个人信息<small>账号资料与账户资产</small></h2>
              <div class="profile-card">
                <div class="profile-avatar">{{ currentAccount?.avatar || '👤' }}</div>
                <div class="profile-meta">
                  <strong>{{ profileName }}</strong>
                  <small>{{ currentAccount?.phone || '暂未绑定手机号' }}</small>
                </div>
                <span class="profile-badge">{{ walletState.currentPackage }} · {{ walletState.currentCycle === 'monthly' ? '月付' : '年付' }}</span>
              </div>
              <div class="profile-grid">
                <section class="profile-section">
                  <div class="ps-caption">基本信息</div>
                  <div class="ps-row"><span>账号名称</span><strong>{{ profileName }}</strong></div>
                  <div class="ps-row"><span>手机号</span><strong>{{ currentAccount?.phone || '暂未绑定' }}</strong></div>
                  <div class="ps-row"><span>最近活跃</span><strong>{{ currentAccount?.lastActive || '—' }}</strong></div>
                </section>
                <section class="profile-section">
                  <div class="ps-caption">账户资产</div>
                  <div class="ps-row"><span>当前套餐</span><strong>{{ walletState.currentPackage }}</strong><button class="ps-link" type="button" @click="modals.page = 'pricing'">升级套餐</button></div>
                  <div class="ps-row"><span>套餐到期</span><strong>{{ walletState.expiresAt }}</strong></div>
                  <div class="ps-row"><span>剩余积分</span><strong class="ps-coins">{{ appState.totalCoins.toLocaleString() }}</strong><button class="ps-link" type="button" @click="navigatePage('consume')">查看明细</button></div>
                  <div class="ps-row"><span>累计消耗</span><strong>{{ walletState.usedCoins.toLocaleString() }}</strong></div>
                </section>
                <section class="profile-section" style="grid-column:1/-1">
                  <div class="ps-caption">危险操作</div>
                  <div class="ps-row"><span>注销账号</span><strong style="font-weight:400;color:#8a6d3b">注销后未用积分（含付费包）、会员期与排队中的未来期将被清除，且不可恢复</strong><button class="ps-link" style="color:#c0392b" type="button" @click="deleteAccountOpen = true">注销账号…</button></div>
                </section>
              </div>
            </template>
            <template v-else-if="modals.page === 'orders'">
              <h2>订单中心<small>套餐订购与积分充值记录</small></h2>
              <div class="ledger-filter of-bar">
                <label class="of-field">
                  <span>订单类型</span>
                  <select v-model="walletState.orderType" @change="walletState.blockPages.buy = 1">
                    <option value="">全部</option>
                    <option value="plan">套餐订购</option>
                    <option value="pack">积分加油包</option>
                    <option value="upgrade">套餐升级</option>
                  </select>
                </label>
                <DateRangePicker :range="walletState.buyRange" @change="walletState.blockPages.buy = 1" />
              </div>
              <div class="table-scroll"><table class="ledger-table ot-table">
                <thead>
                  <tr>
                    <th style="width:186px">订单号</th>
                    <th style="width:96px">订单类型</th>
                    <th>充值套餐</th>
                    <th style="width:96px">实付金额</th>
                    <th style="width:92px">支付方式</th>
                    <th style="width:148px">支付时间</th>
                    <th style="width:60px">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="!buyPage.count">
                    <td colspan="7" style="text-align:center;padding:24px;color:var(--text-dim)">暂无订单记录</td>
                  </tr>
                  <tr v-for="item in buyPage.slice" :key="item.id">
                    <td class="lt-id">{{ item.id }}</td>
                    <td>{{ orderTypeName(item.type) }}</td>
                    <td>
                      <div class="ot-pkg">{{ item.pkg || '—' }}</div>
                      <small class="ot-coins">{{ item.type === 'upgrade' ? '额度 ' + item.amount.toLocaleString() + ' 积分/月' : (item.amount >= 0 ? '+' : '') + item.amount.toLocaleString() + ' 积分' }}</small>
                    </td>
                    <td class="ot-paid">{{ fmtMoney(item.paid) }}</td>
                    <td>{{ item.pay || '—' }}</td>
                    <td>{{ item.status === 'refunded' ? '—' : item.time }}</td>
                    <td><button class="ot-detail" type="button" @click="orderDetail = item">详情</button></td>
                  </tr>
                </tbody>
              </table></div>
              <div class="ledger-summary">
                <div class="ls-total">共 <strong>{{ buyPage.count }}</strong> 条 · 累计 <strong>{{ buyPage.coins }}</strong> 积分</div>
                <div class="ledger-pager">
                  <button :disabled="buyPage.cur <= 1" @click="setBuyPage(buyPage.cur - 1)">‹</button>
                  <button v-for="i in buyPage.total" :key="i" :class="{ active: i === buyPage.cur }" @click="setBuyPage(i)">{{ i }}</button>
                  <button :disabled="buyPage.cur >= buyPage.total" @click="setBuyPage(buyPage.cur + 1)">›</button>
                </div>
              </div>
              <div v-if="orderDetail" class="od-mask" @click.self="orderDetail = null">
                <aside class="od-drawer">
                  <header class="od-head">
                    <strong>订单详情</strong>
                    <button class="od-close" type="button" @click="orderDetail = null">×</button>
                  </header>
                  <div class="od-body">
                    <section class="od-section">
                      <div class="od-caption">基本信息</div>
                      <div class="od-row"><span>订单编号</span><strong class="od-id">{{ orderDetail.id }}<button class="od-copy" type="button" @click="copyOrderId(orderDetail.id)">复制</button></strong></div>
                      <div class="od-row"><span>创建时间</span><strong>{{ orderDetail.createdAt || orderDetail.time }}</strong></div>
                      <div class="od-row"><span>支付时间</span><strong>{{ orderDetail.status === 'refunded' ? '—' : orderDetail.time }}</strong></div>
                    </section>
                    <section class="od-section">
                      <div class="od-caption">订单详情</div>
                      <div class="od-row"><span>订购商户</span><strong>店雷达 AI</strong></div>
                      <div class="od-row"><span>订单类型</span><strong>{{ orderTypeName(orderDetail.type) }}</strong></div>
                      <div class="od-row"><span>套餐名称</span><strong>{{ orderDetail.pkg || '—' }}</strong></div>
                      <div class="od-row"><span>套餐内容</span><strong>{{ Math.abs(orderDetail.amount).toLocaleString() }} 积分{{ orderDetail.type === 'upgrade' ? ' / 月（升级后月度额度）' : '' }}</strong></div>
                      <div class="od-row"><span>有效时长</span><strong>{{ orderDuration(orderDetail) }}</strong></div>
                    </section>
                    <section class="od-section">
                      <div class="od-caption">支付详情</div>
                      <div class="od-row"><span>支付方式</span><strong>{{ orderDetail.pay || '—' }}</strong></div>
                      <div class="od-row"><span>订单原价</span><strong class="od-orig">{{ orderDetail.orig ? '¥' + orderDetail.orig.toFixed(2) : '—' }}</strong></div>
                      <div class="od-row"><span>优惠金额</span><strong class="od-disc">{{ orderDetail.disc ? '-¥' + orderDetail.disc.toFixed(2) : '—' }}</strong></div>
                      <div class="od-row od-paid-row"><span>实付金额</span><strong class="od-paid">{{ fmtMoney(orderDetail.paid) }}</strong></div>
                    </section>
                  </div>
                </aside>
              </div>
            </template>
            <template v-else>
              <h2>消耗明细<small>对话任务积分消耗记录</small></h2>
              <div class="ledger-filter lf-consume">
                <div class="lf-chips">
                  <button v-for="c in CONSUME_CHIPS" :key="c.key" class="chip" :class="{ active: walletState.consumeChip === c.key }" type="button" @click="onChip(c.key)">{{ c.label }}</button>
                </div>
                <DateRangePicker :range="walletState.consumeRange" @change="onConsumeRangeChange" />
              </div>
              <div class="table-scroll"><table class="ledger-table">
                <thead>
                  <tr>
                    <th>对话记录</th>
                    <th style="width:150px">创建时间</th>
                    <th style="width:160px">来源对话</th>
                    <th style="width:90px">积分消耗</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="!consumePage.count">
                    <td colspan="4" style="text-align:center;padding:24px;color:var(--text-dim)">暂无消耗记录</td>
                  </tr>
                  <tr v-for="(item, i) in consumePage.slice" :key="i">
                    <td class="ct-msg" :title="item.title">{{ item.title }}</td>
                    <td>{{ item.time }}</td>
                    <td><span class="conv-tag" :title="'来源会话：' + item.conv"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg><b>{{ item.conv }}</b></span></td>
                    <td class="lt-amount minus">{{ item.coins.toLocaleString() }}</td>
                  </tr>
                </tbody>
              </table></div>
              <div class="ledger-summary">
                <div class="ls-total">共 <strong>{{ consumePage.count }}</strong> 条 · 累计消耗 <strong>{{ consumePage.coins }}</strong> 积分</div>
                <div class="ledger-pager">
                  <button :disabled="consumePage.cur <= 1" @click="setConsumePage(consumePage.cur - 1)">‹</button>
                  <button v-for="i in consumePage.total" :key="i" :class="{ active: i === consumePage.cur }" @click="setConsumePage(i)">{{ i }}</button>
                  <button :disabled="consumePage.cur >= consumePage.total" @click="setConsumePage(consumePage.cur + 1)">›</button>
                </div>
              </div>
            </template>
          </div>
        </section>
      </main>
      <div v-if="modals.page === 'chat' && !chatHero" class="col-mid-resizer"></div>

      <!-- 右：预览面板（首页态隐藏） -->
      <div v-if="modals.page === 'chat' && !chatHero" class="col-right-resizer" @mousedown="onDragStart($event, 'right')"></div>
      <RightPanel v-if="modals.page === 'chat' && !chatHero" :style="rightStyle" />
    </div>

    <!-- 账号切换顶部加载条 -->
    <div class="account-loading" :class="{ show: accountState.accountSwitching }"></div>

    <Modals />

    <!-- 登录弹窗（r60：modal 叠加在工作台上；未登录首访自动弹，游客操作拦截时带原因再弹） -->
    <LoginView v-if="authState.loginView" />

    <!-- 注销账号二次确认（2026-11-08 拍板：注销清除全部资产，输入"注销"确认） -->
    <div class="confirm-modal" :class="{ open: deleteAccountOpen }" role="dialog" aria-modal="true" @click.self="deleteAccountOpen = false">
      <div class="confirm-card">
        <div class="cf-head">
          <span class="cf-title">注销账号确认</span>
          <button class="cf-close" type="button" aria-label="关闭" @click="deleteAccountOpen = false">×</button>
        </div>
        <p style="margin:14px 0;color:#405348;line-height:1.8">注销后以下资产将被<strong>永久清除</strong>且不可恢复：<br>· 剩余积分 {{ appState.totalCoins.toLocaleString() }}（含付费积分包余额）<br>· 当前{{ walletState.currentPackage }}会员（{{ walletState.expiresAt }} 到期）<br>· 排队中的未来期订单与全部历史记录</p>
        <p style="margin:0 0 12px;color:#688074;font-size:13px">请输入「<b>注销</b>」以确认操作：</p>
        <input v-model="deleteAccountConfirmText" type="text" placeholder="输入：注销" style="width:100%;padding:9px 12px;border:1px solid #dce8df;border-radius:9px;font:inherit;margin-bottom:14px">
        <div class="cf-actions">
          <button class="cf-btn cf-cancel" type="button" @click="deleteAccountOpen = false">取消</button>
          <button class="cf-btn" type="button" style="background:#c0392b;color:#fff" @click="confirmDeleteAccount">确认注销</button>
        </div>
      </div>
    </div>
  </div>
</template>
