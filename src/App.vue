<script setup lang="ts">
/* 三栏主布局：左会话 / 中对话 / 右预览 + 弹窗挂载 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import Sidebar from './components/Sidebar.vue'
import ChatPane from './components/ChatPane.vue'
import RightPanel from './components/RightPanel.vue'
import Modals from './components/Modals.vue'
import ExpertPanel from './components/ExpertPanel.vue'
import { modals, openBuyConfirm } from './stores/modals'
import { walletState } from './stores/wallet'
import { appState } from './stores/state'
import { currentAccount } from './stores/account'
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
</script>

<template>
  <div class="app-container">
    <div class="work" ref="workEl">
      <!-- 最左：80px 图标导航栏 -->
      <nav class="workspace-rail" aria-label="工作区导航">
        <div class="rail-logo" title="雷达AI">
          <svg width="34" height="34" viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="12" fill="#00A83E"/><path d="M14 8v6l3.5 2" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>
        </div>
        <button :class="{ 'rail-active': modals.page === 'chat' }" title="对话" @click="modals.page = 'chat'">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span>对话</span>
        </button>
        <button :class="{ 'rail-active': modals.page === 'experts' }" title="专家" @click="modals.page = 'experts'">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>
          <span>专家</span>
        </button>
        <button :class="{ 'rail-active': modals.page === 'skills' }" title="技能" @click="modals.page = 'skills'">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/></svg>
          <span>技能</span>
        </button>
        <div class="rail-spacer"></div>
        <button :class="{ 'rail-active': modals.page === 'account' }" title="个人中心" @click="modals.page = 'account'">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.5"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          <span>账户</span>
        </button>
      </nav>

      <!-- 左：会话列表（常显） -->
      <Sidebar v-if="modals.page === 'chat'" :style="leftStyle" />
      <div v-if="modals.page === 'chat'" class="col-left-resizer" @mousedown="onDragStart($event, 'left')"></div>
      <!-- 移动端：会话抽屉打开时的遮罩 -->
      <button v-if="modals.page === 'chat' && chatState.mobileSidebar" class="mobile-mask" aria-label="关闭会话列表" @click="chatState.mobileSidebar = false"></button>

      <!-- 中：对话内容 / 专家·技能发现页 -->
      <ChatPane v-if="modals.page === 'chat'" />
      <ExpertPanel v-else-if="modals.page === 'experts' || modals.page === 'skills'" />
      <main v-else-if="modals.page === 'account'" class="account-page">
        <header class="page-heading"><div><h1>个人中心</h1><p>个人账号</p></div><button class="page-secondary" @click="modals.page = 'chat'">返回工作台</button></header>
        <section class="current-plan"><div><span class="plan-crown">♛</span><strong>{{ walletState.currentPackage }}（{{ walletState.billingCycle === 'monthly' ? '月付' : '年付' }}）</strong><small>套餐到期时间：{{ walletState.expiresAt }}</small></div><button class="page-primary" @click="modals.page = 'pricing'">升级套餐</button><button class="page-secondary" @click="modals.wallet = true">购买积分包</button><div class="balance-meter"><div><span>剩余积分</span><strong>{{ appState.totalCoins.toLocaleString() }}</strong></div><div class="balance-track"><i :style="{ width: Math.max(4, (appState.totalCoins / (appState.totalCoins + walletState.usedCoins)) * 100) + '%' }"></i></div><small>{{ walletState.usedCoins.toLocaleString() }}（已使用）</small></div></section>
        <section class="account-content"><aside class="account-menu"><div class="account-menu-caption">个人中心</div><button class="active">个人信息</button><div class="account-menu-caption">套餐管理</div><button @click="modals.page = 'pricing'">套餐购买</button><button @click="modals.wallet = true">订单中心</button><button @click="modals.wallet = true">消耗记录</button><div class="account-menu-caption">API 管理</div><button>API设置</button></aside><div class="account-details"><h2>个人信息</h2><dl><dt>账号</dt><dd>{{ currentAccount?.name || '雷达用户' }}</dd><dt>手机号</dt><dd>{{ currentAccount?.phone || '暂未绑定' }}</dd><dt>账号类型</dt><dd>{{ currentAccount?.roleLabel || '主账号' }}</dd><dt>剩余积分</dt><dd>{{ appState.totalCoins.toLocaleString() }}</dd></dl><button class="page-primary" @click="modals.page = 'pricing'">查看套餐权益</button></div></section>
      </main>
      <main v-else class="pricing-page">
        <section class="current-plan"><div><span class="plan-crown">♛</span><strong>{{ walletState.currentPackage }}（{{ walletState.billingCycle === 'monthly' ? '月付' : '年付' }}）</strong><small>套餐到期时间：{{ walletState.expiresAt }}</small></div><button class="page-primary" @click="walletState.billingCycle = 'yearly'">升级套餐</button><button class="page-secondary" @click="modals.wallet = true">购买加油包</button><div class="balance-meter"><div><span>剩余算力：</span><strong>{{ appState.totalCoins.toLocaleString() }}</strong></div><div class="balance-track"><i :style="{ width: Math.max(4, (appState.totalCoins / (appState.totalCoins + walletState.usedCoins)) * 100) + '%' }"></i></div><small>{{ walletState.usedCoins.toLocaleString() }}（已使用）</small></div></section>
        <header class="pricing-title"><h1>套餐购买</h1><button class="page-secondary" @click="modals.page = 'account'">返回个人中心</button></header>
        <div class="billing-row"><div class="billing-switch"><button :class="{ active: walletState.billingCycle === 'monthly' }" @click="walletState.billingCycle = 'monthly'">月付</button><button :class="{ active: walletState.billingCycle === 'yearly' }" @click="walletState.billingCycle = 'yearly'">年付 <b>8折</b></button></div><button class="benefit-link" @click="benefitsOpen = !benefitsOpen">套餐权益对比 {{ benefitsOpen ? '⌄' : '›' }}</button></div>
        <div v-if="benefitsOpen" class="benefit-compare"><strong>套餐权益对比</strong><span>每月积分额度、并发任务数、图片与视频生成量、报告查询次数</span></div>
        <div class="pricing-grid"><article v-for="pkg in walletState.packages" :key="pkg.name" class="pricing-plan" :class="{ featured: pkg.featured, current: pkg.name === walletState.currentPackage }"><div v-if="pkg.featured" class="plan-ribbon">最受欢迎</div><div class="plan-name"><span>♛</span>{{ pkg.name }}<b v-if="walletState.billingCycle === 'yearly'">{{ pkg.name === '基础版' ? '8折' : pkg.name === '高级版' ? '6.1折' : '4.3折' }}</b></div><div class="plan-price">¥ {{ currentPlanPrice(pkg).toLocaleString() }} <small>/ {{ walletState.billingCycle === 'monthly' ? '月' : '年' }}</small><del>¥ {{ (walletState.billingCycle === 'monthly' ? pkg.compareMonthly : pkg.compareMonthly * 12).toLocaleString() }}/{{ walletState.billingCycle === 'monthly' ? '月' : '年' }}</del></div><div class="plan-renew">{{ walletState.billingCycle === 'monthly' ? `次月续费 ¥${pkg.price ?? 0}/月，可随时取消` : `相比月付省下 ¥${pkg.saving}/年` }}</div><div class="plan-credits">{{ walletState.billingCycle === 'monthly' ? '每月' : '每月发放' }} <strong>{{ pkg.coins.toLocaleString() }}</strong> 点算力{{ walletState.billingCycle === 'monthly' ? '，有效期 1 个月，不结转' : `，12 个月有效 · 不结转 · 共 ${(pkg.coins * 12).toLocaleString()} 点算力` }}</div><button class="page-primary plan-action" :disabled="pkg.name === walletState.currentPackage" @click="openPackage(pkg)">{{ pkg.name === walletState.currentPackage ? '当前套餐' : walletState.billingCycle === 'yearly' ? '补差价，立即升级' : '立即开通' }}</button><div class="model-cost"><strong>订阅后模型使用成本低至</strong><div><span>Seedance 2.5</span><b>约 ¥{{ pkg.modelCost[0] }} /秒</b></div><div><span>全能模型 Lite</span><b>约 ¥{{ pkg.modelCost[1] }} /张</b></div><div><span>智能模型 G-2</span><b>约 ¥{{ pkg.modelCost[2] }} /张</b></div></div><ul class="plan-limits"><li v-for="limit in pkg.features" :key="limit">{{ limit }}</li></ul></article></div><p class="pricing-note">套餐价格与权益请以账户结算信息为准。</p>
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
