'use client';

import React, { useState, useEffect } from 'react';

interface NowIndicatorProps {
  hourHeights: number[];
  hourOffsets: number[];
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

  const hour = Math.min(Math.floor(nowMinutes / 60), 23);
  const frac = (nowMinutes - hour * 60) / 60;
  const topPx = hourOffsets[hour] + frac * hourHeights[hour];

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
