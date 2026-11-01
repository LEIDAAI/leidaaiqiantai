<script setup lang="ts">
/* 左栏：新建对话 / 搜索 / 分组会话列表 / 底部账号 hover 弹层 / 折叠 */
import { computed, ref } from 'vue'
import {
  chatState, newConversation, selectConversation, stopTask,
  groupedSessions, togglePin, commitRename, deleteConversation
} from '../stores/chat'
import { openConvMenu, openDeleteConfirm, openRename, closeConvMenu, navigatePage, modals } from '../stores/modals'
import { accountState, currentAccount } from '../stores/account'
import { appState, saveGroupState, loadGroupState } from '../stores/state'
import { walletState } from '../stores/wallet'
import { DLD } from '../api'
import { send } from '../stores/send'
import { agentOpening } from '../stores/opening'

/* 底部账号卡：hover 弹出个人面板（积分 / 套餐 / 入口），离开延迟关闭 */
const userPop = ref(false)
let popTimer: ReturnType<typeof setTimeout> | undefined
function openUserPop() { if (popTimer) clearTimeout(popTimer); userPop.value = true }
function closeUserPop() { if (popTimer) clearTimeout(popTimer); popTimer = setTimeout(() => { userPop.value = false }, 180) }
function popGo(page: 'account' | 'pricing') { userPop.value = false; navigatePage(page) }
function popOrders() { userPop.value = false; navigatePage('orders') }
function popConsume() { userPop.value = false; navigatePage('consume') }
const ACCOUNT_PAGES = ['account', 'pricing', 'orders', 'consume']
const inAccountSection = computed(() => ACCOUNT_PAGES.includes(modals.page))
function goAccount() { userPop.value = false; navigatePage('account') }
const cycleText = computed(() => walletState.billingCycle === 'monthly' ? '月付' : '年付')

const GROUP_ORDER = ['pinned', 'today', 'yesterday', 'thisWeek', 'earlier'] as const
const GROUP_LABELS: Record<string, { cls: string; label: string; text: string }> = {
  pinned:    { cls: 'gp-pin',   label: '置顶',   text: '' },
  today:     { cls: 'gp-today', label: '今天',   text: '' },
  yesterday: { cls: 'gp-yest',  label: '昨天',   text: '' },
  thisWeek:  { cls: 'gp-week',  label: '本周',   text: '' },
  earlier:   { cls: 'gp-old',   label: '更早',   text: '' }
}
let groupState = loadGroupState()

const visibleGroups = computed(() =>
  GROUP_ORDER
    .filter(k => groupedSessions.value[k].length > 0 || k === 'pinned')
    .map(k => ({ key: k, items: groupedSessions.value[k], meta: GROUP_LABELS[k] }))
)

const hasAnySession = computed(() => Object.values(groupedSessions.value).some(g => g.length > 0))

function onToggleGroup(key: string) {
  groupState[key] = !groupState[key]
  saveGroupState(groupState)
}
function isGroupCollapsed(key: string) { return !!groupState[key] }

function onSelect(id: string) { navigatePage('chat'); selectConversation(id) }

function onContext(e: MouseEvent, id: string) {
  e.preventDefault()
  const sessions = chatStateSearchList()
  const target = sessions.find(s => s.id === id)
  if (target) openConvMenu(target, e.clientX, e.clientY)
}
function chatStateSearchList() {
  return Object.values(groupedSessions.value).flat()
}
function onMore(e: Event, id: string) {
  e.stopPropagation()
  const btn = e.target as HTMLElement
  const rect = btn.getBoundingClientRect()
  const target = chatStateSearchList().find(s => s.id === id)
  if (target) openConvMenu(target, rect.right - 184, rect.bottom + 4)
}

async function onMenu(action: string) {
  const target = chatStateSearchList().find(s => s.id === modals_target()?.id)
  closeConvMenu()
  if (!target) return
  if (action === 'pin') togglePin(target)
  else if (action === 'rename') openRename(target)
  else if (action === 'delete') openDeleteConfirm(async () => { await deleteConversation(target) })
}
// 兼容从 menu 弹层读取当前目标
let modalsRef: any = null
function modals_target() {
  if (!modalsRef) {
    // 动态引用避免循环依赖
    modalsRef = (window as any).__dldModals
  }
  return modalsRef?.convMenuTarget
}
modalsRef = modals
;(window as any).__dldModals = modals

function onSuggestion(q: string) {
  chatState.inputText = q
  send()
}

function onToggleLeft() {
  chatState.leftCollapsed = !chatState.leftCollapsed
  try { localStorage.setItem('dld_left_collapsed', chatState.leftCollapsed ? '1' : '0') } catch (e) {}
}
</script>

