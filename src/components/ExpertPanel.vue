<script setup lang="ts">
/* 专家 · 技能 · MCP 面板：4个Tab（电商专家 / 连接器 / 技能 / MCP） */
import { computed, ref } from 'vue'
import {
  expertState, openExpertPanel, closeExpertPanel, toggleExpertPanel,
  type ExpertTab, type ExpertItem, type ConnectorItem, type SkillItem, type McpService
} from '../stores/expert'
import { chatState } from '../stores/chat'
import { send } from '../stores/send'

/* ---- Tab 切换 ---- */
const TABS: { key: ExpertTab; label: string }[] = [
  { key: 'expert', label: '电商专家' },
  { key: 'connector', label: '连接器' },
  { key: 'skill', label: '技能' },
  { key: 'mcp', label: 'MCP' },
]
function switchTab(t: ExpertTab) { expertState.activeTab = t }

/* ---- 精选场景（电商专家 Tab） ---- */
const SCENES = [
  { label: '1688 找货源', icon: '16', color: '#10ad53', items: ['1688-同款货源查询', '1688-一件代发工厂', '1688-分销选品'] },
  { label: 'Ozon 入驻评估', icon: 'Oz', color: '#1890FF', items: ['Ozon-单月基础信息', 'Ozon-入局时机', 'Ozon-差评归因'] },
  { label: '亚马逊选品', icon: 'Am', color: '#10ad53', items: ['亚马逊-核心词挖掘', '亚马逊-ASIN解析', '亚马逊-类目热搜词'] },
  { label: 'Temu 飙升雷达', icon: 'Te', color: '#FF7800', items: ['Temu-家居热销榜', 'Temu-动销比飙升榜', 'Temu-1688比价'] },
]

/* ---- 电商专家筛选 ---- */
const SOURCE_CHIPS = [
  { key: 'all', label: '全部' },
  { key: 'official', label: '官方' },
  { key: 'user', label: '我创建的' },
]
const CATEGORY_CHIPS = [
  { key: 'all', label: '全部' },
  { key: '选品上架', label: '选品上架' },
  { key: '店铺运营', label: '店铺运营' },
  { key: '商品管理', label: '商品管理' },
  { key: '评论分析', label: '评论分析' },
]
const PLATFORM_CHIPS = [
  { key: 'all', label: '全部' },
  { key: '1688', label: '1688' },
  { key: 'Ozon', label: 'Ozon' },
  { key: '亚马逊', label: '亚马逊' },
  { key: 'Temu', label: 'Temu' },
]

const filteredExperts = computed(() => {
  const s = expertState
  return s.experts.filter(e => {
    if (s.expertSourceFilter !== 'all' && e.source !== s.expertSourceFilter) return false
    if (s.expertCategoryFilter !== 'all' && e.category !== s.expertCategoryFilter) return false
    if (s.expertPlatformFilter !== 'all' && e.platform !== s.expertPlatformFilter) return false
    if (s.expertSearch && !e.name.toLowerCase().includes(s.expertSearch.toLowerCase()) && !e.desc.toLowerCase().includes(s.expertSearch.toLowerCase())) return false
    return true
  })
})

/* ---- 连接器筛选 ---- */
const CN_PLATFORM_CHIPS = [
  { key: 'all', label: '全部' },
  { key: '1688', label: '1688' },
  { key: 'Ozon', label: 'Ozon' },
  { key: '亚马逊', label: '亚马逊' },
  { key: 'Temu', label: 'Temu' },
]
const filteredConnectors = computed(() => {
  const s = expertState
  return s.connectors.filter(c => {
    if (s.connectorPlatformFilter !== 'all' && c.platform !== s.connectorPlatformFilter) return false
    if (s.connectorSearch && !c.name.toLowerCase().includes(s.connectorSearch.toLowerCase()) && !c.desc.toLowerCase().includes(s.connectorSearch.toLowerCase())) return false
    return true
  })
})

