<script setup lang="ts">
/* 中栏：头部（标题/账号/积分）+ 消息流 + Composer */
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import MessageBubble from './MessageBubble.vue'
import Composer from './Composer.vue'
import {
  chatState, activeView, isRunning, stopTask, selectConversation
} from '../stores/chat'
import { agentOpening } from '../stores/opening'
import { appState } from '../stores/state'
import { accountState, currentAccount, isMainAccount, switchAccount, resetToMain, getSwitchableAccounts } from '../stores/account'
import { openSettings, openWallet, modals } from '../stores/modals'
import { resetRightPreview } from '../stores/panel'
import { PERSON_SVG } from './svg'
import { expertState, openExpertPanel } from '../stores/expert'

const streamEl = ref<HTMLElement | null>(null)
const showJumpLatest = ref(false)

const welcomeTab = ref<'expert' | 'skill'>('expert')
const welcomePlatform = ref('全部')
const welcomeScene = ref('推荐')
const welcomePlatforms = ['全部', '1688', 'Ozon', '亚马逊', 'Temu']
const welcomeScenes = ['推荐', '选品与开发', '产品视觉', '产品运营', '营销广告', '数据分析', '选品/热点', '合规检测']

const welcomeExperts = [
  { platform: '1688', name: '1688选品专家', desc: '货源洞察 · 供应链分析', icon: '1688' },
  { platform: 'Ozon', name: 'Ozon选品专家', desc: '市场需求 · 类目竞争', icon: 'O' },
  { platform: '亚马逊', name: '亚马逊选品专家', desc: '市场机会 · 竞品分析', icon: 'A' },
  { platform: 'Temu', name: 'Temu选品专家', desc: '热销榜 · 动销分析', icon: 'T' }
]

// Welcome skills: filtered from state.skills (official only)
const welcomeSkills = computed(() =>
  expertState.skills.filter(s => s.source === 'official').filter(s =>
    (welcomePlatform.value === '全部' || s.tags.includes(welcomePlatform.value)) &&
    (welcomeScene.value === '推荐' || s.scenario === welcomeScene.value)
  )
)

const view = activeView

// 切换会话时重置右侧预览 + 滚动到底
watch(() => chatState.activeConvKey, (nv, ov) => {
  if (ov && nv && ov !== nv) {
    try { resetRightPreview() } catch (e) {}
  }
  nextTick(() => scrollToBottom(false))
})

// 消息数量/流式内容变化时智能跟随
watch(() => {
  const v = view.value
  if (!v) return 0
  const last = v.messages[v.messages.length - 1]
  return v.messages.length + (last ? (last.liveText.length + (last.finalHtml ? 1 : 0) + (last.phase === 'done' ? 1 : 0)) : 0)
}, () => {
  followBottom()
})

function scrollToBottom(smooth = true) {
  const el = streamEl.value
  if (!el) return
  el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
}
function followBottom() {
  const el = streamEl.value
  if (!el) return
  const dist = el.scrollHeight - el.scrollTop - el.clientHeight
  if (dist < 140) scrollToBottom()
  showJumpLatest.value = dist > 120
}
function onStreamScroll() {
  const el = streamEl.value
  if (!el) return
  const dist = el.scrollHeight - el.scrollTop - el.clientHeight
  showJumpLatest.value = dist > 120
}
onMounted(() => nextTick(() => scrollToBottom(false)))

// 注入滚动回调给 send 链路
import { send, setScrollBottom as registerScroll } from '../stores/send'
registerScroll(() => followBottom())

/* —— 账号下拉 —— */
const popoverOpen = ref(false)
const accountChipEl = ref<HTMLElement | null>(null)
const popoverEl = ref<HTMLElement | null>(null)
const popStyle = ref({ left: '0px', top: '0px' })

function openAccountPopover() {
  const r = accountChipEl.value?.getBoundingClientRect()
  const popW = 264
  let left = (r ? r.right : 200) - popW
  if (left < 8) left = 8
  let top = (r ? r.bottom : 100) + 6
  if (top + 360 > window.innerHeight) top = Math.max(8, window.innerHeight - 380)
  popStyle.value = { left: left + 'px', top: top + 'px' }
  popoverOpen.value = true
}
function togglePopover(e: Event) {
  e.stopPropagation()
  popoverOpen.value = !popoverOpen.value
}
function closePopover() {
  popoverOpen.value = false
}
function onSwitchAccount(id: string) {
  closePopover()
  switchAccount(id)
}
function onResetMain() {
  const switched = resetToMain()
  if (!switched) openAccountPopover()
  else closePopover()
}
function openWalletFromCoinChip(e: Event) {
  e.stopPropagation()
  closePopover()
  openWallet()
}
function onDocClick(e: MouseEvent) {
  if (popoverOpen.value && popoverEl.value && !popoverEl.value.contains(e.target as Node) && accountChipEl.value && !accountChipEl.value.contains(e.target as Node)) {
    closePopover()
  }
  const t = e.target as HTMLElement
  if (modals.convMenu && !t.closest('.conv-menu') && !t.closest('.conv-trigger')) modals.convMenu = false
  if (modals.inputMenu && !t.closest('.input-menu')) modals.inputMenu = false
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))

