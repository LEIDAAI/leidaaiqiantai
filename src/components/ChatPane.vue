<script setup lang="ts">
/* 中栏：hero 首页（空态）或对话详情（头部+消息流+Composer） */
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import MessageBubble from './MessageBubble.vue'
import Composer from './Composer.vue'
import {
  chatState, activeView, isRunning, stopTask, newConversation
} from '../stores/chat'
import { appState } from '../stores/state'
import { accountState, currentAccount, isMainAccount, switchAccount, resetToMain, getSwitchableAccounts } from '../stores/account'
import { openSettings, openWallet, modals, openFeedback, openPricing, openAccount } from '../stores/modals'
import { resetRightPreview } from '../stores/panel'
import { PERSON_SVG } from './svg'
import { expertState, type ExpertItem, type SkillItem } from '../stores/expert'

const streamEl = ref<HTMLElement | null>(null)
const showJumpLatest = ref(false)
const view = activeView

/* —— hero 首页 —— */
const chatHero = computed(() => !view.value || view.value.messages.length === 0)
const homeTab = ref<'expert' | 'skill'>('expert')
const homeChip = ref('推荐')
const homePlatform = ref('全部')
const homePlatforms = ['全部', '1688', 'OZON', '亚马逊', 'TEMU']
const platformAliases: Record<string, string[]> = { 'OZON': ['Ozon', 'OZON'], 'TEMU': ['Temu', 'TEMU'] }
const matchesHomePlatform = (item: ExpertItem | SkillItem) => {
  if (homePlatform.value === '全部') return true
  if ('platform' in item) return (platformAliases[homePlatform.value] || [homePlatform.value]).includes(item.platform)
  return item.tags.some(tag => (platformAliases[homePlatform.value] || [homePlatform.value]).includes(tag))
}
const homeScenarios = computed(() => {
  const list = homeTab.value === 'skill' ? expertState.skills : expertState.experts
  const values = list.filter(item => matchesHomePlatform(item)).map(item => 'platform' in item ? item.category : item.scenario).filter(Boolean) as string[]
  return ['推荐', ...Array.from(new Set(values))]
})
const homeExperts = computed(() => {
  const list = expertState.experts.filter(e => e.source === 'official' && matchesHomePlatform(e))
  if (homeChip.value === '推荐') return list.slice(0, 6)
  return list.filter(e => e.category === homeChip.value || e.tags.includes(homeChip.value)).slice(0, 9)
})
const homeSkills = computed(() => {
  const list = expertState.skills.filter(s => s.source === 'official' && matchesHomePlatform(s))
  if (homeChip.value === '推荐') return list.slice(0, 6)
  return list.filter(s => s.scenario === homeChip.value || s.tags.includes(homeChip.value)).slice(0, 9)
})
function selectHomePlatform(value: string) {
  homePlatform.value = value
  if (!homeScenarios.value.includes(homeChip.value)) homeChip.value = '推荐'
}
/* —— hero 卡片分页：每页 2 行 6 张，超出左右翻页 —— */
const HOME_PAGE_SIZE = 6
const homePage = ref(0)
const homeActiveList = computed(() => homeTab.value === 'expert' ? homeExperts.value : homeSkills.value)
const homePageCount = computed(() => Math.max(1, Math.ceil(homeActiveList.value.length / HOME_PAGE_SIZE)))
const pagedExperts = computed(() => homeExperts.value.slice(homePage.value * HOME_PAGE_SIZE, (homePage.value + 1) * HOME_PAGE_SIZE))
const pagedSkills = computed(() => homeSkills.value.slice(homePage.value * HOME_PAGE_SIZE, (homePage.value + 1) * HOME_PAGE_SIZE))
watch([homeTab, homeChip, homePlatform], () => { homePage.value = 0 })
function prevHomePage() { if (homePage.value > 0) homePage.value-- }
function nextHomePage() { if (homePage.value < homePageCount.value - 1) homePage.value++ }
const caseItem = ref<ExpertItem | SkillItem | null>(null)
const isCaseSkill = computed(() => !!caseItem.value && 'version' in caseItem.value)
function useExpert(e: ExpertItem) { chatState.inputText = e.prompts?.[0] || e.desc }
function useSkill(s: SkillItem) { chatState.inputText = s.instructions || s.desc }
const platformColor: Record<string, string> = { '1688': '#ff6a00', 'Ozon': '#005bff', '亚马逊': '#ff9900', 'Temu': '#fb7701' }
const platformInitial: Record<string, string> = { '1688': '1688', 'Ozon': 'O', '亚马逊': 'A', 'Temu': 'T' }

