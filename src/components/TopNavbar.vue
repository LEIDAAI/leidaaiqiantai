<script setup lang="ts">
/* 全局顶部导航栏 */
import { openAccount, openPricing } from '../stores/modals'
import { currentAccount } from '../stores/account'
import { computed } from 'vue'

const accountName = computed(() => currentAccount.value?.name || '雷达6861')
// r42：右上角账号按钮显示掩码手机号（与侧栏底部胶囊同源 currentAccount.phone）
const accountPhone = computed(() => currentAccount.value?.phone || '')
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
      <button class="nav-link nav-button" @click="openPricing">套餐购买</button>
      <button class="nav-avatar" @click="openAccount">
        <span class="avatar-name">{{ accountName }}</span>
        <span v-if="accountPhone" class="avatar-phone">{{ accountPhone }}</span>
      </button>
    </div>
  </header>
</template>
