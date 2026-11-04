<script setup lang="ts">
/* Composer：附件 chips + 自适应输入框 + 发送/停止同位按钮 + 右键菜单 */
import { ref, watch, nextTick, computed, onMounted, onBeforeUnmount } from 'vue'
import { chatState } from '../stores/chat'
import { modals, openInputMenu, closeInputMenu } from '../stores/modals'
import { expertState, type ExpertItem, type SkillItem } from '../stores/expert'
import { skillVisual } from '../stores/skillVisual'
import { flashToast, writeClipboard } from '../utils/common'
import { send } from '../stores/send'

const props = defineProps<{ running: boolean }>()
const emit = defineEmits<{ (e: 'send'): void; (e: 'stop'): void }>()

const inputEl = ref<HTMLTextAreaElement | null>(null)
const attachListEl = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const arLeftShow = ref(false)
const arRightShow = ref(false)

const INPUT_MAX_H = Math.round(13.5 * 1.55 * 5) + 14
function fitInput() {
  const el = inputEl.value
  if (!el) return
  el.style.height = 'auto'
  const h = Math.min(el.scrollHeight, INPUT_MAX_H)
  el.style.height = h + 'px'
  el.style.overflowY = el.scrollHeight > INPUT_MAX_H + 1 ? 'auto' : 'hidden'
}
watch(() => chatState.inputText, () => nextTick(fitInput))

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    if (props.running) {
      flashToast('当前对话正在生成，请等待完成或先停止生成')
      return
    }
    emit('send')
  } else if (e.key === 'Enter') {
    setTimeout(fitInput)
  }
}
function onClickSend() {
  if (props.running) { emit('stop'); return }
  emit('send')
}

/* —— 右键菜单 —— */
function onContext(e: MouseEvent) {
  e.preventDefault()
  const cm = document.getElementById('convMenu')
  if (cm) cm.classList.remove('open')
  openInputMenu(e.clientX, e.clientY)
}
function replaceSelection(text: string) {
  const el = inputEl.value
  if (!el) return
  const s = el.selectionStart, t = el.selectionEnd
  chatState.inputText = chatState.inputText.slice(0, s) + text + chatState.inputText.slice(t)
  const pos = s + text.length
  nextTick(() => { el.focus(); el.setSelectionRange(pos, pos); fitInput() })
}
async function onMenuAct(act: string) {
  const el = inputEl.value
  if (!el) return
  closeInputMenu()
  const sel = chatState.inputText.slice(el.selectionStart, el.selectionEnd)
  if (act === 'cut') {
    const ok = await writeClipboard(sel)
    if (ok) { replaceSelection(''); flashToast('已剪切') }
    else { el.focus(); flashToast('剪切失败，请重试') }
  } else if (act === 'copy') {
    const ok = await writeClipboard(sel)
    el.focus()
    flashToast(ok ? '已复制' : '复制失败，请重试')
  } else if (act === 'paste') {
    let text = ''
    try {
      if (navigator.clipboard && navigator.clipboard.readText) text = await navigator.clipboard.readText()
    } catch (e3) { text = '' }
    if (text) { replaceSelection(text); flashToast('已粘贴') }
    else { el.focus(); flashToast('无法读取剪贴板，请使用 Ctrl+V 粘贴') }
  } else if (act === 'selectAll') {
    el.focus()
    el.select()
  }
}
const hasSel = computed(() => {
  const el = inputEl.value
  return !!el && el.selectionStart !== el.selectionEnd
})

