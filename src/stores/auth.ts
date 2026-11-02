/* =====================================================
 * 登录态（模拟）：验证码 / 密码 / 微信扫码 + 游客模式
 * 真实后端接入时仅需替换本文件的 mock 判定逻辑。
 * ===================================================== */
import { reactive, computed } from 'vue'
import { accountState, maskPhone } from './account'
import { flashToast } from '../utils/common'

const AUTH_KEY = 'dld_auth_v1'      // 登录态持久化
const WX_BIND_KEY = 'dld_wx_bind_v1' // 微信号绑定的手机号（模拟服务端记忆）
const REG_KEY = 'dld_reg_v1'         // 已注册手机号列表（模拟用户表）
const PASSWORD_KEY = 'dld_passwords_v1' // 新注册账号的演示密码

/* 演示规则（登录卡下方有提示） */
export const DEMO = {
  phone: '17688894656',   // 预置已注册账号
  password: '123456abc',  // 预置密码
  smsCode: '123456'       // 模拟验证码
}

interface AuthUser { phone: string; source: 'sms' | 'pwd' | 'wx' }

function readJSON<T>(key: string, fallback: T): T {
  try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? fallback : v } catch (e) { return fallback }
}
function writeJSON(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)) } catch (e) {} }

/* 已注册手机号（含预置演示账号，新用户验证码登录后追加） */
export function registeredPhones(): string[] {
  const list = readJSON<string[]>(REG_KEY, [])
  if (!list.includes(DEMO.phone)) list.push(DEMO.phone)
  return list
}
function markRegistered(phone: string) {
  const list = registeredPhones()
  if (!list.includes(phone)) { list.push(phone); writeJSON(REG_KEY, list) }
}

/* 微信扫码绑定状态（首次扫码 = 新用户 → 关联注册；绑定后直接登录） */
export function wxBindPhone(): string { return readJSON<string>(WX_BIND_KEY, '') }
function saveWxBind(phone: string) { writeJSON(WX_BIND_KEY, phone) }
export function resetWxBind() { writeJSON(WX_BIND_KEY, '') }

export const authState = reactive({
  logged: false,
  guest: false,            // 游客模式（跳过登录可浏览，发消息时拦截）
  user: null as AuthUser | null,
  loginView: false,        // 点击登录或受限操作时显示弹窗
  intercept: ''            // 非空 = 由某操作触发（可关闭返回游客）
})

/* 模块加载即恢复上次登录态，避免 gate 闪现 */
;(() => {
  const saved = readJSON<{ logged?: boolean; guest?: boolean; user?: AuthUser | null }>(AUTH_KEY, {})
  authState.logged = !!saved.logged
  authState.guest = !!saved.guest
  authState.user = saved.user || null
  authState.loginView = false
  // 刷新后恢复登录态时，同步主账号手机号掩码（顶栏 / 侧栏联动）
  if (authState.logged && authState.user?.phone) {
    const main = accountState.accounts[0]
    if (main) main.phone = maskPhone(authState.user.phone)
  }
})()

function persist() {
  writeJSON(AUTH_KEY, { logged: authState.logged, guest: authState.guest, user: authState.user })
}

export const isLogged = computed(() => authState.logged)

/* ---------- 打开 / 关闭登录页 ---------- */
export function openLogin(reason = '') {
  authState.intercept = reason
  authState.loginView = true
}
export function closeLogin() {
  authState.loginView = false
  authState.intercept = ''
}

/* ---------- 游客模式 ---------- */
export function enterAsGuest() {
  authState.guest = true
  authState.logged = false
  authState.user = null
  authState.loginView = false
  authState.intercept = ''
  persist()
  flashToast('已进入游客模式，登录后可使用完整功能')
}

/* 游客操作拦截：返回 true 表示已拦截（调用方直接 return） */
export function requireLogin(reason = '该操作'): boolean {
  if (authState.logged) return false
  openLogin(reason)
  flashToast(`登录后才能${reason}`)
  return true
}

/* ---------- 登录成功 ---------- */
function finishLogin(phone: string, source: AuthUser['source']) {
  authState.logged = true
  authState.guest = false
  authState.user = { phone, source }
  authState.loginView = false
  authState.intercept = ''
  persist()
  markRegistered(phone)
  // 主账号手机号联动（顶栏 / 侧栏同步显示真实登录号）
  const main = accountState.accounts[0]
  if (main) main.phone = maskPhone(phone)
  flashToast(source === 'wx' ? '微信登录成功' : '登录成功，欢迎回来')
}

export function logout() {
  authState.logged = false
  authState.guest = false
  authState.user = null
  authState.loginView = false
  authState.intercept = ''
  persist()
  flashToast('已退出登录')
}

/* ---------- mock：微信扫码（已绑定直接登录，未绑定返回 false 走关联注册） ---------- */
export function tryWxLogin(): boolean {
  const bind = wxBindPhone()
  if (!bind) return false
  finishLogin(bind, 'wx')
  return true
}

/* ---------- mock：发送验证码 ---------- */
export async function sendSmsCode(phone: string): Promise<boolean> {
  if (!/^1\d{10}$/.test(phone)) { flashToast('请输入正确的手机号'); return false }
  // 模拟网络延迟
  await new Promise(r => setTimeout(r, 500))
  flashToast(`发送成功（模拟验证码 ${DEMO.smsCode}）`)
  return true
}

/* ---------- mock：已注册验证码登录；首次注册需验证码和设置密码 ---------- */
export async function loginBySms(phone: string, code: string, password = ''): Promise<string | null> {
  if (!/^1\d{10}$/.test(phone)) return '请输入正确的手机号'
  const newAccount = !registeredPhones().includes(phone)
  if (code !== DEMO.smsCode) return '验证码错误（模拟验证码 ' + DEMO.smsCode + '）'
  if (newAccount && password.length < 6) return '请设置至少 6 位密码'
  await new Promise(r => setTimeout(r, 400))
  if (newAccount) {
    const passwords = readJSON<Record<string, string>>(PASSWORD_KEY, {})
    passwords[phone] = password
    writeJSON(PASSWORD_KEY, passwords)
  }
  finishLogin(phone, 'sms')
  return null
}

/* ---------- mock：密码登录（需已注册） ---------- */
export async function loginByPwd(phone: string, pwd: string): Promise<string | null> {
  if (!/^1\d{10}$/.test(phone)) return '请输入正确的手机号'
  if (!registeredPhones().includes(phone)) return '该手机号未注册，请使用验证码注册'
  const passwords = readJSON<Record<string, string>>(PASSWORD_KEY, {})
  if (pwd !== (passwords[phone] ?? DEMO.password)) return '密码错误'
  await new Promise(r => setTimeout(r, 400))
  finishLogin(phone, 'pwd')
  return null
}

/* ---------- mock：微信扫码绑定手机号后完成注册 ---------- */
export async function bindWxPhone(phone: string, code: string): Promise<string | null> {
  if (!/^1\d{10}$/.test(phone)) return '请输入正确的手机号'
  if (code !== DEMO.smsCode) return '验证码错误（模拟验证码 ' + DEMO.smsCode + '）'
  await new Promise(r => setTimeout(r, 400))
  saveWxBind(phone)
  finishLogin(phone, 'wx')
  return null
}
