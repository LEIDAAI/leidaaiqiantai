<script setup lang="ts">
/* 专家/技能发现页（dir-page）：灵感广场 / 我的 / 创建 */
import { ref, computed } from 'vue'
import { modals, navigatePage } from '../stores/modals'
import { chatState, newConversation } from '../stores/chat'
import { send } from '../stores/send'
import { expertState, expertDemo, skillDemo, type ExpertItem, type SkillItem } from '../stores/expert'
import { skillVisual, platformLogo } from '../stores/skillVisual'

const isSkills = computed(() => modals.page === 'skills')
const tab = ref<'plaza' | 'mine' | 'create'>('plaza')
const chip = ref('推荐')
const platform = ref('全部')
const expertChips = ['推荐', '选品上架', '店铺运营', '商品管理', '评论分析']
const skillChips = ['推荐', '选品与开发', '产品运营', '数据分析', '选品/热点']
const platforms = ['全部', '1688', 'OZON', '亚马逊', 'TEMU']
const platformAliases: Record<string, string[]> = {
  'OZON': ['Ozon', 'OZON'],
  'TEMU': ['Temu', 'TEMU'],
}
const matchesPlatform = (item: ExpertItem | SkillItem) => {
  if (platform.value === '全部') return true
  if ('platform' in item) return (platformAliases[platform.value] || [platform.value]).includes(item.platform)
  return item.tags.some(tag => (platformAliases[platform.value] || [platform.value]).includes(tag))
}
const availableScenarios = computed(() => {
  const list = isSkills.value ? expertState.skills : expertState.experts
  const values = list.filter(item => matchesPlatform(item)).map(item => 'platform' in item ? item.category : item.scenario).filter(Boolean) as string[]
  return ['推荐', '全部', ...Array.from(new Set(values))]
})
const caseItem = ref<ExpertItem | SkillItem | null>(null)
const isCaseSkill = computed(() => !!caseItem.value && 'version' in caseItem.value)
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
/* 导出前把远程图片内嵌为 base64，保证导出的单文件离线可看（表格/PDF 卡片随报告结构导出） */
async function inlineReportImages(html: string): Promise<string> {
  const imgs = Array.from(reportEl.value?.querySelectorAll('.cr-fig img') || []) as HTMLImageElement[]
  for (const img of imgs) {
    const src = img.getAttribute('src') || ''
    if (!src || src.startsWith('data:')) continue
    try {
      const resp = await fetch(src, { mode: 'cors' })
      if (!resp.ok) continue
      const blob = await resp.blob()
      const data = await new Promise<string | null>(res => {
        const r = new FileReader()
        r.onload = () => res(r.result as string)
        r.onerror = () => res(null)
        r.readAsDataURL(blob)
      })
      if (data) html = html.split(src).join(data)
    } catch { /* 跨域失败则保留原 URL */ }
  }
  return html
}
async function exportReport() {
  let html = buildReportHtml()
  if (!html) return
  html = await inlineReportImages(html)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeName(caseItem.value?.name || '案例报告')}-案例报告.html`
  a.click()
  URL.revokeObjectURL(url)
}

const plazaExperts = computed(() => {
  let list = expertState.experts.filter(e => e.source === 'official' && matchesPlatform(e))
  if (chip.value !== '推荐' && chip.value !== '全部') list = list.filter(e => e.category === chip.value || e.tags.includes(chip.value))
  return chip.value === '推荐' ? list.slice(0, 6) : list
})
const plazaSkills = computed(() => {
  let list = expertState.skills.filter(s => s.source === 'official' && matchesPlatform(s))
  if (chip.value !== '推荐' && chip.value !== '全部') list = list.filter(s => s.scenario === chip.value || s.tags.includes(chip.value))
  return chip.value === '推荐' ? list.slice(0, 6) : list
})
const mineExperts = computed(() => expertState.experts.filter(e => e.source === 'user'))
const mineSkills = computed(() => expertState.skills.filter(s => s.source === 'user'))
function useExpert(e: ExpertItem) {
  chatState.inputText = e.prompts?.[0] || e.desc
  navigatePage('chat')
}
function askExpertPrompt(prompt: string) {
  caseItem.value = null
  navigatePage('chat')
  newConversation()
  void send(false, false, null, prompt)
}
function useSkill(s: SkillItem) {
  chatState.inputText = s.instructions || s.desc
  navigatePage('chat')
}
function switchTab(t: 'plaza' | 'mine' | 'create') {
  tab.value = t
  if (t === 'plaza') { platform.value = '全部'; chip.value = '推荐' }
}
function selectPlatform(value: string) {
  platform.value = value
  if (!availableScenarios.value.includes(chip.value)) chip.value = '推荐'
}

/* —— 创建表单 —— */
const fName = ref(''); const fDesc = ref(''); const fTags = ref('')
const fPlatform = ref('1688'); const fCat = ref('选品上架'); const fScenario = ref('选品与开发')
const fInstructions = ref(''); const formTip = ref('')
const expertCats = ['选品上架', '店铺运营', '商品管理', '评论分析']
const scenarios = ['选品与开发', '产品运营', '数据分析', '选品/热点']
function saveCreate() {
  formTip.value = ''
  if (!fName.value.trim() || !fDesc.value.trim()) { formTip.value = '请填写名称和描述'; return }
  const tags = fTags.value.split(/[,，]/).map(t => t.trim()).filter(Boolean)
  if (isSkills.value) {
    expertState.skills.push(skillDemo({
      id: 'user-' + Date.now(), name: fName.value.trim(), desc: fDesc.value.trim(),
      tags: tags.length ? tags : ['我的技能'], source: 'user',
      instructions: fInstructions.value.trim() || fDesc.value.trim(), scenario: fScenario.value
    }))
  } else {
    expertState.experts.push(expertDemo({
      id: 'user-' + Date.now(), name: fName.value.trim(), desc: fDesc.value.trim(),
      tags: tags.length ? tags : [fPlatform.value], platform: fPlatform.value,
      category: fCat.value, source: 'user', instructions: fInstructions.value.trim() || fDesc.value.trim()
    }))
  }
  fName.value = ''; fDesc.value = ''; fTags.value = ''; fInstructions.value = ''
  tab.value = 'mine'
}
</script>

<template>
  <div class="dir-wrap">
    <div class="dir-page">
      <div class="dir-head">
        <div class="dir-tabs">
          <button class="dir-tab" :class="{ on: tab === 'plaza' }" @click="switchTab('plaza')">{{ isSkills ? '灵感广场' : '电商专家' }}</button>
          <!-- r72：我的专家暂时隐藏，保留代码便于恢复
          <button class="dir-tab" :class="{ on: tab === 'mine' }" @click="switchTab('mine')">{{ isSkills ? '我的技能' : '我的专家' }}</button>
          -->
        </div>
        <!-- r72：创建专家暂时隐藏，保留代码便于恢复
        <button class="dir-create-btn" @click="switchTab('create')">+ 创建{{ isSkills ? '技能' : '专家' }}</button>
        -->
      </div>

      <!-- 灵感广场 -->
      <div v-if="tab === 'plaza'">
        <div class="dir-filter-label">平台</div>
        <div class="seg-track">
          <button v-for="p in platforms" :key="p" class="seg-btn" :class="{ on: platform === p }" @click="selectPlatform(p)">
            <span v-if="p !== '全部'" class="seg-logo"><img :src="platformLogo(p)" alt=""></span>{{ p }}
          </button>
        </div>
        <div class="dir-filter-label">场景</div>
        <div class="dir-chips">
          <button v-for="c in availableScenarios" :key="c" class="dir-chip" :class="{ on: chip === c }" @click="chip = c">{{ c }}</button>
        </div>
        <div class="dir-grid">
          <template v-if="!isSkills">
            <div v-for="(e, ei) in plazaExperts" :key="e.id" class="dir-card">
              <span v-if="ei < 2" class="dir-new">NEW</span>
              <div class="dir-body">
                <span class="dc-ava"><img :src="platformLogo(e.platform)" alt=""></span>
                <div>
                  <div class="dir-name">{{ e.name }}</div>
                  <div class="dir-desc">{{ e.desc }}</div>
                </div>
              </div>
              <div class="dir-divider"></div>
              <div class="dir-foot">
                <span class="dir-stat">{{ e.usageCount ?? 0 }} 次使用 · {{ e.source === 'official' ? '官方' : '我的' }}</span>
                <span class="dir-actions">
                  <button class="da ghost" @click="caseItem = e">看案例</button>
                  <button class="da main" @click="useExpert(e)">立即使用</button>
                </span>
              </div>
            </div>
          </template>
          <template v-else>
            <div v-for="(s, si) in plazaSkills" :key="s.id" class="dir-card">
              <span v-if="si < 2" class="dir-new">NEW</span>
              <div class="dir-body">
                <span class="dc-icon grad" v-html="skillVisual(s).icon"></span>
                <div>
                  <div class="dir-name">{{ s.name }}</div>
                  <div class="dir-desc">{{ s.desc }}</div>
                </div>
              </div>
              <div class="dir-divider"></div>
              <div class="dir-foot">
                <span class="dir-stat">v{{ s.version }} · {{ s.downloadCount ?? 0 }} 次安装</span>
                <span class="dir-actions">
                  <button class="da ghost" @click="caseItem = s">看案例</button>
                  <button class="da main" @click="useSkill(s)">立即使用</button>
                </span>
              </div>
            </div>
          </template>
        </div>
      </div>

      <!-- 我的 -->
      <div v-else-if="tab === 'mine'">
        <div class="dir-grid" v-if="(isSkills ? mineSkills : mineExperts).length">
          <template v-if="!isSkills">
            <div v-for="e in mineExperts" :key="e.id" class="dir-card">
              <div class="dir-body">
                <span class="dc-ava"><img :src="platformLogo(e.platform)" alt=""></span>
                <div>
                  <div class="dir-name">{{ e.name }}</div>
                  <div class="dir-desc">{{ e.desc }}</div>
                </div>
              </div>
              <div class="dir-divider"></div>
              <div class="dir-foot">
                <span class="dir-stat">{{ e.usageCount ?? 0 }} 次使用 · 我的</span>
                <span class="dir-actions">
                  <button class="da ghost" @click="caseItem = e">看案例</button>
                  <button class="da main" @click="useExpert(e)">立即使用</button>
                </span>
              </div>
            </div>
          </template>
          <template v-else>
            <div v-for="s in mineSkills" :key="s.id" class="dir-card">
              <div class="dir-body">
                <span class="dc-icon grad" v-html="skillVisual(s).icon"></span>
                <div>
                  <div class="dir-name">{{ s.name }}</div>
                  <div class="dir-desc">{{ s.desc }}</div>
                </div>
              </div>
              <div class="dir-divider"></div>
              <div class="dir-foot">
                <span class="dir-stat">v{{ s.version }} · 我的</span>
                <span class="dir-actions">
                  <button class="da ghost" @click="caseItem = s">看案例</button>
                  <button class="da main" @click="useSkill(s)">立即使用</button>
                </span>
              </div>
            </div>
          </template>
        </div>
        <div v-else class="dir-empty">
          <div class="de-title">还没有{{ isSkills ? '技能' : '专家' }}</div>
          <div class="de-sub">去电商专家发现，或创建自己的{{ isSkills ? '技能' : '专家' }}</div>
          <button class="da main" @click="switchTab('plaza')">去电商专家</button>
        </div>
      </div>

      <!-- 创建 -->
      <div v-else class="dir-form">
        <div class="df-field">
          <label>名称</label>
          <input v-model="fName" type="text" :placeholder="isSkills ? '例如：家居试销清单' : '例如：Ozon 手机配件顾问'" />
        </div>
        <div class="df-field">
          <label>描述</label>
          <textarea v-model="fDesc" rows="2" placeholder="一句话说明它能帮你做什么"></textarea>
        </div>
        <div class="df-field">
          <label>标签</label>
          <input v-model="fTags" type="text" placeholder="多个标签用逗号分隔，如：选品, 1688" />
        </div>
        <div class="df-field" v-if="!isSkills">
          <label>平台</label>
          <select v-model="fPlatform"><option>1688</option><option>Ozon</option><option>亚马逊</option><option>Temu</option></select>
        </div>
        <div class="df-field">
          <label>{{ isSkills ? '场景' : '分类' }}</label>
          <select v-if="isSkills" v-model="fScenario"><option v-for="s in scenarios" :key="s">{{ s }}</option></select>
          <select v-else v-model="fCat"><option v-for="c in expertCats" :key="c">{{ c }}</option></select>
        </div>
        <div class="df-field">
          <label>指令（可选）</label>
          <textarea v-model="fInstructions" rows="4" :placeholder="`使用该${isSkills ? '技能' : '专家'}时遵循的详细指令`"></textarea>
        </div>
        <div v-if="formTip" class="df-tip">{{ formTip }}</div>
        <div class="df-actions">
          <button class="df-cancel" @click="switchTab('plaza')">取消</button>
          <button class="df-save" @click="saveCreate">保存</button>
        </div>
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
                <button v-for="(p, pi) in caseExpert.prompts || []" :key="pi" class="case-prompt" @click="askExpertPrompt(p)">{{ p }}</button>
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
              <button class="case-prompt main" @click="caseExpert ? useExpert(caseExpert) : useSkill(caseItem as SkillItem)">立即使用</button>
            </aside>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
