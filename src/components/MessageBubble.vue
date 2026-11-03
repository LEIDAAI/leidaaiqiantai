<script setup lang="ts">
/* 消息气泡：用户 / AI（含流式状态机视图：分析卡/状态条/骨架屏/报告任务卡/建议/操作栏） */
import { computed, ref, watch } from 'vue'
import { ChatMessage } from '../stores/chat'
import { chatState, stopTask } from '../stores/chat'
import { modals, openFeedback } from '../stores/modals'
import { flashToast, writeClipboard, formatRelativeTime } from '../utils/common'
import { MSG_ACT_ICONS } from './svg'
import { currentAccount } from '../stores/account'
import { send } from '../stores/send'
import { appState } from '../stores/state'
import AliProductCard from './AliProductCard.vue'
import TraeTaskCard from './TraeTaskCard.vue'

const props = defineProps<{ msg: ChatMessage; prev?: ChatMessage }>()

const timeStr = computed(() => props.msg.createdAt ? new Date(props.msg.createdAt).toLocaleString('zh-CN', { hour12: false }) : '')

/* —— 附件 chip（Trae 式紧凑卡片） —— */
const AC_ICON_TEXT: Record<string, string> = { img: 'IMG', xls: 'XLS', pdf: 'PDF', doc: 'DOC', txt: 'TXT', code: 'CODE', audio: 'AUD', video: 'VID', zip: 'ZIP', file: 'FILE' }
function iconText(type: string) { return AC_ICON_TEXT[type] || 'FILE' }
function sizeText(size: number) {
  return size < 1024 ? size + ' B' : size < 1048576 ? (size / 1024).toFixed(0) + ' KB' : (size / 1048576).toFixed(1) + ' MB'
}

const AZ_STEP_LABELS = ['理解需求', '检索数据', '分析对比', '生成结果']

/* —— 操作栏状态 —— */
const likeActive = ref(false)
const dislikeActive = ref(false)
async function onCopy() {
  const ok = await writeClipboard(props.msg.content || '')
  flashToast(ok ? '复制成功' : '复制失败，请重试')
}
function onLike() {
  likeActive.value = !likeActive.value
  if (likeActive.value) dislikeActive.value = false
  flashToast(likeActive.value ? '感谢点赞' : '已取消点赞')
}
function onDislike() {
  if (dislikeActive.value) return
  dislikeActive.value = true
  likeActive.value = false
  openFeedback()
}
// 取消反馈（未提交关闭弹窗）时回退点踩高亮，对齐原版 FB_OPEN_BTN 行为
watch(() => modals.feedback, (v) => {
  if (!v && !modals.feedbackSubmitted) dislikeActive.value = false
})
function onRegen() {
  const convKey = chatState.activeConvKey
  if (convKey && chatState.runningTasks[convKey]) { flashToast('当前会话正在回复中'); return }
  const q = (props.msg.query || chatState.lastQuery || '').trim()
  if (!q) { flashToast('没有可重新发起的内容'); return }
  chatState.inputText = q
  send(true)
}
/* —— 用户消息操作 —— */
function onEditToInput() {
  const raw = (props.msg.content || '').trim()
  chatState.inputText = chatState.inputText ? (chatState.inputText.replace(/\s+$/, '') + '\n' + raw) : raw
  flashToast('已添加到对话')
}
/* —— 建议点击 —— */
function onSuggest(item: { q: string }) {
  const convKey = chatState.activeConvKey
  if (convKey && chatState.runningTasks[convKey]) return
  chatState.inputText = item.q
  props.msg.suggest = null
  send()
}
</script>

