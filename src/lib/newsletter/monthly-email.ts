/**
 * Render an admin-composed monthly update into the branded email shell used
 * across the app (matches resignup-nudge / reminder styling). The admin writes
 * a plain-text body; we escape it (the composer is trusted, but escaping keeps
 * stray `<`/`&` from breaking the markup) and turn blank-line-separated blocks
 * into paragraphs. Every email carries a per-recipient unsubscribe link.
 */

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://calendar.castalia.one';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Blank-line-separated blocks → <p>; single newlines → <br>. */
export function bodyToHtml(body: string): string {
  return body
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map(
      (block) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#c4b69a;">${escapeHtml(
          block,
        ).replace(/\n/g, '<br>')}</p>`,
    )
    .join('\n');
}

export interface MonthlyEmailArgs {
  subject: string;
  body: string;
  greetingName?: string | null;
  unsubscribeUrl: string;
}

export function buildMonthlyEmail(args: MonthlyEmailArgs): { subject: string; html: string } {
  const greeting = args.greetingName ? `Hi ${escapeHtml(args.greetingName)},` : 'Hi,';
  const bodyHtml = bodyToHtml(args.body);

  const html = `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
  <body style="margin:0;padding:0;background:#0f0e0c;color:#e8dccc;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0f0e0c;padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background:#1a1815;border:1px solid #3a342c;border-radius:12px;padding:32px;">
          <tr><td>
            <div style="text-align:center;margin-bottom:20px;">
              <span style="font-size:12px;color:#a08c6e;letter-spacing:2px;text-transform:uppercase;">Liminal Commons</span>
            </div>
            <h1 style="margin:0 0 16px;font-size:20px;color:#e8dccc;">${escapeHtml(args.subject)}</h1>
            <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#c4b69a;">${greeting}</p>
            ${bodyHtml}
            <div style="margin:24px 0 0;">
              <a href="${BASE_URL}" style="font-size:13px;color:#c4935a;text-decoration:underline;">Open the calendar →</a>
            </div>
          </td></tr>
        </table>
        <p style="margin:16px 0 0;font-size:11px;color:#6b5f4f;text-align:center;line-height:1.5;">
          You're receiving this because you're a member of or subscribed to the Liminal Commons Calendar.<br>
          <a href="${args.unsubscribeUrl}" style="color:#7f6e54;text-decoration:underline;">Unsubscribe from these updates</a>
        </p>
      </td></tr>
    </table>
  </body>
</html>`;

  return { subject: args.subject, html };
}
