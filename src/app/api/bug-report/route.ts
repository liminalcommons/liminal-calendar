import { NextRequest, NextResponse } from 'next/server';
import { Octokit } from '@octokit/rest';
import { getAuthedUser } from '@/lib/auth/get-authed-user';

// Read env per-request, not at module load. Captures rotations without a
// redeploy and makes the handler testable (jest can set process.env before
// each test).
function readGitHubConfig() {
  return {
    token: process.env.GITHUB_TOKEN?.trim(),
    owner: (process.env.GITHUB_REPO_OWNER || 'liminalcommons').trim(),
    repo: (process.env.GITHUB_REPO_NAME || 'liminal-calendar').trim(),
  };
}

// GitHub issue body has a hard 65536-char limit. Keep our cap well under it
// so the failure mode is a clean truncation instead of a 422 from the API.
const MAX_BODY_LEN  = 60000;
const MAX_LINE_LEN  = 2000;   // per console-log line
const MAX_TITLE_LEN = 80;
const MAX_DESC_LEN  = 4000;
const MAX_LOG_BYTES = 200_000; // raw clientLogs payload cap before processing

const KNOWN_TYPES = new Set(['bug', 'feature', 'feedback']);

function parseBrowser(ua: string): string {
  if (!ua) return 'Unknown';
  if (ua.includes('Edg/'))     return `Edge ${ua.match(/Edg\/([\d.]+)/)?.[1] ?? ''}`.trim();
  if (ua.includes('Firefox/')) return `Firefox ${ua.match(/Firefox\/([\d.]+)/)?.[1] ?? ''}`.trim();
  if (ua.includes('Chrome/'))  return `Chrome ${ua.match(/Chrome\/([\d.]+)/)?.[1] ?? ''}`.trim();
  if (ua.includes('Safari/'))  return `Safari ${ua.match(/Version\/([\d.]+)/)?.[1] ?? ''}`.trim();
  return ua.slice(0, 60);
}

// Strip the characters that break GitHub markdown rendering when a stack
// trace happens to contain them: backtick-fence terminators inside a fenced
// block, raw `</details>` inside our collapsed log section, pipe in a table
// cell. None of these carry diagnostic value — replacing them keeps the
// report renderable without losing information that mattered.
function sanitiseForCell(s: string): string {
  return String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
function sanitiseForLogLine(s: string): string {
  return String(s)
    .replace(/```/g, '`` `')           // break fence terminator
    .replace(/<\/details>/gi, '</det.>'); // protect the wrapping <details>
}

function clampString(s: unknown, max: number): string {
  const str = typeof s === 'string' ? s : s == null ? '' : String(s);
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function processLogs(raw: string): { errors: string; all: string } {
  // Cap the raw payload first so a malicious or runaway log buffer can't
  // make us do O(n) work over megabytes of data.
  const capped = raw.length > MAX_LOG_BYTES ? raw.slice(-MAX_LOG_BYTES) : raw;
  const lines = capped.split('\n').filter(Boolean);
  const parsed = lines.map(line => {
    const m = line.match(/^\[([^\]]+)\] \[([A-Z]+)\] ([\s\S]+)$/);
    if (m) return { timestamp: m[1], level: m[2], message: m[3], count: 1 };
    return { timestamp: '', level: 'LOG', message: line, count: 1 };
  });

  // Deduplicate consecutive identical messages
  const deduped: typeof parsed = [];
  for (const entry of parsed) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.level === entry.level && prev.message === entry.message) {
      prev.count++;
    } else {
      deduped.push({ ...entry });
    }
  }

  const fmt = (e: typeof deduped[0]) => {
    const prefix: Record<string, string> = { ERROR: '🔴', WARN: '🟡', LOG: '⚪', INFO: '🔵' };
    const icon = prefix[e.level] ?? '⚪';
    const safe = sanitiseForLogLine(e.message);
    const msg = safe.length > MAX_LINE_LEN ? safe.slice(0, MAX_LINE_LEN) + '…' : safe;
    const repeat = e.count > 1 ? ` _(×${e.count})_` : '';
    return `${icon} ${msg}${repeat}`;
  };

  const errorLines = deduped.filter(e => e.level === 'ERROR' || e.level === 'WARN').map(fmt).join('\n');
  const allLines = deduped.map(fmt).join('\n');
  return { errors: errorLines, all: allLines };
}

