# Liminal Calendar

A community calendar for distributed teams with **Golden Hours** - optimal meeting times for global coordination.

## Features

### Core
- **Golden Hours Display**: Shows optimal meeting times for Europe, Americas, and Brazil overlap
- **Self-Service Events**: Any member can create events, only creators can edit/delete
- **Time Zone Intelligence**: Auto-detects user's timezone, shows events in local time
- **Soft Nudge**: Warning when scheduling outside Golden Hours (not blocking)
- **No Admin Required**: Fully self-service, no gatekeepers

### Event Management
- **Recurring Events**: Daily, weekly, biweekly, and monthly recurrence patterns
- **Event Types**: Categorize events (General, Presentation, Workshop, Social, Meeting, Standup)
- **Color-Coded Badges**: Visual differentiation by event type
- **Host as Attendee**: Event creator is automatically counted in RSVP

### Access Control
- **Public Events**: Visible to all visitors
- **Members Only**: Requires sign-in to view
- **Invite Only**: Restricted to specific email addresses

### Notifications
- **Email Reminders**: Automatic 24-hour reminder emails for RSVPed attendees
- **RSVP System**: Going, Maybe, and Cancel status tracking

## Golden Hours

Optimal overlap times for Liminal Commons:

| Region | Weekdays (2h) | Weekends (3h) |
|--------|---------------|---------------|
| Europe (CET) | 20:00-22:00 | 18:00-21:00 |
| Brazil (BRT) | 16:00-18:00 | 14:00-17:00 |
| NYC (EST) | 14:00-16:00 | 12:00-15:00 |
| Texas (CST) | 13:00-15:00 | 11:00-14:00 |
| California (PST) | 11:00-13:00 | 09:00-12:00 |

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.local.example` to `.env.local` and fill in:

```bash
cp .env.local.example .env.local
```

**Castalia (Authentication):**
Sign-in goes through the Liminal Commons identity at
[id.castalia.one](https://id.castalia.one), powered by Logto under the hood.
Register the calendar as an application in the Castalia dev portal at
[developers.castalia.one](https://developers.castalia.one) and copy the
OIDC client id, secret, and endpoint into your env file.

**Neon Postgres (Database):**
1. Go to [neon.tech](https://neon.tech) and create a project
2. Copy the connection string into `DATABASE_URL`

### 3. Database Schema

Schema lives in `src/lib/db/schema.ts` (Drizzle ORM). Run migrations:

```bash
npx drizzle-kit push
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Deploy to Vercel

1. Push to GitHub
2. Import to Vercel
3. Add environment variables (see `.env.example`)
4. Deploy!

### Email Reminders

For email reminders to work, you need either:
- **Resend** (recommended): Set `RESEND_API_KEY` and `EMAIL_FROM`
- **SMTP**: Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`

The cron job at `/api/reminders` runs hourly (configured in `vercel.json`).
Set `CRON_SECRET` to secure the endpoint.

## Tech Stack

- **Next.js 15** - React framework
- **Castalia / Logto** - Authentication (Liminal Commons identity)
- **Neon Postgres** + **Drizzle ORM** - Database
- **Tailwind CSS** - Styling
- **TypeScript** - Type safety

## License

MIT
