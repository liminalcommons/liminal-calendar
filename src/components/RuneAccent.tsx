import React from 'react';

const RUNES = ['ᛟ', 'ᛊ', 'ᚱ', 'ᛞ', 'ᚷ', 'ᛇ'];

interface RuneAccentProps {
  size?: 'sm' | 'md';
  className?: string;
  /** Optional seed for deterministic rune selection */
  seed?: number;
}

export function RuneAccent({ size = 'md', className = '', seed = 0 }: RuneAccentProps) {
  const rune = RUNES[seed % RUNES.length];
  const sizeClass = size === 'sm' ? 'text-lg' : 'text-2xl';

  return (
    <span
      className={`font-serif select-none pointer-events-none opacity-[0.13] ${sizeClass} ${className}`}
      aria-hidden="true"
    >
      {rune}
    </span>
  );
}
