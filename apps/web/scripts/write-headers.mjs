// Writes dist/_headers for Cloudflare Pages after `astro build`.
// The CSP only allows framing the sandbox site; it is computed from the built HTML
// so any inline script Astro emits is pinned by hash instead of 'unsafe-inline'.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const RUN_ORIGIN = process.env.PUBLIC_RUN_ORIGIN;
// No default on purpose: a forgotten variable must fail the build, not silently frame the wrong site.
if (!RUN_ORIGIN) throw new Error("PUBLIC_RUN_ORIGIN is required (e.g. https://python-educrs-run.<account>.workers.dev)");
if (new URL(RUN_ORIGIN).origin !== RUN_ORIGIN) throw new Error(`PUBLIC_RUN_ORIGIN must be a bare origin, got ${RUN_ORIGIN}`);

const hashes = new Set();
const styleHashes = new Set();
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
  d.isDirectory() ? walk(path.join(dir, d.name)) : d.name.endsWith(".html") ? [path.join(dir, d.name)] : []);
for (const file of walk(dist)) {
  const html = fs.readFileSync(file, "utf8");
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    if (m[1].trim()) hashes.add(`'sha256-${createHash("sha256").update(m[1]).digest("base64")}'`);
  }
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    if (m[1].trim()) styleHashes.add(`'sha256-${createHash("sha256").update(m[1]).digest("base64")}'`);
  }
}

// Cloudflare Web Analytics (cookieless; plan §9.1 C) is injected at the edge: allow exactly
// its script and beacon endpoint. Cloudflare's "JavaScript Detections" inline script is NOT
// allowed: it changes per request, so only 'unsafe-inline' would admit it — that would void
// the whole CSP. It is blocked harmlessly (docs/03-f1-spike-report.md, live smoke test).
const CF_ANALYTICS_SCRIPT = "https://static.cloudflareinsights.com";
const CF_ANALYTICS_BEACON = "https://cloudflareinsights.com";

const csp = [
  "default-src 'self'",
  `script-src 'self' ${CF_ANALYTICS_SCRIPT} ${[...hashes].join(" ")}`.trim(),
  `style-src 'self' ${[...styleHashes].join(" ")}`.trim(),
  "img-src 'self' data:",
  `frame-src ${RUN_ORIGIN}`,
  `connect-src 'self' ${CF_ANALYTICS_BEACON}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

fs.writeFileSync(path.join(dist, "_headers"), `/*
  Content-Security-Policy: ${csp}
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  X-Robots-Tag: noindex, nofollow
/_astro/*
  Cache-Control: public, max-age=31536000, immutable
`);
console.log(`web: wrote dist/_headers (sandbox ${RUN_ORIGIN}, ${hashes.size} script + ${styleHashes.size} style hash(es))`);
