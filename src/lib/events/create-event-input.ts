/**
 * Pure validation for the POST /api/events body. Returns a typed, normalized
 * value ready to hand to drizzle's insert, OR an error tuple with the same
 * shape the route uses to emit NextResponse.json(..., { status }).
 */

export interface ValidatedCreateEventInput {
  title: string;
  description: string | null;
  startDate: Date;
  endDate: Date;
  timezone: string;
  location: string | null;
  imageUrl: string | null;
  recurrenceRule: string | null;
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
    },
  };
}
