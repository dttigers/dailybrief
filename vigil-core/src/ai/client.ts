import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages.js";
import { withBudgetTracking } from "../lib/ai-budget.js";

let client: Anthropic | null = null;

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn(
    "WARNING: ANTHROPIC_API_KEY not set. AI endpoints will return 503."
  );
}

export function getAIClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

/**
 * Phase 127 GUARD-03 (T-127-03 mitigation): callers MUST pass `userId` so
 * the budget-tracking wrapper can accumulate spend per user. Sourced from
 * `c.get("userId")` in route handlers; for queue/cron paths, supply the
 * persisted userId of the user the work is being done for.
 *
 * The `ai.messages.create` call is wrapped via the budget-tracking helper
 * imported from `lib/ai-budget.js` — the chokepoint that closes Pitfall 4
 * at the wrapper level. The drift detector in `client.test.ts` pins the
 * wrap pattern by source-grepping this file.
 */
export async function callClaude(options: {
  system: string;
  userMessage: string;
  maxTokens: number;
  userId: number;
}): Promise<string> {
  const ai = getAIClient();
  if (!ai) throw new Error("AI client not available");

  const model = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";

  const { userId } = options;
  const response = await withBudgetTracking(userId, () =>
    ai.messages.create({
      model,
      max_tokens: options.maxTokens,
      system: options.system,
      messages: [{ role: "user", content: options.userMessage }],
    })
  );

  const block = response.content[0];
  if (block.type !== "text") {
    throw new Error(`Unexpected response type: ${block.type}`);
  }
  return block.text;
}

/**
 * Phase 127 GUARD-03 (T-127-03 mitigation): callers MUST pass `userId` so
 * `withBudgetTracking` can accumulate spend per user. Sourced from
 * `c.get("userId")` in route handlers; for queue/cron paths, supply the
 * persisted userId of the user the work is being done for.
 */
export async function callClaudeConversation(options: {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens: number;
  userId: number;
}): Promise<string> {
  const ai = getAIClient();
  if (!ai) throw new Error("AI client not available");

  const model = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";

  const { userId } = options;
  const response = await withBudgetTracking(userId, () =>
    ai.messages.create({
      model,
      max_tokens: options.maxTokens,
      system: options.system,
      messages: options.messages,
    })
  );

  const block = response.content[0];
  if (block.type !== "text") {
    throw new Error(`Unexpected response type: ${block.type}`);
  }
  return block.text;
}

/**
 * Phase 127 GUARD-03 (T-127-03 mitigation): callers MUST pass `userId` so
 * `withBudgetTracking` can accumulate spend per user. Sourced from
 * `c.get("userId")` in route handlers; for queue/cron paths, supply the
 * persisted userId of the user the work is being done for.
 */
export async function callClaudeMultimodal(options: {
  system?: string;
  content: MessageParam["content"];
  maxTokens: number;
  userId: number;
}): Promise<string> {
  const ai = getAIClient();
  if (!ai) throw new Error("AI client not available");

  const model = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";

  const { userId } = options;
  const response = await withBudgetTracking(userId, () =>
    ai.messages.create({
      model,
      max_tokens: options.maxTokens,
      ...(options.system ? { system: options.system } : {}),
      messages: [{ role: "user", content: options.content }],
    })
  );

  const block = response.content[0];
  if (block.type !== "text") {
    throw new Error(`Unexpected response type: ${block.type}`);
  }
  return block.text;
}

/**
 * Parse JSON from an AI response, tolerating markdown code fences.
 *
 * Claude (and most LLMs) often wrap JSON in ```json ... ``` despite system
 * prompts instructing "return ONLY the JSON". This helper strips the first
 * fenced block if present, then parses. No-op for already-clean JSON.
 *
 * Throws if the cleaned text is not valid JSON.
 */
export function parseAIJson<T>(raw: string): T {
  const trimmed = raw.trim();
  // Match a ```lang? ... ``` block anywhere in the response and extract its body.
  const fenceMatch = trimmed.match(
    /```(?:[a-zA-Z0-9_-]+)?\s*\n?([\s\S]*?)\n?\s*```/
  );
  const cleaned = fenceMatch ? fenceMatch[1].trim() : trimmed;
  return JSON.parse(cleaned) as T;
}
