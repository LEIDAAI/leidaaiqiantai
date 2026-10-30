<script setup lang="ts">
/* 弹层集合：会话右键菜单 / 子账号设置 / 积分中心 / 积分明细（含日期筛选与分页）/
 * 购买确认 / 反馈 / 删除确认 / 重命名。DOM 类名与文案与原版一致，交互对齐 index.html。 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  modals, closeSettings, closeWallet, openWallet, openLedgerBlock, closeLedger,
  closeFeedback, openDeleteConfirm, closeDeleteConfirm, openRename, closeRename,
  closeBuyConfirm, openBuyConfirm, closeConvMenu
} from '../stores/modals'
import { accountState, saveSubSettings } from '../stores/account'
import { walletState, confirmPay, filteredBuy, filteredConsume } from '../stores/wallet'
import { chatState, togglePin, commitRename, deleteConversation } from '../stores/chat'
import { appState } from '../stores/state'
import { flashToast } from '../utils/common'
import DateRangePicker from './DateRangePicker.vue'

const pad = (n: number) => String(n).padStart(2, '0')
const fmtDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/* ==================== 会话右键菜单 ==================== */
const pinLabel = computed(() => modals.convMenuTarget && modals.convMenuTarget.pinned ? '取消置顶' : '置顶任务')
function onMenu(action: 'pin' | 'rename' | 'delete') {
  const target = modals.convMenuTarget
  closeConvMenu()
  if (!target) return
  if (action === 'pin') {
    togglePin(target)
  } else if (action === 'rename') {
    openRename(target)
  } else if (action === 'delete') {
    if (chatState.runningTasks[target.id]) {
      window.alert('该会话正在生成，请先停止并等待任务结束后再删除。')
      return
    }
    openDeleteConfirm(() => { deleteConversation(target) })
  }
}

/* ==================== 子账号设置 ==================== */
const subMutualSw = ref(false)
const mainControlSw = ref(false)
watch(() => modals.settings, (v) => {
  if (v) {
    subMutualSw.value = accountState.subMutual
    mainControlSw.value = accountState.mainControl
  }
})
// 两种查看方式二选一：开启一个自动关闭另一个
function onSubMutualChange() { if (subMutualSw.value) mainControlSw.value = false }
function onMainControlChange() { if (mainControlSw.value) subMutualSw.value = false }
const subAccounts = computed(() => accountState.accounts.filter(a => a.role === 'sub'))
function onSettingsSave() {
  saveSubSettings(subMutualSw.value, mainControlSw.value)
  closeSettings()
}

/* ==================== 积分中心 ==================== */
const walletBalance = computed(() => appState.totalCoins.toLocaleString())
const walletRuns = computed(() => Math.floor(appState.totalCoins / 24))
function onSelectPkg(p: { selected?: boolean }) {
  walletState.packages.forEach(x => { x.selected = false })
  p.selected = true
}

/* ==================== 积分明细 ==================== */
const ledgerTitle = computed(() => modals.ledgerBlock === 'buy' ? '充值明细' : '消耗明细')
const ledgerSub = computed(() => modals.ledgerBlock === 'buy' ? '购买积分记录' : '对话任务积分消耗记录')
function switchLedgerBlock(block: 'buy' | 'consume') {
  modals.ledgerBlock = block
  walletState.blockPages[block] = 1
}

const CONSUME_CHIPS = [
  { key: 'today', label: '今天' },
  { key: '7d', label: '7天' },
  { key: '30d', label: '30天' }
]
function applyConsumeRange(key: string) {
  const end = new Date()
  const start = new Date(end)
  if (key === '7d') start.setDate(start.getDate() - 6)
  else if (key === '30d') start.setDate(start.getDate() - 29)
  walletState.consumeRange.start = fmtDay(start)
  walletState.consumeRange.end = fmtDay(end)
  walletState.consumeChip = key
}
function onChip(key: string) {
  applyConsumeRange(key)
  walletState.blockPages.consume = 1
}
function onConsumeRangeChange() {
  walletState.consumeChip = '' // 手动选区间/清除后取消 chips 高亮
  walletState.blockPages.consume = 1
}

