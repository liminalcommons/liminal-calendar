'use client';

import { RUNES, RuneKey } from './runeIcons';

interface RuneIconProps {
  rune: RuneKey;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'gold' | 'stone' | 'default';
  className?: string;
  showTooltip?: boolean;
}

const sizeClasses = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-xl',
  xl: 'text-2xl',
};

const variantClasses = {
  gold: 'text-amber-600',
  stone: 'text-stone-500',
  default: '',
};

export function RuneIcon({
  rune,
  size = 'md',
  variant = 'default',
  className = '',
  showTooltip = false,
}: RuneIconProps) {
  const runeData = RUNES[rune];

  return (
    <span
      className={`rune-icon ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      title={showTooltip ? `${runeData.name} - ${runeData.meaning}` : undefined}
      aria-label={runeData.meaning}
    >
      {runeData.char}
    </span>
  );
}

// Convenience components for common runes
export function SunRune(props: Omit<RuneIconProps, 'rune'>) {
  return <RuneIcon rune="sowilo" variant="gold" {...props} />;
}

export function CommunityRune(props: Omit<RuneIconProps, 'rune'>) {
  return <RuneIcon rune="othala" variant="stone" {...props} />;
}

export function SyncedRune(props: Omit<RuneIconProps, 'rune'>) {
  return <RuneIcon rune="raido" variant="stone" {...props} />;
}

export function ThresholdRune(props: Omit<RuneIconProps, 'rune'>) {
  return <RuneIcon rune="eihwaz" variant="gold" {...props} />;
}
