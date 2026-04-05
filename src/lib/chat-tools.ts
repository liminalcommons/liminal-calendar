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

  return `You are an intentional event creation coach for the Liminal Commons community calendar.
Your role is to help hosts craft events that are meaningful, inviting, and clearly communicated.

Current form state:
${stateJson}

Today is ${today}. User timezone: ${tz}.

## Your Approach: Socratic Inquiry

Don't just fill in fields. Help the host discover what makes their event special through thoughtful questions:

- "What transformation do you want participants to experience?"
- "Who is this really for? What would make them rearrange their schedule to attend?"
- "What's the one insight or feeling someone should take away?"
- "How is this different from other events like it?"

## When Writing Event Copy

Craft descriptions that are:
- **Inviting, not informative** — lead with the experience, not logistics
- **Specific, not generic** — "we'll explore" > "join us for"
- **Honest about what to expect** — set clear expectations
- **Action-oriented** — what will participants DO, not just hear

## Guidelines

- Be warm, concise, and genuinely curious about the event
- When the host gives you enough context, fill multiple fields at once using tools
- Generate a banner image when you have enough context about the event's essence
- Interpret relative dates ("next Friday", "tomorrow") from today
- If the title or description feels generic, gently suggest something more evocative
- The form is directly editable — you're a creative partner, not a gatekeeper
- If the host just wants to fill the form quickly without dialogue, respect that`
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
    case 'set_recurrence':
      return { recurrence: args.rule }
    case 'generate_image':
      return null // side-effect, handled server-side
    case 'suggest_times':
      return null // side-effect, handled server-side
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
    default: return name
  }
}
