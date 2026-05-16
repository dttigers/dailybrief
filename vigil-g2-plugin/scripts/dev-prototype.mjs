#!/usr/bin/env node
// Spawns Vite dev server and prints a QR code pointing at it.
// Use with Even Hub iPhone app's "Prototype mode" entry — it loads the URL
// in a WebView, so iterating on src/ files hot-reloads instantly (no .ehpk
// pack + sideload cycle needed).
//
// Contrast: scripts/dev-sideload.mjs builds + packs vigil.ehpk and serves
// it on :7771/vigil.ehpk for Even Hub's actual "Sideload" install entry.
// Prototype mode is for the diagnose/iterate loop; sideload is for testing
// the packaged artifact.

import { spawn } from "child_process";
import qrcode from "qrcode-terminal";

const HOST = process.env.TAILSCALE_HOST || "morrillhouse";

console.log("🛰️  Starting Vite dev server (prototype mode)...\n");

const vite = spawn("npx", ["vite"], {
  cwd: process.cwd(),
  stdio: ["inherit", "pipe", "inherit"],
});

let qrPrinted = false;

vite.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  process.stdout.write(text);

  if (qrPrinted) return;

  // Vite prints "  ➜  Local:   http://localhost:5174/" once ready.
  // We parse the port from Local line, then construct the morrillhouse URL.
  const match = text.match(/Local:\s+https?:\/\/[^:]+:(\d+)\//);
  if (match) {
    const port = match[1];
    const url = `http://${HOST}:${port}/`;
    console.log(`\n📱 Prototype URL:\n   ${url}\n`);
    qrcode.generate(url, { small: true });
    console.log(`\nIn Even Hub iPhone app → Prototype mode → scan this QR (or paste the URL above).\n`);
    console.log(`Hot reload is live — edits to src/ push to the WebView automatically.\n`);
    console.log(`Ctrl+C to stop. (Vite blocks 7771 from prior dev-sideload — kill that separately if needed.)\n`);
    qrPrinted = true;
  }
});

vite.on("exit", (code) => {
  process.exit(code ?? 0);
});

process.on("SIGINT", () => {
  vite.kill("SIGINT");
});
process.on("SIGTERM", () => {
  vite.kill("SIGTERM");
});