// 分页（computed 内只做显示层 clamp，写回 state 由点击处理负责）
const buyFiltered = computed(() => filteredBuy())
const buyPage = computed(() => {
  const list = buyFiltered.value
  const total = Math.max(1, Math.ceil(list.length / walletState.pageSize))
  const cur = Math.min(Math.max(walletState.blockPages.buy || 1, 1), total)
  return {
    total, cur, count: list.length,
    coins: list.reduce((s, x) => s + (x.amount > 0 ? x.amount : 0), 0).toLocaleString(),
    slice: list.slice((cur - 1) * walletState.pageSize, cur * walletState.pageSize)
  }
})
const consumeFiltered = computed(() => filteredConsume())
const consumePage = computed(() => {
  const list = consumeFiltered.value
  const total = Math.max(1, Math.ceil(list.length / walletState.pageSize))
  const cur = Math.min(Math.max(walletState.blockPages.consume || 1, 1), total)
  return {
    total, cur, count: list.length,
    coins: list.reduce((s, x) => s + Number(x.coins || 0), 0).toLocaleString(),
    slice: list.slice((cur - 1) * walletState.pageSize, cur * walletState.pageSize)
  }
})
function setBuyPage(p: number) { walletState.blockPages.buy = p }
function setConsumePage(p: number) { walletState.blockPages.consume = p }

/* ==================== 购买确认 ==================== */
const pendingPkg = computed(() => modals.buyPendingPkg)
const confirmPkgText = computed(() => pendingPkg.value ? (pendingPkg.value.name || '充值包') : '')
const confirmCoinsText = computed(() => pendingPkg.value ? '+' + Number(pendingPkg.value.coins || 0).toLocaleString() : '')
const confirmPriceText = computed(() => {
  if (!pendingPkg.value) return ''
  return pendingPkg.value.price ? '¥' + pendingPkg.value.price : '价格待定'
})
function onPay() {
  if (!modals.buyPendingPkg) return
  confirmPay(modals.buyPendingPkg)
  closeBuyConfirm()
}

/* ==================== 反馈 ==================== */
const fbContent = ref('')
const fbTextEl = ref<HTMLTextAreaElement | null>(null)
watch(() => modals.feedback, (v) => {
  if (v) {
    fbContent.value = ''
    setTimeout(() => fbTextEl.value && fbTextEl.value.focus(), 60)
  }
})
function onFbSubmit() {
  const content = fbContent.value.trim()
  try {
    localStorage.setItem('dld_ai_feedback_' + Date.now(), JSON.stringify({ type: 'dislike', content, time: new Date().toISOString() }))
  } catch (e) { /* 忽略存储异常 */ }
  console.info('[AI反馈] 本地记录：', content || '（未填写内容）')
  closeFeedback(true)
  flashToast('感谢反馈')
}

/* ==================== 重命名 ==================== */
const renameEl = ref<HTMLInputElement | null>(null)
const renameBusy = ref(false)
watch(() => modals.rename, (v) => {
  if (v) nextTick(() => { renameEl.value && renameEl.value.focus(); renameEl.value && renameEl.value.select() })
})
async function onRenameOk() {
  const target = modals.renameTarget
  if (!target) { closeRename(); return }
  const v = modals.renameValue.trim()
  if (v && v !== target.title) {
    if (renameBusy.value) return
    renameBusy.value = true
    try {
      const ok = await commitRename(target, v)
      if (!ok) return // 失败保持弹窗打开（commitRename 内已 alert）
    } finally { renameBusy.value = false }
  }
  closeRename()
}

/* ==================== 删除确认 ==================== */
function onDeleteOk() {
  const fn = modals.deletePendingFn
  closeDeleteConfirm()
  if (fn) fn()
}

/* ==================== Escape 统一处理 ==================== */
function onEsc(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (modals.ledger) { closeLedger(); openWallet() }
  else if (modals.wallet) closeWallet()
  if (modals.settings) closeSettings()
  if (modals.buyConfirm) closeBuyConfirm()
  if (modals.feedback) closeFeedback(false)
  if (modals.deleteConfirm) closeDeleteConfirm()
  if (modals.rename) closeRename()
}
onMounted(() => {
  document.addEventListener('keydown', onEsc)
  applyConsumeRange('7d') // 默认近7天（对齐原版初始化）
})
onBeforeUnmount(() => document.removeEventListener('keydown', onEsc))
</script>

