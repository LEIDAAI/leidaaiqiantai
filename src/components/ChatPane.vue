<script setup lang="ts">
/* 中栏：hero 首页（空态）或对话详情（头部+消息流+Composer） */
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import MessageBubble from './MessageBubble.vue'
import Composer from './Composer.vue'
import {
  chatState, activeView, isRunning, stopTask
} from '../stores/chat'
import { modals, openFeedback } from '../stores/modals'
import { resetRightPreview } from '../stores/panel'
import { expertState, type ExpertItem, type SkillItem } from '../stores/expert'
import { skillVisual, platformLogo } from '../stores/skillVisual'
import { startDemoConversation } from '../stores/demo'

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
  if (homeChip.value === '推荐') return list.slice(0, 8)
  return list.filter(e => e.category === homeChip.value || e.tags.includes(homeChip.value)).slice(0, 16)
})
const homeSkills = computed(() => {
  const list = expertState.skills.filter(s => s.source === 'official' && matchesHomePlatform(s))
  if (homeChip.value === '推荐') return list.slice(0, 8)
  return list.filter(s => s.scenario === homeChip.value || s.tags.includes(homeChip.value)).slice(0, 16)
})
function selectHomePlatform(value: string) {
  homePlatform.value = value
  if (!homeScenarios.value.includes(homeChip.value)) homeChip.value = '推荐'
}
/* —— 卡片左右翻页 —— */
const HOME_PAGE_SIZE = 4
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
/* 立即使用：填入提示词后直接自动发送 */
function useExpert(e: ExpertItem) {
  chatState.inputText = e.prompts?.[0] || e.desc
  const key = chatState.activeConvKey
  if (key && chatState.runningTasks[key]) return
  send()
}
function useSkill(s: SkillItem) { chatState.inputText = s.instructions || s.desc }
/* r72b：点击样例改为填入对话框，不自动发送 */
function askExpertPrompt(prompt: string) {
  chatState.inputText = prompt
  caseItem.value = null
}
const caseExpert = computed(() => (caseItem.value && !isCaseSkill.value) ? caseItem.value as ExpertItem : null)
const caseSkill = computed(() => (caseItem.value && isCaseSkill.value) ? caseItem.value as SkillItem : null)