/* —— 附件 —— */
function updateArrows() {
  const el = attachListEl.value
  if (!el) return
  const maxScroll = el.scrollWidth - el.clientWidth
  arLeftShow.value = el.scrollLeft > 4
  arRightShow.value = maxScroll > 4 && el.scrollLeft < maxScroll - 4
}
watch(() => chatState.attaches.length, () => nextTick(updateArrows))
function scrollAttach(dir: number) {
  attachListEl.value?.scrollBy({ left: dir * 220, behavior: 'smooth' })
}
function onFilePick() { fileInput.value?.click() }
function pushAttach(f: File) {
  const meta = detectFileType(f.name)
  chatState.attaches.push({ file: f, name: f.name, size: f.size, ...meta, url: meta.type === 'img' ? URL.createObjectURL(f) : undefined })
}
function onFileChange(e: Event) {
  Array.from((e.target as HTMLInputElement).files || []).forEach(pushAttach)
  // 允许重复选同一文件：清空 value
  ;(e.target as HTMLInputElement).value = ''
}
function onDrop(e: DragEvent) {
  Array.from((e.dataTransfer && e.dataTransfer.files) || []).forEach(pushAttach)
}
function onDragenter(e: DragEvent) { e.preventDefault(); (e.currentTarget as HTMLElement).classList.add('dragging') }
function onDragleave(e: DragEvent) { e.preventDefault(); (e.currentTarget as HTMLElement).classList.remove('dragging') }

/* 附件 chip 图标（原 CHIP_TYPE/CHIP_DRAW/chipIconSVG） */
const CHIP_TYPE: Record<string, { cls: string; bg: string }> = {
  doc: { cls: '', bg: '#4d6bfe' }, file: { cls: '', bg: '#4d6bfe' }, xls: { cls: 'xls', bg: '#17b26a' },
  img: { cls: 'img', bg: '#7a5af8' }, pdf: { cls: 'pdf', bg: '#e5484d' }, code: { cls: 'code', bg: '#0ea5e9' },
  audio: { cls: 'audio', bg: '#f79009' }, video: { cls: 'video', bg: '#d6467e' }, txt: { cls: 'txt', bg: '#64748b' },
  zip: { cls: 'zip', bg: '#b88a44' }
}
const CHIP_DRAW: Record<string, string> = {
  file: '<path d="M8 13h8M8 16.6h5.4" />', doc: '<path d="M8 13h8M8 16.6h5.4" />',
  xls: '<path d="M8 11.5h8M8 15h8M12 11.5v7" />',
  img: '<circle cx="9.4" cy="10.6" r="1.5" fill="#fff" stroke="none"/><path d="M7.2 18l4-4.2 2.6 2.7 2-2.1 2.8 3" />',
  pdf: '<path d="M8 13h8M8 16.6h5.4" />', txt: '<path d="M8 11h8M8 14h8M8 17h5" />',
  code: '<path d="M10.6 9.6L7.8 13l2.8 3.4M13.4 9.6l2.8 3.4-2.8 3.4" />',
  audio: '<path d="M10 17.2V8.6l5.5-1.2v8.4" /><circle cx="8.6" cy="17.3" r="1.5" fill="#fff" stroke="none"/><circle cx="14.1" cy="15.9" r="1.5" fill="#fff" stroke="none"/>',
  video: '<path d="M10.2 9.3l5.6 3.2-5.6 3.2z" fill="#fff" stroke="none"/>',
  zip: '<path d="M12 5.8v2M12 9.4v2M12 13v2" />'
}
function chipIconSVG(type: string): { cls: string; svg: string } {
  const t = CHIP_TYPE[type] || CHIP_TYPE.file
  const draw = CHIP_DRAW[type] || CHIP_DRAW.file
  const svg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none">'
    + '<path d="M6 3h8l5.5 5.5V20a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 20V4.5A1.5 1.5 0 0 1 6 3z" fill="#fff"/>'
    + '<path d="M14 3v4a1.5 1.5 0 0 0 1.5 1.5h4L14 3z" fill="rgba(0,0,0,.14)"/>'
    + '<g stroke="' + t.bg + '" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round">' + draw + '</g>'
    + '</svg>'
  return { cls: t.cls, svg }
}
function detectFileType(name: string) {
  const ext = (name.split('.').pop() || '').toLowerCase()
  const map: Record<string, string> = {
    png: 'img', jpg: 'img', jpeg: 'img', gif: 'img', webp: 'img', svg: 'img', bmp: 'img',
    pdf: 'pdf', doc: 'doc', docx: 'doc', xls: 'xls', xlsx: 'xls', csv: 'xls',
    txt: 'txt', md: 'txt', log: 'txt',
    js: 'code', ts: 'code', json: 'code', py: 'code', java: 'code', html: 'code', css: 'code', xml: 'code', yaml: 'code', yml: 'code', sh: 'code',
    mp3: 'audio', wav: 'audio', flac: 'audio', m4a: 'audio',
    mp4: 'video', mov: 'video', avi: 'video', mkv: 'video', webm: 'video',
    zip: 'zip', rar: 'zip', '7z': 'zip', gz: 'zip', tar: 'zip'
  }
  const type = map[ext] || 'file'
  const icon = ({ img: '🖼', pdf: '📕', doc: '📘', xls: '📗', txt: '📄', code: '⟨⟩', audio: '🎵', video: '🎬', zip: '🗜', file: '📎' } as Record<string, string>)[type]
  return { ext: ext.toUpperCase(), type, icon }
}
function formatSize(b: number) {
  if (b < 1024) return b + ' B'
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB'
  return (b / 1024 / 1024).toFixed(2) + ' MB'
}
function removeAttach(idx: number) {
  const a = chatState.attaches[idx]
  if (a && a.url) URL.revokeObjectURL(a.url)
  chatState.attaches.splice(idx, 1)
}

