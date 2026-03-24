import { Router, Request, Response } from 'express';
import { google } from 'googleapis';
import { db } from '../db';

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_CALENDAR_REDIRECT_URI ||
    `${process.env.BACKEND_ORIGIN || 'http://localhost:4000'}/api/auth/google/callback`;

  if (!clientId || !clientSecret) return null;

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function getStoredTokens(
  callback: (err: Error | null, tokens: { access_token: string; refresh_token?: string; expiry_date?: number } | null) => void
): void {
  db.get(
    'SELECT access_token, refresh_token, expiry_date FROM CalendarTokens WHERE id = 1',
    [],
    (err, row: { access_token: string; refresh_token: string | null; expiry_date: number | null } | undefined) => {
      if (err || !row) {
        callback(null, null);
        return;
      }
      callback(null, {
        access_token: row.access_token,
        refresh_token: row.refresh_token ?? undefined,
        expiry_date: row.expiry_date ?? undefined,
      });
    }
  );
}

function saveTokens(tokens: {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
}): void {
  // Get existing tokens first, then merge
  db.get(
    'SELECT access_token, refresh_token, expiry_date FROM CalendarTokens WHERE id = 1',
    [],
    (err, existing: { access_token: string; refresh_token: string | null; expiry_date: number | null } | undefined) => {
      const access_token = tokens.access_token ?? existing?.access_token ?? '';
      const refresh_token = tokens.refresh_token ?? existing?.refresh_token ?? null;
      const expiry_date = tokens.expiry_date ?? existing?.expiry_date ?? null;

      db.run(
        `INSERT OR REPLACE INTO CalendarTokens (id, access_token, refresh_token, expiry_date)
         VALUES (1, ?, ?, ?)`,
        [access_token, refresh_token, expiry_date],
        (saveErr) => {
          if (saveErr) console.error('[calendar] Failed to save tokens:', saveErr);
        }
      );
    }
  );
}

function clearTokens(): void {
  db.run('DELETE FROM CalendarTokens WHERE id = 1');
}

// ─── GET /api/auth/google — Redirect to Google OAuth ─────────────────────────

router.get('/google', (req: Request, res: Response) => {
  const oAuth2Client = getOAuthClient();

  if (!oAuth2Client) {
    return res.status(501).json({
      error: 'Google Calendar not configured',
      setup: true,
      message: 'Set GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET environment variables.',
    });
  }

  const url = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar.readonly'],
  });

  return res.redirect(url);
});

// ─── GET /api/auth/google/callback — Handle OAuth callback ───────────────────

router.get('/google/callback', async (req: Request, res: Response) => {
  const oAuth2Client = getOAuthClient();

  if (!oAuth2Client) {
    return res.status(501).json({
      error: 'Google Calendar not configured',
      setup: true,
    });
  }

  const code = req.query.code as string | undefined;

  if (!code) {
    return res.status(400).json({ error: 'Missing OAuth code' });
  }

  try {
    const { tokens } = await oAuth2Client.getToken(code);
    saveTokens({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date ?? null,
    });

    const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
    return res.redirect(`${frontendOrigin}/calendar`);
  } catch (err) {
    console.error('[calendar] OAuth callback error:', err);
    return res.status(500).json({ error: 'OAuth token exchange failed' });
  }
});

// ─── GET /api/calendar/events?date=YYYY-MM-DD ─────────────────────────────────

router.get('/events', async (req: Request, res: Response) => {
  if (!process.env.GOOGLE_CALENDAR_CLIENT_ID || !process.env.GOOGLE_CALENDAR_CLIENT_SECRET) {
    return res.status(501).json({
      error: 'Google Calendar not configured',
      setup: true,
      message: 'Set GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET environment variables.',
    });
  }

  const oAuth2Client = getOAuthClient();
  if (!oAuth2Client) {
    return res.status(501).json({ error: 'Google Calendar not configured', setup: true });
  }

  getStoredTokens(async (err, storedTokens) => {
    if (err || !storedTokens) {
      return res.status(401).json({
        error: 'Not authenticated with Google Calendar',
        setup: true,
      });
    }

    oAuth2Client.setCredentials(storedTokens);

    oAuth2Client.on('tokens', (newTokens) => {
      saveTokens({
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token,
        expiry_date: newTokens.expiry_date ?? null,
      });
    });

    const dateStr = (req.query.date as string) || new Date().toISOString().split('T')[0];
    const [year, monthStr, day] = dateStr.split('-').map(Number);
    const timeMin = new Date(year, monthStr - 1, day, 0, 0, 0).toISOString();
    const timeMax = new Date(year, monthStr - 1, day, 23, 59, 59).toISOString();

    try {
      const calendarApi = google.calendar({ version: 'v3', auth: oAuth2Client });

      const response = await calendarApi.events.list({
        calendarId: 'primary',
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 50,
      });

      const events = (response.data.items || []).map((item) => ({
        id: item.id,
        summary: item.summary || '(No title)',
        start: item.start,
        end: item.end,
        htmlLink: item.htmlLink,
      }));

      return res.json(events);
    } catch (fetchErr: unknown) {
      console.error('[calendar] Failed to fetch events:', fetchErr);

      const error = fetchErr as { code?: number; message?: string };
      if (error.code === 401 || error.code === 403) {
        clearTokens();
        return res.status(401).json({
          error: 'Google Calendar token expired. Please reconnect.',
          setup: true,
        });
      }

      return res.status(500).json({ error: 'Failed to fetch calendar events' });
    }
  });
});

export default router;
