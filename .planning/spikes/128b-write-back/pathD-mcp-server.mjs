#!/usr/bin/env node
// PHASE 128b SPIKE — TOSSABLE. Phase 133 owns G2-REPLY productionization;
// this file is spike-only and SHOULD BE DELETED after the verdict is committed.
// Path D: minimal stdio MCP server exposing `vigil_external_reply` tool
//   - returns process.env.VIGIL_BUFFERED_REPLY (or 'no-reply' if unset)
//   - tests the Claude-pulls model (NOT Vigil-pushes — see CONTEXT D-O1 path (d))
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server(
  { name: 'vigil-spike', version: '0.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler({ method: 'tools/list' }, async () => ({
  tools: [
    {
      name: 'vigil_external_reply',
      description: 'Returns the buffered external reply',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
}));

server.setRequestHandler({ method: 'tools/call' }, async (_req) => ({
  content: [{ type: 'text', text: process.env.VIGIL_BUFFERED_REPLY ?? 'no-reply' }],
}));

await server.connect(new StdioServerTransport());
