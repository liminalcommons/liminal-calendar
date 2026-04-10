export const maxDuration = 60

import { NextResponse } from 'next/server'
import { uploadToR2 } from '@/lib/r2'
import { auth } from '../../../../auth'

import { getDb } from '@/lib/db'
import { sql } from 'drizzle-orm'

// Rate limits per user
const LIMITS = { daily: 10, weekly: 30, monthly: 60 }

async function checkRateLimit(userId: string): Promise<{ allowed: boolean; error?: string }> {
  const db = getDb()
  const result = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 day') AS daily,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS weekly,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS monthly
    FROM image_generations
    WHERE user_id = ${userId}
  `)
  const row = result.rows[0] as any
  if (!row) return { allowed: true }

  if (Number(row.daily) >= LIMITS.daily) return { allowed: false, error: `Daily limit reached (${LIMITS.daily}/day)` }
  if (Number(row.weekly) >= LIMITS.weekly) return { allowed: false, error: `Weekly limit reached (${LIMITS.weekly}/week)` }
  if (Number(row.monthly) >= LIMITS.monthly) return { allowed: false, error: `Monthly limit reached (${LIMITS.monthly}/month)` }
  return { allowed: true }
}

async function recordGeneration(userId: string) {
  const db = getDb()
  await db.execute(sql`
    INSERT INTO image_generations (user_id, created_at) VALUES (${userId}, NOW())
  `)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id || session.user.hyloId || session.user.email || 'unknown'
  const rateCheck = await checkRateLimit(userId)
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: rateCheck.error }, { status: 429 })
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

    await recordGeneration(userId)

    return NextResponse.json({ url: permanentUrl })
  } catch (error) {
    console.error('Generate image error:', error)
    return NextResponse.json({ error: 'Image generation failed' }, { status: 500 })
  }
}
