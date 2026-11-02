<script setup lang="ts">
/* =====================================================
 * 登录弹窗（模拟走通）：验证码 / 密码 / 微信扫码 + 游客模式
 * 布局：遮罩 + 品牌区/表单双栏弹窗；扫码首次为新用户 → 关联注册绑定手机号
 * ===================================================== */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { authState, DEMO, closeLogin, enterAsGuest, registeredPhones, sendSmsCode, loginBySms, loginByPwd, bindWxPhone, tryWxLogin, resetWxBind } from '../stores/auth'
import { flashToast } from '../utils/common'
import { platformLogo } from '../stores/skillVisual'

type View = 'form' | 'qr' | 'bind'
const view = ref<View>('qr')
const tab = ref<'sms' | 'pwd'>('sms')

const phone = ref(''), code = ref(''), pwd = ref(''), registerPwd = ref('')
const isNewPhone = computed(() => /^1\d{10}$/.test(phone.value) && !registeredPhones().includes(phone.value))
const bindPhone = ref(''), bindCode = ref('')
const showPwd = ref(false)
const busy = ref(false)
const err = ref('')

/* ---------- 验证码倒计时（表单 / 绑定共用，同一时刻只有一个视图激活） ---------- */
const cd = ref(0)
let cdTimer: ReturnType<typeof setInterval> | undefined
function startCd() {
  cd.value = 60
  if (cdTimer) clearInterval(cdTimer)
  cdTimer = setInterval(() => { cd.value -= 1; if (cd.value <= 0) { clearInterval(cdTimer!); cdTimer = undefined } }, 1000)
}
async function onSendCode(target: 'form' | 'bind') {
  if (cd.value > 0 || busy.value) return
  const p = target === 'form' ? phone.value : bindPhone.value
  if (!/^1\d{10}$/.test(p)) { err.value = '请输入正确的手机号'; return }
  err.value = ''
  busy.value = true
  const ok = await sendSmsCode(p)
  busy.value = false
  if (ok) startCd()
}

/* ---------- 表单登录 ---------- */
async function submit() {
  if (busy.value) return
  err.value = ''
  busy.value = true
  const msg = tab.value === 'sms'
    ? await loginBySms(phone.value, code.value, registerPwd.value)
    : await loginByPwd(phone.value, pwd.value)
  busy.value = false
  if (msg) err.value = msg
}

/* ---------- 微信扫码模拟：3.2s 后"已扫码"，再 2.2s 出结果 ---------- */
const qrStatus = ref<0 | 1>(0)
let scanT1: ReturnType<typeof setTimeout> | undefined
let scanT2: ReturnType<typeof setTimeout> | undefined
function startScan() {
  stopScan()
  qrStatus.value = 0
  err.value = ''
  scanT1 = setTimeout(() => {
    qrStatus.value = 1
    scanT2 = setTimeout(() => {
      if (!tryWxLogin()) view.value = 'bind' // 未绑定 → 关联注册（手机号必填）
    }, 2200)
  }, 3200)
}
function stopScan() {
  if (scanT1) { clearTimeout(scanT1); scanT1 = undefined }
  if (scanT2) { clearTimeout(scanT2); scanT2 = undefined }
  qrStatus.value = 0
}
function switchView(v: View) {
  view.value = v
  err.value = ''
  if (v === 'qr') startScan()
  else stopScan()
}
async function onBind() {
  if (busy.value) return
  err.value = ''
  busy.value = true
  const msg = await bindWxPhone(bindPhone.value, bindCode.value)
  busy.value = false
  if (msg) err.value = msg
}
function onResetDemo() {
  resetWxBind()
  flashToast('已重置扫码绑定：下次扫码将重新走手机号关联注册')
}

/* ---------- 假二维码（21×21 种子网格 + 三角定位框） ---------- */
const qrCells = computed<boolean[]>(() => {
  const arr: boolean[] = []
  let s = 9527
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280 }
  for (let i = 0; i < 21 * 21; i++) {
    const r = Math.floor(i / 21), c = i % 21
    const corner = (r < 7 && c < 7) || (r < 7 && c > 13) || (r > 13 && c < 7)
    arr.push(corner ? false : rnd() > 0.52)
  }
  return arr
})

onMounted(startScan)
onBeforeUnmount(() => { if (cdTimer) clearInterval(cdTimer); stopScan() })
</script>