<template>
  <aside class="col-left" :class="{ collapsed: chatState.leftCollapsed, 'mobile-open': chatState.mobileSidebar }">
    <div class="left-head">
      <button class="new-btn" :class="{ muted: !!chatState.selectedExpert || !!chatState.selectedSkill }" @click="navigatePage('chat'); newConversation()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        新建对话
      </button>
      <div class="side-grid">
        <button class="side-card" :class="{ selected: modals.page === 'experts' }" @click="navigatePage('experts')">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2z"/></svg>
          <span>电商专家</span>
        </button>
        <button class="side-card" :class="{ selected: modals.page === 'skills' }" @click="navigatePage('skills')">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg>
          <span>技能库</span>
        </button>
      </div>
    </div>
    <!-- 搜索框 -->
    <div class="left-search">
      <div class="left-search-wrap" :class="{ 'has-val': chatState.searchQuery }">
        <input type="text" v-model="chatState.searchQuery" placeholder="搜索对话标题 / 标签" autocomplete="off" />
        <span class="clear-x" title="清空" @click="chatState.searchQuery = ''">×</span>
      </div>
    </div>
    <div class="left-section">最近对话</div>
    <div class="conv-list">
      <template v-if="hasAnySession">
        <div v-for="g in visibleGroups" :key="g.key" class="conv-group" :class="{ collapsed: isGroupCollapsed(g.key) }" :data-group-key="g.key">
          <div class="conv-group-head" @click="onToggleGroup(g.key)">
            <span class="cgh-arrow">▾</span>
            <span class="cgh-badge" :class="g.meta.cls">{{ g.meta.text }}</span>
            <span class="cgh-label">{{ g.meta.label }}</span>
            <span class="cgh-count">{{ g.items.length }}</span>
          </div>
          <div class="conv-group-body">
            <div v-if="!g.items.length" class="conv-group-empty">暂无会话</div>
            <div
              v-for="s in g.items" :key="s.id"
              class="conv-item"
              :class="{ active: s.id === chatState.activeConvKey, running: !!chatState.runningTasks[s.id], pinned: s.pinned }"
              :data-conv="s.id"
              @click="onSelect(s.id)"
              @contextmenu="onContext($event, s.id)"
            >
              <div class="conv-title"><span v-if="chatState.runningTasks[s.id]" class="run-dot"></span>{{ s.title }}</div>
              <div class="conv-meta">
                <span v-if="chatState.runningTasks[s.id]" class="conv-run-badge"><span class="bd-spin"></span>生成中</span>
                <span class="tag">{{ Number(s.roundCount || 0) }}</span>· {{ s.time }}
              </div>
              <div class="conv-actions">
                <button v-if="chatState.runningTasks[s.id]" class="conv-stop" title="停止生成" @click.stop="stopTask(s.id)">■</button>
                <button class="conv-trigger" title="更多操作" @click.stop="onMore($event, s.id)">⋮</button>
              </div>
            </div>
          </div>
        </div>
      </template>
      <div v-else class="conv-empty">该账号暂无历史对话</div>
    </div>
    <!-- 底部：账号卡，hover 弹出个人面板 -->
    <div class="user-zone" :class="{ open: userPop }" @mouseenter="openUserPop" @mouseleave="closeUserPop">
      <button class="uc-trigger" :class="{ on: inAccountSection }" @click="goAccount()">
        <span class="uc-ava">{{ (currentAccount?.name || '雷达用户').slice(0, 1) }}</span>
        <span class="uc-info">
          <b class="uc-name">{{ currentAccount?.name || '雷达用户' }}</b>
          <i class="uc-sub">{{ currentAccount?.phone || '个人中心' }}</i>
        </span>
        <svg class="uc-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>
      </button>

      <transition name="ucfade">
        <div v-if="userPop" class="uc-pop" role="menu">
          <div class="ucp-head">
            <span class="uc-ava big">{{ (currentAccount?.name || '雷达用户').slice(0, 1) }}</span>
            <div class="ucp-id">
              <b>{{ currentAccount?.name || '雷达用户' }}</b>
              <span>个人账号 · {{ currentAccount?.phone || '176****6666' }}</span>
            </div>
          </div>
          <div class="ucp-coins">
            <div class="ucp-coin">
              <strong>{{ appState.totalCoins.toLocaleString() }}</strong>
              <span>可用积分</span>
            </div>
            <div class="ucp-coin">
              <strong>{{ walletState.usedCoins.toLocaleString() }}</strong>
              <span>已使用</span>
            </div>
          </div>
          <div class="ucp-plan">
            <div class="ucp-plan-info">
              <b>{{ walletState.currentPackage }}（{{ cycleText }}）</b>
              <span>套餐到期：{{ walletState.expiresAt }}</span>
            </div>
            <button class="ucp-up" @click="popGo('pricing')">升级套餐</button>
          </div>
          <div class="ucp-menu">
            <button @click="popGo('account')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>
              个人中心
            </button>
            <button @click="popGo('pricing')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
              套餐购买
            </button>
            <button @click="popOrders()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
              订单中心
            </button>
            <button @click="popConsume()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              消耗明细
            </button>
          </div>
        </div>
      </transition>
    </div>
    <button class="col-left-toggle" @click="onToggleLeft" aria-label="折叠侧栏">
      <span class="cl-arrow">{{ chatState.leftCollapsed ? '›' : '‹' }}</span>
      <span class="cl-tip">{{ chatState.leftCollapsed ? '展开侧栏' : '折叠侧栏' }}</span>
    </button>
  </aside>
</template>
