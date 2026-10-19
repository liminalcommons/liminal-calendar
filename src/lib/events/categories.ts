import type { EventCategory } from './create-event-input';

export interface CategoryMeta {
  value: EventCategory;
  label: string;
  shortLabel: string;
  /** Tailwind classes for the month-grid chip (bg/border/text). */
  chip: string;
  /** Solid dot colour for week/day compact views. */
  dot: string;
}

/**
 * The four Limicon event categories. Colours are drawn from the existing
 * grove palette family so month-view chips sit naturally beside the legacy
 * hash colours used for uncategorised events.
 */
export const EVENT_CATEGORIES: CategoryMeta[] = [
  {
    value: 'speaker',
    label: 'Speaker presentation',
    shortLabel: 'Speaker',
    chip: 'bg-[#c4935a]/25 border-[#c4935a]/60 text-[#8a6132]',
    dot: '#c4935a',
  },
  {
    value: 'practice',
    label: 'Practice ritual',
    shortLabel: 'Practice',
    chip: 'bg-[#7a8b6a]/25 border-[#7a8b6a]/60 text-[#4c5a41]',
    dot: '#7a8b6a',
  },
  {
    value: 'audience',
    label: 'Audience participation',
    shortLabel: 'Audience',
    chip: 'bg-[#6a7f8b]/25 border-[#6a7f8b]/60 text-[#42525c]',
    dot: '#6a7f8b',
  },
  {
    value: 'other',
    label: 'Other (please specify)',
    shortLabel: 'Other',
    chip: 'bg-[#8b6a7f]/25 border-[#8b6a7f]/60 text-[#5c4256]',
    dot: '#8b6a7f',
  },
];

export function categoryMeta(category: string | null | undefined): CategoryMeta | null {
  if (!category) return null;
  return EVENT_CATEGORIES.find((c) => c.value === category) ?? null;
}
