/**
 * Advisory event moderation via Jev (TypeSafe System One).
 *
 * Best-effort only: never throws, never blocks creation. Returns the verdict
 * for logging; callers decide nothing from it yet (human review loop owns
 * actions until thresholds are validated against production data).
 */
export type ModerationVerdict = {
  verdict: 'approve' | 'review' | 'reject';
  confidence: number;
};

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const AUTO_SHOW = 0.85;
const HIDE = 0.9;
const RUNNER_UP = 0.25;
const FLOOR = 0.5;

export function moderationAction(v: ModerationVerdict, probs: Record<string, number>): string {
  const runnerUp = Math.max(...Object.entries(probs).filter(([o]) => o !== v.verdict).map(([, p]) => p), 0);
  if (v.confidence < FLOOR || runnerUp > RUNNER_UP) return 'HUMAN';
  if (v.verdict === 'approve' && v.confidence >= AUTO_SHOW) return 'SHOW';
  if (v.verdict === 'reject' && v.confidence >= HIDE) return 'HIDE+NOTIFY';
  return 'HUMAN';
}

export async function judgeEvent(event: {
  title: string;
  description?: string | null;
  visibility?: string | null;
  creatorName?: string | null;
}): Promise<{ verdict: ModerationVerdict; probs: Record<string, number> } | null> {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'jev-latest',
        state: {
          title: event.title,
          description: String(event.description ?? '').slice(0, 2000),
          visibility: event.visibility ?? 'public',
          creator_name: event.creatorName ?? '',
        },
        questions: {
          approve_public: {
            type: 'choice',
            instructions: 'Decide whether this calendar event is fit for the public Liminal Commons calendar.',
            criteria: {
              approve: 'Genuine community event: real title, time, join info',
              review: 'Unclear or suspicious: missing details, spam-like',
              reject: 'Clearly spam, scam, or policy-violating',
            },
          },
        },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      answers?: { approve_public?: { choice: string; confidence: number; probabilities: Record<string, number> } };
    };
    const a = data.answers?.approve_public;
    if (!a || (a.choice !== 'approve' && a.choice !== 'review' && a.choice !== 'reject')) return null;
    return { verdict: { verdict: a.choice, confidence: a.confidence }, probs: a.probabilities ?? {} };
  } catch {
    return null;
  }
}
