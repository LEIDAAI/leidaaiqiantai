<script setup lang="ts">
/* r85：顶部活动通栏 Banner —— 首次注册雷达AI赠送100积分（渐变设计感方案：光带/星光/礼物/金币装饰）
   关闭后会话内不再出现（sessionStorage）；活动结束移除 App.vue 中的 <PromoBanner /> 即可下线 */
import { ref } from 'vue'
import { openLogin, authState } from '../stores/auth'
import { navigatePage } from '../stores/modals'

const KEY = 'dld_promo_banner_closed'
const closed = ref(false)
try { closed.value = sessionStorage.getItem(KEY) === '1' } catch (e) {}
function close() {
  closed.value = true
  try { sessionStorage.setItem(KEY, '1') } catch (e) {}
}
/* 未登录 → 弹注册/登录；已登录 → 去套餐页 */
function join() {
  if (authState.logged) navigatePage('pricing')
  else openLogin('')
}
</script>

<template>
  <div v-if="!closed" class="promo-banner">
    <!-- 背景装饰：斜向光带 + 光斑 -->
    <i class="pb-streak pb-streak1" aria-hidden="true"></i>
    <i class="pb-streak pb-streak2" aria-hidden="true"></i>
    <i class="pb-glow pb-glow1" aria-hidden="true"></i>
    <i class="pb-glow pb-glow2" aria-hidden="true"></i>
    <!-- 星光点缀 -->
    <svg class="pb-star pb-star1" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 0l1.4 4.6L12 6 7.4 7.4 6 12 4.6 7.4 0 6l4.6-1.4z" fill="#FFE58F"/></svg>
    <svg class="pb-star pb-star2" width="9" height="9" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 0l1.4 4.6L12 6 7.4 7.4 6 12 4.6 7.4 0 6l4.6-1.4z" fill="#FFFFFF"/></svg>
    <svg class="pb-star pb-star3" width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 0l1.4 4.6L12 6 7.4 7.4 6 12 4.6 7.4 0 6l4.6-1.4z" fill="#FFE58F"/></svg>
    <!-- 漂浮金币装饰 -->
    <svg class="pb-coinf pb-coinf1" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="url(#pbCoinG)" stroke="#D99A26"/>
      <path d="M12 7v10M9.5 9.5h5M9.5 14.5h5" stroke="#A9740F" stroke-width="1.6" stroke-linecap="round"/>
      <defs><linearGradient id="pbCoinG" x1="5" y1="4" x2="19" y2="20" gradientUnits="userSpaceOnUse"><stop stop-color="#FFEEB0"/><stop offset="1" stop-color="#F0B43C"/></linearGradient></defs>
    </svg>
    <svg class="pb-coinf pb-coinf2" width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="url(#pbCoinG)" stroke="#D99A26"/>
      <path d="M12 7v10M9.5 9.5h5M9.5 14.5h5" stroke="#A9740F" stroke-width="1.6" stroke-linecap="round"/>
    </svg>
    <!-- 左侧礼物盒装饰 -->
    <svg class="pb-gift" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="6" y="20" width="36" height="22" rx="3" fill="url(#pbGiftBody)"/>
      <rect x="4" y="14" width="40" height="9" rx="2.5" fill="url(#pbGiftLid)"/>
      <rect x="21.5" y="14" width="5" height="28" fill="#FFE08A" opacity=".92"/>
      <path d="M24 14c-6-1-9-3.5-9-6.5C15 5 17 4 19 4c3 0 5 4 5 10zm0 0c6-1 9-3.5 9-6.5C33 5 31 4 29 4c-3 0-5 4-5 10z" fill="#FF7B9C"/>
      <defs>
        <linearGradient id="pbGiftBody" x1="6" y1="20" x2="42" y2="42" gradientUnits="userSpaceOnUse"><stop stop-color="#FFD65C"/><stop offset="1" stop-color="#F5A623"/></linearGradient>
        <linearGradient id="pbGiftLid" x1="4" y1="14" x2="44" y2="23" gradientUnits="userSpaceOnUse"><stop stop-color="#FFE58F"/><stop offset="1" stop-color="#FFC24B"/></linearGradient>
      </defs>
    </svg>
    <!-- 主体文案 -->
    <span class="pb-tag">
      <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 0l1.4 4.6L12 6 7.4 7.4 6 12 4.6 7.4 0 6l4.6-1.4z" fill="currentColor"/></svg>
      新人专享
    </span>
    <div class="pb-main">
      <div class="pb-headline">首次注册雷达AI，赠送 <b class="pb-num">100</b><span class="pb-unit">积分</span></div>
      <div class="pb-sub">积分即时到账 · 可用于 AI 选品分析 / 竞品监控 / 报告生成</div>
    </div>
    <button class="pb-join" type="button" @click="join">
      立即参与
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>
    </button>
    <button class="pb-close" type="button" aria-label="关闭活动横幅" @click="close">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 5l14 14M19 5L5 19"/></svg>
    </button>
  </div>
</template>
