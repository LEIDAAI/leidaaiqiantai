<script setup lang="ts">
/* 弹层集合：会话右键菜单 / 子账号设置 / 积分中心 / 购买确认 / 反馈 / 删除确认 / 重命名。
 * DOM 类名与文案与原版一致，交互对齐 index.html。 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  modals, closeSettings, closeWallet,
  closeFeedback, openDeleteConfirm, closeDeleteConfirm, openRename, closeRename,
  closeBuyConfirm, openBuyConfirm, closeConvMenu, openAccount
} from '../stores/modals'
import { accountState, saveSubSettings } from '../stores/account'
import { walletState, confirmPay } from '../stores/wallet'
import { chatState, togglePin, commitRename, deleteConversation } from '../stores/chat'
import { appState } from '../stores/state'
import { flashToast } from '../utils/common'

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

/* ==================== 积分中心（双栏购买页） ==================== */
const walletBalance = computed(() => appState.totalCoins.toLocaleString())
// 购买账号：主账号掩码手机号
const buyAccount = computed(() => {
  const main = accountState.accounts.find(a => a.role === 'main')
  return main ? main.phone : '176****6666'
})
function onSelectPkg(p: { selected?: boolean }) {
  walletState.packages.forEach(x => { x.selected = false })
  p.selected = true
}
// 自定义积分包：拖动滑块即切换为自定义模式（3万—10万，步进1万）
const customCoins = ref(50000)
const CUSTOM_RATE = 0.015 // 演示单价：元/积分
const customPrice = computed(() => Math.round(customCoins.value * CUSTOM_RATE))
function onCustomSlide() {
  walletState.packages.forEach(x => { x.selected = false })
}
const payMethod = ref<'微信支付' | '支付宝支付'>('微信支付')
// 当前订单：选中的固定包，否则为自定义包
const activePkg = computed(() => walletState.packages.find(p => p.selected) || null)
const activeCoins = computed(() => activePkg.value ? activePkg.value.coins : customCoins.value)
const activePrice = computed(() => activePkg.value ? (activePkg.value.price || 0) : customPrice.value)
const activeOriginPrice = computed(() => activePrice.value * 2)
const activeDiscount = computed(() => activeOriginPrice.value - activePrice.value)
// 有效期：购买起 365 天，到期次日清零
function fmtDay(ms: number) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const expireDate = computed(() => fmtDay(Date.now() + 365 * 864e5))
const clearDate = computed(() => fmtDay(Date.now() + 366 * 864e5))
function onBuy() {
  openBuyConfirm({
    name: activePkg.value ? activePkg.value.name : `自定义积分包（${customCoins.value.toLocaleString()} 积分）`,
    coins: activeCoins.value,
    price: activePrice.value,
    pay: payMethod.value
  })
}
function goBenefits() { openAccount() } // navigatePage 内部会关闭积分中心