<template>
  <!-- 会话右键菜单 -->
  <div class="conv-menu" :class="{ open: modals.convMenu }" :style="{ left: modals.convMenuX + 'px', top: modals.convMenuY + 'px' }">
    <div class="cm-item" @click="onMenu('pin')">
      <span class="cm-ic">📌</span>
      <span class="cm-label">{{ pinLabel }}</span>
    </div>
    <div class="cm-item" @click="onMenu('rename')">
      <span class="cm-ic">✎</span>
      <span>重命名</span>
    </div>
    <div class="cm-sep"></div>
    <div class="cm-item danger" @click="onMenu('delete')">
      <span class="cm-ic">🗑</span>
      <span>删除任务</span>
    </div>
  </div>

  <!-- 子账号设置弹窗（仅主账号可见） -->
  <div class="settings-modal" :class="{ open: modals.settings }" role="dialog" aria-modal="true" @click.self="closeSettings">
    <div class="settings-dialog">
      <div class="settings-head">
        <span>🛡</span>
        <div><div class="sh-title">子账号设置</div><div class="sh-sub">主子账号权限与可见范围</div></div>
        <button class="settings-close" aria-label="关闭" @click="closeSettings">×</button>
      </div>
      <div class="settings-body">
        <div class="settings-block">
          <h3>子账号查看权限 <span class="sb-tag">本版本</span></h3>
          <p>子账号设置有以下两种设置方式，根据自己的需求选择：</p>
          <div class="settings-row">
            <div class="sr-text">
              <strong>① 子账号互看</strong>
              <small>开启后子账号之间可以相互切换查看对应账号的页面</small>
            </div>
            <label class="switch">
              <input type="checkbox" v-model="subMutualSw" @change="onSubMutualChange">
              <span class="slider"></span>
            </label>
          </div>
          <div class="settings-row">
            <div class="sr-text">
              <strong>② 主账号控制</strong>
              <small>主账号可切换查看任一账号；子账号不能查看其他账号信息</small>
            </div>
            <label class="switch">
              <input type="checkbox" v-model="mainControlSw" @change="onMainControlChange">
              <span class="slider"></span>
            </label>
          </div>
        </div>
        <div class="settings-block">
          <div class="sl-head">
            <h3>子账号列表</h3>
            <a class="sl-manage" href="https://www.dianleida.net/1688/competeShop/memberCenter/subAccountManagement" target="_blank" rel="noopener" title="前往会员中心管理子账号">管理子账号 ›</a>
          </div>
          <p>主子账号共享积分额度。当前已添加 <strong>{{ subAccounts.length }}</strong> 个子账号。</p>
          <div>
            <div v-for="s in subAccounts" :key="s.id" class="settings-row" style="border-top:1px dashed var(--border-light)">
              <div class="sr-text">
                <strong>{{ s.name }}</strong>
                <small>{{ s.shop }} · {{ s.lastActive }}</small>
              </div>
              <span class="sb-tag">{{ s.roleLabel }}</span>
            </div>
          </div>
          <div class="settings-actions">
            <button @click="closeSettings">取消</button>
            <button class="primary" @click="onSettingsSave">保存设置</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- 积分中心弹窗 -->
  <div class="wallet-modal" :class="{ open: modals.wallet }" role="dialog" aria-modal="true" @click.self="closeWallet">
    <div class="wallet-dialog">
      <div class="wallet-head">
        <span class="wallet-head-icon">🪙</span>
        <div><div class="wh-title">积分中心</div><div class="wh-sub">用于商品搜索、分析与文件处理</div></div>
        <div class="wallet-links">
          <button class="wallet-link buy" @click="closeWallet(); openLedgerBlock('buy')"><span class="wl-ic">+</span>充值明细</button>
          <button class="wallet-link consume" @click="closeWallet(); openLedgerBlock('consume')"><span class="wl-ic">−</span>消耗明细</button>
        </div>
        <button class="wallet-close" aria-label="关闭积分中心" @click="closeWallet">×</button>
      </div>
      <div class="wallet-content">
        <div class="wallet-summary">
          <div><div class="ws-label">当前可用积分</div><div class="ws-balance"><span>{{ walletBalance }}</span> <small>积分</small></div></div>
          <div class="ws-tip">预计可完成约 <strong>{{ walletRuns }}</strong> 次标准选品分析</div>
        </div>
        <div class="wallet-section-title"><span>充值套餐</span><small>{{ walletState.packageTip }}</small></div>
        <div class="wallet-packages">
          <div v-for="(p, i) in walletState.packages" :key="i" class="wallet-package" :class="{ selected: p.selected }" @click="onSelectPkg(p)">
            <div class="wp-name">{{ p.name }}</div>
            <div class="wp-coins">{{ p.coins.toLocaleString() }} 积分</div>
            <div class="wp-price">{{ p.price != null ? '¥' + p.price : '价格待定' }}</div>
            <div class="wp-actions"><button class="wp-action wp-buy" @click.stop="openBuyConfirm(p)">立即购买</button></div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- AI 回复反馈弹窗（点踩 → 提供反馈） -->
  <div class="fb-modal" :class="{ show: modals.feedback }" role="dialog" aria-modal="true" @click.self="closeFeedback(false)">
    <div class="fb-dialog">
      <div class="fb-head">
        <span class="fb-title">提供反馈</span>
        <button class="fb-close" aria-label="关闭" @click="closeFeedback(false)">×</button>
      </div>
      <div class="fb-sub">请告诉我们这次对话结果不符合您需求的原因</div>
      <label class="fb-label" for="fbText">反馈内容</label>
      <textarea id="fbText" ref="fbTextEl" v-model="fbContent" placeholder="描述下结果不满意的原因或者希望我们如何可以改进..."></textarea>
      <div class="fb-foot">
        <button class="fb-btn" @click="closeFeedback(false)">取消</button>
        <button class="fb-btn primary" @click="onFbSubmit">提交</button>
      </div>
    </div>
  </div>

  <!-- 积分明细弹窗（独立页，可按入口切换充值/消耗） -->
  <div class="wallet-modal" :class="{ open: modals.ledger }" role="dialog" aria-modal="true" @click.self="closeLedger">
    <div class="wallet-dialog">
      <div class="wallet-head">
        <button class="wallet-back" aria-label="返回积分中心" @click="closeLedger(); openWallet()">‹</button>
        <div><div class="wh-title">{{ ledgerTitle }}</div><div class="wh-sub">{{ ledgerSub }}</div></div>
        <div class="wallet-links">
          <button class="wallet-link buy" :class="{ active: modals.ledgerBlock === 'buy' }" @click="switchLedgerBlock('buy')"><span class="wl-ic">+</span>充值明细</button>
          <button class="wallet-link consume" :class="{ active: modals.ledgerBlock === 'consume' }" @click="switchLedgerBlock('consume')"><span class="wl-ic">−</span>消耗明细</button>
        </div>
        <button class="wallet-close" aria-label="关闭积分明细" @click="closeLedger">×</button>
      </div>
      <div class="wallet-content">
        <section class="ledger-block" v-show="modals.ledgerBlock === 'buy'">
          <div class="ledger-block-head"><h3>充值明细</h3><small>购买积分记录</small></div>
          <div class="ledger-filter lf-buy">
            <DateRangePicker :range="walletState.buyRange" @change="walletState.blockPages.buy = 1" />
          </div>
          <table class="ledger-table">
            <thead>
              <tr>
                <th style="width:190px">订单号</th>
                <th>充值套餐</th>
                <th style="width:150px">支付时间</th>
                <th style="width:90px">积分数量</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!buyPage.count">
                <td colspan="4" style="text-align:center;padding:24px;color:var(--text-dim)">暂无充值记录</td>
              </tr>
              <tr v-for="item in buyPage.slice" :key="item.id">
                <td class="lt-id">{{ item.id }}</td>
                <td>{{ item.pkg || '—' }}</td>
                <td>{{ item.time }}</td>
                <td class="lt-amount" :class="item.amount >= 0 ? 'plus' : 'minus'">{{ item.amount >= 0 ? '+' : '' }}{{ item.amount.toLocaleString() }}</td>
              </tr>
            </tbody>
          </table>
          <div class="ledger-summary">
            <div class="ls-total">共 <strong>{{ buyPage.count }}</strong> 条 · 累计 <strong>{{ buyPage.coins }}</strong> 积分</div>
            <div class="ledger-pager">
              <button :disabled="buyPage.cur <= 1" @click="setBuyPage(buyPage.cur - 1)">‹</button>
              <button v-for="i in buyPage.total" :key="i" :class="{ active: i === buyPage.cur }" @click="setBuyPage(i)">{{ i }}</button>
              <button :disabled="buyPage.cur >= buyPage.total" @click="setBuyPage(buyPage.cur + 1)">›</button>
            </div>
          </div>
        </section>

        <section class="ledger-block" v-show="modals.ledgerBlock === 'consume'">
          <div class="ledger-block-head"><h3>消耗明细</h3><small>对话任务积分消耗记录</small></div>
          <div class="ledger-filter lf-consume">
            <div class="lf-chips">
              <button v-for="c in CONSUME_CHIPS" :key="c.key" class="chip" :class="{ active: walletState.consumeChip === c.key }" type="button" @click="onChip(c.key)">{{ c.label }}</button>
            </div>
            <DateRangePicker :range="walletState.consumeRange" @change="onConsumeRangeChange" />
          </div>
          <table class="ledger-table">
            <thead>
              <tr>
                <th>对话记录</th>
                <th style="width:150px">创建时间</th>
                <th style="width:160px">来源对话</th>
                <th style="width:90px">积分消耗</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!consumePage.count">
                <td colspan="4" style="text-align:center;padding:24px;color:var(--text-dim)">暂无消耗记录</td>
              </tr>
              <tr v-for="(item, i) in consumePage.slice" :key="i">
                <td class="ct-msg" :title="item.title">{{ item.title }}</td>
                <td>{{ item.time }}</td>
                <td><span class="conv-tag" :title="'来源会话：' + item.conv"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg><b>{{ item.conv }}</b></span></td>
                <td class="lt-amount minus">{{ item.coins.toLocaleString() }}</td>
              </tr>
            </tbody>
          </table>
          <div class="ledger-summary">
            <div class="ls-total">共 <strong>{{ consumePage.count }}</strong> 条 · 累计消耗 <strong>{{ consumePage.coins }}</strong> 积分</div>
            <div class="ledger-pager">
              <button :disabled="consumePage.cur <= 1" @click="setConsumePage(consumePage.cur - 1)">‹</button>
              <button v-for="i in consumePage.total" :key="i" :class="{ active: i === consumePage.cur }" @click="setConsumePage(i)">{{ i }}</button>
              <button :disabled="consumePage.cur >= consumePage.total" @click="setConsumePage(consumePage.cur + 1)">›</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>

  <!-- 购买确认弹窗 -->
  <div class="confirm-modal" :class="{ open: modals.buyConfirm }" role="dialog" aria-modal="true" @click.self="closeBuyConfirm">
    <div class="confirm-dialog">
      <div class="confirm-head">
        <span class="ci-ic">🪙</span>
        <div>
          <div class="ci-title">确认充值</div>
          <div class="ci-sub">演示环境，余额仅供前端验证使用</div>
        </div>
      </div>
      <div class="confirm-body">
        <div class="confirm-row"><span>套餐名称</span><strong>{{ confirmPkgText }}</strong></div>
        <div class="confirm-row"><span>获得积分</span><span class="cr-amount">{{ confirmCoinsText }}</span></div>
        <div class="confirm-row"><span>支付金额</span><span class="cr-price">{{ confirmPriceText }}</span></div>
        <div class="confirm-row"><span>支付方式</span><strong>微信支付</strong></div>
      </div>
      <div class="confirm-foot">
        <button @click="closeBuyConfirm">取消</button>
        <button class="primary" @click="onPay">确认支付</button>
      </div>
    </div>
  </div>

  <!-- 删除会话确认弹窗 -->
  <div class="confirm-modal" :class="{ open: modals.deleteConfirm }" role="dialog" aria-modal="true" @click.self="closeDeleteConfirm">
    <div class="confirm-card">
      <div class="cf-head">
        <span class="cf-ic">!</span>
        <span class="cf-title">确认删除</span>
        <button class="cf-close" type="button" aria-label="关闭" @click="closeDeleteConfirm">×</button>
      </div>
      <p class="cf-text">删除后，这个会话及其所有内容将从本地或云端移除，且无法恢复。</p>
      <div class="cf-actions">
        <button class="cf-btn cf-cancel" type="button" @click="closeDeleteConfirm">取消</button>
        <button class="cf-btn cf-danger" type="button" @click="onDeleteOk">删除</button>
      </div>
    </div>
  </div>

  <!-- 重命名弹窗 -->
  <div class="confirm-modal" :class="{ open: modals.rename }" role="dialog" aria-modal="true" @click.self="closeRename">
    <div class="confirm-card">
      <div class="cf-head">
        <span class="cf-title">重命名</span>
        <button class="cf-close" type="button" aria-label="关闭" @click="closeRename">×</button>
      </div>
      <input ref="renameEl" v-model="modals.renameValue" class="rn-input" type="text" maxlength="50" placeholder="请输入新的任务名称" @keydown.enter="onRenameOk" @keydown.esc="closeRename">
      <div class="cf-actions">
        <button class="cf-btn cf-cancel" type="button" @click="closeRename">取消</button>
        <button class="cf-btn cf-primary" type="button" @click="onRenameOk">确认</button>
      </div>
    </div>
  </div>
</template>
