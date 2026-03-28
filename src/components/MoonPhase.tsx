import { getMoonPhase, getMoonPhaseEmoji, getMoonPhaseName } from '@/lib/moon-phase';

export function MoonPhase() {
  const phase = getMoonPhase(new Date());
  const emoji = getMoonPhaseEmoji(phase);
  const name = getMoonPhaseName(phase);

  return (
    <span className="inline-flex items-center gap-1 text-xs text-grove-text-muted font-serif">
      <span aria-hidden="true">{emoji}</span>
      <span>{name}</span>
    </span>
  );
}
