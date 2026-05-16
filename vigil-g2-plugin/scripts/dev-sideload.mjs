#!/usr/bin/env node
import { execSync } from "child_process";
import { createServer } from "http";
import { readFileSync } from "fs";
import { resolve } from "path";
import qrcode from "qrcode-terminal";

const PORT = 7771;
const EHPK = resolve("vigil.ehpk");
const HOST = process.env.TAILSCALE_HOST || "morrillhouse";

console.log("🔨 Building...");
execSync("npm run build", { stdio: "inherit" });

console.log("📦 Packing .ehpk...");
execSync("npm run pack", { stdio: "inherit" });

const server = createServer((req, res) => {
  if (req.url === "/vigil.ehpk") {
    const file = readFileSync(EHPK);
    res.writeHead(200, { "Content-Type": "application/octet-stream" });
    res.end(file);
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, "0.0.0.0", () => {
  const url = `http://${HOST}:${PORT}/vigil.ehpk`;
  console.log(`\n✅ Serving at ${url}\n`);
  qrcode.generate(url, { small: true });
  console.log("\nScan with G2 to sideload. Ctrl+C to stop.\n");
});
