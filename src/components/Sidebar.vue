<script setup lang="ts">
/* 左栏：新建对话 / 搜索 / 分组会话列表 / 折叠 */
import { computed } from 'vue'
import {
  chatState, newConversation, selectConversation, stopTask,
  groupedSessions, togglePin, commitRename, deleteConversation
} from '../stores/chat'
import { openConvMenu, openDeleteConfirm, openRename, closeConvMenu, navigatePage, modals } from '../stores/modals'
import { accountState, currentAccount } from '../stores/account'
import { saveGroupState, loadGroupState } from '../stores/state'
import { DLD } from '../api'
import { send } from '../stores/send'
import { agentOpening } from '../stores/opening'

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
      <button class="new-btn" @click="navigatePage('chat'); newConversation()">＋ 新建对话</button>
      <button class="expert-btn" :class="{ selected: modals.page === 'experts' }" @click="navigatePage('experts')">电商专家</button>
      <button class="expert-btn" :class="{ selected: modals.page === 'skills' }" @click="navigatePage('skills')">技能库</button>
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
    <!-- 底部：个人中心入口 -->
    <button class="left-foot" :class="{ on: modals.page === 'account' }" title="个人中心" @click="navigatePage('account')">
      <span class="lf-ava">{{ (currentAccount?.name || '雷达用户').slice(0, 1) }}</span>
      <span class="lf-name">{{ currentAccount?.name || '雷达用户' }}</span>
      <span class="lf-tip">个人中心</span>
    </button>
    <button class="col-left-toggle" @click="onToggleLeft" aria-label="折叠侧栏">
      <span class="cl-arrow">{{ chatState.leftCollapsed ? '›' : '‹' }}</span>
      <span class="cl-tip">{{ chatState.leftCollapsed ? '展开侧栏' : '折叠侧栏' }}</span>
    </button>
  </aside>
</template>
