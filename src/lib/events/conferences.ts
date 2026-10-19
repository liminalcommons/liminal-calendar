import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { conferences, type Conference } from '@/lib/db/schema';

/** Look up a conference by its URL slug (e.g. 'limicon1'). Null if unknown. */
export async function getConferenceBySlug(slug: string): Promise<Conference | null> {
  const [row] = await db.select().from(conferences).where(eq(conferences.slug, slug)).limit(1);
  return row ?? null;
}

/** Look up a conference by id. Null if unknown. */
export async function getConferenceById(id: number): Promise<Conference | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const [row] = await db.select().from(conferences).where(eq(conferences.id, id)).limit(1);
  return row ?? null;
}

/** Every conference, oldest first — drives the admin conference panel. */
export async function listConferences(): Promise<Conference[]> {
  return db.select().from(conferences);
}
