<script setup lang="ts">
/* Composer：附件 chips + 自适应输入框 + 发送/停止同位按钮 + 右键菜单 */
import { ref, watch, nextTick, computed } from 'vue'
import { chatState } from '../stores/chat'
import { modals, openInputMenu, closeInputMenu } from '../stores/modals'
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
function onFileChange(e: Event) {
  const files = Array.from((e.target as HTMLInputElement).files || [])
  files.forEach(f => {
    const meta = detectFileType(f.name)
    chatState.attaches.push({ file: f, name: f.name, size: f.size, ...meta })
  })
  // 允许重复选同一文件：清空 value
  ;(e.target as HTMLInputElement).value = ''
}
function onDrop(e: DragEvent) {
  const files = Array.from((e.dataTransfer && e.dataTransfer.files) || [])
  files.forEach(f => {
    const meta = detectFileType(f.name)
    chatState.attaches.push({ file: f, name: f.name, size: f.size, ...meta })
  })
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
  chatState.attaches.splice(idx, 1)
}
</script>

<template>
  <div class="composer" id="composer" @drop="onDrop" @dragenter="onDragenter" @dragover.prevent="onDragenter" @dragleave="onDragleave">
    <!-- 已选附件 -->
    <div class="attach-row" :class="{ show: chatState.attaches.length > 0 }">
      <div class="attach-list" ref="attachListEl" @scroll="updateArrows">
        <div v-for="(a, idx) in chatState.attaches" :key="idx" class="attach-chip" :title="a.name + ' · ' + formatSize(a.size)">
          <span class="ac-icon" :class="chipIconSVG(a.type).cls" v-html="chipIconSVG(a.type).svg"></span>
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

    <textarea
      ref="inputEl"
      v-model="chatState.inputText"
      placeholder="输入您的选品需求...（Enter 发送，Shift+Enter 换行）"
      @keydown="onKeydown"
      @contextmenu="onContext"
    ></textarea>

    <!-- 底部工具栏 -->
    <div class="composer-bar">
      <input type="file" ref="fileInput" multiple hidden @change="onFileChange" />
      <button class="cb-go" :class="{ busy: running, 'stop-state': running }" type="button" :title="running ? '停止当前会话生成' : '开始查询（Enter）'" @click="onClickSend">
        <span class="btn-label">{{ running ? '停止生成' : '开始查询' }}</span>
        <span class="go-ic"><svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 12h13M12.5 5.5L19 12l-6.5 6.5" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        <span class="stop-sq"></span>
        <span class="spin"></span>
      </button>
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
</template>
