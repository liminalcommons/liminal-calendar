// ICS Calendar Invitation Generator
// Creates downloadable .ics files for calendar apps

export interface ICSEvent {
  title: string;
  description?: string;
  location?: string;
  url?: string;
  starts_at: string; // ISO string
  ends_at?: string; // ISO string
  organizer?: {
    name: string;
    email?: string;
  };
  recurrenceRule?: string; // 'daily' | 'weekly' | 'fortnightly' | 'monthly'
}

// Generate a unique ID for the event
function generateUID(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}@liminalcommons.com`;
}

// Format date to ICS format (YYYYMMDDTHHMMSSZ)
function formatICSDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// Escape special characters in ICS values
function escapeICS(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

// Fold long lines (ICS spec requires lines < 75 chars)
function foldLine(line: string): string {
  const maxLen = 74;
  if (line.length <= maxLen) return line;

  const lines: string[] = [];
  let remaining = line;

  while (remaining.length > maxLen) {
    lines.push(remaining.substring(0, maxLen));
    remaining = ' ' + remaining.substring(maxLen); // Continue with space
  }
  lines.push(remaining);

  return lines.join('\r\n');
}

// Map recurrence rule string to RRULE line
function buildRRule(recurrenceRule: string): string | null {
  switch (recurrenceRule) {
    case 'daily':
      return 'RRULE:FREQ=DAILY';
    case 'weekly':
      return 'RRULE:FREQ=WEEKLY';
    case 'fortnightly':
      return 'RRULE:FREQ=WEEKLY;INTERVAL=2';
    case 'monthly':
      return 'RRULE:FREQ=MONTHLY';
    default:
      return null;
  }
}

export function generateICS(event: ICSEvent): string {
  const startDate = new Date(event.starts_at);
  const endDate = event.ends_at
    ? new Date(event.ends_at)
    : new Date(startDate.getTime() + 60 * 60 * 1000); // Default 1 hour

  const uid = generateUID();
  const now = new Date();

  // Build description with URL if provided
  let description = event.description || '';
  if (event.url) {
    description = description
      ? `${description}\\n\\nJoin: ${event.url}`
      : `Join: ${event.url}`;
  }

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Liminal Commons//Liminal Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Liminal Commons Event',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatICSDate(now)}`,
    `DTSTART:${formatICSDate(startDate)}`,
    `DTEND:${formatICSDate(endDate)}`,
    `SUMMARY:${escapeICS(event.title)}`,
  ];

  if (description) {
    lines.push(foldLine(`DESCRIPTION:${escapeICS(description)}`));
  }

  if (event.location) {
    lines.push(`LOCATION:${escapeICS(event.location)}`);
  }

  if (event.url) {
    lines.push(`URL:${event.url}`);
  }

  if (event.organizer) {
    const orgEmail = event.organizer.email || 'calendar@liminalcommons.com';
    lines.push(`ORGANIZER;CN=${escapeICS(event.organizer.name)}:mailto:${orgEmail}`);
  }

  // Add RRULE if recurrenceRule provided
  if (event.recurrenceRule) {
    const rrule = buildRRule(event.recurrenceRule);
    if (rrule) {
      lines.push(rrule);
    }
  }

  // Add alarm 15 minutes before
  lines.push(
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeICS(event.title)} starts in 15 minutes`,
    'END:VALARM'
  );

  lines.push('END:VEVENT', 'END:VCALENDAR');

  return lines.join('\r\n');
}

// Create a downloadable ICS file
export function downloadICS(event: ICSEvent, filename?: string): void {
  const icsContent = generateICS(event);
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `${event.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

// Generate ICS data URL for href
export function getICSDataURL(event: ICSEvent): string {
  const icsContent = generateICS(event);
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(icsContent)}`;
}
