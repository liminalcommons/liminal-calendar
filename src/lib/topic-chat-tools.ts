export interface TopicFormState {
  title?: string;
  description?: string;
  formatHint?: 'demo' | 'insight' | 'question' | 'other';
  materialsUrl?: string;
  // Internal scaffolding — captured by the LLM as it thinks. Stored in DB
  // for host context. Never shown as form fields to the user.
  hook?: string;
  audience?: string;
  takeaway?: string;
}

const stringField = (desc: string) => ({
  type: 'object' as const,
  properties: { value: { type: 'string', description: desc } },
  required: ['value'],
});

export const TOPIC_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'set_format',
      description:
        'Categorize the Topic: demo (showing something built), insight (sharing a finding/idea), question (open puzzle for the room), or other.',
      parameters: {
        type: 'object',
        properties: { formatHint: { type: 'string', enum: ['demo', 'insight', 'question', 'other'] } },
        required: ['formatHint'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'set_title',
      description: 'A short, punchy title for the Topic. Visible to the user and host.',
      parameters: stringField('Title'),
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'set_description',
      description:
        'The 60–120 word Topic description in the user\'s voice as a copywriter would polish it. Visible to the user and host. Should read like a TED-talk abstract: what they\'ll show in 10 minutes, the single idea or thing, why it matters.',
      parameters: stringField('Description'),
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'set_hook',
      description: 'INTERNAL scaffolding (not shown to user): the one thing the 10 minutes is really about — the single idea/demo at the core.',
      parameters: stringField('Hook'),
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'set_audience',
      description: 'INTERNAL scaffolding (not shown to user): who in the room this is for / who would care.',
      parameters: stringField('Audience'),
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'set_takeaway',
      description: 'INTERNAL scaffolding (not shown to user): what the room walks away with after the 10 minutes.',
      parameters: stringField('Takeaway'),
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'set_materials_url',
      description: 'Optional link to slides, repo, demo, or prior writing.',
      parameters: stringField('Materials URL'),
    },
  },
];

export function buildTopicSystemPrompt(state: TopicFormState): string {
  return `You are the host of Show & Tell — a biweekly hour for idea and insight exchange across the Liminal Web. You help presenters shape a Topic: a TED-talk-style 10-minute presentation, concise and impactful, demonstrating one thing they're working on, thinking about, or wrestling with.

Time is the constraint, and the constraint is the craft. Your job is to help the user carve their idea down to one clear thing they can show in ten minutes.

Your job is COPYWRITING. The user only sees two visible fields: **Title** and **Description**. Everything else (hook, audience, takeaway, format) is YOUR internal scaffolding — use it to think, but never present it as a checklist or ask the user to fill those fields by name.

How to work:
1. Have a warm, brief conversation. Ask ONE question at a time, in plain language. Never list multiple questions.
2. Internally use this scaffolding — hook → audience → takeaway → format — to understand the Topic. As you learn each piece, call the matching internal tool (set_hook, set_audience, set_takeaway, set_format) to capture it. DON'T announce these to the user.
3. As soon as you have a working sense of the Topic, call set_title with a short punchy title and set_description with a polished 60–120 word abstract in your voice. Update both as the conversation deepens.
4. The description should read like a TED-talk abstract: what they'll show in the ten minutes, the single thing at the core, why it matters to the room. Not a list of fields, not a CV.
5. Push back gently if the Topic is too big for ten minutes. Help them pick one slice. The constraint is the gift.
6. Never invent details. If something is fuzzy, ask one sharp question.
7. The user can edit Title and Description directly anytime — respect their edits.
8. Do NOT ask for the user's name or email — they're already signed in.

Current form state (read-only — do not echo back, just use as context):
${JSON.stringify(state, null, 2)}

Style: direct, generative, no fluff. Show & Tell rewards signal over polish.`;
}
