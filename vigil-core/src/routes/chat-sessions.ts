import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import { db } from "../db/connection.js";
import { chatSessions } from "../db/schema.js";

export const chatSessionsRouter = new Hono();

// GET /chat-sessions — List all sessions (newest first)
chatSessionsRouter.get("/chat-sessions", async (c) => {
  const rows = await db!
    .select({
      id: chatSessions.id,
      title: chatSessions.title,
      messageCount: chatSessions.messages,
      createdAt: chatSessions.createdAt,
      updatedAt: chatSessions.updatedAt,
    })
    .from(chatSessions)
    .orderBy(desc(chatSessions.updatedAt))
    .limit(50);

  return c.json({
    data: rows.map((r) => ({
      id: r.id,
      title: r.title,
      messageCount: Array.isArray(r.messageCount) ? r.messageCount.length : 0,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  });
});

// GET /chat-sessions/:id — Get a single session with full messages
chatSessionsRouter.get("/chat-sessions/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: "Invalid session ID" }, 400);
  }

  const rows = await db!
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.id, id))
    .limit(1);

  if (rows.length === 0) {
    return c.json({ error: "Session not found" }, 404);
  }

  const row = rows[0];
  return c.json({
    id: row.id,
    title: row.title,
    messages: row.messages,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
});

// POST /chat-sessions — Create a new session
chatSessionsRouter.post("/chat-sessions", async (c) => {
  let body: { title?: string; messages?: Array<{ role: "user" | "assistant"; content: string }> };
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const rows = await db!
    .insert(chatSessions)
    .values({
      title: body.title ?? "New Chat",
      messages: body.messages ?? [],
    })
    .returning();

  const row = rows[0];
  return c.json(
    {
      id: row.id,
      title: row.title,
      messages: row.messages,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    },
    201,
  );
});

// PUT /chat-sessions/:id — Update session (title, messages)
chatSessionsRouter.put("/chat-sessions/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: "Invalid session ID" }, 400);
  }

  let body: { title?: string; messages?: Array<{ role: "user" | "assistant"; content: string }> };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.title !== undefined) updates.title = body.title;
  if (body.messages !== undefined) updates.messages = body.messages;

  const rows = await db!
    .update(chatSessions)
    .set(updates)
    .where(eq(chatSessions.id, id))
    .returning();

  if (rows.length === 0) {
    return c.json({ error: "Session not found" }, 404);
  }

  const row = rows[0];
  return c.json({
    id: row.id,
    title: row.title,
    messages: row.messages,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
});

// DELETE /chat-sessions/:id — Delete a session
chatSessionsRouter.delete("/chat-sessions/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: "Invalid session ID" }, 400);
  }

  const rows = await db!
    .delete(chatSessions)
    .where(eq(chatSessions.id, id))
    .returning();

  if (rows.length === 0) {
    return c.json({ error: "Session not found" }, 404);
  }

  return c.json({ deleted: true });
});
