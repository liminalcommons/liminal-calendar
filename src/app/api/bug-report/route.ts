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

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { title, description, type, metadata } = body;

  const ts = metadata?.timestamp ?? new Date().toISOString();
  const browser = parseBrowser(metadata?.userAgent ?? '');

  const labels = type === 'bug' ? ['bug', 'user-reported']
    : type === 'feature' ? ['enhancement', 'user-reported']
    : ['feedback', 'user-reported'];

  // Build issue body
  let issueBody = '';
  if (description) {
    issueBody += `${description}\n\n`;
  }

  issueBody += `### Environment\n\n`;
  issueBody += `| | |\n|---|---|\n`;
  issueBody += `| **Page** | ${metadata?.url ?? 'N/A'} |\n`;
  issueBody += `| **Reporter** | ${metadata?.reporter ?? 'Anonymous'} |\n`;
  issueBody += `| **Browser** | ${browser} |\n`;
  issueBody += `| **Screen** | ${metadata?.screenSize ?? 'N/A'} |\n`;
  issueBody += `| **Theme** | ${metadata?.theme ?? 'N/A'} |\n`;
  issueBody += `| **Time** | ${ts} |\n\n`;

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
