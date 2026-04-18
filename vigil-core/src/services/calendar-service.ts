// Calendar service — Google Calendar API integration with DI factory pattern
// Handles token refresh transparently and returns graceful degradation statuses.
// Security: access tokens are NEVER logged (T-74-08 mitigation).

import { db } from "../db/connection.js";
import { oauthTokens, users } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { decryptToken } from "../utils/token-crypto.js";

// TODO(AUTH-06+): Per-user calendar service. For Phase 102 the calendar
// service is hard-scoped to the seed user (VIGIL_SEED_USER_EMAIL) because
// oauth_tokens is now keyed by (userId, provider) and the production
// singleton has no per-request userId context. Future phase: thread
// userId through fetchTodaysEvents / fetchCalendarList when the PWA
// switches from vk_ to JWT auth and the brief assembly pipeline fans
// out per user. Captured in RESEARCH Open Q4.

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string; // ISO 8601
  endTime: string;   // ISO 8601
  allDay: boolean;
  location: string | null;
  calendarId: string;
  calendarName: string;
  calendarColor: string | null;
}

export interface CalendarInfo {
  id: string;
  name: string;
  color: string | null;
  primary: boolean;
}

export type CalendarEventsResponse =
  | { status: "ok"; events: CalendarEvent[]; fetchedAt: string }
  | { status: "needs_reauth" }
  | { status: "error"; error: string };

export type CalendarListResponse =
  | { status: "ok"; calendars: CalendarInfo[] }
  | { status: "needs_reauth" }
  | { status: "error"; error: string };

// ── DB row type (subset of schema) ────────────────────────────────────────────

