import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assertRunOrigin } from "../../scripts/run-origin.mjs";

// The build must refuse a sandbox origin that would weaken isolation (CLAUDE.md: the sandbox is a
// different SITE from the app). The rule is a pure function, tested here directly: nothing is
// built and dist/ is never touched. (An earlier version of this test spawned the build script with
// "refused" origins; when the rule was broken on purpose, one got through and overwrote
// dist/_headers — docs/05-f3-mvp0.md §17.12.)

describe("assertRunOrigin", () => {
  it("accepts a cross-site https origin and local development hosts", () => {
    for (const ok of [
      "https://python-educrs-run.example.workers.dev",
      "https://sandbox.invalid",
      "http://127.0.0.1:4322",
      "http://localhost:4322",
      "http://[::1]:4322",
      "https://noteducrs.com", // a look-alike is a different site
    ]) {
      expect(assertRunOrigin(ok), ok).toBe(ok);
    }
  });

  it("refuses a missing origin", () => {
    expect(() => assertRunOrigin(undefined)).toThrow("PUBLIC_RUN_ORIGIN is required");
    expect(() => assertRunOrigin("")).toThrow("PUBLIC_RUN_ORIGIN is required");
  });

  it("refuses the app's own site: educrs.com and every subdomain", () => {
    for (const bad of ["https://educrs.com", "https://run.educrs.com", "https://python.educrs.com", "https://a.b.educrs.com", "http://run.educrs.com"]) {
      expect(() => assertRunOrigin(bad), bad).toThrow("must be cross-site from educrs.com");
    }
  });

  it("refuses plain http outside localhost", () => {
    expect(() => assertRunOrigin("http://python-educrs-run.example.workers.dev")).toThrow("must use https:");
    expect(() => assertRunOrigin("http://noteducrs.com")).toThrow("must use https:");
  });

  it("refuses anything that is not a bare origin", () => {
    for (const bad of ["https://run.example.dev/", "https://run.example.dev/path", "https://RUN.example.dev", "run.example.dev", "not a url"]) {
      expect(() => assertRunOrigin(bad), bad).toThrow("must be a bare origin");
    }
  });
});

describe("write-headers.mjs", () => {
  it("runs the check before anything else: without an origin the build stops", () => {
    // The only spawned case, and a safe one: with no origin the script can never get as far as
    // writing dist/_headers, whatever happens to the other rules.
    const script = fileURLToPath(new URL("../../scripts/write-headers.mjs", import.meta.url));
    const env = { ...process.env };
    delete env.PUBLIC_RUN_ORIGIN;
    let stderr = "";
    try {
      execFileSync(process.execPath, [script], { env, stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      stderr = String((e as { stderr?: Buffer }).stderr ?? e);
    }
    expect(stderr).toContain("PUBLIC_RUN_ORIGIN is required");
  });
});
