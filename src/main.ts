import { createApp } from 'vue'
import App from './App.vue'
import './styles/global.css'
import { bootstrapDld, setAccountEvents } from './stores/account'
import { initialSelect, onAccountSwitched } from './stores/chat'
import { bindResultCardDelegation, setRightEmpty } from './stores/panel'
import { appState } from './stores/state'
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

bootstrapDld().then(() => {
  // 智能体开场白
  if (appState.dldApps.length) applyAgentOpening(appState.dldApps[0])
  // 积分中心套餐接入真数据
  renderWalletPackagesFromMember()
})
