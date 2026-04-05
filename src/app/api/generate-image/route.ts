export const maxDuration = 60

import { NextResponse } from 'next/server'
import { uploadToR2 } from '@/lib/r2'
import { auth } from '../../../../auth'

// Rate limit: 10 image generations per user per day (resets on cold start)
const DAILY_LIMIT = 10
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(userId: string): { allowed: boolean; remaining: number } {
  const now = Date.now()
  const entry = rateLimitMap.get(userId)
  if (!entry || now > entry.resetAt) {
    // Reset at midnight UTC
    const tomorrow = new Date()
    tomorrow.setUTCHours(24, 0, 0, 0)
    rateLimitMap.set(userId, { count: 1, resetAt: tomorrow.getTime() })
    return { allowed: true, remaining: DAILY_LIMIT - 1 }
  }
  if (entry.count >= DAILY_LIMIT) {
    return { allowed: false, remaining: 0 }
  }
  entry.count++
  return { allowed: true, remaining: DAILY_LIMIT - entry.count }
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as any).id || (session.user as any).hyloId || session.user.email || 'unknown'
  const { allowed, remaining } = checkRateLimit(userId)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Daily image generation limit reached (10/day). Try again tomorrow.' },
      { status: 429 },
    )
  }

  const FAL_KEY = process.env.FAL_KEY
  if (!FAL_KEY) {
    return NextResponse.json({ error: 'Image generation not configured' }, { status: 503 })
  }

  try {
    const { title, description, prompt: directPrompt } = await request.json()
    if (!title && !directPrompt) {
      return NextResponse.json({ error: 'Title or prompt is required' }, { status: 400 })
    }

    // Use direct prompt from AI tool call, or build one from title
    const prompt = directPrompt
      || `A beautiful, vibrant event banner illustration for: "${title}". ${description ? `Context: ${description}.` : ''} Modern, clean design with warm colors. No text or letters in the image. Abstract and evocative, suitable as a wide banner.`

    // Call fal.ai FLUX 2 Flash (same as weaver agent)
    const falRes = await fetch('https://fal.run/fal-ai/flux-2/flash', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        image_size: { width: 1024, height: 512 },
        num_images: 1,
      }),
    })

    if (!falRes.ok) {
      const err = await falRes.text()
      console.error('fal.ai error:', err)
      return NextResponse.json({ error: 'Image generation failed' }, { status: 502 })
    }

    const data = await falRes.json()
    const tempUrl = data.images?.[0]?.url
    if (!tempUrl) {
      return NextResponse.json({ error: 'No image returned' }, { status: 502 })
    }

    // Download from fal CDN and re-upload to R2 for permanence
    const imageRes = await fetch(tempUrl)
    if (!imageRes.ok) {
      return NextResponse.json({ error: 'Failed to download generated image' }, { status: 502 })
    }
    const imageBuffer = Buffer.from(await imageRes.arrayBuffer())
    const contentType = imageRes.headers.get('content-type') || 'image/jpeg'
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'

    const key = `calendar/generated/${Date.now()}.${ext}`
    const permanentUrl = await uploadToR2(key, imageBuffer, contentType)

    return NextResponse.json({ url: permanentUrl })
  } catch (error) {
    console.error('Generate image error:', error)
    return NextResponse.json({ error: 'Image generation failed' }, { status: 500 })
  }
}