// Surface the *names* of session-bearing cookies (never values) so we can
// tell whether the user actually had a Logto / Clerk session at the moment
// they hit the button. The full cookie header carries secrets — names alone
// are enough for triage.
function cookieNamesFromHeader(cookieHeader: string | null): string[] {
  if (!cookieHeader) return [];
  return cookieHeader
    .split(';')
    .map(c => c.trim().split('=')[0])
    .filter(Boolean);
}

// Retry GitHub API on transient failure. Issues.create returning a 5xx is
// rare but the request can also fail at the network layer (ENOTFOUND,
// ECONNRESET, timeout). One retry with short backoff turns the common case
// of a flaky moment into a silent recovery instead of a lost report.
type Issue = { number: number; html_url: string };
async function createIssueWithRetry(
  octokit: Octokit,
  params: { owner: string; repo: string; title: string; body: string; labels: string[] },
): Promise<Issue> {
  const attempt = () => octokit.issues.create(params).then(r => r.data as Issue);
  try {
    return await attempt();
  } catch (err: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const status = (err as any)?.status;
    // 4xx (auth, bad request, missing repo) won't get better on retry —
    // fail fast so the caller can fall through to the persistence path.
    if (typeof status === 'number' && status >= 400 && status < 500) throw err;
    await new Promise(r => setTimeout(r, 1000));
    return attempt();
  }
}

// Fallback persistence — when the GitHub call fails completely, we still
// don't want to drop the report on the floor. Emit a single structured
// stderr line so log-shipping picks it up and we can replay later.
// (We deliberately avoid writing to disk: Vercel functions have an
// ephemeral filesystem, so a file write would also vanish on cold start.)
function persistFallback(payload: {
  reason: string;
  title: string;
  type: string;
  reporter: string;
  memberId: number | null;
  issueBody: string;
}) {
  console.error('[BugReport][fallback]', JSON.stringify(payload));
}