/* —— 图片附件放大预览（浅色 lightbox：多图分页 + 缩放 + 拖拽平移） —— */
const previewList = computed(() => chatState.attaches.filter(a => a.type === 'img' && a.url))
const previewIdx = ref(-1)
const previewUrl = computed(() => (previewIdx.value >= 0 ? previewList.value[previewIdx.value]?.url : null) || null)
const previewName = computed(() => (previewIdx.value >= 0 ? previewList.value[previewIdx.value]?.name : '') || '')
const zoomPct = ref(100)
const pan = ref({ x: 0, y: 0 })
function openPreview(a: { url?: string; name: string }) {
  const i = previewList.value.findIndex(x => x.url === a.url)
  if (i < 0) return
  previewIdx.value = i
  resetView()
}
function closePreview() { previewIdx.value = -1 }
function resetView() { zoomPct.value = 100; pan.value = { x: 0, y: 0 } }
function stepZoom(dir: number) {
  zoomPct.value = Math.min(300, Math.max(25, zoomPct.value + dir * 25))
  if (zoomPct.value === 100) pan.value = { x: 0, y: 0 }
}
function navPreview(dir: number) {
  const n = previewList.value.length
  if (n < 2) return
  previewIdx.value = (previewIdx.value + dir + n) % n
  resetView()
}
/* 放大后拖拽平移（鼠标按下图片拖动） */
let lbDragging = false, lbDragStart = { x: 0, y: 0 }, lbPanStart = { x: 0, y: 0 }
function onLbImgDown(e: MouseEvent) {
  if (zoomPct.value <= 100) return
  lbDragging = true
  lbDragStart = { x: e.clientX, y: e.clientY }
  lbPanStart = { ...pan.value }
}
function onLbImgMove(e: MouseEvent) {
  if (!lbDragging) return
  pan.value = { x: lbPanStart.x + (e.clientX - lbDragStart.x), y: lbPanStart.y + (e.clientY - lbDragStart.y) }
}
function onLbImgUp() { lbDragging = false }

/* —— 电商专家 / 技能 浮窗选择（青虎AI 式：按钮上方弹出面板，点击外部/Esc 关闭） —— */
const composerEl = ref<HTMLElement | null>(null)
const pop = ref<'expert' | 'skill' | null>(null)
const popSearch = ref('')
const popPlatform = ref('全部')
const popChip = ref('推荐')
const expertSearchEl = ref<HTMLInputElement | null>(null)
const skillSearchEl = ref<HTMLInputElement | null>(null)
const PLATFORM_COLOR: Record<string, string> = { '1688': '#ff6a00', 'Ozon': '#005bff', '亚马逊': '#ff9900', 'Temu': '#fb7701' }
const PLATFORM_INITIAL: Record<string, string> = { '1688': '1688', 'Ozon': 'O', '亚马逊': 'A', 'Temu': 'T' }

