import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';

const LITELLM_BASE_URL = process.env.LITELLM_BASE_URL || 'https://llm.castalia.one/v1';
const LITELLM_API_KEY = process.env.LITELLM_API_KEY || '';
const MODEL = process.env.LITELLM_MARKETPLACE_MODEL || process.env.LITELLM_MODEL || 'Liminalia';

const SYSTEM_PROMPT = `You are a Socratic coach helping someone refine an offer for the Liminal Marketplace — a biweekly experimentation ground where presenters bring raw ideas (Idea Phase, 30 min, 4 spots) or near-prototypes (Practice, 30 min, 2 spots) and get tested live by an audience.

Your job: take their draft answers to the Dan-Koe-style framing questions and (a) sharpen each one if it's vague, (b) generate a tight 60-second pitch, and (c) suggest a punchy title. Style: direct, generative, no fluff. Never invent details that aren't in their input — if a field is empty or weak, ask them a single sharp follow-up question instead of fabricating.

Output JSON with shape:
{
  "title": string,
  "sharpened_pitch": string,         // 60-90 words, raw and concrete
  "problem":  string | null,         // tightened, or null if user must clarify
  "audience": string | null,
  "angle":    string | null,
  "takeaway": string | null,
  "mvp":      string | null,
  "follow_up_question": string | null  // a single Socratic question if any field is too weak; else null
}
Return ONLY the JSON, no prose.`;

interface Body {
  phase?: string;
  title?: string;
  problem?: string;
  audience?: string;
  angle?: string;
  takeaway?: string;
  mvp?: string;
  notes?: string;
}

export async function POST(request: Request) {
  const session = await auth().catch(() => null);
  if (!session?.user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  if (!LITELLM_API_KEY) {
    return NextResponse.json(
      { error: 'LLM not configured (missing LITELLM_API_KEY).' },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as Body;

  const userInput = JSON.stringify(
    {
      phase: body.phase ?? 'idea',
      title: body.title ?? '',
      problem: body.problem ?? '',
      audience: body.audience ?? '',
      angle: body.angle ?? '',
      takeaway: body.takeaway ?? '',
      mvp: body.mvp ?? '',
      notes: body.notes ?? '',
    },
    null,
    2,
  );

  const llmRes = await fetch(`${LITELLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LITELLM_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userInput },
      ],
      response_format: { type: 'json_object' },
      stream: false,
    }),
  });

  if (!llmRes.ok) {
    const err = await llmRes.text();
    console.error('Marketplace sharpen LLM error:', err);
    return NextResponse.json(
      { error: `LLM call failed: ${err.substring(0, 200)}` },
      { status: 502 },
    );
  }

  const data = await llmRes.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    return NextResponse.json({ error: 'No LLM response' }, { status: 502 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return NextResponse.json(
      { error: 'LLM returned non-JSON', raw: content },
      { status: 502 },
    );
  }

  return NextResponse.json(parsed);
}