/* ---- 技能筛选 ---- */
const SKILL_TYPE_CHIPS = [
  { key: 'all', label: '全部' },
  { key: '选品', label: '选品' },
  { key: '评论分析', label: '评论分析' },
  { key: '监控', label: '监控' },
  { key: '比价', label: '比价' },
  { key: 'Listing', label: 'Listing' },
  { key: '趋势', label: '趋势' },
]
const filteredSkills = computed(() => {
  const s = expertState
  return s.skills.filter(sk => {
    if (s.skillSourceFilter !== 'all' && sk.source !== s.skillSourceFilter) return false
    if (s.skillTypeFilter !== 'all' && !sk.tags.includes(s.skillTypeFilter)) return false
    if (s.skillSearch && !sk.name.toLowerCase().includes(s.skillSearch.toLowerCase()) && !sk.desc.toLowerCase().includes(s.skillSearch.toLowerCase())) return false
    return true
  })
})

/* ---- MCP 筛选 ---- */
const MCP_STATUS_CHIPS = [
  { key: 'all', label: '全部' },
  { key: 'enabled', label: '已启用' },
  { key: 'disabled', label: '已停用' },
]
const filteredMcp = computed(() => {
  const s = expertState
  return s.mcpServices.filter(m => {
    if (s.mcpStatusFilter === 'enabled' && !m.enabled) return false
    if (s.mcpStatusFilter === 'disabled' && m.enabled) return false
    if (s.mcpSearch && !m.name.toLowerCase().includes(s.mcpSearch.toLowerCase()) && !m.desc.toLowerCase().includes(s.mcpSearch.toLowerCase())) return false
    return true
  })
})

/* ---- 平台颜色 ---- */
function platformColor(p: string): string {
  const map: Record<string, string> = { '1688': '#10ad53', 'Ozon': '#1890FF', '亚马逊': '#10ad53', 'Temu': '#FF7800' }
  return map[p] || '#909399'
}
function platformIcon(p: string): string {
  const map: Record<string, string> = { '1688': '16', 'Ozon': 'Oz', '亚马逊': 'Am', 'Temu': 'Te' }
  return map[p] || '?'
}

/* ---- 召唤（将专家/技能描述填入输入框并发送） ---- */
function onSummon(item: ExpertItem | SkillItem) {
  chatState.inputText = item.desc.replace(/\{[^}]+\}/g, '')
  closeExpertPanel()
  send()
}

/* ---- MCP 操作 ---- */
function toggleMcp(m: McpService) { m.enabled = !m.enabled }
function deleteMcp(m: McpService) {
  const idx = expertState.mcpServices.indexOf(m)
  if (idx >= 0) expertState.mcpServices.splice(idx, 1)
}

/* ---- 关闭面板 ---- */
function onClose() { closeExpertPanel() }
</script>

