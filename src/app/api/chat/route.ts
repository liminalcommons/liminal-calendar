import { auth } from '../../../../auth'
import { EVENT_TOOLS, buildSystemPrompt } from '@/lib/chat-tools'
import type { EventFormValues } from '@/lib/chat-tools'

const LITELLM_BASE_URL = process.env.LITELLM_BASE_URL || 'https://llm.castalia.one/v1'
const LITELLM_API_KEY = process.env.LITELLM_API_KEY || ''

export async function POST(request: Request) {
  const session = await auth()
  if (!(session as any)?.accessToken) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const { messages, formState, timezone } = await request.json() as {
    messages: Array<{ role: string; content: string | null; tool_calls?: any[]; tool_call_id?: string }>
    formState: EventFormValues
    timezone?: string
  }

  const systemPrompt = buildSystemPrompt({ ...formState, timezone })

  const llmMessages = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ]

  const llmRes = await fetch(`${LITELLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LITELLM_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'Liminalia',
      messages: llmMessages,
      tools: EVENT_TOOLS,
      stream: false,
    }),
  })

  if (!llmRes.ok) {
    const err = await llmRes.text()
    console.error('LiteLLM error:', err)
    return new Response(JSON.stringify({ error: 'Chat failed' }), { status: 502 })
  }

  const llmData = await llmRes.json()
  const choice = llmData.choices?.[0]
  if (!choice) {
    return new Response(JSON.stringify({ error: 'No response' }), { status: 502 })
  }

  return Response.json({
    message: choice.message,
  })
}
