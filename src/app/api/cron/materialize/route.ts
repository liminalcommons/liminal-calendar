import { NextResponse } from 'next/server';
import { getAllRecurrenceRules, saveRecurrenceRule, getNextOccurrences } from '@/lib/recurrence';
import { createEvent } from '@/lib/hylo-client';
import { filterNewOccurrences } from '@/lib/recurrence-materialize';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Verify CRON_SECRET
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceToken = process.env.HYLO_SERVICE_TOKEN;
  if (!serviceToken) {
    return NextResponse.json({ error: 'HYLO_SERVICE_TOKEN not configured' }, { status: 500 });
  }

  const fromDate = new Date();
  const WINDOW_DAYS = 14;

  let materialized = 0;
  let rulesProcessed = 0;
  const errors: string[] = [];

  try {
    const rules = await getAllRecurrenceRules();

    for (const rule of rules) {
      rulesProcessed++;
      try {
        const occurrences = getNextOccurrences(rule, fromDate, WINDOW_DAYS);

        const newOccurrences = filterNewOccurrences(occurrences, rule.lastMaterialized);

        for (const occurrence of newOccurrences) {
          try {
            await createEvent(serviceToken, rule.templateData.groupId, {
              title: rule.templateData.title,
              details: rule.templateData.details,
              startTime: occurrence.startTime,
              endTime: occurrence.endTime,
              timezone: rule.templateData.timezone,
              location: rule.templateData.location,
            });
            materialized++;
          } catch (eventErr) {
            const msg = eventErr instanceof Error ? eventErr.message : String(eventErr);
            errors.push(`rule ${rule.id} occurrence ${occurrence.startTime.toISOString()}: ${msg}`);
          }
        }

        // Update lastMaterialized and createdCount
        const updatedRule = {
          ...rule,
          lastMaterialized: new Date().toISOString(),
          createdCount: rule.createdCount + newOccurrences.length,
        };
        await saveRecurrenceRule(updatedRule);
      } catch (ruleErr) {
        const msg = ruleErr instanceof Error ? ruleErr.message : String(ruleErr);
        errors.push(`rule ${rule.id}: ${msg}`);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'Failed to load recurrence rules', details: msg },
      { status: 500 },
    );
  }

  const response: Record<string, unknown> = { materialized, rulesProcessed };
  if (errors.length > 0) {
    response.errors = errors;
  }

  return NextResponse.json(response);
}
