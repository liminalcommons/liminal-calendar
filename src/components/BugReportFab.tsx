'use client';

import { useState, useEffect } from 'react';
import { Bug, X, Send, Check, AlertCircle } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { installConsoleInterceptors, getRecentLogsAsString } from '@/lib/client-logger';

type SubmitStatus = 'idle' | 'submitting' | 'success' | 'error';

export function BugReportFab() {
  const { data: session } = useSession();

  useEffect(() => {
    installConsoleInterceptors();
  }, []);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'bug' | 'feature' | 'feedback'>('bug');
  const [status, setStatus] = useState<SubmitStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [issueUrl, setIssueUrl] = useState<string | null>(null);

  const user = session?.user;

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setStatus('submitting');
    setErrorMsg('');

    try {
      const res = await fetch('/api/bug-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          type,
          clientLogs: getRecentLogsAsString(100),
          metadata: {
            url: window.location.href,
            reporter: user?.name || 'Anonymous',
            screenSize: `${window.innerWidth}x${window.innerHeight}`,
            userAgent: navigator.userAgent,
            theme: document.documentElement.classList.contains('dark') ? 'Dark' : 'Light',
            timestamp: new Date().toISOString(),
          },
        }),
      });

      if (!res.ok) throw new Error('Server error');
      const data = await res.json();
      setStatus('success');
      if (data.issueUrl) setIssueUrl(data.issueUrl);
      setTimeout(() => {
        setTitle('');
        setDescription('');
        setType('bug');
        setStatus('idle');
        setIssueUrl(null);
        setOpen(false);
      }, data.issueUrl ? 8000 : 2000);
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message || 'Failed to submit');
    }
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
            {status === 'success' ? (
              <div className="py-3 space-y-2">
                <div className="flex items-center gap-2 text-grove-green">
                  <Check size={16} />
                  <span className="text-sm font-medium">Thank you! Report submitted.</span>
                </div>
                {issueUrl && (
                  <a
                    href={issueUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-xs text-grove-accent-deep hover:text-grove-accent underline"
                  >
                    View issue on GitHub →
                  </a>
                )}
              </div>
            ) : (
              <>
                {status === 'error' && (
                  <div className="flex items-center gap-2 text-red-400 text-xs">
                    <AlertCircle size={14} />
                    <span>{errorMsg || 'Something went wrong'}</span>
                  </div>
                )}

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
                  disabled={!title.trim() || status === 'submitting'}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-grove-accent-deep text-grove-surface
                             text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  <Send size={12} />
                  {status === 'submitting' ? 'Submitting...' : 'Submit Report'}
                </button>

                <p className="text-[9px] text-grove-text-dim text-center">
                  Your page URL and browser info will be included automatically.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