/* ==================== 购买确认 ==================== */
const pendingPkg = computed(() => modals.buyPendingPkg)
const confirmPkgText = computed(() => pendingPkg.value ? (pendingPkg.value.name || '充值包') : '')
const confirmCoinsText = computed(() => pendingPkg.value ? '+' + Number(pendingPkg.value.coins || 0).toLocaleString() : '')
/* ==================== 订单支付（扫码支付） ==================== */
const paySeconds = ref(15 * 60)
let payTimer: number | null = null
const payCountdownText = computed(() => Math.floor(paySeconds.value / 60) + ':' + String(paySeconds.value % 60).padStart(2, '0'))
const payOrderNo = ref('')
const payType = computed(() => (pendingPkg.value?.pay || '微信支付').includes('支付宝') ? '支付宝' : '微信')
const payExpireText = computed(() => {
  const d = new Date(Date.now() + 365 * 864e5)
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
})
function startPayTimer() {
  stopPayTimer()
  paySeconds.value = 15 * 60
  payOrderNo.value = String(Date.now()) + String(Math.floor(Math.random() * 1e6)).padStart(6, '0')
  payTimer = window.setInterval(() => {
    paySeconds.value--
    if (paySeconds.value <= 0) {
      closeBuyConfirm()
      flashToast('支付超时，订单已自动取消')
    }
  }, 1000)
}
function stopPayTimer() { if (payTimer) { clearInterval(payTimer); payTimer = null } }
watch(() => modals.buyConfirm, v => {
  if (v) { startPayTimer(); nextTick(drawPayQr) } else stopPayTimer()
})
/* 演示二维码：确定性伪随机点阵 + 三角定位标 + 微信/支付宝中心 logo */
function drawPayQr() {
  const cv = document.getElementById('payQrCanvas') as HTMLCanvasElement | null
  if (!cv) return
  const ctx = cv.getContext('2d')
  if (!ctx) return
  const N = 29, S = cv.width / N
  let seed = 0
  for (const ch of payOrderNo.value) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0
  const rand = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296 }
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height)
  ctx.fillStyle = '#1f2329'
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const inFinder = (x < 8 && y < 8) || (x > N - 9 && y < 8) || (x < 8 && y > N - 9)
    const inLogo = x > 10 && x < 18 && y > 10 && y < 18
    if (!inFinder && !inLogo && rand() > 0.52) ctx.fillRect(x * S, y * S, S, S)
  }
  const finder = (fx: number, fy: number) => {
    ctx.fillStyle = '#1f2329'; ctx.fillRect(fx * S, fy * S, 7 * S, 7 * S)
    ctx.fillStyle = '#fff'; ctx.fillRect((fx + 1) * S, (fy + 1) * S, 5 * S, 5 * S)
    ctx.fillStyle = '#1f2329'; ctx.fillRect((fx + 2) * S, (fy + 2) * S, 3 * S, 3 * S)
  }
  finder(0, 0); finder(N - 7, 0); finder(0, N - 7)
  const c = cv.width / 2, r = 2.6 * S
  ctx.fillStyle = payType.value === '支付宝' ? '#1677ff' : '#00a83e'
  ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold ' + Math.round(2.4 * S) + 'px sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(payType.value === '支付宝' ? '支' : '微', c, c + 1)
}
/* 演示：点击二维码模拟支付成功（真实链路走 confirmPay 记账 + toast） */
function onQrPaid() {
  if (!modals.buyPendingPkg) return
  stopPayTimer()
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
  if (modals.wallet) closeWallet()
  if (modals.settings) closeSettings()
  if (modals.buyConfirm) closeBuyConfirm()
  if (modals.feedback) closeFeedback(false)
  if (modals.deleteConfirm) closeDeleteConfirm()
  if (modals.rename) closeRename()
}
onMounted(() => {
  document.addEventListener('keydown', onEsc)
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

  <!-- 积分中心弹窗（双栏购买页） -->
  <div class="wallet-modal" :class="{ open: modals.wallet }" role="dialog" aria-modal="true" @click.self="closeWallet">
    <div class="wallet-dialog">
      <!-- 顶部品牌渐变头 -->
      <div class="wx-head">
        <div class="wx-user">
          <div class="wx-avatar">雷</div>
          <div class="wx-user-info">
            <div class="wx-user-name">{{ buyAccount }} <span class="wx-plan-badge">{{ walletState.currentPackage }}</span></div>
            <div class="wx-user-sub">当前可用 <strong>{{ walletBalance }}</strong> 积分</div>
          </div>
        </div>
        <button class="wx-benefits" @click="goBenefits">查看全部权益 ›</button>
        <button class="wallet-close" aria-label="关闭积分中心" @click="closeWallet">×</button>
      </div>
      <div class="wx-body">
        <!-- 左栏：购买积分包 -->
        <div class="wx-left">
          <div class="wx-sec-title">购买积分包</div>
          <div class="wx-packs">
            <div v-for="(p, i) in walletState.packages" :key="i" class="wx-pack" :class="{ selected: p.selected }" @click="onSelectPkg(p)">
              <span class="wx-pack-badge">12个月</span>
              <div class="wx-pack-name">{{ p.name }}</div>
              <div class="wx-pack-coins">{{ p.coins.toLocaleString() }}<small> 积分</small></div>
              <div class="wx-pack-price">{{ p.price != null ? '¥' + p.price : '价格待定' }}</div>
              <span v-if="p.selected" class="wx-pack-check">✓</span>
            </div>
          </div>
          <div class="wx-custom" :class="{ active: !activePkg }">
            <div class="wx-custom-head">
              <span>自定义积分包</span>
              <span class="wx-custom-val">{{ customCoins.toLocaleString() }} 积分 · ¥{{ customPrice }}</span>
            </div>
            <input class="wx-slider" type="range" min="30000" max="100000" step="10000" v-model.number="customCoins" @input="onCustomSlide" aria-label="自定义积分数量">
            <div class="wx-scale"><span>3万</span><span>5万</span><span>7.5万</span><span>10万</span></div>
          </div>
          <div class="wx-expire">🗓 积分包有效期至 {{ expireDate }}（购买后 365 天内有效，到期未使用部分次日清零）</div>
          <div class="wx-sec-title" style="margin-top:16px">支付方式</div>
          <div class="wx-pays">
            <button type="button" class="wx-pay" :class="{ active: payMethod === '微信支付' }" @click="payMethod = '微信支付'">
              <span class="wx-pay-ic wx-pay-wx">微</span>微信支付
            </button>
            <button type="button" class="wx-pay" :class="{ active: payMethod === '支付宝支付' }" @click="payMethod = '支付宝支付'">
              <span class="wx-pay-ic wx-pay-zfb">支</span>支付宝支付
            </button>
          </div>
        </div>
        <!-- 右栏：订单详情 -->
        <div class="wx-right">
          <div class="wx-sec-title">订单详情</div>
          <div class="wx-order">
            <div class="wx-orow"><span>购买账号</span><strong>{{ buyAccount }}</strong></div>
            <div class="wx-orow"><span>订单类型</span><strong>积分加油包</strong></div>
            <div class="wx-orow"><span>套餐名称</span><strong>{{ activePkg ? activePkg.name : '自定义积分包' }}</strong></div>
            <div class="wx-orow"><span>获得</span><strong class="wx-green">+{{ activeCoins.toLocaleString() }} 积分</strong></div>
            <div class="wx-orow"><span>生效时间</span><strong>支付成功后立即生效</strong></div>
            <div class="wx-orow"><span>到期日期</span><strong>{{ expireDate }}</strong></div>
            <div class="wx-orow"><span>清零日期</span><strong>{{ clearDate }}</strong></div>
          </div>
          <div class="wx-amounts">
            <div class="wx-orow"><span>订单原价</span><span>¥{{ activeOriginPrice }}</span></div>
            <div class="wx-orow"><span>优惠金额</span><span class="wx-green">-¥{{ activeDiscount }}</span></div>
            <div class="wx-orow"><span>应付金额</span><strong>¥{{ activePrice }}</strong></div>
          </div>
          <button type="button" class="wx-pay-btn" @click="onBuy">确认支付 ¥{{ activePrice }}</button>
          <div class="wx-agree">支付即代表同意<a>《服务协议》</a>与<a>《付费授权协议》</a></div>
          <div class="wx-note">虚拟商品，一经售出不支持退款</div>
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

  <!-- 订单支付弹窗（扫码支付） -->
  <div class="confirm-modal" :class="{ open: modals.buyConfirm }" role="dialog" aria-modal="true" @click.self="closeBuyConfirm">
    <div class="pay-dialog">
      <div class="pay-head">
        <span class="pay-title">订单支付</span>
        <button class="pay-close" type="button" aria-label="关闭" @click="closeBuyConfirm">×</button>
      </div>
      <div class="pay-amount-line">支付金额：<strong class="pay-amount">¥{{ pendingPkg ? Number(pendingPkg.price || 0).toFixed(2) : '0.00' }}</strong></div>
      <div class="pay-count-line">剩余支付时间 <b :class="{ 'pay-urgent': paySeconds <= 60 }">{{ payCountdownText }}</b>，否则订单将自动取消！</div>
      <div class="pay-body">
        <div class="pay-qr-wrap">
          <canvas id="payQrCanvas" class="pay-qr" width="220" height="220" title="演示环境：点击二维码模拟支付成功" @click="onQrPaid"></canvas>
          <div class="pay-qr-tip">▦ 打开手机{{ payType }}扫一扫继续付款</div>
          <div class="pay-qr-demo">（演示：点击二维码模拟支付成功）</div>
        </div>
        <div class="pay-info">
          <div class="pi-row"><span>订单号码：</span><span>{{ payOrderNo }}</span></div>
          <div class="pi-row"><span>购买账号：</span><span>{{ buyAccount }}</span></div>
          <div class="pi-row"><span>订单类型：</span><span>购买加油包</span></div>
          <div class="pi-row"><span>购买套餐：</span><span>{{ confirmPkgText }}</span></div>
          <div class="pi-row"><span>获　　得：</span><span>{{ confirmCoinsText.replace('+', '') }} 积分</span></div>
          <div class="pi-row"><span>生效日期：</span><span>立即生效</span></div>
          <div class="pi-row"><span>到期时间：</span><span>{{ payExpireText }}</span></div>
        </div>
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