/* —— 会话滚动 —— */
watch(() => chatState.activeConvKey, (nv, ov) => {
  if (ov && nv && ov !== nv) {
    try { resetRightPreview() } catch (e) {}
  }
  nextTick(() => scrollToBottom(false))
})
watch(() => {
  const v = view.value
  if (!v) return 0
  const last = v.messages[v.messages.length - 1]
  return v.messages.length + (last ? (last.liveText.length + (last.finalHtml ? 1 : 0) + (last.phase === 'done' ? 1 : 0)) : 0)
}, () => { followBottom() })
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
function togglePopover(e: Event) { e.stopPropagation(); popoverOpen.value = !popoverOpen.value }
function closePopover() { popoverOpen.value = false }
function onSwitchAccount(id: string) { closePopover(); switchAccount(id) }
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
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
const switchableList = computed(() => getSwitchableAccounts().filter(a => a.id !== currentAccount.value.id))
const accountNameShort = computed(() => {
  const n = currentAccount.value.name
  return n.length > 10 ? n.slice(0, 10) + '…' : n
})
const coinText = computed(() => appState.totalCoins.toLocaleString())

/* —— 发送/停止 —— */
const running = computed(() => isRunning.value)
function onSendClick() {
  if (chatState.activeConvKey && chatState.runningTasks[chatState.activeConvKey]) {
    stopTask(chatState.activeConvKey)
    return
  }
  send()
}
</script>