export async function POST(req: NextRequest) {
  // Parse + validate. Never 500 on malformed input — bug reporters should
  // never see a failure, even from themselves.
  const raw = await req.json().catch(() => ({}));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = raw as Record<string, any>;

  const title       = clampString(r.title, MAX_TITLE_LEN).trim();
  const description = clampString(r.description, MAX_DESC_LEN);
  const type        = KNOWN_TYPES.has(r.type) ? (r.type as 'bug' | 'feature' | 'feedback') : 'bug';
  const clientLogs  = typeof r.clientLogs === 'string' ? r.clientLogs : '';
  const metadata    = (r.metadata && typeof r.metadata === 'object' ? r.metadata : {}) as Record<string, unknown>;

  if (!title) {
    return NextResponse.json(
      { success: false, message: 'Title required.' },
      { status: 400 },
    );
  }

  const ts = (metadata.timestamp as string) ?? new Date().toISOString();
  const browser = parseBrowser((metadata.userAgent as string) ?? '');

  const labels = type === 'bug' ? ['bug', 'user-reported']
    : type === 'feature' ? ['enhancement', 'user-reported']
    : ['feedback', 'user-reported'];

  const logs = clientLogs ? processLogs(clientLogs) : null;

  // Server-side auth resolution — the authoritative read of who was actually
  // signed in when the request hit the API. Compared against the client's
  // self-report in `metadata.auth`, a mismatch is the signal for session-
  // bridging bugs (the most common class of "I'm signed in but the page
  // says I'm not").
  let serverAuth: {
    resolved: boolean;
    memberId: number | null;
    provider: 'logto' | 'clerk' | 'none';
    role: string | null;
    error?: string;
  } = { resolved: false, memberId: null, provider: 'none', role: null };
  try {
    const u = await getAuthedUser();
    if (u) {
      serverAuth = {
        resolved: true,
        memberId: u.memberId,
        provider: u.logtoUserId ? 'logto' : u.clerkId ? 'clerk' : 'none',
        role: u.role,
      };
    } else {
      serverAuth.resolved = true; // call completed; no session
    }
  } catch (err) {
    serverAuth.error = err instanceof Error ? err.message : String(err);
  }

  const cookieNames = cookieNamesFromHeader(req.headers.get('cookie'));
  const sessionCookieNames = cookieNames.filter(n =>
    /^(authjs|next-auth|__Secure-authjs|__Secure-next-auth|__session|__clerk)/.test(n)
  );

  // Build issue body
  let issueBody = '';
  if (description) {
    issueBody += `${description}\n\n`;
  }

  if (logs?.errors) {
    issueBody += `### Errors & Warnings\n\n${logs.errors}\n\n`;
  }

  const cell = (v: unknown) => sanitiseForCell(v == null ? 'N/A' : v as string);
  issueBody += `### Environment\n\n`;
  issueBody += `| | |\n|---|---|\n`;
  issueBody += `| **Page** | ${cell(metadata.url)} |\n`;
  if (metadata.referrer) issueBody += `| **Referrer** | ${cell(metadata.referrer)} |\n`;
  issueBody += `| **Reporter** | ${cell(metadata.reporter ?? 'Anonymous')}${metadata.reporterEmail ? ` (${cell(metadata.reporterEmail)})` : ''} |\n`;
  issueBody += `| **Browser** | ${cell(browser)} |\n`;
  issueBody += `| **Screen** | ${cell(metadata.screenSize)}${metadata.devicePixelRatio ? ` @${metadata.devicePixelRatio}x` : ''} |\n`;
  if (metadata.language)    issueBody += `| **Language** | ${cell(metadata.language)} |\n`;
  if (metadata.timezone)    issueBody += `| **Timezone** | ${cell(metadata.timezone)} |\n`;
  issueBody += `| **Theme** | ${cell(metadata.theme)}${metadata.colorScheme ? ` (system: ${cell(metadata.colorScheme)})` : ''} |\n`;
  if (typeof metadata.online === 'boolean')        issueBody += `| **Online** | ${metadata.online} |\n`;
  if (typeof metadata.cookieEnabled === 'boolean') issueBody += `| **Cookies enabled** | ${metadata.cookieEnabled} |\n`;
  issueBody += `| **Time** | ${cell(ts)} |\n`;
  const build = (metadata.build && typeof metadata.build === 'object' ? metadata.build : {}) as Record<string, unknown>;
  if (build.commitSha) {
    const sha = String(build.commitSha).slice(0, 7);
    const ref = build.commitRef ? ` on \`${cell(build.commitRef)}\`` : '';
    const env = build.vercelEnv ? ` (${cell(build.vercelEnv)})` : '';
    issueBody += `| **Build** | \`${sha}\`${ref}${env} |\n`;
  }
  issueBody += `\n`;

  // Auth state — both client and server views side-by-side. Mismatch is the
  // signal for session-bridging bugs.
  issueBody += `### Auth state\n\n`;
  issueBody += `| | Client view | Server view |\n|---|---|---|\n`;
  const clientAuth = (metadata.auth && typeof metadata.auth === 'object' ? metadata.auth : {}) as Record<string, unknown>;
  issueBody += `| **memberId** | — | ${serverAuth.memberId ?? '_null_'} |\n`;
  issueBody += `| **Provider** | ${clientAuth.hasNextAuthUser ? 'logto' : clientAuth.clerkSignedIn ? 'clerk' : 'none'} | ${serverAuth.provider} |\n`;
  issueBody += `| **NextAuth (Logto)** | ${cell(clientAuth.nextAuth ?? '?')}${clientAuth.hasNextAuthUser ? ' / user present' : ''} | ${serverAuth.provider === 'logto' ? 'session ok' : '—'} |\n`;
  issueBody += `| **Clerk** | ${clientAuth.clerkLoaded ? (clientAuth.clerkSignedIn ? 'signed in' : 'signed out') : 'loading'} | ${serverAuth.provider === 'clerk' ? 'session ok' : '—'} |\n`;
  issueBody += `| **Role** | — | ${cell(serverAuth.role ?? '_n/a_')} |\n`;
  if (serverAuth.error) issueBody += `| **Server error** | — | \`${cell(serverAuth.error)}\` |\n`;
  if (sessionCookieNames.length) issueBody += `| **Session cookies present** | — | ${sessionCookieNames.map(n => `\`${n}\``).join(', ')} |\n`;
  issueBody += `\n`;

  // Full logs (collapsed). If including the full log would push the body
  // past the GitHub limit, fall back to errors-only and tell the reader
  // we trimmed it.
  if (logs?.all) {
    const remaining = MAX_BODY_LEN - issueBody.length - 200; // reserve trailer
    const block = `<details>\n<summary>Console log (${logs.all.split('\n').length} entries)</summary>\n\n${logs.all}\n</details>\n\n`;
    if (block.length <= remaining) {
      issueBody += block;
    } else if (remaining > 200) {
      issueBody += `<details>\n<summary>Console log (truncated — full payload exceeded ${MAX_BODY_LEN} chars)</summary>\n\n`;
      issueBody += logs.all.slice(0, remaining - 100);
      issueBody += `\n…\n</details>\n\n`;
    } else {
      issueBody += `_(Console log omitted — issue body would exceed GitHub's size limit.)_\n\n`;
    }
  }

  issueBody += `---\n_Submitted via Liminal Calendar bug reporter_\n`;

  // Final clamp — defence in depth.
  if (issueBody.length > MAX_BODY_LEN) {
    issueBody = issueBody.slice(0, MAX_BODY_LEN - 50) + '\n\n…_(body truncated)_';
  }

  // Prefix the title with reporter identity so triage is faster at a glance.
  const reporterTag = serverAuth.memberId
    ? `m#${serverAuth.memberId}`
    : metadata.reporter && metadata.reporter !== 'Anonymous'
      ? clampString(metadata.reporter, 20)
      : 'anon';
  const typeTag = type === 'bug' ? 'Bug' : type === 'feature' ? 'Feature' : 'Feedback';
  const issueTitle = `[${typeTag}] [${reporterTag}] ${title}`.slice(0, 256);

  const reporterStr = (metadata.reporter as string | undefined) ?? 'Anonymous';

  const gh = readGitHubConfig();
  if (!gh.token) {
    persistFallback({
      reason: 'GITHUB_TOKEN not set',
      title: issueTitle,
      type,
      reporter: reporterStr,
      memberId: serverAuth.memberId,
      issueBody,
    });
    return NextResponse.json(
      { success: true, message: 'Report received (GitHub not configured).' },
      { status: 201 },
    );
  }

  try {
    const octokit = new Octokit({ auth: gh.token, request: { timeout: 10000 } });
    const issue = await createIssueWithRetry(octokit, {
      owner: gh.owner,
      repo: gh.repo,
      title: issueTitle,
      body: issueBody,
      labels,
    });

    console.warn(`[BugReport] Created GitHub issue #${issue.number}: ${issue.html_url}`);
    return NextResponse.json(
      { success: true, issueNumber: issue.number, issueUrl: issue.html_url },
      { status: 201 },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const status = (err as any)?.status;
    console.error(`[BugReport] GitHub API error (status=${status ?? 'n/a'}):`, msg);
    persistFallback({
      reason: `github_failed:${status ?? 'network'}:${msg}`,
      title: issueTitle,
      type,
      reporter: reporterStr,
      memberId: serverAuth.memberId,
      issueBody,
    });
    return NextResponse.json(
      { success: true, message: 'Report received. GitHub issue creation failed.' },
      { status: 201 },
    );
  }
}
