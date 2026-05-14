#!/usr/bin/env node
// PHASE 128b SPIKE — TOSSABLE. Phase 133 owns G2-REPLY productionization;
// this file is spike-only and SHOULD BE DELETED after the verdict is committed.
// Path D: minimal stdio MCP server exposing `vigil_external_reply` tool
//   - returns process.env.VIGIL_BUFFERED_REPLY (or 'no-reply' if unset)
//   - tests the Claude-pulls model (NOT Vigil-pushes — see CONTEXT D-O1 path (d))
// DEVIATION FROM RESEARCH (Rule 3 — Blocking, auto-fix #3):
//   RESEARCH §"Path D" lines 423-435 specifies setRequestHandler with a plain JSON
//   `{ method: 'tools/list' }` literal. The 2026-05-14 MCP SDK rejects this with
//   `Schema is missing a method literal` and requires the Zod Schema objects
//   (`ListToolsRequestSchema`, `CallToolRequestSchema`) imported from `.../types.js`.
//   This is purely an API-shape adaptation; the spike's question (does the round-trip
//   work via MCP tool-call?) is unchanged.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  { name: 'vigil-spike', version: '0.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'vigil_external_reply',
      description: 'Returns the buffered external reply',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (_req) => ({
  content: [{ type: 'text', text: process.env.VIGIL_BUFFERED_REPLY ?? 'no-reply' }],
}));

await server.connect(new StdioServerTransport());
