/* =====================================================
 * 弹窗状态：设置 / 积分中心 / 反馈 / 充值确认
 * 删除确认 / 重命名 / 会话右键菜单 / 输入框右键菜单
 * 页面切换：chat / experts / skills / account / pricing / orders / consume
 * ===================================================== */
import { reactive, watch } from 'vue'
import { authState, openLogin } from './auth'

type PageKey = 'chat' | 'experts' | 'skills' | 'account' | 'pricing' | 'orders' | 'consume'

// 刷新后停留在当前访问页面：页面选择持久化到 localStorage
const LAST_PAGE_KEY = 'dld_last_page'
function restoreLastPage(): PageKey {
  try {
    const p = localStorage.getItem(LAST_PAGE_KEY)
    if (p === 'account' || p === 'orders' || p === 'consume') return authState.logged ? p : 'chat'
    if (p === 'chat' || p === 'experts' || p === 'skills' || p === 'pricing') return p
  } catch (e) {}
  return 'chat'
}

export const modals = reactive({
  settings: false,
  page: restoreLastPage(),
  wallet: false,
  feedback: false,
  feedbackSubmitted: false,
  buyConfirm: false,
  buyPendingPkg: null as any,
  upgradeConfirm: false,
  upgradePayload: null as any,
  deleteConfirm: false,
  deletePendingFn: null as any,
  rename: false,
  renameTarget: null as any,
  renameValue: '',
  convMenu: false,
  convMenuX: 0,
  convMenuY: 0,
  convMenuTarget: null as any,
  inputMenu: false,
  inputMenuX: 0,
  inputMenuY: 0,
  walletBalanceTip: '',
  walletRunsTip: '预计可完成约 <strong>42</strong> 次标准选品分析'
})

// 页面切换持久化：navigatePage 与模板直接赋值（modals.page = 'xxx'）两条路径都兜住
watch(() => modals.page, p => { try { localStorage.setItem(LAST_PAGE_KEY, p) } catch (e) {} })
watch(() => authState.logged, logged => {
  if (logged) return
  modals.wallet = false
  modals.buyConfirm = false
  modals.buyPendingPkg = null
  modals.upgradeConfirm = false
  modals.upgradePayload = null
  if (modals.page === 'account' || modals.page === 'orders' || modals.page === 'consume') modals.page = 'chat'
})

export function openSettings() { modals.settings = true }
export function closeSettings() { modals.settings = false }
export function openWallet() {
  if (!authState.logged) { openLogin('购买积分包'); return }
  modals.wallet = true
  modals.walletRunsTip = ''
}
export function closeWallet() { modals.wallet = false }
export function navigatePage(page: typeof modals.page) {
  if (!authState.logged && (page === 'account' || page === 'orders' || page === 'consume')) {
    openLogin('查看账户信息')
    return
  }
  modals.page = page
  modals.wallet = false
}
export function openPricing() { navigatePage('pricing') }
export function openAccount() { navigatePage('account') }
export function openFeedback() { modals.feedback = true; modals.feedbackSubmitted = false }
export function closeFeedback(submitted: boolean) {
  modals.feedback = false
  modals.feedbackSubmitted = submitted
}
export function openDeleteConfirm(fn: () => void) {
  modals.deletePendingFn = fn
  modals.deleteConfirm = true
}
export function closeDeleteConfirm() {
  modals.deleteConfirm = false
  modals.deletePendingFn = null
}
export function openRename(target: any) {
  modals.renameTarget = target
  modals.renameValue = target.title
  modals.rename = true
}
export function closeRename() {
  modals.rename = false
  modals.renameTarget = null
}
export function openBuyConfirm(pkg: any) {
  if (!authState.logged) { modals.wallet = false; openLogin('购买套餐或积分包'); return }
  modals.buyPendingPkg = pkg
  modals.buyConfirm = true
}
export function closeBuyConfirm() {
  modals.buyConfirm = false
  modals.buyPendingPkg = null
}
export function openUpgradeConfirm(payload: any) {
  if (!authState.logged) { openLogin('升级套餐'); return }
  modals.upgradePayload = payload
  modals.upgradeConfirm = true
}
export function closeUpgradeConfirm() {
  modals.upgradeConfirm = false
  modals.upgradePayload = null
}
export function openConvMenu(target: any, x: number, y: number) {
  modals.convMenuTarget = target
  modals.convMenuX = Math.min(x, window.innerWidth - 190)
  modals.convMenuY = Math.min(y, window.innerHeight - 160)
  modals.convMenu = true
}
export function closeConvMenu() {
  modals.convMenu = false
  modals.convMenuTarget = null
}
export function openInputMenu(x: number, y: number) {
  modals.inputMenuX = Math.min(x, window.innerWidth - 180)
  modals.inputMenuY = Math.min(y, window.innerHeight - 200)
  modals.inputMenu = true
}
export function closeInputMenu() {
  modals.inputMenu = false
}
