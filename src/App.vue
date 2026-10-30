<script setup lang="ts">
/* 三栏主布局：左会话 / 中对话 / 右预览 + 弹窗挂载 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import Sidebar from './components/Sidebar.vue'
import ChatPane from './components/ChatPane.vue'
import RightPanel from './components/RightPanel.vue'
import Modals from './components/Modals.vue'
import ExpertPanel from './components/ExpertPanel.vue'
import TopNavbar from './components/TopNavbar.vue'
import { chatState } from './stores/chat'
import { panel, setCollapsed } from './stores/panel'
import { accountState } from './stores/account'
import { expertState } from './stores/expert'

const workEl = ref<HTMLElement | null>(null)
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
</script>

<template>
  <div class="app-container">
    <TopNavbar />
    <div class="work" ref="workEl">
      <!-- 左：会话列表 -->
      <Sidebar :style="leftStyle" />
      <div class="col-left-resizer" @mousedown="onDragStart($event, 'left')"></div>

      <!-- 中：对话内容 / 专家工作台 -->
      <ChatPane v-if="!expertState.open" />
      <ExpertPanel v-else />
      <div class="col-mid-resizer"></div>

      <!-- 右：预览面板 -->
      <div class="col-right-resizer" @mousedown="onDragStart($event, 'right')"></div>
      <RightPanel :style="rightStyle" />
    </div>

    <!-- 账号切换顶部加载条 -->
    <div class="account-loading" :class="{ show: accountState.accountSwitching }"></div>

    <Modals />
  </div>
</template>
