'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'liminal-migration-banner-dismissed-v1';

export function MigrationBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) !== '1') setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {}
    setVisible(false);
  };

  return (
    <div
      role="status"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        width: '100%',
        background: 'linear-gradient(90deg, #c4935a 0%, #b07a44 100%)',
        color: '#1a1209',
        padding: '12px 16px',
        fontSize: 14,
        lineHeight: 1.5,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      }}
    >
      <span style={{ fontSize: 20 }} aria-hidden>
        🛠️
      </span>
      <span style={{ flex: 1 }}>
        <strong>Database migration in progress.</strong> Past events, RSVPs and
        notification settings may briefly appear missing while we restore ~50
        days of history from our previous database. New events and RSVPs are
        saved normally. Push reminders may pause until restore completes —
        you can re-enable them once it's done. Sorry for the inconvenience.
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss notice"
        style={{
          background: 'rgba(0,0,0,0.18)',
          border: 'none',
          borderRadius: 4,
          color: '#1a1209',
          cursor: 'pointer',
          padding: '6px 12px',
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        Got it
      </button>
    </div>
  );
}