/* —— 案例报告导出 —— */
const reportEl = ref<HTMLElement | null>(null)
const today = new Date().toLocaleDateString('zh-CN')
const reportTitle = computed(() => caseExpert.value?.caseTitle || caseItem.value?.name || '案例报告')
const reportMeta = computed(() => {
  if (caseExpert.value) return `${caseExpert.value.platform} · 数据样本近 30 天 · 生成于 ${today}`
  return caseSkill.value ? `v${caseSkill.value.version} · ${caseSkill.value.author} · 生成于 ${today}` : ''
})
const pdfName = computed(() => `${safeName(caseExpert.value?.caseTitle || '选品评估报告')}.pdf`)
function safeName(v: string) { return v.replace(/[\\/:*?"<>|]/g, '-') }
const REPORT_CSS = `*{box-sizing:border-box}body{margin:0;padding:24px 16px;background:#f2f4f2;color:#222;font-family:'PingFang SC','Microsoft YaHei','Segoe UI',system-ui,sans-serif}.doc{max-width:760px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.12)}.cr-hero{padding:26px 24px 22px;background:linear-gradient(125deg,#00b14a,#00913a 55%,#007d30);color:#fff}.cr-hero-tag{display:inline-block;padding:4px 10px;border-radius:999px;background:rgba(255,255,255,.18);font-size:12px}.cr-hero-title{margin-top:12px;font-size:21px;font-weight:700;line-height:1.35}.cr-hero-meta{margin-top:8px;font-size:12px;color:rgba(255,255,255,.82)}.cr-body{padding:18px 22px;display:flex;flex-direction:column;gap:18px}.cr-sec{display:flex;flex-direction:column;gap:10px}.cr-h{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:700;color:#1c1c1c}.cr-h::before{content:'';width:3px;height:13px;border-radius:2px;background:#00A83E}.cr-para{margin:0;font-size:13px;line-height:1.8;color:#444}.cr-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.crm-item{padding:13px 12px;border:1px solid #edf0ed;border-radius:12px;background:#f7fbf8;text-align:center}.crm-val{font-size:20px;font-weight:700;color:#00A83E}.crm-lab{margin-top:3px;font-size:12px;color:#8a8a92}.cr-table{width:100%;border-collapse:collapse;font-size:12.5px}.cr-table th,.cr-table td{padding:9px 11px;border:1px solid #eee;text-align:left}.cr-table th{background:#f5f7f6;color:#555;font-weight:600}.cr-table tr:nth-child(even) td{background:#fafbfa}.cr-fig{margin:0;border:1px solid #ececec;border-radius:12px;overflow:hidden}.cr-fig img{display:block;width:100%}.cr-fig figcaption{padding:8px 12px;font-size:12px;color:#8a8a92}.cr-pdf{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid #ececec;border-radius:12px;background:#fbfbfb}.cr-pdf-icon{flex:none;width:40px;height:46px;border-radius:6px;background:linear-gradient(160deg,#ff6b5e,#e5483a);color:#fff;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center}.cr-pdf-name{font-size:13px;font-weight:600;color:#222}.cr-pdf-meta{margin-top:3px;font-size:12px;color:#8a8a92}.cr-steps{margin:0;padding-left:20px;font-size:13px;color:#444;line-height:1.8}.cr-output{margin:0;padding:12px 14px;border-radius:10px;background:#f6f7f8;font-size:12px;line-height:1.6;font-family:Consolas,Monaco,monospace;white-space:pre-wrap;word-break:break-all}@media print{body{background:#fff;padding:0}.doc{box-shadow:none;border-radius:0}}`
function buildReportHtml(): string {
  const src = reportEl.value
  if (!src) return ''
  const clone = src.cloneNode(true) as HTMLElement
  clone.querySelector('.case-float')?.remove()
  const name = caseItem.value?.name || '案例报告'
  return `<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${safeName(name)} · 案例报告</title>\n<style>${REPORT_CSS}</style>\n</head>\n<body>\n<div class="doc">\n${clone.innerHTML}\n</div>\n</body>\n</html>`
}
function exportReport() {
  const html = buildReportHtml()
  if (!html) return
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeName(caseItem.value?.name || '案例报告')}-案例报告.html`
  a.click()
  URL.revokeObjectURL(url)
}
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
      <div class="home-scroll">
        <div class="home-hero">
          <div class="home-hero-head">
            <h1 class="home-title">跨境电商运营助手</h1>
            <p class="home-sub">选品、运营、评论分析，交给平台专家与开箱即用的技能</p>
            <div class="home-mode">
              <button :class="{ on: homeTab === 'expert' }" @click="homeTab = 'expert'; homeChip = '推荐'">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                专家
              </button>
              <button :class="{ on: homeTab === 'skill' }" @click="homeTab = 'skill'; homeChip = '推荐'">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"/></svg>
                技能
              </button>
            </div>
            <div class="seg-track">
              <button v-for="p in homePlatforms" :key="p" class="seg-btn" :class="{ on: homePlatform === p }" @click="selectHomePlatform(p)">
                <span v-if="p !== '全部'" class="seg-logo"><img :src="platformLogo(p)" alt=""></span>{{ p }}
              </button>
            </div>
          </div>
          <div class="home-sec">
            <div class="home-main">
            <div class="home-pager">
              <button v-if="homePageCount > 1" class="hp-arrow prev" :disabled="homePage === 0" aria-label="上一页" @click="prevHomePage"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
              <div class="home-grid" :class="{ 'cols-3': homeTab === 'skill' }">
              <template v-if="homeTab === 'expert'">
                <div v-for="e in pagedExperts" :key="e.id" class="home-card expert">
                  <div class="hc-head">
                    <div class="hc-meta">
                      <div class="hc-name">{{ e.name.startsWith(e.platform + '-') ? e.name.slice(e.platform.length + 1) : e.name }}</div>
                      <div class="hc-tags">{{ e.platform }} · {{ e.category }}</div>
                    </div>
                  </div>
                  <div class="hc-desc">{{ e.desc }}</div>
                  <div class="hc-foot">
                    <span class="hc-usage">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"/></svg>
                      <span class="hc-usage-txt">{{ e.usageCount ? e.usageCount.toLocaleString() + ' 次使用' : '新上架' }}</span>
                    </span>
                    <button class="hc-btn ghost" @click="caseItem = e">看案例</button>
                    <button class="hc-btn main" @click="useExpert(e)">立即使用</button>
                  </div>
                </div>
              </template>
              <template v-else>
                <div v-for="s in pagedSkills" :key="s.id" class="home-card skill">
                  <div class="hc-head inline">
                    <div class="hc-title">
                      <span class="hc-icon grad" v-html="skillVisual(s).icon"></span>
                      <span class="hc-name">{{ s.name }}</span>
                    </div>
                    <div class="hc-tags">{{ s.scenario || '通用' }} · v{{ s.version }}</div>
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
      </div>

      <div class="home-bottom">
        <Composer :running="false" @send="onSendClick" @stop="() => {}" />
        <div class="home-disclaimer">内容由AI大模型生成，请仔细甄别</div>
      </div>

      <div class="home-floats">
        <button class="hf-btn" data-tip="用户反馈" @click="openFeedback()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </button>
        <button class="hf-btn" data-tip="消息交互演示" @click="startDemoConversation()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"/></svg>
        </button>
      </div>

      <!-- 案例弹窗：左栏富文档报告 + 右栏介绍 -->
      <div v-if="caseItem" class="case-mask" @click.self="caseItem = null">
        <div class="case-pop">
          <button class="case-close" @click="caseItem = null">✕</button>
          <div class="case-grid">
            <div ref="reportEl" class="case-report">
              <div class="cr-hero">
                <span class="cr-hero-tag">{{ caseExpert ? '案例报告' : '技能演示报告' }}</span>
                <div class="cr-hero-title">{{ reportTitle }}</div>
                <div class="cr-hero-meta">{{ reportMeta }}</div>
              </div>
              <div class="cr-body">
                <template v-if="caseExpert">
                  <section class="cr-sec">
                    <div class="cr-h">核心结论</div>
                    <p class="cr-para">{{ caseExpert.caseConclusion }}</p>
                  </section>
                  <section class="cr-sec">
                    <div class="cr-h">关键指标</div>
                    <div class="cr-metrics">
                      <div v-for="m in caseExpert.caseMetrics || []" :key="m.label" class="crm-item">
                        <div class="crm-val">{{ m.value }}</div>
                        <div class="crm-lab">{{ m.label }}</div>
                      </div>
                    </div>
                  </section>
                  <section class="cr-sec" v-if="(caseExpert.caseRows || []).length">
                    <div class="cr-h">对比明细表</div>
                    <table class="cr-table">
                      <thead>
                        <tr><th v-for="h in caseExpert.caseHeaders || []" :key="h">{{ h }}</th></tr>
                      </thead>
                      <tbody>
                        <tr v-for="(row, ri) in caseExpert.caseRows" :key="ri">
                          <td v-for="(cell, ci) in row" :key="ci">{{ cell }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </section>
                  <section class="cr-sec" v-if="caseExpert.caseImage">
                    <div class="cr-h">选品实拍参考</div>
                    <figure class="cr-fig">
                      <img :src="caseExpert.caseImage" alt="选品实拍参考" loading="lazy" />
                      <figcaption>{{ caseExpert.caseTitle }} · 主图风格参考（图片仅作示例）</figcaption>
                    </figure>
                  </section>
                  <section class="cr-sec">
                    <div class="cr-h">完整报告附件（PDF）</div>
                    <div class="cr-pdf">
                      <span class="cr-pdf-icon">PDF</span>
                      <div>
                        <div class="cr-pdf-name">{{ pdfName }}</div>
                        <div class="cr-pdf-meta">2.4 MB · 12 页 · 更新于 {{ today }}</div>
                      </div>
                    </div>
                  </section>
                </template>
                <template v-else-if="caseSkill">
                  <section class="cr-sec">
                    <div class="cr-h">执行步骤</div>
                    <ol class="cr-steps">
                      <li v-for="(st, si) in caseSkill.steps || []" :key="si">{{ st }}</li>
                    </ol>
                  </section>
                  <section class="cr-sec">
                    <div class="cr-h">输出示例</div>
                    <pre class="cr-output">{{ caseSkill.outputExample }}</pre>
                  </section>
                </template>
              </div>
              <div class="case-float">
                <button class="cf-btn main" @click="exportReport">导出报告</button>
              </div>
            </div>
            <aside class="case-side">
              <div class="cs-head">
                <span v-if="caseExpert" class="cs-ava"><img :src="platformLogo(caseExpert.platform)" alt=""></span>
                <span v-else class="cs-ava skill">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg>
                </span>
                <div>
                  <div class="cs-name">{{ caseItem.name }}</div>
                  <div class="cs-tags"><span v-for="t in caseItem.tags" :key="t" class="cs-tag">{{ t }}</span></div>
                </div>
              </div>
              <p class="cs-desc">{{ caseItem.desc }}</p>
              <template v-if="caseExpert">
                <div class="cs-h">能做什么</div>
                <ul class="cs-caps">
                  <li v-for="c in caseExpert.capabilities || []" :key="c">{{ c }}</li>
                </ul>
                <div class="cs-h">试试这样问</div>
                <button v-for="(p, pi) in caseExpert.prompts || []" :key="pi" class="case-prompt" @click="caseExpert && askExpertPrompt(p)">{{ p }}</button>
              </template>
              <template v-else-if="caseSkill">
                <div class="cs-meta">v{{ caseSkill.version }} · {{ caseSkill.downloadCount ?? 0 }} 次安装 · {{ caseSkill.author }}</div>
                <div class="cs-h">适用场景</div>
                <div><span class="cs-tag">{{ caseSkill.scenario }}</span></div>
                <div class="cs-h">内置工具</div>
                <ul class="cs-caps">
                  <li v-for="t in caseSkill.tools || []" :key="t">{{ t }}</li>
                </ul>
              </template>
              <button class="case-prompt main" @click="caseExpert ? useExpert(caseExpert) : useSkill(caseItem as SkillItem); caseItem = null">立即使用</button>
            </aside>
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
