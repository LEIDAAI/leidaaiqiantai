<script setup lang="ts">
/* r76：顶部活动通栏 Banner —— 首次注册雷达AI赠送100积分（参照 LinkFox 促销条样式）
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
    <!-- 左侧金币装饰 -->
    <svg class="pb-coin" width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="url(#pbGold)" stroke="#d99a26" stroke-width="1"/>
      <circle cx="12" cy="12" r="6.5" fill="none" stroke="#a9740f" stroke-width="1.2" opacity=".7"/>
      <path d="M12 8.4l1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4z" fill="#a9740f"/>
      <defs>
        <linearGradient id="pbGold" x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse">
          <stop stop-color="#ffe9a8"/><stop offset=".5" stop-color="#f5c451"/><stop offset="1" stop-color="#e09c2b"/>
        </linearGradient>
      </defs>
    </svg>
    <!-- 主体文案 -->
    <span class="pb-tag">新人专享</span>
    <span class="pb-text">首次注册雷达AI，赠送 <b class="pb-num">100</b> 积分</span>
    <button class="pb-join" type="button" @click="join">立即参与</button>
    <button class="pb-close" type="button" aria-label="关闭活动横幅" @click="close">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 5l14 14M19 5L5 19"/></svg>
    </button>
  </div>
</template>
