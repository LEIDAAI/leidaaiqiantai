/* =====================================================
 * 服务端智能体开场配置（原 AGENT_OPENING / parseAgentOpening）
 * ===================================================== */
import { reactive } from 'vue'

export const agentOpening = reactive({
  title: '开始一次新的选品分析',
  desc: '输入需求后，AI 将为你搜索和分析商品。',
  prompts: [] as string[]
})

export function parseAgentOpening(agent: any): { title: string; desc: string; prompts: string[] } {
  const source = agent && typeof agent === 'object' ? agent : {}
  const config = source.config || source.parameters || source.settings || {}
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = source[key] ?? config[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
    return ''
  }
  const title = pick('welcomeTitle', 'openingTitle', 'greetingTitle')
  const desc = pick('openingStatement', 'welcomeMessage', 'greeting', 'opening', 'welcome', 'openingMessage', 'description')
  const rawPrompts = source.suggestedQuestions || source.quickQuestions || source.promptSuggestions || source.exampleQuestions || config.suggestedQuestions || config.quickQuestions || config.promptSuggestions || []
  const prompts = Array.isArray(rawPrompts) ? rawPrompts.map((item: any) => typeof item === 'string' ? item : item && (item.label || item.text || item.question)).filter(Boolean).slice(0, 4) : []
  return { title: title || agentOpening.title, desc: desc || (title ? '' : agentOpening.desc), prompts }
}

export function applyAgentOpening(agent: any) {
  const parsed = parseAgentOpening(agent)
  agentOpening.title = parsed.title
  agentOpening.desc = parsed.desc
  agentOpening.prompts = parsed.prompts
}
