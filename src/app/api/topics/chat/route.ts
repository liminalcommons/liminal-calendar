import { NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import {
  TOPIC_TOOLS,
  buildTopicSystemPrompt,
  type TopicFormState,
} from '@/lib/topic-chat-tools';

const LITELLM_BASE_URL = process.env.LITELLM_BASE_URL || 'https://llm.castalia.one/v1';
const LITELLM_API_KEY = process.env.LITELLM_API_KEY || '';
const MODEL =
  process.env.LITELLM_TOPIC_MODEL ||
  process.env.LITELLM_MODEL ||
  'Liminalia';

interface IncomingMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

export async function POST(request: Request) {
  const user = await getAuthedUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in to use the host.' }, { status: 401 });
  }
  if (!LITELLM_API_KEY) {
    return NextResponse.json(
      { error: 'LLM not configured (missing LITELLM_API_KEY).' },
      { status: 503 },
    );
  }

  const { messages, formState } = (await request.json()) as {
    messages: IncomingMessage[];
    formState: TopicFormState;
  };

  // Strip orphan tool_calls — tool effects are applied client-side and not
  // replayed back into the model.
  const cleaned = messages
    .filter((m) => m.role !== 'tool')
    .map((m) => (m.tool_calls ? { role: m.role, content: m.content || '(updated form)' } : m));

  const llmMessages = [
    { role: 'system', content: buildTopicSystemPrompt(formState) },
    ...cleaned,
  ];

  const llmRes = await fetch(`${LITELLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LITELLM_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: llmMessages,
      tools: TOPIC_TOOLS,
      stream: false,
    }),
  });

  if (!llmRes.ok) {
    const err = await llmRes.text();
    console.error('Topic chat LLM error:', err);
    return NextResponse.json(
      { error: `Chat failed: ${err.substring(0, 200)}` },
      { status: 502 },
    );
  }

  const data = await llmRes.json();
  const choice = data.choices?.[0];
  if (!choice) return NextResponse.json({ error: 'No response' }, { status: 502 });

  return NextResponse.json({ message: choice.message });
}
