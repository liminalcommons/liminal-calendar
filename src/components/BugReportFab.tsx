'use client';

import { useState } from 'react';
import { Bug, X, Send } from 'lucide-react';
import { useSession } from 'next-auth/react';

const GITHUB_REPO = 'liminalcommons/liminal-calendar';

export function BugReportFab() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'bug' | 'feature' | 'feedback'>('bug');

  const user = session?.user as any;

  const handleSubmit = () => {
    if (!title.trim()) return;

    const labels = type === 'bug' ? 'bug' : type === 'feature' ? 'enhancement' : 'feedback';
    const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const screenSize = typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '';

    const body = [
      `## Description`,
      description || '_No description provided_',
      '',
      `## Context`,
      `- **Page:** ${currentUrl}`,
      `- **Reporter:** ${user?.name || 'Anonymous'}`,
      `- **Screen:** ${screenSize}`,
      `- **Browser:** ${userAgent.split(' ').slice(-2).join(' ')}`,
      `- **Theme:** ${document.documentElement.classList.contains('dark') ? 'Dark' : 'Light'}`,
      '',
      `---`,
      `_Reported from Liminal Calendar bug report button_`,
    ].join('\n');

    const url = `https://github.com/${GITHUB_REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=${labels}`;
    window.open(url, '_blank');

    // Reset
    setTitle('');
    setDescription('');
    setType('bug');
    setOpen(false);
  };

  return (
    <>
      {/* FAB button */}
      <button
        onClick={() => setOpen(!open)}
        className={`fixed bottom-4 right-4 z-50 w-12 h-12 rounded-full shadow-lg flex items-center justify-center
                    transition-all duration-200 ${
          open
            ? 'bg-grove-border text-grove-text-muted rotate-45'
            : 'bg-grove-accent-deep text-grove-surface hover:opacity-90'
        }`}
        title="Report a bug or suggest a feature"
      >
        {open ? <X size={20} /> : <Bug size={20} />}
      </button>

      {/* Report form */}
      {open && (
        <div className="fixed bottom-20 right-4 z-50 w-80 bg-grove-surface border border-grove-border rounded-xl shadow-xl overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <h3 className="text-sm font-serif font-semibold text-grove-text">Report an Issue</h3>
            <p className="text-[10px] text-grove-text-muted mt-0.5">Help us improve the calendar</p>
          </div>

          <div className="px-4 pb-4 space-y-3">
            {/* Type selector */}
            <div className="flex gap-1.5">
              {(['bug', 'feature', 'feedback'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`text-[10px] px-2.5 py-1 rounded-full border font-medium transition-colors ${
                    type === t
                      ? 'bg-grove-accent-deep text-grove-surface border-grove-accent-deep'
                      : 'border-grove-border text-grove-text-muted hover:text-grove-text'
                  }`}
                >
                  {t === 'bug' ? 'Bug' : t === 'feature' ? 'Feature' : 'Feedback'}
                </button>
              ))}
            </div>

            {/* Title */}
            <input
              type="text"
              placeholder={type === 'bug' ? 'What went wrong?' : type === 'feature' ? 'What would you like?' : 'Your thoughts...'}
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full text-sm bg-grove-bg border border-grove-border rounded-lg px-3 py-2
                         text-grove-text placeholder:text-grove-text-dim
                         focus:outline-none focus:ring-1 focus:ring-grove-accent"
            />

            {/* Description */}
            <textarea
              placeholder="Details (optional)"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full text-xs bg-grove-bg border border-grove-border rounded-lg px-3 py-2
                         text-grove-text placeholder:text-grove-text-dim resize-none
                         focus:outline-none focus:ring-1 focus:ring-grove-accent"
            />

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={!title.trim()}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-grove-accent-deep text-grove-surface
                         text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <Send size={12} />
              Open on GitHub
            </button>
          </div>
        </div>
      )}
    </>
  );
}
