/**
 * POST /api/booking/event-types/ai-generate — turn a freeform
 * description into a structured EventType candidate.
 *
 * The user types something like "30-min coffee chat, in Castalia, 15
 * min buffer between bookings" and the assistant returns the same
 * shape EventTypeForm uses. The endpoint does NOT persist — caller
 * reviews and saves via the normal POST /api/booking/event-types.
 *
 * Auth: signed-in member. Talks to the same LiteLLM proxy
 * (`LITELLM_BASE_URL`, default https://llm.castalia.one/v1) used by
 * the /api/chat event-creation tools.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getCurrentMember } from '@/lib/auth/get-current-member';

export const maxDuration = 30;

const LITELLM_BASE_URL = process.env.LITELLM_BASE_URL || 'https://llm.castalia.one/v1';
const LITELLM_API_KEY = process.env.LITELLM_API_KEY || '';

const Input = z.object({
  prompt: z.string().min(3).max(2000),
});

const Candidate = z.object({
  title: z.string().min(1).max(120),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,49}$/),
  description: z.string().nullable(),
  durationMinutes: z.number().int().min(5).max(480),
  locationKind: z.enum(['castalia', 'external_link', 'in_person']),
  locationValue: z.string().nullable(),
  bufferBeforeMinutes: z.number().int().min(0).max(240),
  bufferAfterMinutes: z.number().int().min(0).max(240),
  minNoticeMinutes: z.number().int().min(0).max(43200),
  maxDaysAhead: z.number().int().min(1).max(365),
});

const SYSTEM_PROMPT = `You convert a user's freeform description of a 1:1 meeting type into a JSON object matching the schema below. Reply with JSON ONLY, no prose.

Schema:
{
  "title": string (1-120 chars, plain text, e.g. "Coffee Chat"),
  "slug": string (lowercase alphanumeric + hyphens, 2-50 chars, e.g. "coffee-chat"),
  "description": string | null (short, optional),
  "durationMinutes": integer (5-480; common: 15, 30, 45, 60),
  "locationKind": "castalia" | "external_link" | "in_person",
  "locationValue": string | null (null when locationKind=castalia; URL for external_link; address/place for in_person),
  "bufferBeforeMinutes": integer (0-240),
  "bufferAfterMinutes": integer (0-240),
  "minNoticeMinutes": integer (0-43200; default 60 = "at least 1 hour ahead"),
  "maxDaysAhead": integer (1-365; default 30)
}

Rules:
- Default locationKind to "castalia" (a Castalia talk-zone link is auto-minted) unless the user explicitly names Zoom/Meet/Teams/Discord (external_link) or a physical place (in_person).
- Default duration to 30 if unspecified.
- Default buffers to 0 unless the user mentions "buffer", "break", "setup", "padding", "rest between".
- Derive a clean slug from the title (lowercase, hyphens, no spaces, max 50).
- If the user provides URLs/addresses, put them in locationValue and set locationKind accordingly.`;

export async function POST(request: Request) {
  const member = await getCurrentMember(db);
  if (!member) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!LITELLM_API_KEY) {
    return NextResponse.json(
      { error: 'AI suggest is not configured on this deployment' },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'prompt is required (3-2000 chars)' }, { status: 400 });
  }

  let llmRes: Response;
  try {
    llmRes = await fetch(`${LITELLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LITELLM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'Liminalia',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: parsed.data.prompt },
        ],
        response_format: { type: 'json_object' },
        stream: false,
      }),
    });
  } catch (err) {
    console.error('[ai-generate] LiteLLM fetch failed', err);
    return NextResponse.json({ error: 'AI service unreachable' }, { status: 502 });
  }

  if (!llmRes.ok) {
    const errText = await llmRes.text().catch(() => '');
    console.error('[ai-generate] LiteLLM error:', llmRes.status, errText.slice(0, 200));
    return NextResponse.json({ error: 'AI service returned an error' }, { status: 502 });
  }

  let llmData: unknown;
  try {
    llmData = await llmRes.json();
  } catch {
    return NextResponse.json({ error: 'AI returned malformed response' }, { status: 502 });
  }

  const content = (
    llmData as { choices?: Array<{ message?: { content?: string } }> }
  ).choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    return NextResponse.json({ error: 'AI returned no content' }, { status: 502 });
  }

  let candidate: unknown;
  try {
    candidate = JSON.parse(content);
  } catch {
    return NextResponse.json({ error: 'AI returned invalid JSON' }, { status: 502 });
  }

  // Coerce common LLM near-misses before schema validation.
  if (candidate && typeof candidate === 'object') {
    const c = candidate as Record<string, unknown>;
    if (c.description === undefined) c.description = null;
    if (c.locationValue === undefined) c.locationValue = null;
    if (c.bufferBeforeMinutes === undefined) c.bufferBeforeMinutes = 0;
    if (c.bufferAfterMinutes === undefined) c.bufferAfterMinutes = 0;
    if (c.minNoticeMinutes === undefined) c.minNoticeMinutes = 60;
    if (c.maxDaysAhead === undefined) c.maxDaysAhead = 30;
    if (c.locationKind === 'castalia') c.locationValue = null;
  }

  const validated = Candidate.safeParse(candidate);
  if (!validated.success) {
    console.error('[ai-generate] schema mismatch', validated.error.issues, candidate);
    return NextResponse.json(
      { error: 'AI returned an unusable shape — try rephrasing.' },
      { status: 502 },
    );
  }

  return NextResponse.json({ candidate: validated.data });
}
