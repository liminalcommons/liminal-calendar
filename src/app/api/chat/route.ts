export const maxDuration = 60

import { auth } from '../../../../auth'
import { uploadToR2 } from '@/lib/r2'
import { EVENT_TOOLS, buildSystemPrompt } from '@/lib/chat-tools'
import type { EventFormValues } from '@/lib/chat-tools'

const LITELLM_BASE_URL = process.env.LITELLM_BASE_URL || 'https://llm.castalia.one/v1'
const LITELLM_API_KEY = process.env.LITELLM_API_KEY || ''
const FAL_KEY = process.env.FAL_KEY || ''

async function generateImage(prompt: string): Promise<string> {
  const falRes = await fetch('https://fal.run/fal-ai/flux-2/flash', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${FAL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      image_size: { width: 768, height: 432 },
      num_images: 1,
    }),
  })
  if (!falRes.ok) throw new Error('fal.ai generation failed')
  const data = await falRes.json()
  const tempUrl = data.images?.[0]?.url
  if (!tempUrl) throw new Error('No image returned')

  const imageRes = await fetch(tempUrl)
  if (!imageRes.ok) throw new Error('Failed to download generated image')
  const buffer = Buffer.from(await imageRes.arrayBuffer())
  const contentType = imageRes.headers.get('content-type') || 'image/jpeg'
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
  const key = `calendar/generated/${Date.now()}.${ext}`
  return uploadToR2(key, buffer, contentType)
}

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

  const assistantMessage = choice.message

  const toolResults: Array<{ tool_call_id: string; result: any }> = []

  if (assistantMessage.tool_calls) {
    for (const tc of assistantMessage.tool_calls) {
      const args = JSON.parse(tc.function.arguments)

      if (tc.function.name === 'generate_image') {
        try {
          const imageUrl = await generateImage(args.prompt)
          toolResults.push({
            tool_call_id: tc.id,
            result: { success: true, imageUrl },
          })
        } catch (err) {
          console.error('Image generation failed:', err)
          toolResults.push({
            tool_call_id: tc.id,
            result: { success: false, error: 'Image generation failed' },
          })
        }
      }

      if (tc.function.name === 'suggest_times') {
        try {
          const suggestRes = await fetch(new URL('/api/scheduling/suggest', request.url), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Cookie': request.headers.get('cookie') || '',
            },
            body: JSON.stringify({
              inviteeIds: args.invitees || [],
              durationMinutes: 60,
            }),
          })
          const suggestions = suggestRes.ok ? await suggestRes.json() : []
          toolResults.push({
            tool_call_id: tc.id,
            result: { success: true, suggestions },
          })
        } catch {
          toolResults.push({
            tool_call_id: tc.id,
            result: { success: false, error: 'Could not fetch suggestions' },
          })
        }
      }
    }
  }

  return Response.json({
    message: assistantMessage,
    toolResults,
  })
}
