import { getNextOccurrences, RecurrenceRule } from '../../lib/recurrence';
import { addDays } from 'date-fns';

function makeRule(overrides: Partial<RecurrenceRule> = {}): RecurrenceRule {
  const base: RecurrenceRule = {
    id: 'rule-1',
    templateEventId: 'event-1',
    frequency: 'weekly',
    endType: 'never',
    createdCount: 0,
    createdBy: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    templateData: {
      title: 'Weekly Meeting',
      startTime: '2026-03-25T10:00:00.000Z', // Wednesday
      endTime: '2026-03-25T11:00:00.000Z',
      groupId: 'group-1',
    },
  };
  return { ...base, ...overrides };
}

describe('getNextOccurrences', () => {
  const FROM_DATE = new Date('2026-03-28T00:00:00.000Z'); // Saturday
  const WINDOW_DAYS = 14;

  describe('weekly rule', () => {
    it('generates 1-2 occurrences in a 14-day window', () => {
      const rule = makeRule({ frequency: 'weekly' });
      const occurrences = getNextOccurrences(rule, FROM_DATE, WINDOW_DAYS);
      expect(occurrences.length).toBeGreaterThanOrEqual(1);
      expect(occurrences.length).toBeLessThanOrEqual(2);
    });

    it('each occurrence is within the window', () => {
      const rule = makeRule({ frequency: 'weekly' });
      const windowEnd = addDays(FROM_DATE, WINDOW_DAYS);
      const occurrences = getNextOccurrences(rule, FROM_DATE, WINDOW_DAYS);
      for (const occ of occurrences) {
        expect(occ.startTime >= FROM_DATE).toBe(true);
        expect(occ.startTime < windowEnd).toBe(true);
      }
    });

    it('preserves event duration', () => {
      const rule = makeRule({ frequency: 'weekly' });
      const occurrences = getNextOccurrences(rule, FROM_DATE, WINDOW_DAYS);
      for (const occ of occurrences) {
        const durationMs = occ.endTime.getTime() - occ.startTime.getTime();
        expect(durationMs).toBe(60 * 60 * 1000); // 1 hour
      }
    });
  });

  describe('end date enforcement', () => {
    it('stops before endDate', () => {
      // endDate is 3 days from now — within the 14-day window but before the next weekly occurrence
      const endDate = addDays(FROM_DATE, 3);
      const rule = makeRule({
        frequency: 'weekly',
        endType: 'date',
        endDate: endDate.toISOString(),
      });
      const occurrences = getNextOccurrences(rule, FROM_DATE, WINDOW_DAYS);
      for (const occ of occurrences) {
        expect(occ.startTime <= endDate).toBe(true);
      }
    });

    it('returns occurrences when endDate is beyond next occurrence', () => {
      const endDate = addDays(FROM_DATE, 10);
      const rule = makeRule({
        frequency: 'weekly',
        endType: 'date',
        endDate: endDate.toISOString(),
      });
      const occurrences = getNextOccurrences(rule, FROM_DATE, WINDOW_DAYS);
      expect(occurrences.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('end count enforcement', () => {
    it('stops when createdCount >= endCount', () => {
      const rule = makeRule({
        frequency: 'weekly',
        endType: 'count',
        endCount: 5,
        createdCount: 5, // already at limit
      });
      const occurrences = getNextOccurrences(rule, FROM_DATE, WINDOW_DAYS);
      expect(occurrences.length).toBe(0);
    });

    it('returns occurrences when createdCount < endCount', () => {
      const rule = makeRule({
        frequency: 'weekly',
        endType: 'count',
        endCount: 10,
        createdCount: 3, // 7 more allowed
      });
      const occurrences = getNextOccurrences(rule, FROM_DATE, WINDOW_DAYS);
      expect(occurrences.length).toBeGreaterThanOrEqual(1);
    });

    it('limits partial count — generates up to remaining quota', () => {
      const rule = makeRule({
        frequency: 'daily',
        endType: 'count',
        endCount: 5,
        createdCount: 4, // only 1 more allowed
      });
      const occurrences = getNextOccurrences(rule, FROM_DATE, WINDOW_DAYS);
      expect(occurrences.length).toBeLessThanOrEqual(1);
    });
  });

  describe('daily rule', () => {
    it('generates ~14 occurrences in a 14-day window', () => {
      const rule = makeRule({ frequency: 'daily' });
      const occurrences = getNextOccurrences(rule, FROM_DATE, WINDOW_DAYS);
      expect(occurrences.length).toBeGreaterThanOrEqual(13);
      expect(occurrences.length).toBeLessThanOrEqual(14);
    });
  });

  describe('fortnightly rule', () => {
    it('generates 1 occurrence in a 14-day window', () => {
      const rule = makeRule({ frequency: 'fortnightly' });
      const occurrences = getNextOccurrences(rule, FROM_DATE, WINDOW_DAYS);
      expect(occurrences.length).toBeGreaterThanOrEqual(1);
      expect(occurrences.length).toBeLessThanOrEqual(1);
    });
  });

  describe('monthly rule', () => {
    it('generates 0-1 occurrences in a 14-day window', () => {
      const rule = makeRule({ frequency: 'monthly' });
      const occurrences = getNextOccurrences(rule, FROM_DATE, WINDOW_DAYS);
      expect(occurrences.length).toBeGreaterThanOrEqual(0);
      expect(occurrences.length).toBeLessThanOrEqual(1);
    });
  });
});