<template>
  <section class="col-mid" :class="{ 'is-hero': chatHero }">
    <!-- ============ hero 首页 ============ -->
    <div v-if="chatHero" class="chat-card hero-card">
      <div class="home-top">
        <button class="home-icon-btn" title="设置" @click="openSettings">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
        <button class="home-plan-btn" @click="openPricing">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
          套餐购买
        </button>
        <button class="home-avatar" title="个人中心" @click="openAccount">
          <span v-html="PERSON_SVG"></span>
        </button>
      </div>

      <div class="home-scroll">
        <div class="home-hero">
          <div class="home-hero-head">
            <h1 class="home-title">你好，今天想聊点什么？</h1>
            <div class="home-mode">
              <button :class="{ on: homeTab === 'expert' }" @click="homeTab = 'expert'; homeChip = '推荐'">专家</button>
              <button :class="{ on: homeTab === 'skill' }" @click="homeTab = 'skill'; homeChip = '推荐'">技能</button>
            </div>
          </div>
          <div class="home-sec">
            <div class="home-seg-row">
              <div class="seg-track">
                <button v-for="p in homePlatforms" :key="p" class="seg-btn" :class="{ on: homePlatform === p }" @click="selectHomePlatform(p)">
                  <span v-if="p !== '全部'" class="seg-dot" :style="{ background: platformColor[p === 'OZON' ? 'Ozon' : p === 'TEMU' ? 'Temu' : p] || '#00A83E' }"></span>{{ p }}
                </button>
              </div>
            </div>
            <div class="home-tabs">
              <button v-for="c in homeScenarios" :key="c" class="home-chip" :class="{ on: homeChip === c }" @click="homeChip = c">{{ c }}</button>
            </div>
            <div class="home-pager">
              <button v-if="homePageCount > 1" class="hp-arrow prev" :disabled="homePage === 0" aria-label="上一页" @click="prevHomePage"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
              <div class="home-grid">
              <template v-if="homeTab === 'expert'">
                <div v-for="e in pagedExperts" :key="e.id" class="home-card">
                  <div class="hc-head">
                    <span class="hc-ava" :style="{ background: platformColor[e.platform] || '#00A83E' }">{{ platformInitial[e.platform] || 'E' }}</span>
                    <div class="hc-meta">
                      <div class="hc-name">{{ e.name }}</div>
                      <div class="hc-tags">{{ e.platform }} · {{ e.category }}</div>
                    </div>
                  </div>
                  <div class="hc-desc">{{ e.desc }}</div>
                  <div class="hc-foot">
                    <button class="hc-btn ghost" @click="caseItem = e">看案例</button>
                    <button class="hc-btn main" @click="useExpert(e)">立即使用</button>
                  </div>
                </div>
              </template>
              <template v-else>
                <div v-for="s in pagedSkills" :key="s.id" class="home-card skill">
                  <div class="hc-head">
                    <span class="hc-icon">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg>
                    </span>
                    <div class="hc-meta">
                      <div class="hc-name">{{ s.name }}</div>
                      <div class="hc-tags">{{ s.scenario || '通用' }} · v{{ s.version }}</div>
                    </div>
                  </div>
                  <div class="hc-desc">{{ s.desc }}</div>
                  <div class="hc-foot">
                    <button class="hc-btn main full" @click="useSkill(s)">前往使用 →</button>
                  </div>
                </div>
              </template>
              </div>
              <button v-if="homePageCount > 1" class="hp-arrow next" :disabled="homePage >= homePageCount - 1" aria-label="下一页" @click="nextHomePage"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>
            </div>
          </div>
        </div>
      </div>

      <div class="home-bottom">
        <Composer :running="false" @send="onSendClick" @stop="() => {}" />
        <div class="home-disclaimer">内容由AI大模型生成，请仔细甄别</div>
      </div>

      <div class="home-floats">
        <button class="hf-btn" data-tip="新建对话" @click="newConversation()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        </button>
        <button class="hf-btn" data-tip="用户反馈" @click="openFeedback()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </button>
      </div>

      <!-- 案例弹窗 -->
      <div v-if="caseItem" class="case-mask" @click.self="caseItem = null">
        <div class="case-pop">
          <div class="case-head">
            <div class="case-title">{{ caseItem.name }}</div>
            <button class="case-close" @click="caseItem = null">✕</button>
          </div>
          <div class="case-body">
            <template v-if="!isCaseSkill">
              <div class="case-label">{{ (caseItem as ExpertItem).caseTitle }}</div>
              <div class="case-metrics">
                <div v-for="m in (caseItem as ExpertItem).caseMetrics || []" :key="m.label" class="cm-item">
                  <div class="cm-val">{{ m.value }}</div>
                  <div class="cm-lab">{{ m.label }}</div>
                </div>
              </div>
              <table class="case-table">
                <tbody>
                  <tr v-for="(row, ri) in (caseItem as ExpertItem).caseRows || []" :key="ri">
                    <td v-for="(cell, ci) in row" :key="ci">{{ cell }}</td>
                  </tr>
                </tbody>
              </table>
              <div class="case-conclusion">{{ (caseItem as ExpertItem).caseConclusion }}</div>
              <div class="case-label">试试这样问</div>
              <button v-for="(p, pi) in (caseItem as ExpertItem).prompts || []" :key="pi" class="case-prompt" @click="useExpert(caseItem as ExpertItem); caseItem = null">{{ p }}</button>
            </template>
            <template v-else>
              <div class="case-label">执行步骤</div>
              <ol class="case-steps">
                <li v-for="(st, si) in (caseItem as SkillItem).steps || []" :key="si">{{ st }}</li>
              </ol>
              <div class="case-label">输出示例</div>
              <pre class="case-output">{{ (caseItem as SkillItem).outputExample }}</pre>
              <button class="case-prompt main" @click="useSkill(caseItem as SkillItem); caseItem = null">立即使用该技能</button>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- ============ 对话详情 ============ -->
    <div v-else class="chat-card">
      <div class="chat-head">
        <button class="mb-menu-btn" aria-label="打开会话列表" @click="chatState.mobileSidebar = true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
        </button>
        <span class="title">{{ chatState.chatTitle }}</span>
        <div class="right">
          <span class="account-chip" ref="accountChipEl" :class="{ open: popoverOpen }" title="切换账号" @click="togglePopover">
            <span class="ac-avatar" :class="{ slave: !isMainAccount }" aria-hidden="true" v-html="PERSON_SVG"></span>
            <span>{{ accountNameShort }}</span>
            <span class="ac-phone">{{ currentAccount.phone }}</span>
            <span class="ac-role" :data-role="isMainAccount ? 'main' : 'slave'">{{ currentAccount.roleLabel }}</span>
            <span class="ac-arrow"><svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          </span>
          <span class="coin-chip" title="点击充值积分" role="button" tabindex="0" @click="openWalletFromCoinChip" @keydown.enter="openWalletFromCoinChip">
            <svg class="cc-icon" width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="#FFC53D" stroke="#E8A200" stroke-width="1.2"/><path d="M4.3 3.8 6 5.9m1.7-2.1L6 5.9m0 0v2.5M4.7 6.5h2.6M4.7 7.9h2.6" stroke="#A66F00" stroke-width=".9" stroke-linecap="round"/></svg>
            <span>{{ coinText }}</span>
          </span>
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
          <template v-for="(m, i) in view.messages" :key="m.id + '-' + i">
            <MessageBubble :msg="m" :prev="view.messages[i - 1]" />
          </template>
        </template>
        <div v-if="view && view.loading" class="loading-state" style="padding:40px;text-align:center;color:#909399">消息加载中…</div>
      </div>

      <button class="jump-latest" :class="{ show: showJumpLatest }" type="button" title="回到最新消息" aria-label="回到最新消息" @click="scrollToBottom()">
        <span class="jl-ic"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v13M6 12.5l6 6 6-6" stroke="#10ad53" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      </button>

      <Composer :running="running" @send="onSendClick" @stop="stopTask(chatState.activeConvKey)" />
    </div>
  </section>
</template>
