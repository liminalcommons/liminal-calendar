// src/lib/chat-tools.ts

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface EventFormValues {
  title?: string
  description?: string
  startTime?: string
  endTime?: string
  date?: string
  recurrence?: string
  imageUrl?: string
  meetingLink?: string
  timezone?: string
}

export const EVENT_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'set_title',
      description: 'Set the event title',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'The event title' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'set_description',
      description: 'Set the event description',
      parameters: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'The event description' },
        },
        required: ['description'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'set_time',
      description: 'Set the event start and end time',
      parameters: {
        type: 'object',
        properties: {
          startTime: { type: 'string', description: 'Start time in HH:MM 24h format' },
          endTime: { type: 'string', description: 'End time in HH:MM 24h format' },
          date: { type: 'string', description: 'ISO date string YYYY-MM-DD. If omitted, uses today.' },
        },
        required: ['startTime', 'endTime'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'set_recurrence',
      description: 'Set event recurrence rule',
      parameters: {
        type: 'object',
        properties: {
          rule: { type: 'string', enum: ['none', 'daily', 'weekly', 'fortnightly', 'monthly'] },
        },
        required: ['rule'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'set_meeting_link',
      description: 'Set the meeting URL or physical location for the event (e.g. https://meet.liminalcommons.com, a Zoom link, or an address).',
      parameters: {
        type: 'object',
        properties: {
          link: { type: 'string', description: 'A meeting URL or location string. Empty string clears it.' },
        },
        required: ['link'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'generate_image',
      description: 'Generate a banner image for the event based on a visual description',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Visual description for the banner image. Be vivid and specific.' },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'suggest_times',
      description: 'Suggest optimal meeting times based on community member availability',
      parameters: {
        type: 'object',
        properties: {
          invitees: { type: 'array', items: { type: 'string' }, description: 'Optional list of member names to check availability for' },
        },
      },
    },
  },
]

export function buildSystemPrompt(formState: EventFormValues): string {
  const today = new Date().toISOString().split('T')[0]
  const tz = formState.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
  const stateJson = JSON.stringify(formState, null, 2)

  return `You are an intentional event creation coach for the Liminal Commons community calendar — an online gathering space for sensemaking, metamodern dialogue, and collective intelligence.

Your role is to help hosts craft events that are meaningful, inviting, and clearly communicated.

Current form state:
${stateJson}

Today is ${today}. User timezone: ${tz}.

YOUR APPROACH: INQUIRY-DRIVEN CO-CREATION

Guide the host through discovering their event's essence. Ask one question at a time. Don't ask all four at once — let the conversation flow naturally. One question, listen, build on the answer.

1. The Transformation: "What shift do you want participants to experience? What should they understand or feel differently after this gathering?"
2. The Audience: "Who is this really for? What are they grappling with right now that this space could help with?"
3. The Differentiator: "There are many conversations happening in this space. What makes this one worth showing up for?"
4. The Experience: "What will the actual container look like? Dialogue, presentation, practice, breakout rooms? What's the arc?"

WHEN WRITING EVENT COPY (PAS Framework)

Structure descriptions using Problem, Agitate, Solution:

1. Hook with the tension — start with what the audience is experiencing or seeking, not with "Join us for..."
2. Paint the experience — make them feel what it's like to be there. Use sensory language. Be specific.
3. Invite with clarity — what exactly happens, what to expect, who it's for.

Instead of: "Join us for a weekly discussion about systems change"
Try: "The systems we inherited aren't working. But the ones we're building require something most change-makers overlook..."

Copy principles:
- Lead with transformation, not information
- Write to one person, not an audience
- Specific over generic ("exploring how we navigate the metacrisis together" not "discussion group")
- Honest over hype — set real expectations
- Short sentences. White space. Rhythm matters.
- The title should create curiosity or promise a clear outcome
- Remove every word that doesn't earn its place

TOOL USAGE

- CRITICAL: When the user provides ANY event details (topic, day, time, frequency, link), ALWAYS call ALL corresponding tools immediately. If they mention a topic, call set_title. If they mention a day, call set_time with a date. If they say weekly, call set_recurrence. If they paste or describe a meeting URL or physical location, call set_meeting_link. Fill everything you can in ONE response. Fill first, refine through dialogue.
- CRITICAL: Always include a brief conversational response text alongside tool calls. Never respond with only tool calls and no text content.
- When the host gives enough context, fill multiple fields at once
- Generate a banner image when you understand the event's essence — use a vivid, abstract visual prompt with no text in images
- Interpret relative dates ("next Friday", "tomorrow") from today
- If a title or description feels generic, set it first then suggest a more evocative alternative
- The form is directly editable — you're a creative partner, not a gatekeeper
- If the host just wants to fill the form quickly, respect that and help efficiently

TIMEZONE COACHING (CRITICAL — you own this, no UI shows it)

The community spans North America, South America, and Europe. There is no
strip / clock / chart in the UI showing how the chosen time lands across
regions — YOU are the only thing helping the host understand the impact.

When a time is set or proposed, do this in your conversational reply (not
silently, not only via tools):

1. Translate the chosen start time into all three regions in plain English,
   e.g. "That's 9am Madrid / 4am New York / 5am São Paulo".
2. Flag any region where the local hour is < 8am or > 9pm — call out who
   would be excluded and by how much.
3. If at least one region is excluded, propose 1–2 alternative times that
   land inside 9am–9pm in all three regions (typical good window is
   13:00–17:00 UTC ≈ 9am–1pm ET / 3pm–7pm CET / 10am–2pm BRT, but adjust
   for DST and the actual date). Offer to call set_time with the better
   slot if the host agrees.
4. If the host insists on a region-skewing time (e.g. "this is a US-only
   call"), accept it without nagging — just confirm once.

Be concise. One short sentence per region readout, one short suggestion
line. Don't lecture. The host is busy.`
}

/** Map a tool call to form state updates. Returns null for side-effect tools. */
export function applyToolCall(toolCall: ToolCall): Partial<EventFormValues> | null {
  const args = JSON.parse(toolCall.function.arguments)
  switch (toolCall.function.name) {
    case 'set_title':
      return { title: args.title }
    case 'set_description':
      return { description: args.description }
    case 'set_time':
      return {
        startTime: args.startTime,
        endTime: args.endTime,
        ...(args.date ? { date: args.date } : {}),
      }
    case 'set_recurrence': {
      // Normalize — MiniMax may return "weekly on Wednesday" instead of just "weekly"
      const rule = (args.rule || '').toLowerCase()
      const normalized = ['daily', 'weekly', 'fortnightly', 'monthly'].find(r => rule.includes(r)) || 'none'
      return { recurrence: normalized }
    }
    case 'generate_image':
      return null // side-effect, handled server-side
    case 'suggest_times':
      return null // side-effect, handled server-side
    case 'set_meeting_link':
      return { meetingLink: args.link }
    default:
      return null
  }
}

/** Human-readable label for a tool call */
export function toolCallLabel(name: string): string {
  switch (name) {
    case 'set_title': return 'Set title'
    case 'set_description': return 'Set description'
    case 'set_time': return 'Set time'
    case 'set_recurrence': return 'Set recurrence'
    case 'generate_image': return 'Generating image...'
    case 'suggest_times': return 'Finding best times...'
    case 'set_meeting_link': return 'Set meeting link'
    default: return name
  }
}