const switchableList = computed(() => getSwitchableAccounts().filter(a => a.id !== currentAccount.value.id))
const accountNameShort = computed(() => {
  const n = currentAccount.value.name
  return n.length > 10 ? n.slice(0, 10) + '…' : n
})
const coinText = computed(() => appState.totalCoins.toLocaleString())

/* —— 发送/停止同位按钮 —— */
const running = computed(() => isRunning.value)
function onSendClick() {
  if (chatState.activeConvKey && chatState.runningTasks[chatState.activeConvKey]) {
    stopTask(chatState.activeConvKey)
    return
  }
  send()
}
function onSuggestion(q: string) {
  chatState.inputText = q
  send()
}
function onInputKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    if (chatState.activeConvKey && chatState.runningTasks[chatState.activeConvKey]) {
      // 由 Composer 处理
    }
  }
}
void onInputKeydown
void selectConversation
</script>

<template>
  <section class="col-mid">
    <div class="chat-card">
      <div class="chat-head">
        <span class="title">{{ chatState.chatTitle }}</span>
        <div class="right">
          <!-- 主/子账号胶囊 -->
          <span class="account-chip" ref="accountChipEl" :class="{ open: popoverOpen }" title="切换账号" @click="togglePopover">
            <span class="ac-avatar" :class="{ slave: !isMainAccount }" aria-hidden="true" v-html="PERSON_SVG"></span>
            <span>{{ accountNameShort }}</span>
            <span class="ac-phone">{{ currentAccount.phone }}</span>
            <span class="ac-role" :data-role="isMainAccount ? 'main' : 'slave'">{{ currentAccount.roleLabel }}</span>
            <span class="ac-arrow"><svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          </span>
          <!-- 积分胶囊 -->
          <span class="coin-chip" title="点击充值积分" role="button" tabindex="0" @click="openWalletFromCoinChip" @keydown.enter="openWalletFromCoinChip">
            <svg class="cc-icon" width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="#FFC53D" stroke="#E8A200" stroke-width="1.2"/><path d="M4.3 3.8 6 5.9m1.7-2.1L6 5.9m0 0v2.5M4.7 6.5h2.6M4.7 7.9h2.6" stroke="#A66F00" stroke-width=".9" stroke-linecap="round"/></svg>
            <span>{{ coinText }}</span>
          </span>
          <!-- 账号下拉 -->
          <div class="account-popover" ref="popoverEl" :class="{ open: popoverOpen }" :style="popStyle">
            <div class="account-self">
              <div class="as-avatar" :class="{ slave: !isMainAccount }" v-html="PERSON_SVG"></div>
              <div class="as-info">
                <div class="as-top">
                  <span class="as-name">{{ currentAccount.name }}</span>
                  <span class="as-role" :data-role="isMainAccount ? 'main' : 'slave'">{{ currentAccount.roleLabel }}</span>
                </div>
                <div class="as-phone"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>{{ currentAccount.phone || '' }}</div>
              </div>
            </div>
            <div class="account-list">
              <div v-if="!switchableList.length" class="account-empty">
                {{ isMainAccount ? '暂无子账号，点击右上角⚙添加' : '仅主账号可查看和切换其他账号，或在设置中开启"子账号互看"' }}
              </div>
              <div v-for="a in switchableList" :key="a.id" class="al-item" role="button" tabindex="0" @click="onSwitchAccount(a.id)" @keydown.enter="onSwitchAccount(a.id)">
                <div class="al-avatar" :class="{ main: a.role === 'main' }" v-html="PERSON_SVG"></div>
                <div class="al-info">
                  <div class="al-name">{{ a.name }}<span class="al-role" :class="{ main: a.role === 'main' }">{{ a.roleLabel }}</span></div>
                  <div class="al-shop">{{ a.phone || '' }}</div>
                </div>
                <div class="al-time">{{ a.lastActive }}</div>
              </div>
            </div>
            <div class="ap-foot">
              <button class="ap-tip" type="button" title="查看积分中心 / 充值明细" @click.stop="closePopover(); openWallet()">
                <svg class="ap-coin-ic" width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="#FFC53D" stroke="#E8A200" stroke-width="1.2"/><path d="M4.3 3.8 6 5.9m1.7-2.1L6 5.9m0 0v2.5M4.7 6.5h2.6M4.7 7.9h2.6" stroke="#A66F00" stroke-width=".9" stroke-linecap="round"/></svg>
                积分中心
              </button>
              <span class="ap-right">
                <span>{{ isMainAccount ? `共 ${switchableList.length + 1} 个账号` : (accountState.subMutual && !accountState.mainControl ? '互看模式' : '') }}</span>
                <button class="ap-reset" :class="{ show: !isMainAccount }" type="button" title="切换到主账号并刷新视图" @click.stop="onResetMain">
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6a4 4 0 1 0 1.2-2.85M2 2.5v2h2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  返回主账号
                </button>
              </span>
            </div>
          </div>
          <button class="account-settings-btn" v-if="isMainAccount" title="子账号设置" @click="openSettings">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            设置
          </button>
        </div>
      </div>

      <div class="chat-body" ref="streamEl" @scroll="onStreamScroll">
        <template v-if="view">
          <!-- 开场白空态 -->
          <div v-if="!view.messages.length" class="empty-state">
            <div class="empty-inner">
              <div class="welcome-header">
                <div class="welcome-title">雷达AI · 跨境电商选品 Agent</div>
                <div class="welcome-sub">懂数据、会选品、深调研、精分析</div>
              </div>
              <div class="welcome-tabs">
                <button class="welcome-tab" :class="{ active: welcomeTab === 'expert' }" @click="welcomeTab = 'expert'">专家</button>
                <button class="welcome-tab" :class="{ active: welcomeTab === 'skill' }" @click="welcomeTab = 'skill'">技能</button>
              </div>
              <div v-if="welcomeTab === 'expert'" class="welcome-experts">
                <div v-for="exp in welcomeExperts" :key="exp.platform" class="welcome-card" :class="'wc-' + exp.platform">
                  <div class="wc-icon" :class="'wci-' + exp.platform">{{ exp.icon }}</div>
                  <div class="wc-name">{{ exp.name }}</div>
                  <div class="wc-desc">{{ exp.desc }}</div>
                  <div class="wc-actions">
                    <button class="wc-btn wc-btn-outline" @click="() => openExpertPanel()">查看详情</button>
                    <button class="wc-btn wc-btn-primary" @click="() => openExpertPanel()">开始使用</button>
                  </div>
                </div>
              </div>
              <div v-else>
                <!-- 技能筛选行 -->
                <div class="welcome-filters">
                  <div class="welcome-filter-row">
                    <span class="welcome-filter-label">平台</span>
                    <button v-for="p in welcomePlatforms" :key="p" class="welcome-filter-btn" :class="{ active: welcomePlatform === p }" @click="welcomePlatform = p">{{ p }}</button>
                  </div>
                  <div class="welcome-filter-row">
                    <span class="welcome-filter-label">场景</span>
                    <button v-for="s in welcomeScenes" :key="s" class="welcome-filter-btn" :class="{ active: welcomeScene === s }" @click="welcomeScene = s">{{ s }}</button>
                  </div>
                </div>
                <div class="welcome-experts">
                  <div v-for="skill in welcomeSkills" :key="skill.name" class="welcome-card wc-skill">
                    <div class="wc-icon wci-skill">{{ skill.name[0] }}</div>
                    <div class="wc-name">{{ skill.name }}</div>
                    <div class="wc-desc">{{ skill.desc }}</div>
                    <div class="wc-actions">
                      <button class="wc-btn wc-btn-outline" @click="() => openExpertPanel()">查看详情</button>
                      <button class="wc-btn wc-btn-primary" @click="() => openExpertPanel()">开始使用</button>
                    </div>
                  </div>
                  <div v-if="!welcomeSkills.length" class="welcome-empty">暂无符合条件的技能，请调整筛选条件。</div>
                </div>
              </div>
            </div>
          </div>
          <!-- 消息列表 -->
          <template v-for="(m, i) in view.messages" :key="m.id + '-' + i">
            <MessageBubble :msg="m" :prev="view.messages[i - 1]" />
          </template>
        </template>
        <!-- 加载态 -->
        <div v-if="view && view.loading" class="loading-state" style="padding:40px;text-align:center;color:#909399">消息加载中…</div>
      </div>

      <!-- 回到底部浮动按钮 -->
      <button class="jump-latest" :class="{ show: showJumpLatest }" type="button" title="回到最新消息" aria-label="回到最新消息" @click="scrollToBottom()">
        <span class="jl-ic"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v13M6 12.5l6 6 6-6" stroke="#10ad53" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      </button>

      <Composer :running="running" @send="onSendClick" @stop="stopTask(chatState.activeConvKey)" />
    </div>
  </section>
</template>
