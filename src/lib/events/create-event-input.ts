/**
 * Pure validation for the POST /api/events body. Returns a typed, normalized
 * value ready to hand to drizzle's insert, OR an error tuple with the same
 * shape the route uses to emit NextResponse.json(..., { status }).
 */

export type EventVisibility = 'public' | 'private' | 'members';

export type EventCategory = 'speaker' | 'practice' | 'audience' | 'project' | 'other';

const CATEGORIES: ReadonlySet<string> = new Set(['speaker', 'practice', 'audience', 'project', 'other']);

export interface ValidatedCreateEventInput {
  title: string;
  description: string | null;
  startDate: Date;
  endDate: Date;
  timezone: string;
  location: string | null;
  imageUrl: string | null;
  recurrenceRule: string | null;
  visibility: EventVisibility;
  /** Limicon scope. Null/undefined = permanent-calendar event. */
  conferenceId: number | null;
  /** "Continues beyond Limicon" tick-box — transfer candidate flag. */
  continueBeyond: boolean;
  /** Limicon category. Null = uncategorised (keeps legacy hash colours). */
  category: EventCategory | null;
  /** Free text when category is 'other'. */
  categoryOther: string | null;
}

export interface CreateEventInputError {
  error: string;
  status: 400;
}

export type CreateEventValidation =
  | { ok: true; value: ValidatedCreateEventInput }
  | { ok: false; error: CreateEventInputError };

function str(x: unknown): string | null {
  return typeof x === 'string' ? x : null;
}

export function validateCreateEventInput(raw: unknown): CreateEventValidation {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: { error: 'Invalid JSON body', status: 400 } };
  }
  const b = raw as Record<string, unknown>;

  const title = str(b.title)?.trim();
  if (!title) {
    return { ok: false, error: { error: 'title is required', status: 400 } };
  }

  const startTimeStr = str(b.startTime);
  if (!startTimeStr) {
    return { ok: false, error: { error: 'startTime is required', status: 400 } };
  }
  const endTimeStr = str(b.endTime);
  if (!endTimeStr) {
    return { ok: false, error: { error: 'endTime is required', status: 400 } };
  }

  const startDate = new Date(startTimeStr);
  if (Number.isNaN(startDate.getTime())) {
    return { ok: false, error: { error: 'startTime is not a valid date', status: 400 } };
  }
  const endDate = new Date(endTimeStr);
  if (Number.isNaN(endDate.getTime())) {
    return { ok: false, error: { error: 'endTime is not a valid date', status: 400 } };
  }

  const rawVisibility = str(b.visibility);
  const visibility: EventVisibility =
    rawVisibility === 'public' || rawVisibility === 'private' || rawVisibility === 'members'
      ? rawVisibility
      : 'private';

  const rawConferenceId = b.conferenceId;
  const conferenceId =
    typeof rawConferenceId === 'number' && Number.isInteger(rawConferenceId) && rawConferenceId > 0
      ? rawConferenceId
      : null;

  const rawCategory = str(b.category)?.trim().toLowerCase() ?? null;
  const category: EventCategory | null =
    rawCategory && CATEGORIES.has(rawCategory) ? (rawCategory as EventCategory) : null;

  const rawCategoryOther = str(b.categoryOther)?.trim() ?? null;
  const categoryOther =
    rawCategoryOther && rawCategoryOther.length > 0 ? rawCategoryOther.slice(0, 200) : null;

  return {
    ok: true,
    value: {
      title,
      description: str(b.details),
      startDate,
      endDate,
      timezone: str(b.timezone) ?? 'UTC',
      location: str(b.location),
      imageUrl: str(b.imageUrl),
      recurrenceRule: str(b.recurrenceRule),
      visibility,
      conferenceId,
      continueBeyond: b.continueBeyond === true,
      category,
      categoryOther: category === 'other' ? categoryOther : null,
    },
  };
}