/* 弹层两级筛选（与首页 hero 一致）：先平台、再场景，列表随二者联动 */
const POP_PLATFORMS = ['全部', '1688', 'OZON', '亚马逊', 'TEMU']
const PLATFORM_ALIAS: Record<string, string[]> = { 'OZON': ['Ozon', 'OZON'], 'TEMU': ['Temu', 'TEMU'] }
const matchPopPlatform = (item: ExpertItem | SkillItem) => {
  if (popPlatform.value === '全部') return true
  const allow = PLATFORM_ALIAS[popPlatform.value] || [popPlatform.value]
  if ('platform' in item) return allow.includes(item.platform)
  return item.tags.some(tag => allow.includes(tag))
}
const popScenarios = computed(() => {
  const list = (pop.value === 'skill' ? expertState.skills : expertState.experts)
    .filter(i => i.source === 'official' && matchPopPlatform(i))
  const values = list.map(i => 'platform' in i ? i.category : i.scenario).filter(Boolean) as string[]
  return ['推荐', ...Array.from(new Set(values))]
})
function selectPopPlatform(p: string) {
  popPlatform.value = p
  if (!popScenarios.value.includes(popChip.value)) popChip.value = '推荐'
}
function togglePop(kind: 'expert' | 'skill') {
  pop.value = pop.value === kind ? null : kind
  popSearch.value = ''
  popPlatform.value = '全部'
  popChip.value = '推荐'
  if (pop.value) nextTick(() => { (pop.value === 'expert' ? expertSearchEl : skillSearchEl).value?.focus() })
}
function closePop() { pop.value = null; popSearch.value = '' }
const popExperts = computed(() => {
  const base = expertState.experts.filter(e => e.source === 'official' && matchPopPlatform(e))
  const scoped = popChip.value === '推荐' ? base : base.filter(e => e.category === popChip.value || e.tags.includes(popChip.value))
  const q = popSearch.value.trim().toLowerCase()
  const hit = q ? scoped.filter(e => (e.name + e.desc + e.platform + e.category + e.tags.join()).toLowerCase().includes(q)) : scoped
  return popChip.value === '推荐' ? hit.slice(0, 6) : hit
})
const popSkills = computed(() => {
  const base = expertState.skills.filter(s => s.source === 'official' && matchPopPlatform(s))
  const scoped = popChip.value === '推荐' ? base : base.filter(s => s.scenario === popChip.value || s.tags.includes(popChip.value))
  const q = popSearch.value.trim().toLowerCase()
  const hit = q ? scoped.filter(s => (s.name + s.desc + (s.scenario || '') + s.tags.join()).toLowerCase().includes(q)) : scoped
  return popChip.value === '推荐' ? hit.slice(0, 6) : hit
})
function pickExpert(e: ExpertItem) {
  chatState.selectedExpert = chatState.selectedExpert?.id === e.id ? null : e
  if (chatState.selectedExpert) flashToast('已选择专家「' + e.name + '」，随消息一起发送')
  closePop()
}
function pickSkill(s: SkillItem) {
  chatState.selectedSkill = chatState.selectedSkill?.id === s.id ? null : s
  if (chatState.selectedSkill) flashToast('已选择技能「' + s.name + '」，随消息一起发送')
  closePop()
}
/* 助手下拉框：composer 右下角（替换原「积分/千」标签位置） */
const ASSISTANTS = ['雷达AI官方助手', '1688选品助手', 'OZON选品助手', '亚马逊选品助手', 'TEMU选品助手']
const assistant = ref(ASSISTANTS[0])
const assistOpen = ref(false)
function pickAssistant(a: string) { assistant.value = a; assistOpen.value = false }
function onDocMouseDown(e: MouseEvent) {
  if (assistOpen.value && composerEl.value && !composerEl.value.contains(e.target as Node)) assistOpen.value = false
  if (!pop.value) return
  if (composerEl.value && composerEl.value.contains(e.target as Node)) return
  closePop()
}
function onDocKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (previewIdx.value >= 0) { closePreview(); return }
    if (pop.value) closePop()
    assistOpen.value = false
  }
  if (previewIdx.value >= 0 && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    e.preventDefault()
    navPreview(e.key === 'ArrowLeft' ? -1 : 1)
  }
}
onMounted(() => {
  document.addEventListener('mousedown', onDocMouseDown)
  document.addEventListener('keydown', onDocKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocMouseDown)
  document.removeEventListener('keydown', onDocKeydown)
})

