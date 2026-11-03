<script setup lang="ts">
/* Trae 式任务卡片：可折叠头部（任务耗时）+ 思考过程 + 步骤清单（spinner→绿勾）+ 完成后结果区。
   动画状态为组件本地状态：每次挂载重新演示，数据本身随消息持久化。 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import type { ChatMessage } from '../stores/chat'

type TaskCardData = NonNullable<ChatMessage['taskCard']>

const props = defineProps<{ data: TaskCardData }>()

const expanded = ref(true)
const running = ref(true)
const elapsed = ref(0)
const activeIdx = ref(-1)
const doneIdx = ref(-1)
const showResult = ref(false)

let tickTimer: ReturnType<typeof setInterval> | null = null
const stepTimers: ReturnType<typeof setTimeout>[] = []

const timeText = computed(() => {
  const s = elapsed.value
  if (s < 60) return s + 's'
  return Math.floor(s / 60) + 'm ' + (s % 60) + 's'
})

/* 思考过程行随步骤推进渐显；全部完成后全部可见 */
function thShow(i: number) {
  return !running.value || i <= activeIdx.value
}

onMounted(() => {
  tickTimer = setInterval(() => { elapsed.value++ }, 1000)
  const msArr = (props.data.stepMs && props.data.stepMs.length === props.data.steps.length)
    ? props.data.stepMs
    : props.data.steps.map(() => 1200)
  let start = 0
  const total = msArr.reduce((a, b) => a + b, 0)
  msArr.forEach((ms, i) => {
    stepTimers.push(setTimeout(() => {
      activeIdx.value = i
      doneIdx.value = i - 1
      stepTimers.push(setTimeout(() => {
        doneIdx.value = i
        if (i === msArr.length - 1) {
          running.value = false
          if (tickTimer) { clearInterval(tickTimer); tickTimer = null }
          elapsed.value = Math.max(elapsed.value, Math.ceil(total / 1000))
          setTimeout(() => { showResult.value = true }, 320)
        }
      }, ms))
    }, start))
    start += ms
  })
})

onBeforeUnmount(() => {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null }
  stepTimers.forEach(t => clearTimeout(t))
  stepTimers.length = 0
})
</script>

<template>
  <div class="ttc">
    <button type="button" class="ttc-head" @click="expanded = !expanded">
      <span class="ttc-chevron" :class="{ open: expanded }">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </span>
      <span class="ttc-title">{{ data.title }}</span>
      <span class="ttc-state">
        <template v-if="running"><span class="ttc-spinner"></span><span>正在执行</span></template>
        <template v-else>
          <svg class="ttc-state-check" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
          <span>已完成</span>
        </template>
      </span>
      <span class="ttc-time">耗时 {{ timeText }}</span>
    </button>
    <div v-show="expanded" class="ttc-body">
      <div v-if="data.thinking && data.thinking.length" class="ttc-thinking">
        <div class="ttc-th-label">思考过程</div>
        <template v-for="(t, i) in data.thinking" :key="i">
          <div v-if="thShow(i)" class="ttc-th-line">{{ t }}</div>
        </template>
      </div>
      <div class="ttc-steps">
        <div v-for="(s, i) in data.steps" :key="i" class="ttc-step" :class="{ active: i === activeIdx && running, done: i <= doneIdx }">
          <span class="ttc-dot">
            <span v-if="i === activeIdx && running" class="ttc-spinner sm"></span>
            <svg v-else-if="i <= doneIdx" class="ttc-check" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
            <span v-else class="ttc-dot-gray"></span>
          </span>
          <span class="ttc-label">{{ s.label }}</span>
          <span v-if="s.detail" class="ttc-detail">{{ s.detail }}</span>
        </div>
      </div>
    </div>
    <div v-if="showResult && data.resultHtml" class="ttc-result" v-html="data.resultHtml"></div>
  </div>
</template>