<template>
  <!-- 用户消息 -->
  <div v-if="msg.role === 'user'" class="msg user" :class="{ hidden: msg.hidden }">
    <div class="avatar">我</div>
    <div class="msg-body">
      <div class="msg-role">我 <span class="time">{{ timeStr ? '· ' + timeStr : '' }}</span></div>
      <div class="msg-bubble">
        <p>{{ msg.content }}</p>
        <div v-if="msg.attachments && msg.attachments.length" class="msg-attach-list">
          <div v-for="(a, i) in msg.attachments" :key="i" class="msg-attach" :title="a.name">
            <span class="ac-icon" :class="a.type">{{ iconText(a.type) }}</span>
            <span class="ma-info">
              <span class="ma-name">{{ a.name }}</span>
              <span class="ma-meta">{{ sizeText(a.size) }}</span>
            </span>
          </div>
        </div>
      </div>
      <div class="user-actions">
        <div class="act-group">
          <button type="button" class="msg-act-btn ua-edit" data-tip="添加到对话" aria-label="添加到对话" @click="onEditToInput" v-html="MSG_ACT_ICONS.edit"></button>
          <button type="button" class="msg-act-btn ua-copy" title="复制" aria-label="复制" @click="onCopy" v-html="MSG_ACT_ICONS.copy"></button>
        </div>
      </div>
    </div>
  </div>

  <!-- AI 消息 -->
  <div v-else class="msg ai" :class="{ hidden: msg.hidden }">
    <div class="avatar">AI</div>
    <div class="msg-body">
      <div class="msg-role">{{ (currentAccount as any).agent || '店雷达 AI' }} <span class="time">{{ timeStr ? '· ' + timeStr + (msg.phase === 'done' ? ' · 已完成' : '') : msg.statusText }}</span></div>
      <div v-if="timeStr === ''" class="msg-role-time-fallback" style="display:none"></div>
      <div class="msg-bubble">
        <!-- Trae 式任务卡片（演示） -->
        <TraeTaskCard v-if="msg.taskCard" :data="msg.taskCard" />

        <!-- 历史恢复：搜索分析完成静态卡 -->
        <div v-if="msg.showAnalyzeDone" class="analyze-card done collapsed">
          <div class="analyze-head" style="cursor:default"><span class="az-ic">✓</span><span class="az-stage">搜索分析完成</span></div>
          <div class="az-query"><span class="azq-badge">已搜索</span><span class="azq-kw">{{ msg.showAnalyzeDone.kw }}</span></div>
        </div>

        <!-- 报告任务卡 -->
        <div v-if="msg.reportTask" class="report-task-card">
          <div v-if="!msg.reportTask.failed" class="report-task-head"><span class="report-task-icon">▤</span><span>正在生成分析报告</span></div>
          <div v-else class="report-task-head"><span class="report-task-icon" style="background:#FFF0EF;color:#D6493A">!</span><span>报告生成失败</span></div>
          <div v-if="!msg.reportTask.failed" class="report-task-stages">
            <span class="report-task-stage" :class="{ done: msg.reportTask.step > 1, active: msg.reportTask.step === 1 }" data-step="1"><i>{{ msg.reportTask.step > 1 ? '✓' : '1' }}</i>准备数据</span>
            <span class="report-task-line"></span>
            <span class="report-task-stage" :class="{ done: msg.reportTask.step > 2, active: msg.reportTask.step === 2 }" data-step="2"><i>{{ msg.reportTask.step > 2 ? '✓' : '2' }}</i>分析样本</span>
            <span class="report-task-line"></span>
            <span class="report-task-stage" :class="{ done: msg.reportTask.step > 3, active: msg.reportTask.step === 3 }" data-step="3"><i>{{ msg.reportTask.step > 3 ? '✓' : '3' }}</i>生成报告</span>
          </div>
          <div v-if="!msg.reportTask.failed" class="report-task-note">{{ msg.reportTask.note }}</div>
          <div v-else class="report-task-note" style="margin-top:10px;color:#D6493A">{{ msg.reportTask.failed }}</div>
        </div>

        <!-- 流式状态条 -->
        <div v-if="msg.liveStatus" class="live-status">
          <span class="ls-ic"></span><span class="ls-txt">{{ msg.liveStatus.text }}</span><span class="ls-time">{{ msg.liveStatus.elapsed }}s</span>
        </div>

        <!-- 分析进度卡 -->
        <div v-if="msg.analyze && !msg.analyze.done" class="analyze-card">
          <div class="analyze-head">
            <span class="az-ic"><span class="az-radar"></span><span class="az-core"></span></span>
            <div class="az-head-main">
              <span class="az-stage"><span class="az-spin-sm"></span><span class="az-stage-text">{{ msg.analyze.stageText }}</span><span class="az-stage-dots"><span></span><span></span><span></span></span></span>
              <span class="az-subkw">{{ msg.analyze.subKw }}</span>
            </div>
            <span class="az-time">{{ msg.analyze.elapsed }}s</span>
          </div>
          <div class="analyze-steps">
            <span v-for="(lbl, i) in AZ_STEP_LABELS" :key="lbl" class="az-step" :class="{ active: i === msg.analyze!.stepIdx, done: i < msg.analyze!.stepIdx }">{{ lbl }}</span>
          </div>
          <div v-if="msg.analyze.hint" class="az-wait-hint">商品检索与分析通常需要 1~2 分钟，请稍候</div>
          <div class="az-count" style="display:none"><span class="azc-ic">📦</span><span class="azc-txt"></span><span class="azc-bar"><i></i></span></div>
        </div>
        <!-- 分析卡完成态 -->
        <div v-if="msg.analyze && msg.analyze.done" class="analyze-card done collapsed">
          <div class="analyze-head" style="cursor:default"><span class="az-ic">✓</span><span class="az-stage">{{ msg.analyze.doneText }}</span></div>
        </div>

        <!-- 错误信息 -->
        <div v-if="msg.errorText" class="ai-summary" style="border-left:3px solid #d6493a;padding:8px 12px;background:#fef0ef;color:#d6493a;border-radius:4px;margin-top:8px"><b>请求失败：</b>{{ msg.errorText }}</div>

        <!-- 表格生成骨架屏 -->
        <div v-if="msg.skeleton" class="table-skeleton">
          <div class="sk-head">
            <span class="sk-ic">📋</span>
            <span class="sk-title">正在生成选品表格</span>
            <span class="sk-eta">{{ msg.skeleton.eta }}</span>
          </div>
          <div class="sk-bar" :class="{ indeterminate: msg.skeleton.indeterminate }"><i :style="msg.skeleton.indeterminate ? {} : { width: msg.skeleton.pct + '%' }"></i></div>
          <div class="sk-rows"><div class="sk-row"></div><div class="sk-row"></div><div class="sk-row"></div><div class="sk-row"></div></div>
        </div>

        <!-- 流式可见文本 -->
        <div v-if="msg.phase === 'streaming' && msg.liveText" class="live-answer">
          <div class="live-text" style="white-space:pre-wrap;line-height:1.7;">{{ msg.liveText }}</div>
        </div>

        <!-- 历史报告卡片 -->
        <div v-if="msg.reportCardHtml" v-html="msg.reportCardHtml"></div>

        <!-- 1688商品详情卡片 -->
        <div v-if="msg.ali1688Product" class="ali1688-wrapper">
          <AliProductCard :data="msg.ali1688Product" />
        </div>

        <!-- 最终富文本 -->
        <div v-if="msg.phase === 'done' && msg.finalHtml" class="final-answer" v-html="msg.finalHtml"></div>

        <!-- 积分消耗条 -->
        <div v-if="msg.costBar" class="cost-bar">
          <div class="cb-info"><span class="cb-title">{{ msg.costBar.title }}</span></div>
          <div class="cb-total"><span class="cb-num">-{{ msg.costBar.coins }}</span><span class="cb-unit">积分</span></div>
        </div>

        <!-- 下一步建议 -->
        <div v-if="msg.suggestLoading" class="next-suggest">
          <div class="ns-head"><span class="ai-tag">AI</span><span>下一步你可以问</span></div>
          <div class="ns-list"><div class="ns-item" style="cursor:default"><span class="ns-ic">⏳</span><span class="ns-text">正在生成建议…</span></div></div>
        </div>
        <div v-if="msg.suggest && msg.suggest.length" class="next-suggest">
          <div class="ns-head"><span class="ai-tag">AI</span><span>下一步你可以问</span></div>
          <div class="ns-list">
            <div v-for="(it, i) in msg.suggest" :key="i" class="ns-item" @click="onSuggest(it)">
              <span class="ns-ic">{{ it.ic || ['🔍', '📊', '💡'][i % 3] }}</span>
              <span class="ns-text">{{ it.t }}</span>
              <span class="ns-arrow">›</span>
            </div>
          </div>
        </div>

        <!-- 记忆徽标 -->
        <div v-if="msg.phase === 'done' && msg.memRounds" class="mem-badge" title="当前会话的上下文会持续记忆，可随时追问">
          <span class="mb-ic">🧠</span><span>本会话已记忆 <b>{{ msg.memRounds }}</b> 轮对话</span>
        </div>
      </div>

      <!-- AI 操作栏 -->
      <div v-if="msg.phase === 'done'" class="msg-actions">
        <div class="act-group">
          <button type="button" class="msg-act-btn act-like" :class="{ active: likeActive }" title="点赞" aria-label="点赞" @click="onLike" v-html="MSG_ACT_ICONS.like"></button>
          <button type="button" class="msg-act-btn act-dislike" :class="{ active: dislikeActive }" title="不喜欢" aria-label="不喜欢" @click="onDislike" v-html="MSG_ACT_ICONS.dislike"></button>
        </div>
        <div class="act-group">
          <button type="button" class="msg-act-btn act-copy" title="复制内容" aria-label="复制内容" @click="onCopy" v-html="MSG_ACT_ICONS.copy"></button>
          <button type="button" class="msg-act-btn act-regen" title="重新发起" aria-label="重新发起" @click="onRegen" v-html="MSG_ACT_ICONS.regen"></button>
        </div>
      </div>
    </div>
  </div>
</template>
