'use client';

import { useState, useRef } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { NavBar } from '@/components/NavBar';

const TITLE_MAX = 80;
const DESCRIPTION_MAX = 600;

export default function TopicSubmitPage() {
  const { status: sessionStatus } = useSession();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [materialsUrl, setMaterialsUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [consentYoutube, setConsentYoutube] = useState(false);
  const [consentTelegram, setConsentTelegram] = useState(false);
  const [consentFacebook, setConsentFacebook] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

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

  async function onSubmit() {
    setSubmitError(null);
    if (!title.trim() || !description.trim()) {
      setSubmitError('Need a title and a description before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/topics/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          materialsUrl: materialsUrl || null,
          imageUrl: imageUrl || null,
          consentYoutube,
          consentTelegram,
          consentFacebook,
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

            <div className="mx-auto mt-8 max-w-md rounded-lg border border-grove-border bg-grove-surface p-5 text-left">
              <div className="text-xs uppercase tracking-wider text-grove-text-muted">
                Distribution permissions you set
              </div>
              <ul className="mt-3 space-y-1.5 text-sm text-grove-text">
                <li>
                  <ConsentMark on={consentYoutube} /> YouTube
                </li>
                <li>
                  <ConsentMark on={consentTelegram} /> Telegram groups
                </li>
                <li>
                  <ConsentMark on={consentFacebook} /> Facebook groups
                </li>
              </ul>
              <p className="mt-3 text-xs text-grove-text-muted">
                Want to change these? Email the host before the session.
              </p>
            </div>

            <Link
              href="/show-and-tell"
              className="mt-8 inline-block text-sm text-grove-accent hover:text-grove-accent-deep"
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
        <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
          <Link
            href="/show-and-tell"
            className="text-sm text-grove-text-muted hover:text-grove-text"
          >
            ← Show &amp; Tell
          </Link>
          <h1 className="mt-4 font-serif text-3xl text-grove-text sm:text-4xl">
            Submit a Topic
          </h1>
          <p className="mt-2 text-grove-text-muted">
            Ten minutes, your call on the format. Fill in what you&apos;d like
            to bring; the host will be in touch.
          </p>

          <section className="mt-8 rounded-lg border border-grove-border bg-grove-surface p-5">
            <div className="flex items-baseline justify-between">
              <label className="block text-xs uppercase tracking-wider text-grove-text-muted">
                Title
              </label>
              <span
                className={`text-xs ${
                  title.length > TITLE_MAX ? 'text-red-400' : 'text-grove-text-muted'
                }`}
              >
                {title.length} / {TITLE_MAX}
              </span>
            </div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
              maxLength={TITLE_MAX}
              placeholder="A short, punchy Topic title"
              className="mt-2 w-full rounded-md border border-grove-border bg-grove-bg px-3 py-2 text-grove-text focus:outline-none focus:ring-1 focus:ring-grove-accent"
            />

            <div className="mt-4 flex items-baseline justify-between">
              <label className="block text-xs uppercase tracking-wider text-grove-text-muted">
                Description
              </label>
              <span
                className={`text-xs ${
                  description.length > DESCRIPTION_MAX
                    ? 'text-red-400'
                    : 'text-grove-text-muted'
                }`}
              >
                {description.length} / {DESCRIPTION_MAX}
              </span>
            </div>
            <textarea
              value={description}
              onChange={(e) =>
                setDescription(e.target.value.slice(0, DESCRIPTION_MAX))
              }
              maxLength={DESCRIPTION_MAX}
              placeholder="What you'll bring in 10 minutes."
              rows={8}
              className="mt-2 w-full rounded-md border border-grove-border bg-grove-bg px-3 py-2 text-sm text-grove-text focus:outline-none focus:ring-1 focus:ring-grove-accent"
            />

            <label className="mt-4 block text-xs uppercase tracking-wider text-grove-text-muted">
              Materials link <span className="normal-case">(optional)</span>
            </label>
            <input
              type="url"
              value={materialsUrl}
              onChange={(e) => setMaterialsUrl(e.target.value)}
              placeholder="Slides, repo, demo URL…"
              className="mt-2 w-full rounded-md border border-grove-border bg-grove-bg px-3 py-2 text-sm text-grove-text focus:outline-none focus:ring-1 focus:ring-grove-accent"
            />
          </section>

          <section className="mt-4 rounded-lg border border-grove-border bg-grove-surface p-5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label className="block text-xs uppercase tracking-wider text-grove-text-muted">
                Banner image <span className="normal-case">(optional)</span>
              </label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
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
          </section>

          <section className="mt-4 rounded-lg border border-grove-border bg-grove-surface p-5">
            <label className="block text-xs uppercase tracking-wider text-grove-text-muted">
              Distribution permissions
            </label>
            <p className="mt-2 text-xs text-grove-text-muted">
              The meeting is recorded. After the session, the host edits it
              into clips and posts. Tick the channels where your Topic may be
              shared. Untick any you&apos;d rather skip — defaults to all off.
            </p>
            <div className="mt-3 space-y-2">
              <ConsentCheckbox
                label="YouTube"
                detail="Recording uploaded to YouTube"
                checked={consentYoutube}
                onChange={setConsentYoutube}
              />
              <ConsentCheckbox
                label="Telegram"
                detail="Posted to Liminal Web-related Telegram groups we have access to"
                checked={consentTelegram}
                onChange={setConsentTelegram}
              />
              <ConsentCheckbox
                label="Facebook"
                detail="Posted to Liminal Web Facebook groups (Metamodern, etc.)"
                checked={consentFacebook}
                onChange={setConsentFacebook}
              />
            </div>
          </section>

          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={onSubmit}
              disabled={submitting || !title.trim() || !description.trim()}
              className="rounded-md bg-grove-accent px-4 py-3 text-sm font-medium text-grove-bg hover:bg-grove-accent-deep disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit Topic'}
            </button>
            {submitError && <p className="text-xs text-red-400">{submitError}</p>}
          </div>
        </div>
      </main>
    </>
  );
}

function ConsentMark({ on }: { on: boolean }) {
  return (
    <span
      className={
        on
          ? 'mr-2 inline-block text-grove-accent'
          : 'mr-2 inline-block text-grove-text-muted'
      }
      aria-label={on ? 'allowed' : 'not allowed'}
    >
      {on ? '✓' : '○'}
    </span>
  );
}

function ConsentCheckbox({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-md border border-grove-border bg-grove-bg px-3 py-2 hover:border-grove-accent/50">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 cursor-pointer accent-grove-accent"
      />
      <span className="flex flex-col">
        <span className="text-sm text-grove-text">{label}</span>
        <span className="text-xs text-grove-text-muted">{detail}</span>
      </span>
    </label>
  );
}
