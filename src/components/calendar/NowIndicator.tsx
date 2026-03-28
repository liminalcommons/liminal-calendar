'use client';

import React, { useState, useEffect } from 'react';
import { HOUR_HEIGHT } from './TimeGutter';

interface NowIndicatorProps {
  hourHeight?: number;
}

function getNowMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export function NowIndicator({ hourHeight = HOUR_HEIGHT }: NowIndicatorProps) {
  const [nowMinutes, setNowMinutes] = useState<number>(getNowMinutes);

  useEffect(() => {
    const interval = setInterval(() => {
      setNowMinutes(getNowMinutes());
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Only render during reasonable hours (0-1440 minutes)
  if (nowMinutes < 0 || nowMinutes > 24 * 60) return null;

  const topPx = (nowMinutes / 60) * hourHeight;

  return (
    <div
      className="absolute left-0 right-0 z-20 pointer-events-none"
      style={{ top: topPx }}
      aria-hidden="true"
    >
      {/* Red dot on left edge */}
      <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-red-500" />
      {/* Red line */}
      <div className="h-px bg-red-500 opacity-80" />
    </div>
  );
}
