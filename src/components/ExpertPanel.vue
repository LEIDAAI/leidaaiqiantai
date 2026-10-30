<script setup lang="ts">
/* 专家/技能发现页（dir-page）：灵感广场 / 我的 / 创建 */
import { ref, computed } from 'vue'
import { modals, navigatePage } from '../stores/modals'
import { chatState } from '../stores/chat'
import { expertState, expertDemo, skillDemo, type ExpertItem, type SkillItem } from '../stores/expert'

const isSkills = computed(() => modals.page === 'skills')
const tab = ref<'plaza' | 'mine' | 'create'>('plaza')
const chip = ref('推荐')
const expertChips = ['推荐', '选品上架', '店铺运营', '商品管理', '评论分析']
const skillChips = ['推荐', '选品与开发', '产品运营', '数据分析', '选品/热点']
const caseItem = ref<ExpertItem | SkillItem | null>(null)
const isCaseSkill = computed(() => !!caseItem.value && 'version' in caseItem.value)

const plazaExperts = computed(() => {
  const list = expertState.experts.filter(e => e.source === 'official')
  if (chip.value === '推荐') return list.slice(0, 6)
  if (chip.value === '全部') return list
  return list.filter(e => e.category === chip.value || e.tags.includes(chip.value))
})
const plazaSkills = computed(() => {
  const list = expertState.skills.filter(s => s.source === 'official')
  if (chip.value === '推荐') return list.slice(0, 6)
  if (chip.value === '全部') return list
  return list.filter(s => s.scenario === chip.value || s.tags.includes(chip.value))
})
const mineExperts = computed(() => expertState.experts.filter(e => e.source === 'user'))
const mineSkills = computed(() => expertState.skills.filter(s => s.source === 'user'))
const platformColor: Record<string, string> = { '1688': '#ff6a00', 'Ozon': '#005bff', '亚马逊': '#ff9900', 'Temu': '#fb7701' }
const platformInitial: Record<string, string> = { '1688': '1688', 'Ozon': 'O', '亚马逊': 'A', 'Temu': 'T' }

function useExpert(e: ExpertItem) {
  chatState.inputText = e.prompts?.[0] || e.desc
  navigatePage('chat')
}
function useSkill(s: SkillItem) {
  chatState.inputText = s.instructions || s.desc
  navigatePage('chat')
}
function switchTab(t: 'plaza' | 'mine' | 'create') {
  tab.value = t
  if (t === 'plaza') chip.value = '推荐'
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
          <button class="dir-tab" :class="{ on: tab === 'plaza' }" @click="switchTab('plaza')">灵感广场</button>
          <button class="dir-tab" :class="{ on: tab === 'mine' }" @click="switchTab('mine')">{{ isSkills ? '我的技能' : '我的专家' }}</button>
        </div>
        <button class="dir-create-btn" @click="switchTab('create')">+ 创建{{ isSkills ? '技能' : '专家' }}</button>
      </div>

      <!-- 灵感广场 -->
      <div v-if="tab === 'plaza'">
        <div class="dir-chips">
          <button v-for="c in (isSkills ? skillChips : expertChips)" :key="c" class="dir-chip" :class="{ on: chip === c }" @click="chip = c">{{ c }}</button>
        </div>
        <div class="dir-grid">
          <template v-if="!isSkills">
            <div v-for="(e, ei) in plazaExperts" :key="e.id" class="dir-card">
              <span v-if="ei < 2" class="dir-new">NEW</span>
              <button class="dir-cover" title="立即使用" @click="useExpert(e)"></button>
              <div class="dir-body">
                <span class="dc-ava" :style="{ background: platformColor[e.platform] || '#00A83E' }">{{ platformInitial[e.platform] || 'E' }}</span>
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
              <button class="dir-cover" title="前往使用" @click="useSkill(s)"></button>
              <div class="dir-body">
                <span class="dc-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg>
                </span>
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
              <button class="dir-cover" title="立即使用" @click="useExpert(e)"></button>
              <div class="dir-body">
                <span class="dc-ava" :style="{ background: platformColor[e.platform] || '#00A83E' }">{{ platformInitial[e.platform] || 'E' }}</span>
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
              <button class="dir-cover" title="前往使用" @click="useSkill(s)"></button>
              <div class="dir-body">
                <span class="dc-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg>
                </span>
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
          <div class="de-sub">去灵感广场发现，或创建自己的{{ isSkills ? '技能' : '专家' }}</div>
          <button class="da main" @click="switchTab('plaza')">去灵感广场</button>
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

      <!-- 案例弹窗 -->
      <div v-if="caseItem" class="case-mask" @click.self="caseItem = null">
        <div class="case-pop">
          <div class="case-head">
            <div class="case-title">{{ caseItem.name }}</div>
            <button class="case-close" @click="caseItem = null">✕</button>
          </div>
          <div class="case-body">
            <template v-if="!isCaseSkill">
              <div class="case-label">{{ (caseItem as ExpertItem).caseTitle }}</div>
              <div class="case-metrics">
                <div v-for="m in (caseItem as ExpertItem).caseMetrics || []" :key="m.label" class="cm-item">
                  <div class="cm-val">{{ m.value }}</div>
                  <div class="cm-lab">{{ m.label }}</div>
                </div>
              </div>
              <table class="case-table">
                <tbody>
                  <tr v-for="(row, ri) in (caseItem as ExpertItem).caseRows || []" :key="ri">
                    <td v-for="(cell, ci) in row" :key="ci">{{ cell }}</td>
                  </tr>
                </tbody>
              </table>
              <div class="case-conclusion">{{ (caseItem as ExpertItem).caseConclusion }}</div>
              <div class="case-label">试试这样问</div>
              <button v-for="(p, pi) in (caseItem as ExpertItem).prompts || []" :key="pi" class="case-prompt" @click="useExpert(caseItem as ExpertItem)">{{ p }}</button>
            </template>
            <template v-else>
              <div class="case-label">执行步骤</div>
              <ol class="case-steps">
                <li v-for="(st, si) in (caseItem as SkillItem).steps || []" :key="si">{{ st }}</li>
              </ol>
              <div class="case-label">输出示例</div>
              <pre class="case-output">{{ (caseItem as SkillItem).outputExample }}</pre>
              <button class="case-prompt main" @click="useSkill(caseItem as SkillItem)">立即使用该技能</button>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
