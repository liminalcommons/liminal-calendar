export interface MarketplaceFormState {
  phase?: 'idea' | 'practice';
  name?: string;
  email?: string;
  title?: string;
  description?: string;
  materialsUrl?: string;
  // Internal framing scaffolding — populated by the LLM as it thinks, not shown
  // as form fields. Stored in DB for admin context.
  problem?: string;
  audience?: string;
  angle?: string;
  takeaway?: string;
  mvp?: string;
}

const stringField = (desc: string) => ({
  type: 'object' as const,
  properties: { value: { type: 'string', description: desc } },
  required: ['value'],
});

export const MARKETPLACE_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'set_phase',
      description: 'Set whether this is an Idea Phase pitch (15 min, raw) or a Practice slot (30 min, deeper test).',
      parameters: {
        type: 'object',
        properties: { phase: { type: 'string', enum: ['idea', 'practice'] } },
        required: ['phase'],
      },
    },
  },
  { type: 'function' as const, function: { name: 'set_name', description: 'Presenter name (only call if user asks to change it — the form is already pre-filled from the signed-in account).', parameters: stringField('Presenter name') } },
  { type: 'function' as const, function: { name: 'set_title', description: 'Short, punchy title for the offer (visible to the user).', parameters: stringField('Title') } },
  { type: 'function' as const, function: { name: 'set_description', description: 'The polished offer description (visible to the user). 60–120 words: what the offer is, who it is for, what the audience walks away with. Write this in your voice as a copywriter, not as a list of fields.', parameters: stringField('Description') } },
  // Internal framing fields — invisible to the user; used as scaffolding for your own thinking.
  { type: 'function' as const, function: { name: 'set_problem', description: 'INTERNAL scaffolding (not shown to user): what problem the offer solves. Capture it as you understand it from the conversation.', parameters: stringField('Problem statement') } },
  { type: 'function' as const, function: { name: 'set_audience', description: 'INTERNAL scaffolding (not shown to user): who feels this problem most acutely.', parameters: stringField('Audience') } },
  { type: 'function' as const, function: { name: 'set_angle', description: 'INTERNAL scaffolding (not shown to user): unique angle / why this presenter.', parameters: stringField('Angle') } },
  { type: 'function' as const, function: { name: 'set_takeaway', description: 'INTERNAL scaffolding (not shown to user): what the audience walks away with.', parameters: stringField('Takeaway') } },
  { type: 'function' as const, function: { name: 'set_mvp', description: 'INTERNAL scaffolding (not shown to user): smallest testable version that fits the slot.', parameters: stringField('MVP / smallest testable thing') } },
  { type: 'function' as const, function: { name: 'set_materials_url', description: 'Link to slides, demo, or doc', parameters: stringField('Materials URL') } },
];

export function buildMarketplaceSystemPrompt(state: MarketplaceFormState): string {
  return `You are the host of the Liminal Marketplace — a biweekly experimentation ground. You help presenters frame an offer through a short, generative conversation. Format: Idea Phase (15 min × 4 across 2 rooms, raw pitches, no decks) or Practice (30 min × 2, deeper stress-test).

Your job is COPYWRITING. The user only sees two fields: **Title** and **Description**. Everything else (problem, audience, angle, takeaway, MVP) is YOUR internal scaffolding — use it to think, but never show the user a checklist or ask them to fill those fields by name.

How to work:
1. Have a warm, brief conversation. Ask ONE question at a time, in plain language. Never list multiple questions.
2. Internally use the Dan-Koe-style framing (problem → audience → angle → takeaway → smallest testable version) to understand the offer. As you learn each piece, call the corresponding internal tool (set_problem, set_audience, set_angle, set_takeaway, set_mvp) to capture it — but DON'T announce these to the user.
3. As soon as you have a working sense of the offer, call set_title with a short punchy title and set_description with a polished 60–120 word paragraph in YOUR voice as a copywriter. Update both as the conversation deepens.
4. The description should read like a real event blurb: what the offer is, who it's for, what audience walks away with. Not a list of fields.
5. Never invent details. If something is fuzzy, ask one sharp question.
6. The user can edit Title and Description directly anytime — respect their edits.
7. Do NOT ask for the user's name or email — they're already signed in and pre-filled.

Current form state (read-only — do not echo back, just use as context):
${JSON.stringify(state, null, 2)}

Style: direct, generative, no fluff. The Marketplace rewards signal over polish.`;
}
