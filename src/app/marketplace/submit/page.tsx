'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { NavBar } from '@/components/NavBar';
import type { MarketplaceFormState } from '@/lib/marketplace-chat-tools';

interface MaterialFile {
  url: string;
  name: string;
  type: string;
  size: number;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const INITIAL_GREETING: ChatMessage = {
  role: 'assistant',
  content:
    "Welcome — I'm helping you shape an offer for the next Liminal Marketplace. To start: what's the offer? It can be a tech product, a facilitation format, a session concept, or something half-formed you want to test live.",
};

export default function MarketplaceSubmitPage() {
  const { data: session, status: sessionStatus } = useSession();
  const [form, setForm] = useState<MarketplaceFormState>({ phase: 'idea' });
  const [imageUrl, setImageUrl] = useState<string>('');
  const [generatingImage, setGeneratingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  // Pre-fill name + email from the signed-in session once it arrives.
  useEffect(() => {
    const u = session?.user as { name?: string | null; email?: string | null } | undefined;
    if (!u) return;
    setForm((prev) => ({
      ...prev,
      name: prev.name || u.name || prev.name,
      email: prev.email || u.email || prev.email,
    }));
  }, [session]);
  const [materialsFiles, setMaterialsFiles] = useState<MaterialFile[]>([]);
  const [targetDate, setTargetDate] = useState('');

  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_GREETING]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  function applyToolCall(name: string, args: Record<string, unknown>) {
    setForm((prev) => {
      const next = { ...prev };
      switch (name) {
        case 'set_phase':
          if (args.phase === 'idea' || args.phase === 'practice') next.phase = args.phase;
          break;
        case 'set_name': next.name = String(args.value ?? ''); break;
        case 'set_email': next.email = String(args.value ?? ''); break;
        case 'set_title': next.title = String(args.value ?? ''); break;
        case 'set_description': next.description = String(args.value ?? ''); break;
        case 'set_problem': next.problem = String(args.value ?? ''); break;
        case 'set_audience': next.audience = String(args.value ?? ''); break;
        case 'set_angle': next.angle = String(args.value ?? ''); break;
        case 'set_takeaway': next.takeaway = String(args.value ?? ''); break;
        case 'set_mvp': next.mvp = String(args.value ?? ''); break;
        case 'set_materials_url': next.materialsUrl = String(args.value ?? ''); break;
      }
      return next;
    });
  }

  async function sendMessage(text: string) {
    if (!text.trim()) return;
    const userMsg: ChatMessage = { role: 'user', content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setThinking(true);
    setChatError(null);
    try {
      const res = await fetch('/api/marketplace/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, formState: form }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Chat failed (${res.status})`);
      }
      const data = await res.json();
      const msg = data.message ?? {};
      const toolCalls: Array<{ function: { name: string; arguments: string } }> = msg.tool_calls ?? [];
      for (const tc of toolCalls) {
        try {
          const parsed = JSON.parse(tc.function.arguments);
          applyToolCall(tc.function.name, parsed);
        } catch (e) {
          console.warn('Bad tool args:', tc.function.arguments, e);
        }
      }
      const reply: string = msg.content ?? (toolCalls.length > 0 ? '(updated the form — what next?)' : '');
      if (reply) setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch (e) {
      setChatError(e instanceof Error ? e.message : 'Chat failed');
    } finally {
      setThinking(false);
    }
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setSubmitError(null);
    try {
      const uploaded: MaterialFile[] = [];
      for (const f of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', f);
        const res = await fetch('/api/marketplace/upload', { method: 'POST', body: fd });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `Upload failed (${res.status})`);
        }
        const data = await res.json();
        uploaded.push({ url: data.url, name: data.name, type: data.type, size: data.size });
      }
      setMaterialsFiles((prev) => [...prev, ...uploaded]);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function onGenerateImage() {
    if (!form.title?.trim()) {
      setImageError('Add a title first — the image is generated from it.');
      return;
    }
    setGeneratingImage(true);
    setImageError(null);
    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: form.title, description: form.description ?? '' }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Image generation failed (${res.status})`);
      }
      const data = await res.json();
      if (data.url) setImageUrl(data.url);
    } catch (e) {
      setImageError(e instanceof Error ? e.message : 'Image generation failed');
    } finally {
      setGeneratingImage(false);
    }
  }

  async function onSubmit() {
    setSubmitError(null);
    const finalPitch = form.description || [form.problem, form.audience, form.angle, form.takeaway, form.mvp].filter(Boolean).join('\n\n');
    if (!form.title?.trim() || !finalPitch.trim()) {
      setSubmitError('Need a title and a description before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/marketplace/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email || null,
          phase: form.phase || 'idea',
          title: form.title,
          pitch: finalPitch,
          problem: form.problem || null,
          audience: form.audience || null,
          angle: form.angle || null,
          takeaway: form.takeaway || null,
          mvp: form.mvp || null,
          sharpenedPitch: form.description || null,
          materialsUrl: form.materialsUrl || null,
          materialFiles: materialsFiles.length > 0 ? materialsFiles : null,
          imageUrl: imageUrl || null,
          targetSessionDate: targetDate || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Submission failed (${res.status})`);
      }
      setDone(true);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (sessionStatus === 'loading') {
    return (
      <>
        <NavBar />
        <main className="min-h-screen bg-grove-bg text-grove-text">
          <section className="mx-auto max-w-2xl px-6 py-20 text-center text-grove-text-muted">Loading…</section>
        </main>
      </>
    );
  }

  if (sessionStatus !== 'authenticated') {
    return (
      <>
        <NavBar />
        <main className="min-h-screen bg-grove-bg text-grove-text">
          <section className="mx-auto max-w-2xl px-6 py-20 text-center">
            <h1 className="text-3xl font-semibold">Sign in to bring an offer</h1>
            <p className="mt-3 text-grove-text-muted">
              Submitting an offer requires a Liminal Calendar account so the
              host can reach back out.
            </p>
            <Link
              href={`/sign-in?callbackUrl=${encodeURIComponent('/marketplace/submit')}`}
              className="mt-6 inline-block rounded-md bg-grove-accent px-5 py-2 text-sm font-medium text-grove-bg hover:bg-grove-accent-deep"
            >
              Sign in
            </Link>
          </section>
        </main>
      </>
    );
  }

  if (done) {
    return (
      <>
        <NavBar />
        <main className="min-h-screen bg-grove-bg text-grove-text">
          <section className="mx-auto max-w-2xl px-6 py-20 text-center">
            <h1 className="text-3xl font-semibold">Offer received.</h1>
            <p className="mt-4 text-grove-text-muted">
              The host will reach out before the next session. Bring something
              raw — the room rewards signal, not polish.
            </p>
            <div className="mt-8 flex justify-center gap-3">
              <Link href="/marketplace" className="rounded-md border border-grove-border px-4 py-2 text-sm hover:bg-grove-surface">Back to Marketplace</Link>
              <Link href="/" className="rounded-md bg-grove-accent px-4 py-2 text-sm font-medium text-grove-bg hover:bg-grove-accent-deep">See the calendar</Link>
            </div>
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <NavBar />
      <main className="min-h-screen bg-grove-bg text-grove-text">
        <section className="mx-auto max-w-6xl px-6 py-8">
          <Link href="/marketplace" className="text-sm text-grove-text-muted hover:text-grove-text">← Marketplace</Link>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">Bring an offer</h1>
          <p className="mt-2 text-grove-text-muted">
            Talk it through with the host. The form on the right fills in as you
            go — edit anything directly, anytime.
          </p>

          <div className="mt-6 grid gap-6 md:grid-cols-[1fr_1fr]">
            {/* Chat panel */}
            <div className="flex h-[70vh] flex-col rounded-lg border border-grove-border bg-grove-surface/40">
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'ml-auto bg-grove-accent text-grove-bg'
                        : 'mr-auto bg-grove-bg border border-grove-border'
                    }`}
                  >
                    {m.content}
                  </div>
                ))}
                {thinking && (
                  <div className="mr-auto max-w-[85%] rounded-lg border border-grove-border bg-grove-bg px-3 py-2 text-sm text-grove-text-muted">
                    thinking…
                  </div>
                )}
                {chatError && <p className="text-xs text-red-400">{chatError}</p>}
              </div>
              <form
                onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
                className="border-t border-grove-border p-3 flex gap-2"
              >
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Tell the host about your offer…"
                  className="flex-1 rounded-md border border-grove-border bg-grove-bg px-3 py-2 text-sm focus:border-grove-accent focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={thinking || !input.trim()}
                  className="rounded-md bg-grove-accent px-4 py-2 text-sm font-medium text-grove-bg hover:bg-grove-accent-deep disabled:opacity-60"
                >
                  Send
                </button>
              </form>
            </div>

            {/* Form preview / edit */}
            <div className="space-y-4 rounded-lg border border-grove-border bg-grove-surface/40 p-5 max-h-[70vh] overflow-y-auto">
              <fieldset>
                <legend className="text-xs uppercase tracking-wider text-grove-text-muted">Phase</legend>
                <div className="mt-2 grid gap-2 grid-cols-2">
                  {(['idea', 'practice'] as const).map((p) => (
                    <label
                      key={p}
                      className={`cursor-pointer rounded-md border p-3 text-sm transition ${
                        form.phase === p ? 'border-grove-accent bg-grove-bg' : 'border-grove-border hover:bg-grove-bg'
                      }`}
                    >
                      <input type="radio" name="phase" value={p} checked={form.phase === p}
                        onChange={() => setForm((f) => ({ ...f, phase: p }))} className="sr-only" />
                      <p className="font-medium capitalize">{p}</p>
                      <p className="text-xs text-grove-text-muted mt-0.5">
                        {p === 'idea' ? '15 min × 4 across 2 rooms' : '30 min × 2'}
                      </p>
                    </label>
                  ))}
                </div>
              </fieldset>

              <Mini label="Title" value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))} />
              <MiniArea label="Description" value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} rows={6} />

              <div>
                <span className="text-xs uppercase tracking-wider text-grove-text-muted">Banner image</span>
                {imageUrl ? (
                  <div className="mt-2 relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imageUrl} alt="Generated banner" className="w-full rounded-md border border-grove-border" />
                    <button
                      type="button"
                      onClick={() => setImageUrl('')}
                      className="absolute top-2 right-2 rounded bg-grove-bg/80 px-2 py-1 text-xs hover:bg-red-500/30"
                    >
                      remove
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={onGenerateImage}
                    disabled={generatingImage}
                    className="mt-2 w-full rounded-md border border-dashed border-grove-border px-3 py-3 text-sm text-grove-text-muted hover:border-grove-accent hover:text-grove-accent disabled:opacity-60"
                  >
                    {generatingImage ? 'Generating banner…' : '🎨 Generate banner from title'}
                  </button>
                )}
                {imageError && <p className="mt-1 text-xs text-red-400">{imageError}</p>}
              </div>

              <Mini label="Materials URL" value={form.materialsUrl} placeholder="https://" onChange={(v) => setForm((f) => ({ ...f, materialsUrl: v }))} />

              <div>
                <span className="text-xs uppercase tracking-wider text-grove-text-muted">Upload materials</span>
                <input
                  type="file"
                  multiple
                  onChange={onUpload}
                  disabled={uploading}
                  className="mt-2 block w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-grove-accent file:px-2 file:py-1 file:text-grove-bg hover:file:bg-grove-accent-deep"
                />
                {uploading && <p className="text-xs text-grove-text-muted mt-1">Uploading…</p>}
                {materialsFiles.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs">
                    {materialsFiles.map((f) => (
                      <li key={f.url} className="flex items-center justify-between rounded border border-grove-border bg-grove-bg px-2 py-1">
                        <a href={f.url} target="_blank" rel="noreferrer" className="truncate text-grove-accent hover:underline">{f.name}</a>
                        <button type="button" onClick={() => setMaterialsFiles((p) => p.filter((x) => x.url !== f.url))} className="ml-2 text-grove-text-muted hover:text-red-400">×</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <Mini label="Target session date" type="date" value={targetDate} onChange={setTargetDate} />

              {submitError && <p className="text-sm text-red-400">{submitError}</p>}

              <button
                type="button"
                onClick={onSubmit}
                disabled={submitting}
                className="w-full rounded-md bg-grove-accent px-4 py-3 text-sm font-medium text-grove-bg hover:bg-grove-accent-deep disabled:opacity-60"
              >
                {submitting ? 'Submitting…' : 'Submit offer'}
              </button>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

function Mini({
  label, value, onChange, placeholder, type = 'text',
}: {
  label: string; value?: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider text-grove-text-muted">{label}</span>
      <input
        type={type}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-grove-border bg-grove-bg px-2 py-1.5 text-sm focus:border-grove-accent focus:outline-none"
      />
    </label>
  );
}

function MiniArea({
  label, value, onChange, rows = 2,
}: {
  label: string; value?: string; onChange: (v: string) => void; rows?: number;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider text-grove-text-muted">{label}</span>
      <textarea
        rows={rows}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-grove-border bg-grove-bg px-2 py-1.5 text-sm focus:border-grove-accent focus:outline-none"
      />
    </label>
  );
}
