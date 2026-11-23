// Validation of PUBLIC_RUN_ORIGIN, the sandbox site the app frames. The sandbox must stay a
// different SITE from the app (CLAUDE.md), so a same-site or plain-http origin stops the build.
// A pure function, so it is unit-tested without running a build or touching dist/
// (apps/web/src/lib/headers.test.ts).
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const APP_SITE = "educrs.com";

/** Returns the origin unchanged, or throws with the reason it can't be used. */
export function assertRunOrigin(value) {
  // No default on purpose: a forgotten variable must fail the build, not silently frame the wrong site.
  if (!value) throw new Error("PUBLIC_RUN_ORIGIN is required (e.g. https://python-educrs-run.<account>.workers.dev)");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`PUBLIC_RUN_ORIGIN must be a bare origin, got ${value}`);
  }
  if (url.origin !== value) throw new Error(`PUBLIC_RUN_ORIGIN must be a bare origin, got ${value}`);
  if (url.hostname === APP_SITE || url.hostname.endsWith(`.${APP_SITE}`)) {
    throw new Error(`PUBLIC_RUN_ORIGIN must be cross-site from ${APP_SITE}, got ${value}`);
  }
  if (url.protocol !== "https:" && !LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`PUBLIC_RUN_ORIGIN must use https: outside localhost, got ${value}`);
  }
  return value;
}
