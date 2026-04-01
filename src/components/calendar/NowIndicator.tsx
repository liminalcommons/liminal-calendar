'use client';

import React, { useState, useEffect } from 'react';

interface NowIndicatorProps {
  hourHeights: number[]; // slot heights (48 slots)
  hourOffsets: number[]; // slot offsets (48 slots)
}

function getNowMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export function NowIndicator({ hourHeights, hourOffsets }: NowIndicatorProps) {
  const [nowMinutes, setNowMinutes] = useState<number>(getNowMinutes);

  useEffect(() => {
    const interval = setInterval(() => {
      setNowMinutes(getNowMinutes());
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  if (nowMinutes < 0 || nowMinutes > 24 * 60) return null;

  // Map minutes to 30-min slot system
  const slot = Math.min(Math.floor(nowMinutes / 30), 47);
  const frac = (nowMinutes - slot * 30) / 30;
  const topPx = hourOffsets[slot] + frac * hourHeights[slot];

  return (
    <div
      className="absolute left-0 right-0 z-20 pointer-events-none"
      style={{ top: topPx }}
      aria-hidden="true"
    >
      <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-red-500" />
      <div className="h-px bg-red-500 opacity-80" />
    </div>
  );
}
