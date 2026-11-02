<script setup lang="ts">
/* 三栏主布局：左会话 / 中对话 / 右预览 + 弹窗挂载 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import Sidebar from './components/Sidebar.vue'
import ChatPane from './components/ChatPane.vue'
import RightPanel from './components/RightPanel.vue'
import Modals from './components/Modals.vue'
import ExpertPanel from './components/ExpertPanel.vue'
import TopNavbar from './components/TopNavbar.vue'
import DateRangePicker from './components/DateRangePicker.vue'
import { modals, openBuyConfirm } from './stores/modals'
import { walletState, filteredBuy, filteredConsume, type BuyRecord } from './stores/wallet'
import { appState, pad } from './stores/state'
import { currentAccount } from './stores/account'
import { flashToast } from './utils/common'
import { chatState, activeView } from './stores/chat'
import { panel, setCollapsed } from './stores/panel'
import { accountState } from './stores/account'
const benefitsOpen = ref(false)

const workEl = ref<HTMLElement | null>(null)
const currentPlanPrice = (pkg: typeof walletState.packages[number]) => walletState.billingCycle === 'monthly' ? (pkg.price ?? 0) : pkg.yearlyPrice
function openPackage(pkg: typeof walletState.packages[number]) {
  if (pkg.name === walletState.currentPackage) return
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
// 个人信息页展示名：不暴露「主账号」概念（侧栏账号胶囊仍依赖 store 原名）
const profileName = computed(() => {
  const n = currentAccount.value?.name || ''
  return !n || n === '主账号' ? '雷达用户' : n
})
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
function orderTypeName(t?: string) { return t === 'plan' ? '套餐订购' : '积分加油包' }
function orderDuration(item: BuyRecord) {
  if (item.type === 'plan') return /年付/.test(item.pkg) ? '12 个月' : '1 个月'
  return '长期有效'
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
        <header class="page-heading"><div><h1>个人中心</h1><p>个人账号</p></div></header>
        <section class="current-plan"><div><span class="plan-crown">♛</span><strong>{{ walletState.currentPackage }}（{{ walletState.billingCycle === 'monthly' ? '月付' : '年付' }}）</strong><small>套餐到期时间：{{ walletState.expiresAt }}</small></div><!-- 隐藏：升级套餐入口（待恢复）<button class="page-primary" @click="walletState.billingCycle = 'yearly'">升级套餐</button> --><button class="page-secondary" @click="modals.wallet = true">购买积分包</button><div class="balance-meter"><div><span>剩余积分</span><strong>{{ appState.totalCoins.toLocaleString() }}</strong></div><div class="balance-track"><i :style="{ width: Math.max(4, (appState.totalCoins / (appState.totalCoins + walletState.usedCoins)) * 100) + '%' }"></i></div><small>{{ walletState.usedCoins.toLocaleString() }}（已使用）</small></div></section>
        <section class="account-content">
          <aside class="account-menu">
            <div class="account-menu-caption">个人中心</div>
            <button @click="modals.page = 'account'">个人信息</button>
            <div class="account-menu-caption">套餐管理</div>
            <button class="active" @click="modals.page = 'pricing'">套餐购买</button>
            <button @click="modals.page = 'orders'">订单中心</button>
            <button @click="modals.page = 'consume'">消耗明细</button>
          </aside>
          <div class="account-details">
            <h2>套餐购买<small>选择适合的积分套餐</small></h2>
        <div class="billing-row"><div class="billing-switch"><button :class="{ active: walletState.billingCycle === 'monthly' }" @click="walletState.billingCycle = 'monthly'">月付</button><button :class="{ active: walletState.billingCycle === 'yearly' }" @click="walletState.billingCycle = 'yearly'">年付 <b>8折</b></button></div><!-- 隐藏：权益对比入口（待恢复）<button class="benefit-link" @click="benefitsOpen = !benefitsOpen">套餐权益对比 {{ benefitsOpen ? '⌄' : '›' }}</button> --></div>
        <div v-if="benefitsOpen" class="benefit-compare"><strong>套餐权益对比</strong><span>每月积分额度、并发任务数、图片与视频生成量、报告查询次数</span></div>
        <div class="pricing-grid"><article v-for="pkg in walletState.packages" :key="pkg.name" class="pricing-plan" :class="{ featured: pkg.featured, current: pkg.name === walletState.currentPackage }"><div v-if="pkg.featured" class="plan-ribbon">最受欢迎</div><div class="plan-name"><span>♛</span>{{ pkg.name }}<b v-if="walletState.billingCycle === 'yearly'">{{ pkg.name === '基础版' ? '8折' : pkg.name === '高级版' ? '6.1折' : '4.3折' }}</b></div><div class="plan-price">¥ {{ currentPlanPrice(pkg).toLocaleString() }} <small>/ {{ walletState.billingCycle === 'monthly' ? '月' : '年' }}</small><del>¥ {{ (walletState.billingCycle === 'monthly' ? pkg.compareMonthly : pkg.compareMonthly * 12).toLocaleString() }}/{{ walletState.billingCycle === 'monthly' ? '月' : '年' }}</del></div><div class="plan-renew">{{ walletState.billingCycle === 'monthly' ? `次月续费 ¥${pkg.price ?? 0}/月，可随时取消` : `相比月付省下 ¥${pkg.saving}/年` }}</div><div class="plan-credits">{{ walletState.billingCycle === 'monthly' ? '每月' : '每月发放' }} <strong>{{ pkg.coins.toLocaleString() }}</strong> 积分{{ walletState.billingCycle === 'monthly' ? '，有效期 1 个月，不结转' : `，12 个月有效 · 不结转 · 共 ${(pkg.coins * 12).toLocaleString()} 积分` }}</div><button class="page-primary plan-action" :disabled="pkg.name === walletState.currentPackage" @click="openPackage(pkg)">{{ pkg.name === walletState.currentPackage ? '当前套餐' : walletState.billingCycle === 'yearly' ? '补差价，立即升级' : '立即开通' }}</button><div class="model-cost"><strong>订阅后模型使用成本低至</strong><div><span>Seedance 2.5</span><b>约 ¥{{ pkg.modelCost[0] }} /秒</b></div><div><span>全能模型 Lite</span><b>约 ¥{{ pkg.modelCost[1] }} /张</b></div><div><span>智能模型 G-2</span><b>约 ¥{{ pkg.modelCost[2] }} /张</b></div></div><ul class="plan-limits"><li v-for="limit in pkg.features" :key="limit">{{ limit }}</li></ul></article></div><p class="pricing-note">套餐价格与权益请以账户结算信息为准。</p>
          </div>
        </section>
      </main>
      <!-- 个人中心区块：个人信息 / 套餐购买 / 订单中心 / 消耗明细（套餐购买页复用同一左侧子导航，当前项高亮） -->
      <main v-else class="account-page">
        <header class="page-heading"><div><h1>个人中心</h1><p>个人账号</p></div></header>
        <section class="current-plan"><div><span class="plan-crown">♛</span><strong>{{ walletState.currentPackage }}（{{ walletState.billingCycle === 'monthly' ? '月付' : '年付' }}）</strong><small>套餐到期时间：{{ walletState.expiresAt }}</small></div><!-- 隐藏：升级套餐入口（待恢复）<button class="page-primary" @click="modals.page = 'pricing'">升级套餐</button> --><button class="page-secondary" @click="modals.wallet = true">购买积分包</button><div class="balance-meter"><div><span>剩余积分</span><strong>{{ appState.totalCoins.toLocaleString() }}</strong></div><div class="balance-track"><i :style="{ width: Math.max(4, (appState.totalCoins / (appState.totalCoins + walletState.usedCoins)) * 100) + '%' }"></i></div><small>{{ walletState.usedCoins.toLocaleString() }}（已使用）</small></div></section>
        <section class="account-content">
          <aside class="account-menu">
            <div class="account-menu-caption">个人中心</div>
            <button :class="{ active: modals.page === 'account' }" @click="modals.page = 'account'">个人信息</button>
            <div class="account-menu-caption">套餐管理</div>
            <button @click="modals.page = 'pricing'">套餐购买</button>
            <button :class="{ active: modals.page === 'orders' }" @click="modals.page = 'orders'">订单中心</button>
            <button :class="{ active: modals.page === 'consume' }" @click="modals.page = 'consume'">消耗明细</button>
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
                <span class="profile-badge">{{ walletState.currentPackage }} · {{ walletState.billingCycle === 'monthly' ? '月付' : '年付' }}</span>
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
                  <div class="ps-row"><span>剩余积分</span><strong class="ps-coins">{{ appState.totalCoins.toLocaleString() }}</strong><button class="ps-link" type="button" @click="modals.page = 'consume'">查看明细</button></div>
                  <div class="ps-row"><span>累计消耗</span><strong>{{ walletState.usedCoins.toLocaleString() }}</strong></div>
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
                  </select>
                </label>
                <DateRangePicker :range="walletState.buyRange" @change="walletState.blockPages.buy = 1" />
              </div>
              <table class="ledger-table ot-table">
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
                      <small class="ot-coins">{{ item.amount >= 0 ? '+' : '' }}{{ item.amount.toLocaleString() }} 积分</small>
                    </td>
                    <td class="ot-paid">{{ fmtMoney(item.paid) }}</td>
                    <td>{{ item.pay || '—' }}</td>
                    <td>{{ item.status === 'refunded' ? '—' : item.time }}</td>
                    <td><button class="ot-detail" type="button" @click="orderDetail = item">详情</button></td>
                  </tr>
                </tbody>
              </table>
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
                      <div class="od-row"><span>套餐内容</span><strong>{{ Math.abs(orderDetail.amount).toLocaleString() }} 积分</strong></div>
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
              <table class="ledger-table">
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
              </table>
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
  </div>
</template>
