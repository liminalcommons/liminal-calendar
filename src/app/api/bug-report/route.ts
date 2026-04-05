import { NextRequest, NextResponse } from 'next/server';
import { Octokit } from '@octokit/rest';

const GITHUB_TOKEN      = process.env.GITHUB_TOKEN?.trim();
const GITHUB_REPO_OWNER = (process.env.GITHUB_REPO_OWNER || 'liminalcommons').trim();
const GITHUB_REPO_NAME  = (process.env.GITHUB_REPO_NAME  || 'liminal-calendar').trim();

function parseBrowser(ua: string): string {
  if (!ua) return 'Unknown';
  if (ua.includes('Edg/'))     return `Edge ${ua.match(/Edg\/([\d.]+)/)?.[1] ?? ''}`.trim();
  if (ua.includes('Firefox/')) return `Firefox ${ua.match(/Firefox\/([\d.]+)/)?.[1] ?? ''}`.trim();
  if (ua.includes('Chrome/'))  return `Chrome ${ua.match(/Chrome\/([\d.]+)/)?.[1] ?? ''}`.trim();
  if (ua.includes('Safari/'))  return `Safari ${ua.match(/Version\/([\d.]+)/)?.[1] ?? ''}`.trim();
  return ua.slice(0, 60);
}

function processLogs(raw: string): { errors: string; all: string } {
  const lines = raw.split('\n').filter(Boolean);
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
    const msg = e.message.length > 300 ? e.message.slice(0, 300) + '…' : e.message;
    const repeat = e.count > 1 ? ` _(×${e.count})_` : '';
    return `${icon} ${msg}${repeat}`;
  };

  const errorLines = deduped.filter(e => e.level === 'ERROR' || e.level === 'WARN').map(fmt).join('\n');
  const allLines = deduped.map(fmt).join('\n');
  return { errors: errorLines, all: allLines };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { title, description, type, clientLogs, metadata } = body;

  const ts = metadata?.timestamp ?? new Date().toISOString();
  const browser = parseBrowser(metadata?.userAgent ?? '');

  const labels = type === 'bug' ? ['bug', 'user-reported']
    : type === 'feature' ? ['enhancement', 'user-reported']
    : ['feedback', 'user-reported'];

  const logs = clientLogs ? processLogs(clientLogs) : null;

  // Build issue body
  let issueBody = '';
  if (description) {
    issueBody += `${description}\n\n`;
  }

  // Errors & warnings (prominent)
  if (logs?.errors) {
    issueBody += `### Errors & Warnings\n\n${logs.errors}\n\n`;
  }

  issueBody += `### Environment\n\n`;
  issueBody += `| | |\n|---|---|\n`;
  issueBody += `| **Page** | ${metadata?.url ?? 'N/A'} |\n`;
  issueBody += `| **Reporter** | ${metadata?.reporter ?? 'Anonymous'} |\n`;
  issueBody += `| **Browser** | ${browser} |\n`;
  issueBody += `| **Screen** | ${metadata?.screenSize ?? 'N/A'} |\n`;
  issueBody += `| **Theme** | ${metadata?.theme ?? 'N/A'} |\n`;
  issueBody += `| **Time** | ${ts} |\n\n`;

  // Full logs (collapsed)
  if (logs?.all) {
    issueBody += `<details>\n<summary>Console log (${logs.all.split('\n').length} entries)</summary>\n\n`;
    issueBody += `${logs.all}\n`;
    issueBody += `</details>\n\n`;
  }

  issueBody += `---\n_Submitted via Liminal Calendar bug reporter_\n`;

  const issueTitle = title
    ? `[${type === 'bug' ? 'Bug' : type === 'feature' ? 'Feature' : 'Feedback'}] ${title.slice(0, 80)}`
    : `Report (${ts.slice(0, 10)})`;

  if (!GITHUB_TOKEN) {
    console.log('[BugReport] GITHUB_TOKEN not set — report received but not filed on GitHub');
    console.log('[BugReport]', JSON.stringify({ title, description, type, metadata }, null, 2));
    return NextResponse.json(
      { success: true, message: 'Report received (GitHub not configured).' },
      { status: 201 },
    );
  }

  try {
    const octokit = new Octokit({ auth: GITHUB_TOKEN, request: { timeout: 10000 } });
    const { data: issue } = await octokit.issues.create({
      owner: GITHUB_REPO_OWNER,
      repo: GITHUB_REPO_NAME,
      title: issueTitle,
      body: issueBody,
      labels,
    });

    console.log(`[BugReport] Created GitHub issue #${issue.number}: ${issue.html_url}`);
    return NextResponse.json(
      { success: true, issueNumber: issue.number, issueUrl: issue.html_url },
      { status: 201 },
    );
  } catch (err: any) {
    console.error('[BugReport] GitHub API error:', err.message);
    return NextResponse.json(
      { success: true, message: 'Report received. GitHub issue creation failed.' },
      { status: 201 },
    );
  }
}
