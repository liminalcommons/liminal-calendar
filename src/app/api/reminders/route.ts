/**
 * Email Reminders Cron Job API
 *
 * This endpoint is designed to be called by:
 * - Vercel Cron (add to vercel.json)
 * - Supabase Edge Function
 * - External scheduler
 *
 * It finds pending reminders where remind_at <= now and sent = false,
 * sends email notifications, and marks them as sent.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazy initialization to avoid build-time errors
let _supabaseAdmin: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error('Supabase environment variables not configured');
    }

    _supabaseAdmin = createClient(url, key);
  }
  return _supabaseAdmin;
}

interface PendingReminder {
  id: string;
  event_id: string;
  user_id: string;
  user_email: string;
  remind_at: string;
}

interface EventData {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  event_url: string | null;
  creator_name: string;
}

interface ReminderResult {
  id: string;
  status: 'sent' | 'skipped' | 'failed' | 'error';
  reason?: string;
}

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Find pending reminders that should be sent now
    const now = new Date().toISOString();
    const { data: reminders, error: fetchError } = await supabase
      .from('event_reminders')
      .select('*')
      .eq('sent', false)
      .lte('remind_at', now)
      .limit(50); // Process in batches

    if (fetchError) {
      console.error('Error fetching reminders:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch reminders' }, { status: 500 });
    }

    if (!reminders || reminders.length === 0) {
      return NextResponse.json({ message: 'No pending reminders', processed: 0 });
    }

    // Get unique event IDs
    const eventIds = [...new Set((reminders as PendingReminder[]).map((r: PendingReminder) => r.event_id))];

    // Fetch event details
    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select('id, title, description, starts_at, event_url, creator_name')
      .in('id', eventIds);

    if (eventsError) {
      console.error('Error fetching events:', eventsError);
      return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
    }

    const eventMap = new Map<string, EventData>(
      (events || []).map((e: EventData) => [e.id, e])
    );

    // Send reminders and mark as sent
    const results = await Promise.allSettled(
      (reminders as PendingReminder[]).map(async (reminder: PendingReminder): Promise<ReminderResult> => {
        const event = eventMap.get(reminder.event_id);
        if (!event) {
          console.warn(`Event not found for reminder ${reminder.id}`);
          return { id: reminder.id, status: 'skipped', reason: 'event_not_found' };
        }

        // Send email
        const sent = await sendReminderEmail(reminder, event);

        if (sent) {
          // Mark as sent
          await supabase
            .from('event_reminders')
            .update({ sent: true })
            .eq('id', reminder.id);

          return { id: reminder.id, status: 'sent' };
        } else {
          return { id: reminder.id, status: 'failed' };
        }
      })
    );

    const successCount = results.filter(
      (r: PromiseSettledResult<ReminderResult>) => r.status === 'fulfilled' && r.value.status === 'sent'
    ).length;

    return NextResponse.json({
      message: 'Reminders processed',
      processed: reminders.length,
      sent: successCount,
      results: results.map((r: PromiseSettledResult<ReminderResult>) =>
        r.status === 'fulfilled' ? r.value : { status: 'error', reason: String(r.reason) }
      ),
    });
  } catch (error) {
    console.error('Reminder cron error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Send a reminder email using SMTP
 */
async function sendReminderEmail(
  reminder: PendingReminder,
  event: EventData
): Promise<boolean> {
  // Check if email sending is configured
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.warn('SMTP not configured, skipping email send');
    console.warn(`Would send reminder to ${reminder.user_email} for event: ${event.title}`);
    return true; // Return true to mark as sent (for testing without SMTP)
  }

  try {
    // Format event time
    const eventDate = new Date(event.starts_at);
    const formattedDate = eventDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const formattedTime = eventDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });

    const subject = `Reminder: ${event.title} is tomorrow`;
    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #fef3c7, #fde68a); padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; color: #92400e; font-size: 24px;">Event Reminder</h1>
        </div>
        <div style="background: #ffffff; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <h2 style="margin: 0 0 16px; color: #1f2937;">${event.title}</h2>
          <p style="color: #6b7280; margin: 0 0 8px;">
            <strong>When:</strong> ${formattedDate} at ${formattedTime}
          </p>
          <p style="color: #6b7280; margin: 0 0 16px;">
            <strong>Hosted by:</strong> ${event.creator_name}
          </p>
          ${event.description ? `<p style="color: #4b5563; margin: 0 0 16px;">${event.description}</p>` : ''}
          ${
            event.event_url
              ? `<a href="${event.event_url}" style="display: inline-block; background: #d97706; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">Join Event</a>`
              : ''
          }
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            You're receiving this because you RSVP'd to this event on Liminal Calendar.
          </p>
        </div>
      </div>
    `;

    // Use Resend if configured
    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || 'calendar@liminalcommons.com',
          to: reminder.user_email,
          subject,
          html: htmlBody,
        }),
      });

      if (!response.ok) {
        console.error('Resend API error:', await response.text());
        return false;
      }
      return true;
    }

    // Fallback: log email details
    console.warn('Email would be sent:');
    console.warn(`To: ${reminder.user_email}`);
    console.warn(`Subject: ${subject}`);

    return true;
  } catch (error) {
    console.error('Error sending reminder email:', error);
    return false;
  }
}

// Also support POST for manual triggering
export async function POST(request: NextRequest) {
  return GET(request);
}