</script>

<template>
  <div ref="composerEl" class="composer" id="composer" @drop="onDrop" @dragenter="onDragenter" @dragover.prevent="onDragenter" @dragleave="onDragleave">
    <!-- 已选附件 -->
    <div class="attach-row" :class="{ show: chatState.attaches.length > 0 }">
      <div class="attach-list" ref="attachListEl" @scroll="updateArrows">
        <div v-for="(a, idx) in chatState.attaches" :key="idx" class="attach-chip" :class="{ clickable: a.type === 'img' && a.url }" :title="a.type === 'img' && a.url ? a.name + ' · ' + formatSize(a.size) + '（点击放大预览）' : a.name + ' · ' + formatSize(a.size)" @click="a.type === 'img' && a.url && openPreview(a)">
          <span v-if="a.type === 'img' && a.url" class="ac-thumb">
            <img :src="a.url" :alt="a.name" draggable="false" />
          </span>
          <span v-else class="ac-icon" :class="chipIconSVG(a.type).cls" v-html="chipIconSVG(a.type).svg"></span>
          <span class="ac-info">
            <span class="ac-name">{{ a.name }}</span>
            <span class="ac-meta">{{ a.ext || 'FILE' }} · {{ formatSize(a.size) }}</span>
          </span>
          <button class="ac-rm" title="移除" type="button" @click.stop="removeAttach(idx)">✕</button>
        </div>
      </div>
      <button class="ar-nav ar-left" :class="{ show: arLeftShow }" type="button" title="向左滑动" @click="scrollAttach(-1)">‹</button>
      <button class="ar-nav ar-right" :class="{ show: arRightShow }" type="button" title="向右滑动" @click="scrollAttach(1)">›</button>
    </div>

    <!-- 已选专家 / 技能 chips（可单独移除） -->
    <div v-if="chatState.selectedExpert || chatState.selectedSkill" class="sel-row">
      <span v-if="chatState.selectedExpert" class="sel-chip expert">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        电商专家 · {{ chatState.selectedExpert.name }}
        <button class="sel-rm" type="button" title="移除专家" @click="chatState.selectedExpert = null">✕</button>
      </span>
      <span v-if="chatState.selectedSkill" class="sel-chip skill">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg>
        技能 · {{ chatState.selectedSkill.name }}
        <button class="sel-rm" type="button" title="移除技能" @click="chatState.selectedSkill = null">✕</button>
      </span>
    </div>

    <textarea
      ref="inputEl"
      v-model="chatState.inputText"
      placeholder="输入您的选品需求...（Enter 发送，Shift+Enter 换行）"
      aria-label="选品需求输入框"
      @keydown="onKeydown"
      @contextmenu="onContext"
    ></textarea>

    <!-- 底部工具栏：仅 上传 / 电商专家 / 技能（浮窗选择） -->
    <div class="composer-bar">
      <input type="file" ref="fileInput" multiple hidden @change="onFileChange" />
      <div class="cb-tools">
        <button class="cb-tool" type="button" title="上传文件" @click="onFilePick">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
          上传文件
        </button>
        <div class="cb-pop-wrap">
          <button class="cb-tool" :class="{ open: pop === 'expert', active: !!chatState.selectedExpert }" type="button" title="选择电商专家" @click="togglePop('expert')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            电商专家
            <svg class="cb-caret" width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <transition name="pop">
            <div v-if="pop === 'expert'" class="cb-pop" @mousedown.stop>
              <div class="cb-pop-head">选择电商专家<small>选中后随本条消息一起发送</small></div>
              <div class="cb-pop-search">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
                <input ref="expertSearchEl" v-model="popSearch" type="text" placeholder="搜索专家" aria-label="搜索专家" />
              </div>
              <div class="cb-pop-filters">
                <div class="seg-track">
                  <button v-for="p in POP_PLATFORMS" :key="p" class="seg-btn" :class="{ on: popPlatform === p }" type="button" @click="selectPopPlatform(p)">{{ p }}</button>
                </div>
                <div class="cb-pop-scenes">
                  <button v-for="c in popScenarios" :key="c" class="home-chip" :class="{ on: popChip === c }" type="button" @click="popChip = c">{{ c }}</button>
                </div>
              </div>
              <div class="cb-pop-list">
                <button v-for="e in popExperts" :key="e.id" class="cb-pop-item" :class="{ on: chatState.selectedExpert?.id === e.id }" type="button" @click="pickExpert(e)">
                  <span class="bp-ava" :style="{ background: PLATFORM_COLOR[e.platform] || '#00A83E' }">{{ (PLATFORM_INITIAL[e.platform] || 'E') }}</span>
                  <span class="bp-meta">
                    <b>{{ e.name }}</b>
                    <i>{{ e.platform }} · {{ e.desc }}</i>
                  </span>
                  <span class="bp-check">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                  </span>
                </button>
                <div v-if="!popExperts.length" class="cb-pop-empty">未找到匹配的专家</div>
              </div>
            </div>
          </transition>
        </div>
        <div class="cb-pop-wrap skill">
          <button class="cb-tool" :class="{ open: pop === 'skill', active: !!chatState.selectedSkill }" type="button" title="选择技能" @click="togglePop('skill')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg>
            技能
            <svg class="cb-caret" width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <transition name="pop">
            <div v-if="pop === 'skill'" class="cb-pop" @mousedown.stop>
              <div class="cb-pop-head">选择技能<small>选中后随本条消息一起发送</small></div>
              <div class="cb-pop-search">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
                <input ref="skillSearchEl" v-model="popSearch" type="text" placeholder="搜索技能" aria-label="搜索技能" />
              </div>
              <div class="cb-pop-filters">
                <div class="seg-track">
                  <button v-for="p in POP_PLATFORMS" :key="p" class="seg-btn" :class="{ on: popPlatform === p }" type="button" @click="selectPopPlatform(p)">{{ p }}</button>
                </div>
                <div class="cb-pop-scenes">
                  <button v-for="c in popScenarios" :key="c" class="home-chip" :class="{ on: popChip === c }" type="button" @click="popChip = c">{{ c }}</button>
                </div>
              </div>
              <div class="cb-pop-list">
                <button v-for="s in popSkills" :key="s.id" class="cb-pop-item" :class="{ on: chatState.selectedSkill?.id === s.id }" type="button" @click="pickSkill(s)">
                  <span class="bp-ava skill" v-html="skillVisual(s).icon"></span>
                  <span class="bp-meta">
                    <b>{{ s.name }}</b>
                    <i>{{ s.scenario || '通用' }} · {{ s.desc }}</i>
                  </span>
                  <span class="bp-check">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                  </span>
                </button>
                <div v-if="!popSkills.length" class="cb-pop-empty">未找到匹配的技能</div>
              </div>
            </div>
          </transition>
        </div>
      </div>
      <div class="cb-right">
        <div v-if="false" class="cb-pop-wrap assist">
          <button class="cb-coin-info cb-assist-btn" :class="{ open: assistOpen }" type="button" title="选择助手" @click="assistOpen = !assistOpen">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 8V4m-4 0h8"/><path d="M9 14h.01M15 14h.01"/></svg>
            {{ assistant }}
            <svg class="cb-caret" width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <transition name="pop">
            <div v-if="assistOpen" class="cb-pop assist-pop">
              <button v-for="a in ASSISTANTS" :key="a" class="assist-item" :class="{ on: assistant === a }" type="button" @click="pickAssistant(a)">
                <span>{{ a }}</span>
                <span v-if="assistant === a" class="bp-check">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                </span>
              </button>
            </div>
          </transition>
        </div>
        <button class="cb-go" :class="{ busy: running, 'stop-state': running }" type="button" :title="running ? '停止当前会话生成' : '开始查询（Enter）'" @click="onClickSend">
          <span class="btn-label">{{ running ? '停止生成' : '开始查询' }}</span>
          <span class="go-ic"><svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 12h13M12.5 5.5L19 12l-6.5 6.5" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          <span class="stop-sq"></span>
          <span class="spin"></span>
        </button>
      </div>
    </div>
  </div>

  <!-- 输入框右键菜单（Teleport 到 body） -->
  <Teleport to="body">
    <div class="input-menu" :class="{ open: modals.inputMenu }" :style="{ left: modals.inputMenuX + 'px', top: modals.inputMenuY + 'px' }">
      <div class="im-item" :class="{ disabled: !hasSel }" @click="onMenuAct('cut')">
        <span class="im-ic">✂</span><span>剪切</span><span class="im-kbd">Ctrl+X</span>
      </div>
      <div class="im-item" :class="{ disabled: !hasSel }" @click="onMenuAct('copy')">
        <span class="im-ic">⧉</span><span>复制</span><span class="im-kbd">Ctrl+C</span>
      </div>
      <div class="im-sep"></div>
      <div class="im-item" @click="onMenuAct('paste')">
        <span class="im-ic">📋</span><span>粘贴</span><span class="im-kbd">Ctrl+V</span>
      </div>
      <div class="im-item" :class="{ disabled: !chatState.inputText.length }" @click="onMenuAct('selectAll')">
        <span class="im-ic">▢</span><span>全选</span><span class="im-kbd">Ctrl+A</span>
      </div>
    </div>
  </Teleport>

  <!-- 图片附件放大预览层：浅色遮罩 + 底部工具栏（分页 / 缩放），点击遮罩 / 关闭按钮 / Esc 关闭 -->
  <Teleport to="body">
    <div v-if="previewIdx >= 0 && previewUrl" class="img-lightbox" @click="closePreview" @mousemove="onLbImgMove" @mouseup="onLbImgUp" @mouseleave="onLbImgUp">
      <div class="il-name" :title="previewName">{{ previewName }}</div>
      <button class="il-close" type="button" title="关闭 (Esc)" @click="closePreview">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
      </button>
      <img
        :src="previewUrl" :alt="previewName" draggable="false"
        :style="{ transform: 'translate(' + pan.x + 'px,' + pan.y + 'px) scale(' + zoomPct / 100 + ')' }"
        :class="{ grabbable: zoomPct > 100, grabbing: lbDragging }"
        @click.stop @mousedown.prevent="onLbImgDown"
      />
      <div class="il-toolbar" @click.stop>
        <template v-if="previewList.length > 1">
          <button class="il-btn" type="button" title="上一张 (←)" @click="navPreview(-1)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M14.5 5 8 12l6.5 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <span class="il-page">{{ previewIdx + 1 }} / {{ previewList.length }}</span>
          <button class="il-btn" type="button" title="下一张 (→)" @click="navPreview(1)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M9.5 5 16 12l-6.5 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <span class="il-sep"></span>
        </template>
        <button class="il-btn" type="button" title="缩小" @click="stepZoom(-1)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.8-3.8M8.5 11h5"/></svg>
        </button>
        <button class="il-pct" type="button" title="点击恢复 100%" @click="resetView">{{ zoomPct }}%</button>
        <button class="il-btn" type="button" title="放大" @click="stepZoom(1)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.8-3.8M8.5 11h5M11 8.5v5"/></svg>
        </button>
      </div>
    </div>
  </Teleport>
</template>
