import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages.js";

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

export async function callClaude(options: {
  system: string;
  userMessage: string;
  maxTokens: number;
}): Promise<string> {
  const ai = getAIClient();
  if (!ai) throw new Error("AI client not available");

  const model = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";

  const response = await ai.messages.create({
    model,
    max_tokens: options.maxTokens,
    system: options.system,
    messages: [{ role: "user", content: options.userMessage }],
  });

  const block = response.content[0];
  if (block.type !== "text") {
    throw new Error(`Unexpected response type: ${block.type}`);
  }
  return block.text;
}

export async function callClaudeConversation(options: {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens: number;
}): Promise<string> {
  const ai = getAIClient();
  if (!ai) throw new Error("AI client not available");

  const model = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";

  const response = await ai.messages.create({
    model,
    max_tokens: options.maxTokens,
    system: options.system,
    messages: options.messages,
  });

  const block = response.content[0];
  if (block.type !== "text") {
    throw new Error(`Unexpected response type: ${block.type}`);
  }
  return block.text;
}

export async function callClaudeMultimodal(options: {
  system?: string;
  content: MessageParam["content"];
  maxTokens: number;
}): Promise<string> {
  const ai = getAIClient();
  if (!ai) throw new Error("AI client not available");

  const model = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";

  const response = await ai.messages.create({
    model,
    max_tokens: options.maxTokens,
    ...(options.system ? { system: options.system } : {}),
    messages: [{ role: "user", content: options.content }],
  });

  const block = response.content[0];
  if (block.type !== "text") {
    throw new Error(`Unexpected response type: ${block.type}`);
  }
  return block.text;
}
