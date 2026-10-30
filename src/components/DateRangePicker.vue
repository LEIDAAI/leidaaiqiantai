<script setup lang="ts">
/* 通用双月日期区间选择器（充值/消耗明细共用），移植原 createRangePicker：
 * 点击框展开面板，先点开始再点结束；区间选满自动收起并触发 change；
 * 悬停已选框出现 × 清除（同样触发 change）；点击面板外部收起。 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{ range: { start: string; end: string } }>()
const emit = defineEmits<{ (e: 'change'): void }>()

const boxEl = ref<HTMLElement | null>(null)
const open = ref(false)
const panelLeft = ref(new Date()) // 面板左侧月份

const pad = (n: number) => String(n).padStart(2, '0')
const fmtDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fmt = (k: string) => k.replace(/-/g, '/')
const WEEKDAYS = '日一二三四五六'.split('')

interface Cell { key: string; day: number; cls: string }

const hasValue = computed(() => !!(props.range.start || props.range.end))
const text = computed(() => {
  const { start, end } = props.range
  if (start && end) return `${fmt(start)} - ${fmt(end)}`
  if (start) return `${fmt(start)} - `
  return '开始日期 - 结束日期'
})

function grid(base: Date): Cell[] {
  const yy = base.getFullYear(), mm = base.getMonth()
  const startWd = new Date(yy, mm, 1).getDay()
  const today = fmtDay(new Date())
  const { start, end } = props.range
  const cells: Cell[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(yy, mm, i - startWd + 1)
    const key = fmtDay(d)
    const dim = d.getMonth() !== mm
    let mark = ''
    if (!dim) {
      if (key === start || key === end) mark = 'edge'
      else if (start && end && key > start && key < end) mark = 'in-range'
      if (key === today) mark += (mark ? ' ' : '') + 'today'
    }
    cells.push({ key, day: d.getDate(), cls: (dim ? 'dim' : '') + (dim || !mark ? '' : ' ') + mark })
  }
  return cells
}

const rightBase = computed(() => new Date(panelLeft.value.getFullYear(), panelLeft.value.getMonth() + 1, 1))
const leftGrid = computed(() => grid(panelLeft.value))
const rightGrid = computed(() => grid(rightBase.value))
const leftTitle = computed(() => `${panelLeft.value.getFullYear()} 年 ${panelLeft.value.getMonth() + 1} 月`)
const rightTitle = computed(() => `${rightBase.value.getFullYear()} 年 ${rightBase.value.getMonth() + 1} 月`)

function onBoxClick(e: MouseEvent) {
  const t = e.target as HTMLElement
  if (t.closest('.date-panel')) return // 面板内部点击不触发展开/收起
  if (t.closest('.lr-clear')) { // 悬停出现的 × ：清除已选区间
    props.range.start = ''
    props.range.end = ''
    emit('change')
    return
  }
  const willOpen = !open.value
  if (willOpen) {
    const base = props.range.start ? new Date(props.range.start.replace(/-/g, '/')) : new Date()
    base.setDate(1)
    panelLeft.value = base
  }
  open.value = willOpen
}

function nav(k: 'py' | 'pm' | 'nm' | 'ny') {
  const delta = k === 'py' ? -12 : k === 'pm' ? -1 : k === 'nm' ? 1 : 12
  panelLeft.value = new Date(panelLeft.value.getFullYear(), panelLeft.value.getMonth() + delta, 1)
}

function onCell(key: string, cls: string) {
  if (cls.includes('dim')) return // 非本月日期不可选
  if (!props.range.start || props.range.end) { props.range.start = key; props.range.end = ''; return }
  if (key < props.range.start) { props.range.start = key; return }
  props.range.end = key // 区间选满：收起面板并立即过滤
  open.value = false
  emit('change')
}

function onDocClick(e: MouseEvent) {
  if (open.value && boxEl.value && !boxEl.value.contains(e.target as Node)) open.value = false // 点击外部收起
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div ref="boxEl" class="lf-rangebox" :class="{ 'has-value': hasValue }" @click="onBoxClick">
    <span class="lr-text" :class="{ 'is-empty': !hasValue }">{{ text }}</span>
    <span class="lr-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg></span>
    <span class="lr-clear" title="清除日期">×</span>
    <div class="date-panel" v-show="open" @click.stop>
      <div class="dp-head">
        <span class="dp-nav" @click="nav('py')">«</span><span class="dp-nav" @click="nav('pm')">‹</span>
        <b class="dp-title">{{ leftTitle }}</b><i class="dp-gap"></i>
        <b class="dp-title">{{ rightTitle }}</b>
        <span class="dp-nav" @click="nav('nm')">›</span><span class="dp-nav" @click="nav('ny')">»</span>
      </div>
      <div class="dp-body">
        <div class="dp-grid">
          <span v-for="(w, i) in WEEKDAYS" :key="'lw' + i" class="dp-week">{{ w }}</span>
          <span v-for="c in leftGrid" :key="c.key" class="dp-cell" :class="c.cls" @click="onCell(c.key, c.cls)">{{ c.day }}</span>
        </div>
        <div class="dp-grid">
          <span v-for="(w, i) in WEEKDAYS" :key="'rw' + i" class="dp-week">{{ w }}</span>
          <span v-for="c in rightGrid" :key="c.key" class="dp-cell" :class="c.cls" @click="onCell(c.key, c.cls)">{{ c.day }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
