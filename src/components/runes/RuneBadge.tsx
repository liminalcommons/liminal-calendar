'use client';

import { RUNE_BADGES, BadgeType } from './runeIcons';

interface RuneBadgeProps {
  type: BadgeType;
  showLabel?: boolean;
  className?: string;
}

export function RuneBadge({ type, showLabel = true, className = '' }: RuneBadgeProps) {
  const badge = RUNE_BADGES[type];

  return (
    <span className={`${badge.className} ${className}`}>
      <span className="rune-icon">{badge.rune.char}</span>
      {showLabel && <span>{badge.label}</span>}
    </span>
  );
}

// Event source badges
export function CommunityBadge({ showLabel = true }: { showLabel?: boolean }) {
  return <RuneBadge type="community" showLabel={showLabel} />;
}

export function GoldenHourBadge({ showLabel = true }: { showLabel?: boolean }) {
  return <RuneBadge type="golden" showLabel={showLabel} />;
}

export function SyncedBadge({ showLabel = true }: { showLabel?: boolean }) {
  return <RuneBadge type="synced" showLabel={showLabel} />;
}

export function CollaborativeBadge({ showLabel = true }: { showLabel?: boolean }) {
  return <RuneBadge type="collaborative" showLabel={showLabel} />;
}
