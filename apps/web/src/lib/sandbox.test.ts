import { describe, expect, it, vi } from "vitest";
import { SandboxClient } from "./sandbox.ts";

describe("SandboxClient security", () => {
  it("generates unpredictable UUID-based runIds for run and check", () => {
    const posted: Record<string, unknown>[] = [];
    const fakeFrame = {
      contentWindow: {
        postMessage: (msg: Record<string, unknown>) => posted.push(msg),
      },
    } as unknown as HTMLIFrameElement;

    const origWin = globalThis.window;
    (globalThis as Record<string, unknown>).window = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    try {
      const client = new SandboxClient("https://sandbox.invalid");
      const cleanup = client.attach(fakeFrame, vi.fn());
      const runId = client.run("print(1)", {
        stdout: vi.fn(),
        stderr: vi.fn(),
        stdin: vi.fn(),
        result: vi.fn(),
      });
      void client.check("print(1)", { check: { kind: "stdout" } }, 1);
      const checkMsg = posted.find((m) => m.type === "check");

      expect(runId).toMatch(/^r-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(checkMsg?.runId).toMatch(/^c-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(checkMsg?.runId).not.toBe(runId);
      cleanup();
    } finally {
      (globalThis as Record<string, unknown>).window = origWin;
    }
  });
});
