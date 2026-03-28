import { kv } from '@vercel/kv';
import { addDays, addWeeks, addMonths, parseISO } from 'date-fns';

export type RecurrenceFrequency = 'daily' | 'weekly' | 'fortnightly' | 'monthly';
export type EndType = 'never' | 'date' | 'count';

export interface RecurrenceRule {
  id: string;
  templateEventId: string;
  frequency: RecurrenceFrequency;
  endType: EndType;
  endDate?: string;
  endCount?: number;
  createdCount: number;
  createdBy: string;
  createdAt: string;
  lastMaterialized?: string;
  templateData: {
    title: string;
    details?: string;
    startTime: string;
    endTime: string;
    timezone?: string;
    location?: string;
    groupId: string;
  };
}

const INDEX_KEY = 'recurrence:index';

function ruleKey(id: string): string {
  return `recurrence:rule:${id}`;
}

export async function saveRecurrenceRule(rule: RecurrenceRule): Promise<void> {
  await kv.set(ruleKey(rule.id), JSON.stringify(rule));
  const index: string[] = (await kv.get<string[]>(INDEX_KEY)) ?? [];
  if (!index.includes(rule.id)) {
    index.push(rule.id);
    await kv.set(INDEX_KEY, index);
  }
}

export async function getRecurrenceRule(id: string): Promise<RecurrenceRule | null> {
  const raw = await kv.get<string>(ruleKey(id));
  if (!raw) return null;
  return JSON.parse(raw) as RecurrenceRule;
}

export async function getAllRecurrenceRules(): Promise<RecurrenceRule[]> {
  const index: string[] = (await kv.get<string[]>(INDEX_KEY)) ?? [];
  if (index.length === 0) return [];

  const rules = await Promise.all(
    index.map(async (id) => {
      const raw = await kv.get<string>(ruleKey(id));
      if (!raw) return null;
      return JSON.parse(raw) as RecurrenceRule;
    }),
  );

  return rules.filter((r): r is RecurrenceRule => r !== null);
}

export async function deleteRecurrenceRule(id: string): Promise<void> {
  await kv.del(ruleKey(id));
  const index: string[] = (await kv.get<string[]>(INDEX_KEY)) ?? [];
  const updated = index.filter((existingId) => existingId !== id);
  await kv.set(INDEX_KEY, updated);
}

/**
 * Pure function — no KV calls. Computes the next occurrences of a rule
 * within a window starting from `fromDate` for `windowDays` days.
 *
 * Returns an array of { startTime, endTime } Date pairs for each occurrence.
 */
export function getNextOccurrences(
  rule: RecurrenceRule,
  fromDate: Date,
  windowDays: number,
): Array<{ startTime: Date; endTime: Date }> {
  const windowEnd = addDays(fromDate, windowDays);

  const templateStart = parseISO(rule.templateData.startTime);
  const templateEnd = parseISO(rule.templateData.endTime);
  const durationMs = templateEnd.getTime() - templateStart.getTime();

  const endDate = rule.endType === 'date' && rule.endDate ? parseISO(rule.endDate) : null;
  const maxCount = rule.endType === 'count' && rule.endCount != null ? rule.endCount : null;

  const results: Array<{ startTime: Date; endTime: Date }> = [];
  let occurrenceCount = rule.createdCount;

  // Advance the template start to find the first occurrence >= fromDate
  let cursor = new Date(templateStart);

  // Advance cursor to be >= fromDate
  while (cursor < fromDate) {
    cursor = advanceByFrequency(cursor, rule.frequency);
    occurrenceCount++;
  }

  while (cursor < windowEnd) {
    // Check end conditions
    if (endDate && cursor > endDate) break;
    if (maxCount !== null && occurrenceCount >= maxCount) break;

    results.push({
      startTime: new Date(cursor),
      endTime: new Date(cursor.getTime() + durationMs),
    });

    cursor = advanceByFrequency(cursor, rule.frequency);
    occurrenceCount++;
  }

  return results;
}

function advanceByFrequency(date: Date, frequency: RecurrenceFrequency): Date {
  switch (frequency) {
    case 'daily':
      return addDays(date, 1);
    case 'weekly':
      return addWeeks(date, 1);
    case 'fortnightly':
      return addWeeks(date, 2);
    case 'monthly':
      return addMonths(date, 1);
  }
}
