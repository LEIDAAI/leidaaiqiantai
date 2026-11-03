import { createApp } from 'vue'
import App from './App.vue'
import './styles/global.css'
import { bootstrapDld, setAccountEvents, accountState } from './stores/account'
import { chatState, initialSelect, onAccountSwitched } from './stores/chat'
import { bindResultCardDelegation, setRightEmpty } from './stores/panel'
import { appState, readCachedSessions } from './stores/state'
import { applyAgentOpening } from './stores/opening'
import { renderWalletPackagesFromMember } from './stores/wallet'

const app = createApp(App)
app.mount('#app')

// 结果卡片点击委托（报告卡 / 商品预览卡 / 中栏表格"查看更多"）
bindResultCardDelegation()

// 首次进入保持右栏空态；历史会话加载完成后允许恢复缓存预览
setRightEmpty(true)
appState.initialPreviewGuard = false

setAccountEvents({
  onAccountSwitched: () => onAccountSwitched(),
  onConversationsLoaded: (list, skipSelect) => {
    void list
    if (!skipSelect) initialSelect()
  }
})

const boot = bootstrapDld()

// 刷新后先用本地缓存即时恢复上次打开的会话（不等接口），
// 消除"接口返回前停留在新建对话首页"的闪现；接口返回后
// onConversationsLoaded → initialSelect 会再校正一次。
try {
  const acc = accountState.currentAccountId
  const cached = readCachedSessions(acc)
  if (cached.length && !chatState.activeConvKey) {
    accountState.sessionsByAccount[acc] = cached
    initialSelect()
  }
} catch (e) {}

boot.then(() => {
  // 智能体开场白
  if (appState.dldApps.length) applyAgentOpening(appState.dldApps[0])
  // 积分中心套餐接入真数据
  renderWalletPackagesFromMember()
})
