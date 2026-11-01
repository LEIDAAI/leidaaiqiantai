<script setup lang="ts">
/* 全局顶部导航栏 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { navigatePage, openPricing, openAccount } from '../stores/modals'
import { currentAccount } from '../stores/account'
import { appState } from '../stores/state'
import { walletState } from '../stores/wallet'

const accountName = computed(() => currentAccount.value?.name || '雷达6861')
// r42：右上角账号按钮显示掩码手机号（与侧栏底部胶囊同源 currentAccount.phone）
const accountPhone = computed(() => currentAccount.value?.phone || '')

// r43：「套餐购买」改为下拉算力卡片（参照竞品算力浮层）
const npOpen = ref(false)
const npRoot = ref<HTMLElement | null>(null)
function toggleNp() { npOpen.value = !npOpen.value }
function npGoPricing() { npOpen.value = false; openPricing() }
function npGoConsume() { npOpen.value = false; navigatePage('consume') }
function onDocClick(e: MouseEvent) {
  if (!npOpen.value || !npRoot.value) return
  if (!npRoot.value.contains(e.target as Node)) npOpen.value = false
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
      <div ref="npRoot" class="np-wrap">
        <button class="nav-link nav-button" :class="{ 'np-on': npOpen }" @click="toggleNp">套餐购买</button>

        <!-- 下拉算力卡片 -->
        <div v-if="npOpen" class="np-card">
          <div class="np-head">
            <span class="np-title">我的算力点</span>
            <button class="np-buy" @click="npGoPricing">购买</button>
          </div>
          <div class="np-num">
            <span class="np-num-val">{{ appState.totalCoins.toLocaleString() }}</span>
            <span class="np-num-unit">算力点</span>
          </div>
          <button class="np-upgrade" @click="npGoPricing">升级套餐</button>
          <div class="np-rows">
            <div class="np-row">
              <span class="np-row-label">套餐到期</span>
              <span class="np-row-val">{{ walletState.currentPackage }} · {{ walletState.expiresAt }} 到期</span>
            </div>
            <button class="np-row np-row-link" @click="npGoConsume">
              <span class="np-row-label">算力消耗明细</span>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5 3l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <button class="nav-avatar" @click="openAccount">
        <span class="avatar-name">{{ accountName }}</span>
        <span v-if="accountPhone" class="avatar-phone">{{ accountPhone }}</span>
      </button>
    </div>
  </header>
</template>
