import { Resend } from 'resend';

let _resend: Resend | null = null;
function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

const EMAIL_FROM = process.env.EMAIL_FROM || 'Liminal Calendar <calendar@liminalcommons.com>';

export interface SendEmailOptions {
  /** Extra SMTP headers, e.g. List-Unsubscribe for one-click opt-out. */
  headers?: Record<string, string>;
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  opts: SendEmailOptions = {},
): Promise<{ success: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not configured — skipping send');
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }
  try {
    const { error } = await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject,
      html,
      ...(opts.headers ? { headers: opts.headers } : {}),
    });
    if (error) {
      console.error('[email] Resend error:', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[email] Send failed:', msg);
    return { success: false, error: msg };
  }
}
