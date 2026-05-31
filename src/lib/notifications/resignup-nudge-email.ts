// HTML email asking a former identity-less member to sign in again via
// Castalia or Clerk. The auth.ts Logto callback email-matches against
// `members.email` (auth.ts:108-124), so a successful sign-in with the SAME
// email re-links their existing row (preserving role, events, RSVPs, bookings).

const SIGNIN_URL = 'https://liminalcalendar.com/welcome';

export function resignupNudgeEmail(args: { name: string | null }): {
  subject: string;
  html: string;
} {
  const greeting = args.name ? `Hi ${args.name},` : 'Hi,';

  const html = `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"></head>
  <body style="margin:0;padding:0;background:#0f0e0c;color:#e8dccc;font-family:system-ui,-apple-system,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0f0e0c;padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background:#1a1815;border:1px solid #3a342c;border-radius:12px;padding:32px;">
          <tr><td>
            <h1 style="margin:0 0 12px;font-size:20px;color:#e8dccc;">Sign in to Liminal Calendar again</h1>
            <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#c4b69a;">${greeting}</p>
            <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#c4b69a;">
              We changed how sign-in works on the Liminal Commons Calendar. Your old sign-in method is no longer available — but you can sign in with <strong>Castalia</strong> or with <strong>email / Google</strong>, and your events, RSVPs, and bookings will carry over automatically.
            </p>
            <p style="margin:0 0 28px;font-size:15px;line-height:1.55;color:#c4b69a;">
              Just use the same email address you've always used (<em>this one</em>). Your role, history, and any reminders you'd set up stay attached to your account.
            </p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
              <tr><td style="background:#c4935a;border-radius:8px;">
                <a href="${SIGNIN_URL}" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:600;color:#0f0e0c;text-decoration:none;">Sign in →</a>
              </td></tr>
            </table>
            <p style="margin:28px 0 0;font-size:13px;line-height:1.55;color:#7f6e54;">
              Trouble signing in? Reply to this email and we'll help you get back in. If you didn't expect this message, you can ignore it.
            </p>
          </td></tr>
        </table>
        <p style="margin:16px 0 0;font-size:12px;color:#5a4d3a;">
          Liminal Commons Calendar · <a href="${SIGNIN_URL}" style="color:#7f6e54;">liminalcalendar.com</a>
        </p>
      </td></tr>
    </table>
  </body>
</html>`;

  return {
    subject: 'Sign in to Liminal Calendar again',
    html,
  };
}
