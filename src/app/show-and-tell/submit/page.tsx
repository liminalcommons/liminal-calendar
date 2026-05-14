'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { NavBar } from '@/components/NavBar';
import type { TopicFormState } from '@/lib/topic-chat-tools';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const INITIAL_GREETING: ChatMessage = {
  role: 'assistant',
  content:
    "Welcome — I'm helping you shape a Topic for Show & Tell. You'll have ten minutes to present, TED-style. To start: what's the one thing you want to show, share, or wrestle with in front of the room?",
};

export default function TopicSubmitPage() {
  const { data: session, status: sessionStatus } = useSession();
  const [form, setForm] = useState<TopicFormState>({});

  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_GREETING]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [imageUrl, setImageUrl] = useState<string>('');
  const [generatingImage, setGeneratingImage] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        case 'set_format':
          if (
            args.formatHint === 'demo' ||
            args.formatHint === 'insight' ||
            args.formatHint === 'question' ||
            args.formatHint === 'other'
          )
            next.formatHint = args.formatHint;
          break;
        case 'set_title': next.title = String(args.value ?? ''); break;
        case 'set_description': next.description = String(args.value ?? ''); break;
        case 'set_hook': next.hook = String(args.value ?? ''); break;
        case 'set_audience': next.audience = String(args.value ?? ''); break;
        case 'set_takeaway': next.takeaway = String(args.value ?? ''); break;
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
      const res = await fetch('/api/topics/chat', {
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
      const toolCalls: Array<{ function: { name: string; arguments: string } }> =
        msg.tool_calls ?? [];
      for (const tc of toolCalls) {
        try {
          const parsed = JSON.parse(tc.function.arguments);
          applyToolCall(tc.function.name, parsed);
        } catch (e) {
          console.warn('Bad tool args:', tc.function.arguments, e);
        }
      }
      const reply: string =
        msg.content ?? (toolCalls.length > 0 ? '(updated the form — what next?)' : '');
      if (reply) setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch (e) {
      setChatError(e instanceof Error ? e.message : 'Chat failed');
    } finally {
      setThinking(false);
    }
  }

  async function onUploadImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageError(null);
    if (!file.type.startsWith('image/')) {
      setImageError('Please choose an image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError('Image is over 5MB — please pick a smaller one.');
      return;
    }
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Upload failed (${res.status})`);
      }
      const data = await res.json();
      if (data.url) setImageUrl(data.url);
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
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
    if (!form.title?.trim() || !form.description?.trim()) {
      setSubmitError('Need a title and a description before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/topics/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          formatHint: form.formatHint || null,
          materialsUrl: form.materialsUrl || null,
          imageUrl: imageUrl || null,
          hook: form.hook || null,
          audience: form.audience || null,
          takeaway: form.takeaway || null,
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
          <section className="mx-auto max-w-2xl px-6 py-20 text-center text-grove-text-muted">
            Loading…
          </section>
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
            <h1 className="font-serif text-3xl">Sign in to submit a Topic</h1>
            <p className="mt-4 text-grove-text-muted">
              Show &amp; Tell is for the Liminal Web. Sign in to share what
              you&apos;re working on.
            </p>
            <Link
              href="/welcome"
              className="mt-6 inline-block rounded-md border border-grove-accent bg-grove-accent/10 px-4 py-2 text-sm font-medium text-grove-accent hover:bg-grove-accent/20"
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
            <h1 className="font-serif text-3xl">Thanks — your Topic is in.</h1>
            <p className="mt-4 text-grove-text-muted">
              The host will be in touch about which Show &amp; Tell session
              you&apos;ll present in.
            </p>
            <Link
              href="/show-and-tell"
              className="mt-6 inline-block text-sm text-grove-accent hover:text-grove-accent-deep"
            >
              ← Back to Show &amp; Tell
            </Link>
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <NavBar />
      <main className="min-h-screen bg-grove-bg text-grove-text">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <Link
            href="/show-and-tell"
            className="text-sm text-grove-text-muted hover:text-grove-text"
          >
            ← Show &amp; Tell
          </Link>
          <h1 className="mt-4 font-serif text-3xl text-grove-text sm:text-4xl">
            Submit a Topic
          </h1>
          <p className="mt-2 max-w-2xl text-grove-text-muted">
            Ten minutes, TED-style. Chat with the host to sharpen what
            you&apos;ll show — title and description fill in as you go.
          </p>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            {/* Chat panel */}
            <section className="flex h-[70vh] flex-col rounded-lg border border-grove-border bg-grove-surface">
              <div
                ref={scrollRef}
                className="flex-1 space-y-3 overflow-y-auto p-4"
              >
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={
                      m.role === 'user'
                        ? 'ml-auto max-w-[85%] rounded-lg bg-grove-accent/20 px-3 py-2 text-sm text-grove-text'
                        : 'mr-auto max-w-[85%] rounded-lg bg-grove-bg px-3 py-2 text-sm text-grove-text'
                    }
                  >
                    {m.content}
                  </div>
                ))}
                {thinking && (
                  <div className="mr-auto max-w-[85%] rounded-lg bg-grove-bg px-3 py-2 text-sm italic text-grove-text-muted">
                    Thinking…
                  </div>
                )}
                {chatError && (
                  <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
                    {chatError}
                  </div>
                )}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMessage(input);
                }}
                className="flex gap-2 border-t border-grove-border p-3"
              >
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Reply to the host…"
                  disabled={thinking}
                  className="flex-1 rounded-md border border-grove-border bg-grove-bg px-3 py-2 text-sm text-grove-text placeholder:text-grove-text-dim focus:outline-none focus:ring-1 focus:ring-grove-accent"
                />
                <button
                  type="submit"
                  disabled={thinking || !input.trim()}
                  className="rounded-md bg-grove-accent px-4 py-2 text-sm font-medium text-grove-bg hover:bg-grove-accent-deep disabled:opacity-50"
                >
                  Send
                </button>
              </form>
            </section>

            {/* Live preview / form */}
            <section className="flex flex-col gap-4">
              <div className="rounded-lg border border-grove-border bg-grove-surface p-5">
                <label className="block text-xs uppercase tracking-wider text-grove-text-muted">
                  Title
                </label>
                <input
                  type="text"
                  value={form.title ?? ''}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, title: e.target.value }))
                  }
                  placeholder="A short, punchy Topic title"
                  className="mt-2 w-full rounded-md border border-grove-border bg-grove-bg px-3 py-2 text-grove-text focus:outline-none focus:ring-1 focus:ring-grove-accent"
                />

                <label className="mt-4 block text-xs uppercase tracking-wider text-grove-text-muted">
                  Description
                </label>
                <textarea
                  value={form.description ?? ''}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, description: e.target.value }))
                  }
                  placeholder="What you'll show in 10 minutes — TED-talk abstract."
                  rows={8}
                  className="mt-2 w-full rounded-md border border-grove-border bg-grove-bg px-3 py-2 text-sm text-grove-text focus:outline-none focus:ring-1 focus:ring-grove-accent"
                />

                <label className="mt-4 block text-xs uppercase tracking-wider text-grove-text-muted">
                  Materials link <span className="normal-case">(optional)</span>
                </label>
                <input
                  type="url"
                  value={form.materialsUrl ?? ''}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, materialsUrl: e.target.value }))
                  }
                  placeholder="Slides, repo, demo URL…"
                  className="mt-2 w-full rounded-md border border-grove-border bg-grove-bg px-3 py-2 text-sm text-grove-text focus:outline-none focus:ring-1 focus:ring-grove-accent"
                />

                {form.formatHint && (
                  <div className="mt-4 text-xs text-grove-text-muted">
                    Format:{' '}
                    <span className="text-grove-accent">{form.formatHint}</span>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-grove-border bg-grove-surface p-5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label className="block text-xs uppercase tracking-wider text-grove-text-muted">
                    Banner image <span className="normal-case">(optional)</span>
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={onGenerateImage}
                      disabled={generatingImage || uploadingImage || !form.title?.trim()}
                      className="rounded-md border border-grove-border px-3 py-1 text-xs text-grove-text hover:bg-grove-bg disabled:opacity-50"
                    >
                      {generatingImage ? 'Generating…' : 'Generate with AI'}
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={generatingImage || uploadingImage}
                      className="rounded-md border border-grove-border px-3 py-1 text-xs text-grove-text hover:bg-grove-bg disabled:opacity-50"
                    >
                      {uploadingImage ? 'Uploading…' : 'Upload image'}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={onUploadImage}
                      className="hidden"
                    />
                  </div>
                </div>
                {imageUrl && (
                  <div className="mt-3 space-y-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageUrl}
                      alt="Topic banner"
                      className="w-full rounded-md border border-grove-border"
                    />
                    <button
                      type="button"
                      onClick={() => setImageUrl('')}
                      className="text-xs text-grove-text-muted hover:text-grove-text"
                    >
                      Remove image
                    </button>
                  </div>
                )}
                {imageError && (
                  <p className="mt-2 text-xs text-red-400">{imageError}</p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={onSubmit}
                  disabled={
                    submitting || !form.title?.trim() || !form.description?.trim()
                  }
                  className="rounded-md bg-grove-accent px-4 py-3 text-sm font-medium text-grove-bg hover:bg-grove-accent-deep disabled:opacity-50"
                >
                  {submitting ? 'Submitting…' : 'Submit Topic'}
                </button>
                {submitError && (
                  <p className="text-xs text-red-400">{submitError}</p>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