<template>
  <div class="expert-panel" :class="{ open: expertState.open }">
    <!-- 头部 -->
    <div class="ep-head">
      <div class="ep-head-left">
        <span class="ep-breadcrumb">雷达AI / Agent 工作台 / 专家 · 技能 · MCP</span>
      </div>
      <button class="ep-close" @click="onClose" title="关闭面板">&times;</button>
    </div>

    <!-- Tab 栏 -->
    <div class="ep-tabs">
      <button
        v-for="t in TABS" :key="t.key"
        class="ep-tab"
        :class="{ active: expertState.activeTab === t.key }"
        @click="switchTab(t.key)"
      >{{ t.label }}</button>
    </div>

    <!-- 内容区 -->
    <div class="ep-body">

      <!-- ========== 电商专家 ========== -->
      <div v-show="expertState.activeTab === 'expert'" class="ep-section">
        <div class="ep-section-head">
          <div>
            <h2 class="ep-title">电商专家</h2>
            <p class="ep-subtitle">预置电商方法的 AI 角色，选定后按任务模板直接下发任务</p>
          </div>
          <button class="ep-create-btn">+ 创建专家</button>
        </div>

        <!-- 精选场景 -->
        <div class="ep-scenes">
          <h3 class="ep-scenes-title">精选场景</h3>
          <div class="ep-scene-grid">
            <div v-for="sc in SCENES" :key="sc.label" class="ep-scene-card">
              <div class="ep-scene-icon" :style="{ background: sc.color }">{{ sc.icon }}</div>
              <div class="ep-scene-name">{{ sc.label }}</div>
              <div class="ep-scene-items">
                <div v-for="it in sc.items" :key="it" class="ep-scene-item">{{ it }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 筛选器 -->
        <div class="ep-filters">
          <div class="ep-filter-row">
            <div class="ep-chips">
              <button v-for="c in SOURCE_CHIPS" :key="c.key" class="ep-chip" :class="{ active: expertState.expertSourceFilter === c.key }" @click="expertState.expertSourceFilter = c.key as any">{{ c.label }}</button>
            </div>
            <div class="ep-chips">
              <button v-for="c in CATEGORY_CHIPS" :key="c.key" class="ep-chip" :class="{ active: expertState.expertCategoryFilter === c.key }" @click="expertState.expertCategoryFilter = c.key as any">{{ c.label }}</button>
            </div>
          </div>
          <div class="ep-filter-row">
            <span class="ep-filter-label">电商平台：</span>
            <div class="ep-chips">
              <button v-for="c in PLATFORM_CHIPS" :key="c.key" class="ep-chip" :class="{ active: expertState.expertPlatformFilter === c.key }" @click="expertState.expertPlatformFilter = c.key as any">{{ c.label }}</button>
            </div>
            <div class="ep-search">
              <input v-model="expertState.expertSearch" type="text" placeholder="搜索专家" />
            </div>
          </div>
        </div>

        <!-- 专家卡片列表 -->
        <div class="ep-card-grid">
          <div v-for="e in filteredExperts" :key="e.id" class="ep-card">
            <div class="ep-card-head">
              <span class="ep-card-icon" :style="{ background: platformColor(e.platform) }">{{ platformIcon(e.platform) }}</span>
              <div class="ep-card-title">{{ e.name }}</div>
            </div>
            <div class="ep-card-desc">{{ e.desc }}</div>
            <div class="ep-card-tags">
              <span class="ep-tag">选品上架</span>
              <span class="ep-tag">{{ e.platform }}</span>
            </div>
            <div class="ep-card-foot">
              <button class="ep-summon-btn" @click="onSummon(e)">召唤 <span class="ep-summon-arrow">▾</span></button>
            </div>
          </div>
        </div>
      </div>

      <!-- ========== 连接器 ========== -->
      <div v-show="expertState.activeTab === 'connector'" class="ep-section">
        <div class="ep-section-head">
          <div>
            <h2 class="ep-title">数据连接器</h2>
            <p class="ep-subtitle">一句话即可调用的平台数据接口，支持在输入框用 @ 引用</p>
          </div>
        </div>

        <div class="ep-filters">
          <div class="ep-filter-row">
            <span class="ep-filter-label">平台：</span>
            <div class="ep-chips">
              <button v-for="c in CN_PLATFORM_CHIPS" :key="c.key" class="ep-chip" :class="{ active: expertState.connectorPlatformFilter === c.key }" @click="expertState.connectorPlatformFilter = c.key as any">{{ c.label }}</button>
            </div>
            <div class="ep-search">
              <input v-model="expertState.connectorSearch" type="text" placeholder="搜索连接器" />
            </div>
          </div>
        </div>

        <div class="ep-card-grid">
          <div v-for="c in filteredConnectors" :key="c.id" class="ep-card ep-connector-card">
            <div class="ep-card-head">
              <span class="ep-card-icon ep-icon-at">@</span>
              <div class="ep-card-title">{{ c.name }}</div>
            </div>
            <div class="ep-card-desc">{{ c.desc }}</div>
            <div class="ep-card-tags">
              <span class="ep-tag">{{ c.platform }}</span>
              <span class="ep-tag">连接器</span>
              <span class="ep-tag">@ 引用</span>
            </div>
            <div class="ep-card-foot">
              <button class="ep-summon-btn" @click="chatState.inputText = c.name + ' ' + chatState.inputText; closeExpertPanel()">召唤 <span class="ep-summon-arrow">▾</span></button>
            </div>
          </div>
        </div>
      </div>

      <!-- ========== 技能 ========== -->
      <div v-show="expertState.activeTab === 'skill'" class="ep-section">
        <div class="ep-section-head">
          <div>
            <h2 class="ep-title">技能</h2>
            <p class="ep-subtitle">经过验证的任务模板，一键复用成熟的分析流程</p>
          </div>
          <button class="ep-create-btn ep-create-green">+ 创建技能</button>
        </div>

        <div class="ep-filters">
          <div class="ep-filter-row">
            <div class="ep-chips">
              <button v-for="c in SOURCE_CHIPS" :key="c.key" class="ep-chip" :class="{ active: expertState.skillSourceFilter === c.key }" @click="expertState.skillSourceFilter = c.key as any">{{ c.label }}</button>
            </div>
            <div class="ep-chips">
              <button v-for="c in SKILL_TYPE_CHIPS" :key="c.key" class="ep-chip" :class="{ active: expertState.skillTypeFilter === c.key }" @click="expertState.skillTypeFilter = c.key as any">{{ c.label }}</button>
            </div>
            <div class="ep-search">
              <input v-model="expertState.skillSearch" type="text" placeholder="搜索技能" />
            </div>
          </div>
        </div>

        <div class="ep-card-grid">
          <div v-for="sk in filteredSkills" :key="sk.id" class="ep-card ep-skill-card">
            <div class="ep-card-head">
              <span class="ep-card-icon ep-icon-bolt">&#9889;</span>
              <div class="ep-card-title">{{ sk.name }}</div>
            </div>
            <div class="ep-card-desc">{{ sk.desc }}</div>
            <div class="ep-card-tags">
              <span v-for="t in sk.tags" :key="t" class="ep-tag">{{ t }}</span>
            </div>
            <div class="ep-card-foot">
              <button class="ep-summon-btn" @click="onSummon(sk)">召唤 <span class="ep-summon-arrow">▾</span></button>
            </div>
          </div>
        </div>
      </div>

      <!-- ========== MCP ========== -->
      <div v-show="expertState.activeTab === 'mcp'" class="ep-section">
        <div class="ep-section-head">
          <div>
            <h2 class="ep-title">MCP服务</h2>
            <p class="ep-subtitle">接入外部MCP工具服务，其工具可在输入框用 @ 引用</p>
          </div>
          <button class="ep-create-btn ep-create-green">+ 添加MCP</button>
        </div>

        <div class="ep-filters">
          <div class="ep-filter-row">
            <div class="ep-chips">
              <button v-for="c in MCP_STATUS_CHIPS" :key="c.key" class="ep-chip" :class="{ active: expertState.mcpStatusFilter === c.key }" @click="expertState.mcpStatusFilter = c.key as any">{{ c.label }}</button>
            </div>
            <div class="ep-search">
              <input v-model="expertState.mcpSearch" type="text" placeholder="搜索MCP服务" />
            </div>
          </div>
        </div>

        <div class="ep-mcp-list">
          <div v-for="m in filteredMcp" :key="m.id" class="ep-mcp-card">
            <div class="ep-mcp-head">
              <span class="ep-card-icon ep-icon-gear">&#9881;</span>
              <div class="ep-mcp-info">
                <div class="ep-mcp-name">{{ m.name }}</div>
                <div class="ep-mcp-url">{{ m.url }}</div>
              </div>
              <span class="ep-mcp-status" :class="{ on: m.enabled }">{{ m.enabled ? '已启用' : '已停用' }}</span>
            </div>
            <div class="ep-mcp-desc">{{ m.desc }}</div>
            <div class="ep-mcp-meta">
              <span class="ep-mcp-proto">{{ m.protocol }}</span>
              <span class="ep-mcp-auth">{{ m.auth }}</span>
            </div>
            <div class="ep-mcp-tools">
              <button v-for="t in m.tools" :key="t" class="ep-mcp-tool-btn" @click="chatState.inputText = t + ' ' + chatState.inputText; closeExpertPanel()">{{ t }}</button>
            </div>
            <div class="ep-mcp-actions">
              <button class="ep-mcp-act" @click="toggleMcp(m)">{{ m.enabled ? '停用' : '启用' }}</button>
              <button class="ep-mcp-act">编辑</button>
              <button class="ep-mcp-act ep-mcp-danger" @click="deleteMcp(m)">删除</button>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>
