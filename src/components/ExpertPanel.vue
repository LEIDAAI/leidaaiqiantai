<script setup lang="ts">
import { computed, reactive, ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { expertState as state, closeExpertPanel, validMcpUrl, expertDemo, skillDemo, wordLibraries, productLibraries, type ExpertTab, type ExpertItem, type SkillItem, type McpService } from '../stores/expert'
import { chatState } from '../stores/chat'

const tabs: { key: ExpertTab; label: string }[] = [{ key: 'expert', label: '电商专家' }, { key: 'connector', label: '连接器' }, { key: 'skill', label: '技能' }, { key: 'mcp', label: 'MCP' }]
const platforms = ['全部', '1688', 'Ozon', '亚马逊', 'Temu']
const categories = ['全部', '选品上架', '店铺运营', '商品管理', '评论分析']
const scenes = ['推荐', '选品与开发', '产品视觉', '产品运营', '营销广告', '数据分析', '选品/热点', '合规检测']
const view = ref<'list' | 'expert-form' | 'skill-detail'>('list')
const modal = ref<'' | 'expert-detail' | 'expert-create' | 'skill-create' | 'api' | 'mcp' | 'import' | 'references' | 'delete'>('')
const message = ref('')
const expertMine = ref(false)
const skillMine = ref(false)
const expertCategory = ref('全部')
const expertPlatform = ref('全部')
const connectorPlatform = ref('全部')
const content = ref<HTMLElement>()
const dialog = ref<HTMLElement>()
let modalTrigger: HTMLElement | null = null
const focusableSelector = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex]:not([tabindex="-1"])'
function dialogControls() {
  return Array.from(dialog.value?.querySelectorAll<HTMLElement>(focusableSelector) || []).filter(el => {
    const visibility = getComputedStyle(el).visibility
    return el.tabIndex >= 0 && !el.matches(':disabled') && el.getClientRects().length > 0 && visibility !== 'hidden' && visibility !== 'collapse' && !el.closest('[inert]')
  }).sort((a, b) => (a.tabIndex || Infinity) - (b.tabIndex || Infinity))
}
function trapDialogFocus(event: KeyboardEvent) {
  if (event.key !== 'Tab' || !state.open || !modal.value || !dialog.value) return
  event.preventDefault()
  event.stopPropagation()
  const controls = dialogControls()
  if (!controls.length) { dialog.value.focus(); return }
  const index = controls.indexOf(document.activeElement as HTMLElement)
  const next = index < 0 ? (event.shiftKey ? controls.length - 1 : 0) : (index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length
  controls[next]?.focus()
}
watch(modal, async (next, previous) => {
  if (next) {
    if (!previous) modalTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    await nextTick()
    if (modal.value === next) (dialogControls()[0] || dialog.value)?.focus()
  } else {
    const trigger = modalTrigger
    modalTrigger = null
    await nextTick()
    if (!modal.value && trigger?.isConnected && !trigger.closest('[inert]')) trigger.focus()
  }
}, { flush: 'pre' })
watch([view, () => state.activeTab], async () => { await nextTick(); if (content.value) content.value.scrollTop = 0 })
const skillSource = ref('全部')
const skillScene = ref('推荐')
const skillPlatform = ref('全部')
const skillTool = ref('全部')
const showFilters = ref(true)
const page = ref(1)
const pageSize = 9
const selectedExpert = ref<ExpertItem>()
const selectedSkill = ref<SkillItem>()
const officialExperts = computed(() => state.experts.filter(e => e.source === 'official'))
const userExperts = computed(() => state.experts.filter(e => e.source === 'user'))
const installedSkills = computed(() => state.skills.filter(s => s.source === 'user' || state.installedSkillIds.includes(s.id)))
const tools = computed(() => ['全部', ...new Set(state.skills.flatMap(s => skillDemo(s).tools || []))])
const experts = computed(() => state.experts.filter(e => (expertMine.value ? e.source === 'user' : e.source === 'official') && (expertCategory.value === '全部' || e.category === expertCategory.value) && (expertPlatform.value === '全部' || e.platform === expertPlatform.value) && `${e.name}${e.desc}`.toLowerCase().includes(state.expertSearch.toLowerCase())))
const skills = computed(() => (skillMine.value ? installedSkills.value : state.skills.filter(s => s.source === 'official')).filter(s => (skillSource.value === '全部' || (skillSource.value === '官方' ? s.source === 'official' : s.source === 'user')) && (skillPlatform.value === '全部' || s.tags.includes(skillPlatform.value)) && (skillScene.value === '推荐' || s.scenario === skillScene.value) && (skillTool.value === '全部' || skillDemo(s).tools?.includes(skillTool.value)) && `${s.name}${s.desc}`.toLowerCase().includes(state.skillSearch.toLowerCase())))
const connectors = computed(() => state.connectors.filter(c => (connectorPlatform.value === '全部' || c.platform === connectorPlatform.value) && `${c.name}${c.desc}`.toLowerCase().includes(state.connectorSearch.toLowerCase())))
const mcps = computed(() => state.mcpServices.filter(m => (state.mcpStatusFilter === 'all' || (state.mcpStatusFilter === 'enabled') === m.enabled) && `${m.name}${m.desc}`.toLowerCase().includes(state.mcpSearch.toLowerCase())))
const total = computed(() => state.activeTab === 'expert' ? experts.value.length : state.activeTab === 'skill' ? skills.value.length : connectors.value.length)
const pages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const expertPage = computed(() => experts.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const skillPage = computed(() => skills.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const connectorPage = computed(() => connectors.value.slice((page.value - 1) * pageSize, page.value * pageSize))
watch([expertMine, skillMine, expertCategory, expertPlatform, connectorPlatform, skillSource, skillScene, skillPlatform, skillTool, () => state.expertSearch, () => state.skillSearch, () => state.connectorSearch], () => { page.value = 1 })
watch(() => state.activeTab, () => { view.value = 'list'; modal.value = ''; page.value = 1 })
watch(() => state.open, open => { if (!open) { modal.value = ''; view.value = 'list' } })
watch(pages, n => { page.value = Math.min(page.value, n) })
function switchTab(tab: ExpertTab) { state.activeTab = tab; view.value = 'list' }
function useTask(text: string) { chatState.inputText = text; closeExpertPanel() }
function useExpert(e: ExpertItem) {
  const references = (e.references || []).map(id => state.skills.find(s => s.id === id)).filter((s): s is SkillItem => !!s)
  useTask([e.desc, ...references.map(s => `引用技能：${s.name}\n${s.instructions || s.desc}`), ...wordLibraries.filter(row => e.wordLibraryIds?.includes(row.id)).map(row => `引用词库：${row.name}\n${row.detail}`), ...productLibraries.filter(row => e.productLibraryIds?.includes(row.id)).map(row => `引用商品库：${row.name}\n${row.detail}`)].join('\n\n'))
}
function cardKey(event: KeyboardEvent, open: () => void) {
  if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return
  event.preventDefault(); open()
}
const caseExpanded = ref(false)
const replayStep = ref(4)
const replaying = ref(false)
const replaySteps = ['解析用户需求与筛选条件', '读取商品与关键词样本', '对比指标并评估机会', '生成报告与行动清单']
let replayTimer: ReturnType<typeof setInterval> | undefined
function pauseReplay() { if (replayTimer) clearInterval(replayTimer); replayTimer = undefined; replaying.value = false }
function resetReplay() { pauseReplay(); replayStep.value = 0 }
function toggleReplay() {
  if (replaying.value) { pauseReplay(); return }
  if (replayStep.value === 4) replayStep.value = 0
  replaying.value = true
  replayTimer = setInterval(() => { replayStep.value++; if (replayStep.value >= 4) pauseReplay() }, 1000)
}
watch(modal, next => { if (next !== 'expert-detail') { pauseReplay(); caseExpanded.value = false } })
onUnmounted(pauseReplay)
function expertDetail(e: ExpertItem) { selectedExpert.value = expertDemo(e); replayStep.value = 4; caseExpanded.value = false; modal.value = 'expert-detail' }
function skillDetail(s: SkillItem) { selectedSkill.value = skillDemo(s); view.value = 'skill-detail' }
function isInstalled(s: SkillItem) { return s.source === 'user' || state.installedSkillIds.includes(s.id) }
function install(s: SkillItem) { if (!isInstalled(s)) state.installedSkillIds.push(s.id); message.value = '已添加到我的技能' }
async function copy(text: string) { try { await navigator.clipboard.writeText(text); message.value = '提示词已复制' } catch { message.value = '无法访问剪贴板，请选中提示词手动复制' } }
function escape(event: KeyboardEvent) { if (event.key !== 'Escape' || !state.open) return; if (modal.value) modal.value = ''; else if (view.value !== 'list') view.value = 'list'; else closeExpertPanel() }
onMounted(() => { window.addEventListener('keydown', escape); window.addEventListener('keydown', trapDialogFocus, true) })
onUnmounted(() => { window.removeEventListener('keydown', escape); window.removeEventListener('keydown', trapDialogFocus, true) })
const expertForm = reactive({ name: '', desc: '', template: '', custom: '', platform: '1688', category: '选品上架', refs: [] as string[], wordLibraryIds: [] as string[], productLibraryIds: [] as string[] })
const creationMode = ref('表单创建')
const showAllTemplates = ref(false)
const visibleTemplates = computed(() => showAllTemplates.value ? officialExperts.value : officialExperts.value.slice(0, 6))
function startExpert(mode: string, item?: ExpertItem) {
  creationMode.value = mode
  showAllTemplates.value = false
  Object.assign(expertForm, { name: item ? `${item.name}（自定义）` : '', desc: item?.desc || '', template: item?.source === 'official' ? item.id : '', custom: '', platform: item?.platform || '1688', category: item?.category || '选品上架', refs: [...(item?.references || [])], wordLibraryIds: [...(item?.wordLibraryIds || [])], productLibraryIds: [...(item?.productLibraryIds || [])] })
  modal.value = ''; view.value = 'expert-form'; state.activeTab = 'expert'
}
function applyTemplate(id: string) {
  const item = state.experts.find(e => e.id === id)
  if (item) Object.assign(expertForm, { name: `${item.name}（自定义）`, desc: item.desc, platform: item.platform, category: item.category, refs: [...(item.references || [])], wordLibraryIds: [...(item.wordLibraryIds || [])], productLibraryIds: [...(item.productLibraryIds || [])] })
}
function saveExpert() {
  if (!expertForm.name.trim() || !expertForm.desc.trim()) { message.value = '请填写名称与任务描述'; return }
  state.experts.push({ id: crypto.randomUUID(), name: expertForm.name.trim(), desc: expertForm.desc.trim(), platform: expertForm.platform, category: expertForm.category, tags: [expertForm.category, expertForm.platform], source: 'user', references: [...expertForm.refs], wordLibraryIds: [...expertForm.wordLibraryIds], productLibraryIds: [...expertForm.productLibraryIds] })
  expertMine.value = true; expertCategory.value = '全部'; expertPlatform.value = '全部'; state.expertSearch = ''; view.value = 'list'; message.value = '专家已保存到我的专家'
}
const referenceKind = ref('技能')
function openReferences(kind: string) { referenceKind.value = kind; modal.value = 'references' }
const skillForm = reactive({ name: '', desc: '', category: '选品与开发', tags: '', instructions: '', scenario: '选品与开发' })
function createSkill() { Object.assign(skillForm, { name: '', desc: '', category: '选品与开发', tags: '', instructions: '', scenario: '选品与开发' }); modal.value = 'skill-create' }
function saveSkill() {
  if (!skillForm.name.trim() || !skillForm.desc.trim() || !skillForm.instructions.trim()) { message.value = '请填写名称、描述和指令'; return }
  const id = crypto.randomUUID()
  state.skills.push({ id, name: skillForm.name.trim(), desc: skillForm.desc.trim(), source: 'user', categoryLabel: skillForm.category, scenario: skillForm.scenario, tags: [...new Set([skillForm.category, ...skillForm.tags.split(/[,，]/).map(t => t.trim()).filter(Boolean)])], instructions: skillForm.instructions.trim() })
  skillMine.value = true; skillScene.value = '推荐'; skillSource.value = '全部'; skillPlatform.value = '全部'; skillTool.value = '全部'; state.skillSearch = ''; modal.value = ''; message.value = '自定义技能已保存'
}
const secrets = reactive<Record<string, string>>({})
const apiConfigs = reactive<Record<string, { url: string; key: string }>>({})
const apiForm = reactive({ url: '', key: '' })
function openApi() { if (!selectedSkill.value) return; Object.assign(apiForm, apiConfigs[selectedSkill.value.id] || { url: '', key: '' }); modal.value = 'api' }
function saveApi() { if (apiForm.url && !validMcpUrl(apiForm.url)) { message.value = '请输入无凭据、查询参数的 HTTP(S) 地址'; return }; if (selectedSkill.value) apiConfigs[selectedSkill.value.id] = { ...apiForm }; modal.value = ''; apiForm.key = ''; message.value = 'API 配置已保存（演示）' }
const mcpMenu = ref(false)
const connectionTests = reactive<Record<string, string>>({})
const testTimers = new Set<ReturnType<typeof setTimeout>>()
function testConnection(id: string, name: string, url: string, auth: string, credential: string) {
  if (connectionTests[id] === '测试中…') return
  connectionTests[id] = '测试中…'
  const valid = !!name.trim() && validMcpUrl(url) && (auth === '无认证' || !!credential.trim())
  const timer = setTimeout(() => { connectionTests[id] = valid ? '模拟成功 · 配置校验通过' : '模拟失败 · 请检查名称、URL 与认证凭据'; testTimers.delete(timer) }, 900)
  testTimers.add(timer)
}
watch(modal, next => { if (next === 'mcp') delete connectionTests.form })
onUnmounted(() => testTimers.forEach(clearTimeout))
const mcpForm = reactive({ id: '', name: '', url: '', desc: '', protocol: 'Streamable HTTP', auth: '无认证', credential: '' })
watch(() => [mcpForm.name, mcpForm.url, mcpForm.auth, mcpForm.credential], () => { delete connectionTests.form })
function openMcp(m?: McpService) { Object.assign(mcpForm, { id: m?.id || '', name: m?.name || '', url: m?.url || '', desc: m?.desc || '', protocol: m?.protocol || 'Streamable HTTP', auth: m?.auth || '无认证', credential: m ? secrets[m.id] || '' : '' }); mcpMenu.value = false; modal.value = 'mcp' }
function saveMcp() {
  if (!mcpForm.name.trim() || !validMcpUrl(mcpForm.url)) { message.value = '请填写服务器名称及有效HTTP(S) URL；URL不可包含凭据、查询参数或片段'; return }
  const existing = state.mcpServices.find(m => m.id === mcpForm.id)
  const id = existing?.id || crypto.randomUUID()
  const data = { id, name: mcpForm.name.trim(), url: mcpForm.url.trim(), desc: mcpForm.desc.trim(), protocol: mcpForm.protocol, auth: mcpForm.auth, tools: existing?.tools || [], enabled: existing?.enabled ?? false }
  if (existing) Object.assign(existing, data); else state.mcpServices.push(data)
  if (mcpForm.auth !== '无认证') secrets[id] = mcpForm.credential; else delete secrets[id]
  mcpForm.credential = ''; modal.value = ''; message.value = '配置已保存，尚未验证连接；凭据仅保留在本次会话'
}
const importText = ref('')
const importError = ref('')
function openImport() { mcpMenu.value = false; importText.value = ''; importError.value = ''; modal.value = 'import' }
function importMcp() {
  try {
    const raw: unknown = JSON.parse(importText.value)
    if (!raw || typeof raw !== 'object') throw new Error('JSON必须是服务对象、数组或mcpServers对象')
    let rows: unknown[]
    if (Array.isArray(raw)) rows = raw
    else if ('mcpServers' in raw) {
      const servers = raw.mcpServers
      if (!servers || typeof servers !== 'object' || Array.isArray(servers)) throw new Error('mcpServers必须是对象')
      rows = Object.entries(servers).map(([name, value]) => value && typeof value === 'object' ? { ...value, name } : null)
    } else rows = [raw]
    if (!rows.length) throw new Error('没有可导入的服务')
    const data = rows.map(row => {
      if (row && typeof row === 'object' && ('command' in row || 'args' in row)) throw new Error('不支持 command/args 本地进程配置或本地命令执行；仅支持 HTTP(S) 的 Streamable HTTP/SSE 服务')
      if (!row || typeof row !== 'object' || !('name' in row) || typeof row.name !== 'string' || !row.name.trim() || !('url' in row) || typeof row.url !== 'string' || !validMcpUrl(row.url)) throw new Error('每项须包含有效name和HTTP(S) url；URL不可含凭据或查询参数')
      const protocol = 'protocol' in row ? row.protocol : 'Streamable HTTP'
      if (protocol !== 'SSE' && protocol !== 'Streamable HTTP') throw new Error('协议仅支持SSE或Streamable HTTP')
      return { id: crypto.randomUUID(), name: row.name.trim(), url: row.url.trim(), desc: '通过JSON导入，待配置认证', protocol, auth: '无认证', tools: [], enabled: false } as McpService
    })
    state.mcpServices.push(...data); importText.value = ''; modal.value = ''; message.value = `已导入${data.length}个服务，认证字段未导入，连接未验证`
  } catch (error) { importError.value = error instanceof Error ? error.message : 'JSON解析失败' }
}
const deleting = ref<{ kind: 'expert' | 'skill' | 'uninstall' | 'mcp'; id: string; name: string }>()
function requestDelete(kind: 'expert' | 'skill' | 'uninstall' | 'mcp', item: ExpertItem | SkillItem | McpService) {
  if ((kind === 'expert' || kind === 'skill') && (!('source' in item) || item.source !== 'user')) return
  deleting.value = { kind, id: item.id, name: item.name }; modal.value = 'delete'
}
function confirmDelete() {
  const target = deleting.value
  if (!target) return
  const { kind, id } = target
  if (kind === 'expert') {
    if (!state.experts.some(e => e.id === id && e.source === 'user')) return
    state.experts = state.experts.filter(e => e.id !== id)
    if (selectedExpert.value?.id === id) selectedExpert.value = undefined
  } else if (kind === 'skill' || kind === 'uninstall') {
    const skill = state.skills.find(s => s.id === id)
    if (!skill || (kind === 'skill' ? skill.source !== 'user' : skill.source !== 'official')) return
    state.installedSkillIds = state.installedSkillIds.filter(skillId => skillId !== id)
    if (kind === 'skill') {
      state.skills = state.skills.filter(s => s.id !== id)
      state.experts.forEach(e => { if (e.references) e.references = e.references.filter(skillId => skillId !== id) })
      expertForm.refs = expertForm.refs.filter(skillId => skillId !== id)
      delete apiConfigs[id]
    }
    if (selectedSkill.value?.id === id) { selectedSkill.value = undefined; view.value = 'list' }
  } else {
    state.mcpServices = state.mcpServices.filter(m => m.id !== id); delete secrets[id]
  }
  modal.value = ''; deleting.value = undefined; message.value = kind === 'uninstall' ? '技能已卸载' : '已删除'
}
watch(modal, (next, previous) => { if (next) message.value = ''; if (previous === 'mcp' && next !== 'mcp') mcpForm.credential = ''; if (previous === 'api' && next !== 'api') apiForm.key = ''; if (previous === 'import' && next !== 'import') importText.value = '' })
</script>

<template>
  <div class="expert-panel lf-panel">
    <header class="lf-header"><span>雷达 AI <span class="lf-muted"> / 专家工作台</span> <small class="lf-demo-badge">演示数据</small></span></header>
    <nav class="lf-nav" aria-label="工作台导航"><button v-for="tab in tabs" :key="tab.key" :class="{ 'lf-active': state.activeTab === tab.key }" @click="switchTab(tab.key)">{{ tab.label }}</button></nav>
    <div v-if="message || state.storageError" class="lf-notice" role="status">{{ state.storageError || message }}<button aria-label="关闭提示" @click="message = ''; state.storageError = ''">×</button></div>
    <main ref="content" class="lf-content">
      <section v-if="view === 'expert-form'" class="lf-form-page">
        <button class="lf-text" @click="view = 'list'">← 返回</button><h2>创建跨境专家</h2><p class="lf-muted">{{ creationMode }} · 完善以下信息后保存到我的专家。{{ creationMode === '自由创建' ? '直接编辑任务，无创建助手会话。' : '' }}</p>
        <form class="lf-white lf-form" @submit.prevent="saveExpert">
          <div class="lf-expert-form-row">
            <div id="lf-template-label" class="lf-field-label">创作参考模板</div>
            <div class="lf-field-content">
              <div class="lf-template-area" role="group" aria-labelledby="lf-template-label">
                <div class="lf-template-heading"><span>官方专家模板</span><span class="lf-muted">共 {{ officialExperts.length }} 个</span></div>
                <div id="lf-template-cards" class="lf-template-grid">
                  <button v-for="e in visibleTemplates" :key="e.id" type="button" class="lf-template-card" :class="{ 'lf-template-selected': expertForm.template === e.id }" :aria-pressed="expertForm.template === e.id" @click="expertForm.template = e.id; expertForm.custom = ''; applyTemplate(e.id)">
                    <span class="lf-template-title">{{ e.name }}</span><span class="lf-template-desc">{{ e.desc }}</span>
                  </button>
                </div>
                <p v-if="!officialExperts.length" class="lf-muted">暂无官方模板</p>
                <button v-if="officialExperts.length > 6" type="button" class="lf-template-toggle" :aria-expanded="showAllTemplates" aria-controls="lf-template-cards" @click="showAllTemplates = !showAllTemplates">{{ showAllTemplates ? '收起模板 ↑' : `查看全部 ${officialExperts.length} 个模板 ↓` }}</button>
              </div>
              <div class="lf-custom-expert"><label for="lf-custom-expert">基于我的自定义专家</label><select id="lf-custom-expert" v-model="expertForm.custom" @change="expertForm.template = ''; applyTemplate(expertForm.custom)"><option value="">{{ userExperts.length ? '请选择自定义专家' : '暂无自定义专家' }}</option><option v-for="e in userExperts" :key="e.id" :value="e.id">{{ e.name }}</option></select></div>
            </div>
          </div>
          <div class="lf-expert-form-row">
            <label class="lf-field-label" for="lf-expert-name">专家名称 <span class="lf-required">*</span></label>
            <div class="lf-field-content"><input id="lf-expert-name" v-model="expertForm.name" required maxlength="80" placeholder="为你的专家命名" /></div>
          </div>
          <div class="lf-expert-form-row">
            <label class="lf-field-label" for="lf-expert-desc">任务描述 <span class="lf-required">*</span></label>
            <div class="lf-field-content lf-description-editor">
              <textarea id="lf-expert-desc" v-model="expertForm.desc" required rows="7" placeholder="描述专家需要完成的任务、执行步骤和输出要求" />
              <div class="lf-description-tools"><span>引用资源</span><button type="button" @click="openReferences('词库')">+ 词库{{ expertForm.wordLibraryIds.length ? ` (${expertForm.wordLibraryIds.length})` : '' }}</button><button type="button" @click="openReferences('商品库')">+ 商品库{{ expertForm.productLibraryIds.length ? ` (${expertForm.productLibraryIds.length})` : '' }}</button><button type="button" @click="openReferences('技能')">+ 技能</button></div>
            </div>
          </div>
          <div class="lf-expert-form-row">
            <div class="lf-field-label">优先 Skill</div>
            <div class="lf-field-content lf-skill-priority"><button type="button" @click="openReferences('技能')">+ 添加 Skill</button><span class="lf-muted">{{ expertForm.refs.length ? `已选择 ${expertForm.refs.length} 个技能` : '可选，优先添加任务所需的 Skill' }}</span></div>
          </div>
          <div class="lf-expert-form-row">
            <div class="lf-field-label">补充设置</div>
            <div class="lf-field-content lf-extra-settings"><label for="lf-expert-platform">平台<select id="lf-expert-platform" v-model="expertForm.platform"><option v-for="p in platforms.slice(1)" :key="p">{{ p }}</option></select></label><label for="lf-expert-category">分类<select id="lf-expert-category" v-model="expertForm.category"><option v-for="c in categories.slice(1)" :key="c">{{ c }}</option></select></label></div>
          </div>
          <footer class="lf-actions"><button type="button" @click="view = 'list'">取消</button><button class="lf-primary" type="submit" :disabled="!expertForm.name.trim() || !expertForm.desc.trim()">确定创建专家</button></footer>
        </form>
      </section>

      <section v-else-if="view === 'skill-detail' && selectedSkill">
        <div class="lf-row lf-detail-top"><button class="lf-text" @click="view = 'list'">← 返回</button><span>{{ selectedSkill.name }}</span></div>
        <div class="lf-white lf-skill-hero"><span class="lf-avatar lf-large">{{ selectedSkill.name[0] }}</span><div class="lf-grow"><h2>{{ selectedSkill.name }}</h2><div class="lf-tags"><span v-for="tag in selectedSkill.tags" :key="tag">{{ tag }}</span></div></div><button @click="openApi">API 设置</button><button v-if="selectedSkill.source === 'user'" class="lf-danger" @click="requestDelete('skill', selectedSkill)">删除技能</button><button v-else-if="isInstalled(selectedSkill)" @click="requestDelete('uninstall', selectedSkill)">卸载技能</button><button v-else class="lf-primary" @click="install(selectedSkill)">安装到我的技能</button></div>
        <p>{{ selectedSkill.desc }}</p><div class="lf-row"><span class="lf-muted">适用于</span><span v-for="tag in selectedSkill.tags" :key="tag" class="lf-tag">{{ tag }}</span></div>
        <div class="lf-overview">概述</div><div class="lf-skill-columns"><article class="lf-white lf-prose"><h3>技能说明</h3><p>{{ selectedSkill.desc }}</p><h3>使用指令</h3><pre>{{ selectedSkill.instructions || `1. 提供任务目标、商品或关键词。\n2. 根据所需数据执行：${selectedSkill.desc}。\n3. 标注数据来源与缺失项，输出可执行建议。` }}</pre><h3>执行步骤</h3><ol><li v-for="step in selectedSkill.steps" :key="step">{{ step }}</li></ol><h3>输出示例</h3><pre>{{ selectedSkill.outputExample }}</pre><h3>依赖工具</h3><div class="lf-tags"><span v-for="tool in selectedSkill.tools" :key="tool">{{ tool }}</span></div><button @click="useTask(selectedSkill.instructions || selectedSkill.desc)">在聊天中使用</button></article><aside class="lf-white lf-meta"><h3>技能信息</h3><p>作者 <strong>{{ selectedSkill.author }}</strong></p><p>版本 <strong>{{ selectedSkill.version }}</strong></p><p>下载量 <strong>{{ selectedSkill.downloadCount?.toLocaleString() }}</strong></p><p>来源 <strong>{{ selectedSkill.source === 'official' ? '官方' : '我的自定义' }}</strong></p><p>分类 <strong>{{ selectedSkill.categoryLabel || selectedSkill.tags[0] }}</strong></p></aside></div>
      </section>

      <template v-else>
        <section v-if="state.activeTab === 'expert'">
          <div class="lf-expert-workspace">
            <div class="lf-toolbar lf-expert-toolbar"><div class="lf-subtabs"><button :class="{ 'lf-active': !expertMine }" @click="expertMine = false">灵感广场</button><button :class="{ 'lf-active': expertMine }" @click="expertMine = true">我的专家</button></div><div class="lf-row lf-expert-actions"><input v-model="state.expertSearch" class="lf-search" aria-label="搜索专家" placeholder="搜索专家" /><button class="lf-primary" @click="modal = 'expert-create'">+ 创建专家</button></div></div>
            <div class="lf-scenes-head"><h2>精选场景</h2><button class="lf-text" type="button">查看全部 →</button></div>
            <div class="lf-scene-strip"><article class="lf-scene-card lf-scene-1688"><span class="lf-scene-mark">1688</span><div><strong>1688 货源洞察</strong><small>选品 · 供应链 · 价格分析</small></div><button @click="expertPlatform = '1688'">查看场景 →</button></article><article class="lf-scene-card lf-scene-amazon"><span class="lf-scene-mark">AMZ</span><div><strong>亚马逊趋势扫描</strong><small>市场机会 · 竞品 · 利润率</small></div><button @click="expertPlatform = '亚马逊'">查看场景 →</button></article><article class="lf-scene-card lf-scene-ozon"><span class="lf-scene-mark">OZ</span><div><strong>Ozon 入驻评估</strong><small>市场需求 · 类目竞争 · 定价</small></div><button @click="expertPlatform = 'Ozon'">查看场景 →</button></article><article class="lf-scene-card lf-scene-temu"><span class="lf-scene-mark">TM</span><div><strong>Temu 爆品雷达</strong><small>热销榜 · 动销 · 同款比价</small></div><button @click="expertPlatform = 'Temu'">查看场景 →</button></article></div>
            <div class="lf-list-panel"><div class="lf-filter lf-category-filter"><span>分类</span><button v-for="c in categories" :key="c" :class="{ 'lf-selected': expertCategory === c }" @click="expertCategory = c">{{ c }}</button></div><div class="lf-filter lf-platform-filter"><span>平台</span><button v-for="p in platforms" :key="p" :class="{ 'lf-selected': expertPlatform === p }" @click="expertPlatform = p">{{ p }}</button></div>
          <div class="lf-grid"><article v-for="e in expertPage" :key="e.id" class="lf-card lf-expert-card" tabindex="0" role="button" @click="expertDetail(e)" @keydown="cardKey($event, () => expertDetail(e))"><h3>{{ e.name }}</h3><p class="lf-clamp">{{ e.desc }}</p><div class="lf-card-foot"><span>{{ e.source === 'official' ? '官方模板' : '我的专家' }}</span><span class="lf-usage">使用人数 {{ expertDemo(e).usageCount?.toLocaleString() }}</span><button class="lf-hover-action" @click.stop="useExpert(e)">做同款 ↗</button><button v-if="e.source === 'user'" class="lf-danger" @click.stop="requestDelete('expert', e)">删除</button></div></article></div><div v-if="!experts.length" class="lf-empty">{{ expertMine ? '暂无符合条件的自定义专家，点击创建专家开始。' : '没有找到相关专家，请调整搜索或分类。' }}</div></div></div>
        </section>

        <section v-else-if="state.activeTab === 'skill'">
          <div class="lf-toolbar"><h2>精选技能</h2><div class="lf-row"><button @click="switchTab('mcp')">MCP 管理</button><button class="lf-primary" @click="createSkill">+ 创建自定义技能</button></div></div>
          <div class="lf-featured"><button v-for="s in state.skills.filter(s => s.source === 'official').slice(0, 4)" :key="s.id" class="lf-white" @click="skillDetail(s)"><span class="lf-avatar">{{ s.name[0] }}</span><h3>{{ s.name }}</h3><p class="lf-clamp">{{ s.desc }}</p></button></div>
          <div class="lf-toolbar"><div class="lf-subtabs"><button :class="{ 'lf-active': !skillMine }" @click="skillMine = false">社区技能</button><button :class="{ 'lf-active': skillMine }" @click="skillMine = true">我的技能</button></div><div class="lf-row"><button :aria-expanded="showFilters" @click="showFilters = !showFilters">{{ showFilters ? '收起筛选' : '展开筛选' }}</button><input v-model="state.skillSearch" class="lf-search" aria-label="搜索技能" placeholder="搜索技能" /></div></div>
          <div v-if="showFilters" class="lf-filter-box"><div class="lf-filter"><span>平台</span><button v-for="p in platforms" :key="p" :class="{ 'lf-selected': skillPlatform === p }" @click="skillPlatform = p">{{ p }}</button></div><div class="lf-filter"><span>场景</span><button v-for="s in scenes" :key="s" :class="{ 'lf-selected': skillScene === s }" @click="skillScene = s">{{ s }}</button></div><div class="lf-filter"><span>来源</span><button v-for="s in ['全部', '官方', '自定义']" :key="s" :class="{ 'lf-selected': skillSource === s }" @click="skillSource = s">{{ s }}</button></div><div class="lf-filter"><span>工具</span><button v-for="t in tools" :key="t" :class="{ 'lf-selected': skillTool === t }" @click="skillTool = t">{{ t }}</button><small v-if="tools.length === 1" class="lf-muted">暂无已声明的工具依赖</small></div></div>
          <div class="lf-grid"><article v-for="s in skillPage" :key="s.id" class="lf-card" tabindex="0" role="button" @click="skillDetail(s)" @keydown="cardKey($event, () => skillDetail(s))"><div class="lf-row"><span class="lf-avatar">{{ s.name[0] }}</span><h3>{{ s.name }}</h3></div><p class="lf-clamp">{{ s.desc }}</p><div class="lf-tags"><span v-for="t in s.tags" :key="t">{{ t }}</span></div><div class="lf-card-foot"><span>{{ s.source === 'official' ? '官方' : '自定义' }} · 下载 {{ skillDemo(s).downloadCount?.toLocaleString() }}</span><span>{{ isInstalled(s) ? '已添加' : '查看详情 ↗' }}</span><button v-if="s.source === 'user'" class="lf-danger" @click.stop="requestDelete('skill', s)">删除</button><button v-else-if="isInstalled(s)" @click.stop="requestDelete('uninstall', s)">卸载</button></div></article></div><div v-if="!skills.length" class="lf-empty">暂无符合条件的技能。可前往社区安装，或创建自定义技能。</div>
        </section>

        <section v-else-if="state.activeTab === 'connector'">
          <div class="lf-toolbar"><div><h2>数据连接器</h2><p class="lf-muted">选择平台数据能力，在聊天输入框中引用</p></div><input v-model="state.connectorSearch" class="lf-search" aria-label="搜索连接器" placeholder="搜索连接器" /></div><div class="lf-filter"><span>平台</span><button v-for="p in platforms" :key="p" :class="{ 'lf-selected': connectorPlatform === p }" @click="connectorPlatform = p">{{ p }}</button></div>
          <div class="lf-grid"><article v-for="c in connectorPage" :key="c.id" class="lf-card"><h3>{{ c.name }}</h3><p>{{ c.desc }}</p><div class="lf-tags"><span>{{ c.platform }}</span><span v-for="t in c.tools" :key="t">{{ t }}</span></div><footer class="lf-actions"><button @click="useTask(`${c.name} ${chatState.inputText}`)">引用到聊天 ↗</button></footer></article></div><div v-if="!connectors.length" class="lf-empty">暂无符合条件的连接器</div>
        </section>

        <section v-else>
          <div class="lf-toolbar"><div class="lf-row"><button class="lf-text" @click="switchTab('skill')">← 返回</button><h2>MCP 管理</h2></div><div class="lf-dropdown"><button class="lf-primary" :aria-expanded="mcpMenu" @click="mcpMenu = !mcpMenu">配置 MCP ▾</button><div v-if="mcpMenu" class="lf-menu"><button @click="openMcp()">自定义 MCP</button><button @click="openImport">通过 JSON 导入 MCP</button></div></div></div>
          <p class="lf-muted">管理工具服务与认证配置，通过模拟测试预览连接流程。</p>
          <div class="lf-toolbar"><div class="lf-row"><button v-for="s in (['all', 'enabled', 'disabled'] as const)" :key="s" :class="{ 'lf-selected': state.mcpStatusFilter === s }" @click="state.mcpStatusFilter = s">{{ { all: '全部', enabled: '已启用', disabled: '已停用' }[s] }}</button></div><input v-model="state.mcpSearch" class="lf-search" aria-label="搜索MCP" placeholder="搜索 MCP" /></div>
          <div class="lf-mcp-list"><article v-for="m in mcps" :key="m.id" class="lf-white lf-mcp"><div class="lf-row"><span class="lf-avatar">M</span><div class="lf-grow"><h3>{{ m.name }}</h3><p class="lf-url">{{ m.url }}</p></div><span :class="m.enabled ? 'lf-enabled' : 'lf-muted'">{{ m.enabled ? '已启用（本地）' : '已停用' }}</span></div><p>{{ m.desc }}</p><div class="lf-tags"><span>{{ m.protocol }}</span><span>{{ m.auth }}</span><span role="status">{{ connectionTests[m.id] || '未模拟测试' }}</span><span v-if="m.auth !== '无认证'">{{ secrets[m.id] ? '本次会话已配置凭据' : '尚未配置本次会话凭据' }}</span></div><div class="lf-row lf-mcp-tools"><button v-for="tool in m.tools" :key="tool" :disabled="!m.enabled" @click="useTask(`${tool} ${chatState.inputText}`)">{{ tool }}</button><small v-if="!m.tools.length" class="lf-muted">尚无已发现工具</small></div><footer class="lf-actions"><button @click="m.enabled = !m.enabled; message = '仅更新本地启停状态，未发起网络请求'">{{ m.enabled ? '停用' : '启用' }}</button><button :disabled="connectionTests[m.id] === '测试中…'" @click="testConnection(m.id, m.name, m.url, m.auth, secrets[m.id] || '')">模拟测试连接</button><button @click="openMcp(m)">编辑</button><button class="lf-danger" @click="requestDelete('mcp', m)">删除</button></footer></article></div>
          <div v-if="!mcps.length" class="lf-empty"><h3>{{ state.mcpServices.length ? '没有匹配的 MCP' : '还没有配置 MCP' }}</h3><p>添加服务器配置，管理你的工具服务</p><button class="lf-primary" @click="openMcp()">配置 MCP</button></div>
          <div class="lf-guide"><article v-for="(step, i) in ['添加服务器：输入服务URL或导入JSON', '配置认证：凭据仅在本次会话保留', '模拟测试：校验格式并查看模拟结果']" :key="step" class="lf-white"><span class="lf-avatar">{{ i + 1 }}</span><p>{{ step }}</p></article></div>
        </section>
        <footer v-if="state.activeTab !== 'mcp'" class="lf-pagination"><span>共 {{ total }} 项</span><button :disabled="page === 1" aria-label="上一页" @click="page--">‹</button><button v-for="n in pages" :key="n" :class="{ 'lf-selected': page === n }" @click="page = n">{{ n }}</button><button :disabled="page === pages" aria-label="下一页" @click="page++">›</button></footer>
      </template>
    </main>

    <div v-if="modal" class="lf-overlay" @click.self="modal = ''">
      <section ref="dialog" class="lf-dialog" :class="{ 'lf-expert-dialog': modal === 'expert-detail', 'lf-case-expanded': caseExpanded }" role="dialog" aria-modal="true" :aria-label="modal === 'expert-detail' ? selectedExpert?.name : '配置与创建'" tabindex="-1">
        <button class="lf-dialog-close lf-icon-button" aria-label="关闭弹窗" @click="modal = ''">×</button>
        <p v-if="message && modal !== 'expert-detail'" class="lf-dialog-notice" role="status">{{ message }}</p>
        <template v-if="modal === 'expert-detail' && selectedExpert">
          <div class="lf-case">
            <div class="lf-report-toolbar"><span class="lf-tag">精选案例</span><div class="lf-row"><button @click="toggleReplay">{{ replaying ? '暂停回放' : replayStep === 4 ? '案例回放' : '继续回放' }}</button><button @click="resetReplay">重置</button><button :aria-expanded="caseExpanded" @click="caseExpanded = !caseExpanded">{{ caseExpanded ? '收起预览' : '展开预览 ↗' }}</button></div></div>
            <p class="lf-replay-label" role="status">本地模拟回放 · {{ replayStep }}/4 {{ replaying ? '播放中' : replayStep === 4 ? '已完成' : '已暂停' }}</p>
            <div class="lf-user-bubble">{{ selectedExpert.prompts?.[0] }}</div>
            <div class="lf-tool-timeline"><div v-for="(step, index) in replaySteps" :key="step" :class="{ 'lf-step-done': replayStep > index, 'lf-step-running': replaying && replayStep === index }"><span>{{ replayStep > index ? '✓' : index + 1 }}</span><div><strong>{{ step }}</strong><small>{{ replayStep > index ? '模拟完成' : replaying && replayStep === index ? '模拟处理中…' : '等待回放' }}</small></div></div></div>
            <article v-if="replayStep >= 3" class="lf-report">
              <div class="lf-report-cover"><small>RADAR INSIGHTS / {{ selectedExpert.platform }}</small><h2>{{ selectedExpert.caseTitle }}</h2><p>市场机会 · 竞争格局 · 可执行建议</p><span>分析周期：近 30 天　｜　版本 1.0</span></div>
              <div class="lf-report-body"><h3>01 / 核心指标</h3><div class="lf-report-metrics"><div v-for="metric in selectedExpert.caseMetrics" :key="metric.label"><small>{{ metric.label }}</small><strong>{{ metric.value }}</strong></div></div>
                <h3>02 / {{ selectedExpert.category === '评论分析' ? '问题主题分布' : '商品机会对比' }}</h3><div class="lf-report-table"><table><thead><tr><th v-for="heading in selectedExpert.category === '评论分析' ? ['问题主题', '反馈数', '占比', '改善建议'] : ['商品方案', '参考价格', '月销量', '毛利率', '建议']" :key="heading">{{ heading }}</th></tr></thead><tbody><tr v-for="(row, i) in selectedExpert.caseRows" :key="i"><td v-for="(cell, j) in row" :key="j">{{ cell }}</td></tr></tbody></table></div>
                <template v-if="replayStep === 4"><h3>03 / 分析结论</h3><div class="lf-report-conclusion">{{ selectedExpert.caseConclusion }}</div><h3>04 / 7 天执行计划</h3><div class="lf-report-plan"><p><b>D1—D2</b>　筛选供应商与对标商品，确认价格和规格。</p><p><b>D3—D5</b>　完成样品检验，优化包装、主图及关键词。</p><p><b>D6—D7</b>　小批量试销，对比点击、转化与售后反馈。</p></div></template>
              </div>
            </article>
            <div v-else class="lf-replay-placeholder">{{ replaying ? '正在按本地样例逐步生成案例…' : '点击继续回放，查看分析过程与报告' }}</div>
          </div>
          <aside class="lf-expert-side"><h2>{{ selectedExpert.name }}</h2><p class="lf-muted">{{ selectedExpert.desc }}</p><button class="lf-primary lf-full" @click="useExpert(selectedExpert)">做同款</button><button class="lf-full" @click="startExpert('基于此创建', selectedExpert)">基于此创建我的专家</button><button v-if="selectedExpert.source === 'user'" class="lf-full lf-danger" @click="requestDelete('expert', selectedExpert)">删除专家</button>
            <details open><summary>核心能力</summary><ul class="lf-capabilities"><li v-for="capability in selectedExpert.capabilities" :key="capability">{{ capability }}</li></ul></details>
            <h3>参考提示词</h3><div v-for="prompt in selectedExpert.prompts" :key="prompt" class="lf-prompt"><p>{{ prompt }}</p><button class="lf-text" @click="copy(prompt)">复制提示词</button></div>
            <template v-if="selectedExpert.wordLibraryIds?.length || selectedExpert.productLibraryIds?.length || selectedExpert.references?.length"><h3>引用资源</h3><div class="lf-tags"><span v-for="id in selectedExpert.wordLibraryIds" :key="id">{{ wordLibraries.find(row => row.id === id)?.name || id }}</span><span v-for="id in selectedExpert.productLibraryIds" :key="id">{{ productLibraries.find(row => row.id === id)?.name || id }}</span><span v-for="id in selectedExpert.references" :key="id">{{ state.skills.find(row => row.id === id)?.name || id }}</span></div></template>
            <p v-if="message" class="lf-muted" role="status">{{ message }}</p>
          </aside>
        </template>
        <template v-else-if="modal === 'expert-create'"><h2>创建跨境专家</h2><p class="lf-muted">选择适合你的创建方式</p><div class="lf-two lf-creation"><button @click="startExpert('自由创建')"><span class="lf-avatar">＋</span><h3>自由创建</h3><p>从任务目标开始，完整编辑专家</p></button><button @click="startExpert('基于官方专家创建', officialExperts[0])"><span class="lf-avatar">模</span><h3>基于官方专家创建</h3><p>从 {{ officialExperts.length }} 个专家模板中选择并修改</p></button></div><button class="lf-full lf-text" @click="startExpert('表单创建')">使用表单方式创建 →</button></template>
        <template v-else-if="modal === 'skill-create'"><h2>创建自定义技能</h2><p class="lf-muted">本地技能编辑器，保存后可在我的技能中使用。</p><form class="lf-form" @submit.prevent="saveSkill"><label>名称 *<input v-model="skillForm.name" required maxlength="80" /></label><label>描述 *<textarea v-model="skillForm.desc" required rows="3" /></label><label>分类<select v-model="skillForm.category"><option v-for="s in scenes.slice(1)" :key="s">{{ s }}</option></select></label><label>标签（逗号分隔）<input v-model="skillForm.tags" /></label><label>指令 Markdown *<textarea v-model="skillForm.instructions" required rows="7" placeholder="# 目标&#10;## 执行步骤&#10;## 输出要求" /></label><footer class="lf-actions"><button type="button" @click="modal = ''">取消</button><button type="submit" class="lf-primary">保存技能</button></footer></form></template>
        <template v-else-if="modal === 'references'"><h2>引用{{ referenceKind }}</h2><template v-if="referenceKind === '技能'"><p class="lf-muted">选择已有技能引用，不会自动安装或执行。</p><label v-for="s in state.skills" :key="s.id" class="lf-check"><input v-model="expertForm.refs" type="checkbox" :value="s.id" />{{ s.name }}</label></template><template v-else-if="referenceKind === '词库'"><label v-for="row in wordLibraries" :key="row.id" class="lf-check"><input v-model="expertForm.wordLibraryIds" type="checkbox" :value="row.id" /><span>{{ row.name }}<small class="lf-resource-detail">{{ row.detail }}</small></span></label></template><template v-else><label v-for="row in productLibraries" :key="row.id" class="lf-check"><input v-model="expertForm.productLibraryIds" type="checkbox" :value="row.id" /><span>{{ row.name }}<small class="lf-resource-detail">{{ row.detail }}</small></span></label></template><footer class="lf-actions"><button class="lf-primary" @click="modal = ''">完成</button></footer></template>
        <template v-else-if="modal === 'api'"><h2>API 设置</h2><p class="lf-muted">配置仅保留在本次会话，不发起网络请求。</p><form class="lf-form" @submit.prevent="saveApi"><label>API URL<input v-model="apiForm.url" type="url" placeholder="https://api.example.com" /></label><label>API 密钥<input v-model="apiForm.key" type="password" autocomplete="off" /></label><footer class="lf-actions"><button type="button" @click="modal = ''">取消</button><button class="lf-primary" type="submit">保存配置</button></footer></form></template>
        <template v-else-if="modal === 'mcp'"><h2>{{ mcpForm.id ? '编辑' : '自定义' }} MCP</h2><p class="lf-muted">连接测试为本地模拟校验，凭据仅在本次会话保留。</p><form class="lf-form" @submit.prevent="saveMcp"><label>服务器名称 *<input v-model="mcpForm.name" required maxlength="100" /></label><label>服务器 URL *<input v-model="mcpForm.url" type="url" required placeholder="https://example.com/mcp" /></label><small class="lf-muted">请将认证信息填入凭据栏，URL 不支持查询参数或内嵌凭据。</small><label>协议<select v-model="mcpForm.protocol"><option>Streamable HTTP</option><option>SSE</option></select></label><label>认证类型<select v-model="mcpForm.auth"><option>无认证</option><option>Bearer Token</option><option>API Key</option></select></label><label v-if="mcpForm.auth !== '无认证'">认证凭据<input v-model="mcpForm.credential" type="password" autocomplete="off" placeholder="刷新页面后需要重新填写" /></label><label>说明<textarea v-model="mcpForm.desc" rows="3" /></label><div class="lf-row"><button type="button" :disabled="connectionTests.form === '测试中…'" @click="testConnection('form', mcpForm.name, mcpForm.url, mcpForm.auth, mcpForm.credential)">模拟测试连接</button><span role="status">{{ connectionTests.form }}</span></div><footer class="lf-actions"><button type="button" @click="modal = ''">取消</button><button type="submit" class="lf-primary">保存</button></footer></form></template>
        <template v-else-if="modal === 'import'"><h2>通过 JSON 导入 MCP</h2><p class="lf-muted">仅支持 HTTP(S) 的 Streamable HTTP/SSE 服务：{"name":"服务名称","url":"https://example.com/mcp"}、服务数组或 mcpServers 对象。不支持 command/args 本地进程配置，不执行本地命令。认证字段不会导入。</p><form class="lf-form" @submit.prevent="importMcp"><label>JSON 配置<textarea v-model="importText" required rows="12" spellcheck="false" /></label><p v-if="importError" class="lf-danger" role="alert">{{ importError }}</p><footer class="lf-actions"><button type="button" @click="modal = ''">取消</button><button type="submit" class="lf-primary">校验并导入</button></footer></form></template>
        <template v-else-if="modal === 'delete'"><h2>{{ deleting?.kind === 'uninstall' ? '卸载技能？' : '确认删除？' }}</h2><p>确认{{ deleting?.kind === 'uninstall' ? '卸载' : '删除' }}「{{ deleting?.name }}」？{{ deleting?.kind === 'mcp' ? '此操作也会清除本次会话中的凭据。' : deleting?.kind === 'skill' ? '此操作会清除安装记录及专家中的技能引用。' : '' }}</p><footer class="lf-actions"><button @click="modal = ''">取消</button><button class="lf-danger" @click="confirmDelete">{{ deleting?.kind === 'uninstall' ? '确认卸载' : '确认删除' }}</button></footer></template>
      </section>
    </div>
  </div>
</template>

<style scoped>
.lf-panel{background:#071018;color:#e5f3f4;font-size:14px;--lf-purple:#a78bfa;--lf-muted:#8ba0aa;--lf-cyan:#4de2cf;--lf-border:rgba(116,180,190,.15);--lf-surface:#0c1a24;--lf-surface-raised:#10232e;isolation:isolate}.lf-panel:before{content:'';position:absolute;inset:0;z-index:-1;pointer-events:none;background-image:linear-gradient(rgba(77,226,207,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(77,226,207,.025) 1px,transparent 1px),radial-gradient(ellipse at 74% 0%,rgba(84,78,180,.17),transparent 45%);background-size:32px 32px,32px 32px,auto}.lf-panel *{box-sizing:border-box}.lf-panel button,.lf-panel input,.lf-panel select,.lf-panel textarea{font:inherit}.lf-panel button{cursor:pointer;border:1px solid var(--lf-border);border-radius:7px;padding:9px 15px;background:#0e1c26;color:#c7dadd;transition:background .16s,border-color .16s,color .16s,box-shadow .16s}.lf-panel button:hover{border-color:rgba(77,226,207,.46);color:var(--lf-cyan);background:#122832}.lf-panel button:disabled{cursor:default;opacity:.5}.lf-panel button:focus-visible,.lf-card:focus-visible{outline:2px solid var(--lf-cyan);outline-offset:3px}.lf-panel h2{font-size:22px;font-weight:600;margin:0 0 12px;color:#f0fafb}.lf-panel h3{font-size:15px;font-weight:600;margin:0 0 10px;color:#e5f3f4}.lf-panel p{line-height:1.75;margin:8px 0 16px}.lf-panel .lf-primary{background:linear-gradient(110deg,#176b6a,#44357c);border-color:rgba(77,226,207,.38);color:#e9ffff;box-shadow:0 0 22px rgba(58,203,190,.12)}.lf-panel .lf-primary:hover{background:linear-gradient(110deg,#218b83,#574598);border-color:var(--lf-cyan);color:#fff;box-shadow:0 0 24px rgba(58,203,190,.22)}.lf-muted{color:var(--lf-muted)}.lf-header{height:54px;min-height:54px;padding:0 24px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--lf-border);background:rgba(7,16,24,.92);backdrop-filter:blur(16px);color:#e4f6f5}.lf-panel .lf-icon-button{border:0;background:transparent;font-size:25px;padding:2px 10px;color:#91a7b1}.lf-panel .lf-demo-badge{color:var(--lf-cyan);background:rgba(77,226,207,.08);border-color:rgba(77,226,207,.23)}.lf-nav{display:flex;gap:30px;min-height:58px;background:rgba(9,20,29,.88);padding:0 24px;border-bottom:1px solid var(--lf-border);backdrop-filter:blur(16px)}.lf-nav button,.lf-subtabs button{border:0;border-radius:0;background:transparent;padding:17px 2px;color:#8299a4;font-weight:500;position:relative}.lf-nav .lf-active,.lf-subtabs .lf-active{color:var(--lf-cyan)}.lf-active:after{content:'';position:absolute;bottom:0;height:2px;left:0;right:0;background:var(--lf-cyan);box-shadow:0 0 10px rgba(77,226,207,.65);border-radius:3px}.lf-content{overflow:auto;flex:1;padding:24px;min-height:0}.lf-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:22px;flex-wrap:wrap}.lf-toolbar h2{margin:0}.lf-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.lf-grow{flex:1;min-width:120px}.lf-subtabs{display:flex;gap:26px;font-size:18px}.lf-subtabs button{font-size:18px}.lf-panel input:not([type=checkbox]),.lf-panel textarea,.lf-panel select{border:1px solid var(--lf-border);border-radius:7px;background:#091721;padding:10px 12px;color:#d9ebed;outline:none;min-width:0}.lf-panel input::placeholder,.lf-panel textarea::placeholder{color:#607984}.lf-panel input:focus,.lf-panel textarea:focus,.lf-panel select:focus{border-color:rgba(77,226,207,.65);box-shadow:0 0 0 3px rgba(77,226,207,.08)}.lf-search{width:220px}.lf-filter{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px}.lf-filter>span:first-child{color:#8ba0aa;min-width:42px}.lf-filter button{border:0;background:transparent;padding:7px 14px}.lf-panel .lf-selected{color:var(--lf-cyan);background:rgba(77,226,207,.09);border-color:rgba(77,226,207,.24)}.lf-filter-box{margin-bottom:24px}.lf-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:24px}.lf-white,.lf-card{background:linear-gradient(145deg,rgba(15,31,42,.96),rgba(10,23,32,.98));border-radius:9px;border:1px solid var(--lf-border);box-shadow:inset 0 1px rgba(255,255,255,.018)}.lf-card{padding:21px;min-width:0;cursor:pointer;transition:transform .18s,border-color .18s,box-shadow .18s}.lf-card:hover{transform:translateY(-2px);border-color:rgba(77,226,207,.32);box-shadow:0 10px 28px rgba(0,0,0,.24),0 0 20px rgba(77,226,207,.05)}.lf-card h3{line-height:1.5;overflow-wrap:anywhere}.lf-card p{color:#91a6ae;font-size:13px}.lf-clamp{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:45px;line-height:1.75}.lf-card-foot{border-top:1px solid var(--lf-border);padding-top:15px;margin-top:17px;display:flex;align-items:center;justify-content:space-between;font-size:12px;color:#8199a3;min-height:41px;gap:8px}.lf-hover-action{display:none}.lf-expert-card:hover .lf-hover-action,.lf-expert-card:focus-within .lf-hover-action{display:block;padding:3px 8px;color:var(--lf-cyan)}.lf-expert-card:hover .lf-usage,.lf-expert-card:focus-within .lf-usage{display:none}.lf-avatar{display:inline-flex;width:40px;height:40px;background:linear-gradient(145deg,rgba(77,226,207,.16),rgba(167,139,250,.19));color:var(--lf-cyan);border:1px solid rgba(77,226,207,.2);border-radius:8px;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;font-weight:600}.lf-large{width:64px;height:64px;font-size:27px}.lf-tags{display:flex;gap:7px;flex-wrap:wrap;margin-top:14px}.lf-tags span,.lf-tag{background:rgba(124,157,171,.09);border:1px solid rgba(124,157,171,.1);color:#a0b4bd;font-size:12px;border-radius:5px;padding:4px 8px}.lf-pagination{display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-top:30px;color:#8ba0aa}.lf-pagination button{padding:6px 12px}.lf-empty{padding:65px 20px;text-align:center;color:#8ba0aa;line-height:1.8}.lf-featured{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:30px}.lf-featured>button{text-align:left;padding:20px;border-radius:9px}.lf-featured h3{margin-top:14px}.lf-featured p{color:#91a6ae;font-size:12px}.lf-notice{padding:10px 24px;color:#a8f1e7;background:rgba(77,226,207,.08);border-block:1px solid rgba(77,226,207,.15);display:flex;justify-content:space-between;gap:15px;line-height:1.7}.lf-notice button{border:0;background:none;padding:0 6px}.lf-form-page{max-width:880px;margin:0 auto}.lf-panel .lf-text{border:0;background:transparent;color:#8ba0aa;padding:8px 0}.lf-form-page>h2{margin-top:18px}.lf-form{display:flex;flex-direction:column;gap:20px}.lf-form.lf-white{padding:30px}.lf-form label{display:flex;flex-direction:column;gap:9px;line-height:1.5}.lf-form input,.lf-form textarea,.lf-form select{width:100%}.lf-form textarea{resize:vertical}.lf-required,.lf-panel .lf-danger{color:#ff8292}.lf-two{display:grid;grid-template-columns:1fr 1fr;gap:20px}.lf-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:20px}.lf-overlay{position:fixed;inset:0;background:rgba(1,7,12,.76);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;z-index:2;padding:24px}.lf-dialog{position:relative;background:#0c1a24;border:1px solid rgba(126,177,190,.2);border-radius:12px;width:620px;max-width:100%;max-height:calc(100dvh - 100px);overflow:auto;padding:32px;box-shadow:0 30px 90px rgba(0,0,0,.55),0 0 42px rgba(91,88,178,.12)}.lf-dialog-close{position:absolute;right:12px;top:10px;z-index:2}.lf-dialog>h2{padding-right:25px}.lf-expert-dialog{width:1000px;height:min(680px,calc(100dvh - 100px));display:grid;grid-template-columns:65% 35%;padding:0;overflow:hidden;max-width:100%;min-width:0}.lf-case{background:linear-gradient(150deg,#09141d,#0c1822);padding:30px;overflow:auto;min-width:0}.lf-case>h2{margin-top:24px}.lf-example{padding:25px;background:linear-gradient(155deg,#101f2a,#0b1821);border:1px solid var(--lf-border);border-radius:9px;margin-top:24px;line-height:1.8}.lf-example h3:not(:first-child){margin-top:28px}.lf-example ol{padding-left:22px;color:#a3b5bc}.lf-expert-side{padding:40px 24px 24px;overflow:auto;background:rgba(12,26,36,.94);border-left:1px solid var(--lf-border)}.lf-expert-side>h2{font-size:19px;line-height:1.6}.lf-full{display:block;width:100%;margin-bottom:12px}.lf-expert-side details{border-top:1px solid var(--lf-border);border-bottom:1px solid var(--lf-border);padding:18px 0;margin:25px 0;line-height:1.8}.lf-expert-side summary{cursor:pointer;font-weight:600}.lf-panel pre{white-space:pre-wrap;overflow-wrap:anywhere;font-family:inherit;font-size:13px;line-height:1.9;color:#a8bbc2;background:#091721;border:1px solid var(--lf-border);border-radius:7px;padding:16px}.lf-expert-side .lf-row{justify-content:space-between}.lf-creation{margin:26px 0}.lf-creation>button{text-align:left;min-height:190px;padding:22px}.lf-creation h3{margin-top:20px}.lf-creation p{font-size:13px;color:#91a6ae}.lf-check{display:flex;align-items:center;gap:12px;padding:14px;border-bottom:1px solid var(--lf-border)}.lf-check input{accent-color:var(--lf-cyan)}.lf-detail-top{margin-bottom:25px;color:#8ba0aa}.lf-skill-hero{padding:28px;display:flex;align-items:center;gap:20px;flex-wrap:wrap}.lf-overview{border-bottom:1px solid var(--lf-border);padding:25px 0 15px;margin-bottom:24px;color:var(--lf-cyan);position:relative}.lf-overview:after{content:'';width:30px;height:2px;background:var(--lf-cyan);box-shadow:0 0 9px rgba(77,226,207,.55);position:absolute;bottom:-1px;left:0}.lf-skill-columns{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:24px;align-items:start}.lf-prose,.lf-meta{padding:28px;line-height:1.9}.lf-prose h3:not(:first-child){margin-top:26px}.lf-meta p{display:flex;justify-content:space-between;gap:12px;color:#91a6ae;font-size:12px}.lf-meta strong{font-weight:400;color:#d1e1e4;text-align:right}.lf-meta small{display:block;color:#8ba0aa}.lf-dropdown{position:relative}.lf-menu{position:absolute;top:calc(100% + 8px);right:0;background:#10232e;border:1px solid var(--lf-border);box-shadow:0 12px 32px rgba(0,0,0,.4);padding:6px;border-radius:8px;z-index:1;width:200px}.lf-menu button{display:block;width:100%;text-align:left;border:0}.lf-mcp-list{display:flex;flex-direction:column;gap:12px}.lf-mcp{padding:22px}.lf-mcp h3{margin-bottom:4px}.lf-mcp .lf-url{color:#8ba0aa;font-size:12px;margin:0;overflow-wrap:anywhere}.lf-enabled{color:var(--lf-cyan);font-size:12px}.lf-mcp-tools{margin-top:18px}.lf-mcp-tools button{font-size:12px;padding:6px 10px}.lf-guide{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:28px}.lf-guide article{padding:22px}.lf-guide p{color:#91a6ae;font-size:13px;margin-bottom:0}@media(max-width:1100px){.lf-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.lf-featured{grid-template-columns:repeat(2,minmax(0,1fr))}.lf-skill-columns{grid-template-columns:minmax(0,1fr) 240px}.lf-expert-dialog{grid-template-columns:60% 40%}}@media(max-width:760px){.lf-content{padding:18px}.lf-toolbar{align-items:flex-start}.lf-search{width:170px}.lf-guide,.lf-skill-columns{grid-template-columns:1fr}.lf-expert-dialog{display:block;overflow:auto}.lf-case,.lf-expert-side{overflow:visible}.lf-two{grid-template-columns:1fr}.lf-dialog{padding:24px}.lf-expert-dialog{padding:0}.lf-grid{gap:12px}.lf-card{padding:16px}.lf-nav{gap:18px}.lf-form.lf-white{padding:20px}}
.lf-form-page .lf-form.lf-white{padding:8px 30px 24px;gap:0;border-radius:16px}
.lf-form-page .lf-expert-form-row{display:flex;gap:24px;padding:26px 0;border-bottom:1px solid #efeff3;align-items:flex-start}
.lf-form-page .lf-field-label{display:block;flex:0 0 130px;width:130px;padding-top:10px;line-height:1.5;font-weight:500}
.lf-form-page .lf-field-content{flex:1;min-width:0}
.lf-form-page .lf-template-area{border:1px solid #e3cefc;border-radius:12px;background:#fcfaff;padding:16px}
.lf-form-page .lf-template-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px;font-size:13px}
.lf-form-page .lf-template-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.lf-form-page .lf-template-card{display:flex;flex-direction:column;gap:7px;min-width:0;padding:14px;text-align:left;border:1px solid #ece7f3;border-radius:8px;background:#fff}
.lf-form-page .lf-template-title{font-weight:500;line-height:1.5;overflow-wrap:anywhere}
.lf-form-page .lf-template-desc{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;color:var(--lf-muted);font-size:12px;line-height:1.7}
.lf-form-page .lf-template-card.lf-template-selected{border-color:var(--lf-purple);background:#f5edff;color:var(--lf-purple)}
.lf-form-page .lf-template-toggle{display:block;margin:14px auto 0;padding:4px 8px;border:0;background:transparent;color:var(--lf-purple);font-size:13px}
.lf-form-page .lf-custom-expert{margin-top:16px;padding:16px;border:1px dashed #dcdce3;border-radius:10px;background:#f9f9fa}
.lf-form-page .lf-custom-expert label{margin-bottom:10px;color:#74747e;font-size:13px}
.lf-form-page .lf-description-editor{border:1px solid #e3e3e8;border-radius:10px;overflow:hidden}
.lf-form-page .lf-description-editor:focus-within{border-color:var(--lf-purple)}
.lf-form-page .lf-description-editor textarea{display:block;border:0;border-radius:0;min-height:180px}
.lf-form-page .lf-description-tools{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:10px 12px;background:#f7f7f9;border-top:1px solid #efeff3;font-size:12px;color:var(--lf-muted)}
.lf-form-page .lf-description-tools button{border:0;background:transparent;padding:5px 8px;font-size:12px;color:#74747e}
.lf-form-page .lf-skill-priority{display:flex;align-items:center;flex-wrap:wrap;gap:12px}
.lf-form-page .lf-skill-priority button{border-color:#e3cefc;background:#faf5ff;color:var(--lf-purple)}
.lf-form-page .lf-skill-priority span{font-size:12px}
.lf-form-page .lf-extra-settings{display:flex;flex-wrap:wrap;gap:20px}
.lf-form-page .lf-extra-settings label{flex:1;min-width:140px;flex-direction:row;align-items:center;gap:12px;color:#74747e;font-size:13px}
.lf-form-page .lf-extra-settings select{flex:1;width:auto}
.lf-form-page .lf-actions{margin-top:24px}
.lf-form-page .lf-primary:disabled,.lf-form-page .lf-primary:disabled:hover{background:#c9a5ef;border-color:#c9a5ef;color:#fff;cursor:not-allowed}
@media(max-width:760px){
  .lf-form-page .lf-form.lf-white{padding:0 20px 20px}
  .lf-form-page .lf-expert-form-row{flex-direction:column;gap:12px;padding:20px 0}
  .lf-form-page .lf-field-label{flex:auto;width:100%;padding-top:0}
  .lf-form-page .lf-field-content{flex:auto;width:100%}
  .lf-form-page .lf-template-area{padding:12px}
  .lf-form-page .lf-template-card{padding:10px}
}
@media(max-width:420px){.lf-form-page .lf-template-grid{grid-template-columns:1fr}.lf-form-page .lf-extra-settings{flex-direction:column}}
.lf-demo-badge{font-size:10px;font-weight:500;color:var(--lf-cyan);background:rgba(77,226,207,.07);border:1px solid rgba(77,226,207,.22);border-radius:4px;padding:3px 7px;margin-left:10px;letter-spacing:.04em}.lf-resource-detail{display:block;color:#91a6ae;line-height:1.7;margin-top:5px}.lf-report-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;padding-right:10px;flex-wrap:wrap}.lf-report-toolbar button{padding:6px 9px;font-size:12px}.lf-replay-label{font-size:11px;color:#a99adc}.lf-user-bubble{margin:20px 0 24px 32px;background:linear-gradient(130deg,rgba(73,79,144,.25),rgba(38,113,119,.2));border:1px solid rgba(141,156,234,.2);border-radius:12px 12px 3px 12px;padding:16px 20px;font-size:13px;line-height:1.9;color:#d5d8f3}.lf-tool-timeline{margin:0 0 24px 8px;display:grid;gap:12px}.lf-tool-timeline>div{display:flex;gap:12px;align-items:center;color:#728993}.lf-tool-timeline>div>span{width:25px;height:25px;border:1px solid var(--lf-border);background:#0c1b25;border-radius:50%;display:grid;place-items:center;font-size:11px}.lf-tool-timeline strong{font-size:12px;font-weight:500}.lf-tool-timeline small{display:block;font-size:10px;margin-top:3px}.lf-tool-timeline .lf-step-done{color:#9cb4bc}.lf-tool-timeline .lf-step-done>span{color:var(--lf-cyan);border-color:rgba(77,226,207,.35);background:rgba(77,226,207,.08)}.lf-tool-timeline .lf-step-running{color:var(--lf-cyan)}.lf-report{border:1px solid rgba(115,155,180,.22);border-radius:9px;overflow:hidden;background:#0d1b25;box-shadow:0 16px 38px rgba(0,0,0,.25)}.lf-report-cover{background:linear-gradient(118deg,#102c38,#202348 64%,#332956);padding:30px 24px;color:white;border-bottom:1px solid rgba(136,154,223,.2)}.lf-report-cover small{font-size:10px;letter-spacing:2px;color:#75e5d6}.lf-report-cover h2{margin:16px 0 10px;font-size:21px;line-height:1.6}.lf-report-cover p{font-size:12px;color:#b9cbd2;margin-bottom:18px}.lf-report-cover>span{font-size:10px;color:#8faab4}.lf-report-body{padding:26px 22px}.lf-report-body h3{font-size:13px;color:#9fe7de;margin:26px 0 16px}.lf-report-body h3:first-child{margin-top:0}.lf-report-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.lf-report-metrics>div{background:linear-gradient(145deg,rgba(77,226,207,.07),rgba(167,139,250,.06));border:1px solid rgba(113,173,181,.16);padding:14px;border-radius:7px}.lf-report-metrics small{display:block;font-size:10px;color:#8ba5ae}.lf-report-metrics strong{display:block;font-size:23px;color:#7de4d5;margin-top:10px;font-weight:600}.lf-report-table{display:block;width:100%;max-width:100%;min-width:0;overflow-x:auto;text-align:left}.lf-report table{width:100%;min-width:320px;table-layout:fixed;margin:0;border-collapse:collapse;white-space:normal;font-size:11px;text-align:left}.lf-report th{background:#122430;color:#a2b8c1;font-weight:500}.lf-report th,.lf-report td{padding:12px 9px;border-bottom:1px solid var(--lf-border);overflow-wrap:anywhere;vertical-align:top}.lf-report th:first-child,.lf-report td:first-child{width:28%}.lf-report th:last-child,.lf-report td:last-child{width:25%}.lf-report td:last-child{color:var(--lf-cyan)}.lf-report-conclusion{font-size:12px;line-height:1.9;color:#b4c4cd;background:rgba(77,226,207,.045);border-left:2px solid var(--lf-cyan);padding:16px}.lf-report-plan p{font-size:11px;color:#98abb5;margin:10px 0}.lf-report-plan b{color:#bea9ff}.lf-capabilities{padding-left:18px;color:#a8bac1;font-size:13px}.lf-capabilities li{margin:10px 0}.lf-prompt{background:#0a1720;border:1px solid var(--lf-border);border-radius:7px;padding:12px 14px;margin-bottom:12px}.lf-prompt p{font-size:12px;color:#a8b7c0;margin:0;line-height:1.9}.lf-prompt .lf-text{font-size:11px;color:#a78bfa;padding-bottom:0}.lf-replay-placeholder{padding:40px 16px;text-align:center;background:#0c1a24;border:1px dashed rgba(77,226,207,.24);border-radius:9px;color:#8ba0aa;font-size:12px}.lf-case-expanded{width:1380px;height:calc(100dvh - 60px);max-height:calc(100dvh - 60px);grid-template-columns:minmax(0,1fr) 310px}.lf-case-expanded .lf-case{padding:32px 48px}.lf-case-expanded .lf-report-cover{padding:40px}.lf-case-expanded .lf-report-body{padding:30px 40px}@media(max-width:760px){.lf-case-expanded .lf-case{padding:24px}.lf-case-expanded .lf-report-body{padding:20px}.lf-report-metrics strong{font-size:18px}.lf-report-toolbar{padding-right:18px}.lf-report-toolbar .lf-row{gap:5px}}
/* 清狐式浅色工作台主题 */
.lf-panel{background:#f5f6f7;color:#1d2129;--lf-purple:#08c18a;--lf-muted:#86909c;--lf-cyan:#08c18a;--lf-border:#e5e6eb;--lf-surface:#fff;--lf-surface-raised:#fff;isolation:isolate}
.lf-panel:before{background:none}
.lf-panel button{border-color:#e5e6eb;border-radius:6px;background:#fff;color:#4e5969;box-shadow:none}
.lf-panel button:hover{border-color:#08c18a;color:#08a979;background:#f2fbf8;box-shadow:none}
.lf-panel button:focus-visible,.lf-card:focus-visible{outline:2px solid #08c18a;outline-offset:2px}
.lf-panel h2{font-size:20px;color:#1d2129}.lf-panel h3{color:#1d2129}.lf-panel p{color:#4e5969}
.lf-panel .lf-primary{background:#08c18a;border-color:#08c18a;color:#fff;box-shadow:0 4px 10px rgba(8,193,138,.16)}
.lf-panel .lf-primary:hover{background:#06ad7b;border-color:#06ad7b;color:#fff;box-shadow:0 5px 14px rgba(8,193,138,.2)}
.lf-muted{color:#86909c}
.lf-header{background:#fff;color:#1d2129;border-bottom-color:#e5e6eb;backdrop-filter:none}
.lf-panel .lf-icon-button{color:#86909c}.lf-panel .lf-demo-badge{color:#08a979;background:#e9faf4;border-color:#c6f0e2}
.lf-nav{background:#fff;border-bottom-color:#e5e6eb;backdrop-filter:none}.lf-nav button,.lf-subtabs button{color:#86909c}.lf-nav .lf-active,.lf-subtabs .lf-active{color:#08a979}.lf-active:after{background:#08c18a;box-shadow:none}
.lf-content{background:#f5f6f7}
.lf-panel input:not([type=checkbox]),.lf-panel textarea,.lf-panel select{border-color:#e5e6eb;background:#fff;color:#1d2129}.lf-panel input::placeholder,.lf-panel textarea::placeholder{color:#c0c4cc}.lf-panel input:focus,.lf-panel textarea:focus,.lf-panel select:focus{border-color:#08c18a;box-shadow:0 0 0 3px rgba(8,193,138,.1)}
.lf-panel .lf-selected{color:#08a979;background:#e9faf4;border-color:#e9faf4}
.lf-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-top:18px}
.lf-white,.lf-card{background:#fff;border-color:#e5e6eb;border-radius:9px;box-shadow:0 1px 2px rgba(29,33,41,.03)}
.lf-card{padding:18px;transition:border-color .18s,box-shadow .18s,transform .18s}.lf-card:hover{transform:translateY(-1px);border-color:#b7eadb;box-shadow:0 7px 18px rgba(29,33,41,.07)}
.lf-card h3{color:#1d2129}.lf-card p{color:#4e5969}.lf-card-foot{border-top-color:#f2f3f5;color:#86909c;padding-top:13px;margin-top:15px}.lf-expert-card:hover .lf-hover-action,.lf-expert-card:focus-within .lf-hover-action{color:#08a979}
.lf-avatar{background:#e9faf4;color:#08a979;border-color:#c6f0e2}.lf-tags span,.lf-tag{background:#f2f3f5;border-color:#f2f3f5;color:#86909c}
.lf-pagination{color:#86909c}.lf-empty{color:#86909c}.lf-featured{grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.lf-featured>button{border-radius:8px}.lf-featured p{color:#86909c}
.lf-notice{color:#07825f;background:#e9faf4;border-color:#c6f0e2}
.lf-overlay{background:rgba(29,33,41,.38);backdrop-filter:blur(3px)}.lf-dialog{background:#fff;border-color:#e5e6eb;border-radius:12px;box-shadow:0 16px 40px rgba(29,33,41,.16)}
.lf-case{background:#f5f6f7}.lf-example{background:#fff;border-color:#e5e6eb;box-shadow:0 1px 2px rgba(29,33,41,.03)}.lf-expert-side{background:#fff;border-left-color:#e5e6eb}.lf-expert-side details{border-color:#e5e6eb}.lf-panel pre{color:#4e5969;background:#f7f8fa;border-color:#e5e6eb}.lf-check{border-bottom-color:#e5e6eb}.lf-check input{accent-color:#08c18a}
.lf-skill-hero,.lf-prose,.lf-meta{background:#fff}.lf-overview{color:#08a979;border-bottom-color:#e5e6eb}.lf-overview:after{background:#08c18a;box-shadow:none}.lf-meta p{color:#86909c}.lf-meta strong{color:#4e5969}
.lf-menu{background:#fff;border-color:#e5e6eb;box-shadow:0 8px 24px rgba(29,33,41,.12)}.lf-mcp .lf-url{color:#86909c}.lf-enabled{color:#08a979}
.lf-report{background:#fff;border-color:#e5e6eb;box-shadow:0 8px 22px rgba(29,33,41,.06)}.lf-report-cover{background:linear-gradient(120deg,#08c18a,#0aa6b6);border-bottom:0}.lf-report-cover small{color:#dffbf4}.lf-report-cover p{color:#e5fffa}.lf-report-body h3{color:#08a979}.lf-report-metrics>div{background:#f2fbf8;border-color:#d9f3ea}.lf-report-metrics small{color:#86909c}.lf-report-metrics strong{color:#07825f}.lf-report th{background:#f2f3f5;color:#4e5969}.lf-report th,.lf-report td{border-bottom-color:#e5e6eb}.lf-report td:last-child{color:#08a979}.lf-report-conclusion{color:#4e5969;background:#f2fbf8;border-left-color:#08c18a}.lf-report-plan p,.lf-capabilities,.lf-prompt p{color:#4e5969}.lf-prompt{background:#f7f8fa;border-color:#e5e6eb}.lf-prompt .lf-text{color:#08a979}.lf-replay-placeholder{background:#fff;border-color:#b7eadb;color:#86909c}
.lf-case-expanded .lf-case{background:#f5f6f7}
@media(max-width:1280px){.lf-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:900px){.lf-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.lf-featured{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:760px){.lf-grid{grid-template-columns:1fr}.lf-featured{display:flex;overflow-x:auto;padding-bottom:6px}.lf-featured>button{min-width:260px}.lf-content{padding:16px}.lf-nav{overflow-x:auto;gap:20px}.lf-nav button{white-space:nowrap}}

/* 专家工作台新布局 */
.lf-expert-workspace{display:flex;flex-direction:column;gap:24px}
.lf-expert-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:0}
.lf-expert-actions{display:flex;align-items:center;gap:12px}
.lf-scenes-head{display:flex;align-items:center;justify-content:space-between;margin-top:8px}
.lf-scenes-head h2{margin:0;font-size:18px;font-weight:600}
.lf-scene-strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-top:12px}
.lf-scene-card{position:relative;padding:20px;border-radius:12px;border:1px solid transparent;cursor:pointer;transition:all .2s;display:flex;flex-direction:column;gap:12px;min-height:120px;overflow:hidden}
.lf-scene-card:before{content:'';position:absolute;inset:0;opacity:0;transition:opacity .2s;background:linear-gradient(135deg,rgba(255,255,255,.1),rgba(255,255,255,0));pointer-events:none}
.lf-scene-card:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,.08)}
.lf-scene-card:hover:before{opacity:1}
.lf-scene-card>div{flex:1;min-width:0}
.lf-scene-card strong{display:block;font-size:15px;font-weight:600;margin-bottom:4px;color:#1d2129}
.lf-scene-card small{display:block;font-size:12px;color:#4e5969;line-height:1.5}
.lf-scene-card button{align-self:flex-start;padding:6px 14px;font-size:12px;border-radius:6px;border:1px solid currentColor;background:transparent;color:inherit;transition:all .15s}
.lf-scene-card button:hover{background:rgba(255,255,255,.2);border-color:transparent}
.lf-scene-mark{position:absolute;top:14px;right:14px;font-size:11px;font-weight:600;padding:3px 8px;border-radius:4px;background:rgba(255,255,255,.25);color:inherit;letter-spacing:.5px}
.lf-scene-1688{background:linear-gradient(135deg,#ff6a00,#ff9248);color:#fff;border-color:#ff8533}
.lf-scene-amazon{background:linear-gradient(135deg,#232f3e,#3b4a54);color:#fff;border-color:#2c3e50}
.lf-scene-ozon{background:linear-gradient(135deg,#005bff,#6a9dff);color:#fff;border-color:#0066ff}
.lf-scene-temu{background:linear-gradient(135deg,#fb7701,#ff9a3e);color:#fff;border-color:#fb7701}
.lf-list-panel{background:#fff;border:1px solid #e5e6eb;border-radius:12px;padding:20px;margin-top:8px;box-shadow:0 1px 3px rgba(29,33,41,.04)}
.lf-category-filter,.lf-platform-filter{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid #f2f3f5}
.lf-category-filter>span:first-child,.lf-platform-filter>span:first-child{color:#86909c;font-size:13px;min-width:42px;font-weight:500}
.lf-category-filter button,.lf-platform-filter button{border:0;background:transparent;padding:6px 12px;font-size:13px;color:#4e5969;border-radius:6px;transition:all .15s}
.lf-category-filter button:hover,.lf-platform-filter button:hover{background:#f2f3f5;color:#1d2129}
.lf-category-filter .lf-selected,.lf-platform-filter .lf-selected{color:#08a979;background:#e9faf4;font-weight:500}
@media(max-width:1280px){.lf-scene-strip{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:760px){.lf-scene-strip{grid-template-columns:1fr}.lf-expert-toolbar{flex-direction:column;align-items:stretch}.lf-expert-actions{justify-content:space-between}}
</style>