interface OAuthTokenRow {
  id: number;
  provider: string;
  encryptedRefreshToken: string;
  accessToken: string;
  expiresAt: Date | null;
  calendarSelections: string[] | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── DI interface ──────────────────────────────────────────────────────────────

export interface CalendarServiceDeps {
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
  dbSelectFn?: () => Promise<OAuthTokenRow | null>;
  dbUpdateFn?: (accessToken: string, expiresAt: Date | null) => Promise<void>;
  refreshFn?: (refreshToken: string) => Promise<{ access_token: string; expiry_date: number | null }>;
}

// ── Custom error classes ──────────────────────────────────────────────────────

class TokenNotFoundError extends Error {
  constructor() {
    super("No OAuth token row found for provider=google");
    this.name = "TokenNotFoundError";
  }
}

class TokenRevokedError extends Error {
  constructor(cause?: unknown) {
    super(`Google OAuth token revoked or invalid: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "TokenRevokedError";
  }
}

// ── Google Calendar API response shapes ───────────────────────────────────────

interface GCalEvent {
  id: string;
  summary?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  location?: string | null;
}

interface GCalEventsResponse {
  items: GCalEvent[];
}

interface GCalCalendarListItem {
  id: string;
  summary?: string;
  backgroundColor?: string | null;
  primary?: boolean;
}

interface GCalCalendarListResponse {
  items: GCalCalendarListItem[];
}

// ── Factory ────────────────────────────────────────────────────────────────────

export function createCalendarService(deps?: CalendarServiceDeps): {
  fetchTodaysEvents: () => Promise<CalendarEventsResponse>;
  fetchCalendarList: () => Promise<CalendarListResponse>;
} {
  const fetchFn = deps?.fetchFn ?? globalThis.fetch.bind(globalThis);

  // ── DB helpers ────────────────────────────────────────────────────────────

  // Phase 102: resolve seed user id lazily so test DI paths don't need to run it.
  let resolvedSeedUserId: number | null = null;
  async function getSeedUserId(): Promise<number | null> {
    if (resolvedSeedUserId !== null) return resolvedSeedUserId;
    if (!db) return null;
    const seedEmail = (process.env["VIGIL_SEED_USER_EMAIL"] ?? "jamesonmorrill1@gmail.com").trim().toLowerCase();
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.email, seedEmail)).limit(1);
    if (rows.length === 0) return null;
    resolvedSeedUserId = rows[0].id;
    return resolvedSeedUserId;
  }

  async function dbSelect(): Promise<OAuthTokenRow | null> {
    if (deps?.dbSelectFn) return deps.dbSelectFn();
    if (!db) return null;
    const seedUserId = await getSeedUserId();
    if (seedUserId === null) return null;
    const rows = await db
      .select()
      .from(oauthTokens)
      .where(and(eq(oauthTokens.userId, seedUserId), eq(oauthTokens.provider, "google")))
      .limit(1);
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.id,
      provider: row.provider,
      encryptedRefreshToken: row.encryptedRefreshToken,
      accessToken: row.accessToken,
      expiresAt: row.expiresAt ?? null,
      calendarSelections: Array.isArray(row.calendarSelections) ? row.calendarSelections : [],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async function dbUpdate(accessToken: string, expiresAt: Date | null): Promise<void> {
    if (deps?.dbUpdateFn) return deps.dbUpdateFn(accessToken, expiresAt);
    if (!db) return;
    const seedUserId = await getSeedUserId();
    if (seedUserId === null) return;
    await db
      .update(oauthTokens)
      .set({ accessToken, expiresAt: expiresAt ?? undefined, updatedAt: new Date() })
      .where(and(eq(oauthTokens.userId, seedUserId), eq(oauthTokens.provider, "google")));
  }

  async function doRefresh(refreshToken: string): Promise<{ access_token: string; expiry_date: number | null }> {
    if (deps?.refreshFn) return deps.refreshFn(refreshToken);
    // Production: use google-auth-library OAuth2Client
    const { OAuth2Client } = await import("google-auth-library");
    const clientId = process.env["GOOGLE_CLIENT_ID"] ?? "";
    const clientSecret = process.env["GOOGLE_CLIENT_SECRET"] ?? "";
    const oauth2Client = new OAuth2Client(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await oauth2Client.refreshAccessToken();
    return {
      access_token: credentials.access_token ?? "",
      expiry_date: credentials.expiry_date ?? null,
    };
  }

  // ── Token management ──────────────────────────────────────────────────────

  /**
   * Returns a valid access token, refreshing if needed.
   * Throws TokenNotFoundError or TokenRevokedError on failure.
   * Never logs token values (T-74-08 mitigation).
   */
  async function getValidAccessToken(): Promise<{ token: string; calendarSelections: string[] }> {
    const row = await dbSelect();
    if (!row) throw new TokenNotFoundError();

    const now = new Date();
    // Refresh if expired or within 5 minutes of expiry
    const isExpired =
      row.expiresAt == null ||
      row.expiresAt.getTime() - now.getTime() < 5 * 60 * 1000;

    let accessToken = row.accessToken;

    if (isExpired) {
      // Decrypt refresh token — never log the plaintext value
      let refreshToken: string;
      try {
        refreshToken = decryptToken(row.encryptedRefreshToken);
      } catch (err) {
        throw new TokenRevokedError(err);
      }

      try {
        const refreshed = await doRefresh(refreshToken);
        accessToken = refreshed.access_token;
        const newExpiry = refreshed.expiry_date ? new Date(refreshed.expiry_date) : null;
        await dbUpdate(accessToken, newExpiry);
        console.log("[calendar-service] token refreshed for provider=google");
      } catch (err) {
        throw new TokenRevokedError(err);
      }
    }

    return {
      token: accessToken,
      calendarSelections: Array.isArray(row.calendarSelections) ? row.calendarSelections : [],
    };
  }

  // ── Calendar list (internal, used when no selections specified) ───────────

  async function fetchCalendarListRaw(accessToken: string): Promise<string[]> {
    const url = "https://www.googleapis.com/calendar/v3/users/me/calendarList";
    const res = await fetchFn(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as GCalCalendarListResponse;
    return (data.items ?? []).map((item) => item.id);
  }

  // ── Normalizers ───────────────────────────────────────────────────────────

  function normalizeEvent(raw: GCalEvent, calendarId: string, calendarName: string, calendarColor: string | null): CalendarEvent {
    const allDay = !raw.start.dateTime;
    const startTime = raw.start.dateTime ?? raw.start.date ?? "";
    const endTime = raw.end.dateTime ?? raw.end.date ?? "";

    return {
      id: raw.id,
      title: raw.summary ?? "(No title)",
      startTime,
      endTime,
      allDay,
      location: raw.location ?? null,
      calendarId,
      calendarName,
      calendarColor,
    };
  }

  // ── Public: fetchTodaysEvents ─────────────────────────────────────────────

  async function fetchTodaysEvents(): Promise<CalendarEventsResponse> {
    let accessToken: string;
    let calendarSelections: string[];

    try {
      const result = await getValidAccessToken();
      accessToken = result.token;
      calendarSelections = result.calendarSelections;
    } catch (err) {
      if (err instanceof TokenNotFoundError || err instanceof TokenRevokedError) {
        return { status: "needs_reauth" };
      }
      return { status: "error", error: err instanceof Error ? err.message : String(err) };
    }

    // If no selections, fall back to fetching all calendars
    if (calendarSelections.length === 0) {
      try {
        calendarSelections = await fetchCalendarListRaw(accessToken);
      } catch (err) {
        return { status: "error", error: "Failed to fetch calendar list" };
      }
    }

    // Time range: today midnight to tomorrow midnight (local time)
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);

    const allEvents: CalendarEvent[] = [];

    try {
      await Promise.all(
        calendarSelections.map(async (calendarId) => {
          const url =
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events` +
            `?timeMin=${encodeURIComponent(todayStart.toISOString())}` +
            `&timeMax=${encodeURIComponent(todayEnd.toISOString())}` +
            `&singleEvents=true` +
            `&orderBy=startTime` +
            `&maxResults=50`;

          const res = await fetchFn(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });

          if (res.status === 401) {
            throw new Error("needs_reauth");
          }

          if (!res.ok) return; // Skip calendars that return other errors

          const data = (await res.json()) as GCalEventsResponse;
          const events = (data.items ?? []).map((raw) =>
            normalizeEvent(raw, calendarId, calendarId, null)
          );
          allEvents.push(...events);
        })
      );
    } catch (err) {
      if (err instanceof Error && err.message === "needs_reauth") {
        return { status: "needs_reauth" };
      }
      // Network error or other failure
      return { status: "error", error: "Google Calendar API unreachable" };
    }

    // Sort by startTime
    allEvents.sort((a, b) => a.startTime.localeCompare(b.startTime));

    return {
      status: "ok",
      events: allEvents,
      fetchedAt: new Date().toISOString(),
    };
  }

  // ── Public: fetchCalendarList ─────────────────────────────────────────────

  async function fetchCalendarList(): Promise<CalendarListResponse> {
    let accessToken: string;

    try {
      const result = await getValidAccessToken();
      accessToken = result.token;
    } catch (err) {
      if (err instanceof TokenNotFoundError || err instanceof TokenRevokedError) {
        return { status: "needs_reauth" };
      }
      return { status: "error", error: err instanceof Error ? err.message : String(err) };
    }

    try {
      const url = "https://www.googleapis.com/calendar/v3/users/me/calendarList";
      const res = await fetchFn(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (res.status === 401) {
        return { status: "needs_reauth" };
      }

      if (!res.ok) {
        return { status: "error", error: `Google Calendar list fetch failed: ${res.status}` };
      }

      const data = (await res.json()) as GCalCalendarListResponse;
      const calendars: CalendarInfo[] = (data.items ?? []).map((item) => ({
        id: item.id,
        name: item.summary ?? item.id,
        color: item.backgroundColor ?? null,
        primary: item.primary ?? false,
      }));

      return { status: "ok", calendars };
    } catch (err) {
      return { status: "error", error: "Google Calendar API unreachable" };
    }
  }

  return { fetchTodaysEvents, fetchCalendarList };
}

// ── Production singleton ──────────────────────────────────────────────────────

export const calendarService = createCalendarService();
