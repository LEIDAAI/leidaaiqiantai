<script setup lang="ts">
/* 全局顶部导航栏 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { navigatePage, openPricing, openAccount } from '../stores/modals'
import { chatState } from '../stores/chat'
import { currentAccount } from '../stores/account'
import { authState, logout, openLogin } from '../stores/auth'
import { appState } from '../stores/state'
import { walletState } from '../stores/wallet'

const accountName = computed(() => currentAccount.value?.name || '雷达6861')
// r42：右上角账号按钮显示掩码手机号（与侧栏底部胶囊同源 currentAccount.phone）
const accountPhone = computed(() => currentAccount.value?.phone || '')

// r43：「套餐购买」改为下拉算力卡片（参照竞品算力浮层）
// r53：按钮改为「剩余积分」+ 数值；面板改为悬停展开（mouseleave 延迟 150ms 跨越按钮与面板间的 12px 间隙），点击保留作触屏降级
const npOpen = ref(false)
const npRoot = ref<HTMLElement | null>(null)
let npCloseTimer: ReturnType<typeof setTimeout> | undefined
function openNp() {
  if (npCloseTimer) { clearTimeout(npCloseTimer); npCloseTimer = undefined }
  npOpen.value = true
}
function scheduleNpClose() {
  if (npCloseTimer) clearTimeout(npCloseTimer)
  npCloseTimer = setTimeout(() => { npOpen.value = false; npCloseTimer = undefined }, 150)
}
function npGoPricing() { npOpen.value = false; openPricing() }
function npGoConsume() { npOpen.value = false; navigatePage('consume') }
/* r64：导航栏「客服 · 交流群」hover 弹层（复用 np 同款 mouseenter/延迟关闭模式） */
const pub = import.meta.env.BASE_URL
const groupQr = pub + 'wx-qrcode.png'
const kefuQr = ref(pub + 'wx-kefu.png') // 客服码未配置时 onerror 回退群码，后续放置 public/wx-kefu.png 即自动生效
function onKefuErr() { kefuQr.value = groupQr }
const csOpen = ref(false)
const csRoot = ref<HTMLElement | null>(null)
let csCloseTimer: ReturnType<typeof setTimeout> | undefined
function openCs() {
  if (csCloseTimer) { clearTimeout(csCloseTimer); csCloseTimer = undefined }
  csOpen.value = true
}
function scheduleCsClose() {
  if (csCloseTimer) clearTimeout(csCloseTimer)
  csCloseTimer = setTimeout(() => { csOpen.value = false; csCloseTimer = undefined }, 150)
}
/* r59：主账号胶囊下拉（账号与积分 / 退出登录）；未登录（含游客）显示「登录 / 注册」 */
/* r67：改为鼠标移入显示（复用 np/cs 同款 mouseenter/延迟关闭模式），点击保留作触屏降级 */
const avOpen = ref(false)
const avRoot = ref<HTMLElement | null>(null)
let avCloseTimer: ReturnType<typeof setTimeout> | undefined
function openAv() {
  if (avCloseTimer) { clearTimeout(avCloseTimer); avCloseTimer = undefined }
  avOpen.value = true
}
function scheduleAvClose() {
  if (avCloseTimer) clearTimeout(avCloseTimer)
  avCloseTimer = setTimeout(() => { avOpen.value = false; avCloseTimer = undefined }, 150)
}
function toggleAv() { avOpen.value = !avOpen.value }
function avAccount() { avOpen.value = false; openAccount() }
function avLogout() { avOpen.value = false; logout() }
function onDocClick(e: MouseEvent) {
  const t = e.target as Node
  if (npOpen.value && npRoot.value && !npRoot.value.contains(t)) {
    npOpen.value = false
    if (npCloseTimer) { clearTimeout(npCloseTimer); npCloseTimer = undefined }
  }
  if (csOpen.value && csRoot.value && !csRoot.value.contains(t)) {
    csOpen.value = false
    if (csCloseTimer) { clearTimeout(csCloseTimer); csCloseTimer = undefined }
  }
  if (avOpen.value && avRoot.value && !avRoot.value.contains(t)) {
    avOpen.value = false
    if (avCloseTimer) { clearTimeout(avCloseTimer); avCloseTimer = undefined }
  }
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <header class="global-navbar">
    <div class="navbar-left">
      <!-- r77：移动端会话列表入口（窄视口显示，配合侧栏抽屉与遮罩） -->
      <button class="mb-menu-btn" aria-label="打开会话列表" @click="chatState.mobileSidebar = true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
      <div class="navbar-logo">
        <div class="logo-icon">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <circle cx="14" cy="14" r="12" fill="#00C84B"/>
            <path d="M14 8v6l3.5 2" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="logo-text">
          <div class="logo-title">雷达AI</div>
          <div class="logo-subtitle">让电商更简单</div>
        </div>
      </div>
    </div>

    <div class="navbar-right">
      <!-- r64：客服 · 交流群 hover 弹层（双栏二维码） -->
      <div ref="csRoot" class="cs-wrap" @mouseenter="openCs" @mouseleave="scheduleCsClose">
        <button class="cs-pill" :class="{ 'cs-on': csOpen }" aria-label="客服与交流群" @click="openCs">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M4 12a8 8 0 0 1 16 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <rect x="2.5" y="11" width="4" height="7" rx="1.8" stroke="currentColor" stroke-width="1.8"/>
            <rect x="17.5" y="11" width="4" height="7" rx="1.8" stroke="currentColor" stroke-width="1.8"/>
            <path d="M20 18v1a3 3 0 0 1-3 3h-3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
          <span>客服 · 交流群</span>
        </button>

        <div v-if="csOpen" class="cs-card">
          <div class="cs-col">
            <div class="cs-col-head">
              <span class="cs-ico cs-ico-kefu">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <path d="M4 12a8 8 0 0 1 16 0" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
                  <rect x="2.5" y="11" width="4" height="7" rx="1.8" stroke="currentColor" stroke-width="2"/>
                  <rect x="17.5" y="11" width="4" height="7" rx="1.8" stroke="currentColor" stroke-width="2"/>
                  <path d="M20 18v1a3 3 0 0 1-3 3h-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </span>
              <b>客服微信</b>
            </div>
            <p class="cs-tip">一对一解答使用与付费问题</p>
            <div class="cs-qr-box"><img class="cs-qr" :src="kefuQr" alt="客服微信二维码" @error="onKefuErr"></div>
          </div>
          <div class="cs-div"></div>
          <div class="cs-col">
            <div class="cs-col-head">
              <span class="cs-ico cs-ico-group">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <circle cx="9" cy="8.5" r="3.2" stroke="currentColor" stroke-width="2"/>
                  <path d="M3.5 18.5c.8-2.6 3-4 5.5-4s4.7 1.4 5.5 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  <circle cx="17" cy="9.5" r="2.4" stroke="currentColor" stroke-width="2"/>
                  <path d="M16.5 14.6c2 .3 3.5 1.5 4.2 3.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </span>
              <b>交流群</b>
            </div>
            <p class="cs-tip">进群交流反馈，获取最新咨询</p>
            <div class="cs-qr-box"><img class="cs-qr" :src="groupQr" alt="交流群二维码"></div>
          </div>
        </div>
      </div>
      <div v-if="authState.logged" ref="npRoot" class="np-wrap" @mouseenter="openNp" @mouseleave="scheduleNpClose">
        <!-- r54：剩余积分改为浅绿 soft 胶囊（闪电图标 + 标签 + 加粗数值） -->
        <button class="np-pill" :class="{ 'np-on': npOpen }" @click="openNp">
          <svg class="np-coin" width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M13.2 2.2c.5-.7 1.6-.2 1.4.6l-1.8 7.4h5.4c.6 0 1 .7.6 1.2l-8 10.4c-.5.7-1.6.2-1.4-.6l1.8-7.4H5.8c-.6 0-1-.7-.6-1.2l8-10.4z"/></svg>
          <span class="np-label">剩余积分</span>
          <span class="np-val">{{ appState.totalCoins.toLocaleString() }}</span>
        </button>

        <!-- 下拉算力卡片 -->
        <div v-if="npOpen" class="np-card">
          <div class="np-head">
            <span class="np-title">我的积分</span>
            <button class="np-buy" @click="npGoPricing">购买</button>
          </div>
          <div class="np-num">
            <span class="np-num-val">{{ appState.totalCoins.toLocaleString() }}</span>
            <span class="np-num-unit">积分</span>
          </div>
          <button class="np-upgrade" @click="npGoPricing">升级套餐</button>
          <div class="np-rows">
            <div class="np-row">
              <span class="np-row-label">套餐到期</span>
              <span class="np-row-val">{{ walletState.currentPackage }} · {{ walletState.expiresAt }} 到期</span>
            </div>
            <button class="np-row np-row-link" @click="npGoConsume">
              <span class="np-row-label">积分消耗明细</span>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5 3l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
      <button v-if="!authState.logged" class="np-pill" @click="openPricing">查看套餐</button>

      <!-- r59：未登录（含游客）→ 绿色「登录 / 注册」；已登录 → 主账号胶囊 + 下拉（账号与积分 / 退出登录） -->
      <button v-if="!authState.logged" class="nav-login" @click="openLogin('')">登录 / 注册</button>
      <div v-else ref="avRoot" class="av-wrap" @mouseenter="openAv" @mouseleave="scheduleAvClose">
        <button class="nav-avatar" @click="toggleAv">
          <span class="avatar-dot">主</span>
          <span class="avatar-name">{{ accountName }}</span>
          <span v-if="accountPhone" class="avatar-phone">{{ accountPhone }}</span>
        </button>
        <div v-if="avOpen" class="av-menu">
          <button class="av-item" @click="avAccount">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5.5" r="2.6" stroke="currentColor" stroke-width="1.4"/><path d="M2.8 13.4c.9-2.2 2.9-3.4 5.2-3.4s4.3 1.2 5.2 3.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
            <span>账号与积分</span>
          </button>
          <button class="av-item danger" @click="avLogout">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6.5 3H4a1.5 1.5 0 0 0-1.5 1.5v7A1.5 1.5 0 0 0 4 13h2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M10 5l3 3-3 3M13 8H6.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span>退出登录</span>
          </button>
        </div>
      </div>
    </div>
  </header>
</template>
