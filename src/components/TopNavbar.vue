<script setup lang="ts">
/* 全局顶部导航栏 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { navigatePage, openPricing, openAccount } from '../stores/modals'
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
/* r59：主账号胶囊下拉（账号与积分 / 退出登录）；未登录（含游客）显示「登录 / 注册」 */
const avOpen = ref(false)
const avRoot = ref<HTMLElement | null>(null)
function toggleAv() { avOpen.value = !avOpen.value }
function avAccount() { avOpen.value = false; openAccount() }
function avLogout() { avOpen.value = false; logout() }
function onDocClick(e: MouseEvent) {
  const t = e.target as Node
  if (npOpen.value && npRoot.value && !npRoot.value.contains(t)) {
    npOpen.value = false
    if (npCloseTimer) { clearTimeout(npCloseTimer); npCloseTimer = undefined }
  }
  if (avOpen.value && avRoot.value && !avRoot.value.contains(t)) avOpen.value = false
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <header class="global-navbar">
    <div class="navbar-left">
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
      <div v-else ref="avRoot" class="av-wrap">
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