<template>
  <div class="login-page" @click.self="closeLogin">
    <div class="lg-dialog">
      <aside class="lg-brand">
        <div class="lg-glow g1"></div><div class="lg-glow g2"></div><div class="lg-glow g3"></div>
        <div class="lg-brand-content">
          <div class="lg-logo"><span class="lg-logo-icon">◈</span><span>雷达AI<small>让电商更简单</small></span></div>
          <div class="lg-hero">
            <h1>全平台电商<br>AI 选品运营工作台</h1>
            <p>从选品分析到运营决策，一个工作台就够了<br>1688 / OZON / 亚马逊 / TEMU</p>
            <div class="lg-platforms">
              <span v-for="p in ['1688', 'OZON', '亚马逊', 'TEMU']" :key="p"><img :src="platformLogo(p)" :alt="p">{{ p }}</span>
            </div>
          </div>
          <div class="lg-brand-foot">© 2026 雷达AI · 数据安全、准确性高</div>
        </div>
      </aside>
      <section class="lg-panel">
      <div class="lg-card">
        <div v-if="authState.intercept" class="lg-intercept">{{ authState.intercept }}前，请先登录雷达AI 账号</div>

        <!-- 卡内顶行：视图切换（左） + 关闭（右） -->
        <div class="lg-topbar">
          <button v-if="view === 'form'" class="lg-corner" title="微信扫码登录" @click="switchView('qr')">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <rect x="1.5" y="1.5" width="6" height="6" rx="1.2" stroke="currentColor" stroke-width="1.4"/>
              <rect x="10.5" y="1.5" width="6" height="6" rx="1.2" stroke="currentColor" stroke-width="1.4"/>
              <rect x="1.5" y="10.5" width="6" height="6" rx="1.2" stroke="currentColor" stroke-width="1.4"/>
              <path d="M10.5 10.5h2.6v2.6h-2.6zM14 14h2.5v2.5H14z" fill="currentColor"/>
            </svg>
          </button>
          <button v-else-if="view === 'qr'" class="lg-corner" title="手机号登录" @click="switchView('form')">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.4"/>
              <path d="M5 12.5h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              <path d="M5 6h.01M7.5 6h.01M10 6h.01M12.5 6h.01M5 8.2h.01M7.5 8.2h.01M10 8.2h.01M12.5 8.2h.01M6.2 10.4h5.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            </svg>
          </button>
          <span v-else class="lg-corner-ph"></span>
          <button class="lg-close" aria-label="关闭登录" title="关闭（可先以游客模式浏览）" @click="closeLogin">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          </button>
        </div>

        <!-- ===== 表单：验证码 / 密码 ===== -->
        <template v-if="view === 'form'">
          <h2 class="lg-title">欢迎来到雷达AI</h2>
          <div class="lg-tabs">
            <button :class="{ on: tab === 'sms' }" @click="tab = 'sms'; err = ''">验证码登录</button>
            <button :class="{ on: tab === 'pwd' }" @click="tab = 'pwd'; err = ''">密码登录</button>
          </div>

          <div class="lg-fields">
            <label class="lg-field">
              <span class="lg-cc">中国大陆 +86</span>
              <input v-model.trim="phone" maxlength="11" type="tel" inputmode="numeric" placeholder="请输入手机号" @keyup.enter="submit">
            </label>
            <p v-if="tab === 'sms' && isNewPhone" class="lg-register-tip">首次使用该手机号，请输入验证码并设置密码</p>
            <label v-if="tab === 'sms'" class="lg-field">
              <input v-model.trim="code" maxlength="6" type="text" inputmode="numeric" placeholder="短信验证码" @keyup.enter="submit">
              <button class="lg-code-btn" :disabled="cd > 0 || busy" @click="onSendCode('form')">{{ cd > 0 ? cd + 's后可重发' : '获取验证码' }}</button>
            </label>
            <label v-else class="lg-field">
              <input v-model="pwd" :type="showPwd ? 'text' : 'password'" placeholder="请输入密码" @keyup.enter="submit">
              <button class="lg-eye" :title="showPwd ? '隐藏密码' : '显示密码'" @click.prevent="showPwd = !showPwd">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.3"/></svg>
              </button>
            </label>
            <label v-if="tab === 'sms' && isNewPhone" class="lg-field">
              <input v-model="registerPwd" :type="showPwd ? 'text' : 'password'" autocomplete="new-password" placeholder="设置密码（至少 6 位）" @keyup.enter="submit">
              <button class="lg-eye" :title="showPwd ? '隐藏密码' : '显示密码'" @click.prevent="showPwd = !showPwd">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.3"/></svg>
              </button>
            </label>
          </div>

          <div v-if="tab === 'pwd'" class="lg-row-between"><span></span><a class="lg-link" @click="err = '演示环境暂不支持找回密码，请使用验证码登录'">找回密码</a></div>

          <p class="lg-err" v-if="err">{{ err }}</p>
          <button class="lg-submit" :disabled="busy" @click="submit">{{ busy ? '处理中…' : (tab === 'sms' && isNewPhone ? '注册并登录' : '登录') }}</button>
          <p class="lg-agree">注册/登录即同意 <a>《用户协议》</a> 与 <a>《隐私政策》</a></p>
        </template>

        <!-- ===== 微信扫码 ===== -->
        <template v-else-if="view === 'qr'">
          <h2 class="lg-title">微信扫码登录/注册</h2>
          <div class="lg-qr-wrap">
            <div class="lg-qr" :class="{ scanned: qrStatus === 1 }">
              <div class="lg-qr-grid">
                <i v-for="(on, i) in qrCells" :key="i" :class="{ on }"></i>
                <b class="lg-qr-finder f1"></b><b class="lg-qr-finder f2"></b><b class="lg-qr-finder f3"></b>
                <span class="lg-qr-center">
                  <svg width="26" height="26" viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="12" fill="#00C84B"/><path d="M14 8v6l3.5 2" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>
                </span>
              </div>
              <div v-if="qrStatus === 1" class="lg-qr-mask">
                <svg width="34" height="34" viewBox="0 0 34 34" fill="none"><circle cx="17" cy="17" r="16" fill="#00C84B"/><path d="M10 17.5l4.5 4.5L24 12.5" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <span>已扫码，请在手机上确认</span>
              </div>
            </div>
          </div>
          <p class="lg-qr-tip">{{ qrStatus === 0 ? '请使用微信扫一扫（模拟环境约 3 秒后自动扫码）' : '确认中，请稍候…' }}</p>
          <a class="lg-link lg-refresh" @click="startScan">刷新二维码</a>
          <p class="lg-agree">扫码登录即同意 <a>《用户协议》</a> 与 <a>《隐私政策》</a></p>
        </template>

        <!-- ===== 微信注册 · 绑定手机号（手机号必填） ===== -->
        <template v-else>
          <div class="lg-bind-head">
            <span class="lg-bind-badge">
              <svg width="16" height="16" viewBox="0 0 34 34" fill="none"><circle cx="17" cy="17" r="16" fill="#00C84B"/><path d="M10 17.5l4.5 4.5L24 12.5" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
              微信注册成功
            </span>
            <h2 class="lg-title sm">绑定手机号</h2>
            <p class="lg-bind-sub">该微信号尚未绑定手机号，绑定后即可登录（手机号必填）</p>
          </div>
          <div class="lg-fields">
            <label class="lg-field">
              <span class="lg-cc">中国大陆 +86</span>
              <input v-model.trim="bindPhone" maxlength="11" type="tel" inputmode="numeric" placeholder="请输入手机号" @keyup.enter="onBind">
            </label>
            <label class="lg-field">
              <input v-model.trim="bindCode" maxlength="6" type="text" inputmode="numeric" placeholder="短信验证码" @keyup.enter="onBind">
              <button class="lg-code-btn" :disabled="cd > 0 || busy" @click="onSendCode('bind')">{{ cd > 0 ? cd + 's后可重发' : '获取验证码' }}</button>
            </label>
          </div>
          <p class="lg-err" v-if="err">{{ err }}</p>
          <button class="lg-submit" :disabled="busy" @click="onBind">{{ busy ? '绑定中…' : '完成绑定并登录' }}</button>
          <a class="lg-link lg-back" @click="switchView('qr')">返回重新扫码</a>
        </template>

        <!-- 演示提示 -->
        <div class="lg-demo">
          <span>演示环境：验证码 <b>{{ DEMO.smsCode }}</b> · 预置账号 <b>{{ DEMO.phone }}</b> / <b>{{ DEMO.password }}</b></span>
          <a @click="onResetDemo">重置扫码绑定</a>
        </div>

        <button class="lg-guest" @click="enterAsGuest">暂不登录，先看看 →</button>
      </div>
      </section>
    </div>
  </div>
</template>
