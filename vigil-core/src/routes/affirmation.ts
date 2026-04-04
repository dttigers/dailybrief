import { Hono } from "hono";
import { callClaude, getAIClient } from "../ai/client.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const CACHE_DIR = path.join(os.homedir(), ".cache", "dailybrief");

function getCacheFile(): string {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(CACHE_DIR, `affirmation-${today}.txt`);
}

function readCache(): string | null {
  const file = getCacheFile();
  try {
    if (fs.existsSync(file)) {
      return fs.readFileSync(file, "utf-8");
    }
  } catch {
    // Cache read failure is non-fatal
  }
  return null;
}

function writeCache(text: string): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(getCacheFile(), text, "utf-8");
  } catch {
    // Cache write failure is non-fatal — fire and forget
  }
}

export const affirmation = new Hono();

affirmation.post("/affirmation", async (c) => {
  // Check for cached affirmation first
  const cached = readCache();
  if (cached) {
    return c.json({ affirmation: cached, cached: true });
  }

  // Check AI client availability
  if (!getAIClient()) {
    return c.json({ error: "AI service unavailable" }, 503);
  }

  // Parse optional body
  let recentThoughts: string[] = [];
  try {
    const body = await c.req.json();
    if (Array.isArray(body?.recentThoughts)) {
      recentThoughts = body.recentThoughts;
    }
  } catch {
    // No body or invalid JSON — proceed without thoughts
  }

  // Build system prompt
  let system =
    "Generate a brief, warm ADHD-specific affirmation (2-3 sentences). Address themes like focus, time management, self-worth, or embracing how your brain works. Be encouraging but not patronizing. Vary the theme each day.";

  if (recentThoughts.length > 0) {
    const truncated = recentThoughts
      .slice(0, 5)
      .map((t) => t.slice(0, 50))
      .join("\n");
    system += `\n\nThe user recently captured these thoughts (reference 1-2 naturally if relevant, don't force it):\n${truncated}`;
  }

  system += "\n\nReturn only the affirmation text.";

  const FALLBACK =
    "You are capable, you are enough, and today is full of possibility.";

  try {
    const text = await callClaude({
      system,
      userMessage: "Give me today's ADHD affirmation.",
      maxTokens: 200,
    });

    writeCache(text);
    return c.json({ affirmation: text, cached: false });
  } catch {
    return c.json({ affirmation: FALLBACK, cached: false });
  }
});
